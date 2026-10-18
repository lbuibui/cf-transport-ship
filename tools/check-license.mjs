// 构建产物与随包声明必须保留 three.js / Electron / Chromium 的许可文本。
// 背景：esbuild 的 legalComments:'none' 会剥离依赖声明，electron-builder 也不会自动复制 Electron 许可。
// 用法：node build.mjs && node tools/check-license.mjs
// 打包前加 --require-chromium：Chromium 通知只在 Electron 二进制下载后才存在。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dist = path.join(root, 'dist');
const html = path.join(dist, 'index.html');
const notices = path.join(root, 'THIRD-PARTY-NOTICES.md');

for (const f of [html, notices]) {
  if (!fs.existsSync(f)) {
    console.error(`缺少 ${f}，请先运行 npm run build`);
    process.exit(1);
  }
}
const requireChromium = process.argv.includes('--require-chromium');
const page = fs.readFileSync(html, 'utf8');
const notice = fs.readFileSync(notices, 'utf8');
const electronPath = path.join(dist, 'LICENSE.electron.txt');
const chromiumPath = path.join(dist, 'LICENSES.chromium.html');
const electron = fs.existsSync(electronPath) ? fs.readFileSync(electronPath, 'utf8') : '';
const chromium = fs.existsSync(chromiumPath) ? fs.readFileSync(chromiumPath, 'utf8') : '';

const checks = [
  ['构建产物含 three.js 版权', /Copyright \d{4}-\d{4} Three\.js Authors/.test(page)],
  ['构建产物含 MIT 标识', /SPDX-License-Identifier:\s*MIT/.test(page)],
  ['第三方声明含 three.js', /three\.js/i.test(notice)],
  ['第三方声明含 MIT 全文', /The MIT License/.test(notice) && /Permission is hereby granted/.test(notice)],
  ['Electron 许可随包', /Copyright \(c\) Electron contributors/.test(electron)],
  ['Chromium 通知随包', !!chromium && /<title>Credits<\/title>/.test(chromium)],
];
if (!fs.existsSync(chromiumPath) && !requireChromium) {
  console.log('  skip Chromium 通知：浏览器构建不下载 Electron；打包前运行 npm run licenses:electron');
  checks.pop();
}
console.log(`检查 ${path.relative(root, dist)} 与 THIRD-PARTY-NOTICES.md`);
for (const [name, ok] of checks) console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`\n${failed.length} 项许可检查失败`);
  process.exit(1);
}
console.log('许可声明完整');
