// 预加载脚本：只暴露桌面壳需要的最小 API。
// 沙箱内运行，因此使用 CommonJS。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopShell', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  getState: () => ipcRenderer.invoke('shell:get-state'),
  setWindowMode: (mode) => ipcRenderer.invoke('shell:set-window-mode', mode),
  setWindowSize: (width, height) => ipcRenderer.invoke('shell:set-window-size', { width, height }),
  quit: () => ipcRenderer.send('shell:quit'),
  openLogs: () => ipcRenderer.send('shell:open-logs'),
  onWindowModeChange: (cb) => {
    ipcRenderer.on('shell:window-mode', (_e, mode) => cb(mode));
  },
});
