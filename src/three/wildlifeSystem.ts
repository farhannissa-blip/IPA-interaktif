import * as THREE from 'three';
import { WaterCycleStageId } from '../data/waterCycleData';
import { WATER_LEVEL, coastlineX, terrainHeightAt } from './terrainMath';

// Module-scope scratch math helpers (Zero GC in render loop)
const _pos = new THREE.Vector3();
const _nextPos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _lookAtPos = new THREE.Vector3();

interface FlyingBirdActor {
  group: THREE.Group;
  leftWing: THREE.Group;
  rightWing: THREE.Group;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  baseY: number;
  bobAmp: number;
  speed: number;
  phase: number;
  flapSpeed: number;
  figureEight: boolean;
  clockwise: number;
}

interface ReefFishActor {
  group: THREE.Group;
  tailPivot: THREE.Group;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  depthY: number;
  speed: number;
  phase: number;
  figureEight: boolean;
  clockwise: number;
}

interface DolphinActor {
  group: THREE.Group;
  tailPivot: THREE.Group;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  speed: number;
  phase: number;
  leapFreq: number;
  leapHeight: number;
}

interface SeaTurtleActor {
  group: THREE.Group;
  frontLeft: THREE.Group;
  frontRight: THREE.Group;
  backLeft: THREE.Group;
  backRight: THREE.Group;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  depthY: number;
  speed: number;
  phase: number;
}

interface BeachCrabActor {
  group: THREE.Group;
  leftClaw: THREE.Group;
  rightClaw: THREE.Group;
  leftLegs: THREE.Group[];
  rightLegs: THREE.Group[];
  zCenter: number;
  zRange: number;
  inlandBase: number;
  inlandSway: number;
  speed: number;
  phase: number;
}

/**
 * Composite 3D Wildlife System bringing the water cycle diorama to life:
 * - 6 articulated soaring birds with flapping wings across the sky & coastline
 * - 7 colorful tropical reef fish swimming beneath the translucent ocean
 * - 2 playful leaping dolphins arcing cleanly above the ocean waves
 * - 1 graceful sea turtle rowing through the clear front coastal bay
 * - 5 lively red-orange beach crabs scuttling sideways across the golden sandy beach
 * 100% procedural geometry, Zero-GC render updates, full resource disposal.
 */
export class WaterCycleWildlifeSystem {
  public readonly group = new THREE.Group();
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private birds: FlyingBirdActor[] = [];
  private fishes: ReefFishActor[] = [];
  private dolphins: DolphinActor[] = [];
  private turtle!: SeaTurtleActor;
  private crabs: BeachCrabActor[] = [];

  private stormDipWeight = 0;

  constructor() {
    this.buildFlyingBirds();
    this.buildReefFish();
    this.buildDolphins();
    this.buildSeaTurtle();
    this.buildBeachCrabs();
  }

