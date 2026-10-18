import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { WEAPONS } from '../src/weapons.js';
import { buildGun, buildGunMerged } from '../src/guns.js';

let restore = null;
before(() => { restore = installFakeDom(); });
after(() => restore?.());

const IDS = Object.keys(WEAPONS);
const ANCHORS = {
  ak47: ['mag', 'grip', 'fore', 'muzzle', 'eject', 'magwell'],
  m4a1: ['mag', 'grip', 'fore', 'muzzle', 'eject', 'magwell'],
  awm: ['bolt', 'mag', 'grip', 'fore', 'muzzle', 'eject', 'magwell', 'scope'],
  mp5: ['mag', 'grip', 'fore', 'muzzle', 'eject', 'magwell'],
  deagle: ['slide', 'mag', 'grip', 'fore', 'muzzle', 'eject', 'magwell'],
  knife: ['grip', 'muzzle'],
  he: ['grip', 'muzzle'],
};

test('每把武器都能构建出带材质的模型', () => {
  for (const id of IDS) {
    const g = buildGun(id);
    assert.ok(g.isGroup, id);
    let meshes = 0;
    g.traverse((o) => { if (o.isMesh) { meshes++; assert.ok(o.material); } });
    assert.ok(meshes > 0, id);
  }
});

test('第三人称合并网格带锚点，且按 id 缓存几何体', () => {
  for (const id of IDS) {
    const a = buildGunMerged(id);
    const b = buildGunMerged(id);
    assert.ok(a.isMesh, id);
    assert.ok(a.geometry.attributes.position.count > 0, id);
    assert.ok(a.material.length > 0, id);
    assert.equal(a.geometry, b.geometry, id);
    assert.deepEqual(Object.keys(a.userData.anchors).sort(), ANCHORS[id].sort(), id);
  }
});
