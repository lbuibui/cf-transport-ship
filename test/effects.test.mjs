import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { Effects } from '../src/effects.js';
import { World } from '../src/physics.js';

let restore = null;
before(() => { restore = installFakeDom(); });
after(() => restore?.());

function makeEffects() {
  const scene = new THREE.Scene();
  const T = {
    glow: {}, puff: {}, holeMetal: {}, holeWood: {}, blood: {}, scorch: {},
    flash: [{}, {}, {}],
  };
  const camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.05, 1000);
  camera.position.set(0, 1.6, 0);
  const world = new World();
  world.add({ x: 0, y: -0.5, z: 0, sx: 40, sy: 1, sz: 40 });
  world.build();
  return { fx: new Effects(scene, T, camera, world), scene, camera, world };
}

test('特效系统初始化粒子、贴花、曳光与灯光池', () => {
  const { fx, scene } = makeEffects();
  assert.ok(fx.add.points.isPoints);
  assert.ok(fx.smoke.points.isPoints);
  assert.equal(fx.decals.metal.max, 160);
  assert.equal(fx.decals.wood.max, 100);
  assert.equal(fx.decals.blood.max, 60);
  assert.equal(fx.decals.scorch.max, 12);
  assert.equal(fx.flashes.length, 12);
  assert.equal(fx.lights.length, 3);
  assert.ok(scene.children.length > 10);
});

test('枪口、点光与曳光会占用有限资源', () => {
  const { fx } = makeEffects();
  fx.muzzle(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), 1.5);
  assert.equal(fx.flashes[0].s.visible, true);
  assert.ok(fx.lights[0].l.intensity > 0);
  assert.ok(fx.smoke.p.length > 0);
  fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -10));
  assert.equal(fx.tracers.length, 1);
  fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -0.5));
  assert.equal(fx.tracers.length, 1); // 太短忽略
  for (let i = 0; i < 60; i++) fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -10));
  assert.equal(fx.tracers.length, fx.tracerMax);
});

test('命中不同材质写入对应贴花与粒子', () => {
  const { fx } = makeEffects();
  const p = new THREE.Vector3(0, 0.01, 0);
  const n = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3(0, 0, -1);
  const before = fx.smoke.p.length;
  fx.impact(p, n, 'flesh', d);
  assert.ok(fx.smoke.p.length > before);
  fx.impact(p, n, 'metal', d);
  assert.ok(fx.decals.metal.i > 0);
  fx.impact(p, n, 'wood', d);
  assert.ok(fx.decals.wood.i > 0);
  fx.impact(p, n, 'concrete', d);
  assert.ok(fx.smoke.p.length > before);
  fx.bloodSplat(p);
  assert.equal(fx.decals.blood.i, 1);
});

test('爆炸写入焦痕、冲击粒子并产生镜头震动', () => {
  const { fx } = makeEffects();
  const p = new THREE.Vector3(1, 0, 1);
  fx.explosion(p);
  assert.equal(fx.decals.scorch.i, 1);
  assert.ok(fx.add.p.length > 0);
  assert.ok(fx.smoke.p.length > 0);
  assert.equal(fx.shake, 1);
  assert.ok(fx.lights[0].l.intensity > 0);
});

test('环境烟囱与海鸥随时间更新，曳光会消失', () => {
  const { fx, camera } = makeEffects();
  fx.initAmbient(new THREE.Vector3(0, 25, 0));
  assert.equal(fx.birds.length, 6);
  fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -20));
  for (let i = 0; i < 10; i++) fx.update(0.05, i * 0.05, camera, 6.5);
  assert.equal(fx.tracers.length, 0);
  assert.ok(fx.smoke.p.length > 0);
  assert.ok(fx.birds[0].g.position.length() > 0);
  assert.ok(fx.shake < 1);
});
