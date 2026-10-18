import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { Game } from '../src/game.js';
import { World } from '../src/physics.js';
import { WEAPONS } from '../src/weapons.js';

let restore = null;
before(() => { restore = installFakeDom(); });
after(() => restore?.());

function makeGame() {
  const g = Object.create(Game.prototype);
  g.time = 10; g.frame = 0; g.ended = false; g.playing = true; g.paused = false;
  g.matchId = 1; g.goal = 50; g.score = { BL: 0, GR: 0 };
  g.actors = []; g.nades = []; g.tags = []; g.timers = [];
  g.player = { id: 1, team: 'BL', isPlayer: true };
  g.world = new World();
  g.world.add({ x: 0, y: -0.5, z: 0, sx: 100, sy: 1, sz: 100, mat: 'metal', tag: 'deck' });
  g.world.build();
  g.renderer = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), vmScene: new THREE.Scene() };
  g.renderer.camera.position.set(0, 1.6, 0);
  g.calls = { toast: [], impacts: [], sounds: [], slots: [], equipped: [], thrown: [] };
  g.hud = {
    toast: (...a) => g.calls.toast.push(a), slots: (...a) => g.calls.slots.push(a),
    damageFrom: () => {}, hitmarker: () => {}, killFeed: () => {}, badge: () => {}, endScreen: () => {},
  };
  g.fx = { shake: 0, impact: (...a) => g.calls.impacts.push(a), explosion: () => {}, bloodSplat: () => {} };
  g.vm = {
    setVisible: () => {}, equip: (...a) => g.calls.equipped.push(a), reload: () => {},
    melee: () => {}, throwNade: () => {},
  };
  g.env = { sunDir: new THREE.Vector3(0, 1, 0), apply: () => {}, update: () => {}, shipSpeed: 6 };
  g.map = { update: () => {} };
  g.shell = null;
  return g;
}

test('近战命中背部与头部有额外倍率，空挥区分墙与空气', () => {
  const g = makeGame();
  const damages = [];
  g.damage = (...a) => damages.push(a);
  const attacker = {
    isPlayer: true, team: 'BL', alive: true,
    eye: () => new THREE.Vector3(0, 1.6, 0),
    forward: () => new THREE.Vector3(0, 0, -1),
  };
  const target = {
    team: 'GR', alive: true,
    forward: () => new THREE.Vector3(0, 0, -1),
    soldier: { hitTest: () => ({ t: 1.2, part: 'head' }) },
  };
  g.actors.push(target);
  g.melee(attacker, true);
  assert.equal(g.timers.length, 1);
  g.timers[0].fn();
  assert.equal(damages.length, 1);
  const [victim, att, dmg, part, wid] = damages[0];
  assert.equal(victim, target);
  assert.equal(att, attacker);
  assert.equal(part, 'head');
  assert.equal(wid, 'knife');
  assert.ok(dmg > WEAPONS.knife.dmgHeavy);

  // 空挥命中墙
  g.timers = [];
  target.soldier.hitTest = () => null;
  g.world.raycast = () => ({ t: 1, nx: 0, ny: 0, nz: 1, collider: { mat: 'metal' } });
  g.melee(attacker, false);
  g.timers[0].fn();
  assert.equal(g.calls.impacts.length, 2);

  // 空挥未命中
  g.timers = [];
  g.world.raycast = () => null;
  g.melee(attacker, false);
  g.timers[0].fn();
  assert.equal(g.calls.impacts.length, 2);
});

test('投掷手雷生成实体、速度与听觉事件', () => {
  const g = makeGame();
  const heard = [];
  const attacker = {
    isPlayer: true, team: 'BL', yaw: 0,
    eye: () => new THREE.Vector3(0, 1.6, 0),
    forward: () => new THREE.Vector3(0, 0, -1),
    vel: new THREE.Vector3(1, 0, 0), pos: new THREE.Vector3(),
  };
  g.actors.push({ team: 'GR', pos: new THREE.Vector3(0, 0, -5), hear: (p) => heard.push(p) });
  g.throwGrenade(attacker);
  assert.equal(g.nades.length, 1);
  const n = g.nades[0];
  assert.equal(n.owner, attacker);
  assert.equal(n.fuse, WEAPONS.he.fuse);
  assert.ok(n.vel.y > 0);
  assert.ok(n.mesh.parent === g.renderer.scene);
  assert.equal(heard.length, 1);
});

