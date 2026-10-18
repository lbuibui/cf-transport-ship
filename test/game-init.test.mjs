import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import { FakeContext } from './helpers/fake-dom.mjs';
import { Game } from '../src/game.js';

const origFromScene = THREE.PMREMGenerator.prototype.fromScene;
let dom = null;
const original = {
  window: globalThis.window, document: globalThis.document, location: globalThis.location,
  matchMedia: globalThis.matchMedia, requestAnimationFrame: globalThis.requestAnimationFrame,
};

class FakeRenderer {
  constructor() {
    this.scene = new THREE.Scene();
    this.vmScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.05, 1000);
    this.fx = { uniforms: {
      uTime: { value: 0 }, uDamage: { value: 0 }, uLowHP: { value: 0 }, uDeath: { value: 0 },
      uProtect: { value: 0 }, uVignette: { value: 0.3 },
    } };
    this.renderer = {
      toneMappingExposure: 0.75,
      getClearColor: (c) => c,
      getClearAlpha: () => 0,
      setClearColor() {}, setRenderTarget() {}, clear() {}, render() {},
      readRenderTargetPixels() {}, compile() {},
    };
    this.rendered = 0;
  }
  render() { this.rendered++; }
}

before(() => {
  dom = new JSDOM('<!doctype html><html><body><canvas id="c"></canvas><div id="ui"></div></body></html>', {
    url: 'https://example.test/?q=high', pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.matchMedia = dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    if (!this.__ctx) this.__ctx = new FakeContext(this);
    return this.__ctx;
  };
  dom.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  THREE.PMREMGenerator.prototype.fromScene = () => ({ texture: new THREE.Texture(), dispose() {} });
});
after(() => {
  THREE.PMREMGenerator.prototype.fromScene = origFromScene;
  dom?.window.close(); dom = null;
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  }
});

function installRaf() {
  let frames = 0;
  globalThis.requestAnimationFrame = (cb) => {
    if (frames++ > 20) return 1;
    cb(1000 + frames * 16);
    return 1;
  };
}

test('init 用注入渲染器完成资源、地图、环境、HUD 与主循环装配', async () => {
  installRaf();
  const game = new Game({ Renderer: FakeRenderer });
  await game.init();
  assert.ok(game.hud);
  assert.ok(game.opts);
  assert.equal(game.opts.quality, 'high');
  assert.ok(game.renderer instanceof FakeRenderer);
  assert.ok(game.T && game.T.containers.length === 8);
  assert.ok(game.world && game.world.colliders.length > 100);
  assert.ok(game.map && game.map.spawns.BL.length === 10);
  assert.ok(game.env && game.env.sunDir);
  assert.ok(game.fx && game.fx.decals);
  assert.ok(game.vm && game.vm.rig);
  assert.ok(game.nav && game.nav.nodeH.length > 1000);
  assert.equal(game.touchMode, false);
  assert.ok(game.last > 0);
  assert.equal(window.__game, game);
  assert.equal(game.hud.el.menu.classList.contains('hidden'), false);
  assert.equal(Object.keys(game.hud.icons).length, 7);
  assert.ok(game.renderer.scene.children.length > 20);
  assert.ok(game.renderer.renderer.toneMappingExposure > 0);
  assert.equal(game.qs.get('q'), 'high');
});


test('桌面壳状态读取成功、模式同步与失败回落', async () => {
  installRaf();
  const game = new Game({ Renderer: FakeRenderer });
  game.desktop = true;
  let changed = null;
  game.shell = {
    getState: async () => ({ fullscreen: true, version: '1.2.3', electron: '44', platform: 'darwin' }),
    onWindowModeChange: (cb) => { changed = cb; },
  };
  await game.init();
  assert.equal(game.opts.windowMode, 'fullscreen');
  assert.ok(game.hud.desktopInfo);
  changed('window');
  assert.equal(game.opts.windowMode, 'window');

  installRaf();
  const broken = new Game({ Renderer: FakeRenderer });
  broken.desktop = true;
  broken.shell = { getState: async () => { throw new Error('shell down'); } };
  const warn = console.warn; const warns = [];
  console.warn = (...a) => warns.push(a);
  await broken.init();
  console.warn = warn;
  assert.equal(warns.length, 1);
  assert.ok(broken.hud);
});
