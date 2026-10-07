export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
export type Vec2 = { x: number; z: number };
export const PLAYER_RADIUS = 0.38;
export const MAGAZINE_SIZE = 30;
export const MISSION_TARGETS = 6;
export const SPAWN = { x: 0, z: 46 };

export function collides(x: number, z: number, boxes: Box[], radius = PLAYER_RADIUS): boolean {
  return boxes.some(box => x + radius > box.minX && x - radius < box.maxX && z + radius > box.minZ && z - radius < box.maxZ);
}

export function moveWithCollision(position: Vec2, delta: Vec2, boxes: Box[]): Vec2 {
  let { x, z } = position;
  // Small substeps prevent sprinting through thin objects after a slow frame.
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / (PLAYER_RADIUS * 0.5)));
  for (let i = 0; i < steps; i++) {
    const nextX = Math.max(-67, Math.min(67, x + delta.x / steps));
    const nextZ = Math.max(-123, Math.min(98, z + delta.z / steps));
    if (!collides(nextX, z, boxes)) x = nextX;
    if (!collides(x, nextZ, boxes)) z = nextZ;
  }
  return { x, z };
}

export function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function compassLabel(yaw: number): string {
  const heading = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(heading / 45) % 8];
}

export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
