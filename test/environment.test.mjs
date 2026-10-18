import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Environment, PRESETS } from '../src/env.js';

const origFromScene = THREE.PMREMGenerator.prototype.fromScene;
let disposed = 0;
let fromScenes = 0;

before(() => {
  THREE.PMREMGenerator.prototype.fromScene = function () {
    fromScenes++;
    return { texture: new THREE.Texture(), dispose: () => disposed++ };
  };
});
after(() => { THREE.PMREMGenerator.prototype.fromScene = origFromScene; });

function make(quality = 'high') {
  const scene = new THREE.Scene();
  const renderer = { toneMappingExposure: 0.75 };
  const env = new Environment(renderer, scene, quality);
  return { env, scene, renderer };
}

test('环境构造天空、云、海、太阳、雾与低/高画质阴影尺寸', () => {
  const low = make('low');
  assert.equal(low.env.sun.shadow.mapSize.x, 1024);
  assert.equal(low.env.sun.shadow.mapSize.y, 1024);
  const high = make('high');
  assert.equal(high.env.sun.shadow.mapSize.x, 4096);
  assert.equal(high.env.hemi.intensity, PRESETS.day.hemiInt);
  assert.ok(high.scene.fog.isFogExp2);
  assert.equal(high.scene.fog.density, PRESETS.day.fogDensity);
  assert.equal(high.env.ocean.material.uniforms.uTime.value, 0);
  assert.equal(high.env.clouds.material.uniforms.uCover.value, PRESETS.day.cloudCover);
  assert.ok(high.env.sky.material.uniforms.sunPosition);
});

test('切换白天/黄昏会更新太阳、雾、海面与曝光', () => {
  const { env, scene, renderer } = make();
  env.apply('dusk');
  assert.equal(env.preset, PRESETS.dusk);
  assert.equal(renderer.toneMappingExposure, PRESETS.dusk.exposure);
  assert.equal(scene.fog.color.getHex(), PRESETS.dusk.fog);
  assert.equal(scene.fog.density, PRESETS.dusk.fogDensity);
  assert.equal(env.sun.color.getHex(), PRESETS.dusk.sunColor);
  assert.equal(env.sun.intensity, PRESETS.dusk.sunInt);
  assert.ok(env.sunDir.y < 0.2);
  assert.equal(env.ocean.material.uniforms.uDeep.value.getHex(), PRESETS.dusk.deep);
  assert.equal(env.clouds.material.uniforms.uCover.value, PRESETS.dusk.cloudCover);
  env.apply('unknown');
  assert.equal(env.preset, PRESETS.day);
});

test('环境贴图会释放旧 RT 并同步到额外场景', () => {
  const { env, scene } = make();
  const extra = new THREE.Scene();
  env.extraScenes = [extra];
  const beforeScenes = fromScenes;
  env.buildEnvMap();
  const first = env.envRT;
  assert.ok(first && first.texture);
  assert.ok(scene.environment === first.texture);
  assert.ok(extra.environment === first.texture);
  assert.equal(scene.environmentIntensity, PRESETS.day.envInt);
  env.buildEnvMap();
  assert.ok(disposed >= 1);
  assert.notEqual(env.envRT, first);
  assert.equal(fromScenes, beforeScenes + 2);
});

test('update 推进船速、海浪时间与云层偏移', () => {
  const { env } = make();
  const cam = new THREE.Vector3(1, 2, 3);
  env.update(0.5, 12, cam);
  assert.equal(env.shipDist, 0.5 * env.shipSpeed);
  assert.equal(env.ocean.material.uniforms.uTime.value, 12);
  assert.ok(env.ocean.material.uniforms.uShip.value > 0);
  assert.deepEqual(env.ocean.material.uniforms.uCam.value.toArray(), [1, 2, 3]);
  assert.equal(env.clouds.material.uniforms.uTime.value, 12);
  assert.ok(env.clouds.material.uniforms.uShip.value > 0);
});
