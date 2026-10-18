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

test('Collider 缓存旋转后的包围盒与局部坐标变换', () => {
  const w = new World();
  const c = w.add({ x: 3, y: 1, z: -2, sx: 4, sy: 2, sz: 2, yaw: Math.PI / 2 });
  assert.equal(c.hx, 2);
  assert.equal(c.hz, 1);
  assert.ok(Math.abs(c.minX - 2) < 1e-9);
  assert.ok(Math.abs(c.maxX - 4) < 1e-9);
  assert.ok(Math.abs(c.minZ - (-4)) < 1e-9);
  assert.ok(Math.abs(c.maxZ - 0) < 1e-9);
  const [lx, lz] = c.toLocal(3 + 2, -2 + 1);
  const [wx, wz] = c.toWorldDir(lx, lz);
  assert.ok(Math.abs(wx - 2) < 1e-9);
  assert.ok(Math.abs(wz - 1) < 1e-9);
  assert.equal(c.top, 2);
  assert.equal(c.bottom, 0);
});

test('射线起点在盒内时返回 t=0 与反方向法线', () => {
  const w = new World();
  const c = w.add({ x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 2 });
  const r = {};
  assert.equal(World.rayOBB(c, 0, 0, 0, 1, 0, 0, 10, r), true);
  assert.equal(r.t, 0);
  assert.equal(r.exit, 1);
  assert.equal(r.nx, -1);
  assert.ok(Math.abs(r.ny) < 1e-9);
  assert.ok(Math.abs(r.nz) < 1e-9);
});

test('raycast 按用途过滤 pass / sight / solid', () => {
  const w = new World();
  w.add({ x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 2, bullet: 'pass', sight: false });
  w.add({ x: 5, y: 0, z: 0, sx: 2, sy: 2, sz: 2 });
  w.build();
  const bullet = w.raycast(-5, 0, 0, 1, 0, 0, 20, 'bullet');
  assert.ok(bullet && Math.abs(bullet.t - 9) < 1e-9);
  const sight = w.raycast(-5, 0, 0, 1, 0, 0, 20, 'sight');
  assert.ok(sight && Math.abs(sight.t - 9) < 1e-9);
  const move = w.raycast(-5, 0, 0, 1, 0, 0, 20, 'move');
  assert.ok(move && Math.abs(move.t - 4) < 1e-9);
  assert.equal(w.raycast(-5, 0, 0, 1, 0, 0, 0.5, 'bullet'), null);
  assert.equal(w.raycast(-5, 0, 0, -1, 0, 0, 20, 'bullet'), null);
});

test('raycastAll 跳过 pass 并按距离排序', () => {
  const w = new World();
  w.add({ x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, bullet: 'pass' });
  w.add({ x: 3, y: 0, z: 0, sx: 1, sy: 1, sz: 1, bullet: 'pen' });
  w.add({ x: 6, y: 0, z: 0, sx: 1, sy: 1, sz: 1 });
  w.build();
  const hits = w.raycastAll(-5, 0, 0, 1, 0, 0, 20);
  assert.equal(hits.length, 2);
  assert.ok(hits[0].t < hits[1].t);
  assert.equal(hits[0].collider.bullet, 'pen');
  assert.ok(hits[0].exit > hits[0].t);
});

test('圆在盒内与斜向接触时的推出法线', () => {
  const w = new World();
  const c = w.add({ x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 2 });
  const out = {};
  assert.equal(World.circleOBB(c, 0, 0, 0.3, out), true);
  assert.ok(out.pen > 1);
  assert.ok(Math.abs(Math.hypot(out.nx, out.nz) - 1) < 1e-9);
  const diag = w.add({ x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 2, yaw: Math.PI / 4 });
  assert.equal(World.circleOBB(diag, 1.5, 0, 0.3, out), true);
  assert.ok(out.nx > 0);
  assert.equal(World.circleOBB(c, 5, 0, 0.3, out), false);
});

