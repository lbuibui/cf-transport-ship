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
// Electron 的预编译包里带有 Chromium 的完整许可文本，但 electron-builder 不会自动复制。
for (const [src, dst] of [['node_modules/electron/dist/LICENSE', 'LICENSE.electron.txt'], ['node_modules/electron/dist/LICENSES.chromium.html', 'LICENSES.chromium.html']]) {
  if (!fs.existsSync(src)) throw new Error(`缺少 ${src}，无法随包分发完整许可文本`);
  fs.copyFileSync(src, `dist/${dst}`);
}
console.log('built dist/index.html', (html.length / 1024).toFixed(1) + ' KB');
