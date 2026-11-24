import * as THREE from 'three';
import { WaterCycleStageId } from '../data/waterCycleData';
import { ProceduralTextureSet } from './proceduralTextures';
import {
  BASE_BOTTOM_Y,
  DIORAMA_HALF_X,
  DIORAMA_HALF_Z,
  WATER_LEVEL,
  isWetArea,
  riverCenterZ,
  riverHalfWidth,
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

export interface BuiltDiorama {
  root: THREE.Group;
  skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
  };
  studioFloorMat: THREE.MeshStandardMaterial;
  sunGroup: THREE.Group;
  sunRaysGroup: THREE.Group;
  sunBeamMat: THREE.MeshBasicMaterial;
  sunCoreMat: THREE.MeshStandardMaterial;
  clouds: CloudCluster[];
  lightningLight: THREE.PointLight;
  oceanMaterial: THREE.MeshStandardMaterial;
  oceanUniforms: WaterShaderUniforms;
  riverMaterial: THREE.MeshStandardMaterial;
  waterfallMaterial: THREE.MeshStandardMaterial;
  aquiferGlowMaterial: THREE.MeshStandardMaterial;
  boatGroup: THREE.Group;
  boatBasePos: THREE.Vector3;
  interactableProxies: THREE.Mesh[];
  disposables: Array<{ dispose: () => void }>;
}

/**
 * Builds the top terrain surface mesh (optimized 64x48 grid: crisp ridges, 66% fewer triangles).
 */
