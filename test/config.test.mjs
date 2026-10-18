import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_KEYS } from '../src/keybinds.js';
import { sanitizeKeys, sanitizeOpts, validResolution } from '../src/hud.js';

const BASE = {
  team: 'BL', primary: 'ak47', size: 6, diff: 'normal', goal: 50, tod: 'day', quality: 'high',
  sens: 1.0, fov: 78, vol: 0.8, windowMode: 'window', resolution: 'auto', frameCap: 0,
  keys: { ...DEFAULT_KEYS },
};

test('坏配置整体回落到默认值', () => {
  for (const raw of [null, undefined, 1, 'x', [], true]) {
    const o = sanitizeOpts(BASE, raw);
    assert.deepEqual(o.keys, DEFAULT_KEYS);
    assert.equal(o.team, 'BL');
    assert.equal(o.primary, 'ak47');
    assert.equal(o.size, 6);
    assert.equal(o.fov, 78);
  }
});

test('合法选项被保留，数字字符串被转成数字', () => {
  const o = sanitizeOpts(BASE, {
    team: 'GR', primary: 'awm', size: '8', diff: 'hell', goal: '100', tod: 'dusk',
    quality: 'low', windowMode: 'fullscreen', resolution: '1920x1080', frameCap: '144',
    sens: '1.5', fov: '90', vol: '0.25',
  });
  assert.equal(o.team, 'GR');
  assert.equal(o.primary, 'awm');
  assert.equal(o.size, 8);
  assert.equal(o.diff, 'hell');
  assert.equal(o.goal, 100);
  assert.equal(o.tod, 'dusk');
  assert.equal(o.quality, 'low');
  assert.equal(o.windowMode, 'fullscreen');
  assert.equal(o.resolution, '1920x1080');
  assert.equal(o.frameCap, 144);
  assert.equal(o.sens, 1.5);
  assert.equal(o.fov, 90);
  assert.equal(o.vol, 0.25);
});

test('非法枚举与数字回落，数值夹到范围内', () => {
  const o = sanitizeOpts(BASE, {
    team: 'XX', primary: 'railgun', size: 5, diff: 'nightmare', goal: 10, tod: 'night',
    quality: 'ultra', windowMode: 'borderless', resolution: '10x10', frameCap: 30,
    sens: 99, fov: 1, vol: -1,
  });
  assert.equal(o.team, 'BL');
  assert.equal(o.primary, 'ak47');
  assert.equal(o.size, 6);
  assert.equal(o.diff, 'normal');
  assert.equal(o.goal, 50);
  assert.equal(o.tod, 'day');
  assert.equal(o.quality, 'high');
  assert.equal(o.windowMode, 'window');
  assert.equal(o.resolution, 'auto');
  assert.equal(o.frameCap, 0);
  assert.equal(o.sens, 3);
  assert.equal(o.fov, 65);
  assert.equal(o.vol, 0);
  assert.equal(sanitizeOpts(BASE, { sens: -5, fov: 200, vol: 5 }).sens, 0.2);
  assert.equal(sanitizeOpts(BASE, { sens: -5, fov: 200, vol: 5 }).fov, 100);
  assert.equal(sanitizeOpts(BASE, { sens: -5, fov: 200, vol: 5 }).vol, 1);
});

test('分辨率格式与边界', () => {
  for (const v of ['auto', '800x600', '1920x1080', '7680x4320']) assert.equal(validResolution(v), true, v);
  for (const v of ['', 'auto ', '799x600', '1920', '1920X1080', '7681x4320', 'abc', null, 1080]) {
    assert.equal(validResolution(v), false, String(v));
  }
});

test('键位清洗：非法 code、重复键、占用默认键都拒绝', () => {
  const keys = sanitizeKeys({
    fwd: 'KeyI', back: 'KeyI', left: 'Not A Code', right: 42,
    jump: 'Space', crouch: 'KeyJ', walk: 'ShiftRight',
  });
  assert.equal(keys.fwd, 'KeyI');
  assert.equal(keys.back, DEFAULT_KEYS.back);
  assert.equal(keys.left, DEFAULT_KEYS.left);
  assert.equal(keys.right, DEFAULT_KEYS.right);
  assert.equal(keys.jump, DEFAULT_KEYS.jump);
  assert.equal(keys.crouch, 'KeyJ');
  assert.equal(keys.walk, 'ShiftRight');
  assert.deepEqual(sanitizeKeys(null), DEFAULT_KEYS);
  assert.deepEqual(sanitizeKeys('bad'), DEFAULT_KEYS);
});

test('键位清洗后仍是完整集合且无重复', () => {
  const keys = sanitizeKeys({ fwd: 'KeyZ', back: 'KeyX', left: 'KeyC', right: 'KeyV', jump: 'KeyB' });
  const values = Object.values(keys);
  assert.equal(values.length, Object.keys(DEFAULT_KEYS).length);
  assert.equal(new Set(values).size, values.length);
});
