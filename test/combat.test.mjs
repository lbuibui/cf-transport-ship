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
