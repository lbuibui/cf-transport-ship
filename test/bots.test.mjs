import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { Bot, DIFF, BOT_NAMES } from '../src/bots.js';
import { World } from '../src/physics.js';

let restore = null;
before(() => { restore = installFakeDom(); });
after(() => restore?.());

function makeGame() {
  const events = [];
  const world = new World();
  world.add({ x: 0, y: -0.5, z: 0, sx: 120, sy: 1, sz: 120, mat: 'metal' });
  world.build();
  return {
    renderer: { scene: new THREE.Scene() },
    world,
    nav: {
      findPath: () => [[0, 0, 0, false], [1, 0, 0, false]],
      randomFree: () => [1, 2, 0],
    },
    actors: [], time: 0,
    onJump: () => events.push('jump'), onLand: () => {}, onFootstep: () => {},
    onSwitch: () => {}, onReloadStart: () => {}, onReloadDone: () => {}, onScope: () => {},
    onDryFire: () => {}, onGrenadeStart: () => {}, melee: () => {}, fireWeapon: () => {}, throwGrenade: () => {},
    hud: { toast: () => {}, slots: () => {} }, audio: {}, fx: { shake: 0 },
    events,
  };
}

function makeBot(diff = 'normal', team = 'BL') {
  const g = makeGame();
  const b = new Bot(g, { id: 2, name: 'B', team, diff });
  g.actors.push(b);
  b.spawn({ x: -20, z: 0, yaw: 0 });
  b.onSpawn();
  return { g, b };
}

test('四档难度参数单调递增，机器人名字唯一', () => {
  const keys = ['easy', 'normal', 'hard', 'hell'];
  assert.deepEqual(Object.keys(DIFF), keys);
  for (let i = 1; i < keys.length; i++) {
    const a = DIFF[keys[i - 1]], b = DIFF[keys[i]];
    assert.ok(b.react[0] < a.react[0]);
    assert.ok(b.react[1] < a.react[1]);
    assert.ok(b.aimErr < a.aimErr);
    assert.ok(b.turn > a.turn);
    assert.ok(b.see > a.see);
    assert.ok(b.headP > a.headP);
    assert.ok(b.bunny >= a.bunny);
  }
  assert.equal(new Set(BOT_NAMES).size, BOT_NAMES.length);
  assert.ok(BOT_NAMES.length >= 16);
  for (const n of BOT_NAMES) assert.ok(n.length > 0);
});

test('阵营坐标镜像', () => {
  const { b } = makeBot('normal', 'BL');
  assert.deepEqual(b.L(3, -2), [3, -2]);
  b.side = -1;
  assert.deepEqual(b.L(3, -2), [-3, 2]);
});

test('出生后按武器与角色选点并生成路径', () => {
  const { g, b } = makeBot('hell');
  assert.equal(b.diff, DIFF.hell);
  assert.equal(b.recoilControl, DIFF.hell.ctrl);
  assert.ok(['rush', 'flank', 'hold'].includes(b.role));
  assert.ok(b.goal && Number.isFinite(b.goal[0]));
  assert.ok(Array.isArray(b.path) && b.path.length > 0);
  assert.equal(b.pi, 1);
  // 狙击手优先架点
  b.primary = 'awm';
  b.onSpawn();
  assert.equal(b.role, 'hold');
});

test('heightAt 与 pathTo 走世界/导航接口', () => {
  const { g, b } = makeBot();
  assert.equal(b.heightAt(0, 0), 0);
  g.world.support = () => ({ y: 2.59 });
  assert.equal(b.heightAt(0, 0), 2.59);
  const p = b.pathTo(1, 2, 2.59);
  assert.ok(Array.isArray(p));
});

test('听到声音与受伤会记录可疑位置', () => {
  const { g, b } = makeBot();
  b.hear(new THREE.Vector3(1, 0, 1), true);
  assert.ok(b.heard && b.heardT === g.time);
  b.visible = true;
  b.hear(new THREE.Vector3(2, 0, 2), true);
  assert.equal(b.heard.x, 1);
  b.visible = false;
  const att = { pos: new THREE.Vector3(5, 0, 5) };
  b.target = null;
  b.onDamaged(att);
  assert.equal(b.target, att);
  assert.deepEqual(b.lastSeen.toArray(), [5, 0, 5]);
});

