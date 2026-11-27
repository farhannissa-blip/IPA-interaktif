import * as THREE from 'three';
import { WaterCycleStageId } from '../data/waterCycleData';
import { ProceduralTextureSet } from './proceduralTextures';
import {
  BASE_BOTTOM_Y,
  DIORAMA_CENTER_X,
  DIORAMA_HALF_Z,
  DIORAMA_MAX_X,
  DIORAMA_MIN_X,
  DIORAMA_WIDTH_X,
  RIVER_CASCADE_X,
  RIVER_END_X,
  RIVER_START_X,
  WATER_LEVEL,
  coastlineX,
  isWetArea,
  riverCenterZ,
  riverHalfWidth,
  riverPerpDistance,
  riverSlopeDZDX,
  riverSurfaceSlope,
  riverWaterSurfaceY,
  terrainHeightAt,
} from './terrainMath';

export interface CloudCluster {
  group: THREE.Group;
  basePos: THREE.Vector3;
  baseScale: number;
  phase: number;
  materials: THREE.MeshStandardMaterial[];
  role: 'condensation' | 'transit' | 'storm';
}

export interface WaterShaderUniforms {
  uTime: { value: number };
  uWaveAmp: { value: number };
  uEvapGlow: { value: number };
  uInfilGlow: { value: number };
  uSunDir: { value: THREE.Vector3 };
}

export interface FishermanRig {
  torsoPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  netGroup: THREE.Group;
  caughtFishGroup: THREE.Group;
  ropeMesh: THREE.Mesh;
  splashRing: THREE.Mesh;
  splashMat: THREE.MeshBasicMaterial;
  handAnchorLocal: THREE.Vector3;
}

export interface BuiltDiorama {
  root: THREE.Group;
  skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
  };
  studioFloorMat: THREE.MeshStandardMaterial;
  sunGroup: THREE.Group;
  sunUniforms: {
    uTime: { value: number };
    uBrightness: { value: number };
  };
  sunInnerFlare: THREE.Sprite;
  sunInnerFlareMat: THREE.SpriteMaterial;
  sunOuterAura: THREE.Sprite;
  sunOuterAuraMat: THREE.SpriteMaterial;
  sunHaloMat: THREE.MeshBasicMaterial;
  sunBeamMat: THREE.MeshBasicMaterial;
  clouds: CloudCluster[];
  lightningLight: THREE.PointLight;
  oceanMaterial: THREE.MeshStandardMaterial;
  oceanUniforms: WaterShaderUniforms;
  riverMaterial: THREE.MeshStandardMaterial;
  waterfallMaterial: THREE.MeshStandardMaterial;
  aquiferGlowMaterial: THREE.MeshStandardMaterial;
  boatGroup: THREE.Group;
  boatBasePos: THREE.Vector3;
  fishermanRig: FishermanRig;
  interactableProxies: THREE.Mesh[];
  disposables: Array<{ dispose: () => void }>;
}

/**
 * Builds the top terrain surface mesh (84x60 grid for smooth winding riverbanks & crisp alpine ridges).
 */
function buildTerrainSurface(
  textures: ProceduralTextureSet,
  disposables: Array<{ dispose: () => void }>
): THREE.Mesh {
  const segX = 100;
  const segZ = 60;
  const geo = new THREE.PlaneGeometry(DIORAMA_WIDTH_X, DIORAMA_HALF_Z * 2, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(DIORAMA_CENTER_X, 0, 0);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  const cOceanBed = new THREE.Color(0x133348);
  const cShallowSand = new THREE.Color(0xd2bd8e);
  const cWetSand = new THREE.Color(0xc4a46c);
  const cBrightSand = new THREE.Color(0xf0dba9);
  const cMeadow = new THREE.Color(0x3f7b4c);
  const cForest = new THREE.Color(0x28563c);
  const cAlpineRock = new THREE.Color(0x5a616b);
  const cSnow = new THREE.Color(0xebf1f7);
  const cRiverStone = new THREE.Color(0x465b66);
  const cRiverBank = new THREE.Color(0x6e7d63);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeightAt(x, z);
    pos.setY(i, h);

    const grain = Math.sin(x * 3.1 + z * 2.7) * 0.036;
    const distInland = coastlineX(z) - x;
    const inRiverRange = x > RIVER_START_X - 0.15 && x < RIVER_END_X + 0.15;
    const perpRiver = inRiverRange ? riverPerpDistance(x, z) : 99;
    const hw = inRiverRange ? riverHalfWidth(x) : 0;
    const inRiverBed = inRiverRange && perpRiver < hw * 1.04 && distInland > 0.35;
    const inRiverRim = inRiverRange && !inRiverBed && perpRiver < hw * 1.52 && distInland > 0.55;

    if (h < -0.32) {
      c.copy(cOceanBed).lerp(cShallowSand, THREE.MathUtils.clamp((h + 1.15) / 0.83, 0, 1));
    } else if (inRiverBed) {
      const pebbleBlend = THREE.MathUtils.smoothstep(perpRiver, hw * 0.35, hw * 1.04);
      c.copy(cRiverStone).lerp(cShallowSand, 0.22 + pebbleBlend * 0.28);
    } else if (distInland < 1.52 && h < 0.54) {
      // Wide, unmistakable tropical sandy beach: shallow sandbar -> wet shoreline -> bright golden sand -> grassy dune edge
      if (h < 0.02) {
        c.copy(cShallowSand).lerp(cWetSand, THREE.MathUtils.smoothstep(h, -0.22, 0.02));
      } else if (h < 0.14) {
        c.copy(cWetSand).lerp(cBrightSand, THREE.MathUtils.smoothstep(h, 0.02, 0.14));
      } else {
        const grassEdge = THREE.MathUtils.smoothstep(distInland, 1.08, 1.52);
        const heightEdge = THREE.MathUtils.smoothstep(h, 0.34, 0.54);
        const duneBlend = Math.max(grassEdge, heightEdge);
        c.copy(cBrightSand).lerp(cMeadow, duneBlend);
      }
    } else if (h < 0.42) {
      c.copy(cBrightSand).lerp(cMeadow, THREE.MathUtils.smoothstep(h, 0.16, 0.42));
    } else if (h < 1.55) {
      c.copy(cMeadow).lerp(cForest, THREE.MathUtils.smoothstep(h, 0.42, 1.45));
    } else if (h < 3.05) {
      c.copy(cForest).lerp(cAlpineRock, THREE.MathUtils.smoothstep(h, 1.55, 2.95));
    } else {
      c.copy(cAlpineRock).lerp(cSnow, THREE.MathUtils.smoothstep(h, 3.05, 3.85));
    }

    // Soft mossy-pebble transition along the meandering riverbanks
    if (inRiverRim && h >= -0.25) {
      const rimFactor = 1 - THREE.MathUtils.smoothstep(perpRiver, hw * 1.04, hw * 1.52);
      c.lerp(cRiverBank, rimFactor * 0.52);
    }

    c.offsetHSL(0, 0, grain);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  disposables.push(geo);

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.04,
    bumpMap: textures.terrainBump,
    bumpScale: 0.045,
  });
  disposables.push(mat);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/**
 * Builds the 4 vertical geological cutaway walls enclosing the terrain block down to BASE_BOTTOM_Y.
 */
function buildCutawayWalls(
  textures: ProceduralTextureSet,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    map: textures.strataColor,
    bumpMap: textures.strataBump,
    bumpScale: 0.065,
    roughness: 0.86,
    metalness: 0.05,
  });
  disposables.push(mat);

  const makeEdgeWall = (
    segments: number,
    samplePoint: (t: number) => [number, number],
    flipWinding: boolean
  ) => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const [x, z] = samplePoint(t);
      const topY = terrainHeightAt(x, z);
      const bottomY = BASE_BOTTOM_Y;

      positions.push(x, topY, z);
      uvs.push(t * 2.5, 0.0);
      positions.push(x, bottomY, z);
      uvs.push(t * 2.5, 1.0);

      if (i < segments) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        if (flipWinding) {
          indices.push(a, c, b, c, d, b);
        } else {
          indices.push(a, b, c, c, b, d);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    disposables.push(geo);

    const wall = new THREE.Mesh(geo, mat);
    wall.receiveShadow = true;
    return wall;
  };

  group.add(
    makeEdgeWall(
      80,
      (t) => [THREE.MathUtils.lerp(DIORAMA_MIN_X, DIORAMA_MAX_X, t), DIORAMA_HALF_Z],
      false
    ),
    makeEdgeWall(
      80,
      (t) => [THREE.MathUtils.lerp(DIORAMA_MIN_X, DIORAMA_MAX_X, t), -DIORAMA_HALF_Z],
      true
    ),
    makeEdgeWall(
      48,
      (t) => [DIORAMA_MIN_X, THREE.MathUtils.lerp(-DIORAMA_HALF_Z, DIORAMA_HALF_Z, t)],
      false
    ),
    makeEdgeWall(
      48,
      (t) => [DIORAMA_MAX_X, THREE.MathUtils.lerp(-DIORAMA_HALF_Z, DIORAMA_HALF_Z, t)],
      true
    )
  );

  return group;
}

/**
 * Builds the luxury museum pedestal with brushed champagne-gold bevel frame,
 * dark obsidian plinth, corner brass brackets, and studio contact shadow.
 * Uses sleek MeshStandardMaterial (fast on mobile/PID GPUs while preserving RoomEnvironment reflections).
 */
