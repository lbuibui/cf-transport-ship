import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { Game } from '../src/game.js';
import { Player } from '../src/player.js';
import { World } from '../src/physics.js';
import { WeaponState } from '../src/weapons.js';

let restore = null;
const origBind = Player.prototype.bind;
before(() => {
  restore = installFakeDom();
  Player.prototype.bind = () => {};
});
after(() => {
  Player.prototype.bind = origBind;
  restore?.();
});

function makeGame() {
  const g = Object.create(Game.prototype);
  g.time = 0; g.frame = 0; g.realTime = 0; g.matchId = 3;
  g.playing = false; g.paused = false; g.ended = false;
  g.score = { BL: 0, GR: 0 }; g.nades = []; g.tags = []; g.timers = [];
  g.opts = {
    team: 'BL', primary: 'ak47', size: 4, diff: 'normal', goal: 30, tod: 'day', vol: 0.8,
    quality: 'high', fov: 78, frameCap: 0,
  };
  g.renderer = {
    scene: new THREE.Scene(), vmScene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(78, 16 / 9, 0.05, 1000),
    render: () => { g.rendered = (g.rendered || 0) + 1; },
    fx: { uniforms: {
      uTime: { value: 0 }, uDamage: { value: 0 }, uLowHP: { value: 0 }, uDeath: { value: 0 },
      uProtect: { value: 0 }, uVignette: { value: 0.3 },
    } },
  };
  g.world = new World();
  g.world.add({ x: 0, y: -0.5, z: 0, sx: 120, sy: 1, sz: 120, mat: 'metal', tag: 'deck' });
  g.world.build();
  g.map = {
    spawns: { BL: [{ x: -34, z: 0, yaw: -Math.PI / 2 }, { x: -34, z: 3, yaw: -Math.PI / 2 }], GR: [{ x: 34, z: 0, yaw: Math.PI / 2 }] },
    update: () => {}, lampSpots: [], funnelTop: new THREE.Vector3(),
  };
  g.nav = {
    findPath: () => [[-34, 0, 0, false], [0, 0, 0, false]],
    randomFree: () => [0, 0, 0],
  };
  g.env = { apply: (v) => { g.appliedTod = v; }, sunDir: new THREE.Vector3(0, 1, 0), shipSpeed: 6, update: () => {} };
  g.fx = { update: () => {}, shake: 0, impact: () => {}, explosion: () => {}, bloodSplat: () => {} };
  g.calls = { equip: [], slots: [], toast: [], scoreboard: [] };
  g.vm = {
    setTeam: () => {}, equip: (...a) => g.calls.equip.push(a), reload: () => {}, melee: () => {},
    throwNade: () => {}, setVisible: () => {}, update: () => {}, inspect: () => {},
  };
  g.hud = {
    slots: (...a) => g.calls.slots.push(a), toast: (...a) => g.calls.toast.push(a),
    update: () => {}, drawRadar: () => {}, scoreboard: (...a) => g.calls.scoreboard.push(a),
    show: () => {},
    endScreen: () => {}, damageFrom: () => {}, hitmarker: () => {}, killFeed: () => {}, badge: () => {},
  };
  g.lock = () => { g.locked = true; };
  g.actors = [];
  return g;
}

test('startMatch 重置比分、生成双方阵容并开始对局', () => {
  const g = makeGame();
  g.startMatch();
  assert.equal(g.playing, true);
  assert.equal(g.paused, false);
  assert.equal(g.ended, false);
  assert.equal(g.matchId, 4);
  assert.equal(g.goal, 30);
  assert.equal(g.timeLeft, 600);
  assert.deepEqual(g.score, { BL: 0, GR: 0 });
  assert.equal(g.appliedTod, 'day');
  assert.equal(g.player.team, 'BL');
  assert.equal(g.player.primary, 'ak47');
  assert.equal(g.actors.length, 8); // 4 潜伏者（含玩家）+ 4 保卫者
  assert.equal(g.actors.filter((a) => a.team === 'BL').length, 4);
  assert.equal(g.actors.filter((a) => a.team === 'GR').length, 4);
  assert.equal(g.tags.length, 3); // 三名队友
  assert.equal(g.locked, true);
  assert.ok(g.calls.slots.length >= 1);
  assert.ok(g.calls.equip.length >= 1);
  assert.ok(g.calls.toast.some(([t]) => String(t).includes('率先达到')));
  assert.equal(g.actors.some((a) => a.primary === 'awm'), true);
});

