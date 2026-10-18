import test from 'node:test';
import assert from 'node:assert/strict';
import { WeaponState, currentSpread, jitterDir, recoilKick } from '../src/weapons.js';

const still = { speed: 0, onGround: true, crouch: false, scoped: false, scopeReady: false };

test('AWM 开镜稳定后散布远小于腰射', () => {
  const ws = new WeaponState('awm');
  const hip = currentSpread(ws, still);
  const scoped = currentSpread(ws, { ...still, scoped: true, scopeReady: true });
  assert.ok(scoped < 0.001, `开镜散布 ${scoped}`);
  assert.ok(scoped < hip / 50, `腰射 ${hip} / 开镜 ${scoped}`);
});

test('移动与腾空扩大散布', () => {
  const ws = new WeaponState('ak47');
  const base = currentSpread(ws, still);
  const moving = currentSpread(ws, { ...still, speed: 5.7 });
  const air = currentSpread(ws, { ...still, onGround: false });
  assert.ok(moving > base);
  assert.ok(air > base);
});

test('连射散布有上限', () => {
  const ws = new WeaponState('ak47');
  ws.spreadAcc = 99;
  const s = currentSpread(ws, { ...still, speed: 5.7, onGround: false });
  assert.ok(Number.isFinite(s) && s <= 0.2128 + 1e-9, `散布 ${s}`);
});

test('换弹从备弹扣减，满弹不能换', () => {
  const ws = new WeaponState('ak47');
  assert.equal(ws.canReload(), false);
  ws.mag = 0;
  ws.reloadUntil = 1;
  ws.finishReload();
  assert.equal(ws.mag, 30);
  assert.equal(ws.reserve, 60);
  assert.equal(ws.reloading, false);
});

test('AK 首发没有左右后坐，连射开始摆动', () => {
  const ws = new WeaponState('ak47');
  const [up, side] = recoilKick(ws, () => 0.5);
  assert.ok(up > 0);
  assert.equal(side, 0);
  ws.shotsFired = 8;
  const [, side2] = recoilKick(ws, () => 0.5);
  assert.notEqual(side2, 0);
});

test('jitterDir 保持单位长度且不超出锥角', () => {
  const dir = {
    x: 0, y: 0, z: -1,
    normalize() {
      const l = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= l; this.y /= l; this.z /= l;
      return this;
    },
  };
  const spread = 0.05;
  jitterDir(dir, spread, () => 0.5);
  assert.ok(Math.abs(Math.hypot(dir.x, dir.y, dir.z) - 1) < 1e-9);
  assert.ok(-dir.z >= Math.cos(spread) - 1e-9, `偏离 ${Math.acos(-dir.z)}`);
});
