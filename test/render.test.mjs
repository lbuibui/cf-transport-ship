import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';
import { Renderer } from '../src/render.js';

let dom = null;
const original = { window: globalThis.window, document: globalThis.document };
before(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1600 });
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 900 });
  Object.defineProperty(dom.window, 'devicePixelRatio', { configurable: true, value: 2 });
});
after(() => {
  dom?.window.close(); dom = null;
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  }
});

function fake() {
  const calls = [];
  const r = Object.create(Renderer.prototype);
  r.renderer = { setSize: (...a) => calls.push(['renderer', ...a]) };
  r.composer = { setSize: (...a) => calls.push(['composer', ...a]), render: () => calls.push(['render']) };
  r.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 1000);
  r.vmCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 50);
  return { r, calls };
}

test('resize 同步画布、合成器与两台相机', () => {
  const { r, calls } = fake();
  Renderer.prototype.resize.call(r);
  assert.deepEqual(calls[0], ['renderer', 1600, 900, false]);
  assert.deepEqual(calls[1], ['composer', 1600, 900]);
  assert.ok(Math.abs(r.camera.aspect - 16 / 9) < 1e-9);
  assert.ok(Math.abs(r.vmCamera.aspect - 16 / 9) < 1e-9);
  assert.ok(Math.abs(r.camera.projectionMatrix.elements[0]) > 0);
});

test('render 委托给 EffectComposer', () => {
  const { r, calls } = fake();
  Renderer.prototype.render.call(r);
  assert.deepEqual(calls, [['render']]);
});

class FakeGL {
  constructor(opts) {
    this.opts = opts;
    this.shadowMap = {};
    this.pixelRatio = 1;
    this.sizes = [];
  }
  setPixelRatio(v) { this.pixelRatio = v; }
  getDrawingBufferSize(v) { return v.set(1600, 900); }
  setSize(...a) { this.sizes.push(a); }
}
class FakeComposer {
  constructor(r, rt) { this.renderer = r; this.rt = rt; this.passes = []; this.sizes = []; }
  addPass(p) { this.passes.push(p); }
  setSize(...a) { this.sizes.push(a); }
  render() { this.rendered = true; }
}
class FakePass { constructor(...a) { this.args = a; } }
class FakeBloom extends FakePass {}
class FakeShader extends FakePass {}
class FakeOutput extends FakePass {}

test('Renderer 构造按画质配置像素比、阴影、合成器与 Bloom', () => {
  for (const [quality, ratio] of [['high', 1.5], ['medium', 1.15], ['low', 1]]) {
    let gl = null, composer = null;
    const passes = [];
    const deps = {
      WebGLRenderer: class extends FakeGL { constructor(o) { super(o); gl = this; } },
      EffectComposer: class extends FakeComposer { constructor(r, rt) { super(r, rt); composer = this; } },
      RenderPass: class extends FakePass { constructor(...a) { super(...a); passes.push(['world', a]); } },
      UnrealBloomPass: class extends FakeBloom { constructor(...a) { super(...a); passes.push(['bloom', a]); } },
      ShaderPass: class extends FakeShader { constructor(...a) { super(...a); passes.push(['fx', a]); } },
      OutputPass: class extends FakeOutput { constructor(...a) { super(...a); passes.push(['out', a]); } },
    };
    const r = new Renderer({}, quality, deps);
    assert.equal(r.quality, quality);
    assert.equal(gl.pixelRatio, ratio);
    assert.equal(gl.shadowMap.enabled, true);
    assert.equal(gl.opts.antialias, false);
    assert.equal(composer.passes.length, quality === 'low' ? 4 : 5);
    assert.equal(passes.filter(([n]) => n === 'bloom').length, quality === 'low' ? 0 : 1);
    assert.equal(passes.filter(([n]) => n === 'fx').length, 1);
    r.render();
    assert.equal(composer.rendered, true);
    assert.ok(r.fx);
    assert.ok(r.worldPass && r.vmPass);
  }
});
