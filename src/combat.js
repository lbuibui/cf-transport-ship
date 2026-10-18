// 纯战斗数值：游戏与单测共用，不依赖 DOM / three。
// 伤害、护甲与爆炸衰减集中在这里，改动后先跑 npm test。

// 护甲吸收：返回实际扣血与护甲损耗。腿部不受护甲保护。
export function armorMitigation(armor, amount, part, def) {
  if (armor <= 0 || part === 'leg') return { hpDamage: amount, armorLoss: 0 };
  const ap = def?.armorPen ?? 0.75;
  return {
    hpDamage: amount * ap,
    armorLoss: Math.min(armor, amount * (1 - ap) * 1.4),
  };
}

// 子弹伤害：基础伤害 × 穿透衰减 × 距离衰减 × 部位倍率。
export function bulletDamage(def, baseDamage, distance, part) {
  const partMul = part === 'head' ? def.headMul : part === 'arm' || part === 'leg' ? def.limbMul : 1;
  return baseDamage * Math.pow(def.falloff, distance / 10) * partMul;
}

// 手雷伤害：随距离衰减，隔墙只剩 20%。
export function splashDamage(damage, radius, distance, blocked) {
  if (distance >= radius) return 0;
  const t = Math.max(0, 1 - distance / radius);
  return damage * Math.pow(t, 1.1) * (blocked ? 0.2 : 1);
}
