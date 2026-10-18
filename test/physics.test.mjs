import test from 'node:test';
import assert from 'node:assert/strict';
import { World, SurfaceNav } from '../src/physics.js';

test('射线命中 OBB 的距离、出口与法线', () => {
  const w = new World();
  const box = w.add({ x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 2, mat: 'metal' });
  w.build();
  const hit = w.raycast(-5, 0, 0, 1, 0, 0, 10, 'bullet');
  assert.ok(hit);
  assert.equal(hit.t, 4);
  assert.equal(hit.exit, 6);
  assert.equal(hit.nx, -1);
  assert.equal(hit.collider, box);
});

test('raycastAll 按距离排序并带出每个出口', () => {
  const w = new World();
  w.add({ x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 2 });
  w.add({ x: 4, y: 0, z: 0, sx: 2, sy: 2, sz: 2 });
  w.build();
  const hits = w.raycastAll(-5, 0, 0, 1, 0, 0, 20);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].t, 4);
  assert.equal(hits[0].exit, 6);
  assert.equal(hits[1].t, 8);
  assert.equal(hits[1].exit, 10);
});

test('圆与 OBB 的推出法线', () => {
  const w = new World();
  const box = w.add({ x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 2 });
  w.build();
  assert.equal(box.hx, 1);
  const out = {};
  assert.equal(World.circleOBB(box, 1.1, 0, 0.3, out), true);
  assert.equal(out.nx, 1);
  assert.ok(Math.abs(out.pen - 0.2) < 1e-9);
  assert.equal(World.circleOBB(box, 2, 0, 0.3, out), false);
});

test('query 每次都返回独立数组', () => {
  const w = new World();
  w.add({ x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 2 });
  w.build();
  const a = w.query(-10, -10, 10, 10);
  const b = w.query(-10, -10, 10, 10);
  assert.notEqual(a, b);
  assert.equal(a.length, b.length);
});

test('move 能走上 0.3 米的台阶', () => {
  const w = new World();
  w.add({ x: 0, y: -0.5, z: 0, sx: 20, sy: 1, sz: 10, mat: 'metal' });
  w.add({ x: 1, y: 0.15, z: 0, sx: 1, sy: 0.3, sz: 4, mat: 'metal' });
  w.build();
  const ent = {
    pos: { x: -1, y: 0, z: 0 },
    vel: { x: 4, y: 0, z: 0 },
    radius: 0.36,
    height: 1.8,
    onGround: true,
    stepHeight: 0.42,
  };
  w.move(ent, 0.6);
  assert.ok(Math.abs(ent.pos.y - 0.3) < 1e-6, `y=${ent.pos.y}`);
  assert.ok(ent.onGround);
});

test('多层导航能绕过实心墙', () => {
  const w = new World();
  w.add({ x: 0, y: -0.5, z: 0, sx: 16, sy: 1, sz: 12, mat: 'metal', tag: 'deck' });
  w.add({ x: 0, y: 0.5, z: 0, sx: 1, sy: 1, sz: 6, mat: 'metal' });
  w.build();
  const nav = new SurfaceNav(w, -7, -5, 7, 5, 0.5, 0.42);
  const path = nav.findPath(-5, 0, 5, 0, 0, 0);
  assert.ok(path && path.length > 1, '没有路径');
  for (const [x, z, y] of path) {
    if (y < 0.5) assert.ok(Math.abs(x) >= 0.5 || Math.abs(z) >= 3, `穿墙点 ${x},${z}`);
  }
});
