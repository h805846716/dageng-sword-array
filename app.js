import * as THREE from './vendor/three.module.js';

const app = document.querySelector('#app');
const flash = document.querySelector('#flash');
const stateText = document.querySelector('#stateText');
const energyFill = document.querySelector('#energyFill');
const gestureName = document.querySelector('#gestureName');
const formationName = document.querySelector('#formationName');
const cameraBtn = document.querySelector('#cameraBtn');
const formationBtn = document.querySelector('#formationBtn');
const burstBtn = document.querySelector('#burstBtn');
const resetBtn = document.querySelector('#resetBtn');
const cameraView = document.querySelector('#cameraView');
const handVideo = document.querySelector('#handVideo');
const handOverlay = document.querySelector('#handOverlay');
const handCtx = handOverlay.getContext('2d');

window.lucide?.createIcons();

const HandTracker = window.Hands;
const HAND_CONNECTIONS = window.HAND_CONNECTIONS || HandTracker?.HAND_CONNECTIONS;
const drawConnectors = window.drawConnectors;
const drawLandmarks = window.drawLandmarks;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050608, 0.035);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 130);
updateCameraForViewport();

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.className = 'webgl';
app.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const pointerWorld = new THREE.Vector3();
const previousTarget = new THREE.Vector3();
const targetWorld = new THREE.Vector3();
const releaseDir = new THREE.Vector3(0, 0.24, -1).normalize();
const idleTarget = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();
const desired = new THREE.Vector3();
const dummy = new THREE.Object3D();
const upAxis = new THREE.Vector3(0, 1, 0);
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

const SWORD_COUNT = innerWidth < 720 ? 320 : 620;
const formations = ['剑轮', '星瀑', '游龙', '天罗', '剑雨'];
const gestureLabels = {
  idle: '指尖游走',
  sword: '剑指成轮',
  point: '引剑破空',
  pinch: '聚剑蓄势',
  open: '开掌布阵',
  fist: '握拳凝核',
  horns: '剑雨落阵',
  triad: '三指结印',
  thumb: '换阵',
  double: '双手合阵',
  seal: '合掌归一',
  lost: '寻手'
};
const gestureToStrip = {
  sword: 'sword',
  point: 'point',
  pinch: 'pinch',
  open: 'open',
  fist: 'fist',
  horns: 'horns',
  triad: 'triad',
  thumb: 'sword',
  double: 'double',
  seal: 'double'
};

const sim = {
  energy: 0.12,
  command: 'idle',
  commandAge: 0,
  gesture: 'idle',
  formation: 0,
  volley: false,
  volleyAge: 0,
  bloom: 0,
  compression: 0,
  shield: 0,
  rain: 0,
  twoHand: 0,
  pointerDown: false
};

const handControl = {
  enabled: false,
  hands: null,
  stream: null,
  looping: false,
  processing: false,
  seen: false,
  lastRaw: 'idle',
  stableGesture: 'idle',
  stableCount: 0,
  previousGesture: 'idle',
  previousWorld: new THREE.Vector3(),
  hasPreviousWorld: false,
  velocity: new THREE.Vector3(),
  lastTime: performance.now(),
  lastFormationAt: 0,
  lastRainAt: 0,
  lastRingAt: 0,
  lastSlashAt: 0,
  lastSealAt: 0
};

scene.add(new THREE.HemisphereLight(0xd9fff5, 0x170f09, 0.82));

const focusLight = new THREE.PointLight(0x62f2d5, 12, 32, 1.4);
scene.add(focusLight);

const goldLight = new THREE.DirectionalLight(0xf7d36b, 1.65);
goldLight.position.set(-4.8, 5.6, 5.2);
scene.add(goldLight);

const emberLight = new THREE.PointLight(0xff7657, 4.6, 25, 2);
emberLight.position.set(4, -2.4, 3);
scene.add(emberLight);

const stars = new THREE.Points(
  makeStarGeometry(1400, 42),
  new THREE.PointsMaterial({
    color: 0xdbfff6,
    size: 0.022,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  })
);
scene.add(stars);

const focus = new THREE.Group();
scene.add(focus);

const focusCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 48, 32),
  new THREE.MeshStandardMaterial({
    color: 0xf2fff8,
    emissive: 0x4deed4,
    emissiveIntensity: 2.5,
    roughness: 0.24,
    metalness: 0.14
  })
);
focus.add(focusCore);

const focusRings = [];
for (let i = 0; i < 5; i++) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42 + i * 0.16, 0.008, 8, 120),
    new THREE.MeshBasicMaterial({
      color: [0x62f2d5, 0xf7d36b, 0xff7657, 0x84b7ff, 0x98f07a][i],
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  ring.userData.speed = (0.32 + i * 0.13) * (i % 2 ? -1 : 1);
  focusRings.push(ring);
  focus.add(ring);
}

const swordGroup = new THREE.Group();
scene.add(swordGroup);

const bladeGeometry = new THREE.ConeGeometry(0.037, 0.76, 4, 1);
bladeGeometry.translate(0, 0.2, 0);
bladeGeometry.rotateY(Math.PI / 4);
const guardGeometry = new THREE.BoxGeometry(0.24, 0.032, 0.055);
guardGeometry.translate(0, -0.23, 0);
const hiltGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8);
hiltGeometry.translate(0, -0.43, 0);

