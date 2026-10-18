import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { World } from '../src/physics.js';
import { WEAPONS } from '../src/weapons.js';

if (!globalThis.document) globalThis.document = { pointerLockElement: null };

function makeGame() {
  const g = Object.create(Game.prototype);
  g.time = 10;
  g.frame = 0;
  g.ended = false;
  g.playing = true;
  g.paused = false;
  g.matchId = 1;
  g.goal = 50;
  g.score = { BL: 0, GR: 0 };
  g.actors = [];
  g.nades = [];
  g.tags = [];
  g.timers = [];
  g.player = { id: 1, team: 'BL', isPlayer: true };
  g.world = new World();
  g.world.add({ x: 0, y: -0.5, z: 0, sx: 100, sy: 1, sz: 100, mat: 'metal', tag: 'deck' });
  g.world.build();
  g.renderer = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    vmScene: new THREE.Scene(),
  };
  g.renderer.camera.position.set(0, 1.6, 0);
  g.calls = { damageFrom: [], hitmarker: [], killFeed: [], badge: [], end: [], sounds: [] };
  g.hud = {
    damageFrom: (a) => g.calls.damageFrom.push(a),
    hitmarker: (...a) => g.calls.hitmarker.push(a),
    killFeed: (...a) => g.calls.killFeed.push(a),
    badge: (...a) => g.calls.badge.push(a),
    endScreen: (...a) => g.calls.end.push(a),
    toast: () => {},
    slots: () => {},
  };
  g.audio = new Proxy({}, {
    get: (_t, k) => (...a) => { g.calls.sounds.push([k, ...a]); },
  });
  g.fx = {
    shake: 0,
    impact: () => {},
    bloodSplat: () => {},
    explosion: () => {},
  };
  g.vm = { setVisible: () => {} };
  g.endCalls = [];
  g.endMatch = (...a) => { g.endCalls.push(a); };
  return g;
}

function makeActor(g, team = 'GR', { hp = 100, armor = 100, x = 0, y = 1, z = 0 } = {}) {
  const a = {
    team, hp, armor, alive: true, protectT: 0, isPlayer: false,
    pos: new THREE.Vector3(x, 0, z),
    vel: new THREE.Vector3(),
    stats: { k: 0, d: 0, hs: 0, shots: 0, hits: 0 },
    multi: 0, streak: 0, lastKillT: -99, aimPunch: 0,
    soldier: {
      die: () => {},
      chestWorld: (out) => out.set(x, y, z),
      hitTest: (o, d, maxT) => (x - o.x) / d.x <= maxT ? { t: (x - o.x) / d.x, part: 'head' } : null,
    },
    startDeathCam: () => {},
    onDamaged: () => {},
  };
  g.actors.push(a);
  return a;
}

test('伤害结算：护甲、队伍、保护与结束状态', () => {
  const g = makeGame();
  const v = makeActor(g, 'GR');
  const att = makeActor(g, 'BL');
  const dir = new THREE.Vector3(1, 0, 0);
  g.damage(v, att, 36, 'chest', 'ak47', dir, false);
  assert.ok(Math.abs(v.hp - 71.92) < 1e-9);
  assert.ok(v.armor < 100 && v.armor > 88);
  assert.equal(att.stats.hits, 1);
  assert.equal(v.lastAttacker, att);
  assert.equal(v.lastHurt, g.time);

  const before = v.hp;
  g.damage(v, makeActor(g, 'GR'), 50, 'chest', 'ak47', dir, false);
  assert.equal(v.hp, before);
  v.protectT = 1;
  g.damage(v, att, 50, 'chest', 'ak47', dir, false);
  assert.equal(v.hp, before);
  v.protectT = 0;
  g.ended = true;
  g.damage(v, att, 50, 'chest', 'ak47', dir, false);
  assert.equal(v.hp, before);
  g.ended = false;
  v.alive = false;
  g.damage(v, att, 50, 'chest', 'ak47', dir, false);
  assert.equal(v.hp, before);
});

test('玩家受伤触发红边、受击方向、低血量与命中反馈', () => {
  const g = makeGame();
  const player = makeActor(g, 'BL');
  player.isPlayer = true;
  g.player = player;
  const att = makeActor(g, 'GR');
  att.isPlayer = true;
  const dir = new THREE.Vector3(0, 0, 1);
  g.damage(player, att, 80, 'chest', 'ak47', dir, false);
  assert.equal(g.calls.damageFrom.length, 1);
  assert.ok(player.aimPunch > 0);
  assert.ok(g.dmgFlash > 0);
  assert.deepEqual(g.calls.hitmarker[0], [false, false]);

  g.calls.hitmarker.length = 0;
  g.damage(player, att, 30, 'head', 'ak47', dir, false);
  assert.equal(g.calls.hitmarker.length, 1);
  assert.equal(g.calls.hitmarker[0][0], true);
});

