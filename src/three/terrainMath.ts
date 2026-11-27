import * as THREE from 'three';

/**
 * Diorama footprint: X in [-5.5, 8.4] (expanded eastern ocean, beach & mountains unchanged), Z in [-4.0, 4.0]
 * Water level: Y = 0.0
 * Cutaway floor: Y = -2.15
 */
export const DIORAMA_MIN_X = -5.5;
export const DIORAMA_MAX_X = 8.4;
export const DIORAMA_WIDTH_X = DIORAMA_MAX_X - DIORAMA_MIN_X;
export const DIORAMA_CENTER_X = (DIORAMA_MIN_X + DIORAMA_MAX_X) * 0.5;
export const DIORAMA_HALF_X = 5.5;
export const DIORAMA_HALF_Z = 4.0;
export const WATER_LEVEL = 0.0;
export const BASE_BOTTOM_Y = -2.15;

export const RIVER_START_X = -3.65;
export const RIVER_END_X = 2.65;

/**
 * Gently curving tropical sandy coastline X coordinate for any Z along the diorama.
 */
export function coastlineX(z: number): number {
  return 2.08 + Math.sin(z * 0.68 + 0.25) * 0.34 + Math.cos(z * 1.28) * 0.12;
}

/**
 * Natural S-curve meandering centerline Z of the valley river from mountain spring to sea.
 * Sweeps organically through 3 bends while staying clear of the village house (0.45, 2.75)
 * and coastal pier (2.68, 1.88).
 */
export function riverCenterZ(x: number): number {
  return (
    0.05 +
    Math.sin(x * 1.18 + 0.55) * 0.78 +
    Math.cos(x * 0.52 - 0.8) * 0.34
  );
}

/**
 * Analytic derivative dZ/dX of the meandering river centerline for true perpendicular banks.
 */
export function riverSlopeDZDX(x: number): number {
  return (
    Math.cos(x * 1.18 + 0.55) * (0.78 * 1.18) -
    Math.sin(x * 0.52 - 0.8) * (0.34 * 0.52)
  );
}

/**
 * True perpendicular distance from (x, z) to the winding river centerline.
 */
export function riverPerpDistance(x: number, z: number): number {
  const dz = z - riverCenterZ(x);
  const slope = riverSlopeDZDX(x);
  return Math.abs(dz) / Math.hypot(1, slope);
}

/**
 * Half-width of the natural river channel at a given X:
 * narrow alpine mountain stream gradually widening into a lush valley river and coastal estuary.
 */
export function riverHalfWidth(x: number): number {
  const t = THREE.MathUtils.clamp(
    (x - RIVER_START_X) / (RIVER_END_X - RIVER_START_X),
    0,
    1
  );
  // Subtle organic widening + estuary flare near the ocean mouth
  const baseW = THREE.MathUtils.lerp(0.18, 0.58, Math.pow(t, 1.25));
  const estuaryFlare = THREE.MathUtils.smoothstep(t, 0.74, 1.0) * 0.42;
  return baseW + estuaryFlare;
}

/**
 * Deterministic multi-octave pseudo-noise for natural sculpted mountain ridges.
 */
function fbm(x: number, z: number): number {
  const n1 = Math.sin(x * 0.72 + z * 0.45) * Math.cos(z * 0.68 - x * 0.32);
  const n2 = Math.sin(x * 1.55 - z * 1.28) * 0.45;
  const n3 = Math.cos(x * 2.8 + z * 2.4) * 0.18;
  return n1 * 0.52 + n2 * 0.32 + n3 * 0.16;
}

/**
 * Underlying sculpted mountain, highland, coastal meadow, wide sandy beach, and ocean-floor heightfield
 * BEFORE carving the natural meandering river valley.
 */
export function baseTerrainHeightAt(x: number, z: number): number {
  // 1. Primary Alpine Peak (West / Back-Left)
  const dPeak1 = Math.hypot((x + 3.65) * 0.95, (z + 1.35) * 1.08);
  const peak1 = 4.85 * Math.exp(-(dPeak1 * dPeak1) / 5.2);

  // 2. Secondary Ridge Peak (Southwest)
  const dPeak2 = Math.hypot((x + 4.15) * 1.05, (z - 1.65) * 1.0);
  const peak2 = 3.55 * Math.exp(-(dPeak2 * dPeak2) / 4.2);

  // 3. Forested Mid-Highland Shoulder (South)
  const dHill1 = Math.hypot((x + 1.65) * 0.88, (z - 1.75) * 0.95);
  const hill1 = 2.02 * Math.exp(-(dHill1 * dHill1) / 4.5);

  // 4. Northern Escarpment Ridge (Back-Middle)
  const dHill2 = Math.hypot((x + 1.25) * 0.92, (z + 2.35) * 1.05);
  const hill2 = 2.5 * Math.exp(-(dHill2 * dHill2) / 4.4);

  // 5. Wide, Gentle Tropical Sandy Beach Terrace & Shallow Nearshore Sandbar
  const distInland = coastlineX(z) - x; // >0 = inland, 0 = waterline, <0 = ocean
  const uplandMask = THREE.MathUtils.smoothstep(distInland, 1.35, 3.15);

  let baseSlope = 0;
  if (distInland >= 0) {
    // Broad gently-sloping golden beach (0..1.45 units inland) rising softly into coastal meadow
    const beachRise = Math.min(distInland, 1.5) * 0.23;
    const meadowRise = THREE.MathUtils.smoothstep(distInland, 1.15, 2.75) * 0.48;
    baseSlope = beachRise + meadowRise;
  } else {
    // Shallow sunlit sandbar shelf near the beach before descending into the deep ocean basin
    const seaDist = -distInland;
    const shallowShelf = -Math.min(seaDist, 0.55) * 0.36;
    const deepDrop = -THREE.MathUtils.smoothstep(seaDist, 0.38, 1.75) * 1.08;
    baseSlope = shallowShelf + deepDrop;
  }

  // Base terrain elevation: keep beach wide & open while preserving full mountain height inland
  let h = (peak1 + peak2 + hill1 + hill2) * (0.04 + 0.96 * uplandMask) + baseSlope;

  // Natural geological crags inland, silky gentle dune ripples across the beach
  const beachCalmMask = THREE.MathUtils.smoothstep(distInland, 0.25, 1.9);
  const noiseAmp = THREE.MathUtils.lerp(0.032, 0.14 + Math.max(0, h) * 0.088, beachCalmMask);
  h += fbm(x, z) * noiseAmp;

  return h;
}

