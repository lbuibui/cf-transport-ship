import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, PRIMARIES, WeaponState, currentSpread, jitterDir, recoilKick } from '../src/weapons.js';

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

test('武器表字段完整，主武器都占 0 号槽', () => {
  for (const [id, d] of Object.entries(WEAPONS)) {
    assert.equal(d.id, id);
    assert.ok(d.name && d.hudName && d.sound, id);
    if (d.type !== 'melee') assert.ok(Number.isFinite(d.dmg) && d.dmg > 0, id);
    if (['rifle', 'sniper', 'smg'].includes(d.type)) {
      assert.ok(PRIMARIES.includes(id), id);
      assert.equal(d.slot, 0);
      assert.ok(d.mag > 0 && d.reserve > 0 && d.reload > 0 && d.rpm > 0, id);
      assert.ok(d.spread && d.recoil, id);
    }
    if (d.type === 'melee') assert.ok(d.dmgLight > 0 && d.dmgHeavy > d.dmgLight);
    if (d.type === 'grenade') assert.ok(d.radius > 0 && d.fuse > 0 && d.mag > 0);
  }
  assert.equal(new Set(Object.keys(WEAPONS)).size, Object.keys(WEAPONS).length);
  assert.equal(PRIMARIES.length, 4);
});

test('狙击未完成开镜时按腰射散布计算', () => {
  const ws = new WeaponState('awm');
  const notReady = currentSpread(ws, { ...still, scoped: true, scopeReady: false });
  const ready = currentSpread(ws, { ...still, scoped: true, scopeReady: true });
  assert.equal(notReady, ws.def.spread.base);
  assert.ok(ready < notReady);
});

test('下蹲只在落地时收紧散布', () => {
  const ws = new WeaponState('ak47');
  const standing = currentSpread(ws, still);
  assert.ok(currentSpread(ws, { ...still, crouch: true }) < standing);
  assert.equal(currentSpread(ws, { ...still, crouch: true, onGround: false }), currentSpread(ws, { ...still, onGround: false }));
});

test('无 spread 定义的武器返回 0，速度不会把扩散算成负数', () => {
  assert.equal(currentSpread(new WeaponState('knife'), still), 0);
  const ws = new WeaponState('ak47');
  assert.equal(currentSpread(ws, { ...still, speed: -10 }), ws.def.spread.base);
});

test('后坐力随连射增长但不超过上限', () => {
  const ws = new WeaponState('ak47');
  ws.shotsFired = 0;
  const first = recoilKick(ws, () => 0.5)[0];
  ws.shotsFired = 50;
  const later = recoilKick(ws, () => 0.5)[0];
  assert.ok(first > 0 && later > 0);
  assert.ok(later <= ws.def.recoil.up * 1.15 + 1e-9);
});

test('不同 patternSeed 产生不同的横向摆动', () => {
  const a = new WeaponState('ak47'), b = new WeaponState('ak47');
  a.patternSeed = 0; b.patternSeed = 3;
  a.shotsFired = b.shotsFired = 10;
  assert.notEqual(recoilKick(a, () => 0.5)[1], recoilKick(b, () => 0.5)[1]);
});

test('零扩散不改方向，大扩散仍保持单位长度', () => {
  const dir = { x: 0, y: 0, z: -1, normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; } };
  const before = { ...dir };
  assert.equal(jitterDir(dir, 0, () => 0.5), dir);
  assert.deepEqual(dir, before);
  jitterDir(dir, 3.14, () => 0.5);
  assert.ok(Math.abs(Math.hypot(dir.x, dir.y, dir.z) - 1) < 1e-9);
});

test('refill 恢复满弹并清除换弹与拉栓状态', () => {
  const ws = new WeaponState('awm');
  ws.mag = 0; ws.reserve = 0; ws.reloadUntil = 9; ws.boltUntil = 9;
  ws.refill();
  assert.equal(ws.mag, ws.def.mag);
  assert.equal(ws.reserve, ws.def.reserve);
  assert.equal(ws.reloadUntil, 0);
  assert.equal(ws.boltUntil, 0);
});

test('换弹条件覆盖满弹、无备弹、换弹中与非枪械', () => {
  const ak = new WeaponState('ak47');
  assert.equal(ak.canReload(), false);
  ak.mag = 1;
  assert.equal(ak.canReload(), true);
  ak.reserve = 0;
  assert.equal(ak.canReload(), false);
  ak.reserve = 10; ak.reloadUntil = 1;
  assert.equal(ak.canReload(), false);
  assert.equal(new WeaponState('knife').canReload(), false);
  assert.equal(new WeaponState('he').canReload(), false);
});

test('换弹只补到弹匣容量，剩余弹药留在备弹', () => {
  const ws = new WeaponState('ak47');
  ws.mag = 27; ws.reserve = 1;
  ws.finishReload();
  assert.equal(ws.mag, 28);
  assert.equal(ws.reserve, 0);
});
