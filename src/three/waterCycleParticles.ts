import * as THREE from 'three';
import { WaterCycleStageId } from '../data/waterCycleData';
import { ProceduralTextureSet } from './proceduralTextures';
import {
  DIORAMA_HALF_Z,
  WATER_LEVEL,
  riverCenterZ,
  riverWaterSurfaceY,
  terrainHeightAt,
} from './terrainMath';

// Pre-allocated scratch helpers (Zero GC inside render loop)
const _dummy = new THREE.Object3D();
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

interface ParticleSeed {
  x: number;
  y: number;
  z: number;
  speed: number;
  phase: number;
  radius: number;
  scale: number;
  groundY: number;
}

interface TouchRipple {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  active: boolean;
}

export interface FlowRibbon {
  stageId: WaterCycleStageId;
  curve: THREE.CatmullRomCurve3;
  tubeMesh: THREE.Mesh;
  tubeMat: THREE.MeshBasicMaterial;
  beads: THREE.Mesh[];
  beadMat: THREE.MeshBasicMaterial;
}

/**
 * Multi-layered luxury 3D particle system with stage-dynamic volumetric mist wisps,
 * golden evaporation steam, forest transpiration dew, condensation atmospheric fog veils,
 * animated crystal raindrops with impact splash ripples, waterfall spray, and glowing
 * subsurface infiltration droplets. 100% Zero-GC in the render loop.
 */
export class WaterCycleParticleSystem {
  public readonly group = new THREE.Group();
  public readonly flowGroup = new THREE.Group();

  private readonly disposables: Array<{ dispose: () => void }> = [];

  // 1. EVAPORASI: Golden vapor orbs + soft rising warm steam wisps
  private evapMesh: THREE.InstancedMesh;
  private evapMat: THREE.MeshBasicMaterial;
  private evapSeeds: ParticleSeed[] = [];
  private evapMistPoints: THREE.Points;
  private evapMistGeo: THREE.BufferGeometry;
  private evapMistMat: THREE.PointsMaterial;
  private evapMistPos: Float32Array;
  private evapMistSeeds: ParticleSeed[] = [];

  // 2. TRANSPIRASI: Emerald dew droplets + botanical canopy mist plumes
  private transpMesh: THREE.InstancedMesh;
  private transpMat: THREE.MeshBasicMaterial;
  private transpSeeds: ParticleSeed[] = [];
  private transpMistPoints: THREE.Points;
  private transpMistGeo: THREE.BufferGeometry;
  private transpMistMat: THREE.PointsMaterial;
  private transpMistPos: Float32Array;
  private transpMistSeeds: ParticleSeed[] = [];

  // 3. KONDENSASI: Thin swirling atmospheric mist veils + coalescing silver droplets
  private condMesh: THREE.InstancedMesh;
  private condMat: THREE.MeshBasicMaterial;
  private condSeeds: ParticleSeed[] = [];
  private condMistPoints: THREE.Points;
  private condMistGeo: THREE.BufferGeometry;
  private condMistMat: THREE.PointsMaterial;
  private condMistPos: Float32Array;
  private condMistSeeds: ParticleSeed[] = [];

  // 4. PRESIPITASI: Animated crystal raindrops + impact splash ripples + alpine rain mist
  private rainMesh: THREE.InstancedMesh;
  private rainMat: THREE.MeshBasicMaterial;
  private rainSeeds: ParticleSeed[] = [];
  private splashMesh: THREE.InstancedMesh;
  private splashMat: THREE.MeshBasicMaterial;
  private splashSeeds: ParticleSeed[] = [];
  private rainMistPoints: THREE.Points;
  private rainMistGeo: THREE.BufferGeometry;
  private rainMistMat: THREE.PointsMaterial;
  private rainMistPos: Float32Array;
  private rainMistSeeds: ParticleSeed[] = [];

  // 5. INFILTRASI & LIMPASAN: River runoff + waterfall spray mist + glowing aquifer percolation
  private runoffMesh: THREE.InstancedMesh;
  private runoffMat: THREE.MeshBasicMaterial;
  private runoffSeeds: ParticleSeed[] = [];
  private infilMesh: THREE.InstancedMesh;
  private infilMat: THREE.MeshBasicMaterial;
  private infilSeeds: ParticleSeed[] = [];
  private infilCurves: THREE.CatmullRomCurve3[] = [];
  private infilGlowPoints: THREE.Points;
  private infilGlowGeo: THREE.BufferGeometry;
  private infilGlowMat: THREE.PointsMaterial;
  private infilGlowPos: Float32Array;

  private waterfallMistPoints: THREE.Points;
  private waterfallMistGeo: THREE.BufferGeometry;
  private waterfallMistMat: THREE.PointsMaterial;
  private waterfallMistPos: Float32Array;
  private waterfallMistSeeds: ParticleSeed[] = [];

  // 6. Luminous 3D cycle ribbons & touch shockwave ripples
  private flowRibbons: FlowRibbon[] = [];
  private touchRipples: TouchRipple[] = [];

  // Quality scaling factor (ringan vs tinggi)
  private densityScale = 1.0;

  // Smooth stage emphasis weights (0..1)
  private weights: Record<Exclude<WaterCycleStageId, 'overview'>, number> = {
    evaporasi: 0.72,
    transpirasi: 0.72,
    kondensasi: 0.72,
    presipitasi: 0.65,
    infiltrasi: 0.75,
  };