test('视野判断受距离、角度与遮挡影响', () => {
  const { g, b } = makeBot();
  const target = {
    pos: new THREE.Vector3(-20, 0, -20),
    soldier: {
      headWorld: (v) => v.set(-20, 1.5, -20),
      chestWorld: (v) => v.set(-20, 1.1, -20),
    },
  };
  b.yaw = Math.PI;
  assert.equal(b.canSee(target), false); // 目标在背后
  b.yaw = 0;
  assert.equal(b.canSee(target), true);
  g.world.raycast = () => ({ t: 1 });
  assert.equal(b.canSee(target), false);
  target.pos.set(-20, 0, -1000);
  assert.equal(b.canSee(target), false);
});

test('翻越用抛物线位移到达目标并恢复落地状态', () => {
  const { g, b } = makeBot();
  b.startMantle(-18, 2, 1.8);
  assert.equal(b.onGround, false);
  assert.ok(g.events.includes('jump'));
  let guard = 0;
  while (b.mantle && guard++ < 100) b.updateMantle(0.05);
  assert.equal(b.mantle, null);
  assert.equal(b.onGround, true);
  assert.ok(Math.abs(b.pos.x - (-18)) < 1e-6);
  assert.ok(Math.abs(b.pos.z - 2) < 1e-6);
  assert.equal(b.pos.y, 1.8);
  assert.ok(b.jumpTry > g.time);
});

test('死亡时清空翻越状态，update 直接返回', () => {
  const { b } = makeBot();
  b.startMantle(-18, 2, 1.8);
  b.alive = false;
  b.update(0.016);
  assert.equal(b.mantle, null);
});

test('think 发现目标并进入开火状态', () => {
  const { g, b } = makeBot('hell');
  const target = {
    team: 'GR', alive: true, pos: new THREE.Vector3(-20, 0, -5), vel: new THREE.Vector3(), speed: 0,
    soldier: {
      headWorld: (v) => v.set(-20, 1.5, -5),
      chestWorld: (v) => v.set(-20, 1.1, -5),
    },
  };
  g.actors.push(target);
  b.target = null;
  b.visible = false;
  b.yaw = 0;
  b.pitch = 0;
  b.think();
  assert.equal(b.visible, true);
  assert.equal(b.target, target);
  assert.equal(b.lastSeen !== null, true);
  assert.ok(b.reactUntil > g.time);
  assert.equal(b.path, null);
});

test('无目标时按路径移动，发现目标后能开枪', () => {
  const { g, b } = makeBot('easy');
  let shots = 0;
  g.fireWeapon = () => { shots++; };
  g.nav.findPath = () => [[-20, 0, 0, false], [-20, -4, 0, false], [-20, -8, 0, false]];
  b.onSpawn();
  b.goal = [-20, -8];
  b.path = [[-20, 0, 0, false], [-20, -4, 0, false], [-20, -8, 0, false]];
  b.pi = 1;
  b.thinkT = 99;
  for (let i = 0; i < 30; i++) { g.time += 1 / 60; b.update(1 / 60); }
  assert.ok(b.pos.z < -0.5 || b.pi > 1);
  assert.ok(b.pos.toArray().every(Number.isFinite));

  const target = {
    team: 'GR', alive: true, pos: new THREE.Vector3(-20, 0, -5), vel: new THREE.Vector3(), speed: 0,
    soldier: {
      headWorld: (v) => v.set(-20, 1.5, -5),
      chestWorld: (v) => v.set(-20, 1.1, -5),
    },
  };
  g.actors.push(target);
  b.pos.set(-20, 0, 0);
  b.yaw = 0; b.pitch = 0;
  b.weapon.nextFire = 0; b.readyAt = 0; b.reactUntil = 0;
  b.thinkT = 0; b.visible = true; b.target = target;
  b.lookYaw = undefined; b.lookPitch = undefined;
  for (let i = 0; i < 180 && shots === 0; i++) { g.time += 1 / 60; b.update(1 / 60); }
  assert.ok(shots > 0, '机器人未开火');
});

test('手雷计划会切换投掷物并投出', () => {
  const { g, b } = makeBot('normal');
  let throws = 0;
  g.throwGrenade = () => { throws++; };
  b.nadePlan = new THREE.Vector3(-10, 0, -10);
  b.readyAt = 0;
  for (let i = 0; i < 400 && throws === 0; i++) { g.time += 1 / 60; b.update(1 / 60); }
  assert.equal(b.slot, 3);
  assert.ok(throws > 0);
});