function buildMuseumPedestal(
  textures: ProceduralTextureSet,
  disposables: Array<{ dispose: () => void }>
): { group: THREE.Group; studioFloorMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();

  const obsidianMat = new THREE.MeshStandardMaterial({
    color: 0x0f1622,
    roughness: 0.22,
    metalness: 0.35,
  });
  const champagneGoldMat = new THREE.MeshStandardMaterial({
    color: 0xd9b672,
    roughness: 0.24,
    roughnessMap: textures.brushedGoldRoughness,
    metalness: 0.92,
  });
  const darkBronzeMat = new THREE.MeshStandardMaterial({
    color: 0x3b3328,
    roughness: 0.48,
    metalness: 0.78,
  });
  disposables.push(obsidianMat, champagneGoldMat, darkBronzeMat);

  const w = DIORAMA_WIDTH_X;
  const d = DIORAMA_HALF_Z * 2;
  const cx = DIORAMA_CENTER_X;

  const plinthGeo = new THREE.BoxGeometry(w + 0.36, 0.56, d + 0.36);
  const subPlinthGeo = new THREE.BoxGeometry(w + 0.72, 0.24, d + 0.72);
  disposables.push(plinthGeo, subPlinthGeo);

  const plinth = new THREE.Mesh(plinthGeo, obsidianMat);
  plinth.position.set(cx, BASE_BOTTOM_Y - 0.28, 0);
  plinth.receiveShadow = true;

  const subPlinth = new THREE.Mesh(subPlinthGeo, obsidianMat);
  subPlinth.position.set(cx, BASE_BOTTOM_Y - 0.68, 0);
  subPlinth.receiveShadow = true;
  group.add(plinth, subPlinth);

  const railH = 0.11;
  const railThick = 0.12;
  const frontRailGeo = new THREE.BoxGeometry(w + 0.44, railH, railThick);
  const sideRailGeo = new THREE.BoxGeometry(railThick, railH, d + 0.44);
  disposables.push(frontRailGeo, sideRailGeo);

  const yTrim = BASE_BOTTOM_Y + 0.02;
  const rFront = new THREE.Mesh(frontRailGeo, champagneGoldMat);
  rFront.position.set(cx, yTrim, DIORAMA_HALF_Z + 0.16);
  const rBack = new THREE.Mesh(frontRailGeo, champagneGoldMat);
  rBack.position.set(cx, yTrim, -DIORAMA_HALF_Z - 0.16);
  const rLeft = new THREE.Mesh(sideRailGeo, champagneGoldMat);
  rLeft.position.set(DIORAMA_MIN_X - 0.16, yTrim, 0);
  const rRight = new THREE.Mesh(sideRailGeo, champagneGoldMat);
  rRight.position.set(DIORAMA_MAX_X + 0.16, yTrim, 0);
  group.add(rFront, rBack, rLeft, rRight);

  const lowerFrontGeo = new THREE.BoxGeometry(w + 0.76, 0.05, 0.06);
  const lowerSideGeo = new THREE.BoxGeometry(0.06, 0.05, d + 0.76);
  disposables.push(lowerFrontGeo, lowerSideGeo);
  const yLow = BASE_BOTTOM_Y - 0.56;
  const lf = new THREE.Mesh(lowerFrontGeo, champagneGoldMat);
  lf.position.set(cx, yLow, DIORAMA_HALF_Z + 0.35);
  const lb = new THREE.Mesh(lowerFrontGeo, champagneGoldMat);
  lb.position.set(cx, yLow, -DIORAMA_HALF_Z - 0.35);
  const ll = new THREE.Mesh(lowerSideGeo, champagneGoldMat);
  ll.position.set(DIORAMA_MIN_X - 0.35, yLow, 0);
  const lr = new THREE.Mesh(lowerSideGeo, champagneGoldMat);
  lr.position.set(DIORAMA_MAX_X + 0.35, yLow, 0);
  group.add(lf, lb, ll, lr);

  const cornerGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.62, 6);
  const capGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.08, 6);
  disposables.push(cornerGeo, capGeo);

  const corners: Array<[number, number]> = [
    [DIORAMA_MIN_X - 0.18, -DIORAMA_HALF_Z - 0.18],
    [DIORAMA_MAX_X + 0.18, -DIORAMA_HALF_Z - 0.18],
    [DIORAMA_MIN_X - 0.18, DIORAMA_HALF_Z + 0.18],
    [DIORAMA_MAX_X + 0.18, DIORAMA_HALF_Z + 0.18],
  ];
  corners.forEach(([cornerX, cornerZ]) => {
    const col = new THREE.Mesh(cornerGeo, darkBronzeMat);
    col.position.set(cornerX, BASE_BOTTOM_Y - 0.25, cornerZ);
    const cap = new THREE.Mesh(capGeo, champagneGoldMat);
    cap.position.set(cornerX, BASE_BOTTOM_Y + 0.08, cornerZ);
    group.add(col, cap);
  });

  const plaqueGeo = new THREE.BoxGeometry(2.6, 0.22, 0.07);
  disposables.push(plaqueGeo);
  const plaque = new THREE.Mesh(plaqueGeo, champagneGoldMat);
  plaque.position.set(cx, BASE_BOTTOM_Y - 0.28, DIORAMA_HALF_Z + 0.2);
  group.add(plaque);

  // Soft Radial Contact Shadow Plane grounding the pedestal to bright sky-misted studio floor
  const shadowGeo = new THREE.PlaneGeometry(22.0, 14.5);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.36,
  });
  disposables.push(shadowGeo, shadowMat);
  const contactShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadowMesh.position.set(cx, BASE_BOTTOM_Y - 0.79, 0);
  group.add(contactShadowMesh);

  // Airy sky-misted studio floor blending seamlessly into horizon fog
  const floorGeo = new THREE.CircleGeometry(64, 32);
  floorGeo.rotateX(-Math.PI / 2);
  const studioFloorMat = new THREE.MeshStandardMaterial({
    color: 0xbce3fc,
    roughness: 0.92,
    metalness: 0.02,
  });
  disposables.push(floorGeo, studioFloorMat);
  const studioFloor = new THREE.Mesh(floorGeo, studioFloorMat);
  studioFloor.position.y = BASE_BOTTOM_Y - 0.82;
  studioFloor.receiveShadow = true;
  group.add(studioFloor);

  return { group, studioFloorMat };
}

/**
 * Builds the luminous subsurface Aquifer Chamber + crystal glass cutaway window
 * without multi-pass transmission (single-pass glossy IBL glass = 2x faster on mobile & PID).
 */
