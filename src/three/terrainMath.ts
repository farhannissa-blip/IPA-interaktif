import * as THREE from 'three';

/**
 * Diorama footprint: X in [-5.5, 5.5], Z in [-4.0, 4.0]
 * Water level: Y = 0.0
 * Cutaway floor: Y = -2.2
 */
export const DIORAMA_HALF_X = 5.5;
export const DIORAMA_HALF_Z = 4.0;
export const WATER_LEVEL = 0.0;
export const BASE_BOTTOM_Y = -2.15;

/**
 * Centerline Z of the winding mountain-to-ocean river for a given X.
 */
export function riverCenterZ(x: number): number {
  return (
    0.35 +
    Math.sin(x * 0.58 + 0.55) * 0.92 +
    Math.cos(x * 0.34 - 0.3) * 0.35
  );
}

/**
 * Width of the carved river channel at a given X.
 */
export function riverHalfWidth(x: number): number {
  if (x < -3.8) return 0.25;
  if (x > 1.8) return 1.1;
  const t = THREE.MathUtils.clamp((x + 3.8) / 5.6, 0, 1);
  return THREE.MathUtils.lerp(0.28, 0.92, t * t);
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
 * Continuous heightfield for the entire luxury museum diorama terrain.
 * Guarantees trees, boulders, pavilion, pier, and riverbeds sit flush with zero floating.
 */
export function terrainHeightAt(x: number, z: number): number {
  // 1. Primary Alpine Peak (West / Back-Left)
  const dPeak1 = Math.hypot((x + 3.65) * 0.95, (z + 1.35) * 1.08);
  const peak1 = 4.85 * Math.exp(-(dPeak1 * dPeak1) / 5.2);

  // 2. Secondary Ridge Peak (Southwest)
  const dPeak2 = Math.hypot((x + 4.15) * 1.05, (z - 1.65) * 1.0);
  const peak2 = 3.55 * Math.exp(-(dPeak2 * dPeak2) / 4.2);

  // 3. Forested Mid-Highland Shoulder
  const dHill1 = Math.hypot((x + 1.45) * 0.85, (z - 1.75) * 0.95);
  const hill1 = 2.05 * Math.exp(-(dHill1 * dHill1) / 4.8);

  // 4. Northern Escarpment Ridge (Back-Middle)
  const dHill2 = Math.hypot((x + 1.0) * 0.9, (z + 2.35) * 1.05);
  const hill2 = 2.55 * Math.exp(-(dHill2 * dHill2) / 4.6);

  // 5. Gentle Coastal Foothill Slope (transition to ocean around x = 1.4..2.3)
  const coastEdge = 1.65 + Math.sin(z * 0.75) * 0.58 + Math.cos(z * 1.35) * 0.22;
  const landMask = THREE.MathUtils.smoothstep(coastEdge - x, -1.6, 2.2);

  // Ocean basin depth on the eastern side (x > coastEdge)
  const oceanDepth = -1.28 * (1 - landMask);

  // Base terrain elevation
  let h =
    (peak1 + peak2 + hill1 + hill2) * (0.28 + 0.72 * landMask) +
    landMask * 0.72 +
    oceanDepth;

  // Add subtle natural geological crags (stronger on higher land, gentle under water)
  const ridgeDetail = fbm(x, z) * (0.14 + Math.max(0, h) * 0.09);
  h += ridgeDetail;

  // 6. Carve sinuous river valley from highland spring (x = -3.4) down to ocean (x = 2.4)
  if (x > -3.7 && x < 2.8) {
    const rz = riverCenterZ(x);
    const dist = Math.abs(z - rz);
    const hw = riverHalfWidth(x);
    const bankFactor = 1 - THREE.MathUtils.smoothstep(dist, hw * 0.28, hw * 1.45);

    // River floor slopes down gracefully with a dramatic waterfall drop around x = -1.35
    let targetRiverFloor: number;
    if (x < -1.65) {
      targetRiverFloor = THREE.MathUtils.lerp(2.05, 1.45, (x + 3.7) / 2.05);
    } else if (x < -1.05) {
      // Waterfall cliff drop!
      const dropT = THREE.MathUtils.smoothstep(x, -1.65, -1.05);
      targetRiverFloor = THREE.MathUtils.lerp(1.45, 0.08, dropT);
    } else {
      const valleyT = THREE.MathUtils.clamp((x + 1.05) / 3.85, 0, 1);
      targetRiverFloor = THREE.MathUtils.lerp(0.08, -0.58, valleyT);
    }

    // Blend river cut smoothly into surrounding terrain
    const cutStartFade = THREE.MathUtils.smoothstep(x, -3.7, -3.1);
    const effectiveBank = bankFactor * cutStartFade;
    h = THREE.MathUtils.lerp(h, Math.min(h, targetRiverFloor), effectiveBank);
  }

  return h;
}

/**
 * Water surface elevation along the river channel (for placing river water ribbon and particles).
 */
export function riverWaterSurfaceY(x: number): number {
  if (x < -1.65) {
    return THREE.MathUtils.lerp(2.18, 1.56, THREE.MathUtils.clamp((x + 3.5) / 1.85, 0, 1));
  }
  if (x < -1.05) {
    const dropT = THREE.MathUtils.smoothstep(x, -1.65, -1.05);
    return THREE.MathUtils.lerp(1.56, 0.22, dropT);
  }
  const valleyT = THREE.MathUtils.clamp((x + 1.05) / 3.2, 0, 1);
  return THREE.MathUtils.lerp(0.22, WATER_LEVEL + 0.02, valleyT);
}

/**
 * True if (x, z) is inside the river channel or below ocean level.
 */
export function isWetArea(x: number, z: number): boolean {
  const h = terrainHeightAt(x, z);
  if (h <= WATER_LEVEL + 0.14) return true;
  if (x > -3.7 && x < 2.5) {
    const dist = Math.abs(z - riverCenterZ(x));
    if (dist < riverHalfWidth(x) * 1.35) return true;
  }
  return false;
}
