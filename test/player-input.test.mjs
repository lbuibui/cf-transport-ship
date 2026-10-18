import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import { FakeContext } from './helpers/fake-dom.mjs';
import { Player } from '../src/player.js';
import { World } from '../src/physics.js';
import { DEFAULT_KEYS } from '../src/keybinds.js';

let dom = null;
const original = { window: globalThis.window, document: globalThis.document, location: globalThis.location, matchMedia: globalThis.matchMedia };

before(() => {
  dom = new JSDOM('<!doctype html><html><body><canvas id="c"></canvas><div id="ui"></div></body></html>', { url: 'https://example.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.matchMedia = dom.window.matchMedia = () => ({ matches: false });
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    if (!this.__ctx) this.__ctx = new FakeContext(this);
    return this.__ctx;
  };
});
after(() => {
  dom?.window.close(); dom = null;
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  }
});

function makePlayer() {
  const world = new World();
  world.add({ x: 0, y: -0.5, z: 0, sx: 60, sy: 1, sz: 60 });
  world.build();
  const game = {
    renderer: { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), vmScene: new THREE.Scene() },
    world, actors: [], time: 0, playing: true, locked: false, touchMode: false,
    opts: { sens: 1, fov: 78, keys: { ...DEFAULT_KEYS } },
    hud: { binding: null }, fx: { shake: 0 },
    vm: { equip: () => {}, inspect: () => {} },
    lock: () => { game.locked = true; },
    onJump() {}, onLand() {}, onFootstep() {}, onSwitch() {}, onReloadStart() {}, onReloadDone() {},
    onScope() {}, onDryFire() {}, onGrenadeStart() {}, melee() {}, fireWeapon() {}, throwGrenade() {},
  };
  const p = new Player(game, { id: 1, name: '我', team: 'BL' });
  p.spawn({ x: 0, z: 0, yaw: 0 });
  game.player = p;
  game.actors.push(p);
  p.bind(document.getElementById('c'));
  return { game, p };
}

const key = (type, code, extra = {}) => {
  const e = new dom.window.KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...extra });
  globalThis.window.dispatchEvent(e);
  return e;
};

test('键盘按下、抬起、重复键、改键面板抢占与失焦清理', () => {
  const { game, p } = makePlayer();
  const e = key('keydown', 'KeyW');
  assert.equal(e.defaultPrevented, true);
  assert.equal(p.keys.has('KeyW'), true);
  assert.equal(p.pressed.has('KeyW'), true);
  key('keyup', 'KeyW');
  assert.equal(p.keys.has('KeyW'), false);

  const repeat = key('keydown', 'KeyA', { repeat: true });
  assert.equal(repeat.defaultPrevented, true);
  assert.equal(p.keys.has('KeyA'), false);

  key('keydown', 'Tab');
  assert.equal(p.keys.has('Tab'), true);
  game.hud.binding = 'fwd';
  key('keydown', 'KeyD');
  assert.equal(p.keys.has('KeyD'), false);
  game.hud.binding = null;

  p.mouse.l = true; p.mouse.r = true;
  globalThis.window.dispatchEvent(new dom.window.Event('blur'));
  assert.equal(p.keys.size, 0);
  assert.equal(p.mouse.l, false);
  assert.equal(p.mouse.r, false);
  p.bind(document.getElementById('c'));
  assert.equal(game._inputBound, true);
});

test('鼠标按下、松开、移动与大位移过滤', () => {
  const { game, p } = makePlayer();
  const canvas = document.getElementById('c');
  game.locked = false;
  canvas.dispatchEvent(new dom.window.MouseEvent('mousedown', { button: 0, bubbles: true }));
  assert.equal(game.locked, true);
  assert.equal(p.mouse.l, false);

  game.locked = true;
  canvas.dispatchEvent(new dom.window.MouseEvent('mousedown', { button: 0, bubbles: true }));
  assert.equal(p.mouse.l, true);
  assert.equal(p.mouse.lp, true);
  canvas.dispatchEvent(new dom.window.MouseEvent('mousedown', { button: 2, bubbles: true }));
  assert.equal(p.mouse.r, true);
  assert.equal(p.mouse.rp, true);
  globalThis.window.dispatchEvent(new dom.window.MouseEvent('mouseup', { button: 0 }));
  assert.equal(p.mouse.l, false);
  globalThis.window.dispatchEvent(new dom.window.MouseEvent('mouseup', { button: 2 }));
  assert.equal(p.mouse.r, false);

  game.locked = false;
  const lockedMove = new dom.window.MouseEvent('mousemove', { bubbles: true });
  Object.defineProperty(lockedMove, 'movementX', { value: 10 });
  Object.defineProperty(lockedMove, 'movementY', { value: 10 });
  globalThis.window.dispatchEvent(lockedMove);
  assert.equal(p.mouse.dx, 0);

  game.locked = true;
  const move = new dom.window.MouseEvent('mousemove', { bubbles: true });
  Object.defineProperty(move, 'movementX', { value: 12 });
  Object.defineProperty(move, 'movementY', { value: -8 });
  globalThis.window.dispatchEvent(move);
  assert.equal(p.mouse.dx, 12);
  assert.equal(p.mouse.dy, -8);

  const huge = new dom.window.MouseEvent('mousemove', { bubbles: true });
  Object.defineProperty(huge, 'movementX', { value: 500 });
  Object.defineProperty(huge, 'movementY', { value: 0 });
  globalThis.window.dispatchEvent(huge);
  assert.equal(p.mouse.dx, 12);

  globalThis.window.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: 3, bubbles: true }));
  assert.equal(p.mouse.wheel, 1);
  const ctxMenu = new dom.window.Event('contextmenu', { bubbles: true, cancelable: true });
  globalThis.window.dispatchEvent(ctxMenu);
  assert.equal(ctxMenu.defaultPrevented, true);
});
