# CF-运输船

货轮场景的 3D 战术竞技游戏：团队死斗，潜伏者 vs 保卫者，机器人对战。基于 three.js，全部资源程序化生成，无外部素材、无运行时依赖。

## 玩法

- 目标：团队击杀数率先达到设定值（30 / 50 / 100）获胜，单局 10 分钟。
- 地图：船头船尾两处出生点，中路 V 形斜放集装箱，两侧 L 形箱堆，左右各有一条只从己方出生点进入的集装箱管道，管道顶上是架枪用的二楼。
- 武器：AK-47、M4A1、AWM、MP5，副武器沙漠之鹰、军刀、手雷。步枪连射上跳后左右摆动，狙击枪开镜才准。
- 机器人：简单 / 普通 / 困难 / 地狱四档，反应速度、瞄准误差、视野与走位都不同；会走楼梯上二楼，也会逐级跳上木箱和集装箱顶。
- 对战规模：4v4 / 6v6 / 8v8；时间可选白天或黄昏。

## 运行

浏览器直接打开构建产物：

```bash
npm ci
npm run build          # 生成 dist/index.html（单文件，可直接双击）
```

桌面客户端：

```bash
npm run desktop        # 构建并启动 Electron 壳
npm run desktop:dev    # 不压缩 + 开发者工具
```

## 校验

```bash
npm run smoke          # 无头浏览器：画布、WebGL、零报错
npm run smoke:desktop  # Electron 端到端 15 项检查
npm run check          # 上面三步依次执行
```

冒烟脚本把截图写到 `.tmp/smoke/`，与 `dist/` 里的构建产物分开。

## 打包

三个平台都能在 macOS 上交叉打包：

```bash
npm run dist:mac       # dmg + zip，arm64
npm run dist:win       # NSIS 安装包，x64
npm run dist:linux     # AppImage + deb，x64 与 arm64
```

产物写入 `release/`（已在 .gitignore 中），正式发布走 tag 驱动的 CI。

## 目录

| 路径 | 作用 |
|---|---|
| `src/` | 游戏本体：主循环、物理、寻路、地图、武器、机器人、HUD、程序化纹理与音效 |
| `desktop/` | Electron 壳：窗口、`app://` 协议、菜单、日志、单实例 |
| `build.mjs` | esbuild 打包并把 JS 与 CSS 内联进单个 HTML |
| `electron-builder.yml` | 三平台打包配置 |
| `smoke.mjs` / `smoke-desktop.mjs` | 浏览器冒烟与 Electron 端到端冒烟 |
| `tools/make-icon.mjs` | 用本机 Chrome 渲染应用图标 |

桌面端的平台差异、签名状态与已知边界见 [desktop/README.md](desktop/README.md)。

## 版本管理

- 版本号只写在 `package.json`，发布 tag 为 `v<version>`。
- `dist/`、`release/`、`.tmp/`、`node_modules/` 不入库。
- 发布流程：打 tag → CI 校验版本一致 → 构建与冒烟 → 三平台出包 → 产物与 sha256 挂到 GitHub Release。

## 许可

MIT，见 [LICENSE](LICENSE)。