test('手雷在甲板上反弹、旋转并在引信耗尽后爆炸', () => {
  const g = makeGame();
  let exploded = 0;
  g.explode = () => { exploded++; };
  const mesh = new THREE.Object3D();
  const n = {
    mesh, pos: new THREE.Vector3(0, 1, 0), vel: new THREE.Vector3(0, -3, 0),
    fuse: 0.05, owner: {}, spin: new THREE.Vector3(1, 1, 0),
  };
  g.nades.push(n);
  g.updateNades(0.01);
  assert.ok(n.pos.y < 1);
  assert.ok(mesh.position.equals(n.pos));
  assert.ok(mesh.rotation.x !== 0);
  g.updateNades(0.1);
  assert.equal(exploded, 1);
  assert.equal(g.nades.length, 0);

  const flying = { mesh: new THREE.Object3D(), pos: new THREE.Vector3(0, 10, 0), vel: new THREE.Vector3(1, 2, 0), fuse: 5, owner: {}, spin: new THREE.Vector3() };
  g.nades.push(flying);
  g.updateNades(0.1);
  assert.ok(flying.pos.x > 0);
  assert.ok(flying.mesh.position.equals(flying.pos));
});

test('脚步、跳跃与落地事件按距离与阵营触发', () => {
  const g = makeGame();
  const heard = [];
  const near = { isPlayer: false, team: 'GR', walk: false, crouch: false, ground: { surface: 'wood' }, pos: new THREE.Vector3(1, 0, 0), hear: (p) => heard.push(p) };
  const far = { isPlayer: false, team: 'BL', walk: false, crouch: false, ground: null, pos: new THREE.Vector3(100, 0, 0), hear: () => { throw new Error('不应听到'); } };
  const listener = { team: 'BL', pos: new THREE.Vector3(1, 0, 0), hear: (p) => heard.push(p) };
  g.actors.push(near, far, listener);
  g.onFootstep(near);
  assert.equal(heard.length, 1);
  assert.doesNotThrow(() => g.onFootstep(far));
  near.walk = true;
  g.onFootstep(near);
  assert.equal(heard.length, 1);
  assert.doesNotThrow(() => g.onJump(near));
  assert.doesNotThrow(() => g.onLand(near, 8));
  assert.doesNotThrow(() => g.onJump({ isPlayer: true, pos: new THREE.Vector3() }));
});

test('切枪、换弹、开镜与空枪事件只影响玩家', () => {
  const g = makeGame();
  const bot = { isPlayer: false };
  g.onSwitch(bot);
  g.onReloadStart(bot, true);
  g.onScope(bot);
  g.onDryFire(bot);
  g.onGrenadeStart(bot);
  assert.equal(g.calls.equipped.length, 0);
  assert.equal(g.timers.length, 0);

  const player = {
    isPlayer: true, slot: 1,
    weapon: { id: 'ak47', def: WEAPONS.ak47 },
    inv: [{ id: 'ak47' }, { id: 'deagle' }],
  };
  g.onSwitch(player);
  assert.equal(g.calls.equipped.length, 1);
  assert.equal(g.calls.slots.length, 1);
  g.onReloadStart(player, true);
  assert.equal(g.timers.length, 4);
  for (const t of g.timers) t.fn();
  assert.doesNotThrow(() => g.onScope(player));
  assert.doesNotThrow(() => g.onDryFire(player));
  assert.doesNotThrow(() => g.onGrenadeStart(player));
});

