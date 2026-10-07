import * as THREE from 'three';
import './style.css';
import { createWorld } from './world';
import { createUI, guideContent, icons } from './ui';
import { createWeapon } from './weapon';
import { GameAudio } from './audio';
import { Session, type GameMode } from './session';
import { SPAWN, MISSION_TARGETS, moveWithCollision, collides, compassLabel, formatTime } from './rules';

createUI();
const el = (id: string) => document.getElementById(id)!;
const canvas = el('world') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  el('loading').innerHTML = '<div class="unsupported">WebGL 2 is required to enter Kabul Recon.<br>Please enable hardware acceleration or try a supported desktop browser.</div>';
  throw new Error('WebGL 2 unavailable');
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const world = createWorld();
// Procedurally bake an outdoor reflection environment for glass and metal.
// No remote HDRI: the same sky palette supplies subtle physical highlights.
const reflectionScene = new THREE.Scene();
const reflectionGeometry = new THREE.SphereGeometry(100, 32, 16);
const vertices = reflectionGeometry.getAttribute('position');
const reflectionColors = new Float32Array(vertices.count * 3);
const skyTop = new THREE.Color('#8baebd'), horizon = new THREE.Color('#e5d9bf'), earth = new THREE.Color('#7e7661');
for (let i = 0; i < vertices.count; i++) {
  const height = vertices.getY(i) / 100;
  const color = height >= 0 ? horizon.clone().lerp(skyTop, Math.sqrt(height)) : horizon.clone().lerp(earth, Math.min(1, -height * 4));
  color.toArray(reflectionColors, i * 3);
}
reflectionGeometry.setAttribute('color', new THREE.BufferAttribute(reflectionColors, 3));
const reflectionMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
reflectionScene.add(new THREE.Mesh(reflectionGeometry, reflectionMaterial));
const environmentGenerator = new THREE.PMREMGenerator(renderer);
const environmentTarget = environmentGenerator.fromScene(reflectionScene, 0.03, 0.1, 200);
world.scene.environment = environmentTarget.texture;
world.scene.environmentIntensity = 0.42;
environmentGenerator.dispose(); reflectionGeometry.dispose(); reflectionMaterial.dispose();
const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
world.scene.traverse(object => {
  if (!(object instanceof THREE.Mesh)) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    if (material instanceof THREE.MeshStandardMaterial && material.map) material.map.anisotropy = anisotropy;
  }
});
const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.04, 1100);
camera.rotation.order = 'YXZ';
world.scene.add(camera);
const weapon = createWeapon();
camera.add(weapon.group);
const viewLight = new THREE.PointLight('#e9d6b7', 1.3, 3); viewLight.position.set(0, 0.3, 0.4); camera.add(viewLight);
const session = new Session();
const audio = new GameAudio();
const keys = new Set<string>();
const raycaster = new THREE.Raycaster();
const enemyRay = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let mode: GameMode = 'mission';
let started = false;
let locked = false;
let yaw = -0.07, pitch = 0.005;
let jumpY = 0, jumpVelocity = 0;
let fireHeld = false, aiming = false;
let fireCooldown = 0, recoil = 0, flashTime = 0;
let enemyCooldown = 3, stepDistance = 0;
let elapsedWorld = 0, bob = 0;
let notificationTimer = 0, damageTime = 0, hitTime = 0;
let mapOpen = false;
let fpsFrames = 0, fpsTime = 0;
let previousFocus: HTMLElement | null = null;
let quality = 'high', sensitivity = 1, fov = 67;
try {
  const saved = JSON.parse(localStorage.getItem('kabul-recon-settings') || '{}');
  if (['low', 'medium', 'high'].includes(saved.quality)) quality = saved.quality;
  if (Number.isFinite(saved.sensitivity)) sensitivity = THREE.MathUtils.clamp(saved.sensitivity, 0.3, 2.5);
  if (Number.isFinite(saved.fov)) fov = THREE.MathUtils.clamp(saved.fov, 55, 95);
  if (Number.isFinite(saved.volume)) audio.volume = THREE.MathUtils.clamp(saved.volume, 0, 1);
} catch { /* Browser storage is optional; defaults work in private sessions. */ }
function saveSettings() {
  try { localStorage.setItem('kabul-recon-settings', JSON.stringify({ quality, sensitivity, fov, volume: audio.volume })); }
  catch { notify('Settings applied for this session. Browser storage is unavailable.'); }
}
function applyQuality() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 1.5 : quality === 'medium' ? 1 : 0.75));
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.needsUpdate = true;
}
applyQuality();

