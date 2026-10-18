import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { World } from '../src/physics.js';
import { Actor, STAND_H, CROUCH_H } from '../src/actor.js';

let restore = null;
before(() => { restore = installFakeDom(); });
after(() => restore?.());

function makeGame() {
  const world = new World();
  world.add({ x: 0, y: -0.5, z: 0, sx: 60, sy: 1, sz: 60, mat: 'metal', tag: 'deck' });
  world.build();
  const events = [];
  const calls = { melee: [], throws: 0, shots: 0 };
  const game = {
    renderer: { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() },
    world, actors: [], time: 0, frame: 0,
    events,
    onJump: () => events.push('jump'),
    onLand: () => events.push('land'),
    onFootstep: () => events.push('step'),
    onSwitch: () => events.push('switch'),
    onReloadStart: () => events.push('reload'),
    onReloadDone: () => events.push('reloadDone'),
    onScope: () => events.push('scope'),
    onDryFire: () => events.push('dry'),
    onGrenadeStart: () => events.push('pin'),
    melee: (a, heavy) => calls.melee.push(heavy ? 'heavy' : 'light'),
    fireWeapon: () => { calls.shots++; },
    throwGrenade: () => { calls.throws++; },
    hud: { toast: () => {}, slots: () => {} },
    audio: {}, fx: { shake: 0 },
  };
  return { game, world, events, calls };
}

function makeActor(game, team = 'BL') {
  const a = new Actor(game, { id: game.actors.length + 1, name: 'T', team });
  game.actors.push(a);
  a.spawn({ x: -3, z: 0, yaw: 0 });
  return a;
}

test('出生重置生命、护甲、保护与武器', () => {
  const { game } = makeGame();
  const a = makeActor(game);
  assert.equal(a.hp, 100);
  assert.equal(a.armor, 100);
  assert.equal(a.alive, true);
  assert.equal(a.protectT, 3);
  assert.deepEqual(a.inv.map((w) => w.id), ['ak47', 'deagle', 'knife', 'he']);
  assert.equal(a.weapon.mag, 30);
  assert.equal(a.soldier.root.visible, true);
});

test('前向向量跟随偏航与俯仰', () => {
  const { game } = makeGame();
  const a = makeActor(game);
  const f = a.forward(new THREE.Vector3());
  assert.ok(Math.abs(f.z + 1) < 1e-9);
  a.yaw = Math.PI / 2;
  a.forward(f);
  assert.ok(Math.abs(f.x + 1) < 1e-9);
  a.pitch = Math.PI / 2;
  a.forward(f);
  assert.ok(f.y > 0.99);
});

test('地面移动有加速度、摩擦和最高速度', () => {
  const { game, events } = makeGame();
  const a = makeActor(game);
  a.move(1 / 60, 1, 0, false, false, false);
  const v1 = a.speed;
  assert.ok(v1 > 0 && v1 < 5.7);
  for (let i = 0; i < 60; i++) a.move(1 / 60, 1, 0, false, false, false);
  assert.ok(a.speed > 5.0 && a.speed <= 5.7);
  assert.ok(a.pos.x > 0);
  for (let i = 0; i < 30; i++) a.move(1 / 60, 0, 0, false, false, false);
  assert.ok(a.speed < 0.5);
  assert.ok(events.includes('step'));
});

test('跳跃、落地与下蹲切换', () => {
  const { game, events } = makeGame();
  const a = makeActor(game);
  a.move(1 / 60, 0, 0, true, false, false);
  assert.equal(a.onGround, false);
  assert.equal(a.vel.y > 0, true);
  assert.ok(events.includes('jump'));
  for (let i = 0; i < 90; i++) a.move(1 / 60, 0, 0, false, false, false);
  assert.equal(a.onGround, true);
  assert.ok(events.includes('land'));
  a.move(1 / 60, 0, 0, false, true, false);
  assert.equal(a.crouch, true);
  assert.equal(a.height, CROUCH_H);
  for (let i = 0; i < 30; i++) a.move(1 / 60, 0, 0, false, true, false);
  assert.ok(Math.abs(a.eyeH - 1.05) < 0.02);
  a.move(1 / 60, 0, 0, false, false, false);
  assert.equal(a.crouch, false);
  assert.equal(a.height, STAND_H);
});

