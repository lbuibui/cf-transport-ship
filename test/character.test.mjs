import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { Soldier } from '../src/character.js';

let restore = null;
before(() => { restore = installFakeDom(); });
after(() => restore?.());

function make() {
  const s = new Soldier('BL');
  s.root.position.set(0, 0, 0);
  s.root.updateMatrixWorld(true);
  return s;
}

const sphere = (v) => Math.hypot(v.x, v.y, v.z);

test('士兵有完整骨架、命中盒与两种阵营外观', () => {
  for (const team of ['BL', 'GR']) {
    const s = new Soldier(team);
    assert.equal(s.bones.length, 19);
    assert.equal(s.invs.length, 12);
    assert.ok(s.mesh.isSkinnedMesh);
    assert.equal(s.root.children.includes(s.mesh), true);
    assert.equal(s.mesh.frustumCulled, false);
    s.dispose();
  }
});

test('枪械挂在胸骨，切换武器会替换模型', () => {
  const s = make();
  s.setWeapon('ak47');
  assert.equal(s.gunId, 'ak47');
  assert.equal(s.gun.parent, s.B.chest);
  const first = s.gun;
  s.setWeapon('ak47');
  assert.equal(s.gun, first);
  s.setWeapon('awm');
  assert.notEqual(s.gun, first);
  assert.equal(s.gunId, 'awm');
  s.dispose();
});

test('射线命中躯干、头部与未命中', () => {
  const s = make();
  s.setWeapon('ak47');
  s.update(1 / 60, { speed: 0, fwd: 1, crouch: false, pitch: 0, onGround: true });

  const chest = s.chestWorld(new THREE.Vector3());
  const from = chest.clone().add(new THREE.Vector3(0, 0, 2));
  const hit = s.hitTest(from, new THREE.Vector3(0, 0, -1), 10, 1);
  assert.ok(hit && ['chest', 'stomach'].includes(hit.part), hit && hit.part);
  assert.ok(hit.t > 0 && hit.t < 3);

  const head = s.headWorld(new THREE.Vector3());
  const headHit = s.hitTest(head.clone().add(new THREE.Vector3(0, 0, 2)), new THREE.Vector3(0, 0, -1), 10, 2);
  assert.equal(headHit && headHit.part, 'head');

  assert.equal(s.hitTest(new THREE.Vector3(4, 4, 4), new THREE.Vector3(1, 0, 0), 10, 3), null);
  assert.equal(s.hitTest(from, new THREE.Vector3(0, 0, -1), 0.01, 4), null);
});

test('枪口、头部与胸部世界坐标随根节点移动', () => {
  const s = make();
  s.setWeapon('ak47');
  s.update(1 / 60, { speed: 0, fwd: 1, crouch: false, pitch: 0, onGround: true });
  const head = s.headWorld(new THREE.Vector3());
  const chest = s.chestWorld(new THREE.Vector3());
  const muzzle = s.muzzleWorld(new THREE.Vector3());
  assert.ok(head.y > chest.y);
  assert.ok(sphere(muzzle.clone().sub(chest)) > 0.25);
  const before = head.clone();
  s.root.position.x += 2;
  s.root.updateMatrixWorld(true);
  const after = s.headWorld(new THREE.Vector3());
  assert.ok(Math.abs(after.x - before.x - 2) < 1e-6);
});

test('行走、下蹲、腾空与后坐都会更新骨骼姿态', () => {
  const s = make();
  s.setWeapon('ak47');
  const weaponZ = s.gun.position.z;
  s.update(0.1, { speed: 5, fwd: 1, crouch: false, pitch: 0.2, onGround: true });
  const walkHips = s.B.hips.position.y;
  assert.ok(Number.isFinite(walkHips));
  s.kick();
  s.update(0.05, { speed: 0, fwd: 1, crouch: true, pitch: -0.2, onGround: true, reloading: true });
  assert.ok(s.B.hips.position.y < walkHips);
  assert.ok(Number.isFinite(s.B.thighR.rotation.x));
  s.update(0.05, { speed: 0, fwd: -1, crouch: false, pitch: 0, onGround: false });
  assert.ok(s.gun.position.z < weaponZ + 0.2);
  s.dispose();
});

test('死亡动画朝向、淡出与重置', () => {
  const s = make();
  s.setWeapon('ak47');
  s.die(0, 1, true);
  s.updateDeath(0.5);
  assert.ok(Math.abs(s.mesh.rotation.x) > 0);
  assert.equal(s.gun.visible, false);
  s.updateDeath(6);
  assert.equal(s.gun.visible, false);
  assert.equal(s.material.transparent, true);
  assert.equal(s.material.opacity, 0);
  s.reset();
  assert.equal(s.deadT, -1);
  assert.equal(s.material.opacity, 1);
  assert.equal(s.gun.visible, true);
  s.dispose();
});

test('dispose 释放骨骼与材质并清空根节点', () => {
  const s = make();
  s.dispose();
  assert.equal(s.root.children.length, 0);
});

test('近战与手雷没有前握把时走简化左臂姿态', () => {
  const s = make();
  for (const id of ['knife', 'he']) {
    s.setWeapon(id);
    s.update(1 / 60, { speed: 0, fwd: 1, crouch: false, pitch: 0, onGround: true });
    assert.ok(Number.isFinite(s.B.upperArmL.rotation.x));
    assert.equal(s.B.upperArmL.rotation.x, 0.3);
  }
  s.dispose();
});
