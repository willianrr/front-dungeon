import type { V3 } from '../shared/mathx';

export interface KeyboardMoveAxes {
  strafe: number;
  forward: number;
}

export interface KeyboardMoveDirection {
  x: number;
  z: number;
}

export interface KeyboardMoveSample {
  dt: number;
  movementChanged: boolean;
  axes: KeyboardMoveAxes;
  running: boolean;
  player?: Pick<V3, 'x' | 'z'>;
  direction: KeyboardMoveDirection;
}

export type KeyboardMoveDecision =
  | { type: 'none' }
  | { type: 'move'; target: V3; run: boolean };

interface KeyboardMoveIntent {
  strafe: number;
  forward: number;
  run: boolean;
  dirX: number;
  dirZ: number;
  targetX: number;
  targetZ: number;
}

const KEYBOARD_MOVE_TARGET_DISTANCE = 18;
const KEYBOARD_MOVE_REFRESH_DISTANCE = 4.5;
const KEYBOARD_MOVE_REFRESH_COOLDOWN = 0.35;
const KEYBOARD_MOVE_DIRECTION_EPSILON = 0.08;

export class KeyboardMoveController {
  private intent: KeyboardMoveIntent | null = null;
  private refreshCooldown = 0;

  update(sample: KeyboardMoveSample): KeyboardMoveDecision {
    const { axes, direction, movementChanged, player, running } = sample;
    const moving = axes.strafe !== 0 || axes.forward !== 0;
    this.refreshCooldown = Math.max(0, this.refreshCooldown - sample.dt);

    if (!moving) {
      const shouldStop = movementChanged && this.intent && player;
      this.intent = null;
      this.refreshCooldown = 0;
      if (!shouldStop) return { type: 'none' };
      return { type: 'move', target: { x: player.x, y: 0, z: player.z }, run: false };
    }

    if (!player || (direction.x === 0 && direction.z === 0)) return { type: 'none' };

    const movementShapeChanged =
      !this.intent ||
      movementChanged ||
      this.intent.strafe !== axes.strafe ||
      this.intent.forward !== axes.forward ||
      this.intent.run !== running;
    const directionChanged = this.intent
      ? Math.hypot(this.intent.dirX - direction.x, this.intent.dirZ - direction.z) >= KEYBOARD_MOVE_DIRECTION_EPSILON
      : false;

    const targetNearlyReached = this.intent
      ? Math.hypot(this.intent.targetX - player.x, this.intent.targetZ - player.z) <= KEYBOARD_MOVE_REFRESH_DISTANCE
      : false;

    if (!movementShapeChanged && this.refreshCooldown > 0) return { type: 'none' };
    if (!movementShapeChanged && !directionChanged && !targetNearlyReached) return { type: 'none' };

    const targetX = player.x + direction.x * KEYBOARD_MOVE_TARGET_DISTANCE;
    const targetZ = player.z + direction.z * KEYBOARD_MOVE_TARGET_DISTANCE;
    this.intent = {
      strafe: axes.strafe,
      forward: axes.forward,
      run: running,
      dirX: direction.x,
      dirZ: direction.z,
      targetX,
      targetZ,
    };
    this.refreshCooldown = KEYBOARD_MOVE_REFRESH_COOLDOWN;
    return { type: 'move', target: { x: targetX, y: 0, z: targetZ }, run: running };
  }
}
