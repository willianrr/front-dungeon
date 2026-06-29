import type { V3 } from './mathx';

// ---------------------------------------------------------------------------
// Contrato compartilhado entre cliente e "servidor".
// Estes tipos viajam entre o navegador e o backend Go via JSON/WebSocket.
// ---------------------------------------------------------------------------

export type EntityKind = 'player' | 'enemy';
export type EntityAction = 'idle' | 'walk' | 'run' | 'attack' | 'dead';
export type EnemyVariant = 'zombie' | 'zombieBoss';
export type WorldZone = 'overworld' | 'dungeon';
export type PlayerAttribute = 'strength' | 'agility' | 'vitality' | 'energy';

export type GemKind = 'jewel_bless' | 'jewel_soul';
export type WeaponGlowGem = 'bless' | 'soul';
export type WeaponElement = 'fire';
export type DamageKind = 'physical' | 'magic';
export type CombatTextKind = DamageKind | 'incoming' | 'miss';
export type SkillId = 'arcane-nova';
export type ItemKind = 'coin' | 'mana_potion' | 'potion' | 'sword' | GemKind;
/** Tiers de raridade de uma arma — definem (e colorem) a faixa de dano. */
export type ItemRarity = 'comum' | 'incomum' | 'raro' | 'epico' | 'lendario';
export type EquipmentSlot = 'head' | 'chest' | 'hands' | 'legs' | 'feet' | 'weapon' | 'offhand' | 'trinket';
/** Cada slot guarda o ID da INSTÂNCIA de item equipada (ou null), não o tipo. */
export type EquipmentState = Record<EquipmentSlot, string | null>;

/**
 * Um item na mochila do herói.
 * - Consumíveis (moeda, poção) EMPILHAM: um único registro com `count`.
 * - Armas são instâncias ÚNICAS: cada uma ocupa seu próprio slot, tem `id`
 *   próprio e uma faixa de dano (damageMin..damageMax). Nunca se fundem.
 */
export interface InventoryItem {
  /** Identidade única. Para empilháveis é estável por tipo (ex.: "stack-coin"). */
  id: string;
  kind: ItemKind;
  name: string;
  icon: string;
  count: number;
  /** True para consumíveis empilháveis; false para instâncias únicas (armas). */
  stackable: boolean;
  /** Itens clicáveis na mochila que executam uma ação imediata. */
  usable?: boolean;
  equipSlot?: EquipmentSlot;
  rarity?: ItemRarity;
  /** Nível de melhoria visual/estatística da arma. */
  upgradeLevel?: number;
  /** Última gema aplicada na arma, usada para definir a cor do brilho. */
  glowGem?: WeaponGlowGem;
  element?: WeaponElement;
  /** Dano mínimo da arma (cada golpe rola entre min e max). */
  damageMin?: number;
  /** Dano máximo da arma (cada golpe rola entre min e max). */
  damageMax?: number;
  magicDamageMin?: number;
  magicDamageMax?: number;
  /** True quando ESTA instância está equipada. */
  equipped?: boolean;
}

/** Item físico no chão, pronto para ser clicado/coletado. */
export interface LootState {
  id: string;
  kind: ItemKind;
  name: string;
  icon: string;
  modelUrl: string;
  position: V3;
  count: number;
  rarity?: ItemRarity;
  /** Cor/elemento visual da gema quando este loot for uma gema. */
  glowGem?: WeaponGlowGem;
  element?: WeaponElement;
  /** Faixa de dano de uma arma dropada (cada instância é única). */
  damageMin?: number;
  damageMax?: number;
  magicDamageMin?: number;
  magicDamageMax?: number;
}

/** Baú persistente da zona atual; abrir gera loot físico no chão. */
export interface ChestState {
  id: string;
  position: V3;
  opened: boolean;
}

/** Pequeno estado visual da arma equipada que o cliente precisa renderizar. */
export interface EquippedWeaponVisualState {
  kind: 'sword';
  rarity: ItemRarity;
  upgradeLevel: number;
  glowGem?: WeaponGlowGem;
  element?: WeaponElement;
}

/** Pequena quest que guia o primeiro ciclo externo -> dungeon. */
export interface QuestState {
  title: string;
  objective: string;
  progress: number;
  goal: number;
  completed: boolean;
}

