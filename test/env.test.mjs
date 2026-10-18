import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/env.js';

test('白天与黄昏预设字段完整且数值合理', () => {
  assert.deepEqual(Object.keys(PRESETS), ['day', 'dusk']);
  for (const [name, p] of Object.entries(PRESETS)) {
    for (const k of ['elev', 'azim', 'turbidity', 'rayleigh', 'mie', 'mieG', 'sunInt', 'hemiInt', 'envInt',
      'exposure', 'fogDensity', 'cloudCover']) {
      assert.ok(Number.isFinite(p[k]), `${name}.${k}`);
    }
    for (const k of ['sunColor', 'hemiSky', 'hemiGround', 'fog', 'deep', 'shallow', 'skyZen', 'skyHor', 'cloudLit', 'cloudShade']) {
      assert.ok(Number.isInteger(p[k]), `${name}.${k}`);
    }
    assert.ok(p.elev >= 0 && p.elev <= 90);
    assert.ok(p.azim >= 0 && p.azim < 360);
    assert.ok(p.fogDensity > 0 && p.fogDensity < 0.01);
    assert.ok(p.sunInt > 0 && p.exposure > 0);
  }
});

test('黄昏比白天太阳高度更低、色调更暖', () => {
  assert.ok(PRESETS.dusk.elev < PRESETS.day.elev);
  assert.ok(PRESETS.dusk.turbidity > PRESETS.day.turbidity);
  assert.ok(PRESETS.dusk.mie > PRESETS.day.mie);
  assert.ok(PRESETS.dusk.exposure > PRESETS.day.exposure);
  const warm = (hex) => ((hex >> 16) & 255) / (((hex >> 8) & 255) || 1);
  assert.ok(warm(PRESETS.dusk.sunColor) > warm(PRESETS.day.sunColor));
});