function buildAquiferCutaway(
  waterUniforms: WaterShaderUniforms,
  disposables: Array<{ dispose: () => void }>
): {
  group: THREE.Group;
  aquiferGlowMaterial: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();

  const shape = new THREE.Shape();
  shape.moveTo(-4.85, -1.68);
  shape.bezierCurveTo(-3.2, -1.25, -1.4, -1.42, 0.8, -1.22);
  shape.bezierCurveTo(2.4, -1.08, 3.8, -0.95, 5.28, -0.78);
  shape.lineTo(5.28, -1.42);
  shape.bezierCurveTo(3.1, -1.55, 0.5, -1.82, -2.1, -1.88);
  shape.bezierCurveTo(-3.6, -1.9, -4.4, -1.86, -4.85, -1.68);

  const aquiferGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.15,
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 1,
  });
  disposables.push(aquiferGeo);

  const aquiferGlowMaterial = new THREE.MeshStandardMaterial({
    color: 0x1ca3c7,
    emissive: 0x168db5,
    emissiveIntensity: 0.72,
    roughness: 0.14,
    metalness: 0.14,
    transparent: true,
    opacity: 0.9,
  });
  aquiferGlowMaterial.customProgramCacheKey = () => 'aquifer-luxury-caustic-v1';
  aquiferGlowMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.uniforms.uInfilGlow = waterUniforms.uInfilGlow;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWaterWorldPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uInfilGlow;
        varying vec3 vWaterWorldPos;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float aqWave1 = sin(vWaterWorldPos.x * 2.6 - uTime * 2.1 + sin(vWaterWorldPos.y * 7.2) * 1.4);
        float aqWave2 = cos(vWaterWorldPos.x * 4.4 - uTime * 3.0 - vWaterWorldPos.y * 5.0);
        float aqCaustic = pow(clamp(0.5 + 0.35 * aqWave1 + 0.25 * aqWave2, 0.0, 1.0), 3.2);
        float aqPulse = 0.5 + 0.5 * sin(vWaterWorldPos.x * 1.15 - uTime * 1.8);
        vec3 aqShimmer = vec3(0.22, 0.92, 1.0) * aqCaustic * (0.28 + uInfilGlow * 1.15);
        aqShimmer += vec3(0.55, 0.98, 1.0) * pow(aqPulse, 4.0) * uInfilGlow * 0.42;
        totalEmissiveRadiance += aqShimmer;`
      );
  };
  disposables.push(aquiferGlowMaterial);

  const aquiferBand = new THREE.Mesh(aquiferGeo, aquiferGlowMaterial);
  aquiferBand.position.set(0, 0, DIORAMA_HALF_Z - 0.06);
  group.add(aquiferBand);

  const veinMat = new THREE.MeshStandardMaterial({
    color: 0x45d3e8,
    emissive: 0x1d9ab8,
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0.72,
  });
  disposables.push(veinMat);

  const veinXPositions = [-3.4, -2.1, -0.85, 0.45, 1.55];
  veinXPositions.forEach((vx, i) => {
    const topY = Math.min(terrainHeightAt(vx, DIORAMA_HALF_Z) - 0.08, 1.35);
    const botY = -1.35 + i * 0.07;
    if (topY > botY + 0.35) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(vx, topY, DIORAMA_HALF_Z + 0.03),
        new THREE.Vector3(
          vx + Math.sin(i * 2.1) * 0.18,
          (topY + botY) * 0.52,
          DIORAMA_HALF_Z + 0.035
        ),
        new THREE.Vector3(vx + 0.12, botY, DIORAMA_HALF_Z + 0.03),
      ]);
      const veinGeo = new THREE.TubeGeometry(curve, 12, 0.032, 5, false);
      disposables.push(veinGeo);
      group.add(new THREE.Mesh(veinGeo, veinMat));
    }
  });

  // Single-pass glossy crystal glass faceplate (no extra full-scene transmission render pass)
  const glassGeo = new THREE.PlaneGeometry(DIORAMA_WIDTH_X - 0.04, 2.2);
  disposables.push(glassGeo);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xdaf4ff,
    roughness: 0.06,
    metalness: 0.18,
    envMapIntensity: 1.5,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  disposables.push(glassMat);

  const frontGlass = new THREE.Mesh(glassGeo, glassMat);
  frontGlass.position.set(DIORAMA_CENTER_X, -1.06, DIORAMA_HALF_Z + 0.08);
  frontGlass.renderOrder = 6;
  group.add(frontGlass);

  const rightWaterWallGeo = new THREE.PlaneGeometry(DIORAMA_HALF_Z * 2 - 0.04, 1.32);
  rightWaterWallGeo.rotateY(Math.PI / 2);
  const frontCoastX = coastlineX(DIORAMA_HALF_Z);
  const frontWaterWidth = Math.max(DIORAMA_MAX_X - frontCoastX, 2.8);
  const frontWaterVolGeo = new THREE.PlaneGeometry(frontWaterWidth, 1.32);
  disposables.push(rightWaterWallGeo, frontWaterVolGeo);

  const oceanSideMat = new THREE.MeshStandardMaterial({
    color: 0x105c7d,
    roughness: 0.14,
    metalness: 0.12,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  disposables.push(oceanSideMat);

  const rightWaterWall = new THREE.Mesh(rightWaterWallGeo, oceanSideMat);
  rightWaterWall.position.set(DIORAMA_MAX_X + 0.01, -0.66, 0);
  rightWaterWall.renderOrder = 5;

  const frontWaterVol = new THREE.Mesh(frontWaterVolGeo, oceanSideMat);
  frontWaterVol.position.set(frontCoastX + frontWaterWidth * 0.5, -0.66, DIORAMA_HALF_Z + 0.015);
  frontWaterVol.renderOrder = 5;
  group.add(rightWaterWall, frontWaterVol);

  return { group, aquiferGlowMaterial };
}

/**
 * Builds the animated PBR Ocean surface (extended via onBeforeCompile on fast MeshStandardMaterial),
 * sculpted mountain-to-sea River ribbon, and Waterfall cascade.
 */
function buildWaterBodies(
  textures: ProceduralTextureSet,
  oceanUniforms: WaterShaderUniforms,
  disposables: Array<{ dispose: () => void }>
): {
  group: THREE.Group;
  oceanMaterial: THREE.MeshStandardMaterial;
  oceanUniforms: WaterShaderUniforms;
  riverMaterial: THREE.MeshStandardMaterial;
  waterfallMaterial: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();

  // Smooth 60x36 ocean surface spanning the widened eastern ocean for natural rolling swells
  const oceanGeo = new THREE.PlaneGeometry(DIORAMA_WIDTH_X - 0.06, DIORAMA_HALF_Z * 2 - 0.06, 60, 36);
  oceanGeo.rotateX(-Math.PI / 2);
  oceanGeo.translate(DIORAMA_CENTER_X, 0, 0);
  disposables.push(oceanGeo);

  const oceanMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d5c82,
    roughness: 0.12,
    metalness: 0.18,
    envMapIntensity: 1.45,
    bumpMap: textures.waterNormalBump,
    bumpScale: 0.032,
    transparent: true,
    opacity: 0.9,
  });

  oceanMaterial.customProgramCacheKey = () => 'ocean-luxury-shimmer-v3';
  oceanMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.uniforms.uWaveAmp = oceanUniforms.uWaveAmp;
    shader.uniforms.uEvapGlow = oceanUniforms.uEvapGlow;
    shader.uniforms.uInfilGlow = oceanUniforms.uInfilGlow;
    shader.uniforms.uSunDir = oceanUniforms.uSunDir;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWaveAmp;
        varying vec3 vWaterWorldPos;
        varying float vWaveCrest;
        varying vec3 vWaveSlope;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Multi-directional natural shoreward ocean swells synchronized with oceanWaveHeightAt()
        float beachLineV = 2.08 + sin(transformed.z * 0.68 + 0.25) * 0.34 + cos(transformed.z * 1.28) * 0.12;
        float shoreDamp = smoothstep(-0.1, 1.35, transformed.x - beachLineV);
        float amp = uWaveAmp * (0.28 + 0.72 * shoreDamp);

        float p1 = transformed.x * 1.25 + transformed.z * 0.28 + uTime * 1.75;
        float p2 = transformed.x * 1.95 - transformed.z * 0.92 + uTime * 2.35;
        float p3 = transformed.x * 0.78 + transformed.z * 1.45 - uTime * 1.35;
        float p4 = transformed.x * 3.10 + transformed.z * 1.80 + uTime * 3.10;

        float hWave = sin(p1) * 0.62 + sin(p2) * 0.36 + cos(p3) * 0.28 + sin(p4) * 0.14;
        // Subtle Gerstner horizontal trochoid pinch for natural rounded crests
        float pinchX = (cos(p1) * 0.62 + cos(p2) * 0.36) * amp * 0.75;
        float pinchZ = (cos(p1) * 0.16 - cos(p2) * 0.18 - sin(p3) * 0.24) * amp * 0.65;
        transformed.x -= pinchX;
        transformed.z -= pinchZ;
        transformed.y += hWave * amp;

        float dhdx = (cos(p1) * 1.25 * 0.62 + cos(p2) * 1.95 * 0.36 - sin(p3) * 0.78 * 0.28 + cos(p4) * 3.1 * 0.14) * amp;
        float dhdz = (cos(p1) * 0.28 * 0.62 - cos(p2) * 0.92 * 0.36 - sin(p3) * 1.45 * 0.28 + cos(p4) * 1.8 * 0.14) * amp;

        vWaveCrest = clamp(hWave * 0.5 + 0.5, 0.0, 1.0) * shoreDamp;
        vWaveSlope = normalize(vec3(-dhdx * 2.2, 1.0, -dhdz * 2.2));
        vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uEvapGlow;
        uniform float uInfilGlow;
        uniform vec3 uSunDir;
        varying vec3 vWaterWorldPos;
        varying float vWaveCrest;
        varying vec3 vWaveSlope;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 wViewDir = normalize(cameraPosition - vWaterWorldPos);
        // Combine physical rolling wave normal with animated capillary micro-ripples
        float nx = cos(vWaterWorldPos.x * 2.8 + uTime * 2.0) * 0.09 + cos(vWaterWorldPos.x * 5.6 - vWaterWorldPos.z * 3.8 + uTime * 3.1) * 0.055;
        float nz = sin(vWaterWorldPos.z * 2.4 - uTime * 1.6) * 0.09 + sin(vWaterWorldPos.z * 4.9 + vWaterWorldPos.x * 3.2 - uTime * 2.6) * 0.055;
        vec3 wNorm = normalize(vWaveSlope + vec3(-nx, 0.0, -nz));

        // 1. Luxury Fresnel sky reflection sheen riding every rolling swell
        float fresnel = pow(1.0 - max(dot(wViewDir, wNorm), 0.0), 3.0);
        vec3 skySheen = vec3(0.42, 0.79, 1.0) * fresnel * (0.3 + uEvapGlow * 0.24 + uInfilGlow * 0.22);

        // 2. Dynamic Evaporasi solar specular glitter & sunlit golden caustics across widened ocean
        vec3 sunHalf = normalize(uSunDir + wViewDir);
        float sunSpec = pow(max(dot(wNorm, sunHalf), 0.0), 36.0);
        float c1 = sin(vWaterWorldPos.x * 3.4 + uTime * 2.2) * cos(vWaterWorldPos.z * 3.1 - uTime * 1.7);
        float c2 = sin((vWaterWorldPos.x - vWaterWorldPos.z) * 4.6 - uTime * 2.8);
        float causticNet = pow(clamp(0.52 + 0.35 * c1 + 0.25 * c2, 0.0, 1.0), 4.0);
        float eastMask = smoothstep(1.8, 5.8, vWaterWorldPos.x);
        vec3 evapGold = vec3(1.0, 0.86, 0.48) * (sunSpec * 0.98 + causticNet * 0.54 * eastMask) * (0.18 + uEvapGlow * 1.15);

        // 3. Dynamic Infiltrasi coastal turquoise subsurface glow & caustic ripple
        float coastMask = smoothstep(6.8, 2.0, vWaterWorldPos.x);
        float infilPulse = pow(clamp(0.5 + 0.5 * sin(vWaterWorldPos.x * 3.2 - uTime * 2.5 + c1 * 2.0), 0.0, 1.0), 3.0);
        vec3 infilAqua = vec3(0.16, 0.92, 1.0) * (causticNet * 0.5 + infilPulse * 0.36) * coastMask * (0.12 + uInfilGlow * 1.05);

        // 4. Natural offshore rolling wave crest sparkle + rhythmic white surf waves lapping the sandy beach
        float beachLine = 2.08 + sin(vWaterWorldPos.z * 0.68 + 0.25) * 0.34 + cos(vWaterWorldPos.z * 1.28) * 0.12;
        float shoreDist = vWaterWorldPos.x - beachLine;
        float shallowLagoon = smoothstep(1.05, 0.04, shoreDist) * smoothstep(-0.22, 0.02, shoreDist);
        float surfRoll1 = sin(shoreDist * 10.5 + uTime * 2.4 + sin(vWaterWorldPos.z * 2.4) * 1.1);
        float surfRoll2 = sin(shoreDist * 17.0 + uTime * 3.3 - cos(vWaterWorldPos.z * 3.1) * 0.8);
        float foamBand = smoothstep(0.68, 0.0, shoreDist) * smoothstep(-0.14, 0.04, shoreDist) * (0.36 + 0.64 * smoothstep(0.05, 0.92, surfRoll1 * 0.65 + surfRoll2 * 0.35));
        float crestSparkle = smoothstep(0.76, 0.97, vWaveCrest) * smoothstep(0.2, 0.9, c1 * 0.5 + 0.5);
        vec3 beachSurf = vec3(0.18, 0.79, 0.88) * shallowLagoon * 0.34 + vec3(0.95, 0.99, 1.0) * (foamBand * 0.62 + crestSparkle * 0.26);

        totalEmissiveRadiance += skySheen + evapGold + infilAqua + beachSurf;`
      );
  };
  disposables.push(oceanMaterial);

  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMaterial);
  oceanMesh.position.y = WATER_LEVEL;
  oceanMesh.receiveShadow = true;
  oceanMesh.renderOrder = 3;
  group.add(oceanMesh);

  // Sculpted Winding Valley River Ribbon (96 steps × 4 cross-section vertices, true perpendicular banks)
  const riverSteps = 96;
  const crossOffsets = [-1.14, -0.44, 0.44, 1.14];
  const crossU = [0.0, 0.31, 0.69, 1.0];
  const cols = crossOffsets.length;
  const rPositions: number[] = [];
  const rUvs: number[] = [];
  const rSlopes: number[] = [];
  const rIndices: number[] = [];

  let arcDist = 0;
  let prevCenterX = RIVER_START_X + 0.06;
  let prevCenterZ = riverCenterZ(prevCenterX);

  for (let i = 0; i <= riverSteps; i++) {
    const t = i / riverSteps;
    const x = THREE.MathUtils.lerp(RIVER_START_X + 0.06, RIVER_END_X - 0.06, t);
    const cz = riverCenterZ(x);
    if (i > 0) {
      arcDist += Math.hypot(x - prevCenterX, cz - prevCenterZ);
    }
    prevCenterX = x;
    prevCenterZ = cz;

    const dzdx = riverSlopeDZDX(x);
    const invLen = 1 / Math.hypot(1, dzdx);
    // True unit perpendicular vector pointing from -Z bank to +Z bank
    const nx = -dzdx * invLen;
    const nz = invLen;

    const hw = riverHalfWidth(x);
    const localSlope = riverSurfaceSlope(x);
    const vCoord = arcDist * 0.85;

    for (let col = 0; col < cols; col++) {
      const offset = crossOffsets[col] * hw;
      const px = x + nx * offset;
      const pz = cz + nz * offset;
      const isOuter = col === 0 || col === cols - 1;
      // Outer edges tuck gently into the rising carved riverbank for zero gaps; center gently crowns
      const edgeTuck = isOuter ? -0.032 : 0.012;
      const py = riverWaterSurfaceY(px) + edgeTuck;

      rPositions.push(px, py, pz);
      rUvs.push(crossU[col], vCoord);
      rSlopes.push(localSlope);
    }

    if (i < riverSteps) {
      const rowA = i * cols;
      const rowB = (i + 1) * cols;
      for (let col = 0; col < cols - 1; col++) {
        const a = rowA + col;
        const b = rowA + col + 1;
        const c = rowB + col;
        const d = rowB + col + 1;
        rIndices.push(a, b, c, c, b, d);
      }
    }
  }

  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPositions, 3));
  riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rUvs, 2));
  riverGeo.setAttribute('aRiverSlope', new THREE.Float32BufferAttribute(rSlopes, 1));
  riverGeo.setIndex(rIndices);
  riverGeo.computeVertexNormals();
  disposables.push(riverGeo);

  const riverMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e94c2,
    emissive: 0x093147,
    emissiveIntensity: 0.26,
    roughness: 0.13,
    metalness: 0.16,
    envMapIntensity: 1.42,
    bumpMap: textures.waterNormalBump,
    bumpScale: 0.036,
    transparent: true,
    opacity: 0.93,
  });
  riverMaterial.customProgramCacheKey = () => 'river-luxury-flow-v2';
  riverMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.uniforms.uEvapGlow = oceanUniforms.uEvapGlow;
    shader.uniforms.uInfilGlow = oceanUniforms.uInfilGlow;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aRiverSlope;
        varying vec2 vRiverUv;
        varying float vRiverSlope;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRiverUv = uv;
        vRiverSlope = aRiverSlope;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uEvapGlow;
        uniform float uInfilGlow;
        varying vec2 vRiverUv;
        varying float vRiverSlope;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Flow streaks follow river arc-length vRiverUv.y seamlessly around every meander
        float bankDist = abs(vRiverUv.x - 0.5) * 2.0;
        float speedBoost = 1.0 + clamp(vRiverSlope * 1.4, 0.0, 1.2);
        float flowA = sin(vRiverUv.y * 8.5 - uTime * 4.8 * speedBoost + sin(vRiverUv.x * 6.2831) * 1.4);
        float flowB = cos(vRiverUv.y * 14.5 - uTime * 6.9 * speedBoost - vRiverUv.x * 7.5);
        float streamGlint = pow(clamp(0.5 + 0.34 * flowA + 0.24 * flowB, 0.0, 1.0), 3.4);

        // Natural whitewater rapids shimmer on steeper mountain grades + soft bank ripples
        float rapidsMask = smoothstep(0.18, 0.55, vRiverSlope);
        float rapidsFoam = pow(clamp(0.5 + 0.5 * sin(vRiverUv.y * 18.0 - uTime * 8.6 + vRiverUv.x * 9.0), 0.0, 1.0), 2.4) * rapidsMask;
        float bankFoam = smoothstep(0.68, 0.96, bankDist) * (0.45 + 0.55 * clamp(flowA * 0.5 + 0.5, 0.0, 1.0)) * (0.32 + rapidsMask * 0.42);

        vec3 riverShine = vec3(0.46, 0.93, 1.0) * streamGlint * (0.24 + uInfilGlow * 0.92);
        riverShine += vec3(1.0, 0.88, 0.56) * pow(streamGlint, 2.0) * uEvapGlow * 0.52;
        riverShine += vec3(0.92, 0.98, 1.0) * (rapidsFoam * 0.58 + bankFoam * 0.38);
        totalEmissiveRadiance += riverShine;`
      );
  };
  disposables.push(riverMaterial);

  const riverMesh = new THREE.Mesh(riverGeo, riverMaterial);
  riverMesh.receiveShadow = true;
  riverMesh.renderOrder = 4;
  group.add(riverMesh);

  // Subtle whitewater rapids & cascade foam cushions placed dynamically at steepest natural valley stretch
  const waterfallMaterial = new THREE.MeshStandardMaterial({
    color: 0xe6f8ff,
    emissive: 0x62bedb,
    emissiveIntensity: 0.34,
    roughness: 0.42,
    metalness: 0.0,
    transparent: true,
    opacity: 0.62,
  });
  disposables.push(waterfallMaterial);

  const foamGeo = new THREE.DodecahedronGeometry(0.16, 0);
  disposables.push(foamGeo);
  const cascadeOffsets = [-0.26, -0.06, 0.14, 0.32, 0.5];
  cascadeOffsets.forEach((dx, i) => {
    const fx = RIVER_CASCADE_X + dx;
    const fz = riverCenterZ(fx);
    const fy = riverWaterSurfaceY(fx);
    const hw = riverHalfWidth(fx);
    const lateral = ((i % 2 === 0 ? -1 : 1) * 0.28 + (i === 2 ? 0.0 : 0.05)) * hw;
    const puff = new THREE.Mesh(foamGeo, waterfallMaterial);
    puff.position.set(fx, fy + 0.03, fz + lateral);
    puff.scale.set(1.05 + (i % 3) * 0.18, 0.42, 0.95);
    group.add(puff);
  });

  return { group, oceanMaterial, oceanUniforms, riverMaterial, waterfallMaterial };
}

/**
 * Builds a natural, blazing round Sun with an incandescent photosphere shader
 * (brilliant white-gold core with warm solar limb), soft atmospheric corona shell,
 * camera-facing radiant glare/aura sprites, and gentle Evaporation sunbeam cone.
 */
function buildHeroSun(
  textures: ProceduralTextureSet,
  disposables: Array<{ dispose: () => void }>
): {
  sunGroup: THREE.Group;
  sunUniforms: {
    uTime: { value: number };
    uBrightness: { value: number };
  };
  sunInnerFlare: THREE.Sprite;
  sunInnerFlareMat: THREE.SpriteMaterial;
  sunOuterAura: THREE.Sprite;
  sunOuterAuraMat: THREE.SpriteMaterial;
  sunHaloMat: THREE.MeshBasicMaterial;
  sunBeamMat: THREE.MeshBasicMaterial;
} {
  const sunGroup = new THREE.Group();
  // Positioned clearly HIGHER than all cloud clusters (cloud tops ~8.05) over the expanded ocean
  sunGroup.position.set(5.95, 9.65, -2.55);

  const sunUniforms = {
    uTime: { value: 0 },
    uBrightness: { value: 1.0 },
  };

  // 1. Smooth Natural Round Solar Photosphere (bright white-gold center → golden-amber limb)
  const coreGeo = new THREE.SphereGeometry(0.86, 28, 20);
  const sunCoreMat = new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: `
      varying vec3 vNormalDir;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormalDir = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBrightness;
      varying vec3 vNormalDir;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      void main() {
        float ndv = clamp(dot(normalize(vNormalDir), normalize(vViewDir)), 0.0, 1.0);
        // Subtle organic solar surface granulation shimmer
        float gran = sin(vLocalPos.x * 7.5 + uTime * 1.1) * cos(vLocalPos.y * 7.2 - uTime * 0.9) * sin(vLocalPos.z * 6.8 + uTime * 0.7);
        float coreMask = pow(ndv, 0.55);
        vec3 limbCol = vec3(1.0, 0.74, 0.22);
        vec3 midCol = vec3(1.0, 0.93, 0.58);
        vec3 centerCol = vec3(1.0, 0.995, 0.92);
        vec3 col = mix(limbCol, midCol, smoothstep(0.0, 0.58, coreMask));
        col = mix(col, centerCol, smoothstep(0.45, 0.95, coreMask));
        col += vec3(0.06, 0.04, 0.0) * gran;
        col *= (1.05 + uBrightness * 0.42);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    fog: false,
  });
  disposables.push(coreGeo, sunCoreMat);
  sunGroup.add(new THREE.Mesh(coreGeo, sunCoreMat));

  // 2. Soft Spherical Inner Chromosphere Corona
  const haloGeo = new THREE.SphereGeometry(1.1, 20, 16);
  const sunHaloMat = new THREE.MeshBasicMaterial({
    color: 0xffe47a,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  disposables.push(haloGeo, sunHaloMat);
  sunGroup.add(new THREE.Mesh(haloGeo, sunHaloMat));

  // 3. Camera-Facing Bright Solar Glare Sprite (always round & luminous from any orbit angle)
  const sunInnerFlareMat = new THREE.SpriteMaterial({
    map: textures.sunGlowSprite,
    color: 0xfff7cc,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  disposables.push(sunInnerFlareMat);
  const sunInnerFlare = new THREE.Sprite(sunInnerFlareMat);
  sunInnerFlare.scale.set(4.2, 4.2, 1);
  sunInnerFlare.renderOrder = 11;
  sunGroup.add(sunInnerFlare);

  // 4. Wide Atmospheric Golden Sunlight Bloom Sprite
  const sunOuterAuraMat = new THREE.SpriteMaterial({
    map: textures.sunGlowSprite,
    color: 0xffd25e,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  disposables.push(sunOuterAuraMat);
  const sunOuterAura = new THREE.Sprite(sunOuterAuraMat);
  sunOuterAura.scale.set(7.0, 7.0, 1);
  sunOuterAura.renderOrder = 10;
  sunGroup.add(sunOuterAura);

  // 5. Gentle Sunbeam Cone descending from the high sun toward the expanded ocean during Evaporasi
  const beamGeo = new THREE.CylinderGeometry(0.7, 3.1, 9.8, 16, 1, true);
  const sunBeamMat = new THREE.MeshBasicMaterial({
    color: 0xffe694,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  disposables.push(beamGeo, sunBeamMat);
  const beam = new THREE.Mesh(beamGeo, sunBeamMat);
  beam.position.set(-0.55, -4.85, 1.75);
  beam.rotation.z = -0.14;
  beam.rotation.x = 0.28;
  sunGroup.add(beam);

  return {
    sunGroup,
    sunUniforms,
    sunInnerFlare,
    sunInnerFlareMat,
    sunOuterAura,
    sunOuterAuraMat,
    sunHaloMat,
    sunBeamMat,
  };
}

/**
 * Builds composite instanced forests (Multi-tier Pine Conifers + Broadleaf Tropical Trees)
 * and faceted Alpine/Coastal Boulders — optimized low-poly luxury silhouettes for high FPS on HP/PID.
 */
function buildFloraAndRocks(disposables: Array<{ dispose: () => void }>): THREE.Group {
  const group = new THREE.Group();

  let seed = 42719;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  interface TreeTransform {
    x: number;
    y: number;
    z: number;
    scale: number;
    rotY: number;
    tint: number;
  }

  const pineSpots: TreeTransform[] = [];
  const broadleafSpots: TreeTransform[] = [];
  const rockSpots: TreeTransform[] = [];

  for (let i = 0; i < 360; i++) {
    const x = THREE.MathUtils.lerp(DIORAMA_MIN_X + 0.45, 1.85, rand());
    const z = THREE.MathUtils.lerp(-DIORAMA_HALF_Z + 0.45, DIORAMA_HALF_Z - 0.45, rand());
    const h = terrainHeightAt(x, z);

    if (Math.hypot(x - 0.45, z - 2.75) < 1.15) continue;

    if (isWetArea(x, z)) {
      if (h > -0.15 && h < 0.3 && rockSpots.length < 30) {
        rockSpots.push({ x, y: h - 0.03, z, scale: 0.45 + rand() * 0.65, rotY: rand() * Math.PI * 2, tint: rand() });
      }
      continue;
    }

    const distInland = coastlineX(z) - x;

    if (h > 1.05 && h < 2.95 && pineSpots.length < 44) {
      pineSpots.push({
        x,
        y: h - 0.02,
        z,
        scale: 0.84 + rand() * 0.36,
        rotY: rand() * Math.PI * 2,
        tint: rand(),
      });
    } else if (distInland > 1.38 && h >= 0.36 && h <= 1.45 && broadleafSpots.length < 30) {
      broadleafSpots.push({
        x,
        y: h - 0.02,
        z,
        scale: 0.85 + rand() * 0.32,
        rotY: rand() * Math.PI * 2,
        tint: rand(),
      });
    } else if (h >= 2.2 && h < 3.6 && rockSpots.length < 38) {
      rockSpots.push({
        x,
        y: h - 0.05,
        z,
        scale: 0.55 + rand() * 0.85,
        rotY: rand() * Math.PI * 2,
        tint: rand(),
      });
    }
  }

  // Natural smooth river stones nestled along the meandering valley riverbanks
  for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) / 16;
    const rx = THREE.MathUtils.lerp(RIVER_START_X + 0.25, RIVER_END_X - 0.75, t);
    const cz = riverCenterZ(rx);
    const dzdx = riverSlopeDZDX(rx);
    const invLen = 1 / Math.hypot(1, dzdx);
    const side = i % 2 === 0 ? 1 : -1;
    const offset = side * riverHalfWidth(rx) * (1.06 + rand() * 0.22);
    const bx = rx + -dzdx * invLen * offset;
    const bz = cz + invLen * offset;
    if (Math.hypot(bx - 0.45, bz - 2.75) < 1.15) continue;
    const by = terrainHeightAt(bx, bz);
    if (by > WATER_LEVEL + 0.02) {
      rockSpots.push({
        x: bx,
        y: by - 0.04,
        z: bz,
        scale: 0.42 + rand() * 0.44,
        rotY: rand() * Math.PI * 2,
        tint: rand() * 0.65,
      });
    }
  }

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // --- A. Multi-Part Instanced Pine Trees (trunk + 3 tiered foliage cones) ---
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c402c, roughness: 0.9, metalness: 0.02 });
  const pineLeafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.04 });
  disposables.push(trunkMat, pineLeafMat);

  const pineTrunkGeo = new THREE.CylinderGeometry(0.032, 0.068, 0.36, 5);
  pineTrunkGeo.translate(0, 0.18, 0);
  const pineTier1Geo = new THREE.ConeGeometry(0.24, 0.36, 6);
  pineTier1Geo.translate(0, 0.42, 0);
  const pineTier2Geo = new THREE.ConeGeometry(0.19, 0.32, 6);
  pineTier2Geo.translate(0, 0.62, 0);
  const pineTier3Geo = new THREE.ConeGeometry(0.12, 0.26, 6);
  pineTier3Geo.translate(0, 0.81, 0);
  disposables.push(pineTrunkGeo, pineTier1Geo, pineTier2Geo, pineTier3Geo);

  const pTrunks = new THREE.InstancedMesh(pineTrunkGeo, trunkMat, pineSpots.length);
  const pT1 = new THREE.InstancedMesh(pineTier1Geo, pineLeafMat, pineSpots.length);
  const pT2 = new THREE.InstancedMesh(pineTier2Geo, pineLeafMat, pineSpots.length);
  const pT3 = new THREE.InstancedMesh(pineTier3Geo, pineLeafMat, pineSpots.length);

  pineSpots.forEach((p, idx) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    pTrunks.setMatrixAt(idx, dummy.matrix);
    pT1.setMatrixAt(idx, dummy.matrix);
    pT2.setMatrixAt(idx, dummy.matrix);
    pT3.setMatrixAt(idx, dummy.matrix);

    color.setHSL(0.39 + p.tint * 0.04, 0.44, 0.21 + p.tint * 0.06);
    pT1.setColorAt(idx, color);
    color.offsetHSL(0, 0.03, 0.04);
    pT2.setColorAt(idx, color);
    color.offsetHSL(0, 0.04, 0.05);
    pT3.setColorAt(idx, color);
  });

  // Only primary tier casts shadow to slash shadow-map draw calls while keeping grounded shadows
  pT1.castShadow = true;
  [pTrunks, pT1, pT2, pT3].forEach((m) => {
    m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  });

  // --- B. Multi-Part Instanced Broadleaf Tropical Trees (trunk + 3 offset crown clusters) ---
  const broadLeafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0.03 });
  disposables.push(broadLeafMat);

  const bTrunkGeo = new THREE.CylinderGeometry(0.038, 0.075, 0.34, 5);
  bTrunkGeo.translate(0, 0.17, 0);
  const bCrownMainGeo = new THREE.SphereGeometry(0.24, 8, 6);
  bCrownMainGeo.scale(1.15, 0.86, 1.12);
  bCrownMainGeo.translate(0, 0.48, 0);
  const bCrownSide1Geo = new THREE.SphereGeometry(0.16, 7, 5);
  bCrownSide1Geo.translate(0.14, 0.41, 0.08);
  const bCrownSide2Geo = new THREE.SphereGeometry(0.15, 7, 5);
  bCrownSide2Geo.translate(-0.13, 0.44, -0.09);
  disposables.push(bTrunkGeo, bCrownMainGeo, bCrownSide1Geo, bCrownSide2Geo);

  const bTrunks = new THREE.InstancedMesh(bTrunkGeo, trunkMat, broadleafSpots.length);
  const bC1 = new THREE.InstancedMesh(bCrownMainGeo, broadLeafMat, broadleafSpots.length);
  const bC2 = new THREE.InstancedMesh(bCrownSide1Geo, broadLeafMat, broadleafSpots.length);
  const bC3 = new THREE.InstancedMesh(bCrownSide2Geo, broadLeafMat, broadleafSpots.length);

  broadleafSpots.forEach((p, idx) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    bTrunks.setMatrixAt(idx, dummy.matrix);
    bC1.setMatrixAt(idx, dummy.matrix);
    bC2.setMatrixAt(idx, dummy.matrix);
    bC3.setMatrixAt(idx, dummy.matrix);

    color.setHSL(0.32 + p.tint * 0.06, 0.46, 0.28 + p.tint * 0.08);
    bC1.setColorAt(idx, color);
    color.offsetHSL(-0.02, 0.04, 0.05);
    bC2.setColorAt(idx, color);
    color.offsetHSL(0.03, -0.02, -0.03);
    bC3.setColorAt(idx, color);
  });

  bC1.castShadow = true;
  [bTrunks, bC1, bC2, bC3].forEach((m) => {
    m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  });

  // --- C. Sculpted Instanced Alpine & Coastal Boulders ---
  const rockGeo = new THREE.DodecahedronGeometry(0.19, 0);
  rockGeo.scale(1.25, 0.72, 1.0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.06 });
  disposables.push(rockGeo, rockMat);

  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockSpots.length);
  rockSpots.forEach((r, idx) => {
    dummy.position.set(r.x, r.y, r.z);
    dummy.rotation.set(r.tint * 0.4, r.rotY, r.tint * 0.3);
    dummy.scale.set(r.scale, r.scale * 0.85, r.scale);
    dummy.updateMatrix();
    rockMesh.setMatrixAt(idx, dummy.matrix);
    color.setHSL(0.58, 0.08, 0.32 + r.tint * 0.14);
    rockMesh.setColorAt(idx, color);
  });
  rockMesh.receiveShadow = true;
  rockMesh.instanceMatrix.needsUpdate = true;
  if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
  rockMesh.computeBoundingSphere();
  group.add(rockMesh);

  // --- D. Graceful Tropical Coconut Palm Trees Framing the Golden Sandy Beach ---
  const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6445, roughness: 0.86, metalness: 0.02 });
  const palmFrondMat = new THREE.MeshStandardMaterial({
    color: 0x3b8a42,
    roughness: 0.62,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const coconutMat = new THREE.MeshStandardMaterial({ color: 0x624322, roughness: 0.72, metalness: 0.04 });
  const palmSegGeo = new THREE.CylinderGeometry(0.032, 0.044, 0.24, 6);
  const palmFrondGeo = new THREE.ConeGeometry(0.11, 0.56, 4);
  palmFrondGeo.scale(1.15, 1.0, 0.26);
  palmFrondGeo.translate(0, 0.28, 0);
  const coconutGeo = new THREE.SphereGeometry(0.036, 6, 5);
  disposables.push(palmTrunkMat, palmFrondMat, coconutMat, palmSegGeo, palmFrondGeo, coconutGeo);

  const palmSpecs: Array<{ z: number; inlandOffset: number; leanX: number; leanZ: number; scale: number }> = [
    { z: -3.15, inlandOffset: 0.92, leanX: 0.22, leanZ: 0.08, scale: 1.06 },
    { z: -2.05, inlandOffset: 1.08, leanX: 0.26, leanZ: -0.06, scale: 0.94 },
    { z: -1.05, inlandOffset: 0.98, leanX: 0.2, leanZ: 0.1, scale: 1.02 },
    { z: 1.55, inlandOffset: 0.95, leanX: 0.24, leanZ: -0.1, scale: 0.98 },
    { z: 3.35, inlandOffset: 0.86, leanX: 0.22, leanZ: -0.08, scale: 1.05 },
  ];

  palmSpecs.forEach((ps, idx) => {
    const px = coastlineX(ps.z) - ps.inlandOffset;
    if (isWetArea(px, ps.z)) return;
    const py = terrainHeightAt(px, ps.z);
    if (py < WATER_LEVEL + 0.06) return;

    const palm = new THREE.Group();
    palm.position.set(px, py - 0.03, ps.z);
    palm.scale.setScalar(ps.scale);

    // 4-segment gently curving coconut trunk leaning gracefully toward the ocean
    let curX = 0;
    let curY = 0;
    let curZ = 0;
    for (let seg = 0; seg < 4; seg++) {
      const segMesh = new THREE.Mesh(palmSegGeo, palmTrunkMat);
      const frac = (seg + 0.5) / 4;
      const sx = 1 - seg * 0.12;
      segMesh.scale.set(sx, 1, sx);
      segMesh.position.set(curX + ps.leanX * frac * 0.14, curY + 0.11, curZ + ps.leanZ * frac * 0.14);
      segMesh.rotation.z = -ps.leanX * (0.45 + frac * 0.65);
      segMesh.rotation.x = ps.leanZ * (0.45 + frac * 0.65);
      segMesh.castShadow = seg === 1;
      palm.add(segMesh);
      curX += ps.leanX * (0.06 + frac * 0.12);
      curY += 0.21;
      curZ += ps.leanZ * (0.06 + frac * 0.12);
    }

    // Crown of 7 radiating arched palm fronds + 3 coconuts
    const crown = new THREE.Group();
    crown.position.set(curX, curY + 0.02, curZ);
    for (let f = 0; f < 7; f++) {
      const angle = (f / 7) * Math.PI * 2 + idx * 0.5;
      const frond = new THREE.Mesh(palmFrondGeo, palmFrondMat);
      frond.rotation.order = 'YXZ';
      frond.rotation.y = angle;
      frond.rotation.x = 1.08 + (f % 2) * 0.18;
      crown.add(frond);
    }
    for (let cIdx = 0; cIdx < 3; cIdx++) {
      const ca = (cIdx / 3) * Math.PI * 2;
      const nut = new THREE.Mesh(coconutGeo, coconutMat);
      nut.position.set(Math.cos(ca) * 0.045, -0.025, Math.sin(ca) * 0.045);
      crown.add(nut);
    }
    palm.add(crown);
    group.add(palm);
  });

  return group;
}

/**
 * Builds composite miniature architectural details (Riverside Pendopo Gazebo, Coastal Pier,
 * and Moored Wooden Sailboat).
 */
function buildArchitecturalDetails(disposables: Array<{ dispose: () => void }>): {
  group: THREE.Group;
  boatGroup: THREE.Group;
  boatBasePos: THREE.Vector3;
  fishermanRig: FishermanRig;
} {
  const group = new THREE.Group();

  const teakMat = new THREE.MeshStandardMaterial({ color: 0x7c5032, roughness: 0.78, metalness: 0.04 });
  const terracottaRoofMat = new THREE.MeshStandardMaterial({ color: 0x9b4832, roughness: 0.65, metalness: 0.08 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8e8b82, roughness: 0.88, metalness: 0.05 });
  const goldFinialMat = new THREE.MeshStandardMaterial({ color: 0xe2be74, roughness: 0.22, metalness: 0.92 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x5c3622, roughness: 0.55, metalness: 0.08 });
  disposables.push(teakMat, terracottaRoofMat, stoneMat, goldFinialMat, sailMat, hullMat);

  const wallPlasterMat = new THREE.MeshStandardMaterial({
    color: 0xf4ecdd,
    roughness: 0.8,
    metalness: 0.02,
  });
  const windowGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffe4a0,
    emissive: 0xffbe55,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.08,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x4f301e,
    roughness: 0.72,
    metalness: 0.05,
  });
  disposables.push(wallPlasterMat, windowGlowMat, darkWoodMat);

  // Place the tropical village house on dry, elevated sunlit coastal meadow (far from the river!)
  const houseX = 0.45;
  const houseZ = 2.75;
  const sampleOffsets: Array<[number, number]> = [
    [0, 0],
    [-0.45, -0.4],
    [0.45, -0.4],
    [-0.45, 0.4],
    [0.45, 0.4],
  ];
  let maxGroundY = -Infinity;
  let minGroundY = Infinity;
  sampleOffsets.forEach(([ox, oz]) => {
    const gy = terrainHeightAt(houseX + ox, houseZ + oz);
    if (gy > maxGroundY) maxGroundY = gy;
    if (gy < minGroundY) minGroundY = gy;
  });

  // Ground floor sits cleanly above highest terrain corner; masonry skirt reaches well below lowest corner
  const floorY = Math.max(maxGroundY + 0.08, WATER_LEVEL + 0.35);
  const skirtHeight = Math.max(floorY - minGroundY + 0.38, 0.52);

  const house = new THREE.Group();
  house.position.set(houseX, floorY, houseZ);
  house.rotation.y = 0.32;

  // Solid stone masonry foundation skirt (prevents both sinking AND floating on slopes)
  const foundationGeo = new THREE.BoxGeometry(0.92, skirtHeight, 0.84);
  const verandaDeckGeo = new THREE.BoxGeometry(0.98, 0.07, 0.9);
  const frontStepGeo = new THREE.BoxGeometry(0.32, 0.08, 0.16);
  const houseBodyGeo = new THREE.BoxGeometry(0.68, 0.42, 0.58);
  const doorGeo = new THREE.BoxGeometry(0.16, 0.28, 0.04);
  const windowGeo = new THREE.BoxGeometry(0.14, 0.13, 0.04);
  const sideWindowGeo = new THREE.BoxGeometry(0.04, 0.13, 0.16);
  const pillarGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.42, 6);
  const lowerRoofGeo = new THREE.ConeGeometry(0.76, 0.25, 4);
  const upperRoofGeo = new THREE.ConeGeometry(0.42, 0.22, 4);
  const finialGeo = new THREE.ConeGeometry(0.032, 0.11, 5);
  disposables.push(
    foundationGeo,
    verandaDeckGeo,
    frontStepGeo,
    houseBodyGeo,
    doorGeo,
    windowGeo,
    sideWindowGeo,
    pillarGeo,
    lowerRoofGeo,
    upperRoofGeo,
    finialGeo
  );

  const foundation = new THREE.Mesh(foundationGeo, stoneMat);
  foundation.position.y = -skirtHeight / 2;
  foundation.receiveShadow = true;
  foundation.castShadow = true;

  const verandaDeck = new THREE.Mesh(verandaDeckGeo, teakMat);
  verandaDeck.position.y = 0.035;
  verandaDeck.receiveShadow = true;

  const frontStep = new THREE.Mesh(frontStepGeo, stoneMat);
  frontStep.position.set(0, -0.02, 0.49);
  frontStep.receiveShadow = true;

  const houseBody = new THREE.Mesh(houseBodyGeo, wallPlasterMat);
  houseBody.position.set(0, 0.28, -0.04);
  houseBody.castShadow = true;
  houseBody.receiveShadow = true;

  const frontDoor = new THREE.Mesh(doorGeo, darkWoodMat);
  frontDoor.position.set(0, 0.21, 0.255);

  const frontWinL = new THREE.Mesh(windowGeo, windowGlowMat);
  frontWinL.position.set(-0.21, 0.28, 0.255);
  const frontWinR = new THREE.Mesh(windowGeo, windowGlowMat);
  frontWinR.position.set(0.21, 0.28, 0.255);

  const sideWinL = new THREE.Mesh(sideWindowGeo, windowGlowMat);
  sideWinL.position.set(-0.345, 0.28, -0.04);
  const sideWinR = new THREE.Mesh(sideWindowGeo, windowGlowMat);
  sideWinR.position.set(0.345, 0.28, -0.04);

  house.add(
    foundation,
    verandaDeck,
    frontStep,
    houseBody,
    frontDoor,
    frontWinL,
    frontWinR,
    sideWinL,
    sideWinR
  );

  // Veranda wooden pillars
  const pillarOffsets: Array<[number, number]> = [
    [-0.41, 0.37],
    [0.41, 0.37],
    [-0.41, -0.37],
    [0.41, -0.37],
  ];
  pillarOffsets.forEach(([ox, oz]) => {
    const pillar = new THREE.Mesh(pillarGeo, teakMat);
    pillar.position.set(ox, 0.28, oz);
    house.add(pillar);
  });

  // Crisp Indonesian tiered terracotta joglo roof + golden finial
  const roof1 = new THREE.Mesh(lowerRoofGeo, terracottaRoofMat);
  roof1.position.y = 0.6;
  roof1.rotation.y = Math.PI / 4;
  roof1.castShadow = true;
  const roof2 = new THREE.Mesh(upperRoofGeo, terracottaRoofMat);
  roof2.position.y = 0.78;
  roof2.rotation.y = Math.PI / 4;
  const finial = new THREE.Mesh(finialGeo, goldFinialMat);
  finial.position.y = 0.93;
  house.add(roof1, roof2, finial);
  group.add(house);

  const pier = new THREE.Group();
  const deckGeo = new THREE.BoxGeometry(0.95, 0.045, 0.32);
  const pilingGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.72, 5);
  const bollardGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.08, 6);
  disposables.push(deckGeo, pilingGeo, bollardGeo);

  const deck = new THREE.Mesh(deckGeo, teakMat);
  deck.position.set(2.68, WATER_LEVEL + 0.12, 1.88);
  deck.receiveShadow = true;
  pier.add(deck);

  [2.28, 2.68, 3.08].forEach((px) => {
    [-0.13, 0.13].forEach((dz) => {
      const piling = new THREE.Mesh(pilingGeo, teakMat);
      piling.position.set(px, WATER_LEVEL - 0.18, 1.88 + dz);
      pier.add(piling);
    });
  });
  const bollard = new THREE.Mesh(bollardGeo, goldFinialMat);
  bollard.position.set(3.1, WATER_LEVEL + 0.18, 1.76);
  pier.add(bollard);
  group.add(pier);

  // --- Authentic Traditional Indonesian Wooden Fishing Boat (Perahu Nelayan) + Animated Fisherman Casting Net ---
  const boatGroup = new THREE.Group();
  const boatBasePos = new THREE.Vector3(4.95, WATER_LEVEL + 0.03, 1.05);
  boatGroup.position.copy(boatBasePos);
  boatGroup.rotation.y = -0.32;

  const boatBlueMat = new THREE.MeshStandardMaterial({
    color: 0x1c5c94,
    roughness: 0.48,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  const boatWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf7f5ef,
    roughness: 0.55,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const boatRedTrimMat = new THREE.MeshStandardMaterial({
    color: 0xc93b2b,
    roughness: 0.5,
    metalness: 0.05,
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd99e72, roughness: 0.62, metalness: 0.02 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xe65b36, roughness: 0.72, metalness: 0.02 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1f344d, roughness: 0.8, metalness: 0.02 });
  const capingMat = new THREE.MeshStandardMaterial({ color: 0xe2be74, roughness: 0.78, metalness: 0.02 });
  const basketMat = new THREE.MeshStandardMaterial({ color: 0x9b7242, roughness: 0.88, metalness: 0.02 });
  const silverFishMat = new THREE.MeshStandardMaterial({
    color: 0xcfe8f7,
    emissive: 0x3b7fa3,
    emissiveIntensity: 0.25,
    roughness: 0.22,
    metalness: 0.48,
  });
  const netWireMat = new THREE.MeshBasicMaterial({
    color: 0xf5eedb,
    wireframe: true,
    transparent: true,
    opacity: 0.9,
  });
  const netVeilMat = new THREE.MeshStandardMaterial({
    color: 0xeaf4fa,
    roughness: 0.8,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const leadWeightMat = new THREE.MeshStandardMaterial({ color: 0x3b4552, roughness: 0.5, metalness: 0.65 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xd8c39e, roughness: 0.85, metalness: 0.02 });
  disposables.push(
    boatBlueMat,
    boatWhiteMat,
    boatRedTrimMat,
    skinMat,
    shirtMat,
    pantsMat,
    capingMat,
    basketMat,
    silverFishMat,
    netWireMat,
    netVeilMat,
    leadWeightMat,
    ropeMat
  );

  // Sculpted double-ended traditional fishing boat hull (curved bow & stern sheer, hollow interior)
  const hullLen = 1.48;
  const hullStations = 16;
  const hullCols = 5; // port gunwale, port chine, keel, stbd chine, stbd gunwale
  const hPos: number[] = [];
  const hIdx: number[] = [];
  for (let i = 0; i <= hullStations; i++) {
    const u = (i / hullStations) * 2 - 1; // -1 stern .. +1 bow
    const x = u * (hullLen * 0.5);
    const beamFactor = Math.pow(Math.max(0, 1 - u * u), 0.68);
    const halfBeam = 0.27 * beamFactor;
    const sheerLift = u * u * 0.135; // classic upswept Nusantara prow & stern
    const keelLift = Math.pow(Math.abs(u), 2.4) * 0.16;

    const pts: Array<[number, number]> = [
      [0.145 + sheerLift, -halfBeam],
      [0.025 + keelLift * 0.55, -halfBeam * 0.72],
      [-0.075 + keelLift, 0],
      [0.025 + keelLift * 0.55, halfBeam * 0.72],
      [0.145 + sheerLift, halfBeam],
    ];
    for (let c = 0; c < hullCols; c++) {
      hPos.push(x, pts[c][0], pts[c][1]);
    }
    if (i < hullStations) {
      const rA = i * hullCols;
      const rB = (i + 1) * hullCols;
      for (let c = 0; c < hullCols - 1; c++) {
        hIdx.push(rA + c, rA + c + 1, rB + c, rB + c, rA + c + 1, rB + c + 1);
      }
    }
  }
  const loftedHullGeo = new THREE.BufferGeometry();
  loftedHullGeo.setAttribute('position', new THREE.Float32BufferAttribute(hPos, 3));
  loftedHullGeo.setIndex(hIdx);
  loftedHullGeo.computeVertexNormals();
  disposables.push(loftedHullGeo);

  const hullOuter = new THREE.Mesh(loftedHullGeo, boatBlueMat);
  hullOuter.castShadow = true;
  hullOuter.receiveShadow = true;
  boatGroup.add(hullOuter);

  // Crisp white upper hull side accent & red sheer trim rails following the curved gunwales
  const portPts: THREE.Vector3[] = [];
  const stbdPts: THREE.Vector3[] = [];
  const whitePortPts: THREE.Vector3[] = [];
  const whiteStbdPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const u = (i / 14) * 2 - 1;
    const x = u * (hullLen * 0.5);
    const halfBeam = 0.27 * Math.pow(Math.max(0, 1 - u * u), 0.68);
    const sheerLift = u * u * 0.135;
    portPts.push(new THREE.Vector3(x, 0.15 + sheerLift, -halfBeam));
    stbdPts.push(new THREE.Vector3(x, 0.15 + sheerLift, halfBeam));
    whitePortPts.push(new THREE.Vector3(x, 0.1 + sheerLift * 0.85, -halfBeam * 0.94));
    whiteStbdPts.push(new THREE.Vector3(x, 0.1 + sheerLift * 0.85, halfBeam * 0.94));
  }
  const portRailGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(portPts), 16, 0.02, 5, false);
  const stbdRailGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stbdPts), 16, 0.02, 5, false);
  const whitePortGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(whitePortPts), 16, 0.026, 5, false);
  const whiteStbdGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(whiteStbdPts), 16, 0.026, 5, false);
  const floorGeo = new THREE.BoxGeometry(0.92, 0.025, 0.34);
  const benchGeo = new THREE.BoxGeometry(0.11, 0.024, 0.44);
  const stemPostGeo = new THREE.CylinderGeometry(0.018, 0.028, 0.22, 6);
  const basketGeo = new THREE.CylinderGeometry(0.115, 0.082, 0.13, 8);
  const oarShaftGeo = new THREE.CylinderGeometry(0.011, 0.013, 0.86, 5);
  const oarBladeGeo = new THREE.BoxGeometry(0.02, 0.22, 0.085);
  const caughtFishGeo = new THREE.SphereGeometry(0.036, 7, 5);
  caughtFishGeo.scale(1.8, 0.72, 0.55);
  disposables.push(
    portRailGeo,
    stbdRailGeo,
    whitePortGeo,
    whiteStbdGeo,
    floorGeo,
    benchGeo,
    stemPostGeo,
    basketGeo,
    oarShaftGeo,
    oarBladeGeo,
    caughtFishGeo
  );

  boatGroup.add(
    new THREE.Mesh(portRailGeo, boatRedTrimMat),
    new THREE.Mesh(stbdRailGeo, boatRedTrimMat),
    new THREE.Mesh(whitePortGeo, boatWhiteMat),
    new THREE.Mesh(whiteStbdGeo, boatWhiteMat)
  );

  const floorBoard = new THREE.Mesh(floorGeo, teakMat);
  floorBoard.position.set(0, 0.035, 0);
  floorBoard.receiveShadow = true;
  boatGroup.add(floorBoard);

  // Wooden cross benches (thwarts)
  [-0.36, 0.0, 0.34].forEach((bx, idx) => {
    const bench = new THREE.Mesh(benchGeo, teakMat);
    bench.position.set(bx, 0.115 + (idx === 1 ? 0 : 0.015), 0);
    bench.scale.z = idx === 1 ? 1.05 : 0.82;
    boatGroup.add(bench);
  });

  // Classic raised bow & stern wooden posts (linggi perahu)
  const bowPost = new THREE.Mesh(stemPostGeo, teakMat);
  bowPost.position.set(hullLen * 0.5 - 0.01, 0.32, 0);
  bowPost.rotation.z = -0.28;
  const sternPost = new THREE.Mesh(stemPostGeo, teakMat);
  sternPost.position.set(-hullLen * 0.5 + 0.01, 0.3, 0);
  sternPost.rotation.z = 0.25;
  boatGroup.add(bowPost, sternPost);

  // Woven fish basket at stern filled with fresh shimmering catch + wooden oar
  const basket = new THREE.Mesh(basketGeo, basketMat);
  basket.position.set(-0.28, 0.11, -0.02);
  boatGroup.add(basket);
  [
    [-0.31, 0.18, -0.04, 0.4],
    [-0.25, 0.185, 0.01, -0.5],
    [-0.28, 0.19, -0.01, 1.1],
  ].forEach(([fx, fy, fz, rot]) => {
    const f = new THREE.Mesh(caughtFishGeo, silverFishMat);
    f.position.set(fx, fy, fz);
    f.rotation.y = rot;
    boatGroup.add(f);
  });

  const oarGroup = new THREE.Group();
  oarGroup.position.set(-0.42, 0.18, 0.14);
  oarGroup.rotation.set(0.35, 0.25, 1.32);
  const oarShaft = new THREE.Mesh(oarShaftGeo, teakMat);
  const oarBlade = new THREE.Mesh(oarBladeGeo, teakMat);
  oarBlade.position.y = -0.36;
  oarGroup.add(oarShaft, oarBlade);
  boatGroup.add(oarGroup);

  // --- Articulated Fisherman Character standing near bow, actively casting & hauling net ---
  const fishermanRoot = new THREE.Group();
  fishermanRoot.position.set(0.22, 0.05, 0.0);
  boatGroup.add(fishermanRoot);

  const legGeo = new THREE.CylinderGeometry(0.032, 0.026, 0.24, 6);
  const torsoGeo = new THREE.CylinderGeometry(0.068, 0.056, 0.22, 8);
  const headGeo = new THREE.SphereGeometry(0.062, 10, 8);
  const capingGeo = new THREE.ConeGeometry(0.165, 0.095, 12);
  const armGeo = new THREE.CylinderGeometry(0.024, 0.02, 0.21, 6);
  armGeo.translate(0, -0.095, 0);
  const handGeo = new THREE.SphereGeometry(0.024, 6, 5);
  disposables.push(legGeo, torsoGeo, headGeo, capingGeo, armGeo, handGeo);

  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(0.02, 0.12, -0.055);
  leftLeg.rotation.x = 0.08;
  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(-0.02, 0.12, 0.055);
  rightLeg.rotation.x = -0.08;
  fishermanRoot.add(leftLeg, rightLeg);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.23, 0);
  fishermanRoot.add(torsoPivot);

  const torsoMesh = new THREE.Mesh(torsoGeo, shirtMat);
  torsoMesh.position.y = 0.11;
  torsoMesh.castShadow = true;
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.position.y = 0.275;
  const capingHat = new THREE.Mesh(capingGeo, capingMat);
  capingHat.position.set(0, 0.345, 0);
  capingHat.castShadow = true;
  torsoPivot.add(torsoMesh, headMesh, capingHat);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(0.02, 0.195, -0.082);
  const lArmMesh = new THREE.Mesh(armGeo, skinMat);
  const lHand = new THREE.Mesh(handGeo, skinMat);
  lHand.position.y = -0.19;
  leftArmPivot.add(lArmMesh, lHand);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.02, 0.195, 0.082);
  const rArmMesh = new THREE.Mesh(armGeo, skinMat);
  const rHand = new THREE.Mesh(handGeo, skinMat);
  rHand.position.y = -0.19;
  rightArmPivot.add(rArmMesh, rHand);

  torsoPivot.add(leftArmPivot, rightArmPivot);

  // --- Animated Circular Cast Fishing Net (Jala Ikan) + Lead Sinkers + Haul Rope + Water Splash ---
  const netGroup = new THREE.Group();
  const netConeGeo = new THREE.ConeGeometry(0.56, 0.42, 16, 4, true);
  netConeGeo.translate(0, -0.21, 0);
  const netVeilGeo = new THREE.ConeGeometry(0.55, 0.41, 16, 1, true);
  netVeilGeo.translate(0, -0.21, 0);
  const weightGeo = new THREE.SphereGeometry(0.017, 5, 4);
  const ropeGeo = new THREE.CylinderGeometry(0.007, 0.007, 1.0, 5);
  const splashGeo = new THREE.RingGeometry(0.24, 0.56, 20);
  splashGeo.rotateX(-Math.PI / 2);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  disposables.push(netConeGeo, netVeilGeo, weightGeo, ropeGeo, splashGeo, splashMat);

  netGroup.add(new THREE.Mesh(netConeGeo, netWireMat), new THREE.Mesh(netVeilGeo, netVeilMat));
  for (let w = 0; w < 10; w++) {
    const a = (w / 10) * Math.PI * 2;
    const sinker = new THREE.Mesh(weightGeo, leadWeightMat);
    sinker.position.set(Math.cos(a) * 0.56, -0.42, Math.sin(a) * 0.56);
    netGroup.add(sinker);
  }

  // Shimmering fish caught inside the hauling net
  const caughtFishGroup = new THREE.Group();
  caughtFishGroup.position.set(0, -0.26, 0);
  const cf1 = new THREE.Mesh(caughtFishGeo, silverFishMat);
  cf1.position.set(0.07, 0.0, 0.04);
  cf1.rotation.y = 0.6;
  const cf2 = new THREE.Mesh(caughtFishGeo, silverFishMat);
  cf2.position.set(-0.06, -0.02, -0.05);
  cf2.rotation.y = -0.8;
  caughtFishGroup.add(cf1, cf2);
  caughtFishGroup.visible = false;
  netGroup.add(caughtFishGroup);

  const ropeMesh = new THREE.Mesh(ropeGeo, ropeMat);
  const splashRing = new THREE.Mesh(splashGeo, splashMat);
  splashRing.position.set(1.35, 0.01, 0.62);
  splashRing.renderOrder = 6;

  boatGroup.add(netGroup, ropeMesh, splashRing);
  group.add(boatGroup);

  const fishermanRig: FishermanRig = {
    torsoPivot,
    leftArmPivot,
    rightArmPivot,
    netGroup,
    caughtFishGroup,
    ropeMesh,
    splashRing,
    splashMat,
    handAnchorLocal: new THREE.Vector3(0.36, 0.42, 0.14),
  };

  return { group, boatGroup, boatBasePos, fishermanRig };
}

