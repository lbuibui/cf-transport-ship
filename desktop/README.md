# 桌面客户端

Electron 壳把 `dist/index.html` 装进原生窗口并打包为安装包。游戏逻辑一行没动，桌面相关能力都通过 `?shell=desktop` 与 `window.desktopShell` 注入。

## 运行

```bash
npm run desktop        # 构建 + 启动桌面客户端
npm run desktop:dev    # 不压缩 + 打开开发者工具
npm run smoke:desktop        # Electron 端到端冒烟（Playwright 驱动真实壳）
npm run smoke:desktop:launch # Linux / Windows 启动冒烟，不依赖指针锁
```

## 打包

三个平台都能在当前这台 macOS 上交叉打包，脚本已经就绪：

```bash
npm run icon        # 重新生成 build/icon.png（需要本机 Chrome）
npm run dist:mac    # dmg + zip，arm64
npm run dist:win    # NSIS 安装包，x64
npm run dist:linux  # AppImage + deb，x64 与 arm64
```

| 产物 | 平台 | 架构 | 体积（约） |
|---|---|---|---|
| `cf-transport-ship-1.1.2-arm64.dmg` | macOS | arm64 | 126 MB |
| `cf-transport-ship.Setup.1.1.2.exe` | Windows | x64 | 109 MB |
| `cf-transport-ship-1.1.2.AppImage` | Linux | x64 | 122 MB |
| `cf-transport-ship_1.1.2_amd64.deb` | Debian / Ubuntu | x64 | 98 MB |

1.1.2 起随包附带 three.js、Electron 与 Chromium 的完整许可文本，压缩后体积约增加 2 MB。

Windows 只出 x64，Windows on ARM 交给系统仿真运行。需要原生 arm64 时执行 `npx electron-builder --win --arm64`，注意安装包会翻倍到约 207 MB。

## 平台差异

- **中文字体**：界面与角色名依赖 CJK 字体。macOS 与 Windows 自带，Linux 需要 `fonts-noto-cjk`，deb 已写进 `Recommends`。缺失时界面会出现方块字。
- **语音播报**：走 `speechSynthesis`。Windows 用系统 SAPI，macOS 用系统语音，Linux 需要 `speech-dispatcher`。不可用时播报静默，游戏不报错。
- **鼠标原始输入**：`requestPointerLock({ unadjustedMovement: true })` 在 macOS 与 Windows 生效；Linux 会拒绝，代码已回退到普通指针锁。
- **触屏设备**：桌面端强制关闭虚拟摇杆。触摸屏笔记本会把主指针报成 `coarse`，用它判断会误开触屏模式，导致鼠标不锁定。
- **Linux 窗口关联**：`package.json` 的 `desktopName` 与 `linux.syncDesktopName` 让窗口能对上 `.desktop` 图标。
- **Wayland**：指针锁在部分合成器上异常时，用 `--ozone-platform=x11` 启动。

## 签名状态

三个平台都没有签名，用户首次运行会遇到系统的未知发布者提示。

- macOS：dmg 需要右键打开，或 `xattr -dr com.apple.quarantine /Applications/cf-transport-ship.app`。要签名公证，删除 `electron-builder.yml` 里 `mac.identity: null`，并设置 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。
- Windows：安装时 SmartScreen 提示“未知发布者”。要签名需要代码签名证书，并在 `win` 下配置 `certificateFile` 与 `certificatePassword`。
- Linux：AppImage 直接 `chmod +x` 运行；deb 用 `sudo dpkg -i` 或 `apt install ./` 安装。

## 结构

| 文件 | 作用 |
|---|---|
| `desktop/main.js` | 主进程：窗口、`app://` 协议、菜单、窗口状态、日志、单实例 |
| `desktop/preload.cjs` | 沙箱预加载，暴露 `window.desktopShell` |
| `src/keybinds.js` | 可改键定义，HUD 与输入共用 |
| `electron-builder.yml` | 三平台打包配置 |
| `THIRD-PARTY-NOTICES.md` | three.js MIT 声明，随安装包分发 |

## 主进程与渲染进程的约定

- 页面固定从 `app://game/index.html?shell=desktop` 加载。`app://` 注册为标准安全协议，`localStorage` 与画质切换触发的 `location.reload()` 才能正常工作。
- 响应头带 CSP，只放行内联脚本与 `data:` 资源。
- `desktopShell` 接口：`getState`、`setWindowMode`、`setWindowSize`、`resetWindowSize`、`quit`、`openLogs`、`onWindowModeChange`。
- 窗口位置与尺寸存在 `userData/window-state.json`，配置与键位仍走 `localStorage`（同样在 `userData` 内）。窗口状态延迟 250ms 写盘；恢复时夹到当前显示器工作区，拔掉显示器不会把窗口留在屏外。
- 渲染进程 console 与窗口事件写入 `logs/main.log`。macOS 在 `~/Library/Logs/cf-transport-ship/`，Windows 在 `%APPDATA%\cf-transport-ship\logs\`，Linux 在 `~/.config/cf-transport-ship/logs/`。
- 冒烟测试用独立的 `userData` 目录，不动真实配置。

## 验证状态

`npm run smoke:desktop` 覆盖 19 项检查，在 macOS 上全部通过：预加载桥接、`app://` 起源、WebGL 2.0、桌面画质与键位读取、本地存储、坏配置回落、主进程 IPC、默认分辨率恢复、指针锁、改键面板、改键后输入、全屏与窗口往返、显示模式切换、对局模拟、二楼与箱顶寻路、渲染循环、coarse 主指针兜底、渲染进程零报错。打包后的 dmg 单独复测过 60 FPS 与指针锁。

Windows 与 Linux 的安装包做过结构与元数据检查：`app.asar` 载荷与 macOS 版一致，Windows 主程序是 PE32+ x86-64，deb 的 `control` 与 `.desktop` 正确。CI 另加 Linux（xvfb）与 Windows 的启动冒烟，覆盖壳、WebGL、对局模拟与渲染循环；发布流水线在出包后直接启动三平台 unpacked 产物再上传。**安装包本身仍未做人工安装/卸载复测**。

## 已知边界

- 全屏沿用各平台原生全屏，不做分辨率切换；`窗口分辨率` 只在窗口模式生效，屏幕放不下时会提示实际尺寸。
- 垂直同步由 Chromium 控制，`帧率上限` 只在主循环里降帧，不能突破显示器刷新率。
- 暂未接入自动更新与 Steam，等确定分发渠道再补。
