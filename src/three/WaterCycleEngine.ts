import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  STAGE_ORDER,
  WATER_CYCLE_STAGES,
  WaterCycleStageId,
} from '../data/waterCycleData';
import { BuiltDiorama, buildLuxuryDiorama } from './dioramaBuilder';
import { createProceduralTextures, ProceduralTextureSet } from './proceduralTextures';
import { oceanWaveHeightAt } from './terrainMath';
import { WaterCycleParticleSystem } from './waterCycleParticles';
import { WaterCycleWildlifeSystem } from './wildlifeSystem';

export type InteractiveZoneId = Exclude<WaterCycleStageId, 'overview'>;
export type QualityMode = 'ringan' | 'tinggi';

export interface HotspotScreenPosition {
  id: InteractiveZoneId;
  x: number;
  y: number;
  visible: boolean;
}

export interface EngineCallbacks {
  onStageSelect: (stageId: WaterCycleStageId, fromTouch: boolean) => void;
  onHotspotsProject: (positions: HotspotScreenPosition[]) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

// Module-scope scratch math objects (Zero GC in render loop)
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();
const _targetBgColor = new THREE.Color();
const _targetSkyTopColor = new THREE.Color();
const _targetFloorColor = new THREE.Color();
const _targetSunColor = new THREE.Color();
const _targetHemiSky = new THREE.Color();
const _targetHemiGround = new THREE.Color();
const _cloudLightColor = new THREE.Color(0xffffff);
const _cloudStormColor = new THREE.Color(0x415268);
const _cloudUnderLight = new THREE.Color(0xb6cde3);
const _cloudUnderStorm = new THREE.Color(0x222f40);
const _tempColor = new THREE.Color();
const _fallbackRipplePos = new THREE.Vector3();
const _ropeStart = new THREE.Vector3();
const _ropeEnd = new THREE.Vector3();
const _ropeMid = new THREE.Vector3();
const _ropeDir = new THREE.Vector3();
const _ropeQuat = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);

const INTERACTIVE_ZONES: InteractiveZoneId[] = [
  'evaporasi',
  'transpirasi',
  'kondensasi',
  'presipitasi',
  'infiltrasi',
];

