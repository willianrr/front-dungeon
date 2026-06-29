import type { GemKind, ItemKind, ItemRarity, WeaponGlowGem } from './types';

export const ITEM_ICON_URLS: Record<ItemKind, string> = {
  coin: '/models/items/Icons/runtime/Coin.png',
  mana_potion: '/models/items/Icons/Potion1_Filled_Blue.png',
  potion: '/models/items/Icons/runtime/Potion1_Filled_Red.png',
  sword: '/models/items/Icons/runtime/Sword_Golden.png',
  jewel_bless: '/models/items/Icons/runtime/Crystal5.png',
  jewel_soul: '/models/items/Icons/runtime/Crystal1.png',
};

export const RARITY_COLORS: Record<ItemRarity, string> = {
  comum: '#c9d1d9',
  incomum: '#5fd66f',
  raro: '#5aa9ff',
  epico: '#c084fc',
  lendario: '#fb923c',
};

export const RARITY_GLOW_SCALE: Record<ItemRarity, number> = {
  comum: 0.92,
  incomum: 1,
  raro: 1.08,
  epico: 1.18,
  lendario: 1.3,
};

export const GEM_GLOW_COLORS: Record<WeaponGlowGem, string> = {
  bless: '#d8f7ff',
  soul: '#4f7dff',
};

export const GEM_KINDS = ['jewel_bless', 'jewel_soul'] as const;

export const GEM_UPGRADE_LIMITS: Record<GemKind, {
  maxLevel: number;
  minLevel: number;
}> = {
  jewel_bless: { minLevel: 0, maxLevel: 6 },
  jewel_soul: { minLevel: 6, maxLevel: 15 },
};

export const GEM_DEFINITIONS: Record<GemKind, {
  glowGem: WeaponGlowGem;
  icon: string;
  modelUrl: string;
  name: string;
}> = {
  jewel_bless: {
    glowGem: 'bless',
    icon: ITEM_ICON_URLS.jewel_bless,
    modelUrl: '/items/Crystal5.glb',
    name: 'Jewel of Bless',
  },
  jewel_soul: {
    glowGem: 'soul',
    icon: ITEM_ICON_URLS.jewel_soul,
    modelUrl: '/items/Crystal1.glb',
    name: 'Jewel of Soul',
  },
};

export function isGemKind(kind: ItemKind): kind is GemKind {
  return (GEM_KINDS as readonly string[]).includes(kind);
}

export function glowColorForGem(gem: WeaponGlowGem | undefined): string {
  return gem ? GEM_GLOW_COLORS[gem] : '#d8f7ff';
}