test('blocked 只检查与胶囊相交的实心体', () => {
  const w = new World();
  w.add({ x: 0, y: -0.5, z: 0, sx: 10, sy: 1, sz: 10 });
  w.add({ x: 2, y: 0.5, z: 0, sx: 1, sy: 1, sz: 1 });
  w.add({ x: 0, y: 0.5, z: 2, sx: 1, sy: 1, sz: 1, solid: false });
  w.build();
  assert.equal(w.blocked(2, 0, 0, 0.36, 1.8), true);
  assert.equal(w.blocked(0, 0, 2, 0.36, 1.8), false);
  assert.equal(w.blocked(0, 0, 0, 0.36, 1.8), false);
  // 头顶之上的箱子不影响站立
  assert.equal(w.blocked(2, 2.2, 0, 0.36, 1.8), false);
});

test('support 取脚下最高支撑面，忽略过高与不相交的体', () => {
  const w = new World();
  w.add({ x: 0, y: -0.5, z: 0, sx: 10, sy: 1, sz: 10 });
  w.add({ x: 0, y: 1, z: 0, sx: 2, sy: 1, sz: 2 });
  w.add({ x: 0, y: 5, z: 0, sx: 2, sy: 1, sz: 2 });
  w.add({ x: 0, y: 0.2, z: 3, sx: 1, sy: 0.6, sz: 1, solid: false });
  w.build();
  assert.equal(w.support(0, 0, 0.3, 3).y, 1.5);
  assert.equal(w.support(0, 0, 0.3, 1.4).y, 0);
  assert.equal(w.support(0, 3, 0.3, 3).y, 0);
  assert.equal(w.support(30, 30, 0.3, 3), null);
});

test('move 会被顶棚挡住、落地记录速度并处理掉出世界', () => {
  const w = new World();
  w.add({ x: 0, y: -0.5, z: 0, sx: 20, sy: 1, sz: 20 });
  w.add({ x: 0, y: 2.0, z: 0, sx: 4, sy: 0.2, sz: 4 });
  w.build();
  const ent = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 6, z: 0 }, radius: 0.36, height: 1.8, onGround: true, stepHeight: 0.42 };
  w.move(ent, 0.2);
  assert.ok(ent.pos.y <= 1.9 - 1.8 + 1e-9, `y=${ent.pos.y}`);
  assert.equal(ent.vel.y, 0);
  assert.equal(ent.onGround, false);

  const w2 = new World();
  w2.add({ x: 0, y: -0.5, z: 0, sx: 20, sy: 1, sz: 20 });
  w2.build();
  const fall = { pos: { x: 0, y: 3, z: 0 }, vel: { x: 0, y: -20, z: 0 }, radius: 0.36, height: 1.8, onGround: false, stepHeight: 0.42 };
  w2.move(fall, 0.2);
  assert.equal(fall.landed, true);
  assert.ok(fall.landSpeed > 0);
  assert.equal(fall.pos.y, 0);

});

test('导航拒绝被墙封死的目标，随机取点可返回空', () => {
  const w = new World();
  w.add({ x: 0, y: -0.5, z: 0, sx: 24, sy: 1, sz: 24 });
  // 3x3 的封闭房间，墙高 1.6
  for (const [cx, cz, sx, sz] of [[0, 1.6, 3.4, 0.2], [0, -1.6, 3.4, 0.2], [1.6, 0, 0.2, 3.4], [-1.6, 0, 0.2, 3.4]]) {
    w.add({ x: cx, y: 0.8, z: cz, sx, sy: 1.6, sz });
  }
  w.build();
  const nav = new SurfaceNav(w, -8, -8, 8, 8, 0.5, 0.42);
  assert.ok(nav.nodeH.length > 0);
  const inside = nav.nearestNode(0, 0, 0);
  assert.ok(inside >= 0);
  assert.equal(nav.findPath(-5, 0, 0, 0, 0, 0), null);
  assert.equal(nav.randomFree(() => 0.5, -5, -5, 5, 5, 9), null);
  assert.equal(nav.findPath(-5, 0, 0, 0, 0, 1.8), null);
});