  constructor(textures: ProceduralTextureSet) {
    this.group.add(this.flowGroup);

    const orbGeo = new THREE.IcosahedronGeometry(0.068, 0);
    this.disposables.push(orbGeo);

    // --- 1. EVAPORASI: Golden Vapor Orbs + Soft Sunlit Steam Wisps ---
    const evapCount = 72;
    this.evapMat = new THREE.MeshBasicMaterial({
      color: 0xf5a623,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    this.disposables.push(this.evapMat);
    this.evapMesh = new THREE.InstancedMesh(orbGeo, this.evapMat, evapCount);
    this.evapMesh.frustumCulled = false;
    for (let i = 0; i < evapCount; i++) {
      this.evapSeeds.push({
        x: 2.0 + Math.random() * 3.1,
        y: Math.random(),
        z: (Math.random() - 0.5) * 6.4,
        speed: 0.14 + Math.random() * 0.14,
        phase: Math.random() * Math.PI * 2,
        radius: 0.12 + Math.random() * 0.24,
        scale: 0.65 + Math.random() * 0.7,
        groundY: WATER_LEVEL,
      });
    }
    this.group.add(this.evapMesh);

    const evapMistCount = 42;
    this.evapMistPos = new Float32Array(evapMistCount * 3);
    this.evapMistGeo = new THREE.BufferGeometry();
    this.evapMistGeo.setAttribute('position', new THREE.BufferAttribute(this.evapMistPos, 3));
    this.evapMistMat = new THREE.PointsMaterial({
      map: textures.mistSprite,
      color: 0xfff2cc,
      size: 1.55,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.disposables.push(this.evapMistGeo, this.evapMistMat);
    this.evapMistPoints = new THREE.Points(this.evapMistGeo, this.evapMistMat);
    this.evapMistPoints.frustumCulled = false;
    this.evapMistPoints.renderOrder = 8;
    for (let i = 0; i < evapMistCount; i++) {
      this.evapMistSeeds.push({
        x: 2.1 + Math.random() * 2.9,
        y: Math.random(),
        z: (Math.random() - 0.5) * 6.0,
        speed: 0.09 + Math.random() * 0.08,
        phase: Math.random() * Math.PI * 2,
        radius: 0.18 + Math.random() * 0.26,
        scale: 1,
        groundY: WATER_LEVEL + 0.15,
      });
    }
    this.group.add(this.evapMistPoints);

    // --- 2. TRANSPIRASI: Emerald Dew Drops + Soft Canopy Mist Plumes ---
    const transpCount = 52;
    this.transpMat = new THREE.MeshBasicMaterial({
      color: 0x16b87f,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.disposables.push(this.transpMat);
    this.transpMesh = new THREE.InstancedMesh(orbGeo, this.transpMat, transpCount);
    this.transpMesh.frustumCulled = false;
    for (let i = 0; i < transpCount; i++) {
      const tx = -2.8 + Math.random() * 3.8;
      const tz = -1.6 + Math.random() * 4.8;
      this.transpSeeds.push({
        x: tx,
        y: Math.random(),
        z: tz,
        speed: 0.13 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        radius: 0.1 + Math.random() * 0.16,
        scale: 0.58 + Math.random() * 0.65,
        groundY: Math.max(terrainHeightAt(tx, tz) + 0.55, 0.7),
      });
    }
    this.group.add(this.transpMesh);

    const transpMistCount = 36;
    this.transpMistPos = new Float32Array(transpMistCount * 3);
    this.transpMistGeo = new THREE.BufferGeometry();
    this.transpMistGeo.setAttribute('position', new THREE.BufferAttribute(this.transpMistPos, 3));
    this.transpMistMat = new THREE.PointsMaterial({
      map: textures.mistSprite,
      color: 0xd9fff0,
      size: 1.45,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.disposables.push(this.transpMistGeo, this.transpMistMat);
    this.transpMistPoints = new THREE.Points(this.transpMistGeo, this.transpMistMat);
    this.transpMistPoints.frustumCulled = false;
    this.transpMistPoints.renderOrder = 8;
    for (let i = 0; i < transpMistCount; i++) {
      const tx = -2.7 + Math.random() * 3.7;
      const tz = -1.4 + Math.random() * 4.5;
      this.transpMistSeeds.push({
        x: tx,
        y: Math.random(),
        z: tz,
        speed: 0.08 + Math.random() * 0.08,
        phase: Math.random() * Math.PI * 2,
        radius: 0.16 + Math.random() * 0.22,
        scale: 1,
        groundY: Math.max(terrainHeightAt(tx, tz) + 0.45, 0.7),
      });
    }
    this.group.add(this.transpMistPoints);

    // --- 3. KONDENSASI: Thin Billowing Cloud Mist Veil + Swirling Silver Droplets ---
    const condCount = 60;
    this.condMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.disposables.push(this.condMat);
    this.condMesh = new THREE.InstancedMesh(orbGeo, this.condMat, condCount);
    this.condMesh.frustumCulled = false;
    for (let i = 0; i < condCount; i++) {
      this.condSeeds.push({
        x: (Math.random() - 0.5) * 4.4,
        y: Math.random(),
        z: -0.6 + (Math.random() - 0.5) * 1.9,
        speed: 0.45 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2,
        radius: 0.45 + Math.random() * 0.95,
        scale: 0.7 + Math.random() * 0.85,
        groundY: 6.95,
      });
    }
    this.group.add(this.condMesh);

    // Thin luxurious swirling atmospheric mist puffs surrounding the clouds during Kondensasi
    const condMistCount = 64;
    this.condMistPos = new Float32Array(condMistCount * 3);
    this.condMistGeo = new THREE.BufferGeometry();
    this.condMistGeo.setAttribute('position', new THREE.BufferAttribute(this.condMistPos, 3));
    this.condMistMat = new THREE.PointsMaterial({
      map: textures.mistSprite,
      color: 0xf7fcff,
      size: 2.35,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.disposables.push(this.condMistGeo, this.condMistMat);
    this.condMistPoints = new THREE.Points(this.condMistGeo, this.condMistMat);
    this.condMistPoints.frustumCulled = false;
    this.condMistPoints.renderOrder = 9;
    for (let i = 0; i < condMistCount; i++) {
      this.condMistSeeds.push({
        x: (Math.random() - 0.5) * 6.0,
        y: Math.random(),
        z: -0.65 + (Math.random() - 0.5) * 2.4,
        speed: 0.28 + Math.random() * 0.36,
        phase: Math.random() * Math.PI * 2,
        radius: 0.55 + Math.random() * 1.15,
        scale: 1,
        groundY: 6.9 + (Math.random() - 0.5) * 0.65,
      });
    }
    this.group.add(this.condMistPoints);

    // --- 4. PRESIPITASI: Sculpted Teardrop Rain Curtain + Impact Ripples + Valley Rain Mist ---
    const rainCount = 180;
    // Sleek tapered raindrop needle (crisp sapphire-cobalt drop falling clearly from the dark storm cloud)
    const rainGeo = new THREE.ConeGeometry(0.032, 0.5, 4);
    rainGeo.rotateX(Math.PI); // Tapered tail pointing upward, rounded drop pointing down
    this.rainMat = new THREE.MeshBasicMaterial({
      color: 0x1e63bd,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.disposables.push(rainGeo, this.rainMat);
    this.rainMesh = new THREE.InstancedMesh(rainGeo, this.rainMat, rainCount);
    this.rainMesh.frustumCulled = false;
    for (let i = 0; i < rainCount; i++) {
      // Cluster raindrops directly beneath the elevated storm cloud centered around (-3.05, 7.35, -0.75)
      const rx = -4.45 + Math.random() * 2.95;
      const rz = -2.0 + Math.random() * 2.9;
      this.rainSeeds.push({
        x: rx,
        y: Math.random(),
        z: rz,
        speed: 0.85 + Math.random() * 0.52,
        phase: Math.random() * Math.PI * 2,
        radius: 0,
        scale: 0.82 + Math.random() * 0.54,
        groundY: Math.max(terrainHeightAt(rx, rz), WATER_LEVEL),
      });
    }
    this.group.add(this.rainMesh);

    // Expanding water impact splash rings
    const splashCount = 24;
    const ringGeo = new THREE.RingGeometry(0.05, 0.095, 14);
    ringGeo.rotateX(-Math.PI / 2);
    this.splashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.disposables.push(ringGeo, this.splashMat);
    this.splashMesh = new THREE.InstancedMesh(ringGeo, this.splashMat, splashCount);
    this.splashMesh.frustumCulled = false;
    for (let i = 0; i < splashCount; i++) {
      const rx = -2.2 + Math.random() * 4.8;
      const rz =
        rx < 1.6 ? riverCenterZ(rx) + (Math.random() - 0.5) * 0.45 : (Math.random() - 0.5) * 5.2;
      const surfaceY = rx < 1.65 ? riverWaterSurfaceY(rx) + 0.035 : WATER_LEVEL + 0.04;
      this.splashSeeds.push({
        x: rx,
        y: Math.random(),
        z: rz,
        speed: 0.7 + Math.random() * 0.45,
        phase: Math.random() * Math.PI * 2,
        radius: 0,
        scale: 0.85 + Math.random() * 0.6,
        groundY: surfaceY,
      });
    }
    this.group.add(this.splashMesh);

    // Atmospheric low-lying valley rain mist billowing over mountains during rainfall
    const rainMistCount = 34;
    this.rainMistPos = new Float32Array(rainMistCount * 3);
    this.rainMistGeo = new THREE.BufferGeometry();
    this.rainMistGeo.setAttribute('position', new THREE.BufferAttribute(this.rainMistPos, 3));
    this.rainMistMat = new THREE.PointsMaterial({
      map: textures.mistSprite,
      color: 0xeef6fc,
      size: 2.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.disposables.push(this.rainMistGeo, this.rainMistMat);
    this.rainMistPoints = new THREE.Points(this.rainMistGeo, this.rainMistMat);
    this.rainMistPoints.frustumCulled = false;
    this.rainMistPoints.renderOrder = 8;
    for (let i = 0; i < rainMistCount; i++) {
      const rx = -4.3 + Math.random() * 3.5;
      const rz = -2.1 + Math.random() * 4.1;
      this.rainMistSeeds.push({
        x: rx,
        y: Math.random(),
        z: rz,
        speed: 0.1 + Math.random() * 0.09,
        phase: Math.random() * Math.PI * 2,
        radius: 0.28 + Math.random() * 0.35,
        scale: 1,
        groundY: Math.max(terrainHeightAt(rx, rz) + 0.25, 0.5),
      });
    }
    this.group.add(this.rainMistPoints);

    // --- 5a. LIMPASAN: River & Waterfall Beads + Waterfall Spray Mist ---
    const runoffCount = 42;
    this.runoffMat = new THREE.MeshBasicMaterial({
      color: 0x8ef3ff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    this.disposables.push(this.runoffMat);
    this.runoffMesh = new THREE.InstancedMesh(orbGeo, this.runoffMat, runoffCount);
    this.runoffMesh.frustumCulled = false;
    for (let i = 0; i < runoffCount; i++) {
      this.runoffSeeds.push({
        x: 0,
        y: Math.random(),
        z: (Math.random() - 0.5) * 0.45,
        speed: 0.15 + Math.random() * 0.08,
        phase: Math.random() * Math.PI * 2,
        radius: 0,
        scale: 0.68 + Math.random() * 0.45,
        groundY: 0,
      });
    }
    this.group.add(this.runoffMesh);

    // Delicate waterfall spray mist rising from base of cliff waterfall
    const wfMistCount = 22;
    const wfZ = riverCenterZ(-1.12);
    this.waterfallMistPos = new Float32Array(wfMistCount * 3);
    this.waterfallMistGeo = new THREE.BufferGeometry();
    this.waterfallMistGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.waterfallMistPos, 3)
    );
    this.waterfallMistMat = new THREE.PointsMaterial({
      map: textures.mistSprite,
      color: 0xffffff,
      size: 1.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.disposables.push(this.waterfallMistGeo, this.waterfallMistMat);
    this.waterfallMistPoints = new THREE.Points(this.waterfallMistGeo, this.waterfallMistMat);
    this.waterfallMistPoints.frustumCulled = false;
    this.waterfallMistPoints.renderOrder = 8;
    for (let i = 0; i < wfMistCount; i++) {
      this.waterfallMistSeeds.push({
        x: -1.12 + (Math.random() - 0.5) * 0.55,
        y: Math.random(),
        z: wfZ + (Math.random() - 0.5) * 0.55,
        speed: 0.25 + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2,
        radius: 0.14 + Math.random() * 0.18,
        scale: 1,
        groundY: 0.25,
      });
    }
    this.group.add(this.waterfallMistPoints);

    // --- 5b. INFILTRASI: Subsurface Percolation Beads + Luminous Aquifer Shimmer Sprites ---
    const infilCount = 46;
    this.infilMat = new THREE.MeshBasicMaterial({
      color: 0x74f4ff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.disposables.push(this.infilMat);
    this.infilMesh = new THREE.InstancedMesh(orbGeo, this.infilMat, infilCount);
    this.infilMesh.frustumCulled = false;

    const entryXs = [-3.4, -2.1, -0.85, 0.45, 1.55];
    entryXs.forEach((ex) => {
      const topY = Math.min(terrainHeightAt(ex, DIORAMA_HALF_Z) - 0.06, 1.3);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(ex, topY, DIORAMA_HALF_Z + 0.05),
        new THREE.Vector3(ex + 0.14, (topY - 1.35) * 0.5, DIORAMA_HALF_Z + 0.055),
        new THREE.Vector3(ex + 0.32, -1.35, DIORAMA_HALF_Z + 0.055),
        new THREE.Vector3(Math.min(ex + 2.6, 3.2), -1.24, DIORAMA_HALF_Z + 0.055),
        new THREE.Vector3(4.85, -0.96, DIORAMA_HALF_Z + 0.055),
      ]);
      this.infilCurves.push(curve);
    });

    for (let i = 0; i < infilCount; i++) {
      this.infilSeeds.push({
        x: i % this.infilCurves.length,
        y: Math.random(),
        z: 0,
        speed: 0.14 + Math.random() * 0.08,
        phase: Math.random() * Math.PI * 2,
        radius: 0,
        scale: 0.78 + Math.random() * 0.42,
        groundY: 0,
      });
    }
    this.group.add(this.infilMesh);

    // Radiant halo glow sprites tracking every infiltration droplet for crystal subterranean elegance
    this.infilGlowPos = new Float32Array(infilCount * 3);
    this.infilGlowGeo = new THREE.BufferGeometry();
    this.infilGlowGeo.setAttribute('position', new THREE.BufferAttribute(this.infilGlowPos, 3));
    this.infilGlowMat = new THREE.PointsMaterial({
      map: textures.glowSprite,
      color: 0x56ecff,
      size: 0.46,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(this.infilGlowGeo, this.infilGlowMat);
    this.infilGlowPoints = new THREE.Points(this.infilGlowGeo, this.infilGlowMat);
    this.infilGlowPoints.frustumCulled = false;
    this.infilGlowPoints.renderOrder = 9;
    this.group.add(this.infilGlowPoints);

    this.buildCycleFlowRibbons();
    this.buildTouchRipplePool();
  }

  /**
   * Adjusts active instance/sprite draw counts smoothly for Ringan vs Tinggi mode
   * without removing any visual layer or allocating memory.
   */
  public setDensityScale(scale: number): void {
    this.densityScale = THREE.MathUtils.clamp(scale, 0.55, 1.0);
    const s = this.densityScale;
    this.evapMesh.count = Math.floor(this.evapSeeds.length * s);
    this.evapMistGeo.setDrawRange(0, Math.floor(this.evapMistSeeds.length * s));
    this.transpMesh.count = Math.floor(this.transpSeeds.length * s);
    this.transpMistGeo.setDrawRange(0, Math.floor(this.transpMistSeeds.length * s));
    this.condMesh.count = Math.floor(this.condSeeds.length * s);
    this.condMistGeo.setDrawRange(0, Math.floor(this.condMistSeeds.length * s));
    this.rainMesh.count = Math.floor(this.rainSeeds.length * s);
    this.splashMesh.count = Math.floor(this.splashSeeds.length * s);
    this.rainMistGeo.setDrawRange(0, Math.floor(this.rainMistSeeds.length * s));
    this.runoffMesh.count = Math.floor(this.runoffSeeds.length * s);
    this.infilMesh.count = Math.floor(this.infilSeeds.length * s);
    this.infilGlowGeo.setDrawRange(0, Math.floor(this.infilSeeds.length * s));
    this.waterfallMistGeo.setDrawRange(0, Math.floor(this.waterfallMistSeeds.length * s));
  }

  private buildCycleFlowRibbons(): void {
    const specs: Array<{
      stageId: WaterCycleStageId;
      color: number;
      points: Array<[number, number, number]>;
    }> = [
      {
        stageId: 'evaporasi',
        color: 0xe6951a,
        points: [
          [3.6, 0.45, 0.4],
          [3.5, 3.15, 0.15],
          [2.7, 6.05, -0.25],
        ],
      },
      {
        stageId: 'transpirasi',
        color: 0x0fa974,
        points: [
          [-0.9, 1.45, 1.55],
          [-0.75, 3.85, 0.95],
          [-0.25, 6.35, -0.35],
        ],
      },
      {
        stageId: 'kondensasi',
        color: 0x1a74d4,
        points: [
          [2.15, 6.9, -0.35],
          [-0.2, 7.55, -0.75],
          [-2.6, 7.35, -0.65],
        ],
      },
      {
        stageId: 'presipitasi',
        color: 0x1b5eb8,
        points: [
          [-3.05, 6.75, -0.65],
          [-3.15, 5.15, -0.35],
          [-2.85, 3.25, 0.1],
        ],
      },
      {
        stageId: 'infiltrasi',
        color: 0x00b8d4,
        points: [
          [-2.1, 0.7, DIORAMA_HALF_Z + 0.14],
          [-1.5, -1.35, DIORAMA_HALF_Z + 0.14],
          [1.6, -1.25, DIORAMA_HALF_Z + 0.14],
          [4.3, -0.88, DIORAMA_HALF_Z + 0.14],
        ],
      },
    ];

    const beadGeo = new THREE.OctahedronGeometry(0.095, 0);
    this.disposables.push(beadGeo);

    specs.forEach((s) => {
      const curve = new THREE.CatmullRomCurve3(s.points.map((p) => new THREE.Vector3(...p)));
      const tubeGeo = new THREE.TubeGeometry(curve, 22, 0.026, 5, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: s.color,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      });
      const beadMat = new THREE.MeshBasicMaterial({
        color: s.color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      this.disposables.push(tubeGeo, tubeMat, beadMat);

      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.renderOrder = 7;
      this.flowGroup.add(tubeMesh);

      const beads: THREE.Mesh[] = [];
      for (let b = 0; b < 3; b++) {
        const bead = new THREE.Mesh(beadGeo, beadMat);
        bead.renderOrder = 8;
        this.flowGroup.add(bead);
        beads.push(bead);
      }

      this.flowRibbons.push({
        stageId: s.stageId,
        curve,
        tubeMesh,
        tubeMat,
        beads,
        beadMat,
      });
    });
  }

  private buildTouchRipplePool(): void {
    const rippleGeo = new THREE.RingGeometry(0.18, 0.24, 24);
    rippleGeo.rotateX(-Math.PI / 2);
    this.disposables.push(rippleGeo);

    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xf2c977 : 0x73e1ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.disposables.push(mat);
      const mesh = new THREE.Mesh(rippleGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 10;
      this.group.add(mesh);
      this.touchRipples.push({
        mesh,
        material: mat,
        age: 0,
        duration: 0.95 + i * 0.22,
        active: false,
      });
    }
  }

  public triggerTouchRipple(worldPoint: THREE.Vector3, accentHex: string): void {
    this.touchRipples.forEach((r, idx) => {
      r.active = true;
      r.age = -idx * 0.08;
      r.mesh.visible = true;
      r.mesh.position.copy(worldPoint);
      r.mesh.position.y += 0.06;
      r.mesh.scale.setScalar(0.15);
      r.material.color.set(idx === 0 ? '#f0ca78' : accentHex);
      r.material.opacity = 0.0;
    });
  }

  public setFlowGuidesVisible(visible: boolean): void {
    this.flowGroup.visible = visible;
  }

  public update(dt: number, elapsed: number, activeStage: WaterCycleStageId): void {
    const damp = 1 - Math.exp(-3.4 * dt);

    const targetEvap = activeStage === 'evaporasi' ? 1.0 : activeStage === 'overview' ? 0.72 : 0.18;
    const targetTransp =
      activeStage === 'transpirasi' ? 1.0 : activeStage === 'overview' ? 0.68 : 0.16;
    const targetCond = activeStage === 'kondensasi' ? 1.0 : activeStage === 'overview' ? 0.72 : 0.22;
    const targetPrecip =
      activeStage === 'presipitasi' ? 1.0 : activeStage === 'overview' ? 0.56 : 0.1;
    const targetInfil = activeStage === 'infiltrasi' ? 1.0 : activeStage === 'overview' ? 0.72 : 0.22;

    this.weights.evaporasi += (targetEvap - this.weights.evaporasi) * damp;
    this.weights.transpirasi += (targetTransp - this.weights.transpirasi) * damp;
    this.weights.kondensasi += (targetCond - this.weights.kondensasi) * damp;
    this.weights.presipitasi += (targetPrecip - this.weights.presipitasi) * damp;
    this.weights.infiltrasi += (targetInfil - this.weights.infiltrasi) * damp;

    // --- 1. EVAPORASI: Golden Orbs + Sunlit Steam Wisps ---
    const wEvap = this.weights.evaporasi;
    this.evapMat.opacity = 0.2 + wEvap * 0.72;
    this.evapMistMat.opacity = 0.08 + wEvap * 0.42;
    this.evapMistMat.size = 1.25 + wEvap * 0.65;

    const evapSpeedMult = 0.55 + wEvap * 0.95;
    for (let i = 0; i < this.evapMesh.count; i++) {
      const s = this.evapSeeds[i];
      s.y = (s.y + dt * s.speed * evapSpeedMult) % 1;
      const t = s.y;
      const archX = THREE.MathUtils.lerp(s.x, 1.9 + (s.x - 3.0) * 0.35, t * t);
      const y = WATER_LEVEL + 0.08 + t * 6.45;
      const swayX = Math.sin(elapsed * 2.1 + s.phase + t * 5.0) * s.radius * (0.4 + t);
      const swayZ = Math.cos(elapsed * 1.8 + s.phase + t * 4.2) * s.radius * (0.4 + t);
      const fade = Math.sin(t * Math.PI);
      const sc = s.scale * (0.45 + wEvap * 0.72) * fade;

      _dummy.position.set(archX + swayX, y, s.z * (1 - t * 0.42) + swayZ);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(sc * 0.88, sc * 1.28, sc * 0.88);
      _dummy.updateMatrix();
      this.evapMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.evapMesh.instanceMatrix.needsUpdate = true;

    const evapMistActive = Math.floor(this.evapMistSeeds.length * this.densityScale);
    for (let i = 0; i < evapMistActive; i++) {
      const s = this.evapMistSeeds[i];
      s.y = (s.y + dt * s.speed * evapSpeedMult) % 1;
      const t = s.y;
      const idx = i * 3;
      this.evapMistPos[idx] =
        THREE.MathUtils.lerp(s.x, 1.95 + (s.x - 3.0) * 0.3, t * t) +
        Math.sin(elapsed * 1.2 + s.phase + t * 3.2) * s.radius;
      this.evapMistPos[idx + 1] = s.groundY + t * 6.0;
      this.evapMistPos[idx + 2] =
        s.z * (1 - t * 0.4) + Math.cos(elapsed * 1.0 + s.phase) * s.radius;
    }
    (this.evapMistGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // --- 2. TRANSPIRASI: Emerald Dew + Botanical Forest Mist Plumes ---
    const wTransp = this.weights.transpirasi;
    this.transpMat.opacity = 0.18 + wTransp * 0.72;
    this.transpMistMat.opacity = 0.08 + wTransp * 0.38;
    this.transpMistMat.size = 1.2 + wTransp * 0.55;

    const transpSpeedMult = 0.5 + wTransp * 0.9;
    for (let i = 0; i < this.transpMesh.count; i++) {
      const s = this.transpSeeds[i];
      s.y = (s.y + dt * s.speed * transpSpeedMult) % 1;
      const t = s.y;
      const y = THREE.MathUtils.lerp(s.groundY, 6.8, t);
      const x =
        THREE.MathUtils.lerp(s.x, -0.35 + s.x * 0.3, t * t) +
        Math.sin(elapsed * 1.9 + s.phase) * s.radius;
      const z =
        THREE.MathUtils.lerp(s.z, -0.65, t * 0.7) + Math.cos(elapsed * 1.6 + s.phase) * s.radius;
      const fade = Math.sin(t * Math.PI);
      const sc = s.scale * (0.4 + wTransp * 0.78) * fade;

      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.setScalar(sc);
      _dummy.updateMatrix();
      this.transpMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.transpMesh.instanceMatrix.needsUpdate = true;

    const transpMistActive = Math.floor(this.transpMistSeeds.length * this.densityScale);
    for (let i = 0; i < transpMistActive; i++) {
      const s = this.transpMistSeeds[i];
      s.y = (s.y + dt * s.speed * transpSpeedMult) % 1;
      const t = s.y;
      const idx = i * 3;
      this.transpMistPos[idx] =
        THREE.MathUtils.lerp(s.x, -0.3 + s.x * 0.35, t * t) +
        Math.sin(elapsed * 1.1 + s.phase) * s.radius;
      this.transpMistPos[idx + 1] = THREE.MathUtils.lerp(s.groundY, 6.55, t);
      this.transpMistPos[idx + 2] =
        THREE.MathUtils.lerp(s.z, -0.6, t * 0.65) + Math.cos(elapsed * 0.9 + s.phase) * s.radius;
    }
    (this.transpMistGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // --- 3. KONDENSASI: Thin Billowing Cloud Mist Veil + Swirling Silver Droplets ---
    const wCond = this.weights.kondensasi;
    this.condMat.opacity = 0.2 + wCond * 0.72;
    this.condMistMat.opacity = 0.14 + wCond * 0.46;
    this.condMistMat.size = 1.9 + wCond * 1.05;

    for (let i = 0; i < this.condMesh.count; i++) {
      const s = this.condSeeds[i];
      const angle = elapsed * s.speed * (0.6 + wCond * 0.85) + s.phase;
      const driftT = (s.y + elapsed * 0.045) % 1;
      const centerX = THREE.MathUtils.lerp(2.4, -2.9, driftT);
      const centerY = 6.95 + Math.sin(driftT * Math.PI) * 0.45;
      const x = centerX + Math.cos(angle) * s.radius;
      const y = centerY + Math.sin(angle * 1.3) * 0.36;
      const z = s.z + Math.sin(angle) * s.radius * 0.55;
      const fade = Math.sin(driftT * Math.PI);
      const sc = s.scale * (0.45 + wCond * 0.72) * (0.35 + 0.65 * fade);

      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.setScalar(sc);
      _dummy.updateMatrix();
      this.condMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.condMesh.instanceMatrix.needsUpdate = true;

    // Update thin swirling condensation mist puffs enveloping the upper clouds
    const condMistActive = Math.floor(this.condMistSeeds.length * this.densityScale);
    for (let i = 0; i < condMistActive; i++) {
      const s = this.condMistSeeds[i];
      const driftT = (s.y + elapsed * (0.032 + wCond * 0.025)) % 1;
      const swirl = elapsed * s.speed * (0.55 + wCond * 0.6) + s.phase;
      const cx = THREE.MathUtils.lerp(2.9, -3.2, driftT);
      const idx = i * 3;
      this.condMistPos[idx] = cx + Math.cos(swirl) * s.radius;
      this.condMistPos[idx + 1] =
        s.groundY + Math.sin(driftT * Math.PI) * 0.5 + Math.sin(swirl * 1.1) * 0.28;
      this.condMistPos[idx + 2] = s.z + Math.sin(swirl) * s.radius * 0.5;
    }
    (this.condMistGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // --- 4. PRESIPITASI: Animated Rain Curtain + Impact Splashes + Mountain Rain Mist ---
    const wPrecip = this.weights.presipitasi;
    this.rainMat.opacity = wPrecip * 0.92;
    this.splashMat.opacity = wPrecip * 0.82;
    this.rainMistMat.opacity = wPrecip * 0.42;
    const rainVisible = wPrecip > 0.08;
    this.rainMesh.visible = rainVisible;
    this.splashMesh.visible = rainVisible;
    this.rainMistPoints.visible = rainVisible;

    if (rainVisible) {
      const rainSpeedMult = 0.8 + wPrecip * 0.9;
      for (let i = 0; i < this.rainMesh.count; i++) {
        const s = this.rainSeeds[i];
        s.y = (s.y + dt * s.speed * rainSpeedMult) % 1;
        const t = s.y;
        // Start cleanly from the bottom of the elevated dark storm cloud (Y ≈ 6.88) down to terrain/mountain
        const spawnY = 6.88 + Math.sin(s.phase) * 0.14;
        const y = THREE.MathUtils.lerp(spawnY, s.groundY, t);
        const windSlant = t * 0.28;

        _dummy.position.set(s.x - windSlant, y, s.z);
        _dummy.rotation.set(0, 0, -0.09);
        const sc = s.scale * (0.6 + wPrecip * 0.58);
        _dummy.scale.set(sc, sc * (0.95 + wPrecip * 0.55), sc);
        _dummy.updateMatrix();
        this.rainMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < this.splashMesh.count; i++) {
        const s = this.splashSeeds[i];
        s.y = (s.y + dt * s.speed * (0.7 + wPrecip * 0.7)) % 1;
        const t = s.y;
        const expand = (0.3 + t * 2.4) * s.scale * wPrecip;
        _dummy.position.set(s.x, s.groundY, s.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.setScalar(expand * (1 - t * 0.3));
        _dummy.updateMatrix();
        this.splashMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.splashMesh.instanceMatrix.needsUpdate = true;

      const rainMistActive = Math.floor(this.rainMistSeeds.length * this.densityScale);
      for (let i = 0; i < rainMistActive; i++) {
        const s = this.rainMistSeeds[i];
        s.y = (s.y + dt * s.speed) % 1;
        const t = s.y;
        const idx = i * 3;
        this.rainMistPos[idx] = s.x + Math.sin(elapsed * 0.8 + s.phase) * s.radius;
        this.rainMistPos[idx + 1] = s.groundY + t * 1.15;
        this.rainMistPos[idx + 2] = s.z + Math.cos(elapsed * 0.7 + s.phase) * s.radius;
      }
      (this.rainMistGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // --- 5a. LIMPASAN: River Flow Beads + Waterfall Spray Mist ---
    const wInfil = this.weights.infiltrasi;
    this.runoffMat.opacity = 0.28 + wInfil * 0.66;
    const flowSpeedMult = 0.62 + wInfil * 0.88;
    for (let i = 0; i < this.runoffMesh.count; i++) {
      const s = this.runoffSeeds[i];
      s.y = (s.y + dt * s.speed * flowSpeedMult) % 1;
      const t = s.y;
      const x = THREE.MathUtils.lerp(-3.4, 2.35, t);
      const z = riverCenterZ(x) + s.z * (0.4 + t * 0.75);
      const y = riverWaterSurfaceY(x) + 0.055;
      const fade = Math.sin(t * Math.PI);
      const sc = s.scale * (0.45 + wInfil * 0.65) * (0.3 + 0.7 * fade);

      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.setScalar(sc);
      _dummy.updateMatrix();
      this.runoffMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.runoffMesh.instanceMatrix.needsUpdate = true;

    // Continuous delicate waterfall spray mist
    this.waterfallMistMat.opacity = 0.26 + Math.max(wInfil, wPrecip) * 0.28;
    const wfMistActive = Math.floor(this.waterfallMistSeeds.length * this.densityScale);
    for (let i = 0; i < wfMistActive; i++) {
      const s = this.waterfallMistSeeds[i];
      s.y = (s.y + dt * s.speed) % 1;
      const t = s.y;
      const idx = i * 3;
      this.waterfallMistPos[idx] = s.x + t * 0.35 + Math.sin(elapsed * 2.2 + s.phase) * s.radius;
      this.waterfallMistPos[idx + 1] = s.groundY + t * 0.95;
      this.waterfallMistPos[idx + 2] = s.z + Math.cos(elapsed * 1.9 + s.phase) * s.radius;
    }
    (this.waterfallMistGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // --- 5b. INFILTRASI: Subsurface Percolation + Radiant Aquifer Halo Glow ---
    this.infilMat.opacity = 0.25 + wInfil * 0.72;
    this.infilGlowMat.opacity = 0.2 + wInfil * 0.68;
    this.infilGlowMat.size = 0.35 + wInfil * 0.28;
    for (let i = 0; i < this.infilMesh.count; i++) {
      const s = this.infilSeeds[i];
      s.y = (s.y + dt * s.speed * flowSpeedMult) % 1;
      const curve = this.infilCurves[s.x];
      curve.getPointAt(s.y, _vecA);
      const fade = Math.sin(s.y * Math.PI);
      const sc = s.scale * (0.5 + wInfil * 0.72) * (0.25 + 0.75 * fade);

      _dummy.position.copy(_vecA);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.setScalar(sc);
      _dummy.updateMatrix();
      this.infilMesh.setMatrixAt(i, _dummy.matrix);

      const gIdx = i * 3;
      this.infilGlowPos[gIdx] = _vecA.x;
      this.infilGlowPos[gIdx + 1] = _vecA.y;
      this.infilGlowPos[gIdx + 2] = _vecA.z + 0.04;
    }
    this.infilMesh.instanceMatrix.needsUpdate = true;
    (this.infilGlowGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // --- 6. Flow Ribbons ---
    if (this.flowGroup.visible) {
      for (let i = 0; i < this.flowRibbons.length; i++) {
        const ribbon = this.flowRibbons[i];
        const isActive = activeStage === ribbon.stageId;
        const isOverview = activeStage === 'overview';
        const targetTubeOpacity = isActive ? 0.78 : isOverview ? 0.38 : 0.1;
        const targetBeadOpacity = isActive ? 0.98 : isOverview ? 0.75 : 0.18;

        ribbon.tubeMat.opacity += (targetTubeOpacity - ribbon.tubeMat.opacity) * damp;
        ribbon.beadMat.opacity += (targetBeadOpacity - ribbon.beadMat.opacity) * damp;

        const speed = isActive ? 0.42 : 0.24;
        for (let b = 0; b < ribbon.beads.length; b++) {
          const t = (elapsed * speed + b / ribbon.beads.length) % 1;
          ribbon.curve.getPointAt(t, _vecA);
          ribbon.curve.getTangentAt(t, _vecB);
          const bead = ribbon.beads[b];
          bead.position.copy(_vecA);
          bead.quaternion.setFromUnitVectors(_up, _vecB.normalize());
          const sc = (isActive ? 1.35 : 0.92) * (0.4 + 0.6 * Math.sin(t * Math.PI));
          bead.scale.set(sc * 0.8, sc * 1.45, sc * 0.8);
        }
      }
    }

    // --- 7. Touch Ripples ---
    for (let i = 0; i < this.touchRipples.length; i++) {
      const r = this.touchRipples[i];
      if (!r.active) continue;
      r.age += dt;
      if (r.age < 0) {
        r.material.opacity = 0;
        continue;
      }
      if (r.age >= r.duration) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const p = r.age / r.duration;
      const eased = 1 - Math.pow(1 - p, 3);
      r.mesh.scale.setScalar(0.35 + eased * 4.4);
      r.material.opacity = (1 - p) * 0.82;
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.evapMesh.dispose();
    this.transpMesh.dispose();
    this.condMesh.dispose();
    this.rainMesh.dispose();
    this.splashMesh.dispose();
    this.runoffMesh.dispose();
    this.infilMesh.dispose();
  }
}