const bladeMaterial = new THREE.MeshStandardMaterial({
  color: 0xe8fff9,
  emissive: 0x23e7cc,
  emissiveIntensity: 1.15,
  metalness: 0.58,
  roughness: 0.2
});
const guardMaterial = new THREE.MeshStandardMaterial({
  color: 0xf7d36b,
  emissive: 0x8b5208,
  emissiveIntensity: 0.56,
  metalness: 0.62,
  roughness: 0.31
});
const hiltMaterial = new THREE.MeshStandardMaterial({
  color: 0x2d3431,
  emissive: 0x09100d,
  emissiveIntensity: 0.75,
  metalness: 0.38,
  roughness: 0.44
});

const blades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, SWORD_COUNT);
const guards = new THREE.InstancedMesh(guardGeometry, guardMaterial, SWORD_COUNT);
const hilts = new THREE.InstancedMesh(hiltGeometry, hiltMaterial, SWORD_COUNT);
blades.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
guards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
hilts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
swordGroup.add(blades, guards, hilts);

const swords = [];
for (let i = 0; i < SWORD_COUNT; i++) {
  const seed = Math.random() * 1000;
  formationInto(desired, i, 0, seed, targetWorld);
  swords.push({
    pos: desired.clone(),
    prev: desired.clone(),
    vel: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 1, 0),
    seed,
    phase: Math.random() * Math.PI * 2,
    lane: (Math.random() - 0.5) * 2,
    scale: 0.72 + Math.random() * 0.78
  });
}

