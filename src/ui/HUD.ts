import { GEM_DEFINITIONS, GEM_GLOW_COLORS, ITEM_ICON_URLS, RARITY_COLORS, isGemKind } from '../shared/itemMeta';
import type { PlayerProfile } from '../shared/playerProfile';
import type { EntityState, EquipmentSlot, InventoryItem, ItemKind, PlayerAttribute, WorldSnapshot } from '../shared/types';
import type { WorldData } from '../shared/worldgen';

// HUD em DOM sobreposto ao canvas. Mostra nivel, vida, experiencia, quest,
// mochila, personagem e tela de morte.

const BAG_SLOT_COUNT = 44;
const preloadedIconUrls = new Set<string>();
export const HUD_SKILL_ICON_URLS = {
  arcaneNova: '/hud/runtime/arcane-nova.png',
} as const;

async function decodeIcon(url: string): Promise<void> {
  if (preloadedIconUrls.has(url)) return;
  const image = new Image();
  image.decoding = 'async';
  image.loading = 'eager';
  image.src = url;
  try {
    await image.decode();
    preloadedIconUrls.add(url);
  } catch {
    // Falha de decode cai no handler de erro normal do item quando renderizar.
  }
}

export async function preloadHudIcons(urls: readonly string[]): Promise<void> {
  await Promise.all(urls.map(decodeIcon));
}