/**
 * Builds 3 sculpted multi-lobe volumetric Cumulus Cloud clusters.
 * Uses smooth lightweight SphereGeometry(1, 12, 9) (~85% fewer triangles than Icosahedron detail=3)
 * and avoids casting 30 expensive shadow-map draw calls.
 */
function buildCloudFormations(disposables: Array<{ dispose: () => void }>): {
  group: THREE.Group;
  clouds: CloudCluster[];
  lightningLight: THREE.PointLight;
} {
  const group = new THREE.Group();
  const clouds: CloudCluster[] = [];

  const lobeGeo = new THREE.SphereGeometry(1, 12, 9);
  disposables.push(lobeGeo);

  const configs: Array<{
    pos: [number, number, number];
    scale: number;
    role: 'condensation' | 'transit' | 'storm';
    phase: number;
  }> = [
    { pos: [2.2, 6.75, -0.35], scale: 0.94, role: 'condensation', phase: 0.0 },
    { pos: [-0.25, 7.2, -0.85], scale: 1.04, role: 'transit', phase: 2.1 },
    { pos: [-3.05, 7.35, -0.75], scale: 1.26, role: 'storm', phase: 4.2 },
  ];

  const lobeSpecs: Array<[number, number, number, number, number, number]> = [
    [0.0, 0.18, 0.0, 0.85, 0.56, 0.72],
    [-0.78, 0.02, 0.12, 0.64, 0.45, 0.58],
    [0.82, 0.0, -0.08, 0.68, 0.46, 0.56],
    [-0.36, 0.44, -0.1, 0.58, 0.48, 0.54],
    [0.42, 0.42, 0.14, 0.55, 0.46, 0.52],
    [0.02, 0.55, 0.04, 0.52, 0.44, 0.5],
    [-1.22, -0.08, -0.06, 0.46, 0.34, 0.44],
    [1.26, -0.06, 0.08, 0.48, 0.34, 0.44],
    [-0.25, -0.08, 0.48, 0.54, 0.35, 0.42],
    [0.32, -0.06, -0.46, 0.52, 0.35, 0.42],
  ];

  configs.forEach((cfg) => {
    const clusterGroup = new THREE.Group();
    clusterGroup.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    clusterGroup.scale.setScalar(cfg.scale);

    const materials: THREE.MeshStandardMaterial[] = [];
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x45668c,
      emissiveIntensity: 0.1,
      roughness: 0.86,
      metalness: 0.0,
      transparent: true,
      opacity: 0.96,
    });
    const underMat = new THREE.MeshStandardMaterial({
      color: 0xb6cde3,
      emissive: 0x3b587a,
      emissiveIntensity: 0.14,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.95,
    });
    disposables.push(baseMat, underMat);
    materials.push(baseMat, underMat);

    lobeSpecs.forEach(([lx, ly, lz, sx, sy, sz], idx) => {
      const mesh = new THREE.Mesh(lobeGeo, ly < 0.05 ? underMat : baseMat);
      mesh.position.set(lx, ly, lz);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.y = idx * 0.6;
      clusterGroup.add(mesh);
    });

    group.add(clusterGroup);
    clouds.push({
      group: clusterGroup,
      basePos: new THREE.Vector3(...cfg.pos),
      baseScale: cfg.scale,
      phase: cfg.phase,
      materials,
      role: cfg.role,
    });
  });

  const lightningLight = new THREE.PointLight(0xbbe6ff, 0, 9.5, 1.7);
  lightningLight.position.set(-3.05, 6.95, -0.75);
  group.add(lightningLight);

  return { group, clouds, lightningLight };
}

