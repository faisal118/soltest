import * as THREE from 'three';
import { seededRandom, type Box } from './rules';

export interface GameWorld {
  scene: THREE.Scene;
  collisions: Box[];
  drones: Drone[];
  staticMeshes: THREE.Object3D[];
  update: (time: number, focus?: THREE.Vector3) => void;
}
export interface Drone { group: THREE.Group; core: THREE.Mesh; alive: boolean; base: THREE.Vector3; phase: number; rotors: THREE.Mesh[] }

// Static architecture is batched by material: thousands of details, few draw calls.
class Architecture {
  private boxes = new Map<THREE.Material, THREE.Matrix4[]>();
  private cylinders = new Map<THREE.Material, THREE.Matrix4[]>();
  private spheres = new Map<THREE.Material, THREE.Matrix4[]>();
  private matrix = new THREE.Matrix4();
  private rotation = new THREE.Quaternion();
  box(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, ry = 0, rz = 0, rx = 0) {
    this.rotation.setFromEuler(new THREE.Euler(rx, ry, rz));
    this.matrix.compose(new THREE.Vector3(x, y, z), this.rotation, new THREE.Vector3(w, h, d));
    if (!this.boxes.has(mat)) this.boxes.set(mat, []);
    this.boxes.get(mat)!.push(this.matrix.clone());
  }
  cylinder(x: number, y: number, z: number, radius: number, h: number, mat: THREE.Material, rz = 0, rx = 0) {
    this.rotation.setFromEuler(new THREE.Euler(rx, 0, rz));
    this.matrix.compose(new THREE.Vector3(x, y, z), this.rotation, new THREE.Vector3(radius, h, radius));
    if (!this.cylinders.has(mat)) this.cylinders.set(mat, []);
    this.cylinders.get(mat)!.push(this.matrix.clone());
  }
  sphere(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) {
    this.matrix.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    if (!this.spheres.has(mat)) this.spheres.set(mat, []);
    this.spheres.get(mat)!.push(this.matrix.clone());
  }
  flush(scene: THREE.Scene) {
    const meshes: THREE.InstancedMesh[] = [];
    for (const [collection, geometry] of [[this.boxes, new THREE.BoxGeometry(1, 1, 1)], [this.cylinders, new THREE.CylinderGeometry(1, 1, 1, 10)], [this.spheres, new THREE.SphereGeometry(1, 10, 8)]] as const) {
      // Plain surfaces with identical physical properties share one draw call;
      // instance colors preserve each original paint color. Textured surfaces stay separate.
      const batches = new Map<string | THREE.Material, { material: THREE.Material; matrices: THREE.Matrix4[]; colors: THREE.Color[] }>();
      for (const [material, matrices] of collection) {
        const canTint = material instanceof THREE.MeshStandardMaterial && !material.map && !material.bumpMap
          && !material.transparent && material.emissive.getHex() === 0 && material.side === THREE.FrontSide;
        const key = canTint ? `${material.roughness}:${material.metalness}` : material;
        if (!batches.has(key)) {
          const shared = canTint ? material.clone() : material;
          if (shared instanceof THREE.MeshStandardMaterial && canTint) shared.color.set('#ffffff');
          batches.set(key, { material: shared, matrices: [], colors: [] });
        }
        const batch = batches.get(key)!;
        batch.matrices.push(...matrices);
        if (canTint) matrices.forEach(() => batch.colors.push(material.color));
      }
      for (const batch of batches.values()) {
        const mesh = new THREE.InstancedMesh(geometry, batch.material, batch.matrices.length);
        batch.matrices.forEach((matrix, i) => {
          mesh.setMatrixAt(i, matrix);
          if (batch.colors.length) mesh.setColorAt(i, batch.colors[i]);
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        scene.add(mesh);
        meshes.push(mesh);
      }
    }
    return meshes;
  }
}

function noiseTexture(seed: number, base: string, kind: 'wall' | 'road' | 'ground'): THREE.CanvasTexture {
  const random = seededRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 14000; i++) {
    const n = random();
    ctx.fillStyle = `rgba(${n > 0.5 ? '255,255,255' : '20,16,13'},${random() * (kind === 'road' ? 0.16 : 0.10)})`;
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1 + random() * 2);
  }
  if (kind === 'wall') {
    ctx.strokeStyle = 'rgba(66,50,38,.09)';
    for (let y = 16; y < 256; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
      for (let x = (y % 48 ? 0 : 20); x < 256; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 24); ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function sign(text: string, subtitle: string, color: string, width: number, height: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color; ctx.fillRect(0, 0, 768, 192);
  ctx.strokeStyle = '#d4bc89'; ctx.lineWidth = 5; ctx.strokeRect(12, 12, 744, 168);
  ctx.textAlign = 'center'; ctx.fillStyle = '#f5e7c9'; ctx.font = 'bold 76px sans-serif';
  ctx.fillText(text, 384, 101);
  ctx.font = '23px sans-serif'; ctx.fillStyle = '#e0cdaa'; ctx.fillText(subtitle, 384, 151);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
}

export function createWorld(): GameWorld {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfc9c8');
  scene.fog = new THREE.FogExp2('#c4c5b8', 0.0026);
  const random = seededRandom(2401);
  const a = new Architecture();
  const collisions: Box[] = [];
  const animatedCloth: { mesh: THREE.Mesh; base: Float32Array; phase: number }[] = [];
  const detailRandom = seededRandom(911); // Detail changes don't reshuffle the city or mission.
  const obstacle = (x: number, z: number, w: number, d: number) => {
    collisions.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };
  const mat = (color: string, roughness = 0.9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const concrete = mat('#b6a992');
  const trim = mat('#c7bc9f');
  const darkTrim = mat('#746754');
  const brick = mat('#b08b70');
  const metal = mat('#414848', 0.6, 0.5);
  const white = mat('#e2dcc8');
  const asphaltTexture = noiseTexture(9, '#5c5e59', 'road'); asphaltTexture.repeat.set(3, 30);
  const soilTexture = noiseTexture(10, '#ae9d7d', 'ground'); soilTexture.repeat.set(180, 180);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTexture, bumpMap: asphaltTexture, bumpScale: 0.035, roughness: 0.96 });
  const groundMat = new THREE.MeshStandardMaterial({ map: soilTexture, bumpMap: soilTexture, bumpScale: 0.045, roughness: 1 });
  const glass = new THREE.MeshStandardMaterial({ color: '#405960', roughness: 0.28, metalness: 0.5 });
  const glassLight = new THREE.MeshStandardMaterial({ color: '#899994', roughness: 0.35, metalness: 0.45 });
  const wood = mat('#70563e');
  const leaves = [mat('#4b6040'), mat('#657548'), mat('#758051'), mat('#899058')];
  const wallMats = ['#b4a58a', '#c9bba0', '#b9a893', '#a3927c', '#d4c9af', '#b6987f', '#9eaaa2'].map((color, i) => new THREE.MeshStandardMaterial({ color, map: noiseTexture(i, '#eee9dd', 'wall'), roughness: 0.95 }));
  wallMats.forEach(material => {
    material.map!.repeat.set(2, 3); material.bumpMap = material.map; material.bumpScale = 0.04;
  });
  const awnings = [mat('#4b6c67'), mat('#984f3d'), mat('#bd9955'), mat('#50617b')];
  const yellow = mat('#d2bc7c');
  const orange = mat('#ca8749');
  const blueTile = mat('#397c89', 0.55, 0.18);
  const terracotta = mat('#a3654b');
  const rubber = mat('#272d2b');
  const litGlass = new THREE.MeshStandardMaterial({ color: '#c4ae7f', emissive: '#c18e48', emissiveIntensity: 0.3, roughness: 0.65 });

  scene.add(new THREE.HemisphereLight('#d5e5ee', '#887351', 1.75));
  const sun = new THREE.DirectionalLight('#ffe2ac', 3.2);
  sun.position.set(-48, 72, 36);
  sun.name = 'district-sun';
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -55;
  sun.shadow.camera.right = sun.shadow.camera.top = 55;
  sun.shadow.camera.far = 250;
  sun.shadow.normalBias = 0.055;
  sun.shadow.bias = -0.0001;
  scene.add(sun);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(950, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { topColor: { value: new THREE.Color('#7198aa') }, bottomColor: { value: new THREE.Color('#ead7b5') } },
    vertexShader: 'varying vec3 vPosition; void main(){ vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vPosition; uniform vec3 topColor; uniform vec3 bottomColor; void main(){ float h=normalize(vPosition).y; gl_FragColor=vec4(mix(bottomColor,topColor,pow(max(h,0.),.5)),1.); }',
  }));
  sky.material.fog = false;
  scene.add(sky);

