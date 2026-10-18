import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { FakeContext } from './helpers/fake-dom.mjs';
import { HUD, sanitizeOpts } from '../src/hud.js';
import { World } from '../src/physics.js';
import { WeaponState } from '../src/weapons.js';

let dom = null;
let prev = {};

function install() {
  dom = new JSDOM('<!doctype html><html><body><div id="ui"></div></body></html>', {
    url: 'https://example.test/', pretendToBeVisual: true,
  });
  prev = {
    window: globalThis.window, document: globalThis.document,
    localStorage: globalThis.localStorage, matchMedia: globalThis.matchMedia,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.matchMedia = dom.window.matchMedia = () => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  });
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    if (!this.__ctx) this.__ctx = new FakeContext(this);
    return this.__ctx;
  };
  for (const k of ['clientWidth', 'clientHeight']) {
    Object.defineProperty(dom.window.HTMLCanvasElement.prototype, k, {
      configurable: true,
      get() { return this.__size || 200; },
    });
  }
}

function uninstall() {
  if (prev.window === undefined) delete globalThis.window; else globalThis.window = prev.window;
  if (prev.document === undefined) delete globalThis.document; else globalThis.document = prev.document;
  if (prev.localStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev.localStorage;
  if (prev.matchMedia === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = prev.matchMedia;
  dom?.window.close();
  dom = null;
}

function makeGame(desktop = false) {
  const calls = { start: 0, resume: 0, quit: 0, loadout: [], closed: 0, options: [], ui: [] };
  return {
    desktop, shell: desktop ? { openLogs: () => calls.ui.push('logs') } : null,
    calls,
    onOption: (k, v) => calls.options.push([k, v]),
    startMatch: () => calls.start++,
    resume: () => calls.resume++,
    quitToMenu: () => calls.quit++,
    chooseLoadout: (id) => calls.loadout.push(id),
    closeLoadout: () => calls.closed++,
    quitApp: () => calls.ui.push('quit'),
    audio: { playUI: (n) => calls.ui.push(n) },
    player: null,
    playing: false, paused: false,
  };
}

function hud(desktop = false) {
  document.body.innerHTML = '<div id="ui"></div>';
  const g = makeGame(desktop);
  const h = new HUD(g);
  return { g, h };
}

before(() => install());
after(() => uninstall());
beforeEach(() => {
  dom.window.localStorage.clear();
  dom.window.document.body.innerHTML = '<div id="ui"></div>';
});

test('默认选项、本地存储清洗与桌面快捷入口', () => {
  const { g, h } = hud();
  assert.equal(h.opts.team, 'BL');
  assert.equal(h.opts.primary, 'ak47');
  assert.equal(h.opts.quality, 'high');
  assert.equal(Object.keys(h.opts.keys).length, 11);
  assert.equal(JSON.parse(localStorage.getItem('cf_transport_ship_opts')).team, 'BL');
  assert.ok(h.el.menu);
  assert.ok(h.el.hud.classList.contains('hidden'));
  assert.equal(g.desktop, false);

  localStorage.setItem('cf_transport_ship_opts', JSON.stringify({ team: 'GR', size: 8, fov: 90 }));
  const next = hud();
  assert.equal(next.h.opts.team, 'GR');
  assert.equal(next.h.opts.size, 8);
  assert.equal(next.h.opts.fov, 90);

  localStorage.setItem('cf_transport_ship_opts', '{bad json');
  const broken = hud();
  assert.equal(broken.h.opts.team, 'BL');
});

test('菜单按钮、分段选项、滑杆与开始/退出', () => {
  const { g, h } = hud();
  h.show('menu');
  assert.equal(h.el.menu.classList.contains('hidden'), false);
  document.querySelector('#btnStart').click();
  assert.equal(g.calls.start, 1);
  document.querySelector('#btnResume').click();
  assert.equal(g.calls.resume, 1);
  document.querySelector('#btnQuit').click();
  assert.equal(g.calls.quit, 1);

  h.show('pause');
  document.querySelector('#btnQuit').click();
  assert.equal(g.calls.quit, 2);

  document.querySelector('.seg[data-k="size"] button[data-v="8"]').click();
  assert.equal(h.opts.size, 8);
  assert.deepEqual(g.calls.options.at(-1), ['size', 8]);
  document.querySelector('.seg[data-k="team"] button[data-v="GR"]').click();
  assert.equal(h.opts.team, 'GR');
  document.querySelector('.seg[data-k="quality"] button[data-v="low"]').click();
  assert.equal(h.opts.quality, 'low');

  const slider = document.querySelector('.slider[data-k="fov"] input');
  slider.value = '95';
  slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(h.opts.fov, 95);
  assert.deepEqual(g.calls.options.at(-1), ['fov', 95]);

  h.syncControls();
  assert.equal(document.querySelector('.seg[data-k="size"] button[data-v="8"]').classList.contains('on'), true);
  assert.equal(document.querySelector('.slider[data-k="fov"] span').textContent, '95');
});

test('加载条、显示切换与面板按钮', () => {
  const { g, h } = hud();
  h.loading(0.42, '测试中');
  assert.equal(h.el.loadBar.style.width, '42%');
  assert.equal(h.el.loadTxt.textContent, '测试中');
  h.show('loading');
  assert.equal(h.el.loading.classList.contains('hidden'), false);
  h.show('end');
  assert.equal(h.el.hud.classList.contains('hidden'), true);
  h.show(null);
  assert.equal(h.el.hud.classList.contains('hidden'), false);

  document.querySelectorAll('#loadCards .card')[1].click();
  assert.equal(g.calls.loadout.length, 1);
  document.querySelector('#btnLoadClose').click();
  assert.equal(g.calls.closed, 1);
  document.querySelector('#btnAgain').click();
  assert.equal(g.calls.start, 1);
  document.querySelector('#btnMenu').click();
  assert.equal(g.calls.quit, 1);
});

test('局内 HUD 更新弹药、生命、比分、准星与阵亡提示', () => {
  const { h } = hud();
  h.setIcons({ ak47: 'ak.png' });
  const w = new WeaponState('ak47');
  w.mag = 0;
  h.update(0.016, {
    score: { BL: 12, GR: 10 }, timeLeft: 65, goal: 50, myTeam: 'BL',
    hp: 24, armor: 15, alive: true, weapon: w, scoped: false, spreadPx: 12,
    yaw: 0.2, respawnIn: 0, killedBy: '', protect: 1.2, aimName: '敌人', aimTeam: 'GR',
  });
  assert.equal(h.el.sBL.textContent, '12');
  assert.equal(h.el.sGR.textContent, '10');
  assert.equal(h.el.sTime.textContent, '1:05');
  assert.equal(h.el.sGoal.textContent, '团队竞技 · 目标 50');
  assert.equal(h.el.hpVal.textContent, '24');
  assert.equal(h.el.arVal.textContent, '15');
  assert.equal(h.el.hpBox.classList.contains('low'), true);
  assert.equal(h.el.aMag.textContent, '0');
  assert.equal(h.el.aRes.textContent, '/ 90');
  assert.equal(h.el.aHint.textContent, '按 R 换弹');
  assert.equal(h.el.cross.style.display, '');
  assert.equal(h.el.nameTip.textContent, '敌人');
  assert.equal(h.el.nameTip.className, 'GR');
  assert.equal(h.el.protect.textContent, '出生保护 1.2s（开火即解除）');

  h.update(0.5, {
    score: { BL: 12, GR: 10 }, timeLeft: 0, goal: 50, myTeam: 'BL',
    hp: 0, armor: 0, alive: false, weapon: w, scoped: true, spreadPx: 0,
    yaw: 0, respawnIn: 3.2, killedBy: '被击杀', protect: 0, aimName: '', aimTeam: '',
  });
  assert.equal(h.el.sTime.textContent, '0:00');
  assert.equal(h.el.center.classList.contains('hidden'), false);
  assert.equal(h.el.cBig.innerHTML, '被击杀');
  assert.equal(h.el.cSmall.textContent, '3.2 秒后复活 · 按 B 更换武器');
  assert.equal(h.el.scope.classList.contains('on'), false); // scoped 但未存活
});

test('武器栏、击杀信息、命中标记、受击方向与徽章', () => {
  const { h } = hud();
  h.setIcons({ ak47: 'ak.png', deagle: 'de.png', knife: 'kn.png', he: 'he.png' });
  h.slots([new WeaponState('ak47'), new WeaponState('deagle'), new WeaponState('knife'), new WeaponState('he')], 2);
  assert.equal(h.el.slots.children.length, 4);
  assert.equal(h.el.slots.querySelector('.on').querySelector('b').textContent, '3');

  h.killFeed(
    { name: '甲<', team: 'BL' }, { name: '乙&', team: 'GR' },
    'ak47', true, true, true,
  );
  assert.equal(h.el.feed.children.length, 1);
  assert.ok(h.el.feed.textContent.includes('甲<'));
  assert.ok(h.el.feed.textContent.includes('乙&'));

  h.hitmarker(true, false);
  assert.equal(h.el.hit.className, 'hs');
  h.hitmarker(false, true);
  assert.equal(h.el.hit.className, 'kill');
  h.damageFrom(1.2);
  assert.equal(h.el.dmgDirs.children.length, 1);
  h.dmgDirs[0].t = 0.01;
  h.update(0.1, {
    score: { BL: 0, GR: 0 }, timeLeft: 10, goal: 10, myTeam: 'BL', hp: 100, armor: 100,
    alive: true, weapon: new WeaponState('ak47'), scoped: false, spreadPx: 0, yaw: 0,
    respawnIn: 0, killedBy: '', protect: 0, aimName: '', aimTeam: '',
  });
  assert.equal(h.el.dmgDirs.children.length, 0);
  h.badge('HEADSHOT', '爆头', true);
  assert.equal(h.el.badge.querySelector('.txt').textContent, 'HEADSHOT');
  assert.equal(h.el.badge.classList.contains('show'), true);
  h.toast('<b>提示</b>', 3);
  assert.equal(h.el.toast.innerHTML, '<b>提示</b>');
  assert.equal(String(h.el.toast.style.opacity), '1');
});

test('记分板、结算页与雷达绘制', () => {
  const { h } = hud();
  const actors = [
    { id: 1, name: '我', team: 'BL', alive: true, stats: { k: 8, d: 3, hs: 2, shots: 20, hits: 10 }, ping: 20 },
    { id: 2, name: '敌', team: 'GR', alive: false, stats: { k: 4, d: 6, hs: 1, shots: 30, hits: 9 }, ping: 30 },
  ];
  h.scoreboard(true, actors, 1, { BL: 8, GR: 4 });
  assert.ok(h.el.boardBody.textContent.includes('我'));
  assert.ok(h.el.boardBody.querySelector('.me'));
  h.scoreboard(false);
  assert.equal(h.el.board.classList.contains('hidden'), true);

  h.endScreen(true, { BL: 50, GR: 20 }, actors, 1);
  assert.equal(h.el.endRes.textContent, '胜利');
  assert.equal(h.el.endSc.textContent, '潜伏者 50 : 20 保卫者');
  assert.ok(h.el.endMvp.textContent.includes('MVP：我'));
  assert.ok(h.el.endMe.textContent.includes('命中率 50.0%'));

  const world = new World();
  world.add({ x: 0, y: 0.5, z: 0, sx: 2, sy: 1, sz: 2, solid: true, mat: 'metal', tag: 'container' });
  world.build();
  h.buildRadar(world);
  assert.ok(h.radarImg);
  const radarActors = [
    { ...actors[0], pos: { x: 0, z: 0 }, yaw: 0, radarT: 0, deadT: 0 },
    { ...actors[0], id: 3, name: '倒下的队友', alive: false, pos: { x: 1, z: 1 }, yaw: 0, radarT: 0, deadT: 1 },
    { ...actors[1], id: 4, name: '暴露的敌人', alive: true, pos: { x: 2, z: 2 }, yaw: 0, radarT: 1, deadT: 0 },
    { ...actors[1], id: 5, name: '隐藏的敌人', alive: true, pos: { x: 3, z: 3 }, yaw: 0, radarT: 0, deadT: 0 },
  ];
  h.drawRadar(
    { pos: { x: 0, z: 0 }, yaw: 0, team: 'BL', id: 1, name: '我' },
    radarActors,
    1,
  );
  assert.ok(h.radarCtx);
});

test('桌面改键面板能改键、恢复默认并同步选项', () => {
  const { g, h } = hud(true);
  assert.equal(g.desktop, true);
  assert.equal(h.el.keyList.children.length, 11);
  document.querySelector('#btnKeys').click();
  assert.equal(h.el.keys.classList.contains('hidden'), false);
  assert.equal(h.keyReturn, 'menu');
  h.el.keyList.querySelector('.krow').click();
  assert.equal(h.binding, 'fwd');
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));

  h.startBind('fwd');
  assert.equal(h.binding, 'fwd');
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyI', bubbles: true }));
  assert.equal(h.opts.keys.fwd, 'KeyI');
  assert.equal(h.binding, null);

  h.startBind('back');
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  assert.equal(h.binding, null);
  h.startBind('back');
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'Delete', bubbles: true }));
  assert.equal(h.opts.keys.back, 'KeyS');
  h.startBind('back');
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyI', bubbles: true }));
  assert.equal(h.opts.keys.back, 'KeyI');
  assert.equal(h.opts.keys.fwd, 'KeyS'); // 冲突键交换

  document.querySelector('#btnKeysReset').click();
  assert.equal(h.opts.keys.fwd, 'KeyW');
  h.setDesktopInfo({ version: '1.2.3', electron: '44', platform: 'darwin' });
  assert.ok(document.querySelector('#deskNote').textContent.includes('1.2.3'));
  document.querySelector('#btnKeysDone').click();
  assert.equal(h.el.keys.classList.contains('hidden'), true);
  document.querySelector('#btnLogs')?.click();
  document.querySelector('#btnQuitApp').click();
  assert.deepEqual(g.calls.ui.filter((x) => x === 'quit'), ['quit']);
});

test('sanitizeOpts 保持与 HUD 默认值一致', () => {
  const { h } = hud();
  assert.deepEqual(sanitizeOpts(h.opts, h.opts), h.opts);
});
