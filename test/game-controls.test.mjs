import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import { Game } from '../src/game.js';
import { World } from '../src/physics.js';
import { WeaponState, WEAPONS } from '../src/weapons.js';

let dom = null;
const original = { window: globalThis.window, document: globalThis.document, location: globalThis.location };

before(() => {
  dom = new JSDOM('<!doctype html><html><body><canvas id="c"></canvas></body></html>', { url: 'https://example.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
});
after(() => {
  dom?.window.close(); dom = null;
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  }
});
beforeEach(() => {
  document.body.innerHTML = '<canvas id="c"></canvas>';
});

function makeGame() {
  const g = Object.create(Game.prototype);
  g.time = 10; g.frame = 0; g.playing = true; g.paused = false; g.ended = false; g.inLoadout = false;
  g.matchId = 1; g.score = { BL: 0, GR: 0 };
  g.opts = { primary: 'ak47' };
  g.qs = new URLSearchParams('');
  g.touchMode = false;
  g.locked = false;
  g.calls = { show: [], scoreboard: [], exit: 0, equip: [], slots: [], toast: [], save: 0, fire: 0 };
  g.hud = {
    show: (n) => g.calls.show.push(n), scoreboard: (...a) => g.calls.scoreboard.push(a),
    saveOpts: () => g.calls.save++, slots: (...a) => g.calls.slots.push(a),
    toast: (...a) => g.calls.toast.push(a),
  };
  g.vm = {
    setVisible: () => {}, equip: (...a) => g.calls.equip.push(a), fire: () => g.calls.fire++,
  };
  g.fx = { light: () => {}, muzzle: () => {}, tracer: () => {}, impact: () => {}, explosion: () => {}, bloodSplat: () => {}, shake: 0 };
  g.renderer = { camera: new THREE.PerspectiveCamera(78, 1, 0.05, 1000), scene: new THREE.Scene() };
  g.world = new World();
  g.world.build();
  g.clearField = () => { g.cleared = true; };
  g.actors = []; g.nades = []; g.timers = [];
  return g;
}

test('指针锁在触屏、nolock、成功与失败路径下都能收尾', async () => {
  const g = makeGame();
  g.touchMode = true;
  g.lock();
  assert.equal(g.locked, true);

  g.touchMode = false; g.qs = new URLSearchParams('nolock');
  g.lock();
  assert.equal(g.locked, true);

  let calls = 0;
  const canvas = document.getElementById('c');
  canvas.requestPointerLock = () => { calls++; return { catch() {} }; };
  g.qs = new URLSearchParams('');
  g.lock();
  assert.equal(calls, 1);

  let plainCalls = 0;
  canvas.requestPointerLock = () => { plainCalls++; throw new Error('denied'); };
  g.lock();
  assert.equal(plainCalls, 2); // 第一次抛错，回退到普通锁

  canvas.requestPointerLock = () => Promise.reject(new Error('denied'));
  g.lock();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(typeof canvas.requestPointerLock, 'function');
});

test('锁变化、暂停与恢复同步 HUD 和锁定状态', () => {
  const g = makeGame();
  g.paused = true;
  g.resume = (fromLock) => { g.resumeArg = fromLock; g.paused = false; };
  document.pointerLockElement = document.getElementById('c');
  g.onLockChange();
  assert.equal(g.locked, true);
  assert.equal(g.resumeArg, true);
  assert.equal(document.body.classList.contains('lk'), true);

  g.playing = true; g.ended = false; g.inLoadout = false;
  g.pause = () => { g.paused = true; };
  document.pointerLockElement = null;
  g.onLockChange();
  assert.equal(g.locked, false);
  assert.equal(g.paused, true);

  const h = makeGame();
  let locked = 0;
  h.lock = () => locked++;
  h.resume();
  assert.equal(h.paused, false);
  assert.equal(locked, 1);
  h.resume(true);
  assert.equal(locked, 1);
  h.pause();
  assert.equal(h.paused, true);
  assert.deepEqual(h.calls.show.at(-1), 'pause');
  assert.equal(h.calls.scoreboard.at(-1)[0], false);
});

test('退出对局清理对象、指针锁并回主菜单', () => {
  const g = makeGame();
  g.player = { id: 1 };
  g.killedBy = 'x';
  g.vm.setVisible = (v) => { g.visible = v; };
  document.exitPointerLock = () => { g.calls.exit++; };
  document.pointerLockElement = document.getElementById('c');
  g.quitToMenu();
  assert.equal(g.playing, false);
  assert.equal(g.ended, true);
  assert.equal(g.matchId, 2);
  assert.equal(g.cleared, true);
  assert.equal(g.player, null);
  assert.equal(g.killedBy, '');
  assert.equal(g.visible, false);
  assert.equal(g.calls.exit, 1);
  assert.deepEqual(g.calls.show.at(-1), 'menu');
});

test('更换主武器面板：开关、非法 id、出生点内立即换枪', () => {
  const g = makeGame();
  const cards = [
    { dataset: { w: 'ak47' }, classList: { states: [], toggle(c, on) { this.states.push([c, on]); } } },
    { dataset: { w: 'awm' }, classList: { states: [], toggle(c, on) { this.states.push([c, on]); } } },
  ];
  document.querySelectorAll = () => cards;
  document.exitPointerLock = () => { g.calls.exit++; };
  document.pointerLockElement = document.getElementById('c');
  g.player = { primary: 'ak47', nextPrimary: 'awm', alive: true, team: 'BL', pos: new THREE.Vector3(-34, 0, 0) };

  g.toggleLoadout();
  assert.equal(g.inLoadout, true);
  assert.deepEqual(g.calls.show.at(-1), 'loadout');
  assert.equal(g.calls.exit, 1);
  assert.deepEqual(cards[1].classList.states, [['on', true]]);
  g.toggleLoadout();
  assert.equal(g.inLoadout, false);
  assert.deepEqual(g.calls.show.at(-1), null);

  g.chooseLoadout('railgun');
  assert.equal(g.calls.save, 0);

  const p = {
    primary: 'ak47', nextPrimary: null, alive: true, team: 'BL', pos: new THREE.Vector3(-34, 0, 0),
    inv: [new WeaponState('ak47')], slot: 1, readyAt: 0,
    soldier: { setWeapon: (id) => { p.soldierId = id; } },
  };
  g.player = p;
  g.chooseLoadout('awm');
  assert.equal(g.opts.primary, 'awm');
  assert.equal(p.nextPrimary, 'awm');
  assert.equal(p.primary, 'awm');
  assert.equal(p.inv[0].id, 'awm');
  assert.equal(p.slot, 0);
  assert.equal(p.readyAt, g.time + WEAPONS.awm.draw);
  assert.equal(p.soldierId, 'awm');
  assert.equal(g.calls.equip.at(-1)[0], 'awm');
  assert.ok(g.calls.toast.at(-1)[0].includes('已更换'));

  p.pos.x = 0;
  g.chooseLoadout('m4a1');
  assert.ok(g.calls.toast.at(-1)[0].includes('复活后使用'));
});

test('fireWeapon 区分玩家与机器人，触发枪口、曳光和听觉', () => {
  const g = makeGame();
  g.traceBullet = () => new THREE.Vector3(0, 1.5, -10);
  const listener = { team: 'GR', pos: new THREE.Vector3(0, 0, -5), hear: () => { g.heard = true; } };
  g.actors.push(listener);
  const player = {
    isPlayer: true, team: 'BL', pos: new THREE.Vector3(), radarT: 0,
    eye: () => new THREE.Vector3(0, 1.6, 0),
    forward: () => new THREE.Vector3(0, 0, -1),
  };
  g.player = { alive: true, team: 'GR', eye: () => new THREE.Vector3(0, 1.6, -3) };
  let lights = 0, tracers = 0;
  g.fx.light = () => lights++;
  g.fx.tracer = () => tracers++;
  g.fireWeapon(player, { def: WEAPONS.awm }, 0.01);
  assert.equal(g.calls.fire, 1);
  assert.equal(player.radarT, 1.6);
  assert.equal(lights, 1);
  assert.equal(tracers, 1);
  assert.equal(g.heard, true);

  const bot = {
    isPlayer: false, team: 'BL', pos: new THREE.Vector3(), radarT: 0,
    eye: () => new THREE.Vector3(0, 1.6, 0),
    forward: () => new THREE.Vector3(0, 0, -1),
    soldier: { muzzleWorld: () => new THREE.Vector3(0.2, 1.4, -0.6), kick: () => { bot.kicked = true; } },
  };
  let muzzles = 0;
  g.fx.muzzle = () => muzzles++;
  g.fx.tracer = () => tracers++;
  g.fireWeapon(bot, { def: WEAPONS.awm }, 0);
  assert.equal(muzzles, 1);
  assert.equal(bot.kicked, true);
  assert.equal(tracers, 2);
});

test('traceBullet 无命中时按射程返回终点', () => {
  const g = makeGame();
  const shooter = { team: 'BL', isPlayer: false };
  const end = g.traceBullet(shooter, new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -1), WEAPONS.ak47);
  assert.ok(Math.abs(end.z - (-WEAPONS.ak47.range)) < 1e-9);
});

