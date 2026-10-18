// 无头测试用的最小 Canvas/DOM 桩。
// 只实现纹理、枪械、地图与角色代码实际调用的接口，不模拟像素结果。
// 目的：让程序化资源构建在 Node 里执行，捕获异常与结构错误。

class FakeGradient {
  addColorStop() {}
}

export class FakeCanvas {
  constructor() {
    this.width = 1;
    this.height = 1;
    this.style = {};
    this._pixels = null;
  }
  getContext() {
    if (!this.ctx) this.ctx = new FakeContext(this);
    return this.ctx;
  }
  toDataURL() { return 'data:image/png;base64,'; }
}

export class FakeContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.font = '10px sans-serif';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.globalCompositeOperation = 'source-over';
    this.globalAlpha = 1;
    this.lineWidth = 1;
    this.shadowColor = 'transparent';
    this.shadowBlur = 0;
    this.shadowOffsetX = 0;
    this.shadowOffsetY = 0;
  }
  createImageData(w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  getImageData(x, y, w, h) {
    const p = this.canvas._pixels;
    if (p && p.width === w && p.height === h) return p;
    return this.createImageData(w, h);
  }
  putImageData(img) {
    // 只为小画布保留像素，避免纹理构建时占用大量内存。
    if (img && img.data && img.data.length <= 65536) this.canvas._pixels = img;
  }
  createLinearGradient() { return new FakeGradient(); }
  createRadialGradient() { return new FakeGradient(); }
  measureText(text) { return { width: String(text).length * 8 }; }
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  clearRect() {}
  fillRect() {}
  strokeRect() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  arc() {}
  ellipse() {}
  fill() {}
  stroke() {}
  drawImage() {}
  setLineDash() {}
  fillText() {}
  strokeText() {}
}

/** 安装 document/window 桩；返回卸载函数。 */
export function installFakeDom() {
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const prevDevicePixelRatio = globalThis.devicePixelRatio;
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') return new FakeCanvas();
      return { style: {}, appendChild() {}, addEventListener() {} };
    },
    getElementById() {
      return { addEventListener() {}, style: {}, classList: { add() {}, remove() {}, toggle() {} } };
    },
  };
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.devicePixelRatio = 1;
  return () => {
    if (prevDocument === undefined) delete globalThis.document; else globalThis.document = prevDocument;
    if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
    if (prevDevicePixelRatio === undefined) delete globalThis.devicePixelRatio; else globalThis.devicePixelRatio = prevDevicePixelRatio;
  };
}
