import test from 'node:test';
import assert from 'node:assert/strict';
import { collides, moveWithCollision, seededRandom, compassLabel, formatTime } from '../src/rules.ts';
import { Session } from '../src/session.ts';
const wall = { minX: 1, maxX: 2, minZ: -10, maxZ: 10 };
test('player collision prevents crossing walls even with large frame deltas', () => {
  assert.equal(collides(1.5, 0, [wall]), true);
  assert.equal(collides(0, 0, [wall]), false);
  const result = moveWithCollision({ x: 0, z: 0 }, { x: 10, z: 3 }, [wall]);
  assert.ok(result.x < 0.63); assert.ok(Math.abs(result.z - 3) < 1e-10);
});
test('player slides along obstacles and remains inside world boundaries', () => {
  const result = moveWithCollision({ x: 0.5, z: 0 }, { x: 1, z: 1 }, [wall]);
  assert.ok(result.x < 0.63); assert.ok(Math.abs(result.z - 1) < 1e-10);
  const bounded = moveWithCollision({ x: 66, z: -122 }, { x: 10, z: -10 }, []);
  assert.equal(bounded.x, 67); assert.equal(bounded.z, -123);
});
test('world is deterministic; random values stay in range', () => {
  const a = seededRandom(42), b = seededRandom(42);
  for (let i = 0; i < 1000; i++) { const value = a(); assert.equal(value, b()); assert.ok(value >= 0 && value < 1); }
});
test('compass handles negative and wrapped angles', () => {
  assert.equal(compassLabel(0), 'N'); assert.equal(compassLabel(-Math.PI / 2), 'E');
  assert.equal(compassLabel(Math.PI), 'S'); assert.equal(compassLabel(Math.PI / 2), 'W');
  assert.equal(compassLabel(Math.PI * 4), 'N'); assert.equal(formatTime(125.9), '02:05');
});
test('ammunition, reloading, and reserve accounting', () => {
  const s = new Session();
  for (let i = 0; i < 30; i++) assert.equal(s.shoot(), true);
  assert.equal(s.shoot(), false); assert.equal(s.ammo, 0); assert.equal(s.shots, 30);
  assert.equal(s.reload(), true); assert.equal(s.shoot(), false);
  s.update(1); assert.equal(s.ammo, 0);
  s.update(0.8); assert.equal(s.ammo, 30); assert.equal(s.reserve, 90);
  assert.equal(s.reload(), false);
});
test('partial reloads consume only the necessary reserve', () => {
  const s = new Session(); s.shoot(); s.shoot(); s.reserve = 1;
  s.reload(); s.update(2); assert.equal(s.ammo, 29); assert.equal(s.reserve, 0);
  assert.equal(s.reload(), false);
});
test('mission requires all six targets and a return to extraction', () => {
  const s = new Session(); assert.equal(s.extract(1), false);
  for (let i = 0; i < 6; i++) { s.shoot(); s.neutralize(); }
  assert.equal(s.accuracy, 100); assert.equal(s.extract(30), false);
  assert.equal(s.extract(3), true); assert.equal(s.finished, true); assert.equal(s.shoot(), false);
});
test('damage, regeneration, failure, reset, and peaceful exploration', () => {
  const s = new Session(); s.damage(26); assert.equal(s.health, 74);
  s.update(5); assert.equal(s.health, 74); s.update(2); assert.ok(s.health > 74);
  s.damage(100); assert.equal(s.finished, true); assert.equal(s.health, 0);
  s.reset('explore'); s.damage(100); assert.equal(s.health, 100); assert.equal(s.finished, false);
  assert.equal(s.extract(1), false);
});
test('resupply works only at the insertion point', () => {
  const s = new Session(); s.shoot(); s.reserve = 0;
  assert.equal(s.resupply(10), false); assert.equal(s.resupply(2), true);
  assert.equal(s.ammo, 30); assert.equal(s.reserve, 120);
});
