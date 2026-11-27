import * as THREE from 'three';

export interface ProceduralTextureSet {
  strataColor: THREE.CanvasTexture;
  strataBump: THREE.CanvasTexture;
  terrainBump: THREE.CanvasTexture;
  waterNormalBump: THREE.CanvasTexture;
  brushedGoldRoughness: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  mistSprite: THREE.CanvasTexture;
  glowSprite: THREE.CanvasTexture;
  sunGlowSprite: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // Cap anisotropy at 4 to save mobile/PID texture bandwidth while staying crisp
  const aniso = Math.min(Math.max(maxAnisotropy, 1), 4);

  // 1. Geological Stratified Cutaway Albedo + Bump (256x256 for fast upload & low VRAM)
  const [strataCanvas, sCtx] = makeCanvas(256, 256);
  const [strataBumpCanvas, sbCtx] = makeCanvas(256, 256);

  const layers = [
    { stop: 0.0, color: '#3b2e22', bump: 170 },
    { stop: 0.14, color: '#5b412c', bump: 145 },
    { stop: 0.30, color: '#7c5838', bump: 130 },
    { stop: 0.48, color: '#8f7253', bump: 155 },
    { stop: 0.65, color: '#4d606e', bump: 115 },
    { stop: 0.80, color: '#2b3847', bump: 165 },
    { stop: 1.0, color: '#18202b', bump: 190 },
  ];

