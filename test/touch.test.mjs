import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { TouchControls } from '../src/touch.js';

let dom = null;
const original = { window: globalThis.window, document: globalThis.document, location: globalThis.location, matchMedia: globalThis.matchMedia };

function setup(search = '') {
  dom?.window.close();
  dom = new JSDOM('<!doctype html><html><body><div id="touch" class="hidden"></div></body></html>', {
    url: 'https://example.test/' + search,
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1280 });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.matchMedia = dom.window.matchMedia;
}

function uninstall() {
  dom?.window.close(); dom = null;
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  }
}

function makeGame(desktop = false) {
  return {
    desktop,
    player: {
      touch: { mx: 0, mz: 0, fire: false, jump: false, crouch: false },
      pressed: new Set(), mouse: { rp: false }, touchLook: null,
    },
  };
}

const touchEvent = (type, touches) => {
  const e = new dom.window.Event(type, { bubbles: true });
  Object.defineProperty(e, 'changedTouches', { value: touches });
  return e;
};

before(() => setup('?touch'));
after(() => uninstall());
beforeEach(() => setup('?touch'));

test('桌面端默认关闭触屏，?touch 或 coarse 指针可开启', () => {
  setup('');
  assert.equal(new TouchControls(makeGame(true)).enabled, false);
  assert.equal(new TouchControls(makeGame(false)).enabled, false);
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  globalThis.matchMedia = dom.window.matchMedia;
  assert.equal(new TouchControls(makeGame(false)).enabled, true);
  setup('?touch');
  assert.equal(new TouchControls(makeGame(true)).enabled, true);
});

test('启用后创建摇杆、七个按钮并显示控制层', () => {
  const g = makeGame(true);
  const t = new TouchControls(g);
  assert.equal(t.enabled, true);
  const root = document.querySelector('#touch');
  assert.equal(root.classList.contains('hidden'), false);
  assert.equal(root.querySelectorAll('.btn').length, 7);
  assert.equal(root.querySelectorAll('.pad').length, 2);
  assert.equal(root.querySelector('.btn').style.bottom !== '', true);
  dom.window.dispatchEvent(new dom.window.Event('resize'));
});

test('开火、跳跃、蹲下、换弹、切枪与开镜按钮控制玩家', () => {
  const g = makeGame(true);
  new TouchControls(g);
  const buttons = [...document.querySelectorAll('#touch .btn')];
  const labels = buttons.map((b) => b.textContent);
  const press = (label, index = 0) => {
    const list = buttons.filter((b) => b.textContent === label);
    list[index].dispatchEvent(touchEvent('touchstart', []));
  };
  press('开火', 0);
  assert.equal(g.player.touch.fire, true);
  assert.equal(g.player.touch.firePressed, true);
  buttons.find((b) => b.textContent === '开火').dispatchEvent(touchEvent('touchend', []));
  assert.equal(g.player.touch.fire, false);

  press('开火', 1);
  assert.equal(g.player.touch.fire, true);
  buttons.filter((b) => b.textContent === '开火')[1].dispatchEvent(touchEvent('touchend', []));

  press('跳');
  assert.equal(g.player.touch.jump, true);
  press('蹲');
  assert.equal(g.player.touch.crouch, true);
  press('R');
  assert.equal(g.player.pressed.has('KeyR'), true);
  press('切');
  assert.equal(g.player.pressed.has('KeyQ'), true);
  press('镜');
  assert.equal(g.player.mouse.rp, true);
  assert.ok(labels.includes('开火'));
});

test('虚拟摇杆移动与右侧滑动视角', () => {
  const g = makeGame(true);
  new TouchControls(g);
  const root = document.querySelector('#touch');
  const pad = root.querySelector('.pad');
  pad.getBoundingClientRect = () => ({ left: 28, top: 800, width: 140, height: 140 });
  dom.window.dispatchEvent(touchEvent('touchstart', [{ identifier: 1, clientX: 50, clientY: 850 }]));
  dom.window.dispatchEvent(touchEvent('touchmove', [{ identifier: 1, clientX: 120, clientY: 800 }]));
  assert.ok(g.player.touch.mx > 0);
  assert.ok(g.player.touch.mz > 0);
  dom.window.dispatchEvent(touchEvent('touchend', [{ identifier: 1, clientX: 120, clientY: 800 }]));
  assert.equal(g.player.touch.mx, 0);
  assert.equal(g.player.touch.mz, 0);

  dom.window.dispatchEvent(touchEvent('touchstart', [{ identifier: 2, clientX: 900, clientY: 400 }]));
  dom.window.dispatchEvent(touchEvent('touchmove', [{ identifier: 2, clientX: 920, clientY: 410 }]));
  assert.ok(g.player.touchLook && g.player.touchLook.x > 0 && g.player.touchLook.y > 0);
  dom.window.dispatchEvent(touchEvent('touchcancel', [{ identifier: 2 }]));
  const before = g.player.touchLook.x;
  dom.window.dispatchEvent(touchEvent('touchmove', [{ identifier: 2, clientX: 940, clientY: 420 }]));
  assert.equal(g.player.touchLook.x, before);
});