const trailPositions = new Float32Array(SWORD_COUNT * 2 * 3);
const trailGeometry = new THREE.BufferGeometry();
trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
const trails = new THREE.LineSegments(
  trailGeometry,
  new THREE.LineBasicMaterial({
    color: 0x86ffe4,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
scene.add(trails);

const slashes = [];
const slashGroup = new THREE.Group();
scene.add(slashGroup);

const rings = [];
const ringGroup = new THREE.Group();
scene.add(ringGroup);

function makeStarGeometry(count, spread) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.78;
    positions[i * 3 + 2] = -8 - Math.random() * 34;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function screenToWorld(x, y) {
  pointerNdc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  raycaster.ray.intersectPlane(plane, pointerWorld);
  return pointerWorld;
}

function updateCameraForViewport() {
  const portrait = innerWidth / innerHeight < 0.72;
  camera.fov = portrait ? 54 : 48;
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(0, portrait ? 1.45 : 1.1, portrait ? 17.2 : 12.2);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function setTargetFromWorld(world) {
  previousTarget.copy(targetWorld);
  targetWorld.copy(world);
  releaseDir.copy(targetWorld).sub(previousTarget);
  if (releaseDir.lengthSq() < 0.0001) releaseDir.set(0, 0.24, -1);
  releaseDir.normalize().add(tmp.set(0, 0.12, -0.58)).normalize();
}

function setTarget(x, y) {
  setTargetFromWorld(screenToWorld(x, y));
}

function setCommand(command) {
  if (sim.command !== command) {
    sim.command = command;
    sim.commandAge = 0;
  }
}

function cycleFormation() {
  sim.formation = (sim.formation + 1) % formations.length;
  formationBtn.classList.add('is-on');
  setTimeout(() => formationBtn.classList.remove('is-on'), 180);
}

function triggerFlash(power = 0.5) {
  const x = THREE.MathUtils.clamp(50 + targetWorld.x * 5, 8, 92);
  const y = THREE.MathUtils.clamp(50 - targetWorld.y * 7, 8, 92);
  flash.style.setProperty('--flash-x', `${x}%`);
  flash.style.setProperty('--flash-y', `${y}%`);
  flash.style.transition = 'none';
  flash.style.opacity = String(0.12 + power * 0.28);
  requestAnimationFrame(() => {
    flash.style.transition = 'opacity .52s ease';
    flash.style.opacity = '0';
  });
}

function releaseVolley(force = false) {
  renderer.domElement.classList.remove('is-commanding');
  if (!force && sim.energy < 0.18) {
    sim.volley = false;
    setCommand('idle');
    return;
  }
  sim.volley = true;
  sim.volleyAge = 0;
  sim.energy = force ? Math.max(sim.energy, 0.92) : sim.energy;
  setCommand('idle');
  triggerFlash(sim.energy);
  addSlashBurst(targetWorld.clone(), releaseDir.clone(), sim.energy, 0xf8fff8);
}

function addSlashBurst(origin, direction, power, color = 0xf8fff8) {
  const geometry = new THREE.BufferGeometry();
  const segmentCount = Math.round(38 + power * 42);
  const data = new Float32Array(segmentCount * 2 * 3);
  const side = tmp.set(-direction.z, 0, direction.x).normalize();
  if (!Number.isFinite(side.x)) side.set(1, 0, 0);
  for (let i = 0; i < segmentCount; i++) {
    const spread = 1.5 + power * 3.8;
    const start = origin.clone()
      .addScaledVector(side, (Math.random() - 0.5) * spread)
      .add(tmp2.set(0, (Math.random() - 0.5) * spread * 0.78, 0));
    const end = start.clone().addScaledVector(direction, 1.2 + Math.random() * 2.8 + power * 3.2);
    data.set([start.x, start.y, start.z, end.x, end.y, end.z], i * 6);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(data, 3));
  const line = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  slashGroup.add(line);
  slashes.push({ line, age: 0, life: 0.5 + power * 0.16, power });
}

function addRain(origin, power) {
  const geometry = new THREE.BufferGeometry();
  const segmentCount = Math.round(42 + power * 58);
  const data = new Float32Array(segmentCount * 2 * 3);
  for (let i = 0; i < segmentCount; i++) {
    const x = origin.x + (Math.random() - 0.5) * (5.2 + power * 3.4);
    const z = -1.8 - Math.random() * 2.4;
    const y = origin.y + 3.5 + Math.random() * 2.4;
    const len = 1.2 + Math.random() * 1.8 + power * 1.4;
    data.set([x, y, z, x + (Math.random() - 0.5) * 0.32, y - len, z + 0.22], i * 6);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(data, 3));
  const line = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0x98f07a,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  slashGroup.add(line);
  slashes.push({ line, age: 0, life: 0.72, power, fall: true });
}

function addRing(origin, color = 0x62f2d5, tilt = 0) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.012, 8, 128),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.74,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  ring.position.copy(origin);
  ring.rotation.set(Math.PI / 2 + tilt, Math.random() * Math.PI, tilt * 0.6);
  ring.scale.setScalar(0.18);
  ringGroup.add(ring);
  rings.push({ ring, age: 0, life: 0.86, speed: 2.7 + sim.energy * 2.4 });
}

function formationInto(out, index, time, seed, center) {
  const count = SWORD_COUNT;
  const t = index / count;
  const golden = 2.399963229728653;
  const phase = index * golden + seed * 0.01;
  const mode = formations[sim.formation];

  if (mode === '剑轮') {
    const ring = index % 10;
    const radius = 1.55 + ring * 0.38 + Math.sin(time * 0.45 + seed) * 0.08;
    const angle = phase + time * (0.13 + ring * 0.012);
    out.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * 0.62,
      Math.sin(time * 0.72 + phase) * 0.7 - 1.35 + ring * 0.045
    );
  } else if (mode === '星瀑') {
    const col = index % 31;
    const row = Math.floor(index / 31) / Math.ceil(count / 31);
    const wave = Math.sin(time * 1.4 + col * 0.55 + seed) * 0.32;
    out.set(
      (col / 30 - 0.5) * 8.2 + Math.sin(row * 12 + time) * 0.2,
      (0.5 - row) * 5.9 + wave,
      -1.5 + Math.sin(col * 0.4 + time * 0.5) * 0.72
    );
  } else if (mode === '游龙') {
    const lane = (index % 18) / 18;
    const u = t * Math.PI * 9.6 + time * 0.72;
    const radius = 2.1 + Math.sin(t * Math.PI * 8) * 0.78 + lane * 2.1;
    out.set(
      Math.cos(u) * radius + Math.sin(t * 16) * 1.05,
      Math.sin(u * 0.72) * 2.35 + (lane - 0.5) * 1.7,
      Math.sin(u) * radius * 0.42 - 1.35
    );
  } else if (mode === '天罗') {
    const y = 1 - 2 * t;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = phase + time * 0.16;
    const radius = 4.1 + Math.sin(time + seed) * 0.08;
    out.set(Math.cos(angle) * r * radius, y * 2.9, Math.sin(angle) * r * radius * 0.62 - 1.55);
  } else {
    const col = index % 35;
    const row = Math.floor(index / 35);
    out.set(
      (col / 34 - 0.5) * 8.6 + Math.sin(time * 0.9 + row) * 0.22,
      3.2 - (row % 18) * 0.18 + Math.sin(time * 1.2 + seed) * 0.18,
      -2.2 + Math.sin(col * 0.37 + time) * 0.86
    );
  }

  return out.addScaledVector(center, 0.16);
}

function gatherInto(out, sword, index, time) {
  const ring = index % 14;
  const angle = sword.phase + time * (2.5 + sim.energy * 5.8) + ring * 0.39;
  const radius = THREE.MathUtils.lerp(3.45 + ring * 0.075, 0.42 + ring * 0.017, sim.energy);
  const height = Math.sin(time * 2.1 + sword.phase) * (0.22 + sim.energy * 0.34);
  return out.set(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.62 + height,
    Math.sin(angle * 1.12) * radius * 0.35 - sim.energy * 1.18
  ).add(targetWorld);
}

function fistInto(out, sword, index, time) {
  const t = index / SWORD_COUNT;
  const angle = sword.phase + time * (4.8 + sim.energy * 5.2);
  const y = (t - 0.5) * (1.6 - sim.energy * 0.9);
  const radius = 0.48 + Math.sin(t * Math.PI * 16 + time * 2) * 0.13 + (index % 7) * 0.025;
  return out.set(
    Math.cos(angle) * radius,
    y + Math.sin(angle * 1.7) * 0.18,
    Math.sin(angle) * radius * 0.58 - 0.55
  ).add(targetWorld);
}

function openInto(out, sword, index, time) {
  const t = index / SWORD_COUNT;
  const angle = index * 2.399963229728653 + time * 0.22;
  const radius = 2.6 + Math.sqrt(t) * (4.8 + sim.bloom * 1.8);
  const lift = Math.sin(time * 1.3 + sword.phase) * 0.32;
  return out.set(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.52 + lift,
    Math.sin(angle * 0.9) * radius * 0.42 - 1.6
  ).addScaledVector(targetWorld, 0.3);
}

function streamInto(out, sword, index, time) {
  const t = index / SWORD_COUNT;
  const side = tmp.set(-releaseDir.z, 0, releaseDir.x).normalize();
  if (!Number.isFinite(side.x)) side.set(1, 0, 0);
  const wave = Math.sin(t * 38 + time * 8 + sword.phase) * 0.26;
  return out.copy(targetWorld)
    .addScaledVector(releaseDir, (t - 0.15) * -7.5)
    .addScaledVector(side, wave + sword.lane * 0.62)
    .add(tmp2.set(0, Math.sin(t * 24 + time * 5) * 0.42, -t * 1.8));
}

function swordFingerInto(out, sword, index, time) {
  const ring = index % 9;
  const angle = sword.phase + time * (1.8 + sim.energy * 3.2) + ring * 0.47;
  const radius = 1.15 + ring * 0.3;
  return out.set(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.72,
    Math.sin(angle * 1.3 + time) * 0.72 - 1.1
  ).add(targetWorld);
}

function rainInto(out, sword, index, time) {
  const col = index % 38;
  const row = Math.floor(index / 38);
  const fall = (time * (1.4 + sim.energy * 2.2) + row * 0.17 + sword.seed) % 6;
  return out.set(
    (col / 37 - 0.5) * 8.4 + Math.sin(time + row) * 0.22,
    3.4 - fall,
    -2.1 + Math.sin(col * 0.5 + row) * 0.9
  ).addScaledVector(targetWorld, 0.18);
}

function sealInto(out, sword, index, time) {
  const layer = index % 6;
  const angle = sword.phase + time * (0.85 + layer * 0.08);
  const radius = 1.3 + layer * 0.54 + Math.sin(time * 1.1 + sword.seed) * 0.08;
  return out.set(
    Math.cos(angle) * radius,
    Math.sin(angle * 1.17) * radius * 0.48,
    Math.sin(angle) * radius * 0.48 - 1.4
  ).addScaledVector(targetWorld, 0.24);
}

function volleyInto(out, sword, index) {
  const spread = 1 - Math.min(sim.volleyAge / 1.25, 1);
  const side = tmp.set(-releaseDir.z, 0, releaseDir.x).normalize();
  if (!Number.isFinite(side.x)) side.set(1, 0, 0);
  return out.copy(targetWorld)
    .addScaledVector(releaseDir, sim.volleyAge * (10.5 + sim.energy * 9.2) + index / SWORD_COUNT * 7.8)
    .addScaledVector(side, sword.lane * spread * 3.4)
    .add(tmp2.set(0, Math.sin(sword.phase + sim.volleyAge * 10) * 0.32 * spread, 0));
}

function desiredInto(out, sword, index, time) {
  if (sim.volley) return volleyInto(out, sword, index);
  if (sim.command === 'pinch') return gatherInto(out, sword, index, time);
  if (sim.command === 'fist') return fistInto(out, sword, index, time);
  if (sim.command === 'open') return openInto(out, sword, index, time);
  if (sim.command === 'point') return streamInto(out, sword, index, time);
  if (sim.command === 'sword') return swordFingerInto(out, sword, index, time);
  if (sim.command === 'horns') return rainInto(out, sword, index, time);
  if (sim.command === 'triad' || sim.command === 'double' || sim.command === 'seal') return sealInto(out, sword, index, time);
  return formationInto(out, index, time, sword.seed, targetWorld);
}

function friendlyHandError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError') return '摄像头权限被拒绝';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '没有检测到摄像头';
  if (name === 'NotReadableError' || name === 'TrackStartError') return '摄像头被占用';
  if (name === 'SecurityError') return '请用 localhost 或 https 打开';
  return err?.message || '手势控制启动失败';
}