function buildTerrainSurface(
  textures: ProceduralTextureSet,
  disposables: Array<{ dispose: () => void }>
): THREE.Mesh {
  const segX = 64;
  const segZ = 48;
  const geo = new THREE.PlaneGeometry(DIORAMA_HALF_X * 2, DIORAMA_HALF_Z * 2, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  const cOceanBed = new THREE.Color(0x133348);
  const cSand = new THREE.Color(0xd2be97);
  const cMeadow = new THREE.Color(0x3f7b4c);
  const cForest = new THREE.Color(0x28563c);
  const cAlpineRock = new THREE.Color(0x5a616b);
  const cSnow = new THREE.Color(0xebf1f7);
  const cRiverStone = new THREE.Color(0x4b5c66);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeightAt(x, z);
    pos.setY(i, h);

    const grain = Math.sin(x * 3.1 + z * 2.7) * 0.04;
    const distRiver = Math.abs(z - riverCenterZ(x));
    const inRiver = x > -3.7 && x < 2.2 && distRiver < riverHalfWidth(x) * 1.05;

    if (h < -0.25) {
      c.copy(cOceanBed).lerp(cSand, THREE.MathUtils.clamp((h + 1.1) / 0.85, 0, 1));
    } else if (inRiver) {
      c.copy(cRiverStone).lerp(cSand, 0.25);
    } else if (h < 0.22) {
      c.copy(cSand).lerp(cMeadow, THREE.MathUtils.smoothstep(h, -0.05, 0.22));
    } else if (h < 1.55) {
      c.copy(cMeadow).lerp(cForest, THREE.MathUtils.smoothstep(h, 0.22, 1.45));
    } else if (h < 3.05) {
      c.copy(cForest).lerp(cAlpineRock, THREE.MathUtils.smoothstep(h, 1.55, 2.95));
    } else {
      c.copy(cAlpineRock).lerp(cSnow, THREE.MathUtils.smoothstep(h, 3.05, 3.85));
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
      64,
      (t) => [THREE.MathUtils.lerp(-DIORAMA_HALF_X, DIORAMA_HALF_X, t), DIORAMA_HALF_Z],
      false
    ),
    makeEdgeWall(
      64,
      (t) => [THREE.MathUtils.lerp(-DIORAMA_HALF_X, DIORAMA_HALF_X, t), -DIORAMA_HALF_Z],
      true
    ),
    makeEdgeWall(
      48,
      (t) => [-DIORAMA_HALF_X, THREE.MathUtils.lerp(-DIORAMA_HALF_Z, DIORAMA_HALF_Z, t)],
      false
    ),
    makeEdgeWall(
      48,
      (t) => [DIORAMA_HALF_X, THREE.MathUtils.lerp(-DIORAMA_HALF_Z, DIORAMA_HALF_Z, t)],
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

  const w = DIORAMA_HALF_X * 2;
  const d = DIORAMA_HALF_Z * 2;

  const plinthGeo = new THREE.BoxGeometry(w + 0.36, 0.56, d + 0.36);
  const subPlinthGeo = new THREE.BoxGeometry(w + 0.72, 0.24, d + 0.72);
  disposables.push(plinthGeo, subPlinthGeo);

  const plinth = new THREE.Mesh(plinthGeo, obsidianMat);
  plinth.position.y = BASE_BOTTOM_Y - 0.28;
  plinth.receiveShadow = true;

  const subPlinth = new THREE.Mesh(subPlinthGeo, obsidianMat);
  subPlinth.position.y = BASE_BOTTOM_Y - 0.68;
  subPlinth.receiveShadow = true;
  group.add(plinth, subPlinth);

  const railH = 0.11;
  const railThick = 0.12;
  const frontRailGeo = new THREE.BoxGeometry(w + 0.44, railH, railThick);
  const sideRailGeo = new THREE.BoxGeometry(railThick, railH, d + 0.44);
  disposables.push(frontRailGeo, sideRailGeo);

  const yTrim = BASE_BOTTOM_Y + 0.02;
  const rFront = new THREE.Mesh(frontRailGeo, champagneGoldMat);
  rFront.position.set(0, yTrim, DIORAMA_HALF_Z + 0.16);
  const rBack = new THREE.Mesh(frontRailGeo, champagneGoldMat);
  rBack.position.set(0, yTrim, -DIORAMA_HALF_Z - 0.16);
  const rLeft = new THREE.Mesh(sideRailGeo, champagneGoldMat);
  rLeft.position.set(-DIORAMA_HALF_X - 0.16, yTrim, 0);
  const rRight = new THREE.Mesh(sideRailGeo, champagneGoldMat);
  rRight.position.set(DIORAMA_HALF_X + 0.16, yTrim, 0);
  group.add(rFront, rBack, rLeft, rRight);

  const lowerFrontGeo = new THREE.BoxGeometry(w + 0.76, 0.05, 0.06);
  const lowerSideGeo = new THREE.BoxGeometry(0.06, 0.05, d + 0.76);
  disposables.push(lowerFrontGeo, lowerSideGeo);
  const yLow = BASE_BOTTOM_Y - 0.56;
  const lf = new THREE.Mesh(lowerFrontGeo, champagneGoldMat);
  lf.position.set(0, yLow, DIORAMA_HALF_Z + 0.35);
  const lb = new THREE.Mesh(lowerFrontGeo, champagneGoldMat);
  lb.position.set(0, yLow, -DIORAMA_HALF_Z - 0.35);
  const ll = new THREE.Mesh(lowerSideGeo, champagneGoldMat);
  ll.position.set(-DIORAMA_HALF_X - 0.35, yLow, 0);
  const lr = new THREE.Mesh(lowerSideGeo, champagneGoldMat);
  lr.position.set(DIORAMA_HALF_X + 0.35, yLow, 0);
  group.add(lf, lb, ll, lr);

  const cornerGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.62, 6);
  const capGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.08, 6);
  disposables.push(cornerGeo, capGeo);

  const corners: Array<[number, number]> = [
    [-DIORAMA_HALF_X - 0.18, -DIORAMA_HALF_Z - 0.18],
    [DIORAMA_HALF_X + 0.18, -DIORAMA_HALF_Z - 0.18],
    [-DIORAMA_HALF_X - 0.18, DIORAMA_HALF_Z + 0.18],
    [DIORAMA_HALF_X + 0.18, DIORAMA_HALF_Z + 0.18],
  ];
  corners.forEach(([cx, cz]) => {
    const col = new THREE.Mesh(cornerGeo, darkBronzeMat);
    col.position.set(cx, BASE_BOTTOM_Y - 0.25, cz);
    const cap = new THREE.Mesh(capGeo, champagneGoldMat);
    cap.position.set(cx, BASE_BOTTOM_Y + 0.08, cz);
    group.add(col, cap);
  });

  const plaqueGeo = new THREE.BoxGeometry(2.6, 0.22, 0.07);
  disposables.push(plaqueGeo);
  const plaque = new THREE.Mesh(plaqueGeo, champagneGoldMat);
  plaque.position.set(0, BASE_BOTTOM_Y - 0.28, DIORAMA_HALF_Z + 0.2);
  group.add(plaque);

  // Soft Radial Contact Shadow Plane grounding the pedestal to bright sky-misted studio floor
  const shadowGeo = new THREE.PlaneGeometry(18.5, 14.5);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.36,
  });
  disposables.push(shadowGeo, shadowMat);
  const contactShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadowMesh.position.y = BASE_BOTTOM_Y - 0.79;
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
  const glassGeo = new THREE.PlaneGeometry(DIORAMA_HALF_X * 2 - 0.04, 2.2);
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
  frontGlass.position.set(0, -1.06, DIORAMA_HALF_Z + 0.08);
  frontGlass.renderOrder = 6;
  group.add(frontGlass);

  const rightWaterWallGeo = new THREE.PlaneGeometry(DIORAMA_HALF_Z * 2 - 0.04, 1.32);
  rightWaterWallGeo.rotateY(Math.PI / 2);
  const frontWaterVolGeo = new THREE.PlaneGeometry(3.85, 1.32);
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
  rightWaterWall.position.set(DIORAMA_HALF_X + 0.01, -0.66, 0);
  rightWaterWall.renderOrder = 5;

  const frontWaterVol = new THREE.Mesh(frontWaterVolGeo, oceanSideMat);
  frontWaterVol.position.set(3.56, -0.66, DIORAMA_HALF_Z + 0.015);
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

  // Optimized 36x28 ocean surface (70% fewer triangles, identically smooth vertex waves)
  const oceanGeo = new THREE.PlaneGeometry(DIORAMA_HALF_X * 2 - 0.06, DIORAMA_HALF_Z * 2 - 0.06, 36, 28);
  oceanGeo.rotateX(-Math.PI / 2);
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

  oceanMaterial.customProgramCacheKey = () => 'ocean-luxury-shimmer-v1';
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
        varying vec3 vWaterWorldPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float w1 = sin(transformed.x * 1.45 + uTime * 1.65) * cos(transformed.z * 1.15 - uTime * 1.1);
        float w2 = sin(transformed.x * 2.8 - transformed.z * 2.2 + uTime * 2.4) * 0.45;
        transformed.y += (w1 + w2) * uWaveAmp;
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
        varying vec3 vWaterWorldPos;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 wViewDir = normalize(cameraPosition - vWaterWorldPos);
        // Animated analytic micro-wave normal for crisp sky reflections & solar glitter
        float nx = cos(vWaterWorldPos.x * 2.4 + uTime * 1.8) * 0.11 + cos(vWaterWorldPos.x * 5.2 - vWaterWorldPos.z * 3.6 + uTime * 2.9) * 0.065;
        float nz = sin(vWaterWorldPos.z * 2.1 - uTime * 1.5) * 0.11 + sin(vWaterWorldPos.z * 4.7 + vWaterWorldPos.x * 3.1 - uTime * 2.5) * 0.065;
        vec3 wNorm = normalize(vec3(-nx, 1.0, -nz));

        // 1. Luxury Fresnel sky reflection sheen
        float fresnel = pow(1.0 - max(dot(wViewDir, wNorm), 0.0), 3.0);
        vec3 skySheen = vec3(0.42, 0.78, 1.0) * fresnel * (0.28 + uEvapGlow * 0.24 + uInfilGlow * 0.22);

        // 2. Dynamic Evaporasi solar specular glitter & sunlit golden caustics
        vec3 sunHalf = normalize(uSunDir + wViewDir);
        float sunSpec = pow(max(dot(wNorm, sunHalf), 0.0), 38.0);
        float c1 = sin(vWaterWorldPos.x * 3.6 + uTime * 2.2) * cos(vWaterWorldPos.z * 3.2 - uTime * 1.7);
        float c2 = sin((vWaterWorldPos.x - vWaterWorldPos.z) * 4.8 - uTime * 2.8);
        float causticNet = pow(clamp(0.52 + 0.35 * c1 + 0.25 * c2, 0.0, 1.0), 4.0);
        float eastMask = smoothstep(0.9, 4.4, vWaterWorldPos.x);
        vec3 evapGold = vec3(1.0, 0.85, 0.46) * (sunSpec * 0.95 + causticNet * 0.55 * eastMask) * (0.18 + uEvapGlow * 1.15);

        // 3. Dynamic Infiltrasi coastal turquoise subsurface glow & caustic ripple
        float coastMask = smoothstep(4.9, 1.5, vWaterWorldPos.x);
        float infilPulse = pow(clamp(0.5 + 0.5 * sin(vWaterWorldPos.x * 3.4 - uTime * 2.5 + c1 * 2.0), 0.0, 1.0), 3.0);
        vec3 infilAqua = vec3(0.16, 0.92, 1.0) * (causticNet * 0.52 + infilPulse * 0.38) * coastMask * (0.12 + uInfilGlow * 1.05);

        totalEmissiveRadiance += skySheen + evapGold + infilAqua;`
      );
  };
  disposables.push(oceanMaterial);

  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMaterial);
  oceanMesh.position.y = WATER_LEVEL;
  oceanMesh.receiveShadow = true;
  oceanMesh.renderOrder = 3;
  group.add(oceanMesh);

  // Sculpted Winding Mountain River Ribbon (44 steps)
  const riverSteps = 44;
  const rPositions: number[] = [];
  const rUvs: number[] = [];
  const rIndices: number[] = [];

  for (let i = 0; i <= riverSteps; i++) {
    const t = i / riverSteps;
    const x = THREE.MathUtils.lerp(-3.45, 2.05, t);
    const cz = riverCenterZ(x);
    const hw = riverHalfWidth(x) * 0.78;
    const wy = riverWaterSurfaceY(x);

    rPositions.push(x, wy, cz - hw);
    rUvs.push(0, t * 5.0);
    rPositions.push(x, wy, cz + hw);
    rUvs.push(1, t * 5.0);

    if (i < riverSteps) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      rIndices.push(a, b, c, c, b, d);
    }
  }

  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPositions, 3));
  riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rUvs, 2));
  riverGeo.setIndex(rIndices);
  riverGeo.computeVertexNormals();
  disposables.push(riverGeo);

  const riverMaterial = new THREE.MeshStandardMaterial({
    color: 0x2292be,
    emissive: 0x093147,
    emissiveIntensity: 0.28,
    roughness: 0.12,
    metalness: 0.16,
    envMapIntensity: 1.4,
    bumpMap: textures.waterNormalBump,
    bumpScale: 0.038,
    transparent: true,
    opacity: 0.92,
  });
  riverMaterial.customProgramCacheKey = () => 'river-luxury-flow-v1';
  riverMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.uniforms.uEvapGlow = oceanUniforms.uEvapGlow;
    shader.uniforms.uInfilGlow = oceanUniforms.uInfilGlow;
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
        uniform float uEvapGlow;
        uniform float uInfilGlow;
        varying vec3 vWaterWorldPos;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float flow1 = sin(vWaterWorldPos.x * 5.2 - uTime * 4.4 + vWaterWorldPos.z * 3.8);
        float flow2 = cos(vWaterWorldPos.x * 8.4 - uTime * 6.2 - vWaterWorldPos.z * 5.2);
        float streamGlint = pow(clamp(0.5 + 0.35 * flow1 + 0.25 * flow2, 0.0, 1.0), 3.6);
        vec3 riverShine = vec3(0.48, 0.94, 1.0) * streamGlint * (0.22 + uInfilGlow * 0.95);
        riverShine += vec3(1.0, 0.88, 0.56) * pow(streamGlint, 2.0) * uEvapGlow * 0.55;
        totalEmissiveRadiance += riverShine;`
      );
  };
  disposables.push(riverMaterial);

  const riverMesh = new THREE.Mesh(riverGeo, riverMaterial);
  riverMesh.receiveShadow = true;
  riverMesh.renderOrder = 4;
  group.add(riverMesh);

  const wfZ = riverCenterZ(-1.12);
  const waterfallMaterial = new THREE.MeshStandardMaterial({
    color: 0xdff6ff,
    emissive: 0x5ab7d6,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.0,
    transparent: true,
    opacity: 0.68,
  });
  disposables.push(waterfallMaterial);

  const foamGeo = new THREE.DodecahedronGeometry(0.24, 0);
  disposables.push(foamGeo);
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(foamGeo, waterfallMaterial);
    const angle = (i / 5) * Math.PI * 2;
    puff.position.set(
      -1.08 + Math.cos(angle) * 0.24,
      0.24 + (i % 2) * 0.08,
      wfZ + Math.sin(angle) * 0.3
    );
    puff.scale.set(1.1 + (i % 3) * 0.2, 0.55, 1.0);
    group.add(puff);
  }

  return { group, oceanMaterial, oceanUniforms, riverMaterial, waterfallMaterial };
}