test('静止手雷贴地后速度归零并衰减旋转', () => {
  const g = makeGame();
  g.world.add({ x: 0, y: -0.5, z: 0, sx: 20, sy: 1, sz: 20, mat: 'metal' });
  g.world.build();
  g.explode = () => {};
  const n = {
    mesh: new THREE.Object3D(), pos: new THREE.Vector3(0, 0.05, 0), vel: new THREE.Vector3(0, 0, 0),
    fuse: 5, owner: {}, spin: new THREE.Vector3(2, 2, 0),
  };
  g.nades.push(n);
  g.updateNades(0.1);
  assert.equal(n.vel.y, 0);
  assert.ok(n.spin.x < 2);
});

test('玩家击杀的手雷、穿墙与普通分支写入不同徽章', () => {
  const g = makeGame();
  const att = {
    id: 1, name: '我', team: 'BL', isPlayer: true, stats: { k: 0, d: 0, hs: 0, shots: 0, hits: 0 },
    multi: 0, lastKillT: -99, streak: 0,
  };
  g.player = att;
  g.hud.badge = (...a) => g.calls.badge = a;
  g.hud.killFeed = () => {};
  g.audio = null;
  const v = { team: 'GR', alive: true, stats: { k: 0, d: 0, hs: 0, shots: 0, hits: 0 }, hp: 100, armor: 100, pos: new THREE.Vector3(), soldier: { die: () => {}, chestWorld: () => new THREE.Vector3() } };
  g.kill(v, att, 'he', false, false, new THREE.Vector3(1, 0, 0));
  assert.equal(g.calls.badge[0], 'GRENADE KILL');
  const v2 = { ...v, pos: new THREE.Vector3() };
  att.lastKillT = -99; att.multi = 0;
  g.kill(v2, att, 'ak47', false, true, new THREE.Vector3(1, 0, 0));
  assert.equal(g.calls.badge[0], 'WALLBANG');
  const v3 = { ...v, pos: new THREE.Vector3() };
  att.lastKillT = -99; att.multi = 0;
  g.kill(v3, att, 'ak47', false, false, new THREE.Vector3(1, 0, 0));
  assert.equal(g.calls.badge[0], 'KILL');
});