/**
 * Precomputed strictly-downhill river surface elevation profile derived directly
 * from the surrounding base terrain so the winding river always hugs the valley
 * slope naturally (never floating above hills and never flowing uphill).
 */
const RIVER_PROFILE_STEPS = 128;
const riverProfileTable = new Float32Array(RIVER_PROFILE_STEPS + 1);
let computedCascadeX = -1.65;

(function initRiverProfile() {
  const raw = new Float32Array(RIVER_PROFILE_STEPS + 1);

  for (let i = 0; i <= RIVER_PROFILE_STEPS; i++) {
    const t = i / RIVER_PROFILE_STEPS;
    const x = THREE.MathUtils.lerp(RIVER_START_X, RIVER_END_X, t);
    const cz = riverCenterZ(x);
    // Sample valley floor & adjacent slopes to naturally follow surrounding land elevation
    const hCenter = baseTerrainHeightAt(x, cz);
    const hLeft = baseTerrainHeightAt(x, cz - 0.48);
    const hRight = baseTerrainHeightAt(x, cz + 0.48);
    const localValley = Math.min(hCenter, (hLeft + hRight) * 0.5);
    // Inset river surface slightly below the surrounding valley floor so banks embrace the water
    const channelInset = THREE.MathUtils.lerp(0.22, 0.1, t);
    raw[i] = Math.max(localValley - channelInset, WATER_LEVEL + 0.012);
  }

  // Gentle 6-pass smoothing so local fbm bumps turn into a fluid natural hydraulic grade
  const tmp = new Float32Array(RIVER_PROFILE_STEPS + 1);
  for (let pass = 0; pass < 6; pass++) {
    tmp[0] = raw[0];
    tmp[RIVER_PROFILE_STEPS] = WATER_LEVEL + 0.012;
    for (let i = 1; i < RIVER_PROFILE_STEPS; i++) {
      tmp[i] = raw[i - 1] * 0.25 + raw[i] * 0.5 + raw[i + 1] * 0.25;
    }
    raw.set(tmp);
  }

  // Smoothly blend the final coastal stretch flush into sea level (WATER_LEVEL + 0.014)
  for (let i = 0; i <= RIVER_PROFILE_STEPS; i++) {
    const t = i / RIVER_PROFILE_STEPS;
    const seaBlend = THREE.MathUtils.smoothstep(t, 0.78, 0.96);
    raw[i] = THREE.MathUtils.lerp(raw[i], WATER_LEVEL + 0.014, seaBlend);
  }

  // Enforce strict physical downhill monotonicity (water never flows uphill)
  riverProfileTable[0] = Math.max(raw[0], 1.85);
  for (let i = 1; i <= RIVER_PROFILE_STEPS; i++) {
    const t = i / RIVER_PROFILE_STEPS;
    const minDrop = t < 0.85 ? 0.0045 : 0.0;
    const prev = riverProfileTable[i - 1];
    riverProfileTable[i] = Math.max(
      WATER_LEVEL + 0.014,
      Math.min(raw[i], prev - minDrop)
    );
  }

  // Locate steepest natural valley cascade stretch for whitewater foam & spray mist
  let maxDrop = 0;
  for (let i = 8; i < RIVER_PROFILE_STEPS - 24; i++) {
    const drop = riverProfileTable[i - 1] - riverProfileTable[i + 1];
    if (drop > maxDrop) {
      maxDrop = drop;
      computedCascadeX = THREE.MathUtils.lerp(
        RIVER_START_X,
        RIVER_END_X,
        i / RIVER_PROFILE_STEPS
      );
    }
  }
})();

export const RIVER_CASCADE_X = computedCascadeX;

/**
 * Water surface elevation along the meandering river channel,
 * smoothly following the surrounding valley terrain down to ocean level.
 */
