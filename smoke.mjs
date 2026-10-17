// 冒烟测试：无头浏览器加载 dist/index.html，检查 WebGL 画布与运行时报错。
// 用法：npm run build && npm run smoke
// 需要本机已安装 Chrome 或 Edge；可用 CHROME_CHANNEL=chrome 指定，用 SMOKE_WAIT=12000 延长观察时间。
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist', 'index.html');
const shots = path.join(here, '.tmp', 'smoke');
if (!fs.existsSync(dist)) {
  console.error(`缺少 ${dist}，请先运行 npm run build`);
  process.exit(1);
}

const channels = process.env.CHROME_CHANNEL ? [process.env.CHROME_CHANNEL] : ['chrome', 'msedge'];
let browser = null;
let lastError = null;
for (const channel of channels) {
  try {
    browser = await chromium.launch({ channel, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
    break;
  } catch (e) {
    lastError = e;
  }
}
if (!browser) {
  console.error(`无法启动浏览器：${lastError && lastError.message ? lastError.message : '未知错误'}。可用 CHROME_CHANNEL 指定通道。`);
  process.exit(1);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(`file://${dist}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(Number(process.env.SMOKE_WAIT || 8000));
const info = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
  return { canvas: !!c, gl: gl ? gl.getParameter(gl.VERSION) : null };
});
fs.mkdirSync(shots, { recursive: true });
await page.screenshot({ path: path.join(shots, 'browser.png') });
await browser.close();

console.log(`canvas=${info.canvas} gl=${info.gl} errors=${errors.length}`);
console.log(`截图 ${path.relative(here, path.join(shots, 'browser.png'))}`);
for (const e of errors.slice(0, 6)) console.log(`  ${e}`);
const ok = info.canvas && !!info.gl && errors.length === 0;
console.log(ok ? 'smoke OK' : 'smoke FAILED');
process.exit(ok ? 0 : 1);