/**
 * Builds the Composite Hero Celestial Sun Assembly (core, brushed gold rings,
 * 12 sculpted brass solar fins, translucent halo, and Evaporation sunbeam cone).
 */
function buildHeroSun(disposables: Array<{ dispose: () => void }>): {
  sunGroup: THREE.Group;
  sunRaysGroup: THREE.Group;
  sunBeamMat: THREE.MeshBasicMaterial;
  sunCoreMat: THREE.MeshStandardMaterial;
} {
  const sunGroup = new THREE.Group();
  sunGroup.position.set(4.7, 7.45, -2.55);

  const coreGeo = new THREE.IcosahedronGeometry(0.76, 2);
  const sunCoreMat = new THREE.MeshStandardMaterial({
    color: 0xffdf73,
    emissive: 0xff9d1c,
    emissiveIntensity: 1.75,
    roughness: 0.18,
    metalness: 0.12,
  });
  disposables.push(coreGeo, sunCoreMat);
  sunGroup.add(new THREE.Mesh(coreGeo, sunCoreMat));

  const haloGeo = new THREE.SphereGeometry(1.08, 16, 14);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xffcd57,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  disposables.push(haloGeo, haloMat);
  sunGroup.add(new THREE.Mesh(haloGeo, haloMat));

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xe3bf74,
    roughness: 0.22,
    metalness: 0.94,
  });
  disposables.push(goldMat);

  const ring1Geo = new THREE.TorusGeometry(1.18, 0.032, 8, 36);
  const ring2Geo = new THREE.TorusGeometry(1.42, 0.022, 8, 36);
  disposables.push(ring1Geo, ring2Geo);

  const ring1 = new THREE.Mesh(ring1Geo, goldMat);
  ring1.rotation.x = Math.PI * 0.36;
  ring1.rotation.y = Math.PI * 0.15;

  const ring2 = new THREE.Mesh(ring2Geo, goldMat);
  ring2.rotation.x = -Math.PI * 0.28;
  ring2.rotation.z = Math.PI * 0.24;

  const sunRaysGroup = new THREE.Group();
  const finGeo = new THREE.ConeGeometry(0.085, 0.44, 4);
  disposables.push(finGeo);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const fin = new THREE.Mesh(finGeo, goldMat);
    const radius = 1.06;
    fin.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    fin.rotation.z = angle - Math.PI / 2;
    sunRaysGroup.add(fin);
  }
  sunRaysGroup.add(ring1, ring2);
  sunGroup.add(sunRaysGroup);

  const beamGeo = new THREE.CylinderGeometry(0.55, 2.45, 7.6, 16, 1, true);
  const sunBeamMat = new THREE.MeshBasicMaterial({
    color: 0xffdf80,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  disposables.push(beamGeo, sunBeamMat);
  const beam = new THREE.Mesh(beamGeo, sunBeamMat);
  beam.position.set(-0.62, -3.75, 1.65);
  beam.rotation.z = -0.17;
  beam.rotation.x = 0.35;
  sunGroup.add(beam);

  return { sunGroup, sunRaysGroup, sunBeamMat, sunCoreMat };
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
    const x = THREE.MathUtils.lerp(-DIORAMA_HALF_X + 0.45, 1.85, rand());
    const z = THREE.MathUtils.lerp(-DIORAMA_HALF_Z + 0.45, DIORAMA_HALF_Z - 0.45, rand());
    const h = terrainHeightAt(x, z);

    if (Math.hypot(x - 0.85, z - 1.65) < 0.95) continue;

    if (isWetArea(x, z)) {
      if (h > -0.15 && h < 0.3 && rockSpots.length < 30) {
        rockSpots.push({ x, y: h - 0.03, z, scale: 0.45 + rand() * 0.65, rotY: rand() * Math.PI * 2, tint: rand() });
      }
      continue;
    }

    if (h > 1.05 && h < 2.95 && pineSpots.length < 44) {
      pineSpots.push({
        x,
        y: h - 0.02,
        z,
        scale: 0.84 + rand() * 0.36,
        rotY: rand() * Math.PI * 2,
        tint: rand(),
      });
    } else if (h >= 0.25 && h <= 1.45 && broadleafSpots.length < 30) {
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
} {
  const group = new THREE.Group();

  const teakMat = new THREE.MeshStandardMaterial({ color: 0x7c5032, roughness: 0.78, metalness: 0.04 });
  const terracottaRoofMat = new THREE.MeshStandardMaterial({ color: 0x9b4832, roughness: 0.65, metalness: 0.08 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8e8b82, roughness: 0.88, metalness: 0.05 });
  const goldFinialMat = new THREE.MeshStandardMaterial({ color: 0xe2be74, roughness: 0.22, metalness: 0.92 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x5c3622, roughness: 0.55, metalness: 0.08 });
  disposables.push(teakMat, terracottaRoofMat, stoneMat, goldFinialMat, sailMat, hullMat);

  const pavX = 0.85;
  const pavZ = 1.65;
  const pavY = terrainHeightAt(pavX, pavZ);
  const pavilion = new THREE.Group();
  pavilion.position.set(pavX, pavY - 0.04, pavZ);
  pavilion.rotation.y = 0.42;

  const baseStep1Geo = new THREE.BoxGeometry(0.72, 0.14, 0.72);
  const baseStep2Geo = new THREE.BoxGeometry(0.58, 0.08, 0.58);
  const pillarGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.34, 6);
  const lowerRoofGeo = new THREE.ConeGeometry(0.58, 0.22, 4);
  const upperRoofGeo = new THREE.ConeGeometry(0.32, 0.2, 4);
  const finialGeo = new THREE.ConeGeometry(0.03, 0.1, 5);
  disposables.push(baseStep1Geo, baseStep2Geo, pillarGeo, lowerRoofGeo, upperRoofGeo, finialGeo);

  const step1 = new THREE.Mesh(baseStep1Geo, stoneMat);
  step1.position.y = 0.07;
  step1.receiveShadow = true;
  const step2 = new THREE.Mesh(baseStep2Geo, teakMat);
  step2.position.y = 0.17;
  pavilion.add(step1, step2);

  const offsets = [
    [-0.22, -0.22],
    [0.22, -0.22],
    [-0.22, 0.22],
    [0.22, 0.22],
  ];
  offsets.forEach(([ox, oz]) => {
    const pillar = new THREE.Mesh(pillarGeo, teakMat);
    pillar.position.set(ox, 0.36, oz);
    pavilion.add(pillar);
  });

  const roof1 = new THREE.Mesh(lowerRoofGeo, terracottaRoofMat);
  roof1.position.y = 0.58;
  roof1.rotation.y = Math.PI / 4;
  roof1.castShadow = true;
  const roof2 = new THREE.Mesh(upperRoofGeo, terracottaRoofMat);
  roof2.position.y = 0.74;
  roof2.rotation.y = Math.PI / 4;
  const finial = new THREE.Mesh(finialGeo, goldFinialMat);
  finial.position.y = 0.88;
  pavilion.add(roof1, roof2, finial);
  group.add(pavilion);

  const pier = new THREE.Group();
  const deckGeo = new THREE.BoxGeometry(0.95, 0.045, 0.32);
  const pilingGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.72, 5);
  const bollardGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.08, 6);
  disposables.push(deckGeo, pilingGeo, bollardGeo);

  const deck = new THREE.Mesh(deckGeo, teakMat);
  deck.position.set(2.42, WATER_LEVEL + 0.12, 1.88);
  deck.receiveShadow = true;
  pier.add(deck);

  [2.05, 2.42, 2.82].forEach((px) => {
    [-0.13, 0.13].forEach((dz) => {
      const piling = new THREE.Mesh(pilingGeo, teakMat);
      piling.position.set(px, WATER_LEVEL - 0.18, 1.88 + dz);
      pier.add(piling);
    });
  });
  const bollard = new THREE.Mesh(bollardGeo, goldFinialMat);
  bollard.position.set(2.84, WATER_LEVEL + 0.18, 1.76);
  pier.add(bollard);
  group.add(pier);

  const boatGroup = new THREE.Group();
  const boatBasePos = new THREE.Vector3(3.65, WATER_LEVEL + 0.02, 1.45);
  boatGroup.position.copy(boatBasePos);
  boatGroup.rotation.y = -0.55;

  const hullGeo = new THREE.CylinderGeometry(0.14, 0.09, 0.62, 7);
  hullGeo.rotateZ(Math.PI / 2);
  hullGeo.scale(1.0, 0.62, 1.2);
  const boatDeckGeo = new THREE.BoxGeometry(0.46, 0.03, 0.22);
  const cabinGeo = new THREE.BoxGeometry(0.18, 0.09, 0.15);
  const mastGeo = new THREE.CylinderGeometry(0.012, 0.016, 0.62, 6);
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.quadraticCurveTo(0.14, 0.22, 0.02, 0.48);
  sailShape.lineTo(-0.24, 0.04);
  sailShape.closePath();
  const sailGeo = new THREE.ShapeGeometry(sailShape, 6);
  disposables.push(hullGeo, boatDeckGeo, cabinGeo, mastGeo, sailGeo);

  const hull = new THREE.Mesh(hullGeo, hullMat);
  const bDeck = new THREE.Mesh(boatDeckGeo, teakMat);
  bDeck.position.y = 0.06;
  const cabin = new THREE.Mesh(cabinGeo, sailMat);
  cabin.position.set(-0.08, 0.11, 0);
  const mast = new THREE.Mesh(mastGeo, goldFinialMat);
  mast.position.set(0.04, 0.36, 0);
  const sail = new THREE.Mesh(sailGeo, sailMat);
  sail.position.set(0.06, 0.14, 0);

  boatGroup.add(hull, bDeck, cabin, mast, sail);
  group.add(boatGroup);

  return { group, boatGroup, boatBasePos };
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
    { stageId: 'evaporasi', pos: [3.6, 0.5, 0.1], size: [3.6, 1.6, 7.6] },
    { stageId: 'evaporasi', pos: [4.7, 7.45, -2.55], size: [2.8, 2.8, 2.8] },
    { stageId: 'transpirasi', pos: [-1.1, 1.85, 1.5], size: [3.5, 2.2, 3.8] },
    { stageId: 'kondensasi', pos: [0.85, 7.0, -0.6], size: [4.2, 2.2, 2.8] },
    { stageId: 'presipitasi', pos: [-3.05, 5.8, -0.65], size: [3.9, 4.8, 4.2] },
    { stageId: 'infiltrasi', pos: [-0.2, -0.8, 3.6], size: [9.8, 2.6, 1.9] },
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
  const { sunGroup, sunRaysGroup, sunBeamMat, sunCoreMat } = buildHeroSun(disposables);
  const floraAndRocks = buildFloraAndRocks(disposables);
  const { group: archGroup, boatGroup, boatBasePos } = buildArchitecturalDetails(disposables);
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
    sunRaysGroup,
    sunBeamMat,
    sunCoreMat,
    clouds,
    lightningLight,
    oceanMaterial,
    oceanUniforms,
    riverMaterial,
    waterfallMaterial,
    aquiferGlowMaterial,
    boatGroup,
    boatBasePos,
    interactableProxies,
    disposables,
  };
}