export function riverWaterSurfaceY(x: number): number {
  const t = THREE.MathUtils.clamp(
    (x - RIVER_START_X) / (RIVER_END_X - RIVER_START_X),
    0,
    1
  );
  const fIdx = t * RIVER_PROFILE_STEPS;
  const i0 = Math.floor(fIdx);
  const i1 = Math.min(i0 + 1, RIVER_PROFILE_STEPS);
  const frac = fIdx - i0;
  return THREE.MathUtils.lerp(riverProfileTable[i0], riverProfileTable[i1], frac);
}

/**
 * Local downhill slope magnitude of the river surface (0 = flat, >0.25 = lively mountain rapids).
 */
export function riverSurfaceSlope(x: number): number {
  const dx = 0.08;
  const y0 = riverWaterSurfaceY(x - dx);
  const y1 = riverWaterSurfaceY(x + dx);
  return Math.max(0, (y0 - y1) / (2 * dx));
}

/**
 * Continuous heightfield for the entire luxury museum diorama terrain,
 * with a naturally carved winding valley & riverbed synchronized to riverWaterSurfaceY(x).
 */
export function terrainHeightAt(x: number, z: number): number {
  let h = baseTerrainHeightAt(x, z);

  // Carve organic U-shaped valley and deep riverbed hugging the meandering river path
  if (x > RIVER_START_X - 0.4 && x < RIVER_END_X + 0.45) {
    const perpDist = riverPerpDistance(x, z);
    const hw = riverHalfWidth(x);
    const wy = riverWaterSurfaceY(x);

    const headFade = THREE.MathUtils.smoothstep(x, RIVER_START_X - 0.35, RIVER_START_X + 0.25);
    const mouthFade = 1 - THREE.MathUtils.smoothstep(x, RIVER_END_X - 0.15, RIVER_END_X + 0.45);
    const activeMask = headFade * mouthFade;

    if (activeMask > 0.001) {
      // 1. Wide gentle valley trough sloping surrounding hills smoothly toward the riverbanks
      const valleyOuter = hw * 3.1;
      const valleyInfluence =
        (1 - THREE.MathUtils.smoothstep(perpDist, hw * 0.95, valleyOuter)) * activeMask;
      if (valleyInfluence > 0.001) {
        const bankRise =
          wy + 0.14 + THREE.MathUtils.smoothstep(perpDist, hw * 0.85, valleyOuter) * 0.55;
        // Gently lower steep shoulders into a natural V/U valley while keeping low ground intact
        const targetValleyY = Math.min(h, Math.max(bankRise, wy + 0.1));
        h = THREE.MathUtils.lerp(h, targetValleyY, valleyInfluence * 0.82);
      }

      // 2. Crisp inner riverbed channel dipping cleanly below water surface so water never clips
      const channelOuter = hw * 1.48;
      const channelInfluence =
        (1 - THREE.MathUtils.smoothstep(perpDist, hw * 0.35, channelOuter)) * activeMask;
      if (channelInfluence > 0.001) {
        const tAlong = THREE.MathUtils.clamp(
          (x - RIVER_START_X) / (RIVER_END_X - RIVER_START_X),
          0,
          1
        );
        const bedDepth = THREE.MathUtils.lerp(0.24, 0.42, tAlong);
        const crossProfile = THREE.MathUtils.smoothstep(perpDist, hw * 0.3, hw * 1.18);
        const targetBedY = wy - bedDepth * (1 - crossProfile) + crossProfile * 0.09;
        h = THREE.MathUtils.lerp(h, targetBedY, channelInfluence);
      }
    }
  }

  return h;
}

/**
 * True if (x, z) is inside the river channel or below ocean level.
 */
export function isWetArea(x: number, z: number): boolean {
  const h = terrainHeightAt(x, z);
  if (h <= WATER_LEVEL + 0.14) return true;
  if (x > RIVER_START_X - 0.1 && x < RIVER_END_X + 0.15) {
    if (riverPerpDistance(x, z) < riverHalfWidth(x) * 1.45) return true;
  }
  return false;
}

/**
 * Natural multi-directional ocean wave elevation synchronized with the ocean GLSL vertex shader,
 * gently dampening as swells approach the sandy beach shoreline.
 */
export function oceanWaveHeightAt(x: number, z: number, time: number, waveAmp: number): number {
  const shoreDist = x - coastlineX(z);
  const shoreDamp = THREE.MathUtils.smoothstep(shoreDist, -0.1, 1.35);
  const amp = waveAmp * (0.28 + 0.72 * shoreDamp);
  // Primary shoreward swell + diagonal cross-swell + secondary chop
  const w1 = Math.sin(x * 1.25 + z * 0.28 + time * 1.75) * 0.62;
  const w2 = Math.sin(x * 1.95 - z * 0.92 + time * 2.35) * 0.36;
  const w3 = Math.cos(x * 0.78 + z * 1.45 - time * 1.35) * 0.28;
  const w4 = Math.sin(x * 3.1 + z * 1.8 + time * 3.1) * 0.14;
  return WATER_LEVEL + (w1 + w2 + w3 + w4) * amp;
}