function barRatio(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** Faixa de dano "min–max" de uma arma, ou string vazia se não for arma. */
function weaponRange(item: { damageMin?: number; damageMax?: number }): string {
  if (item.damageMin === undefined || item.damageMax === undefined) return '';
  return `${item.damageMin}-${item.damageMax}`;
}

function magicRange(item: { magicDamageMin?: number; magicDamageMax?: number }): string {
  if (!item.magicDamageMax || item.magicDamageMax <= 0) return '';
  return `${item.magicDamageMin ?? 0}-${item.magicDamageMax}`;
}

function upgradeLabel(item: { upgradeLevel?: number }): string {
  return item.upgradeLevel && item.upgradeLevel > 0 ? `+${item.upgradeLevel}` : '';
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const EQUIPMENT_SLOTS: readonly { slot: EquipmentSlot; label: string }[] = [
  { slot: 'head', label: 'Cabeça' },
  { slot: 'chest', label: 'Peito' },
  { slot: 'hands', label: 'Mãos' },
  { slot: 'legs', label: 'Pernas' },
  { slot: 'feet', label: 'Botas' },
  { slot: 'weapon', label: 'Arma' },
  { slot: 'offhand', label: 'Secundária' },
  { slot: 'trinket', label: 'Talismã' },
];

const HOTBAR_EQUIPMENT_SLOTS: readonly { slot: EquipmentSlot; label: string }[] = [
  { slot: 'weapon', label: 'Espada' },
  { slot: 'offhand', label: 'Off' },
];
const MINIMAP_DUNGEON_EXIT = { x: 0, z: -18 };
const MINIMAP_MAX_DPR = 2;
type RenderQualityLevel = 'high' | 'medium' | 'low';
type RenderQualityMode = RenderQualityLevel | 'auto';

const TEMPLATE = `
  <div class="hotbar" aria-label="Atalhos do teclado">
    <div class="hotbar-slot hotbar-equipment-slot" id="hotbar-weapon-slot"><span>Espada</span></div>
    <div class="hotbar-slot hotbar-equipment-slot" id="hotbar-offhand-slot"><span>Off</span></div>
    <div class="hotbar-slot hotbar-consumable-slot" id="hotbar-health-potion" aria-label="Poção Rubra">
      <img class="hotbar-consumable-icon" src="${ITEM_ICON_URLS.potion}" alt="" draggable="false" />
      <span class="hotbar-consumable-count" id="hotbar-health-potion-count"></span>
      <span class="hotbar-keycap">1</span>
    </div>
    <div class="hotbar-slot hotbar-skill-slot" id="hotbar-arcane-nova" aria-label="Nova Arcana">
      <img class="hotbar-skill-icon" src="${HUD_SKILL_ICON_URLS.arcaneNova}" alt="" draggable="false" />
      <span class="hotbar-cooldown-shade" id="hotbar-arcane-nova-shade"></span>
      <span class="hotbar-cooldown-text" id="hotbar-arcane-nova-cooldown"></span>
      <span class="hotbar-keycap">2</span>
    </div>
    <div class="hotbar-slot hotbar-consumable-slot" id="hotbar-mana-potion" aria-label="Poção Azul">
      <img class="hotbar-consumable-icon" src="${ITEM_ICON_URLS.mana_potion}" alt="" draggable="false" />
      <span class="hotbar-consumable-count" id="hotbar-mana-potion-count"></span>
      <span class="hotbar-keycap">3</span>
    </div>
    <div class="hotbar-slot hotbar-number-slot"><span>4</span></div>
    <div class="hotbar-slot hotbar-number-slot"><span>5</span></div>
    <div class="hotbar-slot hotbar-number-slot"><span>6</span></div>
    <div class="hotbar-slot hotbar-number-slot"><span>7</span></div>
    <div class="hotbar-slot hotbar-number-slot"><span>8</span></div>
    <div class="hotbar-slot hotbar-number-slot"><span>9</span></div>
    <div class="hotbar-slot hotbar-number-slot"><span>0</span></div>
  </div>

  <div class="unit-frame hud-panel">
    <div class="unit-portrait unit-portrait-player" aria-hidden="true">
      <span class="unit-level" id="hud-level">1</span>
    </div>
    <div class="unit-vitals">
      <div class="unit-heading">
        <span class="hud-name">Her&oacute;i de Aranna</span>
      </div>
      <div class="bar hp unit-bar">
        <div class="bar-fill" id="hud-hp-fill"></div>
        <span class="bar-text" id="hud-hp-text">0 / 0</span>
      </div>
      <div class="bar mana unit-bar">
        <div class="bar-fill" id="hud-mana-fill"></div>
        <span class="bar-text" id="hud-mana-text">0 / 0</span>
      </div>
      <div class="bar xp unit-xp">
        <div class="bar-fill" id="hud-xp-fill"></div>
        <span class="bar-text">EXP</span>
      </div>
    </div>
  </div>

  <div class="unit-frame target-frame" id="target-frame" aria-hidden="true">
    <div class="unit-portrait unit-portrait-enemy" aria-hidden="true">
      <span class="unit-level" id="target-level">1</span>
    </div>
    <div class="unit-vitals">
      <div class="unit-heading">
        <span class="target-name" id="target-name">Zumbi</span>
      </div>
      <div class="bar hp unit-bar">
        <div class="bar-fill" id="target-hp-fill"></div>
        <span class="bar-text" id="target-hp-text">0 / 0</span>
      </div>
      <div class="bar mana unit-bar target-mana-bar" id="target-mana-bar">
        <div class="bar-fill" id="target-mana-fill"></div>
        <span class="bar-text" id="target-mana-text">0 / 0</span>
      </div>
    </div>
  </div>

  <div class="quest-panel">
    <span class="panel-kicker" id="zone-name">Terras de Aranna</span>
    <h2 id="quest-title">A Escurid&atilde;o Sob Aranna</h2>
    <p id="quest-objective"></p>
    <div class="quest-progress"><div id="quest-progress-fill"></div></div>
  </div>

  <div class="minimap-panel" aria-hidden="true">
    <canvas id="minimap-canvas"></canvas>
  </div>

  <div class="quality-chip" id="quality-chip" aria-hidden="true">AUTO</div>

  <div class="game-menu hud-window" id="game-menu" aria-hidden="true">
    <button class="game-menu-close" id="game-menu-close" type="button" aria-label="Fechar menu">X</button>
    <div class="character-stats" id="character-stats"></div>
    <div class="attribute-section" id="attribute-section"></div>
    <div class="equipment-grid" id="equipment-slots"></div>
    <div class="bag-grid" id="inventory-slots"></div>
  </div>

  <div class="death-overlay" id="death-overlay">
    <div class="death-box">
      <h1>VOC&Ecirc; CAIU</h1>
      <p>As sombras de Aranna te derrubaram.</p>
      <button id="respawn-btn">Renascer</button>
    </div>
  </div>
`;

export class HUD {
  /** Disparado quando o jogador clica em "Renascer". */
  onRespawn: () => void = () => {};
  onEquipItem: (itemId: string) => void = () => {};
  onUseItem: (kind: ItemKind) => void = () => {};
  onUnequipSlot: (slot: EquipmentSlot) => void = () => {};
  onAllocateAttribute: (attribute: PlayerAttribute) => void = () => {};

  private readonly levelEl: HTMLElement;
  private readonly playerName: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly manaFill: HTMLElement;
  private readonly manaText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly targetFrame: HTMLElement;
  private readonly targetName: HTMLElement;
  private readonly targetLevel: HTMLElement;
  private readonly targetHpFill: HTMLElement;
  private readonly targetHpText: HTMLElement;
  private readonly targetManaBar: HTMLElement;
  private readonly targetManaFill: HTMLElement;
  private readonly targetManaText: HTMLElement;
  private readonly deathOverlay: HTMLElement;
  private readonly zoneName: HTMLElement;
  private readonly questTitle: HTMLElement;
  private readonly questObjective: HTMLElement;
  private readonly questProgress: HTMLElement;
  private readonly hotbarWeaponSlot: HTMLElement;
  private readonly hotbarOffhandSlot: HTMLElement;
  private readonly hotbarHealthPotionSlot: HTMLElement;
  private readonly hotbarHealthPotionCount: HTMLElement;
  private readonly hotbarManaPotionSlot: HTMLElement;
  private readonly hotbarManaPotionCount: HTMLElement;
  private readonly hotbarArcaneNovaSlot: HTMLElement;
  private readonly hotbarArcaneNovaShade: HTMLElement;
  private readonly hotbarArcaneNovaCooldown: HTMLElement;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly minimapContext: CanvasRenderingContext2D | null;
  private readonly qualityChip: HTMLElement;
  private readonly gameMenu: HTMLElement;
  private readonly inventorySlots: HTMLElement;
  private readonly characterStats: HTMLElement;
  private readonly attributeSection: HTMLElement;
  private readonly equipmentSlots: HTMLElement;

  private gameMenuOpen = false;
  private hotbarRenderKey = '';
  private inventoryRenderKey = '__initial_inventory__';
  private characterRenderKey = '';
  private minimapRenderKey = '';

  constructor(layer: HTMLElement, profile: PlayerProfile, private readonly world: WorldData) {
    layer.innerHTML = TEMPLATE;
    this.levelEl = layer.querySelector('#hud-level')!;
    this.playerName = layer.querySelector('.hud-name')!;
    this.hpFill = layer.querySelector('#hud-hp-fill')!;
    this.hpText = layer.querySelector('#hud-hp-text')!;
    this.manaFill = layer.querySelector('#hud-mana-fill')!;
    this.manaText = layer.querySelector('#hud-mana-text')!;
    this.xpFill = layer.querySelector('#hud-xp-fill')!;
    this.targetFrame = layer.querySelector('#target-frame')!;
    this.targetName = layer.querySelector('#target-name')!;
    this.targetLevel = layer.querySelector('#target-level')!;
    this.targetHpFill = layer.querySelector('#target-hp-fill')!;
    this.targetHpText = layer.querySelector('#target-hp-text')!;
    this.targetManaBar = layer.querySelector('#target-mana-bar')!;
    this.targetManaFill = layer.querySelector('#target-mana-fill')!;
    this.targetManaText = layer.querySelector('#target-mana-text')!;
    this.deathOverlay = layer.querySelector('#death-overlay')!;
    this.zoneName = layer.querySelector('#zone-name')!;
    this.questTitle = layer.querySelector('#quest-title')!;
    this.questObjective = layer.querySelector('#quest-objective')!;
    this.questProgress = layer.querySelector('#quest-progress-fill')!;
    this.hotbarWeaponSlot = layer.querySelector('#hotbar-weapon-slot')!;
    this.hotbarOffhandSlot = layer.querySelector('#hotbar-offhand-slot')!;
    this.hotbarHealthPotionSlot = layer.querySelector('#hotbar-health-potion')!;
    this.hotbarHealthPotionCount = layer.querySelector('#hotbar-health-potion-count')!;
    this.hotbarManaPotionSlot = layer.querySelector('#hotbar-mana-potion')!;
    this.hotbarManaPotionCount = layer.querySelector('#hotbar-mana-potion-count')!;
    this.hotbarArcaneNovaSlot = layer.querySelector('#hotbar-arcane-nova')!;
    this.hotbarArcaneNovaShade = layer.querySelector('#hotbar-arcane-nova-shade')!;
    this.hotbarArcaneNovaCooldown = layer.querySelector('#hotbar-arcane-nova-cooldown')!;
    this.minimapCanvas = layer.querySelector('#minimap-canvas')!;
    this.minimapContext = this.minimapCanvas.getContext('2d');
    this.qualityChip = layer.querySelector('#quality-chip')!;
    this.gameMenu = layer.querySelector('#game-menu')!;
    this.inventorySlots = layer.querySelector('#inventory-slots')!;
    this.characterStats = layer.querySelector('#character-stats')!;
    this.attributeSection = layer.querySelector('#attribute-section')!;
    this.equipmentSlots = layer.querySelector('#equipment-slots')!;

    const btn = layer.querySelector('#respawn-btn') as HTMLButtonElement;
    btn.addEventListener('click', () => this.onRespawn());
    const menuClose = layer.querySelector('#game-menu-close') as HTMLButtonElement;
    menuClose.addEventListener('click', () => this.setMenuOpen(false));
    this.playerName.textContent = profile.name.trim() || 'Heroi de Aranna';

    this.setMenuOpen(false);
  }

  toggleInventory(): void {
    this.toggleMenu();
  }

  toggleCharacter(): void {
    this.toggleMenu();
  }

  toggleMenu(): void {
    this.setMenuOpen(!this.gameMenuOpen);
  }

  setRenderQuality(mode: RenderQualityMode, level: RenderQualityLevel): void {
    const label: Record<RenderQualityLevel, string> = {
      high: 'ALTA',
      medium: 'MEDIA',
      low: 'BAIXA',
    };
    this.qualityChip.textContent = mode === 'auto' ? `AUTO ${label[level]}` : label[level];
    this.qualityChip.dataset.mode = mode;
    this.qualityChip.dataset.level = level;
  }

  update(snapshot: WorldSnapshot, player: EntityState | undefined, target?: EntityState): void {
    this.updateTarget(target);
    if (!player) return;

    this.levelEl.textContent = String(player.level);

    const hpRatio = barRatio(player.hp, player.maxHp);
    this.hpFill.style.width = `${hpRatio * 100}%`;
    this.hpText.textContent = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`;

    const mana = player.mana ?? 0;
    const maxMana = player.maxMana ?? 0;
    const manaRatio = barRatio(mana, maxMana);
    this.manaFill.style.width = `${manaRatio * 100}%`;
    this.manaText.textContent = `${Math.ceil(Math.max(0, mana))} / ${maxMana}`;
    this.updateArcaneNovaHotbar(player);
    this.updateConsumableHotbar(snapshot);

    const xp = player.xp ?? 0;
    const xpToNext = player.xpToNext ?? 1;
    this.xpFill.style.width = `${barRatio(xp, xpToNext) * 100}%`;

    this.deathOverlay.style.display = player.alive ? 'none' : 'flex';

    this.zoneName.textContent = snapshot.zone === 'overworld' ? 'Terras de Aranna' : 'Câmara das Sombras';
    this.questTitle.textContent = snapshot.quest.title;
    this.questObjective.textContent = snapshot.quest.objective;
    this.questProgress.style.width = `${Math.min(100, (snapshot.quest.progress / snapshot.quest.goal) * 100)}%`;
    const minimapKey = [
      snapshot.zone,
      snapshot.tick,
      this.minimapCanvas.clientWidth,
      this.minimapCanvas.clientHeight,
    ].join(':');
    if (minimapKey !== this.minimapRenderKey) {
      this.minimapRenderKey = minimapKey;
      this.renderMinimap(snapshot, player);
    }

    const inventoryKey = snapshot.inventory
      .map((item) => [
        item.id,
        item.count,
        item.equipped ? 1 : 0,
        item.damageMin ?? '',
        item.damageMax ?? '',
        item.magicDamageMin ?? '',
        item.magicDamageMax ?? '',
        item.upgradeLevel ?? 0,
        item.glowGem ?? '',
        item.element ?? '',
      ].join(':'))
      .join(',');
    if (inventoryKey !== this.inventoryRenderKey) {
      this.inventoryRenderKey = inventoryKey;
      this.renderInventory(snapshot.inventory);
    }

    const hotbarKey = HOTBAR_EQUIPMENT_SLOTS.map(({ slot }) => {
      const id = snapshot.equipment[slot];
      const item = id ? snapshot.inventory.find((candidate) => candidate.id === id) : undefined;
      return [
        slot,
        id ?? '',
        item?.name ?? '',
        item?.icon ?? '',
        item?.rarity ?? '',
        item?.upgradeLevel ?? 0,
        item?.glowGem ?? '',
        item?.element ?? '',
      ].join(':');
    }).join('|');
    if (hotbarKey !== this.hotbarRenderKey) {
      this.hotbarRenderKey = hotbarKey;
      this.renderHotbarEquipment(snapshot);
    }

    const attributes = player.attributes;
    const characterKey = [
      player.level,
      Math.ceil(player.hp),
      player.maxHp,
      Math.ceil(player.mana ?? 0),
      player.maxMana ?? 0,
      player.xp ?? 0,
      player.xpToNext ?? 0,
      player.attackDamage ?? 0,
      player.attackSpeed ?? 1,
      player.weaponDamageMin ?? 0,
      player.weaponDamageMax ?? 0,
      player.weaponMagicDamageMin ?? 0,
      player.weaponMagicDamageMax ?? 0,
      player.dodgeChance ?? 0,
      player.healthRegen ?? 0,
      attributes?.strength ?? 0,
      attributes?.agility ?? 0,
      attributes?.vitality ?? 0,
      attributes?.energy ?? 0,
      attributes?.unspentPoints ?? 0,
      snapshot.zone,
      ...EQUIPMENT_SLOTS.map(({ slot }) => {
        const id = snapshot.equipment[slot];
        const item = id ? snapshot.inventory.find((candidate) => candidate.id === id) : undefined;
        return [
          id ?? '',
          item?.damageMin ?? '',
          item?.damageMax ?? '',
          item?.magicDamageMin ?? '',
          item?.magicDamageMax ?? '',
          item?.upgradeLevel ?? 0,
          item?.glowGem ?? '',
          item?.element ?? '',
        ].join(':');
      }),
    ].join('|');
    if (characterKey !== this.characterRenderKey) {
      this.characterRenderKey = characterKey;
      this.renderCharacter(snapshot, player);
    }
  }

  private updateTarget(target?: EntityState): void {
    const visible = !!target && target.kind === 'enemy' && target.alive;
    this.targetFrame.classList.toggle('open', visible);
    this.targetFrame.setAttribute('aria-hidden', String(!visible));
    if (!visible || !target) return;

    this.targetName.textContent = target.enemyVariant === 'zombieBoss' ? 'Boss Zumbi' : 'Zumbi';
    this.targetLevel.textContent = String(target.level);

    const hpRatio = barRatio(target.hp, target.maxHp);
    this.targetHpFill.style.width = `${hpRatio * 100}%`;
    this.targetHpText.textContent = `${Math.ceil(Math.max(0, target.hp))} / ${target.maxHp}`;

    const mana = target.mana ?? 0;
    const maxMana = target.maxMana ?? 0;
    const hasMana = maxMana > 0;
    this.targetManaBar.classList.toggle('hidden', !hasMana);
    if (!hasMana) return;

    this.targetManaFill.style.width = `${barRatio(mana, maxMana) * 100}%`;
    this.targetManaText.textContent = `${Math.ceil(Math.max(0, mana))} / ${maxMana}`;
  }

  private updateArcaneNovaHotbar(player: EntityState): void {
    const skill = player.skills?.find((entry) => entry.id === 'arcane-nova');
    const cooldown = Math.max(0, skill?.cooldownRemaining ?? 0);
    const cooldownDuration = Math.max(0.01, skill?.cooldown ?? 1);
    const cooldownRatio = barRatio(cooldown, cooldownDuration);
    const mana = player.mana ?? 0;
    const manaCost = skill?.manaCost ?? 0;
    const enoughMana = mana >= manaCost;
    const onCooldown = cooldown > 0.05;

    this.hotbarArcaneNovaSlot.classList.toggle('on-cooldown', onCooldown);
    this.hotbarArcaneNovaSlot.classList.toggle('not-enough-mana', !enoughMana && !onCooldown);
    this.hotbarArcaneNovaSlot.title = skill
      ? `${skill.label} - ${manaCost} mana`
      : 'Nova Arcana';
    this.hotbarArcaneNovaShade.style.height = `${cooldownRatio * 100}%`;
    this.hotbarArcaneNovaCooldown.textContent = onCooldown ? String(Math.ceil(cooldown)) : '';
  }

  private updateConsumableHotbar(snapshot: WorldSnapshot): void {
    const healthPotions = this.stackCount(snapshot, 'potion');
    const manaPotions = this.stackCount(snapshot, 'mana_potion');
    this.updateConsumableSlot(this.hotbarHealthPotionSlot, this.hotbarHealthPotionCount, healthPotions, 'Poção Rubra');
    this.updateConsumableSlot(this.hotbarManaPotionSlot, this.hotbarManaPotionCount, manaPotions, 'Poção Azul');
  }

  private updateConsumableSlot(slot: HTMLElement, countEl: HTMLElement, count: number, label: string): void {
    slot.classList.toggle('empty', count <= 0);
    slot.title = count > 0 ? `${label} (${count})` : `${label} vazia`;
    countEl.textContent = count > 0 ? String(count) : '';
  }

  private stackCount(snapshot: WorldSnapshot, kind: ItemKind): number {
    return snapshot.inventory.find((item) => item.kind === kind && item.stackable)?.count ?? 0;
  }

  private renderMinimap(snapshot: WorldSnapshot, player: EntityState): void {
    const ctx = this.minimapContext;
    if (!ctx) return;

    const rect = this.minimapCanvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, MINIMAP_MAX_DPR);
    const bufferWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const bufferHeight = Math.max(1, Math.floor(cssHeight * dpr));
    if (this.minimapCanvas.width !== bufferWidth || this.minimapCanvas.height !== bufferHeight) {
      this.minimapCanvas.width = bufferWidth;
      this.minimapCanvas.height = bufferHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const cx = cssWidth / 2;
    const cy = cssHeight / 2;
    const radius = Math.min(cssWidth, cssHeight) * 0.46;
    const worldRadius = snapshot.zone === 'dungeon' ? 28 : 58;
    const scale = radius / worldRadius;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = snapshot.zone === 'dungeon' ? 'rgba(5, 7, 11, 0.82)' : 'rgba(10, 20, 18, 0.78)';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    this.drawMinimapGrid(ctx, cx, cy, radius);

    const toMap = (x: number, z: number) => ({
      x: cx + (x - player.position.x) * scale,
      y: cy + (z - player.position.z) * scale,
    });

    if (snapshot.zone === 'overworld') {
      this.drawMinimapDiamond(ctx, toMap(this.world.dungeon.x, this.world.dungeon.z), cx, cy, radius, '#6ecae5', 4.6);
    } else {
      this.drawMinimapDiamond(ctx, toMap(MINIMAP_DUNGEON_EXIT.x, MINIMAP_DUNGEON_EXIT.z), cx, cy, radius, '#6ecae5', 4.6);
    }

    for (const chest of snapshot.chests) {
      const p = toMap(chest.position.x, chest.position.z);
      this.drawMinimapSquare(ctx, p, cx, cy, radius, chest.opened ? 'rgba(154, 112, 71, 0.46)' : '#f2b34c', 4);
    }

    for (const loot of snapshot.loot) {
      const p = toMap(loot.position.x, loot.position.z);
      const color = loot.kind === 'potion'
        ? '#e65f70'
        : loot.kind === 'mana_potion'
          ? '#5aa9ff'
          : loot.kind === 'coin'
            ? '#ffd874'
            : isGemKind(loot.kind)
              ? GEM_GLOW_COLORS[GEM_DEFINITIONS[loot.kind].glowGem]
              : '#d7e3ef';
      this.drawMinimapDot(ctx, p, cx, cy, radius, color, loot.kind === 'sword' ? 3.7 : 2.6);
    }

    for (const entity of snapshot.entities) {
      if (!entity.alive || entity.id === player.id) continue;
      const p = toMap(entity.position.x, entity.position.z);
      if (entity.kind === 'player') {
        this.drawMinimapDot(ctx, p, cx, cy, radius, '#62e6a1', 4.2);
        continue;
      }
      if (entity.kind !== 'enemy') continue;
      const isBoss = entity.enemyVariant === 'zombieBoss';
      this.drawMinimapDot(ctx, p, cx, cy, radius, isBoss ? '#ff6a3d' : '#dc6256', isBoss ? 5 : 3.4);
    }

    ctx.restore();
    this.drawMinimapPlayer(ctx, cx, cy, player.rotationY);
    this.drawMinimapBorder(ctx, cx, cy, radius);
  }

  private drawMinimapGrid(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    ctx.strokeStyle = 'rgba(216, 185, 105, 0.13)';
    ctx.lineWidth = 1;
    for (const ratio of [0.34, 0.67]) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * ratio, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();
  }

  private drawMinimapBorder(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.62, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(110, 202, 229, 0)');
    gradient.addColorStop(1, 'rgba(110, 202, 229, 0.18)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(211, 181, 105, 0.68)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawMinimapPlayer(ctx: CanvasRenderingContext2D, cx: number, cy: number, rotationY: number): void {
    const tip = 8;
    const side = 5.2;
    ctx.fillStyle = '#effcff';
    ctx.strokeStyle = 'rgba(7, 12, 18, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(rotationY) * tip, cy + Math.cos(rotationY) * tip);
    ctx.lineTo(cx + Math.sin(rotationY + 2.42) * side, cy + Math.cos(rotationY + 2.42) * side);
    ctx.lineTo(cx + Math.sin(rotationY - 2.42) * side, cy + Math.cos(rotationY - 2.42) * side);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }

  private drawMinimapDot(
    ctx: CanvasRenderingContext2D,
    p: { x: number; y: number },
    cx: number,
    cy: number,
    radius: number,
    color: string,
    size: number,
  ): void {
    const clamped = this.clampMinimapPoint(p, cx, cy, radius - size - 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(clamped.x, clamped.y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawMinimapSquare(
    ctx: CanvasRenderingContext2D,
    p: { x: number; y: number },
    cx: number,
    cy: number,
    radius: number,
    color: string,
    size: number,
  ): void {
    const clamped = this.clampMinimapPoint(p, cx, cy, radius - size - 2);
    ctx.fillStyle = color;
    ctx.fillRect(clamped.x - size, clamped.y - size, size * 2, size * 2);
  }

  private drawMinimapDiamond(
    ctx: CanvasRenderingContext2D,
    p: { x: number; y: number },
    cx: number,
    cy: number,
    radius: number,
    color: string,
    size: number,
  ): void {
    const clamped = this.clampMinimapPoint(p, cx, cy, radius - size - 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(clamped.x, clamped.y - size);
    ctx.lineTo(clamped.x + size, clamped.y);
    ctx.lineTo(clamped.x, clamped.y + size);
    ctx.lineTo(clamped.x - size, clamped.y);
    ctx.closePath();
    ctx.fill();
  }

  private clampMinimapPoint(
    p: { x: number; y: number },
    cx: number,
    cy: number,
    maxDistance: number,
  ): { x: number; y: number } {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const distance = Math.hypot(dx, dy);
    if (distance <= maxDistance || distance <= 0.001) return p;
    const ratio = maxDistance / distance;
    return { x: cx + dx * ratio, y: cy + dy * ratio };
  }

  private setMenuOpen(open: boolean): void {
    this.gameMenuOpen = open;
    this.gameMenu.classList.toggle('open', open);
    this.gameMenu.setAttribute('aria-hidden', String(!open));
  }

  private renderInventory(inventory: InventoryItem[]): void {
    this.inventorySlots.replaceChildren();
    const visibleInventory = inventory.filter((item) => !item.equipped);
    for (let i = 0; i < BAG_SLOT_COUNT; i++) {
      const item = visibleInventory[i];
      const interactive = !!item?.equipSlot || !!item?.usable;
      const slot = document.createElement(interactive ? 'button' : 'div');
      slot.className = 'inventory-slot';
      slot.setAttribute('aria-label', item ? item.name : `Slot ${i + 1}`);

      if (!item) {
        slot.classList.add('empty');
        this.inventorySlots.append(slot);
        continue;
      }

      slot.classList.add('filled');
      slot.title = item.name;
      if (item.equipped) slot.classList.add('equipped');
      // Cada arma tem sua própria borda colorida pela raridade.
      if (item.rarity) slot.style.borderColor = RARITY_COLORS[item.rarity];
      else if (isGemKind(item.kind)) slot.style.borderColor = GEM_GLOW_COLORS[item.glowGem ?? 'bless'];
      if (item.equipSlot) {
        (slot as HTMLButtonElement).type = 'button';
        // Equipa ESTA instância específica (por id), não "qualquer espada".
        slot.title = `${item.name} - botao direito equipa`;
        slot.addEventListener('click', () => this.onEquipItem(item.id));
        slot.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          this.onEquipItem(item.id);
        });
      } else if (item.usable) {
        (slot as HTMLButtonElement).type = 'button';
        slot.addEventListener('click', () => this.onUseItem(item.kind));
        slot.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          this.onUseItem(item.kind);
        });
      }

      const image = this.createItemIcon(item);
      slot.append(image);

      // Empilháveis mostram a quantidade; armas marcam "E" quando equipadas.
      if (item.stackable && item.count > 1) {
        const count = document.createElement('span');
        count.className = 'slot-count';
        count.textContent = String(item.count);
        slot.append(count);
      } else if (item.equipped) {
        const mark = document.createElement('span');
        mark.className = 'slot-count';
        mark.textContent = 'E';
        slot.append(mark);
      }

      // Faixa de dano da arma (ex.: "3–7") no canto, na cor da raridade.
      const range = weaponRange(item);
      if (range) {
        const badge = document.createElement('span');
        badge.className = 'weapon-damage-bonus';
        badge.textContent = range;
        if (item.rarity) badge.style.color = RARITY_COLORS[item.rarity];
        slot.append(badge);
      }
      const magic = magicRange(item);
      if (magic) {
        const badge = document.createElement('span');
        badge.className = 'weapon-damage-bonus magic-damage-bonus';
        badge.textContent = `Mag ${magic}`;
        badge.style.color = '#6ed8ff';
        slot.append(badge);
      }
      const upgrade = upgradeLabel(item);
      if (upgrade) {
        const badge = document.createElement('span');
        badge.className = 'weapon-upgrade-badge';
        badge.textContent = upgrade;
        if (item.glowGem) badge.style.color = GEM_GLOW_COLORS[item.glowGem];
        slot.append(badge);
      }
      if (item.element === 'fire') {
        const badge = document.createElement('span');
        badge.className = 'weapon-element-badge';
        badge.textContent = 'Fogo';
        slot.append(badge);
      }
      this.inventorySlots.append(slot);
    }
  }

  private renderHotbarEquipment(snapshot: WorldSnapshot): void {
    this.renderHotbarEquipmentSlot(this.hotbarWeaponSlot, snapshot, 'weapon', 'Espada');
    this.renderHotbarEquipmentSlot(this.hotbarOffhandSlot, snapshot, 'offhand', 'Off');
  }

  private renderHotbarEquipmentSlot(
    slotEl: HTMLElement,
    snapshot: WorldSnapshot,
    slot: EquipmentSlot,
    emptyLabel: string,
  ): void {
    const equippedId = snapshot.equipment[slot];
    const item = equippedId ? snapshot.inventory.find((candidate) => candidate.id === equippedId) : undefined;
    slotEl.replaceChildren();
    slotEl.classList.toggle('filled', !!item);
    slotEl.style.removeProperty('border-color');
    slotEl.title = item?.name ?? emptyLabel;
    slotEl.setAttribute('aria-label', item ? `${emptyLabel}: ${item.name}` : `${emptyLabel}: vazio`);
    slotEl.onclick = item ? () => this.onUnequipSlot(slot) : null;
    slotEl.oncontextmenu = item
      ? (event) => {
        event.preventDefault();
        this.onUnequipSlot(slot);
      }
      : null;
    slotEl.onkeydown = item
      ? (event) => {
        if (event.repeat) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.onUnequipSlot(slot);
      }
      : null;

    if (!item) {
      slotEl.removeAttribute('role');
      slotEl.removeAttribute('tabindex');
      const label = document.createElement('span');
      label.className = 'hotbar-equipment-label';
      label.textContent = emptyLabel;
      slotEl.append(label);
      return;
    }

    slotEl.setAttribute('role', 'button');
    slotEl.setAttribute('tabindex', '0');
    if (item.rarity) slotEl.style.borderColor = RARITY_COLORS[item.rarity];
    const image = this.createItemIcon(item);
    image.className = 'hotbar-equipment-icon';
    slotEl.append(image);
  }

  private renderCharacter(snapshot: WorldSnapshot, player: EntityState): void {
    const xp = player.xp ?? 0;
    const xpToNext = player.xpToNext ?? 1;
    const base = player.attackDamage ?? 0;
    const wMin = player.weaponDamageMin ?? 0;
    const wMax = player.weaponDamageMax ?? 0;
    const mMin = player.weaponMagicDamageMin ?? 0;
    const mMax = player.weaponMagicDamageMax ?? 0;
    const hasWeapon = wMax > 0;
    const hasMagic = mMax > 0;
    const stats = [
      ['Arma', hasWeapon ? `${wMin}–${wMax} dano` : 'Sem arma'],
      ['Dano magico', hasMagic ? `${mMin}â€“${mMax}` : '0'],
      ['Mana', `${Math.ceil(player.mana ?? 0)} / ${player.maxMana ?? 0}`],
      ['Dano base', String(base)],
      ['Dano total', hasWeapon ? `${base + wMin}–${base + wMax}` : String(base)],
      ['Total + mag', hasWeapon ? `${base + wMin}-${base + wMax}${hasMagic ? ` + ${mMin}-${mMax}` : ''}` : String(base)],
      ['Vel. ataque', `x${(player.attackSpeed ?? 1).toFixed(2)}`],
      ['Esquiva', percent(player.dodgeChance ?? 0)],
      ['Regen vida', `${(player.healthRegen ?? 0).toFixed(1)} /s`],
      ['Nível', String(player.level)],
      ['Vida', `${Math.ceil(player.hp)} / ${player.maxHp}`],
      ['EXP', `${xp} / ${xpToNext}`],
      ['Área', snapshot.zone === 'overworld' ? 'Terras de Aranna' : 'Câmara das Sombras'],
    ];

    this.characterStats.replaceChildren();
    for (const [label, value] of stats.slice(0, -1)) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const key = document.createElement('span');
      key.textContent = label;
      const val = document.createElement('strong');
      val.textContent = value;
      row.append(key, val);
      this.characterStats.append(row);
    }

    this.renderAttributes(player);
    this.equipmentSlots.replaceChildren();
    for (const { slot, label } of EQUIPMENT_SLOTS) {
      const equippedId = snapshot.equipment[slot];
      const item = equippedId ? snapshot.inventory.find((candidate) => candidate.id === equippedId) : undefined;
      const cell = document.createElement(equippedId ? 'button' : 'div');
      cell.className = `equipment-slot equipment-slot-${slot}`;
      cell.setAttribute('aria-label', item ? `${label}: ${item.name}` : `${label}: vazio`);

      const labelEl = document.createElement('span');
      labelEl.className = 'equipment-label';
      labelEl.textContent = label;

      const content = document.createElement('span');
      content.className = 'equipment-content';

      if (item) {
        cell.classList.add('filled');
        (cell as HTMLButtonElement).type = 'button';
        cell.addEventListener('click', () => this.onUnequipSlot(slot));
        cell.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          this.onUnequipSlot(slot);
        });
        if (item.rarity) cell.style.borderColor = RARITY_COLORS[item.rarity];
        const image = this.createItemIcon(item);
        content.append(image);
        const range = weaponRange(item);
        if (range) {
          const badge = document.createElement('span');
          badge.className = 'weapon-damage-bonus equipment-bonus';
          badge.textContent = range;
          if (item.rarity) badge.style.color = RARITY_COLORS[item.rarity];
          content.append(badge);
        }
        const magic = magicRange(item);
        if (magic) {
          const badge = document.createElement('span');
          badge.className = 'weapon-damage-bonus equipment-bonus magic-equipment-bonus';
          badge.textContent = `Mag ${magic}`;
          badge.style.color = '#6ed8ff';
          content.append(badge);
        }
        const upgrade = upgradeLabel(item);
        if (upgrade) {
          const badge = document.createElement('span');
          badge.className = 'weapon-upgrade-badge equipment-upgrade';
          badge.textContent = upgrade;
          if (item.glowGem) badge.style.color = GEM_GLOW_COLORS[item.glowGem];
          content.append(badge);
        }
        if (item.element === 'fire') {
          const badge = document.createElement('span');
          badge.className = 'weapon-element-badge equipment-element';
          badge.textContent = 'Fogo';
          content.append(badge);
        }
      } else {
        content.textContent = '';
      }

      cell.append(labelEl, content);
      this.equipmentSlots.append(cell);
    }
  }

  private renderAttributes(player: EntityState): void {
    this.attributeSection.replaceChildren();
    const attributes = player.attributes;
    if (!attributes) return;

    const header = document.createElement('div');
    header.className = 'attribute-header';
    const title = document.createElement('span');
    title.textContent = 'Atributos';
    const points = document.createElement('strong');
    points.textContent = `${attributes.unspentPoints} ponto${attributes.unspentPoints === 1 ? '' : 's'}`;
    header.append(title, points);
    this.attributeSection.append(header);

    const entries: { attribute: PlayerAttribute; label: string; effect: string }[] = [
      { attribute: 'strength', label: 'Força', effect: '+1 dano, +0.05 vida/s' },
      { attribute: 'agility', label: 'Agilidade', effect: '+2% vel. ataque, +1.2% esquiva' },
      { attribute: 'vitality', label: 'Vitalidade', effect: '+4 vida máxima' },
      { attribute: 'energy', label: 'Energia', effect: '+5 mana máxima' },
    ];

    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'attribute-row';
      const details = document.createElement('span');
      details.className = 'attribute-details';
      const label = document.createElement('strong');
      label.textContent = `${entry.label} ${attributes[entry.attribute]}`;
      const effect = document.createElement('small');
      effect.textContent = entry.effect;
      details.append(label, effect);

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'attribute-add';
      add.textContent = '+';
      add.title = `Adicionar ponto em ${entry.label}`;
      add.disabled = attributes.unspentPoints <= 0;
      add.addEventListener('click', () => this.onAllocateAttribute(entry.attribute));
      row.append(details, add);
      this.attributeSection.append(row);
    }
  }

  private createItemIcon(item: InventoryItem): HTMLImageElement {
    const image = document.createElement('img');
    image.src = item.icon;
    image.alt = item.name;
    image.loading = 'eager';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'item-icon-fallback';
      fallback.textContent = item.kind === 'sword'
        ? 'S'
        : isGemKind(item.kind)
          ? '*'
          : item.kind === 'potion'
            ? '+'
            : item.kind === 'mana_potion'
              ? 'M'
              : 'o';
      fallback.title = item.name;
      image.replaceWith(fallback);
    }, { once: true });
    return image;
  }
}