function analyzeHand(landmarks) {
  const wrist = landmarks[0];
  const palmCenter = {
    x: (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 5,
    y: (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 5,
    z: (landmarks[0].z + landmarks[5].z + landmarks[9].z + landmarks[13].z + landmarks[17].z) / 5
  };
  const palmWidth = Math.max(distance(landmarks[5], landmarks[17]), 0.001);
  const fingerDefs = {
    index: [8, 6],
    middle: [12, 10],
    ring: [16, 14],
    pinky: [20, 18]
  };
  const extended = {};
  for (const [name, [tip, pip]] of Object.entries(fingerDefs)) {
    extended[name] = distance(landmarks[tip], wrist) > distance(landmarks[pip], wrist) + palmWidth * 0.18;
  }
  extended.thumb = distance(landmarks[4], palmCenter) > palmWidth * 0.72
    && distance(landmarks[4], landmarks[9]) > palmWidth * 0.72;

  const count = ['index', 'middle', 'ring', 'pinky'].filter(name => extended[name]).length;
  const pinch = distance(landmarks[4], landmarks[8]) / palmWidth;
  const center = { x: palmCenter.x, y: palmCenter.y, z: palmCenter.z };
  const screen = { x: (1 - center.x) * innerWidth, y: center.y * innerHeight };
  const world = screenToWorld(screen.x, screen.y).clone();
  const size = Math.max(distance(landmarks[0], landmarks[9]), palmWidth);
  return { landmarks, extended, count, pinch, center, screen, world, palmWidth, size };
}

function classifyHand(profile, allProfiles) {
  if (allProfiles.length > 1) {
    const [a, b] = allProfiles;
    const bothOpen = a.count >= 4 && b.count >= 4;
    const bothPinch = a.pinch < 0.58 && b.pinch < 0.58;
    const centerGap = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
    if ((bothOpen && centerGap < 0.34) || bothPinch) return 'seal';
    if (bothOpen || (a.count >= 3 && b.count >= 3)) return 'double';
  }

  const f = profile.extended;
  if (profile.pinch < 0.56) return 'pinch';
  if (profile.count >= 4) return 'open';
  if (f.index && f.middle && !f.ring && !f.pinky) return 'sword';
  if (f.index && !f.middle && !f.ring && !f.pinky) return 'point';
  if (!f.index && !f.middle && !f.ring && !f.pinky) return 'fist';
  if (f.index && f.pinky && !f.middle && !f.ring) return 'horns';
  if (f.index && f.middle && f.ring && !f.pinky) return 'triad';
  if (f.thumb && profile.count <= 1) return 'thumb';
  return 'idle';
}

function setStableGesture(raw) {
  if (raw === handControl.lastRaw) handControl.stableCount += 1;
  else {
    handControl.lastRaw = raw;
    handControl.stableCount = 1;
  }
  if (handControl.stableCount >= 2 || raw === 'pinch') {
    handControl.stableGesture = raw;
  }
  return handControl.stableGesture;
}

function applyGesture(gesture, profile, profiles) {
  const now = performance.now();
  let world = profile.world;
  if (profiles.length > 1) {
    world = tmp.copy(profiles[0].world).add(profiles[1].world).multiplyScalar(0.5).clone();
  }

  if (handControl.hasPreviousWorld) {
    const dt = Math.max((now - handControl.lastTime) / 1000, 0.016);
    handControl.velocity.copy(world).sub(handControl.previousWorld).divideScalar(dt);
  }
  handControl.previousWorld.copy(world);
  handControl.hasPreviousWorld = true;
  handControl.lastTime = now;
  setTargetFromWorld(world);

  if (handControl.previousGesture === 'pinch' && gesture !== 'pinch') releaseVolley(false);

  sim.gesture = gesture;
  sim.handSeen = true;
  renderer.domElement.classList.toggle('is-commanding', gesture === 'pinch' || gesture === 'fist');

  if (gesture === 'pinch') {
    setCommand('pinch');
    sim.energy = THREE.MathUtils.clamp(sim.energy + 0.012, 0.12, 1);
  } else if (gesture === 'fist') {
    setCommand('fist');
    sim.compression = 1;
    sim.energy = THREE.MathUtils.clamp(sim.energy + 0.008, 0.12, 1);
    if (now - handControl.lastRingAt > 820) {
      addRing(targetWorld.clone(), 0xff7657, 0.45);
      handControl.lastRingAt = now;
    }
  } else if (gesture === 'open') {
    setCommand('open');
    sim.bloom = 1;
    sim.formation = 3;
    sim.energy = THREE.MathUtils.clamp(sim.energy + 0.004, 0.12, 1);
    if (now - handControl.lastRingAt > 520) {
      addRing(targetWorld.clone(), 0x62f2d5, 0);
      handControl.lastRingAt = now;
    }
  } else if (gesture === 'point') {
    setCommand('point');
    const speed = handControl.velocity.length();
    if (speed > 5.4 && now - handControl.lastSlashAt > 260) {
      const dir = handControl.velocity.clone().normalize().add(tmp.set(0, 0.05, -0.5)).normalize();
      releaseDir.copy(dir);
      addSlashBurst(targetWorld.clone(), dir, Math.min(1, speed / 11), 0x84b7ff);
      handControl.lastSlashAt = now;
    }
  } else if (gesture === 'sword') {
    setCommand('sword');
    sim.formation = 0;
    sim.energy = THREE.MathUtils.clamp(sim.energy + 0.005, 0.12, 1);
  } else if (gesture === 'horns') {
    setCommand('horns');
    sim.formation = 4;
    sim.rain = 1;
    sim.energy = THREE.MathUtils.clamp(sim.energy + 0.006, 0.12, 1);
    if (now - handControl.lastRainAt > 420) {
      addRain(targetWorld.clone(), sim.energy);
      handControl.lastRainAt = now;
    }
  } else if (gesture === 'triad') {
    setCommand('triad');
    sim.shield = 1;
    sim.energy = THREE.MathUtils.clamp(sim.energy + 0.005, 0.12, 1);
    if (now - handControl.lastRingAt > 620) {
      addRing(targetWorld.clone(), 0xf7d36b, -0.35);
      handControl.lastRingAt = now;
    }
  } else if (gesture === 'double') {
    setCommand('double');
    sim.twoHand = 1;
    sim.shield = 1;
    sim.energy = THREE.MathUtils.clamp(sim.energy + 0.009, 0.12, 1);
    if (now - handControl.lastRingAt > 520) {
      addRing(targetWorld.clone(), 0x98f07a, 0.25);
      handControl.lastRingAt = now;
    }
  } else if (gesture === 'seal') {
    setCommand('seal');
    sim.twoHand = 1;
    sim.energy = THREE.MathUtils.clamp(sim.energy + 0.016, 0.16, 1);
    if (now - handControl.lastSealAt > 1400) {
      releaseVolley(true);
      handControl.lastSealAt = now;
    }
  } else if (gesture === 'thumb') {
    setCommand('idle');
    if (now - handControl.lastFormationAt > 850) {
      cycleFormation();
      handControl.lastFormationAt = now;
    }
  } else {
    setCommand('idle');
  }

  handControl.previousGesture = gesture;
}

function drawHandOverlay(profiles, activeGesture) {
  const width = handVideo.videoWidth || 640;
  const height = handVideo.videoHeight || 480;
  if (handOverlay.width !== width || handOverlay.height !== height) {
    handOverlay.width = width;
    handOverlay.height = height;
  }
  handCtx.clearRect(0, 0, width, height);
  const color = activeGesture === 'horns' ? '#98f07a' : activeGesture === 'fist' ? '#ff7657' : activeGesture === 'triad' ? '#f7d36b' : '#62f2d5';
  profiles.forEach(profile => {
    if (HAND_CONNECTIONS && drawConnectors) {
      drawConnectors(handCtx, profile.landmarks, HAND_CONNECTIONS, { color, lineWidth: 3 });
    }
    if (drawLandmarks) {
      drawLandmarks(handCtx, profile.landmarks, { color: '#f7d36b', lineWidth: 1, radius: 3 });
    }
  });
}

function handleHandResults(results) {
  const rawHands = results.multiHandLandmarks || [];
  if (!rawHands.length) {
    handCtx.clearRect(0, 0, handOverlay.width, handOverlay.height);
    if (handControl.previousGesture === 'pinch') releaseVolley(false);
    handControl.seen = false;
    handControl.hasPreviousWorld = false;
    handControl.previousGesture = 'idle';
    sim.handSeen = false;
    sim.gesture = 'lost';
    setCommand('idle');
    renderer.domElement.classList.remove('is-commanding');
    return;
  }

  const profiles = rawHands.slice(0, 2).map(analyzeHand).sort((a, b) => b.size - a.size);
  const raw = classifyHand(profiles[0], profiles);
  const stable = setStableGesture(raw);
  handControl.seen = true;
  drawHandOverlay(profiles, stable);
  applyGesture(stable, profiles[0], profiles);
}

async function handLoop() {
  if (handControl.looping) return;
  handControl.looping = true;
  while (handControl.enabled) {
    if (!handControl.processing && handControl.hands && handVideo.readyState >= 2) {
      handControl.processing = true;
      try {
        await handControl.hands.send({ image: handVideo });
      } catch (err) {
        console.error(err);
        gestureName.textContent = friendlyHandError(err);
      }
      handControl.processing = false;
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  handControl.looping = false;
}

async function startHandControl() {
  cameraBtn.disabled = true;
  gestureName.textContent = '启动摄像头';
  try {
    if (!HandTracker || !drawLandmarks) throw new Error('手势识别脚本没加载成功');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头');
    if (!handControl.hands) {
      handControl.hands = new HandTracker({
        locateFile: file => `./vendor/mediapipe-hands/${file}`
      });
      handControl.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.72,
        minTrackingConfidence: 0.68
      });
      handControl.hands.onResults(handleHandResults);
    }
    handControl.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 960 },
        height: { ideal: 720 },
        facingMode: 'user'
      }
    });
    handVideo.srcObject = handControl.stream;
    await handVideo.play();
    handControl.enabled = true;
    handControl.seen = false;
    handControl.hasPreviousWorld = false;
    handControl.previousGesture = 'idle';
    handControl.stableGesture = 'idle';
    handControl.stableCount = 0;
    cameraView.classList.add('is-on');
    cameraBtn.classList.add('is-on');
    handLoop();
  } catch (err) {
    console.error(err);
    gestureName.textContent = friendlyHandError(err);
  } finally {
    cameraBtn.disabled = false;
  }
}