const insertionMaterial = new THREE.MeshBasicMaterial({ color: '#d2b07a', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
const insertion = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.85, 48), insertionMaterial);
insertion.rotation.x = -Math.PI / 2; insertion.position.set(SPAWN.x, 0.05, SPAWN.z); world.scene.add(insertion);
const projectiles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
const projectileGeometry = new THREE.SphereGeometry(0.1, 6, 4);
const projectileMaterial = new THREE.MeshBasicMaterial({ color: '#ff944e' });
const effects: { points: THREE.Points; velocities: THREE.Vector3[]; life: number; maxLife: number }[] = [];

function notify(text: string, duration = 3) {
  el('notification').textContent = text;
  el('notification').classList.add('show');
  notificationTimer = duration;
}
function showModal(title: string, html: string) {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  el('modal-title').textContent = title;
  el('modal-content').innerHTML = html;
  el('modal').hidden = false;
  el('modal-close').focus();
}
function closeModal() {
  el('modal').hidden = true;
  mapOpen = false;
  if (started && !session.finished) showPause();
  else previousFocus?.focus();
}
function showPause() {
  mapOpen = false;
  showModal('OPERATION PAUSED', `
    <p class="modal-intro">Take a breath. The district will be here when you return.</p>
    <button class="deploy-button" id="resume"><span>RESUME OPERATION</span>${icons.arrow}</button>
    <div class="pause-actions"><button id="pause-guide">FIELD GUIDE</button><button id="pause-settings">SETTINGS</button><button id="pause-exit">END OPERATION</button></div>
    <p class="setting-note">The operation timer, drones, and incoming fire are paused.</p>`);
  el('resume').onclick = () => { requestLock(); };
  el('pause-guide').onclick = () => showModal('FIELD GUIDE', guideContent);
  el('pause-settings').onclick = showSettings;
  el('pause-exit').onclick = returnToMenu;
}
function showSettings() {
  showModal('YOUR SETUP', `
    <p class="modal-intro">Tune your perspective. Make the city your own.</p>
    <div class="setting-row"><label for="quality">Graphics quality<small>Resolution & real-time shadows</small></label><select id="quality"><option value="low">Performance</option><option value="medium">Balanced</option><option value="high">High detail</option></select></div>
    <div class="setting-row"><label for="sensitivity">Mouse sensitivity<small>Lower values for finer aiming</small></label><div class="setting-controls"><input id="sensitivity" type="range" min="0.3" max="2.5" step="0.1" value="${sensitivity}"><span class="setting-value" id="sensitivity-value">${sensitivity.toFixed(1)}</span></div></div>
    <div class="setting-row"><label for="fov">Field of view<small>Your first-person viewing angle</small></label><div class="setting-controls"><input id="fov" type="range" min="55" max="95" step="1" value="${fov}"><span class="setting-value" id="fov-value">${fov}°</span></div></div>
    <div class="setting-row"><label for="volume">Audio volume<small>Wind, footsteps & weapon effects</small></label><div class="setting-controls"><input id="volume" type="range" min="0" max="1" step="0.05" value="${audio.volume}"><span class="setting-value" id="volume-value">${Math.round(audio.volume * 100)}%</span></div></div>
    <div class="setting-row"><label for="sound">Enable audio</label><input id="sound" type="checkbox" ${audio.enabled ? 'checked' : ''}></div>
    <p class="settings-saved">Changes apply instantly and save on this device.</p>`);
  (el('quality') as HTMLSelectElement).value = quality;
  el('quality').onchange = () => { quality = (el('quality') as HTMLSelectElement).value; applyQuality(); saveSettings(); };
  el('sensitivity').oninput = () => { sensitivity = Number((el('sensitivity') as HTMLInputElement).value); el('sensitivity-value').textContent = sensitivity.toFixed(1); saveSettings(); };
  el('fov').oninput = () => { fov = Number((el('fov') as HTMLInputElement).value); el('fov-value').textContent = `${fov}°`; saveSettings(); };
  el('volume').oninput = () => { audio.setVolume(Number((el('volume') as HTMLInputElement).value)); el('volume-value').textContent = `${Math.round(audio.volume * 100)}%`; saveSettings(); };
  el('sound').onchange = () => { void toggleAudio((el('sound') as HTMLInputElement).checked); };
}
async function toggleAudio(enabled?: boolean) {
  try {
    await audio.toggle(enabled);
    el('audio-label').textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF';
    el('audio-toggle').setAttribute('aria-label', audio.enabled ? 'Disable audio' : 'Enable audio');
  } catch { notify('Audio could not start. Check your browser audio permissions.'); }
}
function selectMode(next: GameMode) {
  if (started && !locked) returnToMenu();
  mode = next;
  for (const [id, active] of [['mode-mission', mode === 'mission'], ['mode-explore', mode === 'explore']] as const) {
    el(id).classList.toggle('active', active); el(id).setAttribute('aria-selected', String(active));
  }
  el('brief-label').textContent = mode === 'mission' ? 'YOUR OBJECTIVE' : 'NO OBJECTIVE. JUST DISCOVERY.';
  el('brief-text').innerHTML = mode === 'mission' ? 'Locate and neutralize 6 rogue drones.<br>Secure the district. Return to extraction.' : 'Explore the streets at your own pace.<br>No hostile drones. An open perspective.';
  el('deploy-label').textContent = mode === 'mission' ? 'DEPLOY TO KABUL' : 'EXPLORE KABUL';
  document.querySelector('.brief-index')!.textContent = mode === 'mission' ? '01—06' : '∞';
}
function setMenuVisibility(visible: boolean) {
  for (const id of ['topbar', 'main-menu', 'district-tag', 'footer']) el(id).hidden = !visible;
  document.body.classList.toggle('playing', !visible);
  el('game-hud').hidden = visible;
}
function resetWorld() {
  for (const drone of world.drones) { drone.alive = true; drone.group.visible = mode === 'mission'; }
  for (const p of projectiles) world.scene.remove(p.mesh);
  projectiles.length = 0;
  for (const e of effects) { world.scene.remove(e.points); e.points.geometry.dispose(); (e.points.material as THREE.Material).dispose(); }
  effects.length = 0;
}
function returnToMenu() {
  started = false; locked = false; fireHeld = aiming = false; keys.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  el('modal').hidden = true; el('result').hidden = true; el('interaction').hidden = true;
  el('objective-marker').style.display = 'none';
  el('damage-overlay').classList.remove('hit');
  setMenuVisibility(true); resetWorld();
  // Drones are part of the cinematic environment even before choosing a mode.
  world.drones.forEach(drone => { drone.group.visible = true; });
  insertionMaterial.color.set('#d2b07a');
  camera.position.set(0, 3.15, 53); yaw = -0.07; pitch = 0.005;
  weapon.group.visible = true;
  el('deploy').focus();
}
async function requestLock() {
  if (!canvas.requestPointerLock) { notify('Pointer lock is unavailable. Use a desktop browser with keyboard and mouse.'); return; }
  try { await canvas.requestPointerLock(); }
  catch { notify('Click Deploy again to capture your cursor. The preview may need to be opened in a separate browser tab.', 6); }
}
function startGame() {
  if (!started) {
    session.reset(mode); resetWorld();
    camera.position.set(SPAWN.x, 1.72, SPAWN.z); yaw = pitch = jumpY = jumpVelocity = 0;
    recoil = 0; fireCooldown = 0; enemyCooldown = 4; stepDistance = 0;
    el('objective-heading').textContent = mode === 'mission' ? 'OPERATION FIRST LIGHT' : 'FREE ROAM / KABUL';
    el('objective-text').textContent = mode === 'mission' ? 'Neutralize the rogue drones' : 'Explore the district at your own pace';
    el('objective-count').textContent = mode === 'mission' ? '00 / 06' : 'NO HOSTILES';
    el('objective-fill').style.width = '0%';
    started = true;
  }
  void requestLock();
}
el('deploy').onclick = startGame;
el('home').onclick = event => { event.preventDefault(); returnToMenu(); };
el('nav-operation').onclick = () => { el('modal').hidden = true; };
el('nav-guide').onclick = () => showModal('FIELD GUIDE', guideContent);
el('nav-settings').onclick = showSettings;
el('audio-toggle').onclick = () => { void toggleAudio(); };
el('mode-mission').onclick = () => selectMode('mission');
el('mode-explore').onclick = () => selectMode('explore');
el('modal-close').onclick = closeModal;
el('restart').onclick = returnToMenu;
el('modal').addEventListener('click', event => { if (event.target === el('modal')) closeModal(); });

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  keys.clear(); fireHeld = aiming = false;
  if (locked) {
    el('modal').hidden = true; mapOpen = false; setMenuVisibility(false);
    notify(session.elapsed < 1 ? (mode === 'mission' ? 'FIRST LIGHT  /  Follow the amber markers. Stay on the move.' : 'FREE ROAM  /  The city is yours to explore.') : 'Operation resumed.');
  } else if (started && !session.finished && el('modal').hidden) {
    showPause();
  }
});
document.addEventListener('pointerlockerror', () => notify('Cursor capture was blocked. Open the preview in a browser tab and click Deploy again.', 6));
document.addEventListener('mousemove', event => {
  if (!locked) return;
  const multiplier = 0.00165 * sensitivity * (aiming ? 0.6 : 1);
  yaw -= event.movementX * multiplier;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * multiplier, -1.45, 1.45);
});
document.addEventListener('mousedown', event => {
  if (!locked) return;
  if (event.button === 0) fireHeld = true;
  if (event.button === 2) aiming = true;
});
document.addEventListener('mouseup', event => {
  if (event.button === 0) fireHeld = false;
  if (event.button === 2) aiming = false;
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('blur', () => {
  keys.clear(); fireHeld = aiming = false;
  if (locked) document.exitPointerLock();
});
document.addEventListener('keydown', event => {
  if (!el('modal').hidden) {
    if (event.code === 'Escape') { event.preventDefault(); closeModal(); }
    if (event.code === 'Tab') {
      const focusables = Array.from(el('modal').querySelectorAll<HTMLElement>('button,input,select'));
      const first = focusables[0], last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (!locked) return;
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'Space' && jumpY === 0) jumpVelocity = 5.8;
  if (event.code === 'KeyR') reload();
  if (event.code === 'KeyM') showMap();
  if (event.code === 'KeyE' && session.resupply(spawnDistance())) { notify('Ammunition resupplied. 30 / 120'); audio.reload(); }
});
document.addEventListener('keyup', event => keys.delete(event.code));
function spawnDistance() { return Math.hypot(camera.position.x - SPAWN.x, camera.position.z - SPAWN.z); }
function reload() {
  if (session.reload()) { notify('RELOADING', 1.7); audio.reload(); }
  else if (session.reserve === 0) notify('No reserve ammunition. Return to insertion to resupply.');
}
function burst(position: THREE.Vector3, color = '#f3bd76', count = 35) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    position.toArray(positions, i * 3);
    velocities.push(new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9));
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size: 0.1, transparent: true, opacity: 1, depthWrite: false });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false;
  world.scene.add(points); effects.push({ points, velocities, life: 0.8, maxLife: 0.8 });
}
function fire() {
  if (fireCooldown > 0 || session.reloadRemaining > 0) return;
  if (!session.shoot()) { if (session.ammo === 0) reload(); return; }
  fireCooldown = 0.115; recoil = Math.min(0.07, recoil + 0.035); flashTime = 0.05;
  audio.shoot();
  // Camera matrices must be current before the shot, not last frame's render.
  camera.updateMatrixWorld(); world.scene.updateMatrixWorld();
  raycaster.setFromCamera(pointer, camera); raycaster.far = 180;
  const droneObjects = world.drones.filter(drone => drone.alive && drone.group.visible).map(drone => drone.group);
  const hits = raycaster.intersectObjects([...world.staticMeshes, ...droneObjects], true);
  if (!hits.length) return;
  const hit = hits[0];
  let object: THREE.Object3D | null = hit.object;
  while (object && object.userData.droneIndex === undefined) object = object.parent;
  if (object) {
    const drone = world.drones[object.userData.droneIndex as number];
    if (drone.alive) {
      drone.alive = false; drone.group.visible = false; session.neutralize();
      burst(drone.group.position, '#ffc27a', 55); audio.explosion(); audio.hit(); hitTime = 0.16;
      if (session.kills === MISSION_TARGETS) {
        notify('ALL DRONES NEUTRALIZED  /  Return to insertion for extraction.', 5);
        el('objective-text').textContent = 'Return to insertion. Extract from the district.';
        insertionMaterial.color.set('#9bd0b0');
      } else notify(`DRONE NEUTRALIZED  /  ${session.kills} of ${MISSION_TARGETS} secured`, 2);
      el('objective-count').textContent = `${String(session.kills).padStart(2, '0')} / 06`;
      el('objective-fill').style.width = `${session.kills / MISSION_TARGETS * 100}%`;
    }
  } else burst(hit.point, '#c8bfa2', 9);
}
function incomingFire() {
  if (mode !== 'mission' || session.finished) return;
  const candidates = world.drones.filter(drone => drone.alive && drone.group.position.distanceTo(camera.position) < 45);
  if (!candidates.length) return;
  const drone = candidates.reduce((nearest, current) => current.group.position.distanceTo(camera.position) < nearest.group.position.distanceTo(camera.position) ? current : nearest);
  const origin = drone.group.position.clone();
  const target = camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.1, -0.25, (Math.random() - 0.5) * 1.1));
  const direction = target.sub(origin).normalize();
  enemyRay.set(origin, direction); enemyRay.far = origin.distanceTo(camera.position);
  if (enemyRay.intersectObjects(world.staticMeshes, true).length) return;
  const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial); mesh.position.copy(origin);
  world.scene.add(mesh); projectiles.push({ mesh, velocity: direction.multiplyScalar(19), life: 3 });
  audio.tone(240, 0.12, 0.08);
}
function finish(success: boolean) {
  session.finished = true; locked = false; fireHeld = aiming = false; keys.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  el('modal').hidden = true; el('result').hidden = false; el('game-hud').hidden = true;
  el('objective-marker').style.display = 'none'; el('interaction').hidden = true;
  el('result-eyebrow').textContent = success ? 'OPERATION COMPLETE' : 'OPERATION INTERRUPTED';
  el('result-title').textContent = success ? 'DISTRICT SECURED.' : 'SIGNAL LOST.';
  el('result-description').textContent = success ? 'The skies are clear. You made it home. A job well done.' : 'The drones overwhelmed your position. Regroup and try a new approach.';
  el('result-kills').textContent = `${session.kills} / 6`;
  el('result-time').textContent = formatTime(session.elapsed);
  el('result-accuracy').textContent = `${session.accuracy}%`;
  audio.tone(success ? 620 : 160, 0.5, 0.17);
  el('restart').focus();
}
function showMap() {
  // Open before releasing pointer lock so its change event doesn't overwrite this dialog.
  showModal('THE DISTRICT', `<p class="modal-intro">Your live tactical overview. North is up.</p><canvas id="tactical-map" class="tactical-canvas" width="520" height="430" aria-label="Tactical map of the district showing player, drone and extraction positions"></canvas><div class="map-legend"><span><i class="map-dot player"></i> YOUR POSITION</span><span><i class="map-dot"></i> ROGUE DRONE</span><span><i class="map-dot extraction"></i> EXTRACTION</span></div><p class="setting-note">Close the map, then resume the operation to recapture your cursor.</p>`);
  mapOpen = true;
  document.exitPointerLock();
  drawMap();
}
function drawMap() {
  const map = el('tactical-map') as HTMLCanvasElement;
  const ctx = map.getContext('2d')!;
  const sx = (x: number) => 260 + x * 2.8;
  const sz = (z: number) => (z + 132) * 1.65 + 8;
  ctx.fillStyle = '#182529'; ctx.fillRect(0, 0, 520, 430);
  ctx.strokeStyle = '#243639'; ctx.lineWidth = 1;
  for (let x = 0; x < 520; x += 26) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 430); ctx.stroke(); }
  for (let y = 0; y < 430; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(520, y); ctx.stroke(); }
  ctx.fillStyle = '#35443e';
  for (const box of world.collisions) ctx.fillRect(sx(box.minX), sz(box.minZ), (box.maxX - box.minX) * 2.8, (box.maxZ - box.minZ) * 1.65);
  ctx.strokeStyle = '#d2b078'; ctx.setLineDash([4, 6]);
  ctx.beginPath(); ctx.moveTo(sx(0), 5); ctx.lineTo(sx(0), 410); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#95c6a4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(sx(SPAWN.x), sz(SPAWN.z), 8, 0, Math.PI * 2); ctx.stroke();
  if (mode === 'mission') for (const drone of world.drones) {
    if (!drone.alive) continue;
    ctx.fillStyle = '#e9b475'; ctx.beginPath(); ctx.arc(sx(drone.group.position.x), sz(drone.group.position.z), 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); ctx.translate(sx(camera.position.x), sz(camera.position.z)); ctx.rotate(-yaw);
  ctx.fillStyle = '#e3efda'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.font = '12px Barlow'; ctx.fillStyle = '#e9b475'; ctx.fillText('N ↑', 24, 27);
  ctx.font = '9px Barlow'; ctx.fillStyle = '#9aa990'; ctx.fillText('SHAHR-E NAW  /  SECTOR 04', 24, 409);
}
function updateMarker() {
  const marker = el('objective-marker');
  if (!locked || mode !== 'mission') { marker.style.display = 'none'; return; }
  const target = session.kills === MISSION_TARGETS
    ? new THREE.Vector3(SPAWN.x, 1.2, SPAWN.z)
    : world.drones.filter(drone => drone.alive).sort((a, b) => a.group.position.distanceTo(camera.position) - b.group.position.distanceTo(camera.position))[0]?.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
  if (!target) { marker.style.display = 'none'; return; }
  const distance = camera.position.distanceTo(target);
  const projected = target.clone().project(camera);
  if (projected.z < -1 || projected.z > 1) { marker.style.display = 'none'; return; }
  marker.style.display = 'block';
  marker.style.left = `${THREE.MathUtils.clamp((projected.x * 0.5 + 0.5) * innerWidth, 25, innerWidth - 25)}px`;
  marker.style.top = `${THREE.MathUtils.clamp((-projected.y * 0.5 + 0.5) * innerHeight, 75, innerHeight - 180)}px`;
  el('marker-distance').textContent = `${Math.round(distance)} M`;
}