  // Soft cloud banks add depth without external textures or additional lights.
  const cloudCanvas = document.createElement('canvas'); cloudCanvas.width = 256; cloudCanvas.height = 128;
  const cloudContext = cloudCanvas.getContext('2d')!;
  for (let puff = 0; puff < 70; puff++) {
    cloudContext.fillStyle = `rgba(250,244,223,${0.025 + detailRandom() * 0.04})`;
    cloudContext.beginPath();
    cloudContext.arc(45 + detailRandom() * 167, 43 + detailRandom() * 38, 12 + detailRandom() * 26, 0, Math.PI * 2); cloudContext.fill();
  }
  const cloudTexture = new THREE.CanvasTexture(cloudCanvas); cloudTexture.colorSpace = THREE.SRGBColorSpace;
  const clouds = new THREE.Group(); clouds.name = 'high-clouds';
  for (let cloud = 0; cloud < 9; cloud++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: 0.42, depthWrite: false, fog: false }));
    sprite.position.set(-420 + cloud * 104, 145 + detailRandom() * 70, -540 - detailRandom() * 80);
    sprite.scale.set(125 + detailRandom() * 105, 36 + detailRandom() * 26, 1); clouds.add(sprite);
  }
  scene.add(clouds);

  // The Hindu Kush backdrop: layered ridgelines, not a flat skybox.
  for (let layer = 0; layer < 3; layer++) {
    const mountainMat = mat(['#aaa998', '#959b91', '#858d84'][layer]);
    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const segments = 70, rows = 5;
    const peaks = Array.from({ length: segments + 1 }, (_, i) => 90 + Math.sin(i * 0.44 + layer) * 42 + Math.sin(i * 0.91) * 24 + random() * 24);
    const baseColor = mountainMat.color.clone(); mountainMat.color.set('#ffffff'); mountainMat.vertexColors = true;
    for (let row = 0; row < rows; row++) for (let i = 0; i <= segments; i++) {
      const x = -700 + i * 20;
      const ridgeWeight = [0.25, 0.72, 1, 0.53, 0][row];
      const height = row === rows - 1 ? -12 : peaks[i] * ridgeWeight - layer * 8 + Math.sin(i * 1.2 + row) * 8;
      vertices.push(x, height, -610 + layer * 85 + row * 26);
      const shade = 0.82 + detailRandom() * 0.2 + row * 0.025;
      baseColor.clone().multiplyScalar(shade).toArray(colors, colors.length);
      if (row < rows - 1 && i < segments) {
        const n = row * (segments + 1) + i;
        indices.push(n, n + 1, n + segments + 1, n + 1, n + segments + 2, n + segments + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    mountainMat.side = THREE.DoubleSide;
    const ridge = new THREE.Mesh(geometry, mountainMat); ridge.name = 'mountain-ridge'; scene.add(ridge);
  }

  a.box(0, -0.3, 0, 1600, 0.5, 1600, groundMat);
  a.box(0, -0.015, -10, 18, 0.06, 280, roadMat);
  a.box(0, -0.01, -15, 150, 0.07, 15, roadMat);
  a.box(0, -0.012, -76, 150, 0.07, 12, roadMat);
  for (const side of [-1, 1]) {
    a.box(side * 10.1, 0.11, -10, 2.2, 0.25, 260, concrete);
    a.box(side * 9.05, 0.17, -10, 0.2, 0.35, 260, trim);
    for (let z = -137; z < 120; z += 3) a.box(side * 9.05, 0.18, z, 0.22, 0.36, 1.45, darkTrim);
    a.box(side * 33, 0.1, -15, 43, 0.24, 19, concrete);
    a.box(side * 33, 0.15, -15, 43, 0.27, 15, roadMat);
  }
  for (let z = -140; z < 120; z += 8) {
    if (Math.abs(z + 15) < 12 || Math.abs(z + 76) < 9) continue;
    a.box(0, 0.026, z, 0.12, 0.012, 3, yellow);
    a.box(7.65, 0.026, z, 0.1, 0.012, 7.8, white);
    a.box(-7.65, 0.026, z, 0.1, 0.012, 7.8, white);
  }
  for (const z of [-3, -27]) for (let x = -7; x <= 7; x += 1.5) a.box(x, 0.04, z, 0.7, 0.014, 3.8, white);

  const shopNames = [
    ['بازار کابل', 'KABUL MARKET'], ['نان تازه', 'FRESH BREAD · BAKERY'], ['فروشگاه بهار', 'BAHAR GENERAL STORE'],
    ['چای خانه', 'TEA HOUSE'], ['تعمیر موبایل', 'MOBILE & ELECTRONICS'], ['کتاب فروشی', 'CITY BOOKSHOP'],
    ['میوه تازه', 'FRESH FRUIT'], ['رستورانت پامیر', 'PAMIR RESTAURANT'],
  ];
  function building(x: number, z: number, w: number, d: number, floors: number, style: number, side: number) {
    const h = 3.4 + floors * 3.1;
    const facade = wallMats[style % wallMats.length];
    a.box(x, h / 2, z, w, h, d, facade);
    collisions.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    a.box(x, 1.3, z, w + 0.04, 2.6, d + 0.05, style % 2 ? brick : darkTrim);
    a.box(x, h + 0.2, z, w + 0.3, 0.4, d + 0.3, trim);
    a.box(x, h + 0.7, z - d / 2, w, 0.75, 0.25, facade);
    a.box(x, h + 0.7, z + d / 2, w, 0.75, 0.25, facade);
    for (let floor = 1; floor <= floors; floor++) {
      const y = 3.1 + floor * 3.1 - 1.3;
      a.box(x, y - 1.4, z, w + 0.12, 0.12, d + 0.12, trim);
      for (let offset = -w / 2 + 1.6; offset < w / 2 - 0.8; offset += 2.7) {
        for (const face of [-1, 1]) {
          a.box(x + offset, y, z + face * (d / 2 + 0.025), 1.45, 1.95, 0.07, darkTrim);
          a.box(x + offset, y + 0.04, z + face * (d / 2 + 0.07), 1.23, 1.73, 0.035, random() > 0.4 ? glass : glassLight);
          a.box(x + offset, y + 0.04, z + face * (d / 2 + 0.09), 0.06, 1.73, 0.04, trim);
          a.box(x + offset, y - 1, z + face * (d / 2 + 0.14), 1.65, 0.13, 0.28, trim);
        }
      }
      for (let offset = -d / 2 + 1.7; offset < d / 2 - 0.8; offset += 2.7) {
        const faceX = x - side * (w / 2 + 0.02);
        a.box(faceX, y, z + offset, 0.08, 1.95, 1.6, darkTrim);
        a.box(faceX - side * 0.05, y + 0.02, z + offset, 0.05, 1.75, 1.38, random() > 0.35 ? glass : glassLight);
        a.box(faceX - side * 0.08, y, z + offset, 0.04, 1.75, 0.06, trim);
        // Ornamental projecting balconies with railings.
        if (style % 3 !== 1 && floor > 1) {
          a.box(faceX - side * 0.6, y - 1.13, z + offset, 1.25, 0.16, 2.0, trim);
          a.box(faceX - side * 1.1, y - 0.35, z + offset, 0.05, 0.07, 2.0, metal);
          for (let b = -0.9; b <= 0.9; b += 0.3) a.box(faceX - side * 1.1, y - 0.75, z + offset + b, 0.04, 0.8, 0.04, metal);
          for (const b of [-0.95, 0.95]) a.box(faceX - side * 0.55, y - 0.35, z + offset + b, 1.1, 0.05, 0.05, metal);
        }
        if (random() > 0.73) {
          a.box(faceX - side * 0.25, y - 0.6, z + offset + 1, 0.45, 0.6, 0.7, white);
          for (let vent = 0; vent < 4; vent++) a.box(faceX - side * 0.49, y - 0.78 + vent * 0.1, z + offset + 1, 0.025, 0.03, 0.5, metal);
        }
      }
    }
    const front = x - side * (w / 2 + 0.06);
    // Vertical corner courses, drain pipes, cables and exposed brick patches.
    for (const edge of [-1, 1]) {
      a.box(front - side * 0.01, h / 2, z + edge * (d / 2 - 0.22), 0.16, h, 0.34, trim);
      a.cylinder(front - side * 0.16, h / 2, z + edge * (d / 2 - 0.65), 0.055, h, metal);
      for (let y = 0.7; y < h; y += 1.5) a.box(front - side * 0.2, y, z + edge * (d / 2 - 0.65), 0.13, 0.05, 0.18, metal);
    }
    for (let i = 0; i < 22; i++) {
      const y = 0.4 + detailRandom() * 2.0, zz = z + (detailRandom() - 0.5) * d;
      a.box(front - side * 0.018, y, zz, 0.015, 0.09, 0.3 + detailRandom() * 0.4, brick);
    }
    a.box(front - side * 0.11, 0.36, z, 0.22, 0.24, d, concrete);
    // Balconies get planters, curtains, and domestic details, not just railings.
    for (let floor = 2; floor <= floors; floor++) {
      const y = 3.1 + floor * 3.1 - 1.3;
      for (let offset = -d / 2 + 1.7; offset < d / 2 - 0.8; offset += 2.7) {
        a.box(front - side * 0.065, y - 0.04, z + offset + 0.45, 0.025, 1.6, 0.23, (floor + style) % 3 ? white : litGlass);
        a.box(front - side * 0.065, y - 0.04, z + offset - 0.45, 0.025, 1.6, 0.23, (floor + style) % 3 ? white : litGlass);
        if (style % 3 !== 1 && detailRandom() > 0.45) {
          a.box(front - side * 0.9, y - 0.9, z + offset, 0.32, 0.26, 1.2, terracotta);
          for (let p = 0; p < 4; p++) a.sphere(front - side * 0.9, y - 0.61, z + offset - 0.44 + p * 0.29, 0.18, 0.24, 0.2, leaves[p % 4]);
        }
      }
    }
    for (let offset = -d / 2 + 2; offset < d / 2 - 1; offset += 4.3) {
      a.box(front, 1.3, z + offset, 0.08, 2.5, 3.7, metal);
      a.box(front - side * 0.05, 1.25, z + offset, 0.08, 2.25, 3.35, glass);
      for (let shutter = 0; shutter < 8; shutter++) a.box(front - side * 0.12, 0.35 + shutter * 0.26, z + offset, 0.04, 0.035, 3.35, metal);
      const canopyIndex = ((style + Math.floor(offset)) % awnings.length + awnings.length) % awnings.length;
      const canopy = awnings[canopyIndex];
      a.box(front - side * 0.9, 2.9, z + offset, 1.8, 0.12, 4.0, canopy, 0, side * 0.09);
      a.box(front - side * 1.78, 2.72, z + offset, 0.08, 0.35, 4.0, canopy);
      for (let stripe = -1.8; stripe < 1.9; stripe += 0.4) {
        a.box(front - side * 0.9, 2.966, z + offset + stripe, 1.77, 0.013, 0.12, trim, 0, side * 0.09);
        a.box(front - side * 1.825, 2.72, z + offset + stripe, 0.012, 0.32, 0.12, trim);
      }
      // Goods sit outside the closed structural shell; display geometry is visible at eye level.
      const stall = (style + Math.round(Math.abs(offset))) % shopNames.length;
      const goodsX = front - side * 0.42;
      a.box(goodsX, 0.58, z + offset, 0.56, 1.06, 2.7, wood);
      for (let shelf = 0; shelf < 3; shelf++) {
        const shelfY = 0.5 + shelf * 0.47;
        a.box(goodsX - side * 0.08, shelfY, z + offset, 0.62, 0.06, 2.7, trim);
        for (let item = 0; item < 8; item++) {
          const zz = z + offset - 1.13 + item * 0.32;
          if (stall === 1 || stall === 6) {
            a.sphere(goodsX - side * 0.1, shelfY + 0.13, zz, stall === 1 ? 0.22 : 0.12, 0.09, 0.13, stall === 1 ? yellow : item % 2 ? orange : leaves[2]);
          } else if (stall === 5) {
            a.box(goodsX - side * 0.1, shelfY + 0.16, zz, 0.18, 0.28, 0.08, awnings[item % 4], 0, (detailRandom() - 0.5) * 0.2);
          } else {
            a.cylinder(goodsX - side * 0.1, shelfY + 0.13, zz, 0.065, 0.22, item % 3 ? white : awnings[0]);
            a.cylinder(goodsX - side * 0.1, shelfY + 0.25, zz, 0.035, 0.03, metal);
          }
        }
      }
      obstacle(goodsX, z + offset, 0.75, 2.85);
      const name = shopNames[(style + Math.round(Math.abs(offset))) % shopNames.length];
      const panel = sign(name[0], name[1], ['#244b49', '#834b37', '#324752', '#826b43'][style % 4], 4.0, 0.85);
      panel.position.set(front - side * 0.15, 3.6, z + offset);
      panel.rotation.y = -side * Math.PI / 2;
      scene.add(panel);
    }
    // Roof tanks, aerials, solar collectors and unfinished reinforcing rods.
    a.cylinder(x + w / 4, h + 1.1, z - d / 4, 1.0, 1.7, style % 3 ? metal : white);
    a.cylinder(x + w / 4, h + 2.0, z - d / 4, 1.03, 0.12, darkTrim);
    a.box(x - w / 4, h + 0.9, z, w / 3, 0.1, 3.4, glass, 0, 0.2);
    for (let p = 0; p < 3; p++) a.box(x - w / 4 + p * 1.1, h + 0.9, z, 0.03, 0.12, 3.4, metal, 0, 0.2);
    // Batched dishes, water pipework, roof ladders and solar-cell grids.
    a.sphere(x + w / 4 - 2.2, h + 1.4, z + 1.6, 0.75, 0.18, 0.8, white);
    a.cylinder(x + w / 4 - 2.2, h + 0.75, z + 1.6, 0.06, 1.2, metal);
    a.box(x + w / 4 - 2.2, h + 1.7, z + 1.6, 0.05, 0.65, 0.05, metal, 0, 0.4);
    a.box(x + w / 4, h + 0.22, z, 0.1, 0.1, d / 2, metal);
    for (let p = 0; p < 7; p++) a.box(x - w / 4, h + 0.85, z - 1.4 + p * 0.45, w / 3, 0.12, 0.012, trim, 0, 0.2);
    for (const rail of [-1, 1]) a.cylinder(front - side * 0.28, h / 2, z + d / 2 - 1.6 + rail * 0.24, 0.035, h + 0.3, metal);
    for (let rung = 0.7; rung < h + 0.5; rung += 0.35) a.box(front - side * 0.28, rung, z + d / 2 - 1.6, 0.05, 0.035, 0.48, metal);
    if (style % 3 === 0) {
      const lineX = front - side * 0.6;
      const lineY = 3.1 + Math.min(floors, 3) * 3.1 - 0.8;
      a.box(lineX, lineY, z, 0.025, 0.025, d - 1.7, metal);
      for (let item = 0; item < 4; item++) {
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.95, 4, 5), awnings[item % 4]);
        cloth.material = cloth.material.clone(); (cloth.material as THREE.Material).side = THREE.DoubleSide;
        cloth.position.set(lineX, lineY - 0.47, z - d / 2 + 2.7 + item * 1.7); cloth.rotation.y = Math.PI / 2;
        cloth.name = 'wind-laundry';
        scene.add(cloth);
        animatedCloth.push({ mesh: cloth, base: new Float32Array(cloth.geometry.getAttribute('position').array), phase: detailRandom() * 6 });
      }
    }
    a.cylinder(x - 1, h + 2.0, z + 2, 0.04, 3.5, metal);
    a.box(x - 1, h + 3.2, z + 2, 2, 0.035, 0.035, metal);
    for (let p = 0; p < 3; p++) a.box(x - 1 + p * 0.5, h + 3.2, z + 2, 0.03, 0.03, 1.1, metal);
  }

  for (const side of [-1, 1]) {
    let row = 0;
    for (let z = -109; z < 90; z += 20.5) {
      if (Math.abs(z + 15) < 14 || Math.abs(z + 76) < 12) continue;
      const w = 12 + random() * 4;
      building(side * (12 + w / 2), z, w, 16 + random() * 2, 2 + Math.floor(random() * 4), row++ + (side > 0 ? 2 : 0), side);
    }
    // Dense second row of modern low-rise apartment blocks.
    for (let z = -125; z < 110; z += 23) {
      if (Math.abs(z + 15) < 14 || Math.abs(z + 76) < 12) continue;
      building(side * 47, z, 16 + random() * 5, 17, 3 + Math.floor(random() * 5), row++, side);
    }
  }

  // Mid-rise office tower and recognizable blue-glass modern retail facade.
  building(48, -158, 26, 21, 11, 6, 1);
  for (let i = 0; i < 10; i++) a.box(34.9, 6 + i * 3.1, -158, 0.14, 2.2, 19, glass);
  for (let i = 0; i < 5; i++) a.box(34.8, 19, -166 + i * 4, 0.18, 32, 0.2, trim);
  const hotel = sign('کابل', 'KABUL · CITY CENTRE', '#263f46', 14, 2.3);
  hotel.position.set(48, 39, -147.4); scene.add(hotel);

  // Distant hillside neighborhoods.
  for (let i = 0; i < 150; i++) {
    const x = (random() - 0.5) * 460;
    const z = -185 - random() * 125;
    const y = Math.max(0, (-z - 220) * 0.17);
    const w = 5 + random() * 6, h = 4 + random() * 9;
    a.box(x, y + h / 2, z, w, h, 7 + random() * 4, wallMats[i % wallMats.length]);
    a.box(x, y + h + 0.12, z, w + 0.3, 0.25, 8, trim);
    for (let j = 0; j < 3; j++) a.box(x - w / 3 + j * w / 3, y + h * 0.7, z + 4.06, 0.9, 1.5, 0.05, glass);
  }

  function tree(x: number, z: number, size: number) {
    a.cylinder(x, size * 0.37, z, 0.16, size * 0.74, wood);
    for (let i = 0; i < 3; i++) a.cylinder(x + Math.sin(i * 2) * 0.4, size * 0.64, z + Math.cos(i * 2) * 0.3, 0.08, size * 0.45, wood, (i - 1) * 0.7);
    // Several overlapping faceted leaf clusters.
    for (let i = 0; i < 6; i++) {
      const geometry = new THREE.IcosahedronGeometry(size * (0.24 + random() * 0.1), 1);
      const crown = new THREE.Mesh(geometry, leaves[i % leaves.length]);
      crown.position.set(x + (random() - 0.5) * size * 0.45, size * (0.67 + random() * 0.23), z + (random() - 0.5) * size * 0.45);
      crown.scale.y = 1.2; crown.castShadow = true; crown.receiveShadow = true; scene.add(crown);
    }
    a.box(x, 0.35, z, 1.4, 0.7, 1.4, concrete);
    collisions.push({ minX: x - 0.65, maxX: x + 0.65, minZ: z - 0.65, maxZ: z + 0.65 });
  }
  for (const side of [-1, 1]) for (let z = -117; z < 100; z += 28) tree(side * 10.3, z, 6 + random() * 2);

  // Utility poles, suspended wires, lamps, transformers.
  for (const side of [-1, 1]) {
    for (let z = -127; z <= 95; z += 32) {
      const x = side * 10.8;
      a.cylinder(x, 5.3, z, 0.13, 10.6, concrete);
      a.box(x, 9.8, z, 2.2, 0.16, 0.2, wood);
      for (let j = -1; j <= 1; j++) a.cylinder(x + j * 0.8, 10.1, z, 0.075, 0.4, glass);
      a.box(x - side * 0.8, 7.6, z, 1.6, 0.1, 0.1, metal);
      a.box(x - side * 1.6, 7.5, z, 0.65, 0.12, 0.32, metal);
      a.box(x - side * 1.6, 7.43, z, 0.5, 0.02, 0.25, white);
      if (z < 90) for (const offset of [-0.8, 0, 0.8]) {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x + offset, 10.3, z), new THREE.Vector3(x + offset, 8.8, z + 16), new THREE.Vector3(x + offset, 10.3, z + 32)]);
        scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.018, 3, false), metal));
      }
    }
  }
  for (const z of [28, -38, -102]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-11, 10.3, z), new THREE.Vector3(0, 8.1, z), new THREE.Vector3(11, 10.3, z)]);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.022, 3, false), metal));
  }

  function car(x: number, z: number, color: string, angle = 0, taxi = false) {
    const paint = mat(color, 0.4, 0.35);
    const group = new THREE.Group(); group.name = 'parked-vehicle';
    function part(w: number, h: number, d: number, px: number, py: number, pz: number, material: THREE.Material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(px, py, pz); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
    part(1.85, 0.65, 4.25, 0, 0.72, 0, paint);
    part(1.63, 0.72, 2.3, 0, 1.32, -0.2, paint);
    part(1.45, 0.54, 0.04, 0, 1.37, 0.96, glass);
    part(1.45, 0.54, 0.04, 0, 1.37, -1.38, glass);
    for (const s of [-1, 1]) {
      part(0.04, 0.49, 1.95, s * 0.824, 1.4, -0.2, glass);
      part(0.05, 0.59, 0.1, s * 0.85, 1.38, -0.12, paint);
      part(0.23, 0.12, 0.3, s * 0.97, 1.28, 0.72, paint);
      part(0.12, 0.06, 0.24, s * 0.93, 0.98, 0.3, metal);
      for (const end of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.2, 14), metal);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(s * 0.94, 0.4, end * 1.32); group.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 10), white); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); group.add(hub);
      }
      part(0.45, 0.17, 0.06, s * 0.59, 0.9, 2.16, white);
      part(0.4, 0.15, 0.05, s * 0.64, 0.87, -2.16, awnings[1]);
    }
    part(1.7, 0.13, 0.08, 0, 0.43, 2.15, metal);
    part(1.7, 0.13, 0.08, 0, 0.43, -2.15, metal);
    part(0.6, 0.16, 0.03, 0, 0.65, 2.18, white);
    if (taxi) part(0.55, 0.22, 0.28, 0, 1.85, -0.1, yellow);
    group.position.set(x, 0, z); group.rotation.y = angle; scene.add(group);
    const sideways = Math.abs(Math.sin(angle)) > 0.5;
    collisions.push({ minX: x - (sideways ? 2.2 : 1.0), maxX: x + (sideways ? 2.2 : 1.0), minZ: z - (sideways ? 1 : 2.2), maxZ: z + (sideways ? 1 : 2.2) });
  }
  const colors = ['#d0c7ad', '#b8aa83', '#7c9690', '#d5bb59', '#e3dfd0', '#667c85'];
  for (let i = 0; i < 13; i++) {
    const side = i % 2 ? -1 : 1;
    const z = -112 + i * 16;
    if (Math.abs(z + 15) < 12 || Math.abs(z + 76) < 10) continue;
    car(side * 6.8, z, colors[i % colors.length], side === 1 ? Math.PI : 0, i % 4 === 3);
  }
  car(32, -20, '#d6c45d', Math.PI / 2, true);
  car(-40, -20, '#b8c4bf', Math.PI / 2);

  // Market carts, stacked produce, crates and everyday street clutter.
  for (const [x, z] of [[-11.2, 20], [11.2, -39], [-11.3, -50], [11.4, 61]]) {
    a.box(x, 0.85, z, 1.2, 0.15, 2.4, wood);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      a.cylinder(x + sx * 0.49, 0.47, z + sz * 0.9, 0.05, 0.8, metal);
      a.box(x + sx * 0.57, 0.93, z + sz * 0.85, 0.08, 0.4, 0.5, wood);
    }
    a.box(x, 2.35, z, 1.9, 0.12, 2.8, awnings[2]);
    for (const s of [-1, 1]) a.cylinder(x, 1.6, z + s * 1.1, 0.035, 1.8, metal);
    for (let i = 0; i < 24; i++) a.box(x + (random() - 0.5) * 0.8, 1.05 + random() * 0.16, z + (random() - 0.5) * 1.9, 0.17, 0.16, 0.17, i % 3 ? orange : leaves[2]);
    collisions.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 1.3, maxZ: z + 1.3 });
  }
  for (let i = 0; i < 28; i++) {
    const z = -120 + random() * 210, side = i % 2 ? -1 : 1;
    if (Math.abs(z + 15) < 10) continue;
    a.box(side * 11.4, 0.42, z, 0.7, 0.84, 0.7, i % 3 ? wood : awnings[0]);
    a.box(side * 11.4, 0.84, z, 0.75, 0.06, 0.75, metal);
  }
  // Traffic signs and bollards at the intersection.
  for (const side of [-1, 1]) {
    a.cylinder(side * 9.5, 1.9, -4.5, 0.04, 3.8, metal);
    const direction = sign(side < 0 ? 'شهر نو' : 'کارته پروان', side < 0 ? 'SHAHR-E NAW  →' : '←  KARTE PARWAN', '#2c5c58', 2.4, 0.65);
    direction.position.set(side * 9.5, 3.65, -4.5); scene.add(direction);
    for (let i = 0; i < 6; i++) {
      a.cylinder(side * 9.4, 0.52, -7 - i * 3, 0.08, 1.04, metal);
      a.cylinder(side * 9.4, 0.79, -7 - i * 3, 0.09, 0.1, yellow);
    }
  }

  // Hand-set neighborhood vignettes: built at pedestrian scale, off the mission route.
  function bench(x: number, z: number) {
    for (const leg of [-1, 1]) {
      a.box(x, 0.34, z + leg * 0.77, 0.6, 0.65, 0.08, metal);
      a.box(x + 0.23, 0.87, z + leg * 0.77, 0.06, 0.9, 0.08, metal);
    }
    for (let plank = 0; plank < 4; plank++) {
      a.box(x - 0.22 + plank * 0.15, 0.66, z, 0.12, 0.08, 1.95, wood);
      a.box(x + 0.27, 0.87 + plank * 0.13, z, 0.06, 0.1, 1.95, wood);
    }
    obstacle(x, z, 0.8, 2.05);
  }
  function shelter(x: number, z: number, side: number) {
    for (const end of [-1, 1]) {
      a.box(x + side * 0.5, 1.45, z + end * 2.7, 0.07, 2.8, 0.07, metal);
      a.box(x - side * 0.5, 1.45, z + end * 2.7, 0.07, 2.8, 0.07, metal);
      a.box(x, 1.6, z + end * 2.7, 1.0, 2.1, 0.045, glassLight);
    }
    a.box(x, 2.95, z, 1.55, 0.13, 6.0, awnings[0]);
    a.box(x + side * 0.5, 1.6, z, 0.045, 2.1, 5.4, glass);
    for (let seat = 0; seat < 4; seat++) {
      a.box(x, 0.65, z - 1.6 + seat * 1.05, 0.65, 0.1, 0.8, metal);
      a.box(x + side * 0.24, 1.03, z - 1.6 + seat * 1.05, 0.06, 0.75, 0.8, metal);
      a.cylinder(x, 0.36, z - 1.6 + seat * 1.05, 0.04, 0.6, metal);
    }
    obstacle(x, z, 1.35, 5.6);
    const stop = sign('ایستگاه', 'CITY BUS · ROUTE 04', '#294f52', 3.0, 0.65);
    stop.rotation.y = -side * Math.PI / 2; stop.position.set(x - side * 0.79, 2.92, z);
    stop.name = 'bus-stop-sign'; scene.add(stop);
  }
  shelter(10.3, 39, 1);
  shelter(-10.3, -63, -1);
  bench(-10.3, 7);
  bench(10.3, -100);

  // Paving joints, recessed drains, utility covers, asphalt repairs and patched cracks.
  for (const side of [-1, 1]) {
    for (let z = -126; z < 99; z += 0.9) {
      if (Math.abs(z + 15) < 9 || Math.abs(z + 76) < 7) continue;
      a.box(side * 10.15, 0.241, z, 1.95, 0.005, 0.017, darkTrim);
    }
    a.box(side * 10.15, 0.242, -11, 0.013, 0.006, 235, darkTrim);
    for (const z of [-107, -53, 2, 65, 92]) {
      a.box(side * 8.8, 0.05, z, 0.36, 0.04, 0.95, metal);
      for (let slot = -0.35; slot < 0.4; slot += 0.11) a.box(side * 8.8, 0.074, z + slot, 0.27, 0.008, 0.035, rubber);
    }
  }
  for (const z of [-112, -42, 13, 73]) {
    a.cylinder(2.3, 0.044, z, 0.48, 0.014, metal);
    for (let ridge = -0.25; ridge < 0.3; ridge += 0.1) a.box(2.3 + ridge, 0.056, z, 0.021, 0.012, 0.65, darkTrim);
  }
  for (let patch = 0; patch < 26; patch++) {
    const x = (detailRandom() - 0.5) * 13.5, z = -121 + detailRandom() * 216;
    a.box(x, 0.035, z, 0.7 + detailRandom() * 1.7, 0.01, 1.1 + detailRandom() * 3, darkTrim, detailRandom() * 0.4);
    for (let crack = 0; crack < 5; crack++) a.box(x + (detailRandom() - 0.5) * 0.9, 0.045, z + crack * 0.5, 0.022, 0.008, 0.6, rubber, (detailRandom() - 0.5) * 1.4);
  }
  // Small road grit and dry leaves: one shared material batch per color.
  for (let pebble = 0; pebble < 270; pebble++) {
    const x = (pebble % 2 ? -1 : 1) * (8.2 + detailRandom() * 0.6);
    const z = -125 + detailRandom() * 224;
    a.box(x, 0.055, z, 0.04 + detailRandom() * 0.09, 0.02, 0.08, pebble % 3 ? groundMat : wood, detailRandom() * 6);
  }

  function bicycle(x: number, z: number, motor = false) {
    const frame = motor ? awnings[1] : blueTile;
    for (const end of [-1, 1]) {
      // Wheels with visible rims and spokes, oriented along the curb.
      a.cylinder(x, 0.42, z + end * 0.72, motor ? 0.36 : 0.34, motor ? 0.16 : 0.055, rubber, Math.PI / 2);
      a.cylinder(x - 0.085, 0.42, z + end * 0.72, 0.26, 0.018, edgeMetal, Math.PI / 2);
      a.cylinder(x - 0.097, 0.42, z + end * 0.72, 0.23, 0.02, rubber, Math.PI / 2);
      for (let spoke = 0; spoke < 8; spoke++) a.box(x - 0.113, 0.42, z + end * 0.72, 0.013, 0.012, 0.49, edgeMetal, 0, 0, spoke * Math.PI / 8);
    }
    a.box(x, 0.73, z, 0.055, 0.045, 0.94, frame);
    a.box(x, 0.57, z - 0.2, 0.06, 0.045, 0.79, frame, 0, 0, 0.55);
    a.box(x, 0.7, z - 0.33, 0.045, 0.65, 0.045, frame, 0, 0, -0.3);
    a.box(x, 0.7, z + 0.65, 0.045, 0.68, 0.045, metal, 0, 0, 0.3);
    a.box(x, 1.06, z + 0.47, 0.48, 0.035, 0.035, metal);
    a.box(x, 1.06, z - 0.37, motor ? 0.27 : 0.21, 0.065, motor ? 0.7 : 0.25, rubber);
    a.cylinder(x, 0.88, z - 0.34, 0.024, 0.35, metal);
    if (motor) {
      a.box(x, 0.59, z - 0.12, 0.32, 0.26, 0.4, metal);
      a.sphere(x, 0.88, z + 0.1, 0.2, 0.15, 0.3, frame);
      a.cylinder(x - 0.19, 0.47, z - 0.38, 0.055, 0.7, metal, 0, Math.PI / 2);
      a.sphere(x, 0.99, z + 0.68, 0.14, 0.14, 0.09, white);
      a.box(x, 0.69, z - 0.91, 0.2, 0.15, 0.026, white);
    }
    a.box(x + 0.14, 0.23, z - 0.04, 0.028, 0.43, 0.025, metal, 0, 0.35);
    obstacle(x, z, 0.65, 2.0);
  }
  const edgeMetal = mat('#8c958d', 0.45, 0.7);
  bicycle(10.4, 72);
  bicycle(-10.3, -31);
  bicycle(6.6, 39, true);
  bicycle(-6.6, -43, true);

  // Side-street courtyard, patterned rug stalls and café seating.
  const courtyardX = -26, courtyardZ = -69.5;
  a.box(courtyardX, 0.12, courtyardZ, 11, 0.27, 8, concrete);
  for (let x = -31; x <= -21; x += 0.7) for (let z = -73; z <= -66; z += 0.7) {
    a.box(x, 0.263, z, 0.65, 0.01, 0.65, (Math.round((x + z) / 0.7) % 4) ? trim : brick);
  }
  for (const z of [-72.8, -66.1]) {
    a.box(courtyardX, 0.5, z, 10.7, 0.7, 0.6, brick);
    for (let x = -31; x < -20; x += 0.55) a.sphere(x, 0.9, z, 0.26, 0.33, 0.26, leaves[Math.floor(Math.abs(x)) % 4]);
    obstacle(courtyardX, z, 10.7, 0.6);
  }
  const fountain = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.16, 8, 32), trim);
  fountain.rotation.x = Math.PI / 2; fountain.position.set(-27.5, 0.63, -69.5); fountain.name = 'courtyard-fountain'; scene.add(fountain);
  a.cylinder(-27.5, 0.42, -69.5, 1.18, 0.32, concrete);
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#66948c', roughness: 0.18, metalness: 0.35, transparent: true, opacity: 0.85 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.13, 32), waterMaterial);
  water.rotation.x = -Math.PI / 2; water.position.set(-27.5, 0.6, -69.5); scene.add(water);
  a.cylinder(-27.5, 0.95, -69.5, 0.17, 0.85, trim);
  a.sphere(-27.5, 1.41, -69.5, 0.25, 0.15, 0.25, concrete);
  obstacle(-27.5, -69.5, 2.75, 2.75);
  for (const z of [-71, -67.6]) {
    a.cylinder(-23, 0.7, z, 0.5, 0.08, wood);
    a.cylinder(-23, 0.44, z, 0.045, 0.6, metal);
    for (const end of [-1, 1]) {
      a.box(-23 + end * 0.85, 0.5, z, 0.45, 0.07, 0.45, wood);
      a.box(-23 + end * 1.03, 0.78, z, 0.05, 0.57, 0.48, wood);
      a.box(-23 + end * 0.85, 0.29, z, 0.05, 0.45, 0.05, metal);
    }
    a.cylinder(-23, 0.83, z, 0.08, 0.16, white);
    a.sphere(-23 + 0.23, 0.86, z, 0.13, 0.12, 0.13, metal);
    obstacle(-23, z, 2.6, 0.85);
  }
  const courtyardSign = sign('چای و آرامش', 'NEIGHBORHOOD COURTYARD', '#335c58', 3.4, 0.8);
  courtyardSign.position.set(-26, 2.7, -65.45); scene.add(courtyardSign);
  for (const x of [-27.6, -24.4]) a.cylinder(x, 1.5, -65.5, 0.06, 2.9, wood);

  function carpetTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 384;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#813f34'; ctx.fillRect(0, 0, 256, 384);
    for (let border = 0; border < 4; border++) {
      ctx.strokeStyle = border % 2 ? '#baa574' : '#263b3c'; ctx.lineWidth = 5;
      ctx.strokeRect(9 + border * 8, 9 + border * 8, 238 - border * 16, 366 - border * 16);
    }
    for (let y = 55; y < 340; y += 47) for (let x = 52; x < 235; x += 51) {
      ctx.fillStyle = (Math.round(y / 47) + Math.round(x / 51)) % 2 ? '#c3a576' : '#2d4140';
      ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x + 17, y); ctx.lineTo(x, y + 16); ctx.lineTo(x - 17, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#974d3c'; ctx.fillRect(x - 4, y - 4, 8, 8);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }
  const rugMaterial = new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 1, side: THREE.DoubleSide });
  for (let rug = 0; rug < 3; rug++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.25, 5, 8), rugMaterial);
    mesh.position.set(-11.75, 1.55, 54 + rug * 1.8); mesh.rotation.y = Math.PI / 2; mesh.name = 'woven-carpet';
    scene.add(mesh);
    animatedCloth.push({ mesh, base: new Float32Array(mesh.geometry.getAttribute('position').array), phase: rug * 1.9 });
    a.cylinder(-11.82, 2.78, 54 + rug * 1.8, 0.035, 1.5, wood, 0, Math.PI / 2);
  }

  // Rooftop skyline landmark is deliberately outside the combat area.
  const landmark = new THREE.Group(); landmark.name = 'tiled-dome-landmark';
  landmark.position.set(-80, 0, -160); scene.add(landmark);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5.1, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), blueTile);
  dome.position.y = 14; dome.scale.y = 1.25; dome.castShadow = true; landmark.add(dome);
  a.box(-80, 5.2, -160, 21, 10.4, 17, wallMats[4]);
  a.cylinder(-80, 11.7, -160, 5.6, 4.7, trim);
  a.cylinder(-80, 12.4, -160, 5.68, 0.6, blueTile);
  a.cylinder(-80, 20.6, -160, 0.08, 1.6, yellow);
  a.sphere(-80, 21.35, -160, 0.19, 0.3, 0.19, yellow);
  for (const end of [-1, 1]) {
    const x = -80 + end * 13;
    a.cylinder(x, 11.5, -161, 1.05, 23, trim);
    for (const y of [5, 13, 20]) a.cylinder(x, y, -161, 1.18, 0.5, blueTile);
    a.cylinder(x, 22.5, -161, 1.5, 0.24, trim);
    for (let rail = 0; rail < 14; rail++) {
      const angle = rail / 14 * Math.PI * 2;
      a.cylinder(x + Math.sin(angle) * 1.32, 23, -161 + Math.cos(angle) * 1.32, 0.025, 0.8, metal);
    }
    a.sphere(x, 24.2, -161, 1.18, 1.6, 1.18, blueTile);
    a.cylinder(x, 25.9, -161, 0.04, 1.2, yellow);
  }
  for (let window = 0; window < 7; window++) {
    const x = -88.4 + window * 2.8;
    a.box(x, 5.1, -151.46, 1.2, 3.2, 0.04, glass);
    a.sphere(x, 6.69, -151.46, 0.6, 0.6, 0.025, glass);
    a.box(x, 3.4, -151.4, 1.45, 0.16, 0.25, blueTile);
  }

  const staticMeshes: THREE.Object3D[] = a.flush(scene);
  // Include unique props in ray occlusion; exclude sky and distant terrain.
  // Groups (vehicles and landmarks) must also block shots. Sky is decorative only.
  scene.children.forEach(child => {
    if ((child instanceof THREE.Mesh || child instanceof THREE.Group) && child !== sky && child !== clouds && !staticMeshes.includes(child)) staticMeshes.push(child);
  });
  // Fountain jets and distant birds are decorative and never intercept gunfire.
  const fountainGeometry = new THREE.BufferGeometry();
  fountainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(28 * 3), 3));
  const fountainSpray = new THREE.Points(fountainGeometry, new THREE.PointsMaterial({ color: '#c7e1d3', size: 0.045, transparent: true, opacity: 0.7, depthWrite: false }));
  fountainSpray.name = 'fountain-spray'; fountainSpray.frustumCulled = false; scene.add(fountainSpray);
  const birdGeometry = new THREE.BufferGeometry();
  birdGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.8, 0, 0, 0, 0, 0.17, 0.8, 0, 0, 0, 0, -0.2], 3));
  birdGeometry.setIndex([0, 1, 3, 1, 2, 3]); birdGeometry.computeVertexNormals();
  const birds = new THREE.InstancedMesh(birdGeometry, new THREE.MeshBasicMaterial({ color: '#394440', side: THREE.DoubleSide }), 12);
  birds.name = 'circling-birds'; birds.frustumCulled = false; scene.add(birds);
  const birdMatrix = new THREE.Matrix4();
  const birdRotation = new THREE.Quaternion();

  const drones: Drone[] = [];
  const droneMat = mat('#313d3d', 0.5, 0.65);
  const droneAccent = mat('#d6a057', 0.45, 0.5);
  const targetMaterial = new THREE.MeshStandardMaterial({ color: '#f7bc66', emissive: '#fca954', emissiveIntensity: 2 });
  const dronePositions = [[-3, 4.7, 17], [4, 6, -6], [-3, 5.5, -39], [4, 7, -62], [-4, 5.3, -92], [1, 8, -117]];
  for (let i = 0; i < dronePositions.length; i++) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 0.65), droneMat); body.castShadow = true; group.add(body);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), targetMaterial); core.position.set(0, -0.15, 0.35); group.add(core);
    const rotors: THREE.Mesh[] = [];
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.95), droneAccent);
      arm.position.set(x * 0.38, 0, z * 0.35); arm.rotation.y = -x * z * Math.PI / 4; group.add(arm);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8), droneMat); motor.position.set(x * 0.67, 0.05, z * 0.62); group.add(motor);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.02, 0.07), metal); rotor.position.set(x * 0.67, 0.16, z * 0.62); group.add(rotor); rotors.push(rotor);
    }
    const base = new THREE.Vector3(...dronePositions[i]);
    group.position.copy(base); group.userData.droneIndex = i;
    scene.add(group); drones.push({ group, core, base, alive: true, phase: i * 1.7, rotors });
  }

  const dustGeometry = new THREE.BufferGeometry();
  const dust: number[] = [];
  for (let i = 0; i < 350; i++) dust.push((random() - 0.5) * 120, random() * 25, (random() - 0.5) * 230);
  dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
  const dustCloud = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#f3d9a8', size: 0.04, transparent: true, opacity: 0.35, depthWrite: false }));
  scene.add(dustCloud);

  return {
    scene, collisions, drones, staticMeshes,
    update(time: number, focus?: THREE.Vector3) {
      if (focus) {
        // Follow the player with a tighter shadow frustum for readable façade/prop shadows.
        const x = Math.round(focus.x), z = Math.round(focus.z - 18);
        sun.position.set(x - 48, 72, z + 36); sun.target.position.set(x, 0, z);
        sun.target.updateMatrixWorld();
      }
      clouds.position.x = Math.sin(time * 0.008) * 25;
      waterMaterial.roughness = 0.2 + Math.sin(time * 1.5) * 0.04;
      const droplets = fountainGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let drop = 0; drop < droplets.count; drop++) {
        const t = (time * 0.7 + drop / droplets.count) % 1;
        const angle = drop * 2.399;
        droplets.setXYZ(drop, -27.5 + Math.cos(angle) * t * 0.8, 1.44 + 2.6 * t - 3.4 * t * t, -69.5 + Math.sin(angle) * t * 0.8);
      }
      droplets.needsUpdate = true;
      for (let bird = 0; bird < birds.count; bird++) {
        const angle = time * 0.17 + bird * 0.17;
        birdRotation.setFromEuler(new THREE.Euler(0, -angle, Math.sin(time * 3 + bird) * 0.15));
        birdMatrix.compose(new THREE.Vector3(-35 + Math.cos(angle) * (18 + bird), 33 + Math.sin(time * 0.5 + bird) * 2 + bird * 0.45, -100 + Math.sin(angle) * (18 + bird)), birdRotation, new THREE.Vector3(0.6, 1, 0.6));
        birds.setMatrixAt(bird, birdMatrix);
      }
      birds.instanceMatrix.needsUpdate = true;
      for (const cloth of animatedCloth) {
        const positions = cloth.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let vertex = 0; vertex < positions.count; vertex++) {
          const x = cloth.base[vertex * 3], y = cloth.base[vertex * 3 + 1];
          const weight = 1 - (y + (cloth.mesh.geometry as THREE.PlaneGeometry).parameters.height / 2) / (cloth.mesh.geometry as THREE.PlaneGeometry).parameters.height;
          positions.setXYZ(vertex, x, y, Math.sin(time * 2.1 + cloth.phase + x * 4 + y * 1.3) * weight * 0.1);
        }
        positions.needsUpdate = true; cloth.mesh.geometry.computeVertexNormals();
      }
      dustCloud.position.x = Math.sin(time * 0.04) * 4;
      for (const drone of drones) {
        if (!drone.alive) continue;
        drone.group.position.copy(drone.base);
        drone.group.position.y += Math.sin(time * 1.7 + drone.phase) * 0.4;
        drone.group.position.x += Math.sin(time * 0.55 + drone.phase) * 1.6;
        drone.group.rotation.y = Math.sin(time * 0.45 + drone.phase) * 0.5;
        for (const rotor of drone.rotors) rotor.rotation.y = time * 65;
      }
    },
  };
}