export function detectRecommendedQuality(): QualityMode {
  if (typeof window === 'undefined') return 'ringan';
  const isTouchPrimary =
    window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const screenPixels = window.innerWidth * window.innerHeight * Math.min(window.devicePixelRatio || 1, 2);
  const lowCores = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
  // Default to Mode Ringan on phones, tablets, touch PIDs, 4K screens, or low-core CPUs
  if (isTouchPrimary || screenPixels > 2_000_000 || lowCores || window.innerWidth < 1024) {
    return 'ringan';
  }
  return 'tinggi';
}

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class WaterCycleEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;
  private qualityMode: QualityMode;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private envRenderTarget: THREE.WebGLRenderTarget;

  private textures: ProceduralTextureSet;
  private diorama: BuiltDiorama;
  private particles: WaterCycleParticleSystem;
  private wildlife: WaterCycleWildlifeSystem;

  // Lightweight 3-point lighting rig (no heavy RectAreaLight)
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;

  // Raycaster & pointer tracking
  private raycaster = new THREE.Raycaster();
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownTime = 0;
  private lastHoverCheck = 0;
  private hoveredStage: WaterCycleStageId | null = null;

  // Animation & camera transition state
  private activeStage: WaterCycleStageId = 'overview';
  private cameraTransitioning = false;
  private frameId = 0;
  private disposed = false;
  private paused = false;
  private lastTimestamp = performance.now();
  private elapsedTime = 0;
  private currentCloudDarkness = 0.12;
  private lightningTimer = 0;
  private hotspotPositions: HotspotScreenPosition[] = INTERACTIVE_ZONES.map((id) => ({
    id,
    x: -9999,
    y: -9999,
    visible: false,
  }));

  constructor(
    container: HTMLElement,
    callbacks: EngineCallbacks,
    initialQuality: QualityMode = 'ringan'
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.qualityMode = initialQuality;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    // 1. Lightweight Modern PBR WebGLRenderer with Software-WebGL & Mobile/PID Pixel Budget Guard
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && initialQuality === 'tinggi',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.applyQualitySettings(width, height);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene, Horizon-Matched Fog & Studio RoomEnvironment IBL
    this.scene = new THREE.Scene();
    const initialMood = WATER_CYCLE_STAGES.overview.mood;
    this.scene.background = new THREE.Color(initialMood.bgHex);
    this.fog = new THREE.FogExp2(initialMood.fogHex, initialMood.fogDensity);
    this.scene.fog = this.fog;

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRenderTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    pmremGenerator.dispose();

    // 3. Perspective Camera & Damped OrbitControls
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
    this.camera.position.set(...WATER_CYCLE_STAGES.overview.cameraPosition);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...WATER_CYCLE_STAGES.overview.cameraTarget);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 6.2;
    this.controls.maxDistance = 33.5;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.85;
    this.controls.update();

    this.controls.addEventListener('start', this.onControlsStart);

    // 4. Lightweight 3-Point Studio Lighting Rig (zero RectAreaLight shader overhead)
    this.hemiLight = new THREE.HemisphereLight(
      initialMood.hemiSkyHex,
      initialMood.hemiGroundHex,
      initialMood.hemiIntensity
    );
    this.hemiLight.position.set(0, 22, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(initialMood.sunColorHex, initialMood.sunIntensity);
    this.sunLight.position.set(12.5, 16.8, 5.0);
    this.sunLight.castShadow = !this.isSoftwareGl && this.qualityMode === 'tinggi';
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 38;
    this.sunLight.shadow.camera.left = -10.5;
    this.sunLight.shadow.camera.right = 11.5;
    this.sunLight.shadow.camera.top = 11.0;
    this.sunLight.shadow.camera.bottom = -10.0;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0x8ec8ff, initialMood.rimIntensity);
    this.rimLight.position.set(-11, 8.5, -10.5);
    this.scene.add(this.rimLight);

    // Subtle front-gallery fill light (fast directional replacement for expensive RectAreaLight)
    this.fillLight = new THREE.DirectionalLight(0xffebd0, 0.48);
    this.fillLight.position.set(6, 5, 11);
    this.scene.add(this.fillLight);

    // 5. Procedural Textures, Composite Luxury Diorama & Particle Systems
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.diorama = buildLuxuryDiorama(this.textures);
    this.diorama.skyUniforms.uTopColor.value.setHex(initialMood.skyTopHex);
    this.diorama.skyUniforms.uHorizonColor.value.setHex(initialMood.bgHex);
    this.diorama.studioFloorMat.color.setHex(initialMood.bgHex).multiplyScalar(0.92);
    this.scene.add(this.diorama.root);

    this.particles = new WaterCycleParticleSystem(this.textures);
    this.particles.setDensityScale(this.qualityMode === 'ringan' ? 0.68 : 1.0);
    this.scene.add(this.particles.group);

    this.wildlife = new WaterCycleWildlifeSystem();
    this.scene.add(this.wildlife.group);

    this.raycaster.layers.set(1);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.lastTimestamp = performance.now();
    this.tick();
  }

  /**
   * Dynamically computes an optimal internal pixel ratio capped by total rendered pixels,
   * preventing 4K Interactive Flat Panels (PID) and 3x DPR smartphones from choking on fill-rate.
   */
  private computeOptimalPixelRatio(width: number, height: number): number {
    if (this.isSoftwareGl) return 1;
    const dpr = window.devicePixelRatio || 1;
    const area = Math.max(width * height, 1);

    if (this.qualityMode === 'ringan') {
      // Max ~1.05M pixels internal render budget (silky smooth on Android PID 4K & budget phones)
      const maxPixels = 1_050_000;
      const areaBasedRatio = Math.sqrt(maxPixels / area);
      return THREE.MathUtils.clamp(Math.min(dpr, 1.0, areaBasedRatio), 0.58, 1.0);
    } else {
      // High mode: crisp up to 1.5x DPR, capped at ~2.3M pixels
      const maxPixels = 2_300_000;
      const areaBasedRatio = Math.sqrt(maxPixels / area);
      return THREE.MathUtils.clamp(Math.min(dpr, 1.5, areaBasedRatio), 0.75, 1.5);
    }
  }

  private applyQualitySettings(width: number, height: number): void {
    const pixelRatio = this.computeOptimalPixelRatio(width, height);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);

    const enableShadows = !this.isSoftwareGl && this.qualityMode === 'tinggi';
    this.renderer.shadowMap.enabled = enableShadows;
    if (this.sunLight) {
      this.sunLight.castShadow = enableShadows;
    }
    if (this.particles) {
      this.particles.setDensityScale(this.qualityMode === 'ringan' ? 0.68 : 1.0);
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  public setQualityMode(mode: QualityMode): void {
    if (this.qualityMode === mode || this.disposed) return;
    this.qualityMode = mode;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.applyQualitySettings(width, height);
  }

  private onControlsStart = (): void => {
    this.cameraTransitioning = false;
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('webglcontextlost', this.onContextLost, false);
    dom.addEventListener('webglcontextrestored', this.onContextRestored, false);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.paused = true;
      cancelAnimationFrame(this.frameId);
      window.clearTimeout(this.frameId);
    } else if (!this.disposed && this.paused) {
      this.paused = false;
      this.lastTimestamp = performance.now();
      this.tick();
    }
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.callbacks.onContextLost?.();
  };

  private onContextRestored = (): void => {
    this.callbacks.onContextRestored?.();
  };

  private onResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.applyQualitySettings(width, height);
  };

  private setRayMouseFromEvent(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _rayMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
    this.pointerDownTime = performance.now();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const now = performance.now();
    if (now - this.lastHoverCheck < 75) return;
    this.lastHoverCheck = now;

    this.setRayMouseFromEvent(e);
    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.diorama.interactableProxies, false);
    const nextHover =
      hits.length > 0 ? (hits[0].object.userData.stageId as WaterCycleStageId) : null;

    if (nextHover !== this.hoveredStage) {
      this.hoveredStage = nextHover;
      this.renderer.domElement.style.cursor = nextHover ? 'pointer' : 'grab';
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const dx = e.clientX - this.pointerDownX;
    const dy = e.clientY - this.pointerDownY;
    const moveDist = Math.hypot(dx, dy);
    const elapsedMs = performance.now() - this.pointerDownTime;

    if (moveDist > 10 || elapsedMs > 400) return;

    this.setRayMouseFromEvent(e);
    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.diorama.interactableProxies, false);

    if (hits.length > 0) {
      const hit = hits[0];
      const hitStage = hit.object.userData.stageId as WaterCycleStageId;
      const targetStage =
        hitStage !== this.activeStage
          ? hitStage
          : STAGE_ORDER[(STAGE_ORDER.indexOf(this.activeStage) + 1) % STAGE_ORDER.length];

      this.particles.triggerTouchRipple(hit.point, WATER_CYCLE_STAGES[targetStage].accentHex);
      this.setStage(targetStage, true);
      this.callbacks.onStageSelect(targetStage, true);
    } else {
      const nextIdx = (STAGE_ORDER.indexOf(this.activeStage) + 1) % STAGE_ORDER.length;
      const nextStage = STAGE_ORDER[nextIdx];
      _fallbackRipplePos.set(...WATER_CYCLE_STAGES[nextStage].hotspotWorldPos);
      this.particles.triggerTouchRipple(_fallbackRipplePos, WATER_CYCLE_STAGES[nextStage].accentHex);
      this.setStage(nextStage, true);
      this.callbacks.onStageSelect(nextStage, true);
    }
  };

  public setStage(stageId: WaterCycleStageId, withCameraGlide = true): void {
    this.activeStage = stageId;
    const stage = WATER_CYCLE_STAGES[stageId];
    _camGoalPos.set(...stage.cameraPosition);
    _camGoalTarget.set(...stage.cameraTarget);
    if (withCameraGlide) {
      this.cameraTransitioning = true;
    }
  }

  public resetCamera(): void {
    const stage = WATER_CYCLE_STAGES[this.activeStage];
    _camGoalPos.set(...stage.cameraPosition);
    _camGoalTarget.set(...stage.cameraTarget);
    this.cameraTransitioning = true;
  }

  public setFlowGuidesVisible(visible: boolean): void {
    this.particles.setFlowGuidesVisible(visible);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed || this.paused) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick = (): void => {
    if (this.disposed || this.paused) return;

    const now = performance.now();
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.08);
    this.elapsedTime += dt;

    this.updateScene(dt, this.elapsedTime);
    this.renderer.render(this.scene, this.camera);
    this.projectHotspots();

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private updateScene(dt: number, elapsed: number): void {
    const stage = WATER_CYCLE_STAGES[this.activeStage];
    const mood = stage.mood;
    const damp = 1 - Math.exp(-3.2 * dt);

    if (this.cameraTransitioning) {
      const camDamp = 1 - Math.exp(-4.2 * dt);
      this.camera.position.lerp(_camGoalPos, camDamp);
      this.controls.target.lerp(_camGoalTarget, camDamp);
      if (
        this.camera.position.distanceToSquared(_camGoalPos) < 0.002 &&
        this.controls.target.distanceToSquared(_camGoalTarget) < 0.002
      ) {
        this.camera.position.copy(_camGoalPos);
        this.controls.target.copy(_camGoalTarget);
        this.cameraTransitioning = false;
      }
    }
    this.controls.update();

    _targetBgColor.setHex(mood.bgHex);
    _targetSkyTopColor.setHex(mood.skyTopHex);
    _targetFloorColor.copy(_targetBgColor).multiplyScalar(0.92);
    (this.scene.background as THREE.Color).lerp(_targetBgColor, damp);
    this.fog.color.lerp(_targetBgColor, damp);
    this.fog.density += (mood.fogDensity - this.fog.density) * damp;
    this.diorama.skyUniforms.uTopColor.value.lerp(_targetSkyTopColor, damp);
    this.diorama.skyUniforms.uHorizonColor.value.lerp(_targetBgColor, damp);
    this.diorama.studioFloorMat.color.lerp(_targetFloorColor, damp);

    _targetSunColor.setHex(mood.sunColorHex);
    this.sunLight.color.lerp(_targetSunColor, damp);
    this.sunLight.intensity += (mood.sunIntensity - this.sunLight.intensity) * damp;

    _targetHemiSky.setHex(mood.hemiSkyHex);
    _targetHemiGround.setHex(mood.hemiGroundHex);
    this.hemiLight.color.lerp(_targetHemiSky, damp);
    this.hemiLight.groundColor.lerp(_targetHemiGround, damp);
    this.hemiLight.intensity += (mood.hemiIntensity - this.hemiLight.intensity) * damp;
    this.rimLight.intensity += (mood.rimIntensity - this.rimLight.intensity) * damp;
    this.renderer.toneMappingExposure +=
      (mood.exposure - this.renderer.toneMappingExposure) * damp;

    // Animate natural blazing round sun photosphere & radiant camera-facing corona sprites
    this.diorama.sunUniforms.uTime.value = elapsed;
    const targetSunBright =
      this.activeStage === 'evaporasi'
        ? 1.45
        : this.activeStage === 'presipitasi'
          ? 0.35
          : 1.05;
    this.diorama.sunUniforms.uBrightness.value +=
      (targetSunBright - this.diorama.sunUniforms.uBrightness.value) * damp;

    const pulse = 1.0 + Math.sin(elapsed * 2.1) * 0.045;
    const flareScale = (this.activeStage === 'evaporasi' ? 4.8 : this.activeStage === 'presipitasi' ? 2.8 : 4.1) * pulse;
    const auraScale = (this.activeStage === 'evaporasi' ? 8.0 : this.activeStage === 'presipitasi' ? 4.4 : 6.8) * (1.0 + Math.cos(elapsed * 1.4) * 0.04);
    const curFlare = THREE.MathUtils.lerp(this.diorama.sunInnerFlare.scale.x, flareScale, damp);
    const curAura = THREE.MathUtils.lerp(this.diorama.sunOuterAura.scale.x, auraScale, damp);
    this.diorama.sunInnerFlare.scale.set(curFlare, curFlare, 1);
    this.diorama.sunOuterAura.scale.set(curAura, curAura, 1);

    const targetInnerOp =
      this.activeStage === 'evaporasi' ? 1.0 : this.activeStage === 'presipitasi' ? 0.45 : 0.92;
    const targetOuterOp =
      this.activeStage === 'evaporasi' ? 0.68 : this.activeStage === 'presipitasi' ? 0.2 : 0.52;
    const targetHaloOp =
      this.activeStage === 'evaporasi' ? 0.48 : this.activeStage === 'presipitasi' ? 0.14 : 0.36;
    this.diorama.sunInnerFlareMat.opacity +=
      (targetInnerOp - this.diorama.sunInnerFlareMat.opacity) * damp;
    this.diorama.sunOuterAuraMat.opacity +=
      (targetOuterOp - this.diorama.sunOuterAuraMat.opacity) * damp;
    this.diorama.sunHaloMat.opacity +=
      (targetHaloOp - this.diorama.sunHaloMat.opacity) * damp;

    const targetBeamOpacity =
      this.activeStage === 'evaporasi'
        ? 0.24
        : this.activeStage === 'transpirasi'
          ? 0.14
          : this.activeStage === 'presipitasi'
            ? 0.02
            : 0.12;
    this.diorama.sunBeamMat.opacity += (targetBeamOpacity - this.diorama.sunBeamMat.opacity) * damp;

    this.diorama.oceanUniforms.uTime.value = elapsed;
    const targetWaveAmp = this.activeStage === 'presipitasi' ? 0.125 : 0.088;
    this.diorama.oceanUniforms.uWaveAmp.value +=
      (targetWaveAmp - this.diorama.oceanUniforms.uWaveAmp.value) * damp;
    const curWaveAmp = this.diorama.oceanUniforms.uWaveAmp.value;

    const targetEvapGlow =
      this.activeStage === 'evaporasi'
        ? 1.0
        : this.activeStage === 'overview'
          ? 0.34
          : this.activeStage === 'presipitasi'
            ? 0.04
            : 0.14;
    this.diorama.oceanUniforms.uEvapGlow.value +=
      (targetEvapGlow - this.diorama.oceanUniforms.uEvapGlow.value) * damp;

    const targetInfilGlow =
      this.activeStage === 'infiltrasi'
        ? 1.0
        : this.activeStage === 'overview'
          ? 0.28
          : 0.1;
    this.diorama.oceanUniforms.uInfilGlow.value +=
      (targetInfilGlow - this.diorama.oceanUniforms.uInfilGlow.value) * damp;

    // Subtle dynamic water specular gloss: mirror-like shimmer during Evaporasi & Infiltrasi
    const targetOceanRough =
      this.activeStage === 'evaporasi' || this.activeStage === 'infiltrasi'
        ? 0.08
        : this.activeStage === 'presipitasi'
          ? 0.19
          : 0.12;
    this.diorama.oceanMaterial.roughness +=
      (targetOceanRough - this.diorama.oceanMaterial.roughness) * damp;

    const targetRiverRough = this.activeStage === 'infiltrasi' ? 0.08 : 0.13;
    this.diorama.riverMaterial.roughness +=
      (targetRiverRough - this.diorama.riverMaterial.roughness) * damp;

    this.textures.waterNormalBump.offset.x = (elapsed * 0.045) % 1;
    this.textures.waterNormalBump.offset.y = (elapsed * 0.028) % 1;

    // Sync traditional fishing boat heave, pitch, and roll directly to the natural ocean swells
    const bx = this.diorama.boatBasePos.x;
    const bz = this.diorama.boatBasePos.z;
    const hCenter = oceanWaveHeightAt(bx, bz, elapsed, curWaveAmp);
    const hBow = oceanWaveHeightAt(bx + 0.55, bz - 0.18, elapsed, curWaveAmp);
    const hStern = oceanWaveHeightAt(bx - 0.55, bz + 0.18, elapsed, curWaveAmp);
    const hPort = oceanWaveHeightAt(bx - 0.12, bz - 0.32, elapsed, curWaveAmp);
    const hStbd = oceanWaveHeightAt(bx + 0.12, bz + 0.32, elapsed, curWaveAmp);
    this.diorama.boatGroup.position.y = this.diorama.boatBasePos.y + hCenter;
    this.diorama.boatGroup.rotation.z = THREE.MathUtils.clamp((hBow - hStern) * 0.68, -0.18, 0.18);
    this.diorama.boatGroup.rotation.x = THREE.MathUtils.clamp((hStbd - hPort) * 0.72, -0.16, 0.16);

    // --- Animated Fisherman Busy Casting Net (Lempar Jala) & Hauling Catch (Tarik Ikan) ---
    const rig = this.diorama.fishermanRig;
    const cycle = (elapsed % 6.2) / 6.2; // 6.2s lively looping net-casting & hauling action
    const netTargetX = 1.28;
    const netTargetZ = 0.62;
    let netX = 0.44;
    let netY = 0.42;
    let netZ = 0.18;
    let netSpread = 0.24;
    let netHeightScale = 0.85;
    let netTiltZ = 0;

    if (cycle < 0.2) {
      // Phase 1: Wind-up & gather net while twisting torso back
      const p = cycle / 0.2;
      const e = THREE.MathUtils.smoothstep(p, 0, 1);
      rig.torsoPivot.rotation.y = THREE.MathUtils.lerp(0.15, -0.78, e);
      rig.torsoPivot.rotation.z = THREE.MathUtils.lerp(0.0, 0.18, e);
      rig.leftArmPivot.rotation.set(-0.35, 0, -0.85 - e * 0.35);
      rig.rightArmPivot.rotation.set(0.45, 0, -0.55 - e * 0.45);
      netX = THREE.MathUtils.lerp(0.42, 0.28, e);
      netY = THREE.MathUtils.lerp(0.44, 0.56, e);
      netZ = THREE.MathUtils.lerp(0.14, 0.26, e);
      netSpread = 0.22;
      netHeightScale = 0.92;
      rig.caughtFishGroup.visible = false;
      rig.splashMat.opacity = 0;
    } else if (cycle < 0.42) {
      // Phase 2: Dynamic throw! Fisherman lunges forward as circular net arcs & blooms open over the sea
      const p = (cycle - 0.2) / 0.22;
      const e = 1 - Math.pow(1 - p, 2.2);
      rig.torsoPivot.rotation.y = THREE.MathUtils.lerp(-0.78, 0.62, e);
      rig.torsoPivot.rotation.z = THREE.MathUtils.lerp(0.18, -0.26, e);
      rig.leftArmPivot.rotation.set(-0.25, 0, THREE.MathUtils.lerp(-1.2, 1.35, e));
      rig.rightArmPivot.rotation.set(0.35, 0, THREE.MathUtils.lerp(-1.0, 1.48, e));
      netX = THREE.MathUtils.lerp(0.28, netTargetX, p);
      netZ = THREE.MathUtils.lerp(0.26, netTargetZ, p);
      netY = THREE.MathUtils.lerp(0.56, 0.14, p) + Math.sin(p * Math.PI) * 0.88;
      netSpread = THREE.MathUtils.lerp(0.24, 1.12, Math.pow(p, 0.72));
      netHeightScale = THREE.MathUtils.lerp(0.9, 0.68, p);
      netTiltZ = -Math.cos(p * Math.PI) * 0.42;
      rig.caughtFishGroup.visible = false;
      rig.splashMat.opacity = 0;
    } else if (cycle < 0.56) {
      // Phase 3: Splashdown onto ocean waves & net sinks slightly to trap fish
      const p = (cycle - 0.42) / 0.14;
      rig.torsoPivot.rotation.y = THREE.MathUtils.lerp(0.62, 0.35, p);
      rig.torsoPivot.rotation.z = THREE.MathUtils.lerp(-0.26, -0.14, p);
      rig.leftArmPivot.rotation.set(-0.15, 0, THREE.MathUtils.lerp(1.35, 0.88, p));
      rig.rightArmPivot.rotation.set(0.2, 0, THREE.MathUtils.lerp(1.48, 0.96, p));
      netX = netTargetX;
      netZ = netTargetZ;
      netY = THREE.MathUtils.lerp(0.14, -0.02, p);
      netSpread = THREE.MathUtils.lerp(1.12, 0.92, p);
      netHeightScale = THREE.MathUtils.lerp(0.68, 0.85, p);
      rig.caughtFishGroup.visible = false;
      // Expanding white water splash ring around cast net landing spot
      rig.splashRing.position.set(netTargetX, 0.02, netTargetZ);
      rig.splashRing.scale.setScalar(0.65 + p * 0.95);
      rig.splashMat.opacity = Math.sin(p * Math.PI) * 0.82;
    } else if (cycle < 0.9) {
      // Phase 4: Busy hand-over-hand hauling! Fisherman pulls rope rhythmically bringing gleaming fish aboard
      const p = (cycle - 0.56) / 0.34;
      const pullWave = Math.sin(p * Math.PI * 6.0);
      rig.torsoPivot.rotation.y = 0.25 + pullWave * 0.14;
      rig.torsoPivot.rotation.z = 0.16 + pullWave * 0.12;
      rig.leftArmPivot.rotation.set(-0.1, 0, 0.72 + pullWave * 0.48);
      rig.rightArmPivot.rotation.set(0.15, 0, 0.72 - pullWave * 0.48);
      netX = THREE.MathUtils.lerp(netTargetX, 0.46, p);
      netZ = THREE.MathUtils.lerp(netTargetZ, 0.24, p);
      netY = THREE.MathUtils.lerp(-0.02, 0.46, Math.pow(p, 1.45));
      netSpread = THREE.MathUtils.lerp(0.92, 0.28, p);
      netHeightScale = THREE.MathUtils.lerp(0.85, 1.08, p);
      netTiltZ = 0.22 * (1 - p);
      rig.caughtFishGroup.visible = p > 0.28;
      rig.caughtFishGroup.rotation.y = elapsed * 9.0;
      rig.splashMat.opacity = 0;
    } else {
      // Phase 5: Drop caught fish toward boat & gather net smoothly for next throw
      const p = (cycle - 0.9) / 0.1;
      rig.torsoPivot.rotation.y = THREE.MathUtils.lerp(0.25, 0.15, p);
      rig.torsoPivot.rotation.z = THREE.MathUtils.lerp(0.16, 0.0, p);
      rig.leftArmPivot.rotation.set(-0.2, 0, THREE.MathUtils.lerp(0.65, -0.85, p));
      rig.rightArmPivot.rotation.set(0.25, 0, THREE.MathUtils.lerp(0.65, -0.55, p));
      netX = THREE.MathUtils.lerp(0.46, 0.42, p);
      netY = THREE.MathUtils.lerp(0.46, 0.44, p);
      netZ = THREE.MathUtils.lerp(0.24, 0.14, p);
      netSpread = THREE.MathUtils.lerp(0.28, 0.22, p);
      netHeightScale = 0.92;
      rig.caughtFishGroup.visible = p < 0.45;
      rig.splashMat.opacity = 0;
    }

    rig.netGroup.position.set(netX, netY, netZ);
    rig.netGroup.scale.set(netSpread, netHeightScale, netSpread);
    rig.netGroup.rotation.z = netTiltZ;

    // Stretch haul rope smoothly between fisherman's hands and net apex
    _ropeStart.set(
      0.32 + Math.sin(rig.torsoPivot.rotation.y) * 0.08,
      0.43 - rig.torsoPivot.rotation.z * 0.18,
      0.08 + Math.cos(rig.torsoPivot.rotation.y) * 0.06
    );
    _ropeEnd.set(netX, netY, netZ);
    _ropeMid.addVectors(_ropeStart, _ropeEnd).multiplyScalar(0.5);
    _ropeDir.subVectors(_ropeEnd, _ropeStart);
    const ropeLen = Math.max(_ropeDir.length(), 0.001);
    rig.ropeMesh.position.copy(_ropeMid);
    rig.ropeMesh.scale.set(1, ropeLen, 1);
    _ropeDir.divideScalar(ropeLen);
    _ropeQuat.setFromUnitVectors(_yAxis, _ropeDir);
    rig.ropeMesh.quaternion.copy(_ropeQuat);

    const targetAquiferEmissive =
      this.activeStage === 'infiltrasi' ? 1.55 : this.activeStage === 'overview' ? 0.72 : 0.45;
    this.diorama.aquiferGlowMaterial.emissiveIntensity +=
      (targetAquiferEmissive - this.diorama.aquiferGlowMaterial.emissiveIntensity) * damp;

    this.currentCloudDarkness += (mood.cloudDarkness - this.currentCloudDarkness) * damp;
    for (let i = 0; i < this.diorama.clouds.length; i++) {
      const c = this.diorama.clouds[i];
      const bobY = Math.sin(elapsed * 0.65 + c.phase) * 0.11;
      const swayX = Math.cos(elapsed * 0.35 + c.phase) * 0.18;
      c.group.position.set(c.basePos.x + swayX, c.basePos.y + bobY, c.basePos.z);

      const swell =
        this.activeStage === 'kondensasi' && c.role !== 'storm'
          ? 1.12
          : this.activeStage === 'presipitasi' && c.role === 'storm'
            ? 1.14
            : 1.0;
      const s = THREE.MathUtils.lerp(c.group.scale.x, c.baseScale * swell, damp);
      c.group.scale.setScalar(s);

      const roleFactor =
        c.role === 'storm'
          ? Math.min(this.currentCloudDarkness * 1.15 + 0.15, 1.0)
          : this.currentCloudDarkness * 0.68;

      _tempColor.copy(_cloudLightColor).lerp(_cloudStormColor, roleFactor);
      c.materials[0].color.copy(_tempColor);
      _tempColor.copy(_cloudUnderLight).lerp(_cloudUnderStorm, roleFactor);
      c.materials[1].color.copy(_tempColor);
    }

    if (this.activeStage === 'presipitasi') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.diorama.lightningLight.intensity = 6.5;
        this.lightningTimer = 2.6 + Math.random() * 2.8;
      } else {
        this.diorama.lightningLight.intensity *= Math.exp(-8.5 * dt);
      }
    } else {
      this.diorama.lightningLight.intensity *= Math.exp(-6.0 * dt);
    }

    this.particles.update(dt, elapsed, this.activeStage);
    this.wildlife.update(dt, elapsed, this.activeStage);
  }

  private projectHotspots(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    let anyChanged = false;
    for (let i = 0; i < INTERACTIVE_ZONES.length; i++) {
      const id = INTERACTIVE_ZONES[i];
      const worldPos = WATER_CYCLE_STAGES[id].hotspotWorldPos;
      _projVec.set(worldPos[0], worldPos[1], worldPos[2]).project(this.camera);

      const inFront = _projVec.z >= -1 && _projVec.z <= 1;
      const sx = ((_projVec.x + 1) * 0.5) * width;
      const sy = ((-_projVec.y + 1) * 0.5) * height;
      const onScreen = inFront && sx > 36 && sx < width - 36 && sy > 52 && sy < height - 96;

      const prev = this.hotspotPositions[i];
      if (
        prev.visible !== onScreen ||
        Math.abs(prev.x - sx) > 0.45 ||
        Math.abs(prev.y - sy) > 0.45
      ) {
        prev.x = sx;
        prev.y = sy;
        prev.visible = onScreen;
        anyChanged = true;
      }
    }

    if (anyChanged) {
      this.callbacks.onHotspotsProject(this.hotspotPositions);
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    this.controls.removeEventListener('start', this.onControlsStart);
    this.controls.dispose();
    this.particles.dispose();
    this.wildlife.dispose();
    this.diorama.disposables.forEach((d) => d.dispose());
    this.textures.dispose();
    this.envRenderTarget.dispose();
    this.renderer.dispose();

    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }
}