function stopHandControl() {
  if (handControl.previousGesture === 'pinch') releaseVolley(false);
  handControl.enabled = false;
  handControl.seen = false;
  handControl.hasPreviousWorld = false;
  handControl.previousGesture = 'idle';
  handControl.stream?.getTracks().forEach(track => track.stop());
  handControl.stream = null;
  handVideo.srcObject = null;
  handCtx.clearRect(0, 0, handOverlay.width, handOverlay.height);
  cameraView.classList.remove('is-on');
  cameraBtn.classList.remove('is-on');
  sim.handSeen = false;
  sim.gesture = 'idle';
  setCommand('idle');
}

function reset() {
  sim.energy = 0.12;
  sim.command = 'idle';
  sim.commandAge = 0;
  sim.gesture = handControl.enabled ? 'lost' : 'idle';
  sim.volley = false;
  sim.volleyAge = 0;
  sim.bloom = 0;
  sim.compression = 0;
  sim.shield = 0;
  sim.rain = 0;
  sim.twoHand = 0;
  targetWorld.set(0, 0, 0);
  previousTarget.set(0, 0, 0);
  renderer.domElement.classList.remove('is-commanding');
  for (let i = 0; i < swords.length; i++) {
    const sword = swords[i];
    formationInto(desired, i, 0, sword.seed, targetWorld);
    sword.pos.copy(desired);
    sword.prev.copy(desired);
    sword.vel.set(0, 0, 0);
  }
  while (slashes.length) {
    const slash = slashes.pop();
    slashGroup.remove(slash.line);
    slash.line.geometry.dispose();
    slash.line.material.dispose();
  }
  while (rings.length) {
    const item = rings.pop();
    ringGroup.remove(item.ring);
    item.ring.geometry.dispose();
    item.ring.material.dispose();
  }
}