function buildInteractableProxies(disposables: Array<{ dispose: () => void }>): THREE.Mesh[] {
  const proxies: THREE.Mesh[] = [];
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  disposables.push(proxyMat);

  const specs: Array<{
    stageId: WaterCycleStageId;
    pos: [number, number, number];
    size: [number, number, number];
  }> = [
    { stageId: 'evaporasi', pos: [5.25, 0.5, 0.1], size: [6.4, 1.6, 7.6] },
    { stageId: 'evaporasi', pos: [5.95, 9.65, -2.55], size: [3.0, 3.0, 3.0] },
    { stageId: 'transpirasi', pos: [-1.1, 1.85, 1.5], size: [3.5, 2.2, 3.8] },
    { stageId: 'kondensasi', pos: [0.85, 7.0, -0.6], size: [4.2, 2.2, 2.8] },
    { stageId: 'presipitasi', pos: [-3.05, 5.8, -0.65], size: [3.9, 4.8, 4.2] },
    { stageId: 'infiltrasi', pos: [0.5, -0.8, 3.6], size: [11.2, 2.6, 1.9] },
  ];

  specs.forEach((s) => {
    const geo = new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, proxyMat);
    mesh.position.set(...s.pos);
    mesh.layers.set(1);
    mesh.userData.stageId = s.stageId;
    proxies.push(mesh);
  });

  return proxies;
}

