export interface WeaponSocketPreset {
  boneNames: readonly string[];
  anchorPosition: readonly [number, number, number];
  anchorRotation: readonly [number, number, number];
  worldLength: number;
  gripFromBottomRatio: number;
}

const DEFAULT_WEAPON_SOCKET: WeaponSocketPreset = {
  boneNames: ['mixamorigWeapon', 'mixamorig:Weapon', 'RightHand', 'mixamorigRightHand', 'mixamorig:RightHand', 'Hand_R'],
  anchorPosition: [0, 0, 0],
  anchorRotation: [0, 0, -Math.PI / 2],
  worldLength: 1.55,
  gripFromBottomRatio: 0.16,
};

const WEAPON_SOCKETS: Record<string, WeaponSocketPreset> = {
  '/items/Sword_Golden.glb': DEFAULT_WEAPON_SOCKET,
};

export function getWeaponSocket(url: string): WeaponSocketPreset {
  return WEAPON_SOCKETS[url] ?? DEFAULT_WEAPON_SOCKET;
}