test('低矮顶棚阻止起身', () => {
  const { game, world } = makeGame();
  const a = makeActor(game);
  a.move(1 / 60, 0, 0, false, true, false);
  world.add({ x: a.pos.x, y: 1.6, z: a.pos.z, sx: 2, sy: 0.2, sz: 2 });
  world.build();
  a.move(1 / 60, 0, 0, false, false, false);
  assert.equal(a.crouch, true);
  assert.equal(a.height, CROUCH_H);
});

test('台阶可上，实心墙可挡，队友可推开', () => {
  const { game, world } = makeGame();
  const a = makeActor(game);
  world.add({ x: a.pos.x + 1, y: 0.15, z: a.pos.z, sx: 1, sy: 0.3, sz: 2 });
  world.build();
  let maxY = 0;
  for (let i = 0; i < 60; i++) {
    a.move(1 / 60, 1, 0, false, false, false);
    maxY = Math.max(maxY, a.pos.y);
  }
  assert.ok(maxY >= 0.3 - 1e-6, `y=${maxY}`);
  const wallX = a.pos.x + 3;
  world.add({ x: wallX, y: 1, z: a.pos.z, sx: 0.4, sy: 2, sz: 4 });
  world.build();
  for (let i = 0; i < 120; i++) a.move(1 / 60, 1, 0, false, false, false);
  assert.ok(a.pos.x < wallX, `x=${a.pos.x} wall=${wallX}`);
  assert.ok(a.pos.x > wallX - 0.6);

  const b = makeActor(game, 'GR');
  b.pos.set(a.pos.x + 0.2, a.pos.y, a.pos.z);
  const before = a.pos.x;
  a.move(1 / 60, 0, 0, false, false, false);
  assert.ok(a.pos.x <= before);
});

test('掉出世界会被拉回甲板', () => {
  const { game } = makeGame();
  const a = makeActor(game);
  a.pos.y = -4;
  a.vel.set(0, -1, 0);
  a.move(1 / 60, 0, 0, false, false, false);
  assert.equal(a.pos.y, 0.1);
  assert.equal(a.vel.y, 0);
});

test('切枪有拔枪时间，霰弹类空手雷不可切', () => {
  const { game, events } = makeGame();
  const a = makeActor(game);
  game.time = 10;
  a.weaponUpdate(1 / 60, { sw: 1 });
  assert.equal(a.slot, 1);
  assert.equal(a.weapon.id, 'deagle');
  assert.equal(a.readyAt, 10 + a.weapon.def.draw);
  assert.ok(events.includes('switch'));
  const shots = a.stats.shots;
  a.weaponUpdate(1 / 60, { fire: true, firePressed: true });
  assert.equal(a.stats.shots, shots);
  a.inv[3].mag = 0;
  a.weaponUpdate(1 / 60, { sw: 3 });
  assert.equal(a.slot, 1);
});

test('全自动与半自动的开火节奏不同', () => {
  const { game, calls } = makeGame();
  const a = makeActor(game);
  a.readyAt = 0;
  a.weapon.nextFire = 0;
  a.weaponUpdate(1 / 60, { fire: true, firePressed: true });
  assert.equal(a.weapon.mag, 29);
  assert.equal(calls.shots, 1);
  a.weaponUpdate(1 / 60, { fire: true });
  assert.equal(a.weapon.mag, 29);
  game.time += 0.2;
  a.weaponUpdate(1 / 60, { fire: true });
  assert.equal(a.weapon.mag, 28);
  assert.equal(calls.shots, 2);
  assert.ok(a.punchP > 0);

  a.weaponUpdate(1 / 60, { sw: 1 });
  a.readyAt = 0;
  a.weapon.nextFire = 0;
  const mag = a.weapon.mag;
  a.weaponUpdate(1 / 60, { fire: true });
  assert.equal(a.weapon.mag, mag);
  a.weaponUpdate(1 / 60, { fire: true, firePressed: true });
  assert.equal(a.weapon.mag, mag - 1);
});