/**
 * Builds a lightweight procedural sky-blue gradient dome (1 draw call, zero textures)
 * transitioning from rich cerulean zenith to luminous sky-blue horizon so bright white clouds,
 * vapor mist, and 3D terrain silhouettes stand out vividly without harsh glare.
 */
function buildSkyDome(disposables: Array<{ dispose: () => void }>): {
  mesh: THREE.Mesh;
  skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
  };
} {
  const skyUniforms = {
    uTopColor: { value: new THREE.Color(0x2c82cf) },
    uHorizonColor: { value: new THREE.Color(0xbce3fc) },
  };

  const geo = new THREE.SphereGeometry(72, 16, 12);
  const mat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      varying vec3 vWorldDir;
      void main() {
        float h = clamp(vWorldDir.y, 0.0, 1.0);
        float factor = pow(h, 0.56);
        vec3 col = mix(uHorizonColor, uTopColor, factor);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  disposables.push(geo, mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, skyUniforms };
}

export function buildLuxuryDiorama(textures: ProceduralTextureSet): BuiltDiorama {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const waterUniforms: WaterShaderUniforms = {
    uTime: { value: 0 },
    uWaveAmp: { value: 0.052 },
    uEvapGlow: { value: 0.32 },
    uInfilGlow: { value: 0.28 },
    uSunDir: { value: new THREE.Vector3(10.5, 13.5, 5.5).normalize() },
  };

  const { mesh: skyDome, skyUniforms } = buildSkyDome(disposables);
  const terrainSurface = buildTerrainSurface(textures, disposables);
  const cutawayWalls = buildCutawayWalls(textures, disposables);
  const { group: pedestal, studioFloorMat } = buildMuseumPedestal(textures, disposables);
  const { group: aquiferGroup, aquiferGlowMaterial } = buildAquiferCutaway(
    waterUniforms,
    disposables
  );
  const { group: waterGroup, oceanMaterial, oceanUniforms, riverMaterial, waterfallMaterial } =
    buildWaterBodies(textures, waterUniforms, disposables);
  const {
    sunGroup,
    sunUniforms,
    sunInnerFlare,
    sunInnerFlareMat,
    sunOuterAura,
    sunOuterAuraMat,
    sunHaloMat,
    sunBeamMat,
  } = buildHeroSun(textures, disposables);
  const floraAndRocks = buildFloraAndRocks(disposables);
  const { group: archGroup, boatGroup, boatBasePos, fishermanRig } =
    buildArchitecturalDetails(disposables);
  const { group: cloudGroup, clouds, lightningLight } = buildCloudFormations(disposables);
  const interactableProxies = buildInteractableProxies(disposables);

  root.add(
    skyDome,
    pedestal,
    terrainSurface,
    cutawayWalls,
    aquiferGroup,
    waterGroup,
    sunGroup,
    floraAndRocks,
    archGroup,
    cloudGroup,
    ...interactableProxies
  );

  return {
    root,
    skyUniforms,
    studioFloorMat,
    sunGroup,
    sunUniforms,
    sunInnerFlare,
    sunInnerFlareMat,
    sunOuterAura,
    sunOuterAuraMat,
    sunHaloMat,
    sunBeamMat,
    clouds,
    lightningLight,
    oceanMaterial,
    oceanUniforms,
    riverMaterial,
    waterfallMaterial,
    aquiferGlowMaterial,
    boatGroup,
    boatBasePos,
    fishermanRig,
    interactableProxies,
    disposables,
  };
}
