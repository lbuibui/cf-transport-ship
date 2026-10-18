import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/weapons.js';
import { armorMitigation, bulletDamage, splashDamage } from '../src/combat.js';

test('AK 爆头有甲仍一枪致死', () => {
  const dmg = bulletDamage(WEAPONS.ak47, WEAPONS.ak47.dmg, 0, 'head');
  const { hpDamage } = armorMitigation(100, dmg, 'head', WEAPONS.ak47);
  assert.ok(hpDamage > 100, `实际扣血 ${hpDamage}`);
});

test('M4 爆头有甲不致死', () => {
  const dmg = bulletDamage(WEAPONS.m4a1, WEAPONS.m4a1.dmg, 0, 'head');
  const { hpDamage } = armorMitigation(100, dmg, 'head', WEAPONS.m4a1);
  assert.ok(hpDamage > 90 && hpDamage < 100, `实际扣血 ${hpDamage}`);
});

test('AWM 远距离胸部仍致死', () => {
  const dmg = bulletDamage(WEAPONS.awm, WEAPONS.awm.dmg, 100, 'chest');
  const { hpDamage } = armorMitigation(100, dmg, 'chest', WEAPONS.awm);
  assert.ok(hpDamage > 100, `实际扣血 ${hpDamage}`);
});

test('腿部不吃护甲，护甲也不损耗', () => {
  const r = armorMitigation(100, 30, 'leg', WEAPONS.ak47);
  assert.equal(r.hpDamage, 30);
  assert.equal(r.armorLoss, 0);
});

test('护甲损耗不超过剩余护甲', () => {
  const r = armorMitigation(5, 100, 'chest', WEAPONS.ak47);
  assert.equal(r.armorLoss, 5);
  assert.equal(r.hpDamage, 78);
});

test('手雷按距离衰减，隔墙只剩 20%', () => {
  assert.equal(splashDamage(100, 10, 0, false), 100);
  assert.equal(splashDamage(100, 10, 10, false), 0);
  assert.equal(splashDamage(100, 10, 0, true), 20);
  assert.ok(splashDamage(100, 10, 5, false) < 100);
});

test('未提供武器定义时护甲穿透按 0.75 计算', () => {
  const r = armorMitigation(100, 40, 'chest', undefined);
  assert.equal(r.hpDamage, 30);
  assert.ok(Math.abs(r.armorLoss - 14) < 1e-9);
});

test('手臂与腹部受护甲保护，腿部不受保护', () => {
  for (const part of ['arm', 'stomach', 'chest']) {
    const r = armorMitigation(100, 30, part, WEAPONS.ak47);
    assert.ok(r.hpDamage < 30, part);
    assert.ok(r.armorLoss > 0, part);
  }
  const leg = armorMitigation(100, 30, 'leg', WEAPONS.ak47);
  assert.equal(leg.hpDamage, 30);
  assert.equal(leg.armorLoss, 0);
});

test('无护甲时不扣护甲，伤害全额生效', () => {
  const r = armorMitigation(0, 33, 'head', WEAPONS.m4a1);
  assert.equal(r.hpDamage, 33);
  assert.equal(r.armorLoss, 0);
});

test('子弹伤害随距离衰减，部位倍率分别生效', () => {
  const near = bulletDamage(WEAPONS.ak47, WEAPONS.ak47.dmg, 0, 'chest');
  const far = bulletDamage(WEAPONS.ak47, WEAPONS.ak47.dmg, 100, 'chest');
  assert.ok(far < near);
  assert.equal(near, WEAPONS.ak47.dmg);
  assert.equal(bulletDamage(WEAPONS.ak47, 10, 0, 'head'), 40);
  assert.ok(Math.abs(bulletDamage(WEAPONS.ak47, 10, 0, 'arm') - 7.8) < 1e-9);
  assert.ok(Math.abs(bulletDamage(WEAPONS.ak47, 10, 0, 'leg') - 7.8) < 1e-9);
  assert.equal(bulletDamage(WEAPONS.ak47, 10, 0, 'stomach'), 10);
});

test('手雷伤害在半径外为 0，隔墙固定 20%', () => {
  assert.equal(splashDamage(115, 7.5, 7.5, false), 0);
  assert.equal(splashDamage(115, 7.5, 8, true), 0);
  assert.equal(splashDamage(115, 7.5, 0, true), 23);
  assert.ok(splashDamage(115, 7.5, 3, false) > splashDamage(115, 7.5, 6, false));
});