test('空仓开火触发空枪提示并自动换弹', () => {
  const { game, events } = makeGame();
  const a = makeActor(game);
  a.readyAt = 0; a.weapon.nextFire = 0; a.weapon.mag = 1;
  a.weaponUpdate(1 / 60, { fire: true, firePressed: true });
  assert.equal(a.weapon.mag, 0);
  assert.ok(a.weapon.reloading);
  assert.ok(events.includes('reload'));
  assert.equal(a.weapon.reloadUntil, game.time + a.weapon.def.reload);
  game.time += a.weapon.def.reload;
  a.weaponUpdate(1 / 60, {});
  assert.equal(a.weapon.mag, 30);
  assert.equal(a.weapon.reserve, 60);
  assert.ok(events.includes('reloadDone'));

  a.weapon.mag = 0;
  a.weapon.reloadUntil = 0;
  a.weapon.reserve = 0;
  a.readyAt = 0; a.weapon.nextFire = 0;
  a.weaponUpdate(1 / 60, { fire: true, firePressed: true });
  assert.ok(events.includes('dry'));
});

test('手动换弹与满弹不能换', () => {
  const { game } = makeGame();
  const a = makeActor(game);
  a.readyAt = 0;
  a.weaponUpdate(1 / 60, { reload: true });
  assert.equal(a.weapon.reloading, false);
  a.weapon.mag = 10;
  a.weaponUpdate(1 / 60, { reload: true });
  assert.equal(a.weapon.reloading, true);
  game.time += a.weapon.def.reload;
  a.weaponUpdate(1 / 60, {});
  assert.equal(a.weapon.mag, 30);
  assert.equal(a.weapon.reserve, 70);
});

test('狙击镜三档循环、拉栓与自动回镜', () => {
  const { game, events } = makeGame();
  const a = makeActor(game);
  a.giveLoadout('awm');
  assert.equal(a.weapon.id, 'awm');
  a.readyAt = 0;
  a.weaponUpdate(1 / 60, { altPressed: true });
  assert.equal(a.scoped, 1);
  assert.equal(a.scopeReady, false);
  game.time += 0.2;
  a.weaponUpdate(1 / 60, {});
  assert.equal(a.scopeReady, true);
  a.weaponUpdate(1 / 60, { altPressed: true });
  assert.equal(a.scoped, 2);
  a.weaponUpdate(1 / 60, { altPressed: true });
  assert.equal(a.scoped, 0);
  assert.ok(events.filter((e) => e === 'scope').length >= 3);

  a.weapon.nextFire = 0;
  game.time += 1;
  a.weaponUpdate(1 / 60, { altPressed: true }); // scoped=1
  game.time += 0.2;
  a.weaponUpdate(1 / 60, {});
  assert.equal(a.scopeReady, true);
  a.weapon.nextFire = 0;
  a.weaponUpdate(1 / 60, { fire: true, firePressed: true });
  assert.equal(a.weapon.mag, 4);
  assert.equal(a.scoped, 0);
  assert.ok(a.weapon.boltUntil > game.time);
  assert.equal(a.reScope, 1);
  game.time += a.weapon.def.bolt + 0.01;
  a.weaponUpdate(1 / 60, {});
  assert.equal(a.scoped, 1);
});

test('军刀轻击与重击共用冷却', () => {
  const { game, calls } = makeGame();
  const a = makeActor(game);
  a.weaponUpdate(1 / 60, { sw: 2 });
  a.readyAt = 0;
  a.weapon.nextFire = 0;
  a.weaponUpdate(1 / 60, { fire: true, firePressed: true });
  assert.deepEqual(calls.melee, ['light']);
  a.weaponUpdate(1 / 60, { alt: true, altPressed: true });
  assert.deepEqual(calls.melee, ['light']);
  game.time += 1;
  a.weaponUpdate(1 / 60, { alt: true, altPressed: true });
  assert.deepEqual(calls.melee, ['light', 'heavy']);
});

test('手雷投掷延迟、消耗与自动切回', () => {
  const { game, calls, events } = makeGame();
  const a = makeActor(game);
  a.weaponUpdate(1 / 60, { sw: 3 });
  a.readyAt = 0;
  a.weaponUpdate(1 / 60, { fire: true, firePressed: true });
  assert.equal(a.pendingThrow > 0, true);
  assert.ok(events.includes('pin'));
  assert.equal(calls.throws, 0);
  game.time += 0.6;
  a.weaponUpdate(0.6, {});
  assert.equal(calls.throws, 1);
  assert.equal(a.inv[3].mag, 0);
  assert.ok(a.autoSwitchAt > 0);
  game.time += 0.5;
  a.weaponUpdate(1 / 60, {});
  assert.notEqual(a.slot, 3);
});
