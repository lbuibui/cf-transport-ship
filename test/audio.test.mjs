import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AudioSystem } from '../src/audio.js';
import { FakeAudioContext, installFakeAudio } from './helpers/fake-audio.mjs';

let fake = null;
before(() => { fake = installFakeAudio(); });
after(() => fake?.restore());

function makeAudio() {
  const a = new AudioSystem();
  const ctx = new FakeAudioContext();
  assert.equal(a.init(ctx), true);
  assert.equal(a.ready, true);
  return { a, ctx };
}

const P = (x = 1, y = 2, z = 3) => ({ x, y, z });

test('初始化建图、音量、监听者与重复初始化', () => {
  const { a, ctx } = makeAudio();
  assert.equal(a._offline, true); // 使用 OfflineAudioContext 桩，避免定时器
  assert.ok(a._master && a._sfx && a._ambBus && a._voiceBus && a._conv);
  a.setVolumes({ master: 0.5, sfx: 0.4, ambient: 0.3, voice: 0.2 });
  a.setVolumes({ master: 2, sfx: -1, ambient: 'x' });
  a.setVolumes(null);
  a.setListener(P(), P(0, 0, -1), P(0, 1, 0));
  assert.equal(a._L.x, 1);
  assert.equal(ctx.listener.positionX.value, 1);
  // 旧式监听者：删掉 AudioParam 分支
  ctx.listener.positionX = null;
  a.setListener(P(4, 5, 6), P(0, 0, -1), P(0, 1, 0));
  assert.equal(ctx.listener.positionX, null);
  // 再次 init 只恢复上下文
  ctx.state = 'suspended';
  a._offline = false;
  assert.equal(a.init(ctx), true);
  assert.equal(ctx.state, 'running');
});

test('初始化失败会关闭上下文并回落', () => {
  const a = new AudioSystem();
  const bad = new FakeAudioContext();
  bad.createGain = () => { throw new Error('no audio'); };
  assert.equal(a.init(bad), false);
  assert.equal(a.ctx, null);
  assert.equal(bad.state, 'running');
  assert.equal(a.ready, false);
  const prevAC = globalThis.AudioContext;
  globalThis.AudioContext = class extends FakeAudioContext {
    createGain() { throw new Error('auto audio failed'); }
  };
  const b = new AudioSystem();
  assert.equal(b.init(), false);
  assert.equal(b.ctx, null);
  globalThis.AudioContext = prevAC;
});

test('所有枪声、消音与近战/手雷投掷入口', () => {
  const { a } = makeAudio();
  for (const id of ['ak47', 'm4a1', 'awm', 'mp5', 'deagle', 'knife', 'grenade']) {
    assert.doesNotThrow(() => a.playShot(id, null));
    assert.doesNotThrow(() => a.playShot(id, P(5, 1, 0)));
  }
  a.playShot('ak47', P(50, 1, 0), { suppressed: true });
  a.playShot('ak47', null, { suppressed: true });
  a.playShot('unknown', null);
  for (const stage of ['draw', 'magout', 'magin', 'bolt', 'boltback', 'boltforward', 'other']) {
    a.playReload('ak47', stage);
    a.playReload('awm', stage);
  }
  a.playDryFire();
  a.playKnife('light', 'flesh', null);
  a.playKnife('heavy', 'wall', P(1, 1, 1));
  a.playKnife('light', 'miss', null);
  a.playGrenadePin();
  a.playGrenadeThrow();
  a.playGrenadeBounce(P());
  a.playExplosion(P());
  a.playBulletWhiz(P());
  a.playShellDrop(P());
  a.playWeaponSwitch('ak47');
  a.playWeaponSwitch('awm');
  a.playWeaponSwitch('knife');
  a.playWeaponSwitch('he');
  a.playWeaponSwitch('grenade');
  a.playWeaponSwitch('deagle');
  a.playScope(true);
  a.playScope(false);
});

test('脚步声覆盖材质与轻重、落地、跳跃与受伤死亡', () => {
  const { a } = makeAudio();
  for (const surface of ['metal', 'wood', 'grate', 'container', 'unknown']) {
    a.playFootstep(null, surface, { run: false, crouch: false });
    a.playFootstep(P(), surface, { run: true, crouch: true });
  }
  a.playLand(null, 'metal', 1);
  a.playLand(P(), 'wood', 0.2);
  a.playJump(null);
  a.playJump(P());
  for (const mat of ['metal', 'wood', 'concrete', 'flesh', 'unknown']) {
    a.playImpact(P(), mat);
  }
  a.playRicochet(P());
  a.playHitmarker(true);
  a.playHitmarker(false);
  a.playKillConfirm(true);
  a.playKillConfirm(false);
  a.playHurt(10);
  a.playHurt(200);
  a.playDeath(P());
  a.playUI('click'); a.playUI('buy'); a.playUI('start'); a.playUI('roundEnd'); a.playUI('other');
  a.playUI('hover'); a.playUI('countdown');
  a.setLowHealth(true);
  a.setLowHealth(false);
  a.setLowHealth(true);
  a.setLowHealth(true); // 状态不变，提前返回
});

