// 桌面端冒烟测试：用 Playwright 启动真实的 Electron 壳，检查渲染、指针锁、改键与模拟。
// 用法：npm run smoke:desktop
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, '.tmp', 'smoke');
fs.mkdirSync(shots, { recursive: true });
if (!fs.existsSync(path.join(here, 'dist', 'index.html'))) {
  console.error('缺少 dist/index.html，请先运行 npm run build');
  process.exit(1);
}

const errors = [];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// 指针锁依赖窗口焦点：冷启动或系统繁忙时首次点击会失败，重试几次
const lockPointer = async (target, x, y, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    await target.mouse.click(x, y);
    await target.waitForTimeout(400);
    const locked = await target.evaluate(() => document.pointerLockElement === document.getElementById('c'));
    if (locked) return true;
  }
  return false;
};

const app = await electron.launch({ args: [here, '--smoke'], cwd: here });
const page = await app.firstWindow();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

let exitCode = 0;
try {
  await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });

  const env = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    return {
      shell: !!window.desktopShell,
      search: location.search,
      gl: gl ? gl.getParameter(gl.VERSION) : null,
      desktop: !!window.__game?.desktop,
      quality: window.__game?.opts?.quality,
      keyCount: Object.keys(window.__game?.opts?.keys || {}).length,
      origin: location.origin,
    };
  });
  check('预加载桥接可用', env.shell, `origin=${env.origin} ${env.search}`);
  check('WebGL 可用', !!env.gl && env.gl.includes('WebGL'), env.gl || '无上下文');
  check('游戏识别为桌面端', env.desktop);
  check('桌面端默认画质为极致', env.quality === 'high', `quality=${env.quality}`);
  check('键位已加载', env.keyCount === 11, `${env.keyCount} 项`);
  check('本地存储可用', env.origin.startsWith('app://'), env.origin);

  const state = await page.evaluate(async () => {
    const st = await window.desktopShell.getState();
    return { version: st.version, electron: st.electron, displays: st.displays.length, fullscreen: st.fullscreen };
  });
  check('主进程 IPC 可用', state.displays > 0, `v${state.version} electron=${state.electron} 显示器 ${state.displays}`);

  // 菜单与改键面板截图，供人工核对
  await page.screenshot({ path: path.join(shots, 'desktop-menu.png') });
  await page.click('#btnKeys');
  await page.waitForSelector('#keys:not(.hidden)', { timeout: 5000 });
  await page.screenshot({ path: path.join(shots, 'desktop-keys.png') });
  const rows = await page.evaluate(() => document.querySelectorAll('#keyList .krow').length);
  check('改键面板可用', rows === 11, `${rows} 行`);
  await page.click('#btnKeysDone');
  await page.waitForSelector('#menu:not(.hidden)', { timeout: 5000 });

  // 桌面设置面板：切到全屏再切回窗口，验证主进程往返
  await page.evaluate(async () => {
    document.querySelector('.seg[data-k="windowMode"] button[data-v="fullscreen"]').click();
    await new Promise((r) => setTimeout(r, 900));
  });
  const full = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
  await page.evaluate(async () => {
    document.querySelector('.seg[data-k="windowMode"] button[data-v="window"]').click();
    await new Promise((r) => setTimeout(r, 900));
  });
  const windowed = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
  check('显示模式切换生效', full === true && windowed === false, `全屏=${full} 窗口=${windowed}`);

  // 开始对局 + 指针锁
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
  await page.click('#btnStart');
  await page.waitForFunction(() => window.__game?.playing === true, null, { timeout: 30000 });
  check('指针锁可用', await lockPointer(page, 640, 360));

  // 改键后输入仍然生效
  const rebound = await page.evaluate(async () => {
    window.__game.opts.keys.fwd = 'KeyI';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI' }));
    const down = window.__game.player.down('fwd');
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyI' }));
    window.__game.opts.keys.fwd = 'KeyW';
    return down;
  });
  check('改键生效', rebound);

  // 模拟推进 + 数值健全
  const sim = await page.evaluate(() => window.__game.fastForward(6));
  check('对局模拟正常', typeof sim.time === 'string' && sim.kills.length > 0, sim.kills);

  // 多层寻路：二楼与箱顶两条路径；冻结 AI 决策，只验证寻路与跳跃
  const navChecks = await page.evaluate(() => {
    const g = window.__game;
    g.goal = 100; g.timeLeft = 600;
    const pick = () => g.actors.find((a) => !a.isPlayer && a.alive && a.pos.y < 0.5 && !a.__used) || null;
    const run = (bot, target) => {
      // 只让被测机器人参与模拟：其他 bot 会推挤或挡路，导致偶发失败
      const allActors = g.actors;
      g.actors = [bot];
      // 固定从出生点出发，避免随机位置走出不可执行的路径
      bot.spawn(g.map.spawns[bot.team][0]);
      bot.onSpawn();
      bot.think = () => {}; // 不让 AI 改目标
      bot.goal = [target.x, target.z]; bot.goalHeight = target.y;
      bot.goalLayer = target.y > 2.3 ? 'roof' : target.y > 0.5 ? 'high' : 'ground';
      bot.path = g.nav.findPath(bot.pos.x, bot.pos.z, target.x, target.z, bot.pos.y, target.y);
      bot.pi = 1;
      let reached = false, fell = false;
      for (let i = 0; i < 15; i++) {
        bot.protectT = 999; bot.hp = 100;
        g.fastForward(2);
        if (bot.pos.y > target.y - 0.5) reached = true;
        else if (reached) fell = true;
      }
      g.actors = allActors;
      return { ok: reached && !fell, y: +bot.pos.y.toFixed(2), reached, fell };
    };
    const roofBot = pick();
    if (!roofBot) return { roof: { ok: false, reason: '无地面机器人' } };
    roofBot.__used = true;
    roofBot.primary = 'awm'; roofBot.role = 'hold'; roofBot.onSpawn();
    for (let i = 0; i < 40 && roofBot.goalLayer !== 'roof'; i++) roofBot.pickGoal();
    const r = roofBot.goalLayer === 'roof'
      ? run(roofBot, { x: roofBot.goal[0], z: roofBot.goal[1], y: 2.59 })
      : { ok: false, reason: '未选到二楼目标' };
    const crateBot = pick();
    if (!crateBot) return { roof: r, crate: { ok: false, reason: '无地面机器人' } };
    crateBot.__used = true;
    const side = crateBot.team === 'BL' ? 1 : -1;
    const c = run(crateBot, { x: -14.65 * side, z: 2.3 * side, y: 1.8 });
    return { roof: r, crate: c };
  });
  check('二楼寻路可用', navChecks.roof.ok, navChecks.roof.reason || `y=${navChecks.roof.y}`);
  check('箱顶跳跃可用', navChecks.crate.ok, navChecks.crate.reason || `y=${navChecks.crate.y}`);

  const fps = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1500));
    return window.__game.fps;
  });
  check('渲染循环运行', typeof fps === 'number' && fps > 0, `${fps} FPS`);

  await page.screenshot({ path: path.join(shots, 'desktop-match.png') });
} catch (e) {
  check('冒烟流程未抛异常', false, e.message);
} finally {
  await app.close();
}

