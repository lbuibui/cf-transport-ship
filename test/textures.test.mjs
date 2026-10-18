import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { mulberry32, fbm, normalFromHeight, buildTextures } from '../src/textures.js';

let restore = null;
let T = null;

before(() => {
  restore = installFakeDom();
  T = buildTextures('low');
});
after(() => restore?.());

test('mulberry32 同种子可复现，输出在 [0,1)', () => {
  const a = mulberry32(1234), b = mulberry32(1234), c = mulberry32(1235);
  const seqA = Array.from({ length: 64 }, () => a());
  const seqB = Array.from({ length: 64 }, () => b());
  const seqC = Array.from({ length: 64 }, () => c());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('fbm 尺寸、取值范围与确定性', () => {
  const w = 32, h = 16;
  const a = fbm(w, h, 4, 2, 3, 99);
  const b = fbm(w, h, 4, 2, 3, 99);
  assert.equal(a.length, w * h);
  assert.deepEqual(Array.from(a), Array.from(b));
  for (const v of a) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
  assert.ok(Math.min(...a) < Math.max(...a));
});

test('fbm 的 persistence 影响高频层权重', () => {
  const low = fbm(32, 32, 2, 2, 4, 7, 0.2);
  const high = fbm(32, 32, 2, 2, 4, 7, 0.9);
  const spread = (arr) => Math.max(...arr) - Math.min(...arr);
  assert.notEqual(spread(low), spread(high));
});

test('normalFromHeight 输出尺寸与单位法线编码', () => {
  const w = 8, h = 8;
  const flat = new Float32Array(w * h).fill(0.5);
  const c = normalFromHeight(flat, w, h, 2);
  assert.equal(c.width, w);
  assert.equal(c.height, h);
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  assert.equal(img.data.length, w * h * 4);
  for (let i = 0; i < w * h; i++) {
    assert.equal(img.data[i * 4], 128);
    assert.equal(img.data[i * 4 + 1], 128);
    assert.equal(img.data[i * 4 + 2], 255);
    assert.equal(img.data[i * 4 + 3], 255);
  }

  const slope = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) slope[y * w + x] = x / (w - 1);
  const sc = normalFromHeight(slope, w, h, 2);
  const simg = sc.getContext('2d').getImageData(0, 0, w, h);
  assert.ok(simg.data[(3 * w + 4) * 4] < 128);
  assert.ok(simg.data[(3 * w + 4) * 4 + 2] > 200);
});

test('buildTextures 生成完整资源集合', () => {
  const keys = ['deck', 'containers', 'crates', 'hull', 'bulkhead', 'darkSteel', 'yellowSteel', 'redSteel',
    'greenSteel', 'superWall', 'fence', 'grating', 'holeMetal', 'holeWood', 'scorch', 'blood', 'flash',
    'flashSide', 'puff', 'glow', 'spark', 'signs'];
  for (const k of keys) assert.ok(T[k], k);
  assert.equal(T.containers.length, 8);
  assert.equal(T.crates.length, 6);
  assert.equal(T.flash.length, 3);
  assert.equal(T.crates.filter((c) => c.kind === 'wood').length, 4);
  assert.equal(T.crates.filter((c) => c.kind === 'metal').length, 2);
  for (const c of T.containers) {
    for (const k of ['side20', 'side40', 'n20', 'n40', 'door', 'doorN', 'roof', 'roofN']) assert.ok(c[k], k);
    assert.ok(c.color && Array.isArray(c.color.rgb));
  }
  assert.ok(T.deck.map && T.deck.normalMap && T.deck.roughnessMap);
  assert.ok(T.hull.map && T.hull.normalMap);
});
