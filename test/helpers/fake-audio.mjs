// 最小 WebAudio 桩：只实现 AudioSystem 实际调用的节点与参数接口。
// 不产生声音，也不推进时钟；测试手动设置 currentTime 驱动调度分支。

class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(v) { this.value = v; this.events.push('set'); return this; }
  linearRampToValueAtTime(v) { this.value = v; this.events.push('linear'); return this; }
  exponentialRampToValueAtTime(v) { this.value = v; this.events.push('exp'); return this; }
  setTargetAtTime(v) { this.value = v; this.events.push('target'); return this; }
  setValueCurveAtTime() { this.events.push('curve'); return this; }
  cancelScheduledValues() { this.events.push('cancel'); return this; }
}

class FakeNode {
  constructor(ctx, kind = 'node') {
    this.ctx = ctx; this.kind = kind;
    this.gain = new Param(1); this.frequency = new Param(440); this.Q = new Param(1);
    this.detune = new Param(0); this.playbackRate = new Param(1); this.pan = new Param(0);
    this.threshold = new Param(-24); this.knee = new Param(30); this.ratio = new Param(12);
    this.attack = new Param(0.003); this.release = new Param(0.25);
    this.positionX = new Param(0); this.positionY = new Param(0); this.positionZ = new Param(0);
    this.forwardX = new Param(0); this.forwardY = new Param(0); this.forwardZ = new Param(-1);
    this.upX = new Param(0); this.upY = new Param(1); this.upZ = new Param(0);
    this.orientationX = new Param(0); this.orientationY = new Param(0); this.orientationZ = new Param(0);
    this.buffer = null; this.curve = null; this.normalize = true;
    this.started = false; this.stopped = false; this.onended = null;
  }
  connect(dest) { this.dest = dest; return dest; }
  disconnect() {}
  start() { this.started = true; }
  stop() { this.stopped = true; }
  setPosition(x, y, z) { this.positionX.value = x; this.positionY.value = y; this.positionZ.value = z; }
  setOrientation(x, y, z) { this.orientationX.value = x; this.orientationY.value = y; this.orientationZ.value = z; }
  setPeriodicWave() {}
}

class FakeBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels; this.length = length; this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(i) { return this.data[i]; }
}

export class FakeAudioContext {
  constructor({ sampleRate = 48000, state = 'running' } = {}) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this.state = state;
    this.destination = new FakeNode(this, 'destination');
    this.listener = new FakeNode(this, 'listener');
    this.nodes = [];
  }
  createGain() { const n = new FakeNode(this, 'gain'); this.nodes.push(n); return n; }
  createBiquadFilter() { const n = new FakeNode(this, 'filter'); this.nodes.push(n); return n; }
  createStereoPanner() { const n = new FakeNode(this, 'stereo'); this.nodes.push(n); return n; }
  createPanner() { const n = new FakeNode(this, 'panner'); this.nodes.push(n); return n; }
  createBufferSource() { const n = new FakeNode(this, 'buffer'); this.nodes.push(n); return n; }
  createOscillator() { const n = new FakeNode(this, 'osc'); this.nodes.push(n); return n; }
  createWaveShaper() { const n = new FakeNode(this, 'shaper'); this.nodes.push(n); return n; }
  createDynamicsCompressor() { const n = new FakeNode(this, 'comp'); this.nodes.push(n); return n; }
  createConvolver() { const n = new FakeNode(this, 'conv'); this.nodes.push(n); return n; }
  createBuffer(channels, length, rate) { return new FakeBuffer(channels, length, rate); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

export function installFakeAudio() {
  const prev = {
    AudioContext: globalThis.AudioContext,
    OfflineAudioContext: globalThis.OfflineAudioContext,
    speechSynthesis: globalThis.speechSynthesis,
    SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
  };
  globalThis.AudioContext = FakeAudioContext;
  globalThis.OfflineAudioContext = FakeAudioContext;
  const spoken = [];
  globalThis.speechSynthesis = {
    speaking: false, pending: false, getVoices: () => [
      { name: 'Google US English', lang: 'en-US', localService: true },
      { name: 'Samantha', lang: 'en-US', localService: true },
      { name: 'David', lang: 'en-GB', localService: false },
    ],
    addEventListener() {}, cancel() { this.cancelled = true; }, speak(u) { spoken.push(u); },
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; }
  };
  return {
    spoken,
    restore() {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
      }
    },
  };
}