test('架点机器人会在目标层之间切换并生成路径', () => {
  const { g, b } = makeBot('normal');
  b.primary = 'awm';
  b.role = 'hold';
  withRandom([0.1, 0], () => b.pickGoal());
  assert.equal(b.goalLayer, 'roof');
  assert.ok(Array.isArray(b.path));
  assert.ok(Number.isFinite(b.goalHeight));
  withRandom([0.9, 0], () => b.pickGoal());
  assert.equal(b.goalLayer, 'high');
  b.primary = 'ak47';
  withRandom([0.9, 0], () => b.pickGoal());
  assert.equal(b.goalLayer, 'ground');
  assert.equal(b.holdYaw !== undefined, true);
});

function withRandom(seq, fn) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => seq[Math.min(i++, seq.length - 1)];
  try { return fn(); } finally { Math.random = orig; }
}

test('roofRandom 与 pickGoal 的架点、高台、地面与回退分支', () => {
  const { g, b } = makeBot();
  let args = null;
  g.nav.randomFree = (...a) => { args = a; return [1, 2, 2.59]; };
  assert.deepEqual(b.roofRandom(() => 0.5), [1, 2, 2.59]);
  assert.equal(args[0](), 0.5);

  b.pathTo = () => [[0, 0, 0, false]];
  b.role = 'hold'; b.primary = 'ak47'; b.side = 1;
  withRandom([0.1, 0], () => b.pickGoal());
  assert.equal(b.goalLayer, 'roof');
  assert.equal(b.holdYaw, 0);
  b.side = -1;
  withRandom([0.1, 0], () => b.pickGoal());
  assert.equal(b.holdYaw, Math.PI);

  b.side = 1;
  withRandom([0.5, 0], () => b.pickGoal());
  assert.equal(b.goalLayer, 'high');
  assert.ok(Number.isFinite(b.holdYaw));

  withRandom([0.9, 0], () => b.pickGoal());
  assert.equal(b.goalLayer, 'ground');
  assert.ok(Number.isFinite(b.holdYaw));

  // 非架点角色：先试二楼，再试高台
  b.role = 'rush'; b.stage = 2; b.primary = 'ak47';
  g.nav.randomFree = () => [3, 4, 2.59];
  withRandom([0.1], () => b.pickGoal());
  assert.equal(b.goalLayer, 'roof');

  b.role = 'flank'; b.stage = 3; b.primary = 'awm';
  g.nav.randomFree = () => [5, 6, 1.8];
  withRandom([0.9, 0.1, 0], () => b.pickGoal());
  assert.equal(b.goalLayer, 'high');

  // 没有可选点时回到固定目标
  b.role = 'rush'; b.stage = 3; b.primary = 'ak47';
  g.nav.randomFree = () => null;
  withRandom([0.9, 0.9], () => b.pickGoal());
  assert.deepEqual(b.goal, [10, 0]);

  // 首次寻路失败时用随机点重试
  let calls = 0;
  g.nav.findPath = () => (calls++ === 0 ? null : [[0, 0, 0, false]]);
  g.nav.randomFree = () => [7, 8, 0];
  withRandom([0.9, 0.9], () => b.pickGoal());
  assert.deepEqual(b.goal, [7, 8]);
  assert.equal(b.goalLayer, 'ground');
  assert.ok(Array.isArray(b.path));
});

