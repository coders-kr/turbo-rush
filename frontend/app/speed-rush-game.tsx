'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type Phase = 'menu' | 'countdown' | 'racing' | 'finished';

type Hud = {
  speed: number;
  gear: number;
  lap: number;
  position: number;
  gauge: number;
  tanks: number;
  time: number;
  technique: string;
  combo: number;
  drifting: boolean;
  boost: boolean;
  wrongWay: boolean;
};

type AiKart = {
  mesh: THREE.Group;
  progress: number;
  speed: number;
  cruise: number;
  lane: number;
  laneTarget: number;
  laneTimer: number;
};

type Particle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
};

const TRACK_POINTS = [
  [-8, 1, 96], [66, 3, 91], [124, 8, 48], [132, 13, -20],
  [91, 20, -86], [22, 25, -112], [-52, 21, -98], [-111, 14, -51],
  [-132, 8, 17], [-93, 3, 75],
] as const;

const COLORS = [0xff6b32, 0x24c7ff, 0xf34cc8, 0x71df4d, 0xffd83d, 0x9670ff, 0xff4657, 0x35dfc2];
const ROAD_HALF = 10.5;
const WALL_LIMIT = 12.25;
const SAMPLE_COUNT = 900;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrap01 = (value: number) => ((value % 1) + 1) % 1;
const wrapIndex = (value: number) => ((value % SAMPLE_COUNT) + SAMPLE_COUNT) % SAMPLE_COUNT;

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
  return `${mins}:${secs}.${ms}`;
};

function buildRoad(curve: THREE.CatmullRomCurve3, width: number, height = 0) {
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= SAMPLE_COUNT; i += 1) {
    const t = i / SAMPLE_COUNT;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const left = point.clone().addScaledVector(side, width / 2);
    const right = point.clone().addScaledVector(side, -width / 2);
    left.y += height;
    right.y += height;
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, t * 70, 1, t * 70);
    if (i < SAMPLE_COUNT) {
      const p = i * 2;
      indices.push(p, p + 2, p + 1, p + 2, p + 3, p + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function labelTexture(title: string, subtitle: string, accent = '#d8ff3e') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#07121f';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, 24, canvas.height);
  context.font = '900 italic 92px Arial';
  context.fillStyle = '#ffffff';
  context.fillText(title, 72, 118);
  context.font = '700 28px monospace';
  context.fillStyle = accent;
  context.fillText(subtitle, 76, 184);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createKart(color: number, isPlayer = false) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({ color: isPlayer ? 0x171c23 : color, roughness: 0.2, metalness: isPlayer ? 0.62 : 0.32, clearcoat: 0.9, clearcoatRoughness: 0.14 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x101720, roughness: 0.72, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: isPlayer ? 0xd7ad52 : 0xeaf3f8, emissive: isPlayer ? 0x3d2705 : 0x202020, metalness: 0.68, roughness: 0.22 });
  const glass = new THREE.MeshPhysicalMaterial({ color: isPlayer ? 0x3bdfff : 0x161f2b, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.92 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(isPlayer ? 2.72 : 2.35, isPlayer ? 0.48 : 0.55, isPlayer ? 4.15 : 3.7), paint);
  chassis.position.y = 0.65;
  chassis.castShadow = true;
  body.add(chassis);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(isPlayer ? 2.05 : 1.68, isPlayer ? 0.3 : 0.38, isPlayer ? 1.58 : 1.35), paint);
  nose.position.set(0, 0.9, 1.85);
  nose.rotation.x = -0.12;
  nose.castShadow = true;
  body.add(nose);

  const frontLip = new THREE.Mesh(new THREE.BoxGeometry(isPlayer ? 3.15 : 2.7, 0.18, 0.48), carbon);
  frontLip.position.set(0, 0.42, 2.18);
  body.add(frontLip);
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(isPlayer ? 1.55 : 1.25, 0.16, 0.08), accent);
  lightBar.position.set(0, 0.76, 2.44);
  body.add(lightBar);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.14, 0.84), carbon);
  seat.position.set(0, 1.2, -0.48);
  seat.rotation.x = -0.14;
  body.add(seat);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(isPlayer ? 0.6 : 0.52, 22, 16), new THREE.MeshStandardMaterial({ color: isPlayer ? 0xf4bf35 : color, roughness: 0.25, metalness: 0.2 }));
  helmet.position.set(0, 1.88, -0.08);
  helmet.castShadow = true;
  body.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.24, 0.12), glass);
  visor.position.set(0, 1.89, 0.38);
  body.add(visor);

  if (isPlayer) {
    const gold = accent;
    const sidePodGeometry = new THREE.BoxGeometry(0.5, 0.4, 2.65);
    [-1.23, 1.23].forEach((x, index) => {
      const sidePod = new THREE.Mesh(sidePodGeometry, paint);
      sidePod.position.set(x, 0.66, 0.05);
      sidePod.rotation.z = index ? -0.055 : 0.055;
      sidePod.castShadow = true;
      body.add(sidePod);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 2.25), gold);
      blade.position.set(x + (index ? -0.23 : 0.23), 0.7, 0.18);
      body.add(blade);
      const frontFin = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.11, 1.05), gold);
      frontFin.position.set(x, 0.49, 2.02);
      frontFin.rotation.y = index ? -0.2 : 0.2;
      body.add(frontFin);
    });
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.13, 3.72), gold);
    spine.position.set(0, 0.94, 0.15);
    body.add(spine);
    const cockpitRim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.1, 10, 28, Math.PI), gold);
    cockpitRim.position.set(0, 1.25, -0.33);
    cockpitRim.rotation.x = Math.PI / 2;
    body.add(cockpitRim);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), new THREE.MeshStandardMaterial({ color: 0xf6a52f, roughness: 0.62 }));
    torso.scale.set(0.88, 1, 0.72);
    torso.position.set(0, 1.36, -0.26);
    body.add(torso);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.44, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffd7aa, roughness: 0.78 }));
    face.scale.set(0.86, 0.75, 0.5);
    face.position.set(0, 1.87, 0.43);
    body.add(face);
    [-0.15, 0.15].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), carbon);
      eye.position.set(x, 1.94, 0.77);
      body.add(eye);
    });
    const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 9, 24), carbon);
    steeringWheel.position.set(0, 1.32, 0.56);
    steeringWheel.rotation.x = -0.25;
    body.add(steeringWheel);
    [-0.34, 0.34].forEach((x) => {
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 7), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
      glove.position.set(x, 1.34, 0.56);
      body.add(glove);
    });
  }

  const spoilerBar = new THREE.Mesh(new THREE.BoxGeometry(isPlayer ? 3.05 : 2.5, isPlayer ? 0.2 : 0.16, isPlayer ? 0.68 : 0.52), isPlayer ? accent : paint);
  spoilerBar.position.set(0, 1.12, -1.96);
  body.add(spoilerBar);
  [-0.85, 0.85].forEach((x) => {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.16), carbon);
    support.position.set(x, 0.86, -1.8);
    body.add(support);
  });

  const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.46, 18);
  const wheels = new THREE.Group();
  wheels.name = 'wheels';
  [[-1.2, 0.48, 1.18], [1.2, 0.48, 1.18], [-1.2, 0.48, -1.3], [1.2, 0.48, -1.3]].forEach(([x, y, z], index) => {
    const pivot = new THREE.Group();
    pivot.name = index < 2 ? 'front-wheel' : 'rear-wheel';
    pivot.position.set(x, y, z);
    const tire = new THREE.Mesh(wheelGeometry, carbon);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    pivot.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.48, 12), accent);
    rim.rotation.z = Math.PI / 2;
    pivot.add(rim);
    wheels.add(pivot);
  });
  body.add(wheels);

  [-0.7, 0.7].forEach((x) => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 1.6, 10),
      new THREE.MeshBasicMaterial({ color: 0x65e7ff, transparent: true, opacity: 0 }),
    );
    flame.name = 'boost-flame';
    flame.position.set(x, 0.6, -2.45);
    flame.rotation.x = -Math.PI / 2;
    body.add(flame);
  });

  root.scale.setScalar(isPlayer ? 1 : 0.94);
  return root;
}

