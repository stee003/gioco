// data/relics.js — equipable relics. Effects are read by player.stats().
// Each relic: id, cost (echoes, for Murmur's stock), and stat modifiers.
// Some have trade-offs — meaningful build decisions.
export const RELICS = {
  brittle:    { cost: 0,  dmgMul: 1.35, maxChimesMul: 0.75 },
  longtoll:   { cost: 120, dashDurMul: 1.4 },
  deepcommune:{ cost: 140, healAmount: 2, healCostMul: 1.5 },
  edge:       { cost: 160, ariaMul: 1.5 },
  feather:    { cost: 110, runMul: 1.12, jumpMul: 1.06 },
  plate:      { cost: 150, dmgReduce: 1, atkSpeedMul: 0.87 },
  lamp:       { cost: 90,  lightMul: 1.9 },
  silk:       { cost: 120, wallSlide: 60, wallJumpMul: 1.09 },
  lure:       { cost: 130, echoMul: 1.3 },
  stillaria:  { cost: 150, maxAriaAdd: 25 },
  tempered:   { cost: 170, atkSpeedMul: 1.2 },
  bellheart:  { cost: 200, maxChimesAdd: 2, runMul: 0.9 },
  veil:       { cost: 140, veilFast: true, secretSight: true },
  seal:       { cost: 180, mapStelae: true },
};
export const RELIC_SHOP_ORDER = ['lamp', 'longtoll', 'silk', 'lure', 'deepcommune', 'stillaria', 'plate', 'edge', 'feather', 'tempered', 'veil', 'seal', 'bellheart'];