test('击杀累积分数、连杀与击杀播报', () => {
  const g = makeGame();
  const att = makeActor(g, 'BL');
  att.isPlayer = true;
  g.player = att;
  const v = makeActor(g, 'GR');
  att.lastKillT = g.time - 1;
  att.multi = 1;
  g.kill(v, att, 'ak47', true, false, new THREE.Vector3(1, 0, 0));
  assert.equal(v.alive, false);
  assert.equal(v.stats.d, 1);
  assert.equal(att.stats.k, 1);
  assert.equal(att.stats.hs, 1);
  assert.equal(g.score.BL, 1);
  assert.equal(att.multi, 2);
  assert.equal(att.streak, 1);
  assert.equal(g.calls.killFeed.length, 1);
  assert.equal(g.calls.badge[0][0], 'DOUBLE KILL');
  assert.equal(g.calls.badge[0][2], true);
  assert.equal(g.endCalls.length, 0);

  const v2 = makeActor(g, 'GR');
  att.lastKillT = g.time - 10;
  g.kill(v2, att, 'knife', false, false, new THREE.Vector3(1, 0, 0));
  assert.equal(g.calls.badge[1][0], 'KNIFE KILL');
  assert.equal(att.streak, 2);
});

test('玩家阵亡显示击杀者并关闭第一人称武器', () => {
  const g = makeGame();
  const p = makeActor(g, 'BL');
  p.isPlayer = true;
  g.player = p;
  const att = makeActor(g, 'GR');
  let hidden = 0;
  g.vm.setVisible = (v) => { if (!v) hidden++; };
  g.kill(p, att, 'awm', true, false, new THREE.Vector3(0, 0, 1));
  assert.equal(p.alive, false);
  assert.ok(g.killedBy.includes('爆头'));
  assert.equal(hidden, 1);
});

test('达到目标分数会请求结束对局', () => {
  const g = makeGame();
  g.goal = 1;
  const att = makeActor(g, 'BL');
  const v = makeActor(g, 'GR');
  g.kill(v, att, 'ak47', false, false, new THREE.Vector3(1, 0, 0));
  assert.equal(g.endCalls.length, 1);
  assert.equal(g.endCalls[0][0], 1200);
});

test('traceBullet 命中角色、被墙挡住与穿透木箱', () => {
  const g = makeGame();
  const shooter = makeActor(g, 'BL', { x: 0, y: 1.6, z: 0 });
  shooter.isPlayer = false;
  const target = makeActor(g, 'GR', { x: 5, y: 1.6, z: 0 });
  const dir = new THREE.Vector3(1, 0, 0);
  const origin = new THREE.Vector3(0, 1.6, 0);
  const damage = [];
  g.damage = (v, a, amt, part, wid) => damage.push([v, a, amt, part, wid]);
  const end = g.traceBullet(shooter, origin, dir, WEAPONS.ak47);
  assert.equal(damage.length, 1);
  assert.equal(damage[0][0], target);
  assert.equal(damage[0][3], 'head');
  assert.ok(Math.abs(end.x - 5) < 1e-9);

  // 实心墙挡住
  g.world.add({ x: 2, y: 1, z: 0, sx: 0.2, sy: 3, sz: 3, mat: 'metal' });
  g.world.build();
  damage.length = 0;
  const blockedEnd = g.traceBullet(shooter, origin, dir, WEAPONS.ak47);
  assert.equal(damage.length, 0);
  assert.ok(blockedEnd.x < 2);

  // 可穿透木箱，伤害按 0.6 衰减
  const g2 = makeGame();
  const shooter2 = makeActor(g2, 'BL', { x: 0, y: 1.6, z: 0 });
  const target2 = makeActor(g2, 'GR', { x: 5, y: 1.6, z: 0 });
  target2.soldier.hitTest = (o, d, maxT) => { const t = (5 - o.x) / d.x; return t <= maxT ? { t, part: 'chest' } : null; };
  g2.world.add({ x: 2, y: 1, z: 0, sx: 0.2, sy: 3, sz: 3, mat: 'wood', bullet: 'pen' });
  g2.world.build();
  const damage2 = [];
  g2.damage = (v, a, amt) => damage2.push(amt);
  g2.traceBullet(shooter2, new THREE.Vector3(0, 1.6, 0), dir, WEAPONS.ak47);
  assert.equal(damage2.length, 1);
  assert.ok(damage2[0] < WEAPONS.ak47.dmg);
});