test('分辨率切换处理自动、固定、非法与无桌面壳', async () => {
  const g = makeGame();
  g.applyResolution('1920x1080');
  g.shell = {
    resetWindowSize: async () => ({ width: 1600, height: 900 }),
    setWindowSize: async () => ({ width: 1600, height: 900 }),
  };
  g.applyResolution('auto');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(g.calls.toast.some(([t]) => String(t).includes('已恢复默认窗口')));

  g.calls.toast.length = 0;
  await new Promise((resolve) => {
    g.shell.setWindowSize = async () => ({ width: 1280, height: 720 });
    g.applyResolution('1920x1080');
    setTimeout(resolve, 0);
  });
  assert.ok(g.calls.toast.some(([t]) => String(t).includes('屏幕放不下')));
  g.calls.toast.length = 0;
  g.applyResolution('bad');
  assert.equal(g.calls.toast.length, 0);
  g.shell = null;
  assert.doesNotThrow(() => g.applyResolution('1024x768'));

  const quit = makeGame();
  let quitCalls = 0;
  quit.shell = { quit: () => quitCalls++ };
  quit.quitApp();
  assert.equal(quitCalls, 1);
  quit.shell = null;
  quit.quitToMenu = () => quitCalls++;
  quit.quitApp();
  assert.equal(quitCalls, 2);
});

test('光照探针在遮挡与有顶时平滑趋近目标值', () => {
  const g = makeGame();
  g.player = { eye: () => new THREE.Vector3(0, 1.6, 0) };
  g.world.raycast = () => null;
  g.updateLightProbe();
  assert.equal(g.lightK, 1);
  assert.equal(g.indoorK, 0);
  g.world.raycast = () => ({ t: 1 });
  for (let i = 0; i < 20; i++) g.updateLightProbe();
  assert.ok(g.lightK < 0.3);
  assert.ok(g.indoorK > 0.99);
});

test('simulate 执行计时器、AI、出生保护、复活与队友标签', () => {
  const g = makeGame();
  let timerDone = 0;
  g.timers.push({ t: 10, fn: () => timerDone++ });
  g.timeLeft = 1;
  const player = { isPlayer: true, update: () => {} };
  g.player = player;
  const dead = {
    isPlayer: false, alive: false, deadT: 0, respawnT: 0.01, pos: new THREE.Vector3(),
    update: () => {}, soldier: { update: () => {} },
  };
  const live = {
    isPlayer: false, alive: true, protectT: 1, radarT: 1, speed: 1, yaw: 0, crouch: false, update: () => {},
    pitch: 0, punchP: 0, onGround: true, weapon: { reloading: false },
    pos: new THREE.Vector3(1, 0, 0), vel: new THREE.Vector3(0, 0, -1),
    soldier: {
      root: { position: new THREE.Vector3(), rotation: { y: 0 } },
      mesh: { visible: true }, update: () => {}, headWorld: (v) => v.set(1, 1.7, 0),
    },
  };
  g.actors.push(dead, live);
  const tagSprite = { position: new THREE.Vector3(), visible: false };
  g.tags.push({ sprite: tagSprite, actor: live });
  let spawned = null;
  g.spawnActor = (a) => { spawned = a; };
  g.updateNades = () => {};
  let ended = 0;
  g.endMatch = () => { ended++; };
  g.simulate(0.1);
  assert.equal(timerDone, 1);
  assert.equal(g.time, 10.1);
  assert.equal(live.protectT < 1, true);
  assert.equal(dead.deadT > 0, true);
  assert.equal(spawned, dead);
  assert.equal(tagSprite.visible, true);
  assert.ok(tagSprite.position.y > 1.7);
  g.timeLeft = 0.01;
  g.simulate(0.1);
  assert.equal(ended, 1);
});

test('spawnActor 选择离敌人更远且不与队友重叠的出生点', () => {
  const g = makeGame();
  g.map.spawns = { BL: [{ x: 0, z: 0, yaw: 0 }, { x: 10, z: 0, yaw: 0 }], GR: [] };
  g.actors = [{ alive: true, team: 'GR', pos: new THREE.Vector3(0, 0, 0) }];
  const bot = { team: 'BL', isPlayer: false, spawn: (p) => { bot.spawned = p; } };
  g.spawnActor(bot);
  assert.equal(bot.spawned.x, 10);
  g.actors.push({ alive: true, team: 'BL', pos: new THREE.Vector3(10, 0, 0) }, { alive: true, team: 'BL', pos: new THREE.Vector3(10, 0, 0) });
  const bot2 = { team: 'BL', isPlayer: false, spawn: (p) => { bot2.spawned = p; } };
  g.spawnActor(bot2);
  assert.equal(bot2.spawned.x, 0);
});