function addWorld(scene: THREE.Scene, curve: THREE.CatmullRomCurve3, samples: THREE.Vector3[], tangents: THREE.Vector3[], sides: THREE.Vector3[]) {
  const ground = new THREE.Mesh(new THREE.CircleGeometry(310, 96), new THREE.MeshStandardMaterial({ color: 0x315b3e, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  ground.receiveShadow = true;
  scene.add(ground);

  const shoulder = new THREE.Mesh(buildRoad(curve, 27, -0.14), new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.82 }));
  shoulder.receiveShadow = true;
  scene.add(shoulder);
  scene.add(new THREE.Mesh(buildRoad(curve, 24.5, -0.08), new THREE.MeshStandardMaterial({ color: 0xe64950, roughness: 0.7 })));
  const road = new THREE.Mesh(buildRoad(curve, ROAD_HALF * 2, 0), new THREE.MeshStandardMaterial({ color: 0x242d37, roughness: 0.76, metalness: 0.08 }));
  road.receiveShadow = true;
  scene.add(road);

  for (let i = 0; i < SAMPLE_COUNT; i += 14) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 4.2), new THREE.MeshBasicMaterial({ color: 0xdde9ee }));
    marker.position.copy(samples[i]);
    marker.position.y += 0.1;
    marker.rotation.y = Math.atan2(tangents[i].x, tangents[i].z);
    scene.add(marker);
  }

  for (let i = 0; i < SAMPLE_COUNT; i += 9) {
    [-1, 1].forEach((direction) => {
      const barrier = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.75, 0.42),
        new THREE.MeshStandardMaterial({ color: (Math.floor(i / 9) + (direction > 0 ? 1 : 0)) % 2 ? 0xffffff : 0xe94a52, roughness: 0.6 }),
      );
      barrier.position.copy(samples[i]).addScaledVector(sides[i], direction * 12.15);
      barrier.position.y += 0.38;
      barrier.rotation.y = Math.atan2(tangents[i].x, tangents[i].z);
      barrier.castShadow = true;
      scene.add(barrier);
    });
  }

  const start = samples[0];
  const startYaw = Math.atan2(tangents[0].x, tangents[0].z);
  const arch = new THREE.Group();
  const archMaterial = new THREE.MeshStandardMaterial({ color: 0x08121e, roughness: 0.3, metalness: 0.7 });
  [-12.4, 12.4].forEach((x) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.25, 8.4, 1.25), archMaterial);
    post.position.set(x, 4, 0);
    post.castShadow = true;
    arch.add(post);
  });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(26, 3.1, 0.9), new THREE.MeshStandardMaterial({ map: labelTexture('TURBO RUSH', 'SPEED MODE  ·  START / FINISH'), emissive: 0x101a05 }));
  banner.position.set(0, 7.15, 0);
  arch.add(banner);
  for (let x = -10; x <= 10; x += 2) {
    const tile = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 2.6), new THREE.MeshBasicMaterial({ color: (x / 2) % 2 ? 0x101820 : 0xffffff }));
    tile.position.set(x, 0.13, 0);
    arch.add(tile);
  }
  arch.position.copy(start);
  arch.rotation.y = startYaw;
  scene.add(arch);

  [0.19, 0.44, 0.69, 0.87].forEach((progress, index) => {
    const i = Math.floor(progress * SAMPLE_COUNT);
    const sign = index % 2 ? -1 : 1;
    const signGroup = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 2.5),
      new THREE.MeshStandardMaterial({ map: labelTexture(index % 2 ? 'DRIFT ZONE' : 'FULL BOOST', index % 2 ? 'HOLD THE LINE' : 'NO LIMITS', index % 2 ? '#5ce8ff' : '#d8ff3e'), side: THREE.DoubleSide }),
    );
    board.position.y = 3.2;
    signGroup.add(board);
    signGroup.position.copy(samples[i]).addScaledVector(sides[i], sign * 17);
    signGroup.rotation.y = Math.atan2(tangents[i].x, tangents[i].z) + (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
    scene.add(signGroup);
  });

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x553921, roughness: 1 });
  const leafMaterials = [0x1b643d, 0x287c49, 0x3c9154].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  for (let i = 0; i < 150; i += 1) {
    const angle = (i * 2.399) % (Math.PI * 2);
    const radius = 158 + (i % 11) * 8.5;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.56, 3.4, 7), trunkMaterial);
    tree.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.8 + (i % 3) * 0.28, 5.4, 8), leafMaterials[i % 3]);
    leaves.position.y = 3.4;
    tree.add(leaves);
    tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    tree.scale.setScalar(0.8 + (i % 6) * 0.1);
    scene.add(tree);
  }

  for (let i = 0; i < 22; i += 1) {
    const angle = (i / 22) * Math.PI * 2;
    const radius = 225 + (i % 5) * 13;
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(23 + (i % 4) * 7, 48 + (i % 5) * 10, 7),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x38546a : 0x2e4658, roughness: 1 }),
    );
    mountain.position.set(Math.cos(angle) * radius, 17, Math.sin(angle) * radius);
    mountain.rotation.y = angle * 1.7;
    scene.add(mountain);
  }
}

