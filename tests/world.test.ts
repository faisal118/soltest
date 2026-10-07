import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import * as THREE from 'three';
import { collides, SPAWN } from '../src/rules.ts';

test('actual city geometry, drone animation, and playable street layout', async t => {
  // Canvas textures require a DOM. Stub only the painting API here, not Three.js
  // or world geometry; actual browser texture rendering remains an interactive check.
  const context = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: '', font: '',
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {}, closePath() {}, fill() {}, arc() {},
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ ...context }) }) },
  });
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { createWorld } = await server.ssrLoadModule('/src/world.ts');
    const world = createWorld();
    assert.equal(world.drones.length, 6);
    assert.ok(world.collisions.length > 40);
    assert.equal(collides(SPAWN.x, SPAWN.z, world.collisions), false);
    // A continuous central route must connect insertion to every target.
    for (let z = -123; z <= SPAWN.z; z++) assert.equal(collides(0, z, world.collisions), false, `blocked street at ${z}`);
    const batches = world.staticMeshes.filter((mesh: { isInstancedMesh?: boolean }) => mesh.isInstancedMesh);
    const detailCount = batches.reduce((sum: number, mesh: { count: number }) => sum + mesh.count, 0);
    assert.ok(detailCount > 35000, `expected detailed city; got ${detailCount} instanced details`);
    assert.ok(batches.length < 50, `too many architectural material batches: ${batches.length}`);
    world.update(10);
    for (const drone of world.drones) {
      assert.ok(Number.isFinite(drone.group.position.y));
      assert.ok(Math.abs(drone.group.position.x - drone.base.x) <= 1.6);
      assert.equal(drone.rotors.length, 4);
    }
    const drone = world.drones[0];
    drone.alive = false;
    const previous = drone.group.position.clone();
    world.update(12);
    assert.ok(drone.group.position.equals(previous), 'destroyed drone should not animate');
    await t.test('new neighborhood landmarks and props exist', () => {
      for (const name of ['tiled-dome-landmark', 'courtyard-fountain', 'bus-stop-sign', 'woven-carpet', 'wind-laundry', 'mountain-ridge', 'circling-birds', 'fountain-spray', 'high-clouds']) {
        assert.ok(world.scene.getObjectByName(name), `missing detail: ${name}`);
      }
      // Shelters, fountain, and displayed goods are physical obstacles.
      for (const [x, z] of [[10.3, 39], [-10.3, -63], [-27.5, -69.5], [6.6, 39]]) {
        assert.equal(collides(x, z, world.collisions), true, `missing prop collision at ${x}, ${z}`);
      }
      for (const z of [-15, -76]) for (let x = -30; x <= 30; x++) {
        assert.equal(collides(x, z, world.collisions), false, `blocked side street at ${x}, ${z}`);
      }
    });
    await t.test('parked vehicle groups block shots; decorative effects do not', () => {
      world.scene.updateMatrixWorld(true);
      const vehicle = world.scene.getObjectByName('parked-vehicle');
      assert.ok(vehicle && world.staticMeshes.includes(vehicle));
      const origin = vehicle.position.clone().add(new THREE.Vector3(0, 0.75, 8));
      const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1), 0, 16);
      const vehicleHits = ray.intersectObject(vehicle, true);
      assert.ok(vehicleHits.length > 0, 'ray should hit the vehicle body');
      const allHits = ray.intersectObjects(world.staticMeshes, true);
      assert.ok(allHits.some(hit => vehicleHits.some(carHit => carHit.object === hit.object)));
      for (const name of ['high-clouds', 'circling-birds', 'fountain-spray']) {
        assert.equal(world.staticMeshes.includes(world.scene.getObjectByName(name)), false, `${name} must not intercept shots`);
      }
    });
    await t.test('every mission drone can be shot from the central street', () => {
      world.drones.forEach((drone: { alive: boolean }) => { drone.alive = true; });
      world.update(0); world.scene.updateMatrixWorld(true);
      for (const drone of world.drones) {
        const target = drone.group.position.clone();
        const origin = new THREE.Vector3(0, 1.72, target.z + 14);
        const direction = target.clone().sub(origin).normalize();
        const ray = new THREE.Raycaster(origin, direction, 0, 25);
        const hits = ray.intersectObjects([...world.staticMeshes, drone.group], true);
        assert.ok(hits.length, `no hit on drone at ${target.z}`);
        let hitObject: THREE.Object3D | null = hits[0].object;
        while (hitObject && hitObject !== drone.group) hitObject = hitObject.parent;
        assert.equal(hitObject, drone.group, `drone at ${target.z} is occluded from its approach`);
      }
    });
    await t.test('cloth, fountain, and birds animate deterministically', () => {
      const cloth = world.scene.getObjectByName('wind-laundry') as THREE.Mesh;
      const clothPositions = cloth.geometry.getAttribute('position');
      const fountain = world.scene.getObjectByName('fountain-spray') as THREE.Points;
      const birds = world.scene.getObjectByName('circling-birds') as THREE.InstancedMesh;
      world.update(20);
      const clothAt20 = Array.from(clothPositions.array);
      const sprayAt20 = Array.from(fountain.geometry.getAttribute('position').array);
      const birdsAt20 = Array.from(birds.instanceMatrix.array);
      world.update(21);
      assert.notDeepEqual(Array.from(clothPositions.array), clothAt20);
      assert.notDeepEqual(Array.from(fountain.geometry.getAttribute('position').array), sprayAt20);
      assert.notDeepEqual(Array.from(birds.instanceMatrix.array), birdsAt20);
      world.update(20);
      assert.deepEqual(Array.from(clothPositions.array), clothAt20);
      assert.deepEqual(Array.from(fountain.geometry.getAttribute('position').array), sprayAt20);
      assert.deepEqual(Array.from(birds.instanceMatrix.array), birdsAt20);
      const height = (cloth.geometry as THREE.PlaneGeometry).parameters.height;
      for (let vertex = 0; vertex < clothPositions.count; vertex++) {
        if (Math.abs(clothPositions.getY(vertex) - height / 2) < 0.0001) assert.ok(Math.abs(clothPositions.getZ(vertex)) < 0.0001, 'top edge stays pinned to the line');
      }
    });
    await t.test('detail batching preserves color and all geometry stays finite', () => {
      assert.ok(batches.some((mesh: THREE.InstancedMesh) => mesh.instanceColor !== null), 'merged surfaces need original instance colors');
      world.scene.traverse((object: THREE.Object3D) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
        const positions = object.geometry.getAttribute('position');
        for (const value of positions.array) assert.ok(Number.isFinite(value), `non-finite geometry in ${object.name}`);
      });
      const sun = world.scene.getObjectByName('district-sun') as THREE.DirectionalLight;
      world.update(22, new THREE.Vector3(4, 1.72, -90));
      assert.equal(sun.target.position.x, 4); assert.equal(sun.target.position.z, -108);
      assert.equal(sun.shadow.camera.right - sun.shadow.camera.left, 110);
    });
    console.log(`City artifact: ${detailCount} instanced details / ${batches.length} batches / ${world.collisions.length} colliders / 6 drones`);
  } finally {
    await server.close();
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
