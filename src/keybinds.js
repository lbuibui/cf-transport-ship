// 键位定义：桌面客户端的可改键集合。
export const KEY_ACTIONS = [
  { id: 'fwd', label: '前进', def: 'KeyW' },
  { id: 'back', label: '后退', def: 'KeyS' },
  { id: 'left', label: '左移', def: 'KeyA' },
  { id: 'right', label: '右移', def: 'KeyD' },
  { id: 'jump', label: '跳跃', def: 'Space' },
  { id: 'crouch', label: '蹲下', def: 'KeyC' },
  { id: 'walk', label: '静步走', def: 'ShiftLeft' },
  { id: 'reload', label: '换弹', def: 'KeyR' },
  { id: 'inspect', label: '检视武器', def: 'KeyF' },
  { id: 'loadout', label: '更换主武器', def: 'KeyB' },
  { id: 'quick', label: '快切武器', def: 'KeyQ' },
];

export const DEFAULT_KEYS = Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.def]));

// 始终生效的备用键，不可改
export const KEY_ALIASES = {
  fwd: ['ArrowUp'], back: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], walk: ['ShiftRight'],
};

const NAMED = {
  Space: '空格', ShiftLeft: '左 Shift', ShiftRight: '右 Shift', ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl',
  AltLeft: '左 Alt', AltRight: '右 Alt', Escape: 'Esc', Tab: 'Tab', Enter: '回车', Backspace: '退格',
  Delete: 'Delete', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};

/** 把 KeyboardEvent.code 显示成短标签。 */
export function keyLabel(code) {
  if (!code) return '未设置';
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return '小键盘' + code.slice(6);
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}
