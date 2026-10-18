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

test('init 失败时写入加载失败提示', async () => {
  const errors = [];
  const prevError = console.error;
  console.error = (...a) => errors.push(a);
  Game.prototype.init = async () => { throw new Error('boom'); };
  await import('../src/main.js');
  await tick();
  console.error = prevError;
  assert.equal(errors.length, 1);
  assert.ok(document.getElementById('loadTxt').textContent.includes('加载失败：boom'));
  assert.ok(document.getElementById('loadTxt').textContent.includes('最新版 Chrome'));
});
