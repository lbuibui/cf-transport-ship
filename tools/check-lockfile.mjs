// 校验 package-lock.json 里的依赖全部来自公开源。
// 背景：lockfile 一旦混入内网镜像地址，CI 在 GitHub runner 上会直接 ENOTFOUND。
// 用法：node tools/check-lockfile.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'package-lock.json');
const ALLOWED = new Set(['registry.npmjs.org']);

const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
const hosts = new Map();
for (const [name, pkg] of Object.entries(lock.packages || {})) {
  if (!pkg.resolved) continue;
  let host;
  try {
    host = new URL(pkg.resolved).host;
  } catch {
    host = `无法解析：${pkg.resolved}`;
  }
  if (!hosts.has(host)) hosts.set(host, []);
  hosts.get(host).push(`${name || '(根)'}@${pkg.version || '?'}`);
}

const bad = [...hosts].filter(([host]) => !ALLOWED.has(host));
console.log(`package-lock.json：${hosts.size} 个下载主机，${[...hosts.values()].reduce((n, v) => n + v.length, 0)} 条 resolved 记录`);
for (const [host, list] of [...hosts].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${ALLOWED.has(host) ? 'ok  ' : 'FAIL'} ${host} — ${list.length} 条`);
}

if (bad.length) {
  console.error(`\n发现 ${bad.length} 个非公开源主机，共 ${bad.reduce((n, [, v]) => n + v.length, 0)} 条：`);
  for (const [host, list] of bad) {
    console.error(`  ${host}`);
    for (const item of list.slice(0, 5)) console.error(`    ${item}`);
    if (list.length > 5) console.error(`    …另有 ${list.length - 5} 条`);
  }
  console.error('\n把这些地址改回 https://registry.npmjs.org/ 后再提交。');
  process.exit(1);
}
console.log('lockfile 只使用公开源');
