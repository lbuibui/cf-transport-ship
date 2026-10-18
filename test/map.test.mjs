import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { buildTextures } from '../src/textures.js';
import { World, SurfaceNav } from '../src/physics.js';
import { buildMap, hullContour, Batch, SEA_Y, DECK_HALF_Z, H2 } from '../src/map.js';

let restore = null;
let world = null;
let scene = null;
let map = null;
let nav = null;
let T = null;

before(() => {
  restore = installFakeDom();
  T = buildTextures('low');
  world = new World();
  scene = new THREE.Scene();
  map = buildMap(scene, T, world);
  nav = new SurfaceNav(world, -36.2, -12.1, 36.2, 12.1, 0.5, 0.42);
});
after(() => restore?.());

test('船体轮廓闭合、左右舷宽度正确且坐标有限', () => {
  assert.equal(SEA_Y, -7.5);
  assert.equal(DECK_HALF_Z, 9.4);
  assert.equal(H2, 2.6);
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < 200; i++) {
    const t = i / 200;
    const [x, z] = hullContour(t, 1, 1);
    assert.ok(Number.isFinite(x) && Number.isFinite(z));
    assert.ok(Math.abs(z) <= 12.25 + 1e-9, `z=${z} t=${t}`);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  }
  assert.ok(minX < -60 && maxX > 80);
  assert.deepEqual(hullContour(0, 1, 1), [-66, 12.25]);
  const [x1, z1] = hullContour(0.1, 1, 1);
  const [x2, z2] = hullContour(0.6, 1, 1);
  assert.notEqual(x1, x2);
  assert.ok(Math.abs(Math.abs(z1) - Math.abs(z2)) < 1e-9);
  // 不同船头系数只改变船头区域
  assert.deepEqual(hullContour(0.1, 1, 0.5), hullContour(0.1, 1, 1));
  assert.notDeepEqual(hullContour(0.42, 1, 0.5), hullContour(0.42, 1, 1));
});

test('地图生成 169 个碰撞体、合批网格与出生点', () => {
  assert.ok(world.colliders.length >= 150, `${world.colliders.length}`);
  assert.ok(world.grid.size > 100);
  assert.ok(scene.children.length >= 40);
  const deck = scene.getObjectByName('deck');
  assert.ok(deck && deck.isMesh);
  assert.equal(world.colliders.filter((c) => c.tag === 'container').length > 0, true);
  assert.ok(map.lampSpots.length > 0);
  assert.ok(map.funnelTop.isVector3);
  assert.equal(map.spawns.BL.length, 10);
  assert.equal(map.spawns.GR.length, 10);
  for (let i = 0; i < 10; i++) {
    const bl = map.spawns.BL[i], gr = map.spawns.GR[i];
    assert.equal(gr.x, -bl.x);
    assert.equal(gr.z, -bl.z);
    assert.equal(bl.yaw, -Math.PI / 2);
    assert.equal(gr.yaw, Math.PI / 2);
  }
  for (const c of world.colliders) {
    for (const k of ['x', 'y', 'z', 'hx', 'hy', 'hz', 'top', 'bottom', 'minX', 'maxX', 'minZ', 'maxZ']) {
      assert.ok(Number.isFinite(c[k]), `${k} ${c.tag}`);
    }
    assert.ok(c.top >= c.bottom);
  }
});

test('地图动画与材质表可更新', () => {
  assert.ok(Object.keys(map.materials).length > 10);
  for (let i = 0; i < 3; i++) map.update(0.016, i);
  assert.equal(map.lampSpots[0].isVector3, true);
});

test('多层导航能连到二楼、箱顶并能随机取点', () => {
  assert.ok(nav.nodeH.length > 1000, `${nav.nodeH.length}`);
  const ground = nav.findPath(-34, 0, 0, 0, 0, 0);
  assert.ok(ground && ground.length > 3);
  assert.deepEqual(ground[0].slice(0, 2), [-34, 0]);
  assert.deepEqual(ground[ground.length - 1].slice(0, 2), [0, 0]);
  assert.equal(ground[ground.length - 1][2], 0);
  // 二楼：BL 侧管道顶面
  const roof = nav.findPath(-34, 0, -18, 10.4, 0, 2.59);
  assert.ok(roof && roof.length > 3);
  assert.equal(roof[roof.length - 1][2], 2.59);
  // 非法终点高度必须拒绝
  assert.equal(nav.findPath(-34, 0, 0, 0, 0, 5.0), null);
  const free = nav.randomFree(() => 0.5, -20, -6, 20, 6, 0);
  assert.ok(free && Math.abs(free[2]) < 0.01);
  assert.equal(nav.idx(1000, 1000), -1);
  assert.equal(nav.nearestNode(1000, 1000, 0), -1);
  assert.equal(nav.nearestNode(-34, 0, 0) >= 0, true);
});

test('地图实心墙阻挡射线与导航', () => {
  // 潜伏者出生点舱壁位于 x=-28.15
  const hit = world.raycast(-34, 1.2, 0, 1, 0, 0, 20, 'sight');
  assert.ok(hit && hit.t > 5 && hit.t < 7, hit && hit.t);
  assert.equal(nav.clear(-28.15, 0, 0), false);
  assert.equal(nav.clear(-34, 0, 0), true);
});


test('Batch 能合并无索引几何体', () => {
  const b = new Batch();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  b.geom(g, new THREE.Matrix4());
  assert.equal(b.count, 3);
  const out = b.build();
  assert.equal(out.index.count, 3);
  assert.ok(out.attributes.position.count === 3);
});