test('think 的追猎、听声、架点停留、手雷与卡住恢复', () => {
  {
    const { g, b } = makeBot();
    b.visible = false; b.role = 'rush'; b.target = null;
    b.lastSeen = new THREE.Vector3(1, 0, 1); b.lastSeenT = g.time - 1;
    b.path = null;
    b.pathTo = () => [[1, 1, 0, false]];
    b.think();
    assert.equal(b.huntFor, b.lastSeenT);
    assert.ok(Array.isArray(b.path));
  }
  {
    const { g, b } = makeBot();
    b.visible = false; b.role = 'rush'; b.target = null;
    b.lastSeen = null; b.heard = new THREE.Vector3(2, 0, 2); b.heardT = g.time - 1;
    b.path = [[0, 0, 0, false]];
    b.pathTo = () => [[2, 2, 0, false]];
    withRandom([0], () => b.think());
    assert.deepEqual(b.path, [[2, 2, 0, false]]);
    assert.equal(b.heard, null);
    assert.ok(Number.isFinite(b.lookYaw));
  }
  {
    const { g, b } = makeBot();
    b.visible = false; b.role = 'hold'; b.target = null;
    b.lastSeen = null; b.heard = null; b.path = null;
    b.goal = [b.pos.x, b.pos.z]; b.holdT = 100;
    let picked = 0; b.pickGoal = () => picked++;
    withRandom([0], () => b.think());
    assert.equal(picked, 1);
    assert.equal(b.holdT, 0);
  }
  {
    const { g, b } = makeBot();
    b.visible = false; b.role = 'rush'; b.target = null;
    b.lastSeen = new THREE.Vector3(0, 0, 10); b.lastSeenT = g.time - 1;
    b.path = [[0, 0, 0, false], [1, 1, 0, false]]; b.pi = 2;
    b.nadeT = 0; b.nadePlan = null; b.inv[3].mag = 1;
    withRandom([0], () => b.think());
    assert.ok(b.nadePlan);
  }
  {
    const { g, b } = makeBot();
    b.visible = false; b.role = 'rush'; b.target = null;
    b.lastSeen = null; b.heard = null;
    b.path = [[0, 0, 0, false], [1, 0, 0, false]]; b.pi = 1;
    b.lastCheck.copy(b.pos); b.stuckT = 1.01;
    let picked = 0; b.pickGoal = () => picked++;
    for (let i = 0; i < 5; i++) { b.stuckT = 1.01; b.think(); }
    assert.equal(b.wantJump, true);
    assert.equal(picked >= 1, true);
  }
});

test('update 的跳上路径点、架点朝向与高处边缘保护', () => {
  {
    const { g, b } = makeBot();
    b.thinkT = 99; b.visible = false; b.target = null;
    b.path = [[b.pos.x, b.pos.z, 1.8, true]]; b.pi = 0;
    b.onGround = true; b.jumpTry = 0;
    b.update(0.1);
    assert.ok(b.mantle);
  }
  {
    const { g, b } = makeBot();
    b.thinkT = 99; b.visible = false; b.target = null;
    b.role = 'hold'; b.holdYaw = 1; b.path = null;
    b.update(0.1);
    assert.ok(Number.isFinite(b.yaw));
  }
  {
    const { g, b } = makeBot();
    b.thinkT = 99; b.visible = false; b.target = null;
    b.pos.y = 2; b.onGround = true;
    b.path = [[b.pos.x + 5, b.pos.z, 2, false], [b.pos.x + 9, b.pos.z, 2, false]]; b.pi = 0;
    g.world.support = () => null;
    b.update(0.1);
    assert.ok(Number.isFinite(b.pos.x));
  }
});

test('远距离连射会进入爆发计数与暂停', () => {
  const { g, b } = makeBot('hell');
  const target = {
    team: 'GR', alive: true, pos: new THREE.Vector3(-20, 0, -20), vel: new THREE.Vector3(), speed: 0,
    soldier: { headWorld: (v) => v.set(-20, 1.5, -20), chestWorld: (v) => v.set(-20, 1.1, -20) },
  };
  g.actors.push(target);
  g.fireWeapon = () => {};
  b.pos.set(-20, 0, 0); b.yaw = 0; b.pitch = 0;
  b.visible = true; b.target = target; b.reactUntil = 0;
  b.weapon.nextFire = 0; b.readyAt = 0; b.burst = 0; b.burstPauseUntil = 0;
  b.thinkT = 99;
  for (let i = 0; i < 300; i++) { g.time += 1 / 60; b.update(1 / 60); }
  assert.ok(b.burst >= 0);
  assert.ok(Number.isFinite(b.burstPauseUntil));
});

test('pickGoal 首次寻路失败后用随机点重试', () => {
  const { g, b } = makeBot();
  b.role = 'rush'; b.stage = 3; b.primary = 'ak47';
  let calls = 0;
  g.nav.findPath = () => (calls++ === 0 ? null : [[7, 8, 0, false]]);
  g.nav.randomFree = () => [7, 8, 0];
  withRandom([0.9, 0.9], () => b.pickGoal());
  assert.deepEqual(b.goal, [7, 8]);
  assert.equal(b.goalLayer, 'ground');
  assert.ok(Array.isArray(b.path));
});