/** Atributos distribuídos pelo jogador no painel de personagem. */
export interface PlayerAttributes {
  strength: number;
  agility: number;
  vitality: number;
  energy: number;
  unspentPoints: number;
}

/** Estado de uma habilidade ativa exibida na hotbar do jogador. */
export interface SkillState {
  id: SkillId;
  label: string;
  manaCost: number;
  cooldown: number;
  cooldownRemaining: number;
}

/** Estado de uma entidade num dado instante (o que o servidor transmite). */
export interface EntityState {
  id: string;
  name?: string;
  modelUrl?: string;
  kind: EntityKind;
  position: V3;
  rotationY: number;
  hp: number;
  maxHp: number;
  level: number;
  alive: boolean;
  /** Variante visual/mecanica usada pelos inimigos. */
  enemyVariant?: EnemyVariant;
  /** Escala visual relativa ao inimigo comum. */
  scale?: number;
  /** Ação autoritativa: a renderização não precisa mais adivinhar o combate. */
  action: EntityAction;
  /** True enquanto a entidade esta no meio de um pulo. */
  jumping?: boolean;
  // Campos de progressao — so preenchidos para o jogador.
  xp?: number;
  xpToNext?: number;
  mana?: number;
  maxMana?: number;
  attackDamage?: number;
  attackSpeed?: number;
  /** Faixa de dano da arma equipada (0..0 quando desarmado). */
  weaponDamageMin?: number;
  weaponDamageMax?: number;
  weaponMagicDamageMin?: number;
  weaponMagicDamageMax?: number;
  /** Chance atual de evitar ataques inimigos, de 0 a 1. */
  dodgeChance?: number;
  /** Regeneracao de vida por segundo. */
  healthRegen?: number;
  attributes?: PlayerAttributes;
  skills?: SkillState[];
  equippedWeapon?: EquippedWeaponVisualState | null;
}

export interface DamageCombatEvent {
  id: string;
  type: 'damage';
  targetId: string;
  amount: number;
  damageKind: DamageKind;
  position: V3;
}

export interface MissCombatEvent {
  id: string;
  type: 'miss';
  targetId: string;
  position: V3;
}

export interface SkillEffectCombatEvent {
  id: string;
  type: 'skill-effect';
  skill: SkillId;
  casterId: string;
  position: V3;
  radius: number;
}

export interface BossSlamWarningCombatEvent {
  id: string;
  type: 'boss-slam-warning';
  casterId: string;
  position: V3;
  radius: number;
  delay: number;
}

export interface BossSlamImpactCombatEvent {
  id: string;
  type: 'boss-slam-impact';
  casterId: string;
  position: V3;
  radius: number;
}

export type CombatEvent =
  | DamageCombatEvent
  | MissCombatEvent
  | SkillEffectCombatEvent
  | BossSlamWarningCombatEvent
  | BossSlamImpactCombatEvent;

/** "Foto" completa do mundo num tick. E o que o cliente desenha. */
export interface WorldSnapshot {
  tick: number;
  zone: WorldZone;
  entities: EntityState[];
  loot: LootState[];
  chests: ChestState[];
  inventory: InventoryItem[];
  /** Slots de equipamento do personagem. */
  equipment: EquipmentState;
  /** Arma que o herói está exibindo/empunhando. */
  equippedWeapon: EquippedWeaponVisualState | null;
  combatEvents: CombatEvent[];
  quest: QuestState;
}

/** Comandos que o cliente envia ao servidor (intencoes do jogador). */
export type Command =
  | { type: 'move'; entityId: string; target: V3; run?: boolean }
  | { type: 'attack'; entityId: string; targetId: string }
  | { type: 'jump'; entityId: string }
  | { type: 'cast-skill'; entityId: string; skill: SkillId }
  | { type: 'collect'; entityId: string; lootId: string }
  | { type: 'open-chest'; entityId: string; chestId: string }
  | { type: 'equip-item'; entityId: string; itemId: string }
  | { type: 'unequip-slot'; entityId: string; slot: EquipmentSlot }
  | { type: 'use-item'; entityId: string; item: ItemKind }
  | { type: 'allocate-attribute'; entityId: string; attribute: PlayerAttribute }
  | { type: 'enter-dungeon'; entityId: string }
  | { type: 'leave-dungeon'; entityId: string }
  | { type: 'respawn'; entityId: string };
