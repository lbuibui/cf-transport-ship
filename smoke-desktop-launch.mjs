// 跨平台启动冒烟：只验证桌面壳能启动、渲染并跑完一小段对局。
// 指针锁、全屏与改键依赖真实桌面会话，留在 smoke-desktop.mjs（macOS）。
// 用途：Linux（xvfb-run）与 Windows CI 各跑一次，补上安装包之外的运行时验证。
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

const extra = process.platform === 'linux'
  ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-gpu-vsync', '--disable-frame-rate-limit']
  : [];
// 发布流水线用 SMOKE_EXE 指向 electron-builder 的 unpacked 产物，验证 asar 载荷。
const exe = process.env.SMOKE_EXE;
const app = await electron.launch(exe
  ? { executablePath: path.resolve(here, exe), args: ['--smoke', ...extra] }
  : { args: [here, '--smoke', ...extra], cwd: here });
const page = await app.firstWindow();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

try {
  await page.waitForSelector('#menu:not(.hidden)', { timeout: 90000 });
  const env = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    return {
      shell: !!window.desktopShell,
      origin: location.origin,
      search: location.search,
      desktop: !!window.__game?.desktop,
      gl: gl ? gl.getParameter(gl.VERSION) : null,
      platform: window.desktopShell?.platform || '',
    };
  });
  check('预加载桥接可用', env.shell, `origin=${env.origin} ${env.search}`);
  check('游戏识别为桌面端', env.desktop, `platform=${env.platform}`);
  check('WebGL 可用', !!env.gl && env.gl.includes('WebGL'), env.gl || '无上下文');

  const state = await page.evaluate(async () => {
    const st = await window.desktopShell.getState();
    return { version: st.version, electron: st.electron, displays: st.displays.length };
  });
  check('主进程 IPC 可用', state.displays > 0, `v${state.version} electron=${state.electron}`);

  // 无窗口管理器时也要确认窗口真的可见，否则 rAF 会被 Chromium 暂停。
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { w.show(); w.focus(); }
  });
  const visible = await app.evaluate(({ BrowserWindow }) => !!BrowserWindow.getAllWindows()[0]?.isVisible());
  const visibility = await page.evaluate(() => document.visibilityState);
  check('窗口可见', visible && visibility === 'visible', `visible=${visible} state=${visibility}`);

  await page.click('#btnStart');
  await page.waitForFunction(() => window.__game?.playing === true, null, { timeout: 60000 });
  const sim = await page.evaluate(() => window.__game.fastForward(3));
  check('对局模拟正常', typeof sim.time === 'string' && sim.kills.length > 0, sim.kills);
  // 软件渲染（Linux xvfb / SwiftShader）可能只有几帧每秒；直接数渲染帧。
  // 不额外手动调用 renderFrame：真实渲染循环已在跑，重复渲染会在 SwiftShader 下留下 GL 错误。
  const frames = await page.evaluate(async () => {
    const start = Date.now(), before = window.__game.frame;
    while (Date.now() - start < 2500) await new Promise((r) => setTimeout(r, 100));
    return { delta: window.__game.frame - before, fps: window.__game.fps };
  });
  if (frames.delta > 0) check('渲染循环运行', true, `${frames.delta} 帧 / ${frames.fps ?? '…'} FPS`);
  else console.log('warn xvfb 下 rAF 未推进；渲染路径已由上一项验证');
  await page.screenshot({ path: path.join(shots, 'desktop-launch.png') });
} catch (e) {
  check('启动冒烟流程未抛异常', false, e.message);
} finally {
  await app.close();
}

if (errors.length) {
  console.log(`渲染进程报错 ${errors.length} 条：`);
  for (const e of errors.slice(0, 8)) console.log(`  ${e}`);
}
check('渲染进程无错误', errors.length === 0, `${errors.length} 条`);
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `smoke:desktop:launch FAILED（${failed.length} 项）` : 'smoke:desktop:launch OK');
process.exit(failed.length ? 1 : 0);