function updatePlayer(dt: number) {
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const sideways = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const moving = forward !== 0 || sideways !== 0;
  const sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !aiming && forward > 0;
  const speed = sprint ? 7.2 : aiming ? 2.5 : 4.1;
  const norm = Math.max(1, Math.hypot(forward, sideways));
  const delta = {
    x: (-Math.sin(yaw) * forward + Math.cos(yaw) * sideways) / norm * speed * dt,
    z: (-Math.cos(yaw) * forward - Math.sin(yaw) * sideways) / norm * speed * dt,
  };
  const position = moveWithCollision(camera.position, delta, world.collisions);
  const traveled = Math.hypot(position.x - camera.position.x, position.z - camera.position.z);
  camera.position.x = position.x; camera.position.z = position.z;
  if (jumpVelocity !== 0 || jumpY > 0) {
    jumpVelocity -= 16 * dt; jumpY += jumpVelocity * dt;
    if (jumpY <= 0) { jumpY = jumpVelocity = 0; audio.step(); }
  }
  stepDistance += traveled;
  if (stepDistance > (sprint ? 2.4 : 1.8) && jumpY === 0) { audio.step(); stepDistance = 0; }
  bob += moving ? dt * (sprint ? 13 : 8) : dt * 2;
  camera.position.y = 1.72 + jumpY + (moving && jumpY === 0 ? Math.sin(bob) * 0.026 : 0);
  camera.rotation.set(pitch + recoil * 0.5, yaw, 0, 'YXZ');
  fireCooldown = Math.max(0, fireCooldown - dt);
  if (fireHeld && !sprint) fire();
  if (session.update(dt)) { audio.reload(); notify('Magazine ready.', 1); }
  enemyCooldown -= dt;
  if (enemyCooldown <= 0) { enemyCooldown = 1.65; incomingFire(); }
  if (session.extract(spawnDistance())) finish(true);
  if (session.health <= 0 && el('result').hidden) finish(false);
  el('interaction').hidden = spawnDistance() >= 5 || session.finished;
}
function updateEffects(dt: number) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.life -= dt;
    if (e.life <= 0) {
      world.scene.remove(e.points); e.points.geometry.dispose(); (e.points.material as THREE.Material).dispose(); effects.splice(i, 1); continue;
    }
    const positions = e.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let j = 0; j < e.velocities.length; j++) {
      const v = e.velocities[j]; v.y -= dt * 9.8;
      positions.setXYZ(j, positions.getX(j) + v.x * dt, positions.getY(j) + v.y * dt, positions.getZ(j) + v.z * dt);
    }
    positions.needsUpdate = true;
    (e.points.material as THREE.PointsMaterial).opacity = e.life / e.maxLife;
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]; p.life -= dt;
    p.mesh.position.addScaledVector(p.velocity, dt);
    const body = camera.position.clone().add(new THREE.Vector3(0, -0.5, 0));
    const hitPlayer = p.mesh.position.distanceTo(body) < 0.85;
    if (hitPlayer) {
      session.damage(13); damageTime = 0.3; audio.noise(0.14, 0.3, 650);
    }
    if (hitPlayer || p.life <= 0 || p.mesh.position.y <= 0.1 || collides(p.mesh.position.x, p.mesh.position.z, world.collisions, 0.03)) {
      world.scene.remove(p.mesh); projectiles.splice(i, 1);
    }
  }
}
function animate(now: number) {
  const frameSeconds = (now - lastTime) / 1000;
  const dt = Math.min(frameSeconds, 0.05); lastTime = now;
  if (locked || !started) { elapsedWorld += dt; world.update(elapsedWorld, camera.position); }
  if (locked && !session.finished) {
    updatePlayer(dt);
    if (!session.finished) updateEffects(dt);
    if (session.health <= 0 && el('result').hidden) finish(false);
  }
  if (!started) {
    camera.position.set(Math.sin(elapsedWorld * 0.035) * 0.3, 3.15, 53);
    camera.rotation.set(0.005 + Math.sin(elapsedWorld * 0.04) * 0.002, -0.07 + Math.sin(elapsedWorld * 0.025) * 0.008, 0, 'YXZ');
  }
  recoil *= Math.exp(-dt * 17); flashTime = Math.max(0, flashTime - dt);
  const aim = aiming && locked ? 1 : 0;
  const smoothing = 1 - Math.exp(-dt * 14);
  const reloading = session.reloadRemaining > 0 && locked;
  weapon.group.position.x = THREE.MathUtils.lerp(weapon.group.position.x, aim ? 0 : 0.27, smoothing);
  weapon.group.position.y = THREE.MathUtils.lerp(weapon.group.position.y, (aim ? -0.16 : -0.27) - (reloading ? 0.22 : 0) + (locked ? Math.sin(bob) * 0.008 : 0), smoothing);
  weapon.group.position.z = -0.43 + recoil;
  weapon.group.rotation.z = THREE.MathUtils.lerp(weapon.group.rotation.z, reloading ? -0.4 : 0, smoothing);
  weapon.group.rotation.x = recoil * 0.8;
  weapon.flash.visible = flashTime > 0;
  weapon.flash.rotation.y = Math.random() * Math.PI;
  weapon.flashLight.intensity = flashTime > 0 ? 4 : 0;
  camera.fov = THREE.MathUtils.lerp(camera.fov, started ? (aim ? fov * 0.7 : fov) : 67, smoothing); camera.updateProjectionMatrix();
  el('crosshair').classList.toggle('aiming', aiming);
  notificationTimer = Math.max(0, notificationTimer - dt);
  if (notificationTimer === 0) el('notification').classList.remove('show');
  damageTime = Math.max(0, damageTime - dt); hitTime = Math.max(0, hitTime - dt);
  el('damage-overlay').classList.toggle('hit', damageTime > 0);
  el('hitmarker').style.opacity = hitTime > 0 ? '1' : '0';
  if (started) {
    el('ammo').textContent = session.reloadRemaining > 0 ? '··' : String(session.ammo).padStart(2, '0');
    el('reserve').textContent = String(session.reserve);
    el('health').textContent = String(Math.ceil(session.health));
    el('health-fill').style.width = `${session.health}%`;
    el('mission-timer').textContent = formatTime(session.elapsed);
    el('bearing').textContent = compassLabel(yaw);
  }
  insertion.rotation.z = elapsedWorld * 0.06;
  insertionMaterial.opacity = 0.35 + Math.sin(elapsedWorld * 2) * 0.1;
  renderer.render(world.scene, camera);
  updateMarker();
  if (mapOpen) drawMap();
  fpsFrames++; fpsTime += frameSeconds;
  if (fpsTime > 1) { el('fps').textContent = String(Math.round(fpsFrames / fpsTime)); fpsFrames = fpsTime = 0; }
  requestAnimationFrame(animate);
}
let lastTime = performance.now();
returnToMenu();
renderer.render(world.scene, camera);
el('loading').style.opacity = '0';
setTimeout(() => { el('loading').hidden = true; }, 500);
requestAnimationFrame(animate);
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  if (document.pointerLockElement) document.exitPointerLock();
  notify('Graphics connection lost. Reload the page to restore the environment.', 60);
});
