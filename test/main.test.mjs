import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Game } from '../src/game.js';

let dom = null;
const original = { window: globalThis.window, document: globalThis.document, location: globalThis.location };
const originalInit = Game.prototype.init;

before(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="loadTxt"></div></body></html>', {
    url: 'https://example.test/?autostart', pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
});
after(() => {
  Game.prototype.init = originalInit;
  dom?.window.close(); dom = null;
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  }
});

const tick = () => new Promise((r) => setTimeout(r, 0));

test('入口创建 Game 并调用 init', async () => {
  Game.prototype.init = async function () {
    this.inited = true;
    globalThis.window.__game = this;
    return 'ok';
  };
  await import('../src/main.js');
  await tick();
  assert.equal(window.__game instanceof Game, true);
  assert.equal(window.__game.inited, true);
  assert.equal(window.__game.desktop, false);
  assert.equal(window.__game.qs.has('autostart'), true);
});