// 触摸屏笔记本：主指针被报成 coarse 时，桌面端仍须锁定鼠标
if (!checks.some((c) => !c.ok)) {
  const touchApp = await electron.launch({ args: [here, '--smoke', '--blink-settings=primaryPointerType=2,availablePointerTypes=2'] });
  const tp = await touchApp.firstWindow();
  try {
    await tp.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    const coarse = await tp.evaluate(() => matchMedia('(pointer:coarse)').matches);
    await touchApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
    await tp.click('#btnStart');
    await tp.waitForFunction(() => window.__game?.playing === true, null, { timeout: 30000 });
    const locked = await lockPointer(tp, 600, 400);
    const r = await tp.evaluate(() => ({
      touchMode: window.__game.touchMode,
      locked: document.pointerLockElement === document.getElementById('c'),
      joystick: !document.getElementById('touch').classList.contains('hidden'),
    }));
    check('主指针为 coarse 时桌面端仍锁鼠标', coarse && !r.touchMode && r.locked && !r.joystick, `${JSON.stringify(r)} 点击 ${locked ? '成功' : '失败'}`);
  } catch (e) {
    check('主指针为 coarse 时桌面端仍锁鼠标', false, e.message);
  } finally {
    await touchApp.close();
  }
}

const failed = checks.filter((c) => !c.ok);
if (errors.length) { console.log(`渲染进程报错 ${errors.length} 条：`); for (const e of errors.slice(0, 8)) console.log(`  ${e}`); }
check('渲染进程无错误', errors.length === 0, `${errors.length} 条`);
console.log(failed.length ? `smoke:desktop FAILED（${failed.length} 项）` : 'smoke:desktop OK');
process.exit(failed.length ? 1 : 0);
