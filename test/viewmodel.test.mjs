import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { ViewModel } from '../src/viewmodel.js';

let restore = null;
before(() => { restore = installFakeDom(); });
after(() => restore?.());

function makeVM() {
  const scene = new THREE.Scene();
  const T = { flash: [{}, {}, {}], flashSide: {} };
  return new ViewModel(scene, T, 'BL');
}

const st = (over = {}) => ({
  speed: 5, onGround: true, crouch: false, lookDX: 3, lookDY: -2,
  sunDirCam: new THREE.Vector3(0.3, 1, 0.2), light: 1, indoor: 0, ...over,
});

test('第一人称模型初始化灯光、手臂、弹壳与枪口火焰', () => {
  const vm = makeVM();
  assert.ok(vm.rig.isGroup);
  assert.equal(vm.shells.length, 14);
  assert.equal(vm.flash.children.length, 3);
  assert.ok(vm.arms.R && vm.arms.L);
  assert.equal(vm.rig.visible, true);
});

test('切换阵营只改袖标与袖口颜色', () => {
  const vm = makeVM();
  const bl = vm.cuffMat.color.getHex();
  vm.setTeam('GR');
  assert.notEqual(vm.cuffMat.color.getHex(), bl);
  vm.setTeam('BL');
  assert.equal(vm.cuffMat.color.getHex(), 0xa81818);
});

test('装备、开火、抛壳与切枪', () => {
  const vm = makeVM();
  vm.equip('ak47', 0.6);
  assert.equal(vm.id, 'ak47');
  assert.ok(vm.cur && vm.cur.parent === vm.holder);
  assert.ok(vm.parts.muzzle);
  assert.equal(vm.drawT, 0);
  assert.equal(vm.drawDur, 0.6);
  vm.fire();
  assert.equal(vm.flash.visible, true);
  assert.ok(vm.kickV > 0);
  assert.ok(vm.shells.some((s) => s.mesh.visible));
  for (let i = 0; i < 80; i++) vm.update(1 / 60, st());
  assert.equal(vm.flash.visible, false);
  assert.ok(vm.shells.some((s) => s.life < 0.9));
  const first = vm.cur;
  vm.equip('awm');
  assert.notEqual(vm.cur, first);
  assert.equal(first.parent, null);
  vm.fire();
  assert.equal(vm.anim.type, 'bolt');
  for (let i = 0; i < 90 && vm.anim; i++) vm.update(1 / 30, st());
  assert.equal(vm.anim, null);
});

test('换弹、近战、投掷与检视动画都能推进到结束', () => {
  const vm = makeVM();
  vm.equip('ak47');
  for (const start of [
    () => vm.reload(2.4, true),
    () => vm.melee(false),
    () => vm.melee(true),
    () => vm.throwNade(),
    () => vm.inspect(),
  ]) {
    start();
    assert.ok(vm.anim);
    for (let i = 0; i < 120 && vm.anim; i++) vm.update(1 / 30, st());
    assert.equal(vm.anim, null);
  }
});

test('cancelAnim 清除动作但保留拉栓，resetParts 恢复部件位置', () => {
  const vm = makeVM();
  vm.equip('ak47');
  vm.reload(2.4, true);
  const rest = vm.partRest.mag.p.clone();
  vm.parts.mag.position.x += 1;
  vm.cancelAnim();
  assert.equal(vm.anim, null);
  assert.deepEqual(vm.parts.mag.position.toArray(), rest.toArray());
  vm.anim = { type: 'bolt', t: 0, dur: 1 };
  vm.cancelAnim();
  assert.notEqual(vm.anim, null);
});

test('行走、下蹲、腾空、检视与室内光照更新不产生 NaN', () => {
  const vm = makeVM();
  vm.equip('m4a1');
  const states = [
    st(),
    st({ speed: 0, onGround: false, crouch: true }),
    st({ speed: 2, onGround: true, indoor: 1, light: 0.2 }),
    st({ lookDX: 500, lookDY: -500 }),
  ];
  for (let round = 0; round < 5; round++) {
    for (const s of states) {
      for (let i = 0; i < 10; i++) vm.update(1 / 60, s);
      assert.ok(vm.holder.position.toArray().every(Number.isFinite));
      assert.ok(vm.holder.rotation.toArray().slice(0, 3).every(Number.isFinite));
    }
  }
  vm.setVisible(false);
  assert.equal(vm.rig.visible, false);
});
