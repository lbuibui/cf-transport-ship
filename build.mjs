// 构建：esbuild 打包 -> 内联到单个 HTML
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const dev = process.argv.includes('--dev');
const res = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !dev,
  sourcemap: false,
  target: ['es2020'],
  write: false,
  // 保留依赖的 MIT 声明；剥离后分发会缺少 three.js 的版权与许可文本。
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = res.outputFiles[0].text;
const tpl = fs.readFileSync('src/index.html', 'utf8');
const css = fs.readFileSync('src/style.css', 'utf8');
const html = tpl.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js.replace(/<\/script>/g, '<\\/script>'));
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
// Electron 的 MIT 文本随 npm 包提供；Chromium 的完整通知只在 Electron 二进制下载后出现。
// 浏览器构建不强制下载 Electron，打包前用 npm run licenses:electron 补齐。
const electronLicense = 'node_modules/electron/LICENSE';
if (!fs.existsSync(electronLicense)) throw new Error(`缺少 ${electronLicense}，无法随包分发 Electron 许可`);
fs.copyFileSync(electronLicense, 'dist/LICENSE.electron.txt');
const chromiumLicense = 'node_modules/electron/dist/LICENSES.chromium.html';
if (fs.existsSync(chromiumLicense)) fs.copyFileSync(chromiumLicense, 'dist/LICENSES.chromium.html');
else fs.rmSync('dist/LICENSES.chromium.html', { force: true });
console.log('built dist/index.html', (html.length / 1024).toFixed(1) + ' KB');