test('环境音、心跳、随机环境事件与回收', () => {
  const { a, ctx } = makeAudio();
  a.startAmbient();
  assert.ok(a._amb);
  a.startAmbient(); // 已存在，直接返回
  a.setLowHealth(true);
  ctx.currentTime = 10;
  for (let i = 0; i < 100; i++) {
    ctx.currentTime += 0.5;
    if (a._amb) {
      a._amb.nGust = 0; a._amb.nGull = 0; a._amb.nCreak = 0; a._amb.nSplash = 0; a._amb.nHorn = 0;
    }
    a.update(0.5);
  }
  // 让旧 voice 超过 end+3 被回收
  for (const v of a.voices) v.end = ctx.currentTime - 10;
  a.update(0.5);
  a.setLowHealth(false);
  a.stopAmbient();
  assert.ok(a._amb.timer);
  a.startAmbient(); // 淡出中重新开启
  assert.equal(a._amb.stopping, false);
  a.stopAmbient();
  clearTimeout(a._amb.timer);
  a._amb = null;
  a.stopAmbient();
  ctx.state = 'closed';
  assert.equal(a.ready, false);
  a.update(1);
  a.startAmbient();
  a.stopAmbient();
});

test('播报、语音与徽章音', async () => {
  const { a } = makeAudio();
  a._offline = false;
  a.announce('Headshot!');
  a.announce('');
  a.announce(null);
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(fake.spoken.length >= 1);
  assert.ok(fake.spoken[0].text.includes('Headshot'));
  assert.equal(a._pickVoice().lang, 'en-GB');
});

test('内部合成工具覆盖滤波、噪声、音调、金属、驱动与界面提示', () => {
  const { a } = makeAudio();
  const v = a._voice(null, { g: 0.5, wet: 0.2 });
  const t = a._now();
  a._env(v.input.gain, t, 0.01, 0.2, 0.5, 0.05);
  a._flt(v, { t: 'lowpass', f: 1000, f1: 200, sw: 0.1, q: 2 }, t);
  a._flt(v, { t: 'highpass', f: 100, q: 0 }, t);
  a._flt(v, { t: 'bandpass', f: 1000, q: 1 }, t);
  a._nz(v, t, { n: 'white', a: 0.01, dur: 0.1, g: 0.2 });
  a._nz(v, t, { n: 'pink', a: 0.01, hold: 0.1, dur: 0.1, g: 0.2 });
  a._nz(v, t, { n: 'brown', a: 0.01, dur: 0.1, g: 0.2 });
  a._tn(v, t, { f: 200, f1: 100, a: 0.01, dur: 0.1, g: 0.2 });
  a._tn(v, t, { f: 200, path: [[0.1, 300], [0.2, 100]], det: 5, fm: [20, 10], a: 0.01, dur: 0.2, g: 0.2 });
  a._metal(v, t, 1000, 0.2, [[1, 1, 0.1], [2, 0.5, 0.2]]);
  a._click(v, t, 2000, 0.2);
  a._whoosh(v, t, { a: 0.01, dur: 0.2, g: 0.2 });
  a._drive(v, 2, 0.5);
  a._mech(v, t, 2000, 0.2);
  a._surf(v, t, 'metal', 0.2, 0.5, true, false);
  const rnd = Math.random; Math.random = () => 0.01;
  a._surf(v, t, 'wood', 0.2, 0.5, false, false);
  Math.random = rnd;
  a._grunt(v, t, 100, 80, 0.2, 0.5);
  a._throwWhoosh(P());
  a._ring(0.5, 0.2);
  a._muffle(0.5, 0.2);
  a._badge('Double Kill!');
  a._done(v);
  a._free(v);
  const warn = console.warn; console.warn = () => {};
  a._warn('x', new Error('e'));
  console.warn = warn;
});

