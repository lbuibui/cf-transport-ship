// 打包前补齐 Electron / Chromium 许可文本。
// Electron 44 不在 npm postinstall 里下载二进制，require('electron') 才会按平台下载。
// 用法：node build.mjs && node tools/copy-electron-licenses.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dist = path.join(root, 'dist');

try {
  createRequire(import.meta.url)('electron');
} catch (e) {
  console.error(`下载 Electron 失败：${e?.message || e}`);
  process.exit(1);
}

const files = [
  ['node_modules/electron/LICENSE', 'LICENSE.electron.txt'],
  ['node_modules/electron/dist/LICENSE', 'LICENSE.electron.txt'],
  ['node_modules/electron/dist/LICENSES.chromium.html', 'LICENSES.chromium.html'],
];
for (const [src, dst] of files) {
  const file = path.join(root, src);
  if (!fs.existsSync(file)) {
    console.error(`缺少 ${src}`);
    process.exit(1);
  }
  fs.mkdirSync(dist, { recursive: true });
  fs.copyFileSync(file, path.join(dist, dst));
}
console.log('已复制 Electron / Chromium 许可文本');
