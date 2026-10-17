// 桌面壳：Electron 主进程。
// 职责：窗口与生命周期、app:// 协议、菜单、窗口状态、日志、单实例。
// 游戏逻辑全部在 dist/index.html 内，主进程不参与模拟。
import { app, BrowserWindow, Menu, ipcMain, protocol, screen, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === 'darwin';
const isSmoke = process.argv.includes('--smoke');
const isDev = process.argv.includes('--dev') || (!app.isPackaged && process.argv.includes('--devtools'));

// 必须在读取 userData / logs 路径之前设置，保证开发与打包后一致
app.setName('cf-transport-ship');
// 冒烟测试用独立目录，不污染真实配置与窗口状态
if (isSmoke) app.setPath('userData', path.join(app.getPath('temp'), 'cf-transport-ship-smoke'));

// 游戏目录：开发时是仓库 dist/，打包后是 app.asar 内的 dist/
const gameDir = path.join(app.getAppPath(), 'dist');
const INDEX = 'app://game/index.html?shell=desktop';

// 高 DPI 与音频策略：WebAudio 在无手势时也能初始化，避免偶发静音
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// app:// 必须是标准协议，localStorage 与 location.reload 才能正常工作
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

// ---------------- 日志 ----------------
let logFile = null;
function log(...parts) {
  const line = `${new Date().toISOString()} [main] ${parts.join(' ')}\n`;
  try {
    if (!logFile) {
      const dir = app.getPath('logs');
      fs.mkdirSync(dir, { recursive: true });
      logFile = path.join(dir, 'main.log');
    }
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) fs.renameSync(logFile, `${logFile}.1`);
    fs.appendFileSync(logFile, line);
  } catch { /* 磁盘不可写时忽略 */ }
  if (!app.isPackaged) process.stdout.write(line);
}

// ---------------- 窗口状态 ----------------
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
const DEFAULTS = { width: 1600, height: 900, x: undefined, y: undefined, maximized: false, fullscreen: false };

function loadState() {
  if (isSmoke) return { ...DEFAULTS, width: 1280, height: 720 };
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    return { ...DEFAULTS, ...raw };
  } catch { return { ...DEFAULTS }; }
}

function saveState(win) {
  if (!win || win.isDestroyed() || isSmoke) return;
  try {
    const b = win.getNormalBounds();
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen() }, null, 2));
  } catch (e) { log('保存窗口状态失败', String(e)); }
}

// ---------------- 窗口 ----------------
let win = null;
let restored = false;

function createWindow() {
  const s = loadState();
  win = new BrowserWindow({
    width: s.width, height: s.height, x: s.x, y: s.y,
    minWidth: 1024, minHeight: 640,
    show: false,
    title: 'CF-运输船',
    backgroundColor: '#05070a',
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    if (s.maximized) win.maximize();
    if (s.fullscreen) win.setFullScreen(true);
    win.show();
    restored = true;
    log(`窗口就绪 ${win.getContentSize().join('x')} fullscreen=${win.isFullScreen()}`);
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  // 状态与全屏变化同步到渲染进程，并写入磁盘
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, () => { if (restored) saveState(win); });
  win.on('enter-full-screen', () => pushWindowMode(true));
  win.on('leave-full-screen', () => pushWindowMode(false));
  win.on('close', () => saveState(win));
  win.on('closed', () => { win = null; });

  // 渲染进程日志集中到主日志文件
  win.webContents.on('console-message', (a, level, message) => {
    const msg = a && typeof a === 'object' && 'message' in a ? `${a.message} (${a.sourceId || ''}:${a.lineNumber || 0})` : `${message} (${level})`;
    log('[renderer]', msg);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    log('渲染进程退出', JSON.stringify(details));
    if (!isSmoke && win && !win.isDestroyed()) win.reload();
  });
  win.webContents.on('unresponsive', () => log('渲染进程无响应'));

  // 禁止应用内导航与新窗口，外链交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://game/')) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(INDEX);
}

function pushWindowMode(fullscreen) {
  if (win && !win.isDestroyed()) win.webContents.send('shell:window-mode', fullscreen ? 'fullscreen' : 'window');
}

// ---------------- 菜单 ----------------
function buildMenu() {
  const view = {
    label: '视图',
    submenu: [
      { role: 'togglefullscreen', label: '全屏' },
      { type: 'separator' },
      { role: 'reload', label: '重新加载' },
      { role: 'forceReload', label: '强制重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
    ],
  };
  const help = {
    label: '帮助',
    submenu: [
      { label: '打开日志目录', click: () => shell.openPath(app.getPath('logs')) },
      { label: '关于', click: () => shell.openPath(app.getPath('userData')) },
    ],
  };
  const template = isMac
    ? [{ role: 'appMenu' }, { role: 'editMenu' }, view, { role: 'windowMenu' }, help]
    : [{ label: '游戏', submenu: [{ role: 'quit', label: '退出' }] }, view, help];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------- IPC ----------------
function registerIpc() {
  ipcMain.handle('shell:get-state', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    fullscreen: !!win && win.isFullScreen(),
    contentSize: win ? win.getContentSize() : null,
    displays: screen.getAllDisplays().map((d) => ({
      id: d.id, label: d.label, width: d.size.width, height: d.size.height,
      scaleFactor: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id,
    })),
  }));
  ipcMain.on('shell:quit', () => app.quit());
  ipcMain.on('shell:open-logs', () => shell.openPath(app.getPath('logs')));
  ipcMain.handle('shell:set-window-mode', (_e, mode) => {
    if (!win) return false;
    win.setFullScreen(mode === 'fullscreen');
    return win.isFullScreen();
  });
  ipcMain.handle('shell:set-window-size', (_e, size) => {
    if (!win || !size || !size.width || !size.height) return null;
    if (win.isFullScreen()) win.setFullScreen(false);
    if (win.isMaximized()) win.unmaximize();
    win.setContentSize(Math.round(size.width), Math.round(size.height));
    saveState(win);
    const [width, height] = win.getContentSize();
    return { width, height };
  });
}

// ---------------- 启动 ----------------
if (!isSmoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    protocol.handle('app', async (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname) || '/index.html';
      const file = path.normalize(path.join(gameDir, rel === '/' ? '/index.html' : rel));
      if (!file.startsWith(gameDir)) return new Response('forbidden', { status: 403 });
      try {
        const body = await fs.promises.readFile(file);
        const ext = path.extname(file).toLowerCase();
        const type = ext === '.html' ? 'text/html; charset=utf-8'
          : ext === '.js' ? 'text/javascript; charset=utf-8'
            : ext === '.css' ? 'text/css; charset=utf-8'
              : ext === '.png' ? 'image/png' : 'application/octet-stream';
        return new Response(body, {
          headers: {
            'content-type': type,
            // 页面全部内联，只放行内联脚本与 data: 资源
            'content-security-policy': "default-src 'self' 'unsafe-inline' data: blob:; img-src 'self' data: blob:",
          },
        });
      } catch (e) {
        log('读取资源失败', rel, String(e));
        return new Response('not found', { status: 404 });
      }
    });

    registerIpc();
    buildMenu();
    createWindow();
    log(`启动 v${app.getVersion()} electron=${process.versions.electron} packaged=${app.isPackaged} gameDir=${gameDir}`);

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (!isMac) app.quit(); });
}