test('startMatch 对非法选项回落默认值', () => {
  const g = makeGame();
  g.opts.team = 'XX'; g.opts.primary = 'railgun'; g.opts.size = 5; g.opts.goal = 7;
  g.startMatch();
  assert.equal(g.goal, 50);
  assert.equal(g.actors.length, 12); // 6 + 6
  assert.equal(g.player.team, 'BL');
  assert.equal(g.player.primary, 'ak47');
});

test('renderFrame 更新武器层、环境、HUD 与屏幕特效', () => {
  const g = makeGame();
  g.playing = true;
  g.player = {
    alive: true, scoped: 0, speed: 3, onGround: true, crouch: false,
    lookDX: 1, lookDY: 2, hp: 20, protectT: 1, deadT: 0,
    weapon: { def: { type: 'rifle' } },
  };
  g.updateLightProbe = () => { g.lightK = 0.5; g.indoorK = 0; };
  g.updateHUD = () => { g.hudUpdated = (g.hudUpdated || 0) + 1; };
  g.time = 9; g.realTime = 5;
  document.querySelector = () => ({ textContent: '' });
  g.renderFrame(0.6);
  assert.ok(g.lightK > 0);
  assert.equal(g.hudUpdated, 1);
  assert.equal(g.rendered, 1);
  assert.ok(g.renderer.fx.uniforms.uTime.value > 0);
  assert.ok(g.renderer.fx.uniforms.uLowHP.value > 0);
  assert.equal(g.renderer.fx.uniforms.uProtect.value, 1);
  assert.equal(g.renderer.fx.uniforms.uVignette.value, 0.3);

  g.player.alive = false; g.player.deadT = 0.4; g.player.scoped = 1;
  g.renderFrame(0.6);
  assert.ok(g.renderer.fx.uniforms.uDeath.value > 0);
  assert.equal(g.renderer.fx.uniforms.uVignette.value, 0);

  g.playing = false;
  g.renderFrame(1.2);
  assert.equal(typeof g.fps, 'number');
  assert.equal(g.fpsHinted, true);
});

test('updateHUD 计算扩散、准星目标与 Tab 记分板', () => {
  const g = makeGame();
  const w = new WeaponState('ak47');
  w.spreadAcc = 0.01;
  g.player = {
    team: 'BL', hp: 100, armor: 50, alive: true, weapon: w, scoped: 0,
    spreadAcc: 0, speed: 3, onGround: false, crouch: true, yaw: 0.5,
    respawnT: 0, killedBy: '', protectT: 0, id: 1, keys: new Set(['Tab']),
  };
  const target = {
    team: 'GR', alive: true, id: 2, name: '目标',
    soldier: { hitTest: () => ({ t: 5, part: 'chest' }) },
  };
  g.actors = [g.player, target];
  const updates = [];
  g.hud = {
    update: (...a) => updates.push(a), drawRadar: () => {}, scoreboard: (...a) => g.calls.scoreboard.push(a),
  };
  g.world.raycast = () => null;
  g.playing = true;
  g.updateHUD(0.016);
  assert.equal(updates.length, 1);
  const state = updates[0][1];
  assert.equal(state.aimName, '目标');
  assert.equal(state.myTeam, 'BL');
  assert.ok(state.spreadPx >= 0);
  assert.equal(g.calls.scoreboard.length, 1);
  assert.equal(g.calls.scoreboard[0][0], true);

  g.player.keys.clear();
  g.frame = 4;
  g.updateHUD(0.016);
  assert.equal(g.calls.scoreboard.length, 2);
  assert.equal(g.calls.scoreboard[1][0], false);
});

test('loop 处理帧率上限、模拟、菜单环绕与渲染', () => {
  const g = makeGame();
  const origRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  let simulated = 0, rendered = 0;
  g.simulate = () => { simulated++; };
  g.renderFrame = () => { rendered++; };
  g.playing = true; g.paused = false; g.last = 1000; g.opts.frameCap = 0;
  g.loop(1016);
  assert.equal(simulated, 1);
  assert.equal(rendered, 1);
  assert.ok(Math.abs(g.realTime - 0.016) < 1e-9);

  g.opts.frameCap = 60;
  g.last = 2000; g.drawing = 1990;
  g.loop(1995); // 距离上一帧不足 16.67ms，直接返回
  assert.equal(simulated, 1);
  assert.equal(rendered, 1);
  g.loop(2020);
  assert.equal(simulated, 2);

  g.playing = false;
  g.loop(2100);
  assert.equal(rendered, 3);
  assert.ok(g.renderer.camera.position.length() > 0);
  assert.equal(g.renderer.camera.fov, 60);

  g.playing = true;
  g.loop(2300); // dt 超过 0.1 时被夹紧
  assert.ok(g.realTime < 2.1);
  globalThis.requestAnimationFrame = origRaf;
});
