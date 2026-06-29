export type PlayerClassId = 'warrior';

export interface PlayerProfile {
  name: string;
  classId: PlayerClassId;
  classLabel: 'Warrior';
  modelUrl: '/models/warrior.glb';
}

export const DEFAULT_PLAYER_PROFILE: PlayerProfile = {
  name: 'Heroi de Aranna',
  classId: 'warrior',
  classLabel: 'Warrior',
  modelUrl: '/models/warrior.glb',
};

export function createWarriorProfile(name: string): PlayerProfile {
  const safeName = name.trim() || DEFAULT_PLAYER_PROFILE.name;
  return {
    ...DEFAULT_PLAYER_PROFILE,
    name: safeName,
  };
}