test('初始化自动创建、联机定时器与语音初始化分支', () => {
  const prevAC = globalThis.AudioContext, prevOffline = globalThis.OfflineAudioContext;
  class FlakyContext extends FakeAudioContext {
    constructor(opts) { super(); if (opts) throw new Error('no options'); }
  }
  globalThis.AudioContext = FlakyContext;
  const a = new AudioSystem();
  assert.equal(a.init(), true);
  clearInterval(a._timer);
  a.stopAmbient();
  assert.equal(a.ready, true);

  class OnlineContext extends FakeAudioContext {}
  globalThis.AudioContext = OnlineContext;
  globalThis.OfflineAudioContext = class Offline {};
  const b = new AudioSystem();
  assert.equal(b.init(), true);
  assert.equal(b._offline, false);
  assert.ok(b._timer);
  clearInterval(b._timer);
  b._speechInit = false;
  b._initSpeech();
  assert.equal(b._speechInit, true);
  b._sv = null;
  const reset = globalThis.speechSynthesis;
  delete reset.addEventListener;
  b._speechInit = false;
  b._initSpeech();
  assert.equal(typeof reset.onvoiceschanged, 'function');
  reset.onvoiceschanged();
  b.stopAmbient();
  globalThis.AudioContext = prevAC;
  globalThis.OfflineAudioContext = prevOffline;
});

test('错误路径覆盖各音频入口的 catch 与清理', () => {
  const { a, ctx } = makeAudio();
  a.playImpact(P(), 'mesh');
  const v = a._voice(null, {});
  a._track(v, { disconnect: () => { throw new Error('x'); } }, a._now());
  const src = v.src.at(-1);
  src.onended();
  assert.equal(v.pending, 0);

  // 监听者设置失败
  const badListener = Object.create(ctx.listener);
  Object.defineProperty(badListener, 'positionX', { get() { throw new Error('listener'); } });
  ctx.listener = badListener;
  assert.doesNotThrow(() => a.setListener(P(), P(0, 0, -1), P(0, 1, 0)));

  // 任意节点创建失败，走各方法的 catch
  const bad = Object.create(ctx);
  const thrower = () => { throw new Error('node fail'); };
  for (const k of ['createGain', 'createBiquadFilter', 'createStereoPanner', 'createPanner',
    'createBufferSource', 'createOscillator', 'createWaveShaper', 'createDynamicsCompressor', 'createConvolver']) {
    bad[k] = thrower;
  }
  const prevWarn = console.warn;
  console.warn = () => {};
  a.ctx = bad;
  const origApply = a._applyVolumes;
  a._applyVolumes = thrower;
  assert.doesNotThrow(() => a.setVolumes({ master: 0.5 }));
  a._applyVolumes = origApply;
  const calls = [
    () => a.playShot('ak47', null),
    () => a.playReload('ak47', 'magout'),
    () => a.playDryFire(),
    () => a.playFootstep(null, 'metal', {}),
    () => a.playLand(null, 'metal', 1),
    () => a.playJump(null),
    () => a.playImpact(P(), 'metal'),
    () => a.playRicochet(P()),
    () => a.playBulletWhiz(P()),
    () => a.playHitmarker(false),
    () => a.playKillConfirm(false),
    () => a.playHurt(10),
    () => a.playDeath(P()),
    () => a.playKnife('light', 'miss', null),
    () => a.playGrenadePin(),
    () => a.playGrenadeThrow(),
    () => a.playGrenadeBounce(P()),
    () => a.playExplosion(P()),
    () => a.playWeaponSwitch('ak47'),
    () => a.playScope(true),
    () => a.playShellDrop(P()),
    () => a.playUI('click'),
    () => a.announce('test'),
    () => a.setLowHealth(true),
    () => a.startAmbient(),
  ];
  for (const fn of calls) assert.doesNotThrow(fn);
  a._hbGain = null;
  assert.doesNotThrow(calls.at(-2));
  // stopAmbient 与 _tick 的 catch
  a._amb = { stopping: false, out: { gain: { cancelScheduledValues: thrower } }, srcs: [], nodes: [] };
  assert.doesNotThrow(() => a.stopAmbient());
  a._amb = { stopping: false, nGust: 0, nGull: 0, nCreak: 0, nSplash: 0, nHorn: 0 };
  a._gust = thrower;
  assert.doesNotThrow(() => a._tick());
  console.warn = prevWarn;
  a.ctx = ctx;
});

test('没有 setTimeout 时同步播报与同步清理环境音', () => {
  const { a } = makeAudio();
  a._offline = false;
  const prevTimeout = globalThis.setTimeout;
  globalThis.setTimeout = undefined;
  assert.doesNotThrow(() => a.announce('Sync'));
  a.startAmbient();
  assert.doesNotThrow(() => a.stopAmbient());
  assert.equal(a._amb, null);
  globalThis.setTimeout = prevTimeout;
});