export default function SpeedRushGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const phaseRef = useRef<Phase>('menu');
  const restartRef = useRef<() => void>(() => undefined);
  const useNitroRef = useRef<() => void>(() => undefined);
  const [phase, setPhase] = useState<Phase>('menu');
  const [countdown, setCountdown] = useState('3');
  const [bestTime, setBestTime] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({ speed: 0, gear: 1, lap: 1, position: 8, gauge: 0, tanks: 0, time: 0, technique: '', combo: 0, drifting: false, boost: false, wrongWay: false });

  const setKey = useCallback((key: string, active: boolean) => { keysRef.current[key] = active; }, []);
  const startRace = useCallback(() => restartRef.current(), []);

  useEffect(() => {
    const saved = window.localStorage.getItem('turbo-rush-speed-best');
    if (!saved) return;
    const timer = window.setTimeout(() => setBestTime(formatTime(Number(saved))), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8bd8ef);
    scene.fog = new THREE.FogExp2(0x9ed9e9, 0.0027);
    const camera = new THREE.PerspectiveCamera(61, 1, 0.1, 850);
    scene.add(new THREE.HemisphereLight(0xe0f8ff, 0x355f3c, 2.4));
    const sun = new THREE.DirectionalLight(0xffedc7, 3.6);
    sun.position.set(-100, 160, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -150;
    scene.add(sun);

    const curve = new THREE.CatmullRomCurve3(TRACK_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'catmullrom', 0.34);
    const samples = Array.from({ length: SAMPLE_COUNT }, (_, index) => curve.getPointAt(index / SAMPLE_COUNT));
    const tangents = Array.from({ length: SAMPLE_COUNT }, (_, index) => curve.getTangentAt(index / SAMPLE_COUNT).normalize());
    const sides = tangents.map((tangent) => new THREE.Vector3(-tangent.z, 0, tangent.x).normalize());
    addWorld(scene, curve, samples, tangents, sides);

    const player = createKart(0x171c23, true);
    scene.add(player);
    const aiKarts: AiKart[] = [];
    for (let i = 1; i < 8; i += 1) {
      const mesh = createKart(COLORS[i]);
      scene.add(mesh);
      aiKarts.push({ mesh, progress: -i * 0.0065, speed: 0, cruise: 47 + (i % 4) * 1.8 + Math.random() * 2, lane: (i % 2 ? -1 : 1) * (1.7 + (i % 3) * 1.3), laneTarget: 0, laneTimer: Math.random() * 2 });
    }

    const smokeGeometry = new THREE.SphereGeometry(0.22, 7, 5);
    const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0xd7e4e8, transparent: true, opacity: 0.45, depthWrite: false });
    const sparkGeometry = new THREE.OctahedronGeometry(0.12, 0);
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xd8ff3e });
    const particles: Particle[] = [];
    const skidMarks: THREE.Mesh[] = [];

    const position = samples[0].clone();
    const velocity = new THREE.Vector3();
    let yaw = Math.atan2(tangents[0].x, tangents[0].z);
    let trackIndex = 0;
    let previousTrackIndex = 0;
    let completedLaps = 0;
    let raceStart = 0;
    let finalTime = 0;
    let countdownStart = 0;
    let gauge = 0;
    let tanks = 0;
    let boostUntil = 0;
    let startBoostQueued = false;
    let drifting = false;
    let driftDirection = 0;
    let driftStarted = 0;
    let driftCharge = 0;
    let lastDriftEnd = -9999;
    let lastDriftDirection = 0;
    let driftCombo = 0;
    let technique = '';
    let techniqueUntil = 0;
    let previousDriftKey = false;
    let previousNitroKey = false;
    let lastHud = 0;
    let lastSkid = 0;
    let lastSmoke = 0;
    let cameraShake = 0;
    let wrongWay = false;
    let audio: AudioContext | null = null;
    let engineOscillator: OscillatorNode | null = null;
    let engineGain: GainNode | null = null;
    const clock = new THREE.Clock();
    let frame = 0;

    const setPhaseBoth = (next: Phase) => {
      phaseRef.current = next;
      setPhase(next);
    };

    const nearestTrack = (point: THREE.Vector3, around: number, radius = 80) => {
      let best = around;
      let bestDistance = Infinity;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const index = wrapIndex(around + offset);
        const dx = point.x - samples[index].x;
        const dz = point.z - samples[index].z;
        const distance = dx * dx + dz * dz;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      return best;
    };

    const placeAi = (racer: AiKart) => {
      const progress = wrap01(racer.progress);
      const point = curve.getPointAt(progress);
      const tangent = curve.getTangentAt(progress).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      racer.mesh.position.copy(point).addScaledVector(side, racer.lane);
      racer.mesh.position.y += 0.2;
      racer.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
      racer.mesh.traverse((child) => {
        if (child.name === 'wheels') child.rotation.x += racer.speed * 0.001;
      });
    };

    const addParticle = (kind: 'smoke' | 'spark', origin: THREE.Vector3, velocityVector: THREE.Vector3) => {
      if (particles.length > 100) return;
      const mesh = new THREE.Mesh(kind === 'smoke' ? smokeGeometry : sparkGeometry, kind === 'smoke' ? smokeMaterial.clone() : sparkMaterial);
      mesh.position.copy(origin);
      scene.add(mesh);
      particles.push({ mesh, velocity: velocityVector, life: kind === 'smoke' ? 0.72 : 0.34, maxLife: kind === 'smoke' ? 0.72 : 0.34 });
    };

    const showTechnique = (label: string, duration = 1100) => {
      technique = label;
      techniqueUntil = performance.now() + duration;
    };

    const cashGauge = () => {
      while (gauge >= 100 && tanks < 2) {
        gauge -= 100;
        tanks += 1;
        showTechnique('N₂O 완성', 850);
      }
      gauge = Math.min(gauge, tanks >= 2 ? 100 : 99.9);
    };

    const finishDrift = (now: number, cut = false) => {
      if (!drifting) return;
      drifting = false;
      const quality = clamp(driftCharge, 0, 52);
      gauge += quality * (cut ? 0.72 : 1);
      cashGauge();
      if (quality > 8) {
        const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        velocity.addScaledVector(forward, 3.5 + quality * 0.13);
        boostUntil = Math.max(boostUntil, now + 220 + quality * 11);
      }
      if (cut) showTechnique('커팅 드리프트');
      else if (now - driftStarted > 760) showTechnique(`끌기 ${Math.round(quality)}%`);
      lastDriftEnd = now;
      lastDriftDirection = driftDirection;
      driftCharge = 0;
    };

    const triggerNitro = () => {
      if (phaseRef.current !== 'racing' || tanks <= 0) return;
      tanks -= 1;
      boostUntil = performance.now() + 2450;
      showTechnique('N₂O BOOST', 900);
    };
    useNitroRef.current = triggerNitro;

    const reset = () => {
      position.copy(samples[0]);
      position.y += 0.2;
      velocity.set(0, 0, 0);
      yaw = Math.atan2(tangents[0].x, tangents[0].z);
      trackIndex = 0;
      previousTrackIndex = 0;
      completedLaps = 0;
      finalTime = 0;
      gauge = 0;
      tanks = 0;
      boostUntil = 0;
      startBoostQueued = false;
      drifting = false;
      driftCharge = 0;
      driftCombo = 0;
      technique = '';
      aiKarts.forEach((racer, index) => { racer.progress = -(index + 1) * 0.0065; racer.speed = 0; });
      skidMarks.forEach((mark) => scene.remove(mark));
      skidMarks.length = 0;
      countdownStart = performance.now();
      setCountdown('3');
      setPhaseBoth('countdown');
      if (!audio) {
        audio = new AudioContext();
        engineOscillator = audio.createOscillator();
        engineGain = audio.createGain();
        engineOscillator.type = 'sawtooth';
        engineOscillator.frequency.value = 65;
        engineGain.gain.value = 0.012;
        engineOscillator.connect(engineGain).connect(audio.destination);
        engineOscillator.start();
      } else if (audio.state === 'suspended') void audio.resume();
    };
    restartRef.current = reset;

    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      keysRef.current[event.code] = true;
      if (event.code === 'Enter' && (phaseRef.current === 'menu' || phaseRef.current === 'finished')) reset();
    };
    const onKeyUp = (event: KeyboardEvent) => { keysRef.current[event.code] = false; };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = renderer.getPixelRatio();
      if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(1, height);
        camera.updateProjectionMatrix();
      }
    };

    const drawMinimap = () => {
      const map = minimapRef.current;
      if (!map) return;
      const context = map.getContext('2d');
      if (!context) return;
      const size = 170;
      const scale = 0.54;
      context.clearRect(0, 0, size, size);
      context.save();
      context.translate(size / 2, size / 2);
      context.scale(scale, scale);
      context.strokeStyle = 'rgba(236,246,251,.38)';
      context.lineWidth = 12;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      samples.forEach((point, index) => {
        const x = point.x * 0.53;
        const y = point.z * 0.53;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.stroke();
      aiKarts.forEach((racer) => {
        const point = curve.getPointAt(wrap01(racer.progress));
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(point.x * 0.53, point.z * 0.53, 3.2, 0, Math.PI * 2);
        context.fill();
      });
      context.fillStyle = '#d8ff3e';
      context.beginPath();
      context.arc(position.x * 0.53, position.z * 0.53, 5.3, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.033);
      const now = performance.now();
      resize();

      const throttle = !!(keysRef.current.ArrowUp || keysRef.current.KeyW);
      const brake = !!(keysRef.current.ArrowDown || keysRef.current.KeyS);
      const steer = (keysRef.current.ArrowRight || keysRef.current.KeyD ? 1 : 0) - (keysRef.current.ArrowLeft || keysRef.current.KeyA ? 1 : 0);
      const driftKey = !!(keysRef.current.Space || keysRef.current.ShiftLeft || keysRef.current.ShiftRight);
      const nitroKey = !!(keysRef.current.ControlLeft || keysRef.current.ControlRight || keysRef.current.KeyX);

      if (phaseRef.current === 'countdown') {
        const elapsed = (now - countdownStart) / 1000;
        if (elapsed < 1) setCountdown('3');
        else if (elapsed < 2) setCountdown('2');
        else if (elapsed < 3) {
          setCountdown('1');
          if (elapsed > 2.62 && throttle) startBoostQueued = true;
        } else if (elapsed < 3.62) setCountdown('GO!');
        else {
          raceStart = now;
          if (startBoostQueued) {
            boostUntil = now + 1350;
            velocity.addScaledVector(tangents[0], 14);
            showTechnique('퍼펙트 스타트', 1300);
          }
          setPhaseBoth('racing');
        }
      }

      const racing = phaseRef.current === 'racing';
      const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      // In this world the camera follows from behind +Z, so the driver's
      // right-hand side is -X when yaw is zero.
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const forwardSpeed = velocity.dot(forward);
      const lateralSpeed = velocity.dot(right);
      const speedKmh = Math.max(0, forwardSpeed * 3.6);
      const speedRatio = clamp(speedKmh / 220, 0, 1);
      const boosting = now < boostUntil;

      if (racing) {
        if (driftKey && !previousDriftKey && !drifting && steer !== 0 && speedKmh > 48) {
          drifting = true;
          driftDirection = Math.sign(steer);
          driftStarted = now;
          driftCharge = 0;
          if (now - lastDriftEnd < 520 && lastDriftDirection === driftDirection) {
            driftCombo = Math.min(9, driftCombo + 1);
            velocity.addScaledVector(forward, 3.2 + driftCombo * 0.35);
            showTechnique(`톡톡이 ×${driftCombo + 1}`, 850);
          } else {
            driftCombo = 0;
          }
        }

        if (drifting) {
          const counterSteer = steer !== 0 && Math.sign(steer) !== driftDirection;
          if ((!driftKey && now - driftStarted > 130) || counterSteer) finishDrift(now, counterSteer);
        }

        if (nitroKey && !previousNitroKey) triggerNitro();
        const topSpeed = boosting ? 75 : drifting ? 63 : 66;
        if (throttle) {
          const acceleration = (boosting ? 39 : 31) * clamp(1 - Math.max(0, forwardSpeed) / (topSpeed * 1.12), 0.15, 1);
          velocity.addScaledVector(forward, acceleration * dt);
        }
        if (brake) velocity.addScaledVector(forward, -42 * dt);
        if (!throttle && forwardSpeed > 0) velocity.addScaledVector(forward, -7 * dt);

        if (drifting) {
          yaw -= driftDirection * (1.18 + speedRatio * 0.82) * dt + steer * 0.38 * dt;
          velocity.addScaledVector(right, -lateralSpeed * 2.15 * dt);
          const chargeRate = 12 + Math.abs(lateralSpeed) * 1.45 + speedRatio * 13;
          driftCharge += chargeRate * dt;
          gauge += chargeRate * dt * 0.54;
          cashGauge();
        } else {
          const steeringRate = THREE.MathUtils.lerp(1.58, 0.92, speedRatio);
          const rollingGrip = clamp(Math.abs(forwardSpeed) / 2.2, 0, 1);
          yaw -= steer * steeringRate * rollingGrip * dt * (forwardSpeed >= -1 ? 1 : -1);
          velocity.addScaledVector(right, -lateralSpeed * 13.5 * dt);
        }

        velocity.multiplyScalar(Math.exp(-(boosting ? 0.055 : drifting ? 0.12 : 0.17) * dt));
        const maxMagnitude = boosting ? 78 : 69;
        if (velocity.length() > maxMagnitude) velocity.setLength(maxMagnitude);
        position.addScaledVector(velocity, dt);

        const newTrackIndex = nearestTrack(position, trackIndex);
        previousTrackIndex = trackIndex;
        trackIndex = newTrackIndex;
        const center = samples[trackIndex];
        const trackSide = sides[trackIndex];
        const trackForward = tangents[trackIndex];
        const lateralOffset = position.clone().sub(center).dot(trackSide);
        const directionDot = forward.dot(trackForward);
        wrongWay = directionDot < -0.35 && speedKmh > 25;

        if (Math.abs(lateralOffset) > ROAD_HALF) {
          velocity.multiplyScalar(Math.exp(-2.6 * dt));
          if (Math.abs(lateralOffset) > WALL_LIMIT) {
            const sign = Math.sign(lateralOffset);
            position.copy(center).addScaledVector(trackSide, sign * WALL_LIMIT);
            position.y = center.y + 0.2;
            const along = velocity.dot(trackForward);
            velocity.copy(trackForward).multiplyScalar(Math.max(8, along * 0.42));
            velocity.addScaledVector(trackSide, -sign * 4.5);
            gauge = Math.max(0, gauge - 18);
            drifting = false;
            driftCombo = 0;
            cameraShake = 0.42;
            showTechnique('벽 충돌 · 게이지 손실', 1050);
            for (let i = 0; i < 8; i += 1) addParticle('spark', position.clone().add(new THREE.Vector3(0, .7, 0)), new THREE.Vector3((Math.random() - .5) * 8, Math.random() * 5, (Math.random() - .5) * 8));
          }
        }

        position.y = THREE.MathUtils.damp(position.y, samples[trackIndex].y + 0.2, 12, dt);
        if (previousTrackIndex > SAMPLE_COUNT * 0.82 && trackIndex < SAMPLE_COUNT * 0.16 && directionDot > 0.2) {
          completedLaps += 1;
          showTechnique(completedLaps < 3 ? `LAP ${completedLaps + 1} · KEEP PUSHING` : 'FINISH!', 1600);
          if (completedLaps >= 3) {
            finalTime = (now - raceStart) / 1000;
            const saved = Number(window.localStorage.getItem('turbo-rush-speed-best') || Infinity);
            if (finalTime < saved) window.localStorage.setItem('turbo-rush-speed-best', String(finalTime));
            setBestTime(formatTime(Math.min(saved, finalTime)));
            setPhaseBoth('finished');
            drifting = false;
          }
        }
      } else if (phaseRef.current === 'menu' || phaseRef.current === 'finished') {
        velocity.multiplyScalar(Math.exp(-2.5 * dt));
      }

      previousDriftKey = driftKey;
      previousNitroKey = nitroKey;
      if (now > techniqueUntil) technique = '';

      player.position.copy(position);
      player.rotation.y = yaw;
      const body = player.getObjectByName('body');
      if (body) {
        body.rotation.z = THREE.MathUtils.damp(body.rotation.z, drifting ? -driftDirection * 0.09 : -steer * 0.035, 8, dt);
        body.rotation.x = THREE.MathUtils.damp(body.rotation.x, boosting ? -0.035 : brake ? 0.04 : 0, 8, dt);
      }
      player.traverse((child) => {
        if (child.name === 'front-wheel') child.rotation.y = -steer * 0.34;
        if (child.name === 'boost-flame') {
          const flame = child as THREE.Mesh;
          const material = flame.material as THREE.MeshBasicMaterial;
          material.opacity = boosting ? 0.94 : throttle && racing ? 0.22 : 0;
          flame.scale.y = boosting ? 1.5 + Math.random() * 0.7 : 0.55;
        }
      });

      if (drifting && now - lastSmoke > 45) {
        lastSmoke = now;
        [-1, 1].forEach((side) => {
          const origin = position.clone().addScaledVector(right, side * 1.1).addScaledVector(forward, -1.25);
          addParticle('smoke', origin, new THREE.Vector3((Math.random() - .5) * 1.5, 1.1, (Math.random() - .5) * 1.5));
        });
      }
      if (drifting && now - lastSkid > 90) {
        lastSkid = now;
        [-1, 1].forEach((side) => {
          const mark = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 1.4), new THREE.MeshBasicMaterial({ color: 0x121820, transparent: true, opacity: 0.72 }));
          mark.position.copy(position).addScaledVector(right, side * 1.08).addScaledVector(forward, -1.1);
          mark.position.y = samples[trackIndex].y + 0.1;
          mark.rotation.y = yaw;
          scene.add(mark);
          skidMarks.push(mark);
        });
        while (skidMarks.length > 340) {
          const old = skidMarks.shift();
          if (old) scene.remove(old);
        }
      }

      if (racing) {
        aiKarts.forEach((racer, index) => {
          racer.speed = THREE.MathUtils.damp(racer.speed, racer.cruise + Math.sin(now * 0.0004 + index) * 2.5, 1.25, dt);
          racer.progress += racer.speed / curve.getLength() * dt;
          racer.laneTimer -= dt;
          if (racer.laneTimer <= 0) {
            racer.laneTimer = 1.5 + Math.random() * 2.5;
            racer.laneTarget = (Math.random() - 0.5) * 13;
          }
          racer.lane = THREE.MathUtils.damp(racer.lane, racer.laneTarget, 0.6, dt);
          placeAi(racer);
        });
      } else aiKarts.forEach(placeAi);

      particles.forEach((particle, index) => {
        particle.life -= dt;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        particle.velocity.y += (particle.maxLife > 0.5 ? 0.6 : -9) * dt;
        const ratio = Math.max(0, particle.life / particle.maxLife);
        particle.mesh.scale.setScalar(particle.maxLife > 0.5 ? 1 + (1 - ratio) * 2.2 : ratio * 1.8);
        const material = particle.mesh.material as THREE.MeshBasicMaterial;
        if (material.transparent) material.opacity = ratio * 0.45;
        if (particle.life <= 0) {
          scene.remove(particle.mesh);
          particles.splice(index, 1);
        }
      });

      const cameraForward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const cameraRight = new THREE.Vector3(-cameraForward.z, 0, cameraForward.x);
      const desiredCamera = position.clone().addScaledVector(cameraForward, -9.2).addScaledVector(cameraRight, drifting ? driftDirection * 1.2 : 0);
      desiredCamera.y += 4.6 + clamp(velocity.length() / 70, 0, 1) * 1.4;
      if (cameraShake > 0) {
        desiredCamera.x += (Math.random() - 0.5) * cameraShake;
        desiredCamera.y += (Math.random() - 0.5) * cameraShake;
        cameraShake = Math.max(0, cameraShake - dt * 1.8);
      }
      camera.position.lerp(desiredCamera, 1 - Math.pow(0.0008, dt));
      const look = position.clone().addScaledVector(cameraForward, 12.5);
      look.y += 1.25;
      camera.lookAt(look);
      camera.fov = THREE.MathUtils.damp(camera.fov, boosting ? 74 : 61, 4.5, dt);
      camera.updateProjectionMatrix();

      if (engineGain && engineOscillator && audio) {
        const liveSpeed = velocity.length() * 3.6;
        engineGain.gain.setTargetAtTime(phaseRef.current === 'racing' ? 0.013 + liveSpeed / 23000 : 0.006, audio.currentTime, 0.04);
        engineOscillator.frequency.setTargetAtTime(58 + liveSpeed * 0.82, audio.currentTime, 0.035);
      }

      if (now - lastHud > 70) {
        lastHud = now;
        const totalProgress = completedLaps + trackIndex / SAMPLE_COUNT;
        const positionRank = 1 + aiKarts.filter((racer) => racer.progress > totalProgress).length;
        const liveSpeed = Math.max(0, velocity.dot(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))) * 3.6);
        setHud({
          speed: Math.round(liveSpeed),
          gear: clamp(Math.floor(liveSpeed / 42) + 1, 1, 6),
          lap: Math.min(3, completedLaps + 1),
          position: positionRank,
          gauge: Math.round(gauge),
          tanks,
          time: phaseRef.current === 'racing' ? (now - raceStart) / 1000 : finalTime,
          technique,
          combo: driftCombo,
          drifting,
          boost: boosting,
          wrongWay,
        });
        drawMinimap();
      }

      renderer.render(scene, camera);
    };

    player.position.copy(position);
    player.rotation.y = yaw;
    aiKarts.forEach(placeAi);
    camera.position.copy(position).add(new THREE.Vector3(-6, 6, 13));
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material?.dispose();
      });
      engineOscillator?.stop();
      void audio?.close();
    };
  }, []);

  return (
    <main className="race-app speed-mode">
      <canvas ref={canvasRef} className="race-canvas" aria-label="Turbo Rush 스피드전 3D 레이싱 게임" />
      <div className="vignette" />
      <div className={`speed-lines ${hud.boost ? 'active' : ''}`} />

      <header className="race-topbar">
        <div className="wordmark"><span>TURBO</span> RUSH</div>
        {phase !== 'menu' && <div className="track-name">SKYLINE GP <b>SPEED MODE</b></div>}
      </header>

      {(phase === 'racing' || phase === 'countdown') && (
        <section className="race-hud" aria-live="polite">
          <div className="position-card"><strong>{hud.position}</strong><span>/ 8</span><small>POSITION</small></div>
          <div className="lap-card"><span>LAP</span><strong>{hud.lap}<i>/3</i></strong></div>
          <div className="timer-card"><span>TIME</span><strong>{formatTime(hud.time)}</strong></div>
          <canvas ref={minimapRef} className="minimap" width="170" height="170" aria-label="미니맵" />
          <div className="speed-card"><i>GEAR {hud.gear}</i><strong>{hud.speed}</strong><span>km/h</span></div>
          <div className="nitro-panel">
            <div className="nitro-tanks" aria-label={`N2O ${hud.tanks}개`}>
              {[0, 1].map((index) => <span key={index} className={index < hud.tanks ? 'filled' : ''}>N₂O</span>)}
            </div>
            <div className="boost-label"><span>{hud.drifting ? 'DRIFT CHARGE' : 'BOOST GAUGE'}</span><b>{hud.gauge}%</b></div>
            <div className="boost-track"><span style={{ width: `${hud.gauge}%` }} /></div>
            <small><kbd>CTRL</kbd> 또는 <kbd>X</kbd> 부스터</small>
          </div>
          {hud.technique && <div className="drift-tech"><strong>{hud.technique}</strong>{hud.combo > 0 && <span>DRIFT CHAIN</span>}</div>}
          {hud.wrongWay && <div className="wrong-way">↶ 역주행</div>}
        </section>
      )}

      {phase === 'menu' && (
        <section className="menu-panel speed-menu">
          <p className="eyebrow">SPEED MODE · PHYSICS REBUILT</p>
          <h1>밀어 넣고,<br />끝까지 끌어라.</h1>
          <p className="menu-copy">자유 조향과 실제 횡미끄러짐을 적용한 스피드전입니다. 짧게 재입력하면 톡톡이, 길게 유지하면 끌기가 발동합니다.</p>
          <button className="start-button" onClick={startRace}><span>스피드전 시작</span><kbd>ENTER</kbd></button>
          <div className="speed-guide">
            <div><kbd>↑</kbd><strong>가속</strong><span>1 카운트 끝에 누르면 출발 부스터</span></div>
            <div><kbd>SHIFT / SPACE + ←→</kbd><strong>드리프트</strong><span>짧게 반복: 톡톡이 · 길게 유지: 끌기</span></div>
            <div><kbd>반대 방향</kbd><strong>커팅</strong><span>드리프트를 빠르게 정리하고 탈출</span></div>
            <div><kbd>CTRL / X</kbd><strong>N₂O</strong><span>게이지 100%마다 부스터 1개</span></div>
          </div>
          {bestTime && <p className="best-time">PERSONAL BEST <strong>{bestTime}</strong></p>}
        </section>
      )}

      {phase === 'countdown' && <div className={`countdown count-${countdown.replace('!', '')}`}><strong>{countdown}</strong><small>{countdown === '1' ? '지금 가속하면 출발 부스터' : 'READY'}</small></div>}

      {phase === 'finished' && (
        <section className="finish-panel">
          <p className="eyebrow">SPEED MODE COMPLETE</p>
          <h2>{hud.position === 1 ? '퍼펙트 레이스!' : '기록을 경신하세요.'}</h2>
          <div className="finish-stats"><div><span>순위</span><strong>{hud.position}<small> / 8</small></strong></div><div><span>기록</span><strong>{formatTime(hud.time)}</strong></div><div><span>최고 기록</span><strong>{bestTime || formatTime(hud.time)}</strong></div></div>
          <button className="start-button" onClick={startRace}><span>다시 도전</span><kbd>ENTER</kbd></button>
        </section>
      )}

      <div className="touch-controls speed-touch" aria-label="터치 조작">
        <div className="touch-steer"><button onPointerDown={() => setKey('ArrowLeft', true)} onPointerUp={() => setKey('ArrowLeft', false)} onPointerCancel={() => setKey('ArrowLeft', false)}>←</button><button onPointerDown={() => setKey('ArrowRight', true)} onPointerUp={() => setKey('ArrowRight', false)} onPointerCancel={() => setKey('ArrowRight', false)}>→</button></div>
        <div className="touch-action"><button onPointerDown={() => setKey('Space', true)} onPointerUp={() => setKey('Space', false)} onPointerCancel={() => setKey('Space', false)}>DRIFT</button><button className="gas" onPointerDown={() => setKey('ArrowUp', true)} onPointerUp={() => setKey('ArrowUp', false)} onPointerCancel={() => setKey('ArrowUp', false)}>GAS</button><button onPointerDown={() => useNitroRef.current()}>N₂O</button></div>
      </div>

      <footer className="race-footer">ORIGINAL SPEED RACING · FREE STEERING PHYSICS · v2.0</footer>
    </main>
  );
}
