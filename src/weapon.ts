import * as THREE from 'three';
export function createWeapon() {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#343a39', roughness: 0.4, metalness: 0.7 });
  const polymer = new THREE.MeshStandardMaterial({ color: '#444941', roughness: 0.8 });
  const edge = new THREE.MeshStandardMaterial({ color: '#727568', roughness: 0.5, metalness: 0.55 });
  const glove = new THREE.MeshStandardMaterial({ color: '#696650', roughness: 0.95 });
  const sleeve = new THREE.MeshStandardMaterial({ color: '#8b8769', roughness: 1 });
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, rx = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.rotation.x = rx; group.add(mesh); return mesh;
  }
  function cylinder(radius: number, length: number, x: number, y: number, z: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material); mesh.position.set(x, y, z); mesh.rotation.x = Math.PI / 2; group.add(mesh); return mesh;
  }
  box(0.105, 0.14, 0.3, 0, 0, -0.2, steel);
  box(0.115, 0.04, 0.48, 0, 0.081, -0.4, steel);
  box(0.065, 0.06, 0.32, 0, 0.1, -0.1, polymer);
  cylinder(0.037, 0.34, 0, 0.01, 0.065, steel);
  box(0.095, 0.16, 0.21, 0, -0.02, 0.18, polymer);
  box(0.04, 0.2, 0.055, 0, -0.18, -0.13, polymer, -0.24);
  box(0.065, 0.25, 0.085, 0, -0.16, -0.31, steel, -0.13);
  for (let i = 0; i < 5; i++) box(0.07, 0.006, 0.082, 0, -0.11 - i * 0.032, -0.32 - i * 0.004, edge);
  cylinder(0.051, 0.3, 0, 0.01, -0.5, polymer);
  for (let i = 0; i < 10; i++) {
    box(0.09, 0.009, 0.012, 0, 0.086, -0.39 - i * 0.027, edge);
    box(0.006, 0.06, 0.01, 0.05, 0.01, -0.39 - i * 0.027, steel);
    box(0.006, 0.06, 0.01, -0.05, 0.01, -0.39 - i * 0.027, steel);
  }
  cylinder(0.015, 0.24, 0, 0.014, -0.75, steel);
  cylinder(0.023, 0.06, 0, 0.014, -0.88, edge);
  box(0.014, 0.1, 0.025, 0, 0.078, -0.72, steel);
  box(0.052, 0.012, 0.033, 0, 0.128, -0.72, steel);
  box(0.048, 0.07, 0.07, 0, 0.12, -0.16, steel);
  box(0.02, 0.042, 0.075, 0, 0.153, -0.16, polymer);
  box(0.035, 0.022, 0.027, 0.068, 0.03, -0.16, edge);
  box(0.052, 0.03, 0.1, 0.055, -0.045, -0.24, edge);
  // Two gloved hands and sleeves are part of the view model.
  const hand = box(0.095, 0.11, 0.13, 0.01, -0.17, -0.11, glove, -0.3);
  hand.rotation.z = 0.15;
  box(0.12, 0.13, 0.37, 0.065, -0.27, 0.06, sleeve, -0.35);
  box(0.12, 0.105, 0.13, -0.014, -0.06, -0.5, glove, 0.2);
  const forearm = box(0.12, 0.12, 0.46, -0.12, -0.15, -0.31, sleeve, 0.3); forearm.rotation.y = -0.4;
  for (const z of [-0.52, -0.49, -0.46]) box(0.11, 0.024, 0.015, -0.01, -0.062, z, polymer);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 6), new THREE.MeshBasicMaterial({ color: '#ffde84', transparent: true, opacity: 0.9 }));
  flash.rotation.x = -Math.PI / 2; flash.position.set(0, 0.014, -1.02); flash.visible = false; group.add(flash);
  const flashLight = new THREE.PointLight('#ffce77', 0, 4); flashLight.position.copy(flash.position); group.add(flashLight);
  group.position.set(0.27, -0.27, -0.43);
  return { group, flash, flashLight };
}