  private buildFlyingBirds(): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xfbfcff,
      roughness: 0.55,
      metalness: 0.02,
    });
    const wingTipMat = new THREE.MeshStandardMaterial({
      color: 0x33465e,
      roughness: 0.62,
      metalness: 0.05,
    });
    const beakMat = new THREE.MeshStandardMaterial({
      color: 0xf2a922,
      roughness: 0.42,
      metalness: 0.08,
    });
    this.disposables.push(bodyMat, wingTipMat, beakMat);

    // Streamlined bird parts facing +Z so lookAt aligns nose forward seamlessly
    const bodyGeo = new THREE.SphereGeometry(0.068, 10, 8);
    bodyGeo.scale(0.85, 0.72, 2.05);

    const headGeo = new THREE.SphereGeometry(0.048, 8, 6);
    const beakGeo = new THREE.ConeGeometry(0.02, 0.09, 5);
    beakGeo.rotateX(Math.PI / 2);

    const tailGeo = new THREE.ConeGeometry(0.058, 0.14, 4);
    tailGeo.scale(1.25, 0.25, 1.0);
    tailGeo.rotateX(-Math.PI / 2);

    // Swept inner & outer wing segments pivoted cleanly from shoulder
    const innerWingGeo = new THREE.BoxGeometry(0.18, 0.016, 0.11);
    const outerWingGeo = new THREE.ConeGeometry(0.055, 0.19, 4);
    outerWingGeo.scale(1.0, 1.0, 0.28);

    this.disposables.push(bodyGeo, headGeo, beakGeo, tailGeo, innerWingGeo, outerWingGeo);

    const birdConfigs = [
      // Forest & valley thermal soarers
      { cx: -0.6, cz: -0.4, rx: 2.8, rz: 1.9, y: 4.95, bob: 0.24, spd: 0.34, ph: 0.0, flap: 7.4, fig8: true, cw: 1, sc: 1.05 },
      { cx: -1.1, cz: 0.3, rx: 2.3, rz: 1.6, y: 4.55, bob: 0.2, spd: 0.38, ph: 2.1, flap: 8.1, fig8: false, cw: 1, sc: 0.94 },
      { cx: 0.4, cz: -0.8, rx: 3.1, rz: 2.1, y: 5.35, bob: 0.22, spd: 0.3, ph: 4.0, flap: 6.9, fig8: true, cw: -1, sc: 1.08 },
      { cx: -1.9, cz: 1.1, rx: 1.8, rz: 1.4, y: 4.15, bob: 0.18, spd: 0.41, ph: 1.2, flap: 8.4, fig8: false, cw: -1, sc: 0.88 },
      // Sunlit coastal seagulls gliding over the ocean
      { cx: 3.3, cz: 0.2, rx: 1.45, rz: 2.2, y: 3.15, bob: 0.26, spd: 0.44, ph: 3.3, flap: 7.8, fig8: false, cw: 1, sc: 1.02 },
      { cx: 3.6, cz: -0.4, rx: 1.25, rz: 1.85, y: 2.75, bob: 0.22, spd: 0.48, ph: 5.2, flap: 8.5, fig8: true, cw: -1, sc: 0.92 },
    ];

    birdConfigs.forEach((cfg) => {
      const bird = new THREE.Group();
      bird.scale.setScalar(cfg.sc);

      const body = new THREE.Mesh(bodyGeo, bodyMat);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.set(0, 0.024, 0.13);
      const beak = new THREE.Mesh(beakGeo, beakMat);
      beak.position.set(0, 0.018, 0.205);
      const tail = new THREE.Mesh(tailGeo, wingTipMat);
      tail.position.set(0, 0.008, -0.17);
      bird.add(body, head, beak, tail);

      // Left articulated wing
      const leftWing = new THREE.Group();
      leftWing.position.set(0.045, 0.018, 0.02);
      const lInner = new THREE.Mesh(innerWingGeo, bodyMat);
      lInner.position.set(0.09, 0, -0.01);
      lInner.rotation.y = -0.18;
      const lOuter = new THREE.Mesh(outerWingGeo, wingTipMat);
      lOuter.rotation.z = -Math.PI / 2;
      lOuter.rotation.y = -0.25;
      lOuter.position.set(0.25, 0, -0.045);
      leftWing.add(lInner, lOuter);

      // Right articulated wing (mirrored)
      const rightWing = new THREE.Group();
      rightWing.position.set(-0.045, 0.018, 0.02);
      const rInner = new THREE.Mesh(innerWingGeo, bodyMat);
      rInner.position.set(-0.09, 0, -0.01);
      rInner.rotation.y = 0.18;
      const rOuter = new THREE.Mesh(outerWingGeo, wingTipMat);
      rOuter.rotation.z = Math.PI / 2;
      rOuter.rotation.y = 0.25;
      rOuter.position.set(-0.25, 0, -0.045);
      rightWing.add(rInner, rOuter);

      bird.add(leftWing, rightWing);
      this.group.add(bird);

      this.birds.push({
        group: bird,
        leftWing,
        rightWing,
        centerX: cfg.cx,
        centerZ: cfg.cz,
        radiusX: cfg.rx,
        radiusZ: cfg.rz,
        baseY: cfg.y,
        bobAmp: cfg.bob,
        speed: cfg.spd,
        phase: cfg.ph,
        flapSpeed: cfg.flap,
        figureEight: cfg.fig8,
        clockwise: cfg.cw,
      });
    });
  }

  private buildReefFish(): void {
    const palettes = [
      { body: 0xff7526, stripe: 0xfff8ee, fin: 0xffa63d }, // Clownfish Coral Orange
      { body: 0xffc42e, stripe: 0x1e3854, fin: 0xffe47a }, // Butterflyfish Gold
      { body: 0x1db8e8, stripe: 0xfff599, fin: 0x5be3ff }, // Blue Tang Turquoise
    ];

    const bodyGeo = new THREE.SphereGeometry(0.068, 10, 8);
    bodyGeo.scale(0.55, 0.92, 1.85);
    const stripeGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.042, 8);
    stripeGeo.rotateX(Math.PI / 2);
    stripeGeo.scale(0.95, 1.38, 1.0);
    const dorsalGeo = new THREE.ConeGeometry(0.04, 0.095, 4);
    dorsalGeo.scale(0.3, 1.0, 1.45);
    const tailGeo = new THREE.ConeGeometry(0.068, 0.11, 4);
    tailGeo.scale(0.24, 1.0, 1.0);
    tailGeo.rotateX(Math.PI / 2);
    const eyeGeo = new THREE.SphereGeometry(0.012, 6, 5);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0d1520, roughness: 0.12, metalness: 0.1 });

    this.disposables.push(bodyGeo, stripeGeo, dorsalGeo, tailGeo, eyeGeo, eyeMat);

    const paletteMats = palettes.map((p) => {
      const bMat = new THREE.MeshStandardMaterial({
        color: p.body,
        emissive: p.body,
        emissiveIntensity: 0.22,
        roughness: 0.28,
        metalness: 0.08,
      });
      const sMat = new THREE.MeshStandardMaterial({
        color: p.stripe,
        roughness: 0.35,
        metalness: 0.04,
      });
      const fMat = new THREE.MeshStandardMaterial({
        color: p.fin,
        emissive: p.fin,
        emissiveIntensity: 0.16,
        roughness: 0.35,
        metalness: 0.05,
      });
      this.disposables.push(bMat, sMat, fMat);
      return { bMat, sMat, fMat };
    });

    const fishConfigs = [
      { cx: 3.75, cz: 0.45, rx: 0.72, rz: 1.15, y: -0.22, spd: 0.58, ph: 0.0, fig8: true, cw: 1, sc: 1.18, pal: 0 },
      { cx: 5.45, cz: 0.85, rx: 0.95, rz: 1.15, y: -0.27, spd: 0.62, ph: 0.65, fig8: true, cw: 1, sc: 1.02, pal: 0 },
      { cx: 6.45, cz: -1.1, rx: 1.05, rz: 1.2, y: -0.24, spd: 0.52, ph: 1.8, fig8: false, cw: -1, sc: 1.26, pal: 1 },
      { cx: 7.05, cz: 1.45, rx: 0.78, rz: 1.05, y: -0.32, spd: 0.56, ph: 2.5, fig8: false, cw: -1, sc: 1.08, pal: 2 },
      { cx: 4.55, cz: 2.35, rx: 0.85, rz: 0.72, y: -0.25, spd: 0.64, ph: 3.7, fig8: true, cw: 1, sc: 1.15, pal: 2 },
      { cx: 3.85, cz: -1.95, rx: 0.72, rz: 0.95, y: -0.28, spd: 0.54, ph: 4.6, fig8: false, cw: 1, sc: 1.1, pal: 1 },
      { cx: 6.65, cz: 0.15, rx: 0.85, rz: 1.1, y: -0.34, spd: 0.6, ph: 5.4, fig8: false, cw: -1, sc: 1.06, pal: 0 },
    ];

    fishConfigs.forEach((cfg) => {
      const mats = paletteMats[cfg.pal];
      const fish = new THREE.Group();
      fish.scale.setScalar(cfg.sc);

      const body = new THREE.Mesh(bodyGeo, mats.bMat);
      const stripe = new THREE.Mesh(stripeGeo, mats.sMat);
      stripe.position.z = 0.015;
      const dorsal = new THREE.Mesh(dorsalGeo, mats.fMat);
      dorsal.position.set(0, 0.072, -0.01);
      dorsal.rotation.x = -0.32;

      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(0.028, 0.018, 0.085);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeR.position.set(-0.028, 0.018, 0.085);

      const tailPivot = new THREE.Group();
      tailPivot.position.set(0, 0, -0.11);
      const tail = new THREE.Mesh(tailGeo, mats.fMat);
      tail.position.z = -0.048;
      tailPivot.add(tail);

      fish.add(body, stripe, dorsal, eyeL, eyeR, tailPivot);
      this.group.add(fish);

      this.fishes.push({
        group: fish,
        tailPivot,
        centerX: cfg.cx,
        centerZ: cfg.cz,
        radiusX: cfg.rx,
        radiusZ: cfg.rz,
        depthY: cfg.y,
        speed: cfg.spd,
        phase: cfg.ph,
        figureEight: cfg.fig8,
        clockwise: cfg.cw,
      });
    });
  }

  private buildDolphins(): void {
    const backMat = new THREE.MeshStandardMaterial({
      color: 0x3b8bc4,
      emissive: 0x0d2f4d,
      emissiveIntensity: 0.18,
      roughness: 0.2,
      metalness: 0.12,
    });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: 0xe6f4fc,
      roughness: 0.26,
      metalness: 0.04,
    });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a111a, roughness: 0.1 });
    this.disposables.push(backMat, bellyMat, eyeMat);

    // Sleek composite dolphin facing +Z
    const torsoGeo = new THREE.SphereGeometry(0.115, 12, 10);
    torsoGeo.scale(0.82, 0.88, 2.55);

    const bellyGeo = new THREE.SphereGeometry(0.095, 10, 8);
    bellyGeo.scale(0.78, 0.62, 2.15);

    const snoutGeo = new THREE.ConeGeometry(0.048, 0.17, 8);
    snoutGeo.rotateX(Math.PI / 2);

    const dorsalGeo = new THREE.ConeGeometry(0.048, 0.145, 5);
    dorsalGeo.scale(0.32, 1.0, 1.35);

    const flipperGeo = new THREE.ConeGeometry(0.042, 0.15, 4);
    flipperGeo.scale(1.0, 1.0, 0.35);

    const tailPeduncleGeo = new THREE.ConeGeometry(0.052, 0.22, 7);
    tailPeduncleGeo.rotateX(-Math.PI / 2);

    const flukeGeo = new THREE.BoxGeometry(0.22, 0.018, 0.09);
    const eyeGeo = new THREE.SphereGeometry(0.014, 6, 5);

    this.disposables.push(
      torsoGeo,
      bellyGeo,
      snoutGeo,
      dorsalGeo,
      flipperGeo,
      tailPeduncleGeo,
      flukeGeo,
      eyeGeo
    );

    const dolphinConfigs = [
      { cx: 6.45, cz: -0.75, rx: 1.15, rz: 1.75, spd: 0.42, ph: 0.0, leapFreq: 1.0, leapH: 0.58, sc: 1.1 },
      { cx: 5.85, cz: 1.15, rx: 1.05, rz: 1.55, spd: 0.45, ph: 3.1, leapFreq: 1.0, leapH: 0.5, sc: 0.96 },
    ];

    dolphinConfigs.forEach((cfg) => {
      const dolphin = new THREE.Group();
      dolphin.scale.setScalar(cfg.sc);

      const torso = new THREE.Mesh(torsoGeo, backMat);
      const belly = new THREE.Mesh(bellyGeo, bellyMat);
      belly.position.set(0, -0.036, 0.02);

      const snout = new THREE.Mesh(snoutGeo, backMat);
      snout.position.set(0, -0.012, 0.31);

      const dorsal = new THREE.Mesh(dorsalGeo, backMat);
      dorsal.position.set(0, 0.125, -0.03);
      dorsal.rotation.x = -0.38;

      const flipL = new THREE.Mesh(flipperGeo, backMat);
      flipL.position.set(0.095, -0.035, 0.06);
      flipL.rotation.set(0.25, -0.3, -1.18);

      const flipR = new THREE.Mesh(flipperGeo, backMat);
      flipR.position.set(-0.095, -0.035, 0.06);
      flipR.rotation.set(0.25, 0.3, 1.18);

      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(0.062, 0.02, 0.19);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeR.position.set(-0.062, 0.02, 0.19);

      const tailPivot = new THREE.Group();
      tailPivot.position.set(0, 0, -0.22);
      const peduncle = new THREE.Mesh(tailPeduncleGeo, backMat);
      peduncle.position.z = -0.09;
      const fluke = new THREE.Mesh(flukeGeo, backMat);
      fluke.position.z = -0.2;
      tailPivot.add(peduncle, fluke);

      dolphin.add(torso, belly, snout, dorsal, flipL, flipR, eyeL, eyeR, tailPivot);
      this.group.add(dolphin);

      this.dolphins.push({
        group: dolphin,
        tailPivot,
        centerX: cfg.cx,
        centerZ: cfg.cz,
        radiusX: cfg.rx,
        radiusZ: cfg.rz,
        speed: cfg.spd,
        phase: cfg.ph,
        leapFreq: cfg.leapFreq,
        leapHeight: cfg.leapH,
      });
    });
  }

  private buildSeaTurtle(): void {
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x387a4e,
      emissive: 0x113621,
      emissiveIntensity: 0.2,
      roughness: 0.42,
      metalness: 0.06,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x8ea85e,
      roughness: 0.5,
      metalness: 0.04,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x5c9662,
      roughness: 0.55,
      metalness: 0.02,
    });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b1218, roughness: 0.15 });
    this.disposables.push(shellMat, rimMat, skinMat, eyeMat);

    const shellGeo = new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    shellGeo.scale(0.88, 0.52, 1.15);

    const plastronGeo = new THREE.CylinderGeometry(0.135, 0.125, 0.028, 10);
    plastronGeo.scale(0.88, 1.0, 1.15);

    const headGeo = new THREE.SphereGeometry(0.052, 8, 6);
    headGeo.scale(0.92, 0.82, 1.2);

    const frontFlipGeo = new THREE.BoxGeometry(0.18, 0.018, 0.068);
    const backFlipGeo = new THREE.BoxGeometry(0.1, 0.015, 0.055);
    const eyeGeo = new THREE.SphereGeometry(0.011, 6, 5);
    this.disposables.push(shellGeo, plastronGeo, headGeo, frontFlipGeo, backFlipGeo, eyeGeo);

    const turtleGroup = new THREE.Group();
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.y = 0.008;
    const plastron = new THREE.Mesh(plastronGeo, rimMat);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 0.015, 0.215);

    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.032, 0.028, 0.255);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(-0.032, 0.028, 0.255);

    const frontLeft = new THREE.Group();
    frontLeft.position.set(0.11, 0.0, 0.09);
    const flMesh = new THREE.Mesh(frontFlipGeo, skinMat);
    flMesh.position.set(0.08, 0, -0.015);
    flMesh.rotation.y = -0.35;
    frontLeft.add(flMesh);

    const frontRight = new THREE.Group();
    frontRight.position.set(-0.11, 0.0, 0.09);
    const frMesh = new THREE.Mesh(frontFlipGeo, skinMat);
    frMesh.position.set(-0.08, 0, -0.015);
    frMesh.rotation.y = 0.35;
    frontRight.add(frMesh);

    const backLeft = new THREE.Group();
    backLeft.position.set(0.085, -0.005, -0.14);
    const blMesh = new THREE.Mesh(backFlipGeo, skinMat);
    blMesh.position.set(0.045, 0, -0.02);
    blMesh.rotation.y = -0.6;
    backLeft.add(blMesh);

    const backRight = new THREE.Group();
    backRight.position.set(-0.085, -0.005, -0.14);
    const brMesh = new THREE.Mesh(backFlipGeo, skinMat);
    brMesh.position.set(-0.045, 0, -0.02);
    brMesh.rotation.y = 0.6;
    backRight.add(brMesh);

    turtleGroup.add(shell, plastron, head, eyeL, eyeR, frontLeft, frontRight, backLeft, backRight);
    turtleGroup.scale.setScalar(1.22);
    this.group.add(turtleGroup);

    this.turtle = {
      group: turtleGroup,
      frontLeft,
      frontRight,
      backLeft,
      backRight,
      centerX: 4.25,
      centerZ: 2.55,
      radiusX: 0.92,
      radiusZ: 0.65,
      depthY: -0.24,
      speed: 0.26,
      phase: 0.8,
    };
  }

  private buildBeachCrabs(): void {
    const shellColors = [0xe8482c, 0xf05d28, 0xd93b26, 0xee6830, 0xe0452b];
    const clawMat = new THREE.MeshStandardMaterial({
      color: 0xff6e3a,
      roughness: 0.38,
      metalness: 0.06,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: 0xc93b24,
      roughness: 0.52,
      metalness: 0.04,
    });
    const eyeStalkMat = new THREE.MeshStandardMaterial({ color: 0xf7b98f, roughness: 0.5 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.1, metalness: 0.12 });

    const bodyGeo = new THREE.SphereGeometry(0.068, 10, 7);
    bodyGeo.scale(1.38, 0.56, 1.02);
    const stalkGeo = new THREE.CylinderGeometry(0.008, 0.009, 0.036, 5);
    const eyeGeo = new THREE.SphereGeometry(0.012, 6, 5);
    const clawArmGeo = new THREE.CylinderGeometry(0.012, 0.01, 0.065, 5);
    clawArmGeo.rotateX(Math.PI / 2);
    const pincerGeo = new THREE.SphereGeometry(0.028, 7, 5);
    pincerGeo.scale(0.82, 0.72, 1.38);
    const legGeo = new THREE.CylinderGeometry(0.008, 0.006, 0.095, 5);
    legGeo.rotateZ(Math.PI / 2);
    legGeo.translate(0.045, -0.015, 0);

    this.disposables.push(
      clawMat,
      legMat,
      eyeStalkMat,
      eyeMat,
      bodyGeo,
      stalkGeo,
      eyeGeo,
      clawArmGeo,
      pincerGeo,
      legGeo
    );

    const crabConfigs = [
      { zCenter: 2.95, zRange: 0.45, inlandBase: 0.48, inlandSway: 0.14, speed: 0.62, phase: 0.2, scale: 1.26 },
      { zCenter: 2.38, zRange: 0.34, inlandBase: 0.74, inlandSway: 0.12, speed: 0.54, phase: 1.9, scale: 1.15 },
      { zCenter: 1.35, zRange: 0.26, inlandBase: 0.44, inlandSway: 0.1, speed: 0.7, phase: 3.4, scale: 1.18 },
      { zCenter: -1.35, zRange: 0.52, inlandBase: 0.52, inlandSway: 0.15, speed: 0.58, phase: 4.5, scale: 1.24 },
      { zCenter: -2.75, zRange: 0.48, inlandBase: 0.66, inlandSway: 0.13, speed: 0.65, phase: 5.6, scale: 1.2 },
    ];

    crabConfigs.forEach((cfg, idx) => {
      const shellMat = new THREE.MeshStandardMaterial({
        color: shellColors[idx % shellColors.length],
        emissive: 0x4a1208,
        emissiveIntensity: 0.18,
        roughness: 0.34,
        metalness: 0.08,
      });
      this.disposables.push(shellMat);

      const crab = new THREE.Group();
      crab.scale.setScalar(cfg.scale);

      const carapace = new THREE.Mesh(bodyGeo, shellMat);
      carapace.castShadow = true;
      crab.add(carapace);

      // Raised twin eyestalks on front (+Z)
      [-0.032, 0.032].forEach((ex) => {
        const stalk = new THREE.Mesh(stalkGeo, eyeStalkMat);
        stalk.position.set(ex, 0.036, 0.052);
        stalk.rotation.x = 0.22;
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(ex, 0.056, 0.058);
        crab.add(stalk, eye);
      });

      // Articulated front left & right pincers (capit)
      const makeClaw = (side: number): THREE.Group => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.072, 0.005, 0.052);
        const arm = new THREE.Mesh(clawArmGeo, legMat);
        arm.position.set(side * 0.015, 0.005, 0.03);
        arm.rotation.y = side * -0.35;
        const pincer = new THREE.Mesh(pincerGeo, clawMat);
        pincer.position.set(side * 0.025, 0.012, 0.072);
        pincer.rotation.y = side * -0.45;
        pivot.add(arm, pincer);
        return pivot;
      };
      const leftClaw = makeClaw(-1);
      const rightClaw = makeClaw(1);
      crab.add(leftClaw, rightClaw);

      // 6 articulated side walking legs (3 per side)
      const leftLegs: THREE.Group[] = [];
      const rightLegs: THREE.Group[] = [];
      const legZOffsets = [0.028, -0.004, -0.036];
      legZOffsets.forEach((lz, li) => {
        const lPivot = new THREE.Group();
        lPivot.position.set(-0.075, -0.005, lz);
        const lMesh = new THREE.Mesh(legGeo, legMat);
        lMesh.scale.x = -1;
        lMesh.rotation.z = 0.28;
        lMesh.rotation.y = (1 - li) * 0.22;
        lPivot.add(lMesh);
        crab.add(lPivot);
        leftLegs.push(lPivot);

        const rPivot = new THREE.Group();
        rPivot.position.set(0.075, -0.005, lz);
        const rMesh = new THREE.Mesh(legGeo, legMat);
        rMesh.rotation.z = -0.28;
        rMesh.rotation.y = -(1 - li) * 0.22;
        rPivot.add(rMesh);
        crab.add(rPivot);
        rightLegs.push(rPivot);
      });

      this.group.add(crab);
      this.crabs.push({
        group: crab,
        leftClaw,
        rightClaw,
        leftLegs,
        rightLegs,
        zCenter: cfg.zCenter,
        zRange: cfg.zRange,
        inlandBase: cfg.inlandBase,
        inlandSway: cfg.inlandSway,
        speed: cfg.speed,
        phase: cfg.phase,
      });
    });
  }

  private sampleOrbit(
    cx: number,
    cz: number,
    rx: number,
    rz: number,
    t: number,
    figureEight: boolean,
    clockwise: number,
    out: THREE.Vector3,
    y: number
  ): void {
    const a = t * clockwise;
    if (figureEight) {
      out.set(cx + Math.sin(a) * rx, y, cz + Math.sin(a * 2) * rz * 0.55);
    } else {
      out.set(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
    }
  }

  public update(dt: number, elapsed: number, activeStage: WaterCycleStageId): void {
    const damp = 1 - Math.exp(-2.4 * dt);
    const targetStormDip = activeStage === 'presipitasi' ? 1.0 : 0.0;
    this.stormDipWeight += (targetStormDip - this.stormDipWeight) * damp;

    // --- 1. Flying Birds (Flapping + Soaring Glide + Banked Turns) ---
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const t = elapsed * b.speed + b.phase;
      const tAhead = t + 0.04;
      const stormShiftX = this.stormDipWeight * 1.15;
      const stormDropY = this.stormDipWeight * 0.65;

      const yNow = b.baseY - stormDropY + Math.sin(t * 1.8) * b.bobAmp;
      const yNext = b.baseY - stormDropY + Math.sin(tAhead * 1.8) * b.bobAmp;

      this.sampleOrbit(
        b.centerX + stormShiftX,
        b.centerZ,
        b.radiusX,
        b.radiusZ,
        t,
        b.figureEight,
        b.clockwise,
        _pos,
        yNow
      );
      this.sampleOrbit(
        b.centerX + stormShiftX,
        b.centerZ,
        b.radiusX,
        b.radiusZ,
        tAhead,
        b.figureEight,
        b.clockwise,
        _nextPos,
        yNext
      );

      b.group.position.copy(_pos);
      b.group.lookAt(_nextPos);

      // Subtle natural banking roll into turns
      const bank = (b.figureEight ? Math.cos(t * 2) : 0.7) * 0.24 * b.clockwise;
      b.group.rotateZ(bank);

      // Natural intermittent flapping & soaring glide cycle
      const glideMod = 0.58 + 0.42 * Math.sin(elapsed * 0.9 + b.phase * 1.7);
      const flapAngle = Math.sin(elapsed * b.flapSpeed + b.phase) * 0.56 * glideMod + 0.08;
      b.leftWing.rotation.z = flapAngle;
      b.rightWing.rotation.z = -flapAngle;
    }

    // --- 2. Colorful Tropical Reef Fish ---
    for (let i = 0; i < this.fishes.length; i++) {
      const f = this.fishes[i];
      const t = elapsed * f.speed + f.phase;
      const tAhead = t + 0.05;
      const yNow = WATER_LEVEL + f.depthY + Math.sin(elapsed * 1.8 + f.phase) * 0.045;
      const yNext = WATER_LEVEL + f.depthY + Math.sin((elapsed + 0.05) * 1.8 + f.phase) * 0.045;

      this.sampleOrbit(f.centerX, f.centerZ, f.radiusX, f.radiusZ, t, f.figureEight, f.clockwise, _pos, yNow);
      this.sampleOrbit(f.centerX, f.centerZ, f.radiusX, f.radiusZ, tAhead, f.figureEight, f.clockwise, _nextPos, yNext);

      f.group.position.copy(_pos);
      f.group.lookAt(_nextPos);
      f.tailPivot.rotation.y = Math.sin(elapsed * 11.5 + f.phase) * 0.42;
    }

    // --- 3. Playful Leaping Dolphins ---
    for (let i = 0; i < this.dolphins.length; i++) {
      const d = this.dolphins[i];
      const t = elapsed * d.speed + d.phase;
      const tAhead = t + 0.035;

      const calcDolphinY = (timeArg: number): number => {
        // Periodic playful arc out of the ocean surface, then cruising just beneath waves
        const cycle = (timeArg * d.leapFreq) % (Math.PI * 2);
        if (cycle < Math.PI * 0.85) {
          const leapT = cycle / (Math.PI * 0.85);
          return WATER_LEVEL - 0.16 + Math.sin(leapT * Math.PI) * (d.leapHeight + 0.16);
        }
        return WATER_LEVEL - 0.2 + Math.sin(cycle * 2.0) * 0.04;
      };

      const yNow = calcDolphinY(t);
      const yNext = calcDolphinY(tAhead);

      _pos.set(d.centerX + Math.cos(t) * d.radiusX, yNow, d.centerZ + Math.sin(t) * d.radiusZ);
      _nextPos.set(
        d.centerX + Math.cos(tAhead) * d.radiusX,
        yNext,
        d.centerZ + Math.sin(tAhead) * d.radiusZ
      );

      _vel.subVectors(_nextPos, _pos);
      _lookAtPos.copy(_pos).add(_vel);

      d.group.position.copy(_pos);
      d.group.lookAt(_lookAtPos);
      // Vertical fluke swim stroke
      d.tailPivot.rotation.x = Math.sin(elapsed * 8.5 + d.phase) * 0.28;
    }

    // --- 4. Graceful Sea Turtle ---
    const tu = this.turtle;
    const tt = elapsed * tu.speed + tu.phase;
    const ttAhead = tt + 0.06;
    const tyNow = WATER_LEVEL + tu.depthY + Math.sin(elapsed * 1.1) * 0.035;
    const tyNext = WATER_LEVEL + tu.depthY + Math.sin((elapsed + 0.06) * 1.1) * 0.035;

    this.sampleOrbit(tu.centerX, tu.centerZ, tu.radiusX, tu.radiusZ, tt, false, 1, _pos, tyNow);
    this.sampleOrbit(tu.centerX, tu.centerZ, tu.radiusX, tu.radiusZ, ttAhead, false, 1, _nextPos, tyNext);

    tu.group.position.copy(_pos);
    tu.group.lookAt(_nextPos);

    const row = Math.sin(elapsed * 2.8);
    tu.frontLeft.rotation.z = row * 0.38;
    tu.frontRight.rotation.z = -row * 0.38;
    tu.frontLeft.rotation.y = Math.cos(elapsed * 2.8) * 0.24;
    tu.frontRight.rotation.y = -Math.cos(elapsed * 2.8) * 0.24;
    tu.backLeft.rotation.z = -row * 0.18;
    tu.backRight.rotation.z = row * 0.18;

    // --- 5. Lively Beach Crabs Scuttling Sideways Across the Golden Sandy Beach ---
    for (let i = 0; i < this.crabs.length; i++) {
      const cr = this.crabs[i];
      const t = elapsed * cr.speed + cr.phase;
      // Alternating brisk sideways scuttle & short cheeky claw-waving pause
      const moveSignal = Math.sin(t) + Math.sin(t * 2.0) * 0.22;
      const moveVel = Math.cos(t) + Math.cos(t * 2.0) * 0.44;
      const isMoving = Math.abs(moveVel) > 0.24;

      const cz = cr.zCenter + moveSignal * cr.zRange;
      const inland = cr.inlandBase + Math.cos(t * 0.7 + cr.phase) * cr.inlandSway;
      const cx = coastlineX(cz) - inland;
      const cy = terrainHeightAt(cx, cz) + 0.042;

      cr.group.position.set(cx, cy, cz);
      // Face toward the sparkling ocean (+X) so moving along Z is authentic sideways crab walking!
      cr.group.rotation.y = Math.PI * 0.5 + Math.sin(t * 0.85) * 0.24;
      // Subtle tilt following the gentle beach slope toward the sea
      cr.group.rotation.x = 0.16;

      // Rapid alternating leg scuttle gait when walking
      const gaitFreq = isMoving ? 19.0 : 3.5;
      const gaitAmp = isMoving ? 0.34 : 0.05;
      for (let li = 0; li < cr.leftLegs.length; li++) {
        const legPhase = elapsed * gaitFreq + cr.phase + li * 2.1;
        cr.leftLegs[li].rotation.z = Math.sin(legPhase) * gaitAmp;
        cr.rightLegs[li].rotation.z = -Math.sin(legPhase + Math.PI * 0.5) * gaitAmp;
      }

      // Cheerful pincer waving when paused or bobbing while walking
      const clawLift = isMoving
        ? Math.sin(elapsed * 7.5 + cr.phase) * 0.14
        : 0.26 + Math.sin(elapsed * 9.5 + cr.phase) * 0.24;
      cr.leftClaw.rotation.x = -clawLift;
      cr.rightClaw.rotation.x = -clawLift * 0.92;
      cr.leftClaw.rotation.y = Math.sin(elapsed * 6.0 + cr.phase) * 0.18;
      cr.rightClaw.rotation.y = -Math.sin(elapsed * 6.0 + cr.phase) * 0.18;
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