renderer.domElement.addEventListener('pointerdown', event => {
  sim.pointerDown = true;
  setTarget(event.clientX, event.clientY);
  renderer.domElement.setPointerCapture(event.pointerId);
  renderer.domElement.classList.add('is-commanding');
  sim.gesture = 'pinch';
  setCommand('pinch');
});

renderer.domElement.addEventListener('pointermove', event => {
  setTarget(event.clientX, event.clientY);
});

renderer.domElement.addEventListener('pointerup', event => {
  sim.pointerDown = false;
  setTarget(event.clientX, event.clientY);
  renderer.domElement.releasePointerCapture(event.pointerId);
  releaseVolley(false);
});

renderer.domElement.addEventListener('pointercancel', () => {
  sim.pointerDown = false;
  renderer.domElement.classList.remove('is-commanding');
  setCommand('idle');
});

cameraBtn.addEventListener('click', () => {
  if (handControl.enabled) stopHandControl();
  else startHandControl();
});

formationBtn.addEventListener('click', cycleFormation);
burstBtn.addEventListener('click', () => releaseVolley(true));
resetBtn.addEventListener('click', reset);

addEventListener('resize', () => {
  updateCameraForViewport();
  renderer.setSize(innerWidth, innerHeight);
});

function updateSwords(dt, time) {
  sim.commandAge += dt;
  if (sim.command === 'pinch' || sim.command === 'fist' || sim.command === 'seal') {
    sim.energy = THREE.MathUtils.clamp(sim.energy + dt * 0.24, 0.12, 1);
  } else if (sim.command === 'sword' || sim.command === 'triad' || sim.command === 'double' || sim.command === 'horns') {
    sim.energy = THREE.MathUtils.clamp(sim.energy + dt * 0.08, 0.12, 1);
  } else if (sim.volley) {
    sim.volleyAge += dt;
    sim.energy = THREE.MathUtils.clamp(sim.energy - dt * 0.05, 0.24, 1);
    if (sim.volleyAge > 1.62) sim.volley = false;
  } else {
    sim.energy = THREE.MathUtils.clamp(sim.energy - dt * 0.045, 0.12, 1);
  }

  sim.bloom = Math.max(0, sim.bloom - dt * 1.35);
  sim.compression = Math.max(0, sim.compression - dt * 1.4);
  sim.shield = Math.max(0, sim.shield - dt * 0.9);
  sim.rain = Math.max(0, sim.rain - dt * 1.05);
  sim.twoHand = Math.max(0, sim.twoHand - dt * 0.9);

  for (let i = 0; i < SWORD_COUNT; i++) {
    const sword = swords[i];
    sword.prev.copy(sword.pos);
    desiredInto(desired, sword, i, time);
    tmp3.copy(desired).sub(sword.pos);
    const stiffness = sim.volley ? 16 : sim.command === 'idle' ? 4.6 : 8.2 + sim.energy * 8.5;
    sword.vel.addScaledVector(tmp3, dt * stiffness);
    sword.vel.multiplyScalar(Math.pow(sim.volley ? 0.986 : 0.928, dt * 60));
    sword.pos.addScaledVector(sword.vel, dt);

    if (sword.vel.lengthSq() > 0.00004) sword.dir.copy(sword.vel).normalize();
    else sword.dir.copy(targetWorld).sub(sword.pos).normalize();
    if (!Number.isFinite(sword.dir.x)) sword.dir.set(0, 1, 0);

    dummy.position.copy(sword.pos);
    dummy.quaternion.setFromUnitVectors(upAxis, sword.dir);
    const gestureScale = sim.command === 'fist' ? 0.82 : sim.command === 'open' ? 1.08 : 1;
    dummy.scale.setScalar(sword.scale * gestureScale * (1 + sim.energy * 0.13));
    dummy.updateMatrix();
    blades.setMatrixAt(i, dummy.matrix);
    guards.setMatrixAt(i, dummy.matrix);
    hilts.setMatrixAt(i, dummy.matrix);

    const trailIndex = i * 6;
    trailPositions[trailIndex] = sword.prev.x;
    trailPositions[trailIndex + 1] = sword.prev.y;
    trailPositions[trailIndex + 2] = sword.prev.z;
    trailPositions[trailIndex + 3] = sword.pos.x;
    trailPositions[trailIndex + 4] = sword.pos.y;
    trailPositions[trailIndex + 5] = sword.pos.z;
  }

  blades.instanceMatrix.needsUpdate = true;
  guards.instanceMatrix.needsUpdate = true;
  hilts.instanceMatrix.needsUpdate = true;
  trailGeometry.attributes.position.needsUpdate = true;
  trails.material.opacity = 0.15 + sim.energy * 0.32 + (sim.volley ? 0.18 : 0);
  bladeMaterial.emissiveIntensity = 1.05 + sim.energy * 2.35 + (sim.volley ? 1.2 : 0);
  guardMaterial.emissiveIntensity = 0.46 + sim.energy * 0.8;
}

