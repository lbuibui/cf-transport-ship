import test from 'node:test';
import assert from 'node:assert/strict';
import { KEY_ACTIONS, DEFAULT_KEYS, KEY_ALIASES, keyLabel } from '../src/keybinds.js';

test('每个动作都有默认键，且默认键不重复', () => {
  const codes = KEY_ACTIONS.map((a) => a.def);
  assert.equal(new Set(codes).size, codes.length);
  for (const a of KEY_ACTIONS) assert.equal(DEFAULT_KEYS[a.id], a.def);
  assert.equal(Object.keys(DEFAULT_KEYS).length, KEY_ACTIONS.length);
});

test('备用键不占用默认键', () => {
  const defaults = new Set(Object.values(DEFAULT_KEYS));
  for (const list of Object.values(KEY_ALIASES)) {
    for (const code of list) assert.equal(defaults.has(code), false, code);
  }
});

test('keyLabel 覆盖命名键、字母、数字、小键盘与功能键', () => {
  assert.equal(keyLabel('Space'), '空格');
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('Digit7'), '7');
  assert.equal(keyLabel('Numpad4'), '小键盘4');
  assert.equal(keyLabel('F11'), 'F11');
  assert.equal(keyLabel('Comma'), ',');
  assert.equal(keyLabel('Escape'), 'Esc');
  assert.equal(keyLabel(''), '未设置');
  assert.equal(keyLabel(undefined), '未设置');
  assert.equal(keyLabel('Unknown'), 'Unknown');
});