test('手雷爆炸按距离衰减、隔墙减伤并跳过队友', () => {
  const g = makeGame();
  const owner = makeActor(g, 'BL', { x: -10, y: 1, z: 0 });
  const mate = makeActor(g, 'BL', { x: 1, y: 1, z: 0 });
  const near = makeActor(g, 'GR', { x: 1, y: 1, z: 0 });
  const far = makeActor(g, 'GR', { x: 20, y: 1, z: 0 });
  const calls = [];
  g.damage = (v, a, amt, part) => calls.push([v, amt, part]);
  g.explode(new THREE.Vector3(0, 1, 0), owner);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], near);
  assert.equal(calls[0][2], 'chest');
  assert.ok(calls[0][1] > 0 && calls[0][1] < WEAPONS.he.dmg);
  assert.ok(g.fx.shake > 0);
  assert.equal(far.hp, 100);
  assert.equal(mate.hp, 100);
});

test('clearField 移除并释放上一局的对象', () => {
  const g = makeGame();
  const removed = [];
  g.renderer.scene.remove = (o) => removed.push(o);
  let disposed = 0;
  const root = {};
  const victim = { soldier: { root, dispose: () => disposed++ } };
  const sprite = { material: { map: { dispose: () => disposed++ }, dispose: () => disposed++ } };
  const nade = { mesh: {} };
  g.actors = [victim];
  g.tags = [{ sprite }];
  g.nades = [nade];
  g.aimTarget = victim;
  g.clearField();
  assert.equal(disposed, 3);
  assert.equal(removed.length, 3);
  assert.deepEqual(g.actors, []);
  assert.deepEqual(g.tags, []);
  assert.deepEqual(g.nades, []);
  assert.deepEqual(g.timers, []);
  assert.equal(g.aimTarget, null);
});

test('endMatch 记录胜负与比分快照', () => {
  const g = makeGame();
  g.score = { BL: 50, GR: 20 };
  g.matchId = 7;
  g.endMatch = Game.prototype.endMatch;
  g.endMatch();
  assert.equal(g.ended, true);
  assert.equal(g.matchWinner, true);
  assert.deepEqual(g.matchScore, { BL: 50, GR: 20 });
  assert.equal(g.calls.end.length, 1);
  assert.equal(g.calls.end[0][0], true);

  const draw = makeGame();
  draw.score = { BL: 10, GR: 10 };
  draw.endMatch = Game.prototype.endMatch;
  draw.endMatch();
  assert.equal(draw.matchWinner, null);
  assert.equal(draw.calls.end[0][0], null);

  const lose = makeGame();
  lose.score = { BL: 3, GR: 9 };
  lose.endMatch = Game.prototype.endMatch;
  lose.endMatch();
  assert.equal(lose.matchWinner, false);

  const twice = makeGame();
  twice.endMatch = Game.prototype.endMatch;
  twice.endMatch();
  twice.endMatch();
  assert.equal(twice.calls.end.length, 1);
});

test('fastForward 推进模拟并在结束时停止', () => {
  const g = makeGame();
  g.goal = 100;
  g.time = 0;
  g.timeLeft = 600;
  g.actors = [{ name: 'A', stats: { k: 0, d: 0 } }];
  g.simulate = (dt) => {
    g.time += dt;
    g.timeLeft -= dt;
    if (g.time > 0.5) g.ended = true;
  };
  const r = g.fastForward(2, 0.25);
  assert.ok(g.time <= 0.75);
  assert.equal(typeof r.time, 'string');
  assert.ok(r.kills.length > 0);
});

test('选项变更只触碰对应子系统', () => {
  const g = makeGame();
  const applied = [];
  g.env = { apply: (v) => applied.push(['tod', v]) };
  g.opts = { fov: 78, tod: 'day' };
  g.onOption('fov', 90);
  assert.equal(g.renderer.camera.fov, 90);
  g.onOption('tod', 'dusk');
  assert.deepEqual(applied, [['tod', 'dusk']]);
  g.opts.vol = 0.5;
  assert.doesNotThrow(() => g.onOption('vol', 0.5));
  g.shell = { setWindowMode: (m) => applied.push(['mode', m]) };
  g.onOption('windowMode', 'fullscreen');
  assert.deepEqual(applied[1], ['mode', 'fullscreen']);
});
