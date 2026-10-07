import { MAGAZINE_SIZE, MISSION_TARGETS } from './rules.ts';
export type GameMode = 'mission' | 'explore';
export class Session {
  mode: GameMode = 'mission';
  health = 100;
  ammo = MAGAZINE_SIZE;
  reserve = 120;
  kills = 0;
  shots = 0;
  hits = 0;
  elapsed = 0;
  reloadRemaining = 0;
  damageCooldown = 0;
  finished = false;

  reset(mode: GameMode) {
    this.mode = mode;
    this.health = 100; this.ammo = MAGAZINE_SIZE; this.reserve = 120;
    this.kills = this.shots = this.hits = this.elapsed = this.reloadRemaining = this.damageCooldown = 0;
    this.finished = false;
  }
  shoot(): boolean {
    if (this.finished || this.reloadRemaining > 0 || this.ammo === 0) return false;
    this.ammo--; this.shots++; return true;
  }
  reload(): boolean {
    if (this.finished || this.reloadRemaining > 0 || this.ammo === MAGAZINE_SIZE || this.reserve === 0) return false;
    this.reloadRemaining = 1.7; return true;
  }
  update(dt: number): boolean {
    if (this.finished) return false;
    this.elapsed += dt;
    let reloaded = false;
    if (this.reloadRemaining > 0) {
      this.reloadRemaining = Math.max(0, this.reloadRemaining - dt);
      if (this.reloadRemaining === 0) {
        const amount = Math.min(MAGAZINE_SIZE - this.ammo, this.reserve);
        this.ammo += amount; this.reserve -= amount; reloaded = true;
      }
    }
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    if (this.damageCooldown === 0 && this.health > 0) this.health = Math.min(100, this.health + dt * 3);
    return reloaded;
  }
  damage(amount: number) {
    if (this.mode === 'explore' || this.finished) return;
    this.health = Math.max(0, this.health - amount); this.damageCooldown = 6;
    if (this.health === 0) this.finished = true;
  }
  neutralize() {
    if (this.finished || this.mode !== 'mission' || this.kills === MISSION_TARGETS) return;
    this.kills++; this.hits++;
  }
  extract(distance: number): boolean {
    if (this.mode === 'mission' && !this.finished && this.kills === MISSION_TARGETS && distance < 4) {
      this.finished = true; return true;
    }
    return false;
  }
  resupply(distance: number): boolean {
    if (this.finished || distance >= 5) return false;
    this.ammo = MAGAZINE_SIZE; this.reserve = 120; this.reloadRemaining = 0;
    return true;
  }
  get accuracy() { return this.shots === 0 ? 0 : Math.round(this.hits / this.shots * 100); }
}
