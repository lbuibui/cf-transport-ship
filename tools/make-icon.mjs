// 生成桌面端图标：把内置的十字准星标志渲染成 1024px PNG。
// 用法：npm run icon（需要本机 Chrome / Edge，可用 CHROME_CHANNEL 指定）
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'build', 'icon.png');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#182834"/>
      <stop offset="1" stop-color="#0a1118"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="44%" r="58%">
      <stop offset="0" stop-color="#f5b321" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#f5b321" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="72" y="72" width="880" height="880" rx="196" fill="url(#bg)"/>
  <rect x="72" y="72" width="880" height="880" rx="196" fill="url(#glow)"/>
  <g fill="none" stroke="#f5b321" stroke-width="46" stroke-linecap="round">
    <circle cx="512" cy="512" r="214"/>
    <path d="M512 208v122M512 694v122M208 512h122M694 512h122"/>
  </g>
  <circle cx="512" cy="512" r="58" fill="#e0522e"/>
</svg>`;

const channels = process.env.CHROME_CHANNEL ? [process.env.CHROME_CHANNEL] : ['chrome', 'msedge'];
let browser = null;
let lastError = null;
for (const channel of channels) {
  try {
    browser = await chromium.launch({ channel });
    break;
  } catch (e) { lastError = e; }
}
if (!browser) {
  console.error(`无法启动浏览器：${lastError?.message || '未知错误'}。可用 CHROME_CHANNEL 指定通道。`);
  process.exit(1);
}

const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${SVG}`);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.locator('svg').screenshot({ path: out, omitBackground: true });
await browser.close();
console.log(`生成 ${out} ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