  const grad = sCtx.createLinearGradient(0, 0, 0, 256);
  const bGrad = sbCtx.createLinearGradient(0, 0, 0, 256);
  layers.forEach((l) => {
    grad.addColorStop(l.stop, l.color);
    bGrad.addColorStop(l.stop, `rgb(${l.bump},${l.bump},${l.bump})`);
  });
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 256, 256);
  sbCtx.fillStyle = bGrad;
  sbCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 28; i++) {
    const yBase = (i / 28) * 256;
    const amp = 2 + (i % 4) * 1.4;
    const freq = 0.025 + (i % 3) * 0.012;
    const alpha = 0.08 + (i % 4) * 0.025;
    sCtx.strokeStyle =
      i % 2 === 0 ? `rgba(232, 206, 168, ${alpha})` : `rgba(12, 18, 28, ${alpha * 1.35})`;
    sCtx.lineWidth = 1.2 + (i % 2);
    sCtx.beginPath();
    sbCtx.strokeStyle = i % 2 === 0 ? 'rgba(235,235,235,0.22)' : 'rgba(30,30,30,0.25)';
    sbCtx.lineWidth = sCtx.lineWidth;
    sbCtx.beginPath();
    for (let x = 0; x <= 256; x += 16) {
      const y = yBase + Math.sin(x * freq + i * 1.7) * amp;
      if (x === 0) {
        sCtx.moveTo(x, y);
        sbCtx.moveTo(x, y);
      } else {
        sCtx.lineTo(x, y);
        sbCtx.lineTo(x, y);
      }
    }
    sCtx.stroke();
    sbCtx.stroke();
  }

  for (let i = 0; i < 200; i++) {
    const px = ((i * 73) % 252) + 2;
    const py = ((i * 137) % 252) + 2;
    const r = 0.9 + (i % 3) * 0.65;
    const isAquiferBand = py > 148 && py < 198;
    sCtx.fillStyle = isAquiferBand
      ? i % 3 === 0
        ? 'rgba(72, 188, 212, 0.25)'
        : 'rgba(170, 195, 208, 0.2)'
      : i % 2 === 0
        ? 'rgba(240, 224, 195, 0.09)'
        : 'rgba(15, 20, 28, 0.14)';
    sCtx.beginPath();
    sCtx.arc(px, py, r, 0, Math.PI * 2);
    sCtx.fill();

    sbCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(25,25,25,0.2)';
    sbCtx.beginPath();
    sbCtx.arc(px, py, r, 0, Math.PI * 2);
    sbCtx.fill();
  }

  const strataColor = new THREE.CanvasTexture(strataCanvas);
  strataColor.colorSpace = THREE.SRGBColorSpace;
  strataColor.wrapS = THREE.RepeatWrapping;
  strataColor.wrapT = THREE.ClampToEdgeWrapping;
  strataColor.anisotropy = aniso;

  const strataBump = new THREE.CanvasTexture(strataBumpCanvas);
  strataBump.wrapS = THREE.RepeatWrapping;
  strataBump.wrapT = THREE.ClampToEdgeWrapping;
  strataBump.anisotropy = aniso;

  // 2. Terrain Organic Micro-Grain Bump Map (fast ImageData, 128x128)
  const [terrCanvas, tCtx] = makeCanvas(128, 128);
  const tImg = tCtx.createImageData(128, 128);
  const tData = tImg.data;
  let seed = 1337;
  for (let i = 0; i < tData.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = 104 + (seed % 48);
    tData[i] = v;
    tData[i + 1] = v;
    tData[i + 2] = v;
    tData[i + 3] = 255;
  }
  tCtx.putImageData(tImg, 0, 0);
  const terrainBump = new THREE.CanvasTexture(terrCanvas);
  terrainBump.wrapS = THREE.RepeatWrapping;
  terrainBump.wrapT = THREE.RepeatWrapping;
  terrainBump.repeat.set(6, 6);
  terrainBump.anisotropy = aniso;

  // 3. Water Surface Micro-Ripple Bump Map (fast ImageData, 128x128 — instant startup on HP/PID)
  const [waterCanvas, wCtx] = makeCanvas(128, 128);
  const wImg = wCtx.createImageData(128, 128);
  const wData = wImg.data;
  const twoPiOver128 = (Math.PI * 2) / 128;
  for (let y = 0; y < 128; y++) {
    const ny = y * twoPiOver128;
    for (let x = 0; x < 128; x++) {
      const nx = x * twoPiOver128;
      const wave =
        Math.sin(nx * 3 + ny * 2) * 0.42 +
        Math.cos(nx * 5 - ny * 4) * 0.32 +
        Math.sin(nx * 8 + ny * 7) * 0.18;
      const val = Math.max(0, Math.min(255, Math.floor(128 + wave * 96)));
      const idx = (y * 128 + x) * 4;
      wData[idx] = val;
      wData[idx + 1] = val;
      wData[idx + 2] = val;
      wData[idx + 3] = 255;
    }
  }
  wCtx.putImageData(wImg, 0, 0);
  const waterNormalBump = new THREE.CanvasTexture(waterCanvas);
  waterNormalBump.wrapS = THREE.RepeatWrapping;
  waterNormalBump.wrapT = THREE.RepeatWrapping;
  waterNormalBump.repeat.set(3.5, 3.5);
  waterNormalBump.anisotropy = aniso;

  // 4. Brushed Champagne Gold Roughness Map (128x128)
  const [goldCanvas, gCtx] = makeCanvas(128, 128);
  for (let y = 0; y < 128; y++) {
    const shade = 44 + ((y * 17) % 28);
    gCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    gCtx.fillRect(0, y, 128, 1);
  }
  const brushedGoldRoughness = new THREE.CanvasTexture(goldCanvas);
  brushedGoldRoughness.wrapS = THREE.RepeatWrapping;
  brushedGoldRoughness.wrapT = THREE.RepeatWrapping;
  brushedGoldRoughness.repeat.set(4, 1);
  brushedGoldRoughness.anisotropy = aniso;

  // 5. Soft Radial Contact Shadow Texture (128x128)
  const [shadowCanvas, shCtx] = makeCanvas(128, 128);
  const rad = shCtx.createRadialGradient(64, 64, 11, 64, 64, 63);
  rad.addColorStop(0.0, 'rgba(2, 6, 14, 0.84)');
  rad.addColorStop(0.55, 'rgba(2, 6, 14, 0.45)');
  rad.addColorStop(0.82, 'rgba(2, 6, 14, 0.12)');
  rad.addColorStop(1.0, 'rgba(2, 6, 14, 0.0)');
  shCtx.fillStyle = rad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);

  // 6. Soft Feathered Organic Mist / Vapor Puff Sprite (64x64 — ultra-lightweight GPU fill)
  const [mistCanvas, mCtx] = makeCanvas(64, 64);
  const mistLobes = [
    { x: 32, y: 32, r: 29, a: 0.48 },
    { x: 24, y: 28, r: 21, a: 0.34 },
    { x: 40, y: 29, r: 20, a: 0.32 },
    { x: 31, y: 39, r: 20, a: 0.30 },
    { x: 33, y: 23, r: 17, a: 0.24 },
  ];
  mistLobes.forEach((lobe) => {
    const g = mCtx.createRadialGradient(lobe.x, lobe.y, 1, lobe.x, lobe.y, lobe.r);
    g.addColorStop(0.0, `rgba(255, 255, 255, ${lobe.a})`);
    g.addColorStop(0.45, `rgba(255, 255, 255, ${lobe.a * 0.48})`);
    g.addColorStop(0.8, `rgba(255, 255, 255, ${lobe.a * 0.12})`);
    g.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    mCtx.fillStyle = g;
    mCtx.fillRect(0, 0, 64, 64);
  });
  const mistSprite = new THREE.CanvasTexture(mistCanvas);
  mistSprite.colorSpace = THREE.SRGBColorSpace;
  mistSprite.generateMipmaps = false;
  mistSprite.minFilter = THREE.LinearFilter;
  mistSprite.magFilter = THREE.LinearFilter;

  // 7. Crisp Luminous Radial Halo Glow Sprite (64x64) for subsurface aquifer & sparkle particles
  const [glowCanvas, glCtx] = makeCanvas(64, 64);
  const gRad = glCtx.createRadialGradient(32, 32, 1, 32, 32, 30);
  gRad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  gRad.addColorStop(0.22, 'rgba(255, 255, 255, 0.72)');
  gRad.addColorStop(0.55, 'rgba(255, 255, 255, 0.22)');
  gRad.addColorStop(0.85, 'rgba(255, 255, 255, 0.04)');
  gRad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  glCtx.fillStyle = gRad;
  glCtx.fillRect(0, 0, 64, 64);
  const glowSprite = new THREE.CanvasTexture(glowCanvas);
  glowSprite.colorSpace = THREE.SRGBColorSpace;
  glowSprite.generateMipmaps = false;
  glowSprite.minFilter = THREE.LinearFilter;
  glowSprite.magFilter = THREE.LinearFilter;

  // 8. Natural Radiant Round Sun Glow & Soft Sunburst Corona Sprite (128x128)
  const [sunCanvas, sunCtx] = makeCanvas(128, 128);
  const cx = 64;
  const cy = 64;
  // Soft organic radial light rays (subtle natural daylight glare)
  sunCtx.save();
  sunCtx.translate(cx, cy);
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const rayLen = i % 2 === 0 ? 60 : 48;
    const rayWidth = i % 2 === 0 ? 0.14 : 0.1;
    sunCtx.save();
    sunCtx.rotate(angle);
    const rayGrad = sunCtx.createLinearGradient(0, 0, rayLen, 0);
    rayGrad.addColorStop(0.0, 'rgba(255, 250, 215, 0.34)');
    rayGrad.addColorStop(0.45, 'rgba(255, 224, 128, 0.14)');
    rayGrad.addColorStop(1.0, 'rgba(255, 200, 80, 0.0)');
    sunCtx.fillStyle = rayGrad;
    sunCtx.beginPath();
    sunCtx.moveTo(0, 0);
    sunCtx.lineTo(rayLen, -rayLen * rayWidth);
    sunCtx.lineTo(rayLen, rayLen * rayWidth);
    sunCtx.closePath();
    sunCtx.fill();
    sunCtx.restore();
  }
  sunCtx.restore();

  // Concentric bright incandescent sun bloom
  const sRad = sunCtx.createRadialGradient(cx, cy, 2, cx, cy, 62);
  sRad.addColorStop(0.0, 'rgba(255, 255, 248, 1.0)');
  sRad.addColorStop(0.18, 'rgba(255, 248, 204, 0.96)');
  sRad.addColorStop(0.36, 'rgba(255, 226, 122, 0.62)');
  sRad.addColorStop(0.62, 'rgba(255, 198, 76, 0.24)');
  sRad.addColorStop(0.84, 'rgba(255, 178, 52, 0.06)');
  sRad.addColorStop(1.0, 'rgba(255, 170, 40, 0.0)');
  sunCtx.fillStyle = sRad;
  sunCtx.fillRect(0, 0, 128, 128);

  const sunGlowSprite = new THREE.CanvasTexture(sunCanvas);
  sunGlowSprite.colorSpace = THREE.SRGBColorSpace;
  sunGlowSprite.generateMipmaps = false;
  sunGlowSprite.minFilter = THREE.LinearFilter;
  sunGlowSprite.magFilter = THREE.LinearFilter;

  return {
    strataColor,
    strataBump,
    terrainBump,
    waterNormalBump,
    brushedGoldRoughness,
    contactShadow,
    mistSprite,
    glowSprite,
    sunGlowSprite,
    dispose: () => {
      strataColor.dispose();
      strataBump.dispose();
      terrainBump.dispose();
      waterNormalBump.dispose();
      brushedGoldRoughness.dispose();
      contactShadow.dispose();
      mistSprite.dispose();
      glowSprite.dispose();
      sunGlowSprite.dispose();
    },
  };
}
