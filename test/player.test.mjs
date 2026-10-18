import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { World } from '../src/physics.js';
import { Player } from '../src/player.js';
import { DEFAULT_KEYS } from '../src/keybinds.js';

let restore = null;
before(() => { restore = installFakeDom(); });
after(() => restore?.());

function makePlayer() {
  const world = new World();
  world.add({ x: 0, y: -0.5, z: 0, sx: 80, sy: 1, sz: 80, mat: 'metal' });
  world.add({ x: 5, y: 1, z: 0, sx: 0.4, sy: 2, sz: 4 });
  world.build();
  const game = {
    renderer: { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(78, 16 / 9, 0.05, 1000) },
    world, actors: [], time: 0, frame: 0, playing: true, locked: true, touchMode: false,
    opts: { sens: 1, fov: 78, keys: { ...DEFAULT_KEYS } },
    fx: { shake: 0 },
    hud: { toast: () => {}, slots: () => {} },
    vm: { equip: () => {}, inspect: () => {} },
    onJump: () => {}, onLand: () => {}, onFootstep: () => {}, onSwitch: () => {},
    onReloadStart: () => {}, onReloadDone: () => {}, onScope: () => {}, onDryFire: () => {},
    onGrenadeStart: () => {}, melee: () => {}, fireWeapon: () => {}, throwGrenade: () => {},
    audio: {},
  };
  const p = new Player(game, { id: 1, name: '我', team: 'BL' });
  game.actors.push(p);
  p.spawn({ x: -3, z: 0, yaw: 0 });
  return { game, p, world };
}

test('玩家出生后重新对位相机，移动会改变位置与视角', () => {
  const { game, p } = makePlayer();
  assert.equal(p.camReady, false);
  p.keys.add('KeyW');
  for (let i = 0; i < 30; i++) p.update(1 / 60);
  assert.ok(p.pos.z < -0.1);
  assert.ok(Math.abs(game.renderer.camera.position.z - p.pos.z) < 0.5);
  const yaw = p.yaw;
  p.mouse.dx = 100;
  p.update(1 / 60);
  assert.ok(p.yaw < yaw);
  p.mouse.dy = -100;
  p.update(1 / 60);
  assert.ok(p.pitch > 0);
});

test('鼠标、蹲下、静步与快捷切枪输入生效', () => {
  const { game, p } = makePlayer();
  p.keys.add('KeyC');
  p.update(1 / 60);
  assert.equal(p.crouch, true);
  p.keys.delete('KeyC');
  p.keys.add('ShiftLeft');
  p.update(1 / 60);
  assert.equal(p.walk, true);
  p.pressed.add('Digit1');
  p.update(1 / 60);
  assert.equal(p.slot, 0);
  p.pressed.add('Digit2');
  p.update(1 / 60);
  assert.equal(p.slot, 1);
  p.mouse.wheel = 1;
  p.update(1 / 60);
  assert.notEqual(p.slot, 1);
  assert.equal(p.mouse.wheel, 0);
  assert.equal(game.playing, true);
});

test('狙击开镜时视角灵敏度随 FOV 缩放', () => {
  const { game, p } = makePlayer();
  p.giveLoadout('awm');
  p.yaw = 0;
  p.mouse.dx = 100;
  p.update(1 / 60);
  const normal = Math.abs(p.yaw);
  p.yaw = 0;
  p.scoped = 1;
  game.renderer.camera.fov = 30;
  p.mouse.dx = 100;
  p.update(1 / 60);
  const scoped = Math.abs(p.yaw);
  assert.ok(scoped < normal);
});

test('死亡镜头抬高并看向击杀者，复活后相机重新对位', () => {
  const { game, p } = makePlayer();
  const killer = {
    alive: true, pos: new THREE.Vector3(0, 0, -5),
    soldier: { headWorld: (v) => v.set(0, 1.6, -5) },
  };
  game.renderer.camera.position.set(p.pos.x, 1.6, p.pos.z);
  p.alive = false;
  p.startDeathCam(killer);
  assert.ok(p.deathCam);
  assert.equal(p.deathCam.killer, killer);
  for (let i = 0; i < 30; i++) p.update(1 / 60);
  assert.ok(game.renderer.camera.position.y > 1.0);
  p.spawn({ x: -3, z: 0, yaw: 0 });
  assert.equal(p.camReady, false);
  assert.equal(p.deathCam !== null, true);
});

test('按键绑定只注册一次，键位跟随配置', () => {
  const { game, p } = makePlayer();
  const added = [];
  const canvas = { addEventListener: (k) => added.push(k) };
  const win = globalThis.window;
  const prevAdd = win.addEventListener;
  win.addEventListener = (k) => added.push('win:' + k);
  p.bind(canvas);
  p.bind(canvas);
  assert.deepEqual(added.filter((k) => k === 'win:keydown').length, 1);
  assert.ok(added.includes('mousedown'));
  assert.equal(p.keyOf('fwd'), 'KeyW');
  game.opts.keys.fwd = 'KeyI';
  assert.equal(p.keyOf('fwd'), 'KeyI');
  p.keys.add('KeyI');
  assert.equal(p.down('fwd'), true);
  p.keys.clear();
  p.keys.add('ArrowUp');
  assert.equal(p.down('fwd'), true);
  win.addEventListener = prevAdd;
});