function updateBursts(dt) {
  for (let i = slashes.length - 1; i >= 0; i--) {
    const slash = slashes[i];
    slash.age += dt;
    const t = slash.age / slash.life;
    slash.line.material.opacity = Math.max(0, (1 - t) * (0.75 + slash.power * 0.22));
    slash.line.scale.setScalar(1 + t * (1.05 + slash.power));
    if (slash.fall) slash.line.position.y -= dt * (2.4 + slash.power * 2);
    if (t >= 1) {
      slashGroup.remove(slash.line);
      slash.line.geometry.dispose();
      slash.line.material.dispose();
      slashes.splice(i, 1);
    }
  }

  for (let i = rings.length - 1; i >= 0; i--) {
    const item = rings[i];
    item.age += dt;
    const t = item.age / item.life;
    item.ring.scale.setScalar(0.18 + t * item.speed);
    item.ring.rotation.z += dt * (0.7 + sim.energy);
    item.ring.material.opacity = Math.max(0, (1 - t) * 0.74);
    if (t >= 1) {
      ringGroup.remove(item.ring);
      item.ring.geometry.dispose();
      item.ring.material.dispose();
      rings.splice(i, 1);
    }
  }
}

function updateHud() {
  const pct = Math.round(sim.energy * 100);
  const gesture = handControl.enabled && !handControl.seen ? 'lost' : sim.gesture;
  const label = gestureLabels[gesture] || gestureLabels.idle;
  energyFill.style.width = `${pct}%`;
  stateText.textContent = `${label} · ${pct}%`;
  gestureName.textContent = label;
  formationName.textContent = sim.volley ? '归宗' : formations[sim.formation];
  document.querySelectorAll('.gesture-strip span').forEach(item => {
    item.classList.toggle('is-active', item.dataset.gesture === gestureToStrip[gesture]);
  });
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const time = clock.elapsedTime;

  idleTarget.set(Math.sin(time * 0.31) * 0.28, Math.cos(time * 0.27) * 0.16, 0);
  if (!sim.volley && sim.command === 'idle' && !handControl.seen && !sim.pointerDown) {
    targetWorld.lerp(idleTarget, 0.018);
  }

  updateSwords(dt, time);
  updateBursts(dt);

  focus.position.lerp(targetWorld, sim.command === 'idle' ? 0.1 : 0.24);
  focus.scale.setScalar(1 + sim.energy * 0.7 + sim.bloom * 0.35 + sim.shield * 0.22);
  focusCore.material.emissiveIntensity = 2.1 + sim.energy * 5.4 + sim.compression * 2.2;
  focusRings.forEach((ring, index) => {
    ring.rotation.x += dt * ring.userData.speed * (1 + sim.energy * 3.1);
    ring.rotation.y -= dt * ring.userData.speed * 0.66;
    ring.material.opacity = 0.16 + sim.energy * 0.28 + Math.sin(time * 4 + index) * 0.025;
  });

  stars.rotation.y += dt * 0.012;
  stars.rotation.x += dt * 0.004;
  focusLight.position.copy(focus.position).add(tmp.set(0, 0.7, 2.8));
  focusLight.intensity = 8 + sim.energy * 34 + sim.shield * 10;
  emberLight.intensity = 1.2 + sim.energy * 6 + (sim.volley ? 8 : 0) + sim.compression * 4;

  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

reset();
animate();
