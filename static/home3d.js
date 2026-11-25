"use strict";

/**
 * tianbao virtual V0.7 - the 200 m² 3D home.
 *
 * Three.js is vendored locally. Everything in this module is procedural: the
 * flat, furniture, robot, first-person eye camera and CCTV overlay are built
 * from the pure layout in home-layout.js. The renderer is mounted lazily only when the
 * 3D tab is opened, so the normal 2D page load stays unchanged.
 */

import * as THREE from "./vendor/three.module.min.js";
import {
  HOME_LAYOUT,
  chargingStateFor,
  createNavigationGrid,
  findPath,
  roomAt,
  roomCenter,
} from "./home-layout.js?v=0.7.1";
import { touchAmountFor, touchLevelFor } from "./robot-touch.js?v=0.7.1";

const W = HOME_LAYOUT.width;
const D = HOME_LAYOUT.depth;
const LAYOUT_CENTER = { x: W / 2, z: D / 2 };
const ROBOT_WALK_SPEED = 1.55;
const ROBOT_KEYBOARD_SPEED = 1.65;
const LOOK_YAW_SPEED = 1.4;
const LOOK_PITCH_SPEED = 1.05;
const FIRST_PERSON_FOV = 66;
const DOCK_RADIUS = HOME_LAYOUT.charging.radius;
const WALL_CUTAWAY = 0.43;

const _v3 = new THREE.Vector3();
const _color = new THREE.Color();
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _moveForward = new THREE.Vector3();
const _moveRight = new THREE.Vector3();
const _moveVector = new THREE.Vector3();

const CAMERA_MODES = new Set(["orbit", "follow", "camera"]);
const MOVE_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
const LOOK_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
const NON_BLOCKING_LABELS = new Set(["rug", "pendant"]);



function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeInOut(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function roundedRectShape(width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function roundedPanelGeometry(width, height, depth, radius) {
  const shape = roundedRectShape(width, height, radius);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(radius * 0.22, 0.035),
    bevelThickness: Math.min(radius * 0.22, 0.035),
    curveSegments: 6,
    steps: 1,
  });
  geometry.center();
  return geometry;
}

function makeShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 62);
  gradient.addColorStop(0, "rgba(20, 38, 34, .28)");
  gradient.addColorStop(0.55, "rgba(20, 38, 34, .13)");
  gradient.addColorStop(1, "rgba(20, 38, 34, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}


export class Home3D {
  constructor({ root, theme, callbacks = {} }) {
    this.root = root;
    this.theme = theme;
    this.callbacks = {
      onDockChange: callbacks.onDockChange || (() => {}),
      onPetStart: callbacks.onPetStart || (() => {}),
      onPetLevel: callbacks.onPetLevel || (() => {}),
      onPetEnd: callbacks.onPetEnd || (() => {}),
      onPetCancel: callbacks.onPetCancel || (() => {}),
      onModeChange: callbacks.onModeChange || (() => {}),
      onRoomChange: callbacks.onRoomChange || (() => {}),
      onStatus: callbacks.onStatus || (() => {}),
    };

    this.canvas = root.querySelector("#home3dCanvas");
    this.viewport = root.querySelector("#home3dViewport");
    this.shell = root.querySelector("#home3dShell");
    this.loading = root.querySelector("#home3dLoading");
    this.fallback = root.querySelector("#home3dFallback");
    this.cameraOverlay = root.querySelector("#home3dCameraOverlay");
    this.camName = root.querySelector("#home3dCamName");
    this.camTime = root.querySelector("#home3dCamTime");
    this.camMeta = root.querySelector("#home3dCamMeta");
    this.roomStatus = root.querySelector("#home3dRoomStatus");
    this.robotStatus = root.querySelector("#home3dRobotStatus");
    this.footerMode = root.querySelector("#home3dFooterMode");
    this.footerRoom = root.querySelector("#home3dFooterRoom");
    this.chargeStatus = root.querySelector("#home3dChargeStatus");
    this.chargeBar = root.querySelector("#home3dChargeBar");
    this.chargeCard = root.querySelector("#home3dChargeCard");
    this.modeButtons = [...root.querySelectorAll("[data-home-mode]")];
    this.keyboardHint = root.querySelector("#home3dKeyboardHint");
    this.keyAction = root.querySelector("#home3dKeyAction");
    this.petButton = root.querySelector("#home3dPetButton");
    this.dockButton = root.querySelector("#home3dDockButton");

    this.mounted = false;
    this.active = false;
    this.rafId = null;
    this.lastFrameAt = 0;
    this.lastClockSecond = -1;
    this.grid = null;

    this.energy = 0;
    this.mode = "orbit";
    this.wallsUp = false;
    this.wallScale = WALL_CUTAWAY;
    this.labelGroup = null;
    this.robot = null;
    this.robotPosition = { ...HOME_LAYOUT.robotSpawn };
    this.robotRoom = roomAt(this.robotPosition.x, this.robotPosition.z);
    this.path = [];
    this.pathIndex = 0;
    this.docked = false;
    this.docking = false;
    this.charging = false;
    this.dockCooldownUntil = 0;
    this.dockOnArrival = false;
    this.nextBlinkAt = performance.now() + 2600;
    this.blinkUntil = 0;
    this.pet = null;
    this.buttonPet = null;
    this.lastStatusAt = 0;
    this.moveKeys = new Set();
    this.lookKeys = new Set();
    this.keyboardMoving = false;
    this.eye = { yaw: 0, pitch: -0.02 };

    this.orbit = {
      azimuth: 0.48,
      polar: 0.82,
      radius: 23,
      target: new THREE.Vector3(0, 0.35, 0.2),
    };
    this.followPosition = new THREE.Vector3();
    this.followTarget = new THREE.Vector3();

    this.pointer = {
      down: false,
      dragging: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      pointerId: null,
      startedAt: 0,
    };

    this.renderLoop = this.renderLoop.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleWindowBlur = this.handleWindowBlur.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
    this.updateClock = this.updateClock.bind(this);
  }

  /* ======================================================================
     Mount / lifecycle
     ====================================================================== */

  mount() {
    if (this.mounted) return true;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: "high-performance",
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.04;
      this.renderer.shadowMap.enabled = false;
    } catch (error) {
      this.showFallback(error);
      return false;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x17282c);
    this.scene.fog = new THREE.FogExp2(0x17282c, 0.018);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.08, 90);

    this.layoutGroup = new THREE.Group();
    this.layoutGroup.position.set(-LAYOUT_CENTER.x, 0, -LAYOUT_CENTER.z);
    this.scene.add(this.layoutGroup);

    this.materialCache = new Map();
    this.shadowTexture = makeShadowTexture();
    this.grid = createNavigationGrid(HOME_LAYOUT);
    this.walls = [];
    this.roomLabelSprites = [];

    this.buildLights();
    this.buildOutside();
    this.buildFloors();
    this.buildWalls();
    this.buildWindows();
    this.buildDoors();
    this.buildCeiling();
    this.buildFurniture();
    this.buildChargePad();
    this.buildRoomLabels();
    this.buildRobot();
    this.bindUI();
    this.applyTheme(this.theme, { initial: true });
    this.setMode("orbit", { silent: true });
    this.setEnergy(this.energy);

    this.mounted = true;
    this.handleResize();
    this.placeRobot(this.robotPosition.x, this.robotPosition.z, 0);
    this.updateCamera(0.016, performance.now());
    this.renderer.render(this.scene, this.camera);
    this.hideLoading();
    this.updateClock();
    this.updateRobotStatus(true);
    this.updateChargeUI();

    this.resizeObserver = null;
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.viewport);
    }
    window.addEventListener("resize", this.handleResize);
    return true;
  }

  activate() {
    if (!this.mounted) return;
    if (this.active) return;
    this.active = true;
    this.lastFrameAt = performance.now();
    this.handleResize();
    this.rafId = window.requestAnimationFrame(this.renderLoop);
    this.updateCameraOverlay();
  }

  deactivate() {
    this.active = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.clearKeyboard();
    this.endPet(false);
    this.endButtonPet(false);
  }

  hideLoading() {
    if (this.loading) {
      this.loading.classList.add("is-hidden");
      this.loading.hidden = true;
    }
  }

  showFallback(error) {
    if (this.loading) {
      this.loading.classList.add("is-hidden");
      this.loading.hidden = true;
    }
    if (this.fallback) this.fallback.hidden = false;
    if (this.canvas) this.canvas.hidden = true;
    // Keep the error in the console for local debugging.
    if (error) console.error("tianbao home3d:", error);
  }

  handleResize() {
    if (!this.renderer || !this.camera || !this.viewport) return;
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /* ======================================================================
     Materials / primitive helpers
     ====================================================================== */

  material(color, options = {}) {
    const key = [
      color,
      options.roughness ?? 0.82,
      options.metalness ?? 0,
      options.transparent ? 1 : 0,
      options.opacity ?? 1,
      options.emissive ?? "",
      options.emissiveIntensity ?? 0,
    ].join("|");
    if (this.materialCache.has(key)) return this.materialCache.get(key);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: options.roughness ?? 0.82,
      metalness: options.metalness ?? 0,
      transparent: Boolean(options.transparent),
      opacity: options.opacity ?? 1,
      side: options.side ?? THREE.FrontSide,
      emissive: options.emissive ? new THREE.Color(options.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: options.emissiveIntensity ?? 0,
    });
    this.materialCache.set(key, material);
    return material;
  }

  box(parent, { w, h, d, x = 0, y = 0, z = 0, color, rot = 0, ...mat }) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, this.material(color, mat));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    parent.add(mesh);
    return mesh;
  }

  cylinder(parent, { radiusTop, radiusBottom = radiusTop, h, x = 0, y = 0, z = 0, color, segments = 20, rotZ = 0, rotX = 0, ...mat }) {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, h, segments);
    const mesh = new THREE.Mesh(geometry, this.material(color, mat));
    mesh.position.set(x, y, z);
    mesh.rotation.z = rotZ;
    mesh.rotation.x = rotX;
    parent.add(mesh);
    return mesh;
  }

  sphere(parent, { r, x = 0, y = 0, z = 0, color, sx = 1, sy = 1, sz = 1, ...mat }) {
    const geometry = new THREE.SphereGeometry(r, 20, 14);
    const mesh = new THREE.Mesh(geometry, this.material(color, mat));
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }

  addGroup(parent, x, z, rot = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rot;
    parent.add(group);
    return group;
  }

  addContactShadow(parent, x, z, w, d) {
    const material = new THREE.MeshBasicMaterial({
      map: this.shadowTexture,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.012, z);
    parent.add(mesh);
    return mesh;
  }

  /* ======================================================================
     Scene foundations
     ====================================================================== */

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xfff8e8, 0x60726d, 2.1);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0d2, 2.8);
    sun.position.set(9, 18, 11);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xa7d9d1, 0.85);
    fill.position.set(-12, 9, -8);
    this.scene.add(fill);

    const ambient = new THREE.AmbientLight(0xdbe9e2, 0.42);
    this.scene.add(ambient);

    this.chargeLight = new THREE.PointLight(0x72e4bf, 1.5, 4.8, 2);
    this.chargeLight.position.set(
      HOME_LAYOUT.charging.x - LAYOUT_CENTER.x,
      0.5,
      HOME_LAYOUT.charging.z - LAYOUT_CENTER.z,
    );
    this.scene.add(this.chargeLight);
  }

  buildOutside() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      this.material("#425750", { roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.16;
    this.scene.add(ground);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(13, 13.08, 96),
      new THREE.MeshBasicMaterial({ color: 0x668d7f, transparent: true, opacity: 0.23, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.13;
    this.scene.add(halo);

    this.layoutGroup.add(this.materialFloorBox(W + 0.34, D + 0.34, 0.18, "#a39b8c", -0.1));
    this.layoutGroup.add(this.materialFloorBox(W + 0.26, D + 0.26, 0.05, "#c7bdad", -0.02));
  }

  materialFloorBox(w, d, h, color, y) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      this.material(color, { roughness: 0.94 }),
    );
    mesh.position.set(W / 2, y, D / 2);
    return mesh;
  }

  buildFloors() {
    for (const room of HOME_LAYOUT.rooms) {
      const geometry = new THREE.BoxGeometry(room.w - 0.02, 0.035, room.d - 0.02);
      const material = this.material(room.floor, { roughness: 0.96 });
      const floor = new THREE.Mesh(geometry, material);
      floor.position.set(room.x + room.w / 2, 0.018, room.z + room.d / 2);
      this.layoutGroup.add(floor);

      const line = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(room.w - 0.02, 0.04, room.d - 0.02)),
        new THREE.LineBasicMaterial({
          color: room.accent,
          transparent: true,
          opacity: 0.42,
        }),
      );
      line.position.copy(floor.position);
      this.layoutGroup.add(line);
    }

    // Invisible pick plane for click-to-move; not a render object.
    this.floorPick = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.floorPick.rotation.x = -Math.PI / 2;
    this.floorPick.position.set(W / 2, 0.03, D / 2);
    this.floorPick.userData.isFloor = true;
    this.layoutGroup.add(this.floorPick);
  }

  buildWalls() {
    this.wallGroup = new THREE.Group();
    this.layoutGroup.add(this.wallGroup);

    for (const wall of HOME_LAYOUT.walls) {
      const dx = wall.x2 - wall.x1;
      const dz = wall.z2 - wall.z1;
      const length = Math.hypot(dx, dz);
      if (length < 0.001) continue;
      const thickness = wall.thickness || 0.12;
      const height = wall.height || HOME_LAYOUT.wallHeight;
      const isHorizontal = Math.abs(dz) < 0.0001;
      const isGlass = wall.kind === "glass";
      const color = isGlass ? "#a9d4d2" : "#f2ecdf";
      const materialOptions = isGlass
        ? {
          roughness: 0.16,
          metalness: 0.05,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
        }
        : { roughness: 0.9 };
      const geometry = new THREE.BoxGeometry(
        isHorizontal ? length : thickness,
        height,
        isHorizontal ? thickness : length,
      );
      const mesh = new THREE.Mesh(geometry, this.material(color, materialOptions));
      mesh.position.set(
        (wall.x1 + wall.x2) / 2,
        height / 2,
        (wall.z1 + wall.z2) / 2,
      );
      mesh.userData.wall = wall;
      this.wallGroup.add(mesh);
      this.walls.push(mesh);

      if (!isGlass) {
        // A subtle skirt at the base catches the light and gives the walls
        // a little weight without resorting to expensive shadows.
        const skirt = new THREE.Mesh(
          new THREE.BoxGeometry(
            isHorizontal ? length : thickness + 0.025,
            0.09,
            isHorizontal ? thickness + 0.025 : length,
          ),
          this.material("#d2c9ba", { roughness: 0.94 }),
        );
        skirt.position.set(
          (wall.x1 + wall.x2) / 2,
          0.045,
          (wall.z1 + wall.z2) / 2,
        );
        this.wallGroup.add(skirt);
      } else {
        // Window mullions on the full-height glazing.
        const count = Math.max(2, Math.round(length / 1.15));
        for (let i = 1; i < count; i += 1) {
          const t = i / count;
          const frame = new THREE.Mesh(
            new THREE.BoxGeometry(
              isHorizontal ? 0.035 : thickness + 0.03,
              height,
              isHorizontal ? thickness + 0.03 : 0.035,
            ),
            this.material("#d6cfc2", { roughness: 0.6 }),
          );
          frame.position.set(
            wall.x1 + dx * t,
            height / 2,
            wall.z1 + dz * t,
          );
          this.wallGroup.add(frame);
        }
      }
    }
    this.wallGroup.scale.y = WALL_CUTAWAY;
    this.wallScale = WALL_CUTAWAY;
  }

  buildWindows() {
    this.windowGroup = new THREE.Group();
    this.layoutGroup.add(this.windowGroup);
    for (const window of HOME_LAYOUT.windows) {
      const horizontal = Math.abs(window.z2 - window.z1) < 0.0001;
      const length = horizontal
        ? Math.abs(window.x2 - window.x1)
        : Math.abs(window.z2 - window.z1);
      const height = window.y1 - window.y0;
      const cx = (window.x1 + window.x2) / 2;
      const cz = (window.z1 + window.z2) / 2;

      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(
          horizontal ? length : 0.035,
          height,
          horizontal ? 0.035 : length,
        ),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#b7e2e4"),
          emissive: new THREE.Color("#759e9b"),
          emissiveIntensity: 0.7,
          roughness: 0.12,
          metalness: 0.08,
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
        }),
      );
      glass.position.set(cx, (window.y0 + window.y1) / 2, cz);
      this.windowGroup.add(glass);

      const frameMaterial = this.material("#efe9de", { roughness: 0.56 });
      const frameDepth = 0.045;
      const parts = horizontal
        ? [
          { w: length, h: 0.035, d: frameDepth, x: 0, y: height / 2, z: 0 },
          { w: length, h: 0.035, d: frameDepth, x: 0, y: -height / 2, z: 0 },
          { w: 0.035, h: height, d: frameDepth, x: -length / 2, y: 0, z: 0 },
          { w: 0.035, h: height, d: frameDepth, x: length / 2, y: 0, z: 0 },
        ]
        : [
          { w: frameDepth, h: 0.035, d: length, x: 0, y: height / 2, z: 0 },
          { w: frameDepth, h: 0.035, d: length, x: 0, y: -height / 2, z: 0 },
          { w: frameDepth, h: height, d: 0.035, x: 0, y: 0, z: -length / 2 },
          { w: frameDepth, h: height, d: 0.035, x: 0, y: 0, z: length / 2 },
        ];
      for (const part of parts) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(part.w, part.h, part.d),
          frameMaterial,
        );
        mesh.position.set(
          cx + part.x,
          (window.y0 + window.y1) / 2 + part.y,
          cz + part.z,
        );
        this.windowGroup.add(mesh);
      }
    }
  }

  buildDoors() {
    const doorGroup = new THREE.Group();
    this.layoutGroup.add(doorGroup);
    for (const door of HOME_LAYOUT.doors) {
      const isHorizontal = door.orientation === "h";
      const threshold = new THREE.Mesh(
        new THREE.BoxGeometry(
          isHorizontal ? door.width : 0.17,
          0.018,
          isHorizontal ? 0.17 : door.width,
        ),
        this.material(door.entry ? "#b98f5f" : "#d2c3ad", { roughness: 0.8 }),
      );
      threshold.position.set(door.x, 0.032, door.z);
      doorGroup.add(threshold);
    }
  }

  buildCeiling() {
    this.ceilingGroup = new THREE.Group();
    this.ceilingGroup.visible = false;
    this.layoutGroup.add(this.ceilingGroup);

    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.07, D),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#f0e9dc"),
        side: THREE.DoubleSide,
      }),
    );
    ceiling.position.set(W / 2, 2.735, D / 2);
    this.ceilingGroup.add(ceiling);

    for (const room of HOME_LAYOUT.rooms) {
      if (room.type === "balcony") continue;
      const center = roomCenter(room);
      const light = new THREE.Mesh(
        new THREE.CircleGeometry(Math.min(0.35, room.w * 0.13), 24),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color("#fff1cd"),
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
        }),
      );
      light.rotation.x = Math.PI / 2;
      light.position.set(center.x, 2.686, center.z);
      this.ceilingGroup.add(light);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(Math.min(0.36, room.w * 0.14), Math.min(0.5, room.w * 0.2), 28),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color("#ffe7ae"),
          transparent: true,
          opacity: 0.16,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.set(center.x, 2.681, center.z);
      this.ceilingGroup.add(halo);
    }
  }

  buildRoomLabels() {
    this.labelGroup = new THREE.Group();
    this.layoutGroup.add(this.labelGroup);
    for (const room of HOME_LAYOUT.rooms) {
      const center = roomCenter(room);
      const sprite = this.makeRoomLabel(room);
      sprite.position.set(center.x, 0.32, center.z);
      this.labelGroup.add(sprite);
      this.roomLabelSprites.push(sprite);
    }
  }

  makeRoomLabel(room) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 136;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(255, 253, 247, .90)";
    this.roundRect(context, 14, 12, 484, 112, 32);
    context.fill();
    context.strokeStyle = "rgba(86, 117, 105, .18)";
    context.lineWidth = 2;
    this.roundRect(context, 14, 12, 484, 112, 32);
    context.stroke();
    context.fillStyle = "#38524c";
    context.font = "700 38px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(room.short, 256, 58);
    context.fillStyle = "#93a49e";
    context.font = "600 21px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    context.fillText(`${room.w.toFixed(1)} × ${room.d.toFixed(1)} m`, 256, 96);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.94,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.65, 0.7, 1);
    return sprite;
  }

  roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + w - r, y);
    context.quadraticCurveTo(x + w, y, x + w, y + r);
    context.lineTo(x + w, y + h - r);
    context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    context.lineTo(x + r, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  /* ======================================================================
     Furniture
     ====================================================================== */

  buildFurniture() {
    this.furnitureGroup = new THREE.Group();
    this.layoutGroup.add(this.furnitureGroup);
    for (const item of HOME_LAYOUT.furniture) {
      const group = this.addGroup(this.furnitureGroup, item.x, item.z, item.rot || 0);
      group.userData.furniture = item;
      const shadowSize = Math.max(item.w, item.d) * 1.05;
      if (!NON_BLOCKING_LABELS.has(item.type) && item.type !== "tv") {
        this.addContactShadow(group, 0, 0, shadowSize, shadowSize * 0.62);
      }
      this.addFurnitureShape(group, item);
    }
  }

  addFurnitureShape(group, item) {
    const w = item.w || 0.5;
    const d = item.d || 0.5;
    const h = item.h || 0.5;
    const color = item.color || "#b8a88f";
    switch (item.type) {
      case "rug":
        this.box(group, { w, h: 0.018, d, y: 0.03, color, roughness: 1 });
        this.box(group, { w: w * 0.82, h: 0.02, d: d * 0.82, y: 0.035, color: "#f2e8da", roughness: 1, transparent: true, opacity: 0.28 });
        break;
      case "bed": {
        this.box(group, { w, h: 0.18, d, y: 0.16, color: "#a58e73", roughness: 0.9 });
        this.box(group, { w: w * 0.94, h: 0.22, d: d * 0.9, y: 0.34, color, roughness: 0.95 });
        this.box(group, { w: w * 0.9, h: 0.07, d: d * 0.43, y: 0.46, z: d * 0.2, color: "#f3ece2", roughness: 1 });
        this.box(group, { w: w * 0.98, h: 0.52, d: 0.12, y: 0.58, z: -d / 2 + 0.06, color: "#b7a087", roughness: 0.9 });
        this.box(group, { w: w * 0.36, h: 0.13, d: d * 0.18, y: 0.49, z: -d * 0.2, color: "#fbf7f0", roughness: 1 });
        this.box(group, { w: w * 0.36, h: 0.13, d: d * 0.18, y: 0.49, z: -d * 0.02, color: "#f8f2e8", roughness: 1 });
        break;
      }
      case "sofa": {
        this.box(group, { w: w * 0.86, h: 0.22, d: d * 0.75, y: 0.25, color, roughness: 0.94 });
        this.box(group, { w, h: 0.27, d: d * 0.32, y: 0.18, z: d * 0.28, color: "#b8cec5", roughness: 0.94 });
        this.box(group, { w, h: 0.52, d: d * 0.18, y: 0.44, z: d * 0.4, color, roughness: 0.94 });
        this.box(group, { w: w * 0.09, h: 0.43, d, y: 0.31, x: -w * 0.46, color: "#bed4cb", roughness: 0.94 });
        this.box(group, { w: w * 0.09, h: 0.43, d, y: 0.31, x: w * 0.46, color: "#bed4cb", roughness: 0.94 });
        this.box(group, { w: w * 0.38, h: 0.14, d: d * 0.24, y: 0.48, x: -w * 0.15, z: d * 0.06, color: "#e8f0eb", roughness: 1 });
        this.box(group, { w: w * 0.38, h: 0.14, d: d * 0.24, y: 0.48, x: w * 0.15, z: d * 0.06, color: "#f1e8dc", roughness: 1 });
        break;
      }
      case "armchair": {
        this.box(group, { w: w * 0.82, h: 0.18, d: d * 0.76, y: 0.22, color, roughness: 0.95 });
        this.box(group, { w, h: 0.18, d: d * 0.25, y: 0.28, z: d * 0.28, color });
        this.box(group, { w, h: 0.52, d: d * 0.16, y: 0.5, z: d * 0.4, color });
        this.box(group, { w: w * 0.11, h: 0.4, d, y: 0.3, x: -w * 0.45, color });
        this.box(group, { w: w * 0.11, h: 0.4, d, y: 0.3, x: w * 0.45, color });
        break;
      }
      case "coffeeTable":
      case "sideTable":
      case "consoleTable":
      case "desk":
      case "diningTable": {
        const topColor = item.type === "desk" ? color : color;
        const leg = Math.min(0.055, w * 0.06);
        this.box(group, { w, h: 0.065, d, y: h - 0.032, color: topColor, roughness: 0.72 });
        const legH = Math.max(0.12, h - 0.065);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            this.box(group, {
              w: leg, h: legH, d: leg,
              x: sx * (w / 2 - 0.09),
              y: legH / 2,
              z: sz * (d / 2 - 0.09),
              color: "#846c53",
              roughness: 0.85,
            });
          }
        }
        if (item.type === "desk") {
          this.box(group, { w: w * 0.7, h: 0.035, d: 0.2, y: h + 0.02, z: d * 0.15, color: "#d7cfc1" });
          this.box(group, { w: w * 0.28, h: 0.24, d: 0.035, y: h + 0.22, z: d * 0.15, color: "#23383a", emissive: "#376158", emissiveIntensity: 0.3 });
        }
        if (item.type === "diningTable") {
          this.box(group, { w: w * 0.9, h: 0.03, d: d * 0.8, y: h + 0.01, color: "#f1e4cf", roughness: 1 });
          this.cylinder(group, { radiusTop: 0.08, radiusBottom: 0.06, h: 0.18, x: w * 0.2, y: h + 0.11, z: d * 0.1, color: "#c8a36f" });
          this.sphere(group, { r: 0.08, x: w * 0.2, y: h + 0.22, z: d * 0.1, color: "#a9cf9d", sx: 1, sy: 1.2, sz: 1 });
        }
        break;
      }
      case "chair":
      case "officeChair":
      case "stool": {
        const seatH = item.type === "stool" ? 0.55 : 0.46;
        this.box(group, { w, h: 0.07, d, y: seatH, color, roughness: 0.92 });
        if (item.type !== "stool") {
          this.box(group, { w: w * 0.9, h: w * 0.72, d: 0.065, y: seatH + 0.34, z: -d * 0.4, color, roughness: 0.92 });
        }
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            this.box(group, { w: 0.035, h: seatH, d: 0.035, x: sx * w * 0.35, y: seatH / 2, z: sz * d * 0.32, color: "#776a5b" });
          }
        }
        if (item.type === "officeChair") {
          this.cylinder(group, { radiusTop: 0.025, h: 0.25, y: seatH - 0.12, color: "#4f5e5a" });
          for (let i = 0; i < 5; i += 1) {
            this.box(group, { w: 0.2, h: 0.025, d: 0.035, x: Math.cos(i * 1.256) * 0.12, y: 0.12, z: Math.sin(i * 1.256) * 0.12, rot: i * 1.256, color: "#4f5e5a" });
          }
        }
        break;
      }
      case "shelf": {
        this.box(group, { w, h, d, y: h / 2, color, roughness: 0.9 });
        for (let i = 1; i < 4; i += 1) {
          this.box(group, { w: w * 1.02, h: 0.035, d: d * 0.94, y: (h / 4) * i + 0.03, color: "#d7c6ae" });
        }
        for (let i = 0; i < 5; i += 1) {
          this.box(group, { w: w * 0.7, h: 0.19, d: 0.035, x: -w * 0.08 + (i % 2) * 0.05, y: 0.28 + Math.floor(i / 2) * (h / 4), z: d / 2 + 0.02, color: ["#d7a892", "#a7c8b4", "#e3c47e", "#aebadb", "#d9b3b7"][i] });
        }
        break;
      }
      case "floorLamp": {
        this.cylinder(group, { radiusTop: 0.03, radiusBottom: 0.045, h: 1.35, y: 0.68, color: "#aa967d" });
        this.cylinder(group, { radiusTop: 0.2, radiusBottom: 0.27, h: 0.27, y: 1.45, color: item.color, transparent: true, opacity: 0.82, emissive: "#ffd993", emissiveIntensity: 0.55 });
        this.cylinder(group, { radiusTop: 0.22, radiusBottom: 0.22, h: 0.025, y: 0.03, color: "#8f7b63" });
        break;
      }
      case "plant": {
        this.cylinder(group, { radiusTop: w * 0.3, radiusBottom: w * 0.4, h: 0.33, y: 0.16, color: "#c68f78", segments: 18 });
        this.sphere(group, { r: w * 0.4, x: 0, y: 0.46, z: 0, color: item.color, sx: 0.8, sy: 1.25, sz: 0.8 });
        this.sphere(group, { r: w * 0.32, x: -w * 0.25, y: 0.55, z: 0.02, color: item.color, sx: 0.65, sy: 1.1, sz: 0.65 });
        this.sphere(group, { r: w * 0.32, x: w * 0.22, y: 0.59, z: -0.02, color: item.color, sx: 0.7, sy: 1.1, sz: 0.7 });
        break;
      }
      case "planter": {
        this.box(group, { w, h: h, d, y: h / 2, color: item.color, roughness: 0.95 });
        for (let i = 0; i < Math.max(2, Math.round(w / 0.2)); i += 1) {
          const x = -w / 2 + 0.12 + i * (w - 0.24) / Math.max(1, Math.round(w / 0.2) - 1);
          this.sphere(group, { r: 0.09, x, y: h + 0.05, z: 0, color: "#7eac83", sx: 0.8, sy: 1.2, sz: 0.8 });
        }
        break;
      }
      case "kitchenCounter": {
        this.box(group, { w, h, d, y: h / 2, color: item.color, roughness: 0.8 });
        this.box(group, { w: w * 1.02, h: 0.055, d: d * 1.03, y: h + 0.025, color: "#eef1ea", roughness: 0.4 });
        for (let i = 1; i < 4; i += 1) {
          this.box(group, { w: 0.018, h: h * 0.7, d: 0.02, x: -w / 2 + (w / 4) * i, y: h * 0.38, z: d / 2 + 0.01, color: "#9fb4a7" });
        }
        this.cylinder(group, { radiusTop: 0.09, radiusBottom: 0.09, h: 0.025, x: -w * 0.2, y: h + 0.065, z: 0, color: "#a8c7c7", metalness: 0.3, roughness: 0.2 });
        break;
      }
      case "kitchenIsland": {
        this.box(group, { w, h, d, y: h / 2, color: item.color, roughness: 0.8 });
        this.box(group, { w: w * 1.03, h: 0.06, d: d * 1.04, y: h + 0.03, color: "#f7f5ed", roughness: 0.35 });
        this.box(group, { w: w * 0.34, h: 0.018, d: d * 0.5, y: h + 0.07, z: -d * 0.1, color: "#8cb5b0", metalness: 0.18, roughness: 0.25 });
        break;
      }
      case "fridge": {
        this.box(group, { w, h, d, y: h / 2, color: item.color, roughness: 0.4, metalness: 0.12 });
        this.box(group, { w: w * 0.9, h: 0.018, d: 0.02, y: h * 0.58, z: d / 2 + 0.01, color: "#9aa9a4" });
        this.box(group, { w: 0.035, h: 0.42, d: 0.04, x: -w * 0.34, y: h * 0.76, z: d / 2 + 0.035, color: "#839590", metalness: 0.4 });
        break;
      }
      case "washer": {
        this.box(group, { w, h, d, y: h / 2, color: item.color, roughness: 0.6 });
        const drum = new THREE.Mesh(
          new THREE.TorusGeometry(w * 0.27, 0.025, 8, 26),
          this.material("#849592", { roughness: 0.3, metalness: 0.3 }),
        );
        drum.position.set(0, h * 0.5, d / 2 + 0.012);
        group.add(drum);
        this.cylinder(group, { radiusTop: w * 0.25, h: 0.012, y: h * 0.5, z: d / 2 + 0.01, color: "#70827e", rotX: Math.PI / 2 });
        break;
      }
      case "wardrobe": {
        this.box(group, { w, h, d, y: h / 2, color: item.color, roughness: 0.88 });
        this.box(group, { w: 0.018, h: h * 0.88, d: 0.025, y: h * 0.48, z: d / 2 + 0.014, color: "#9e8a72" });
        this.box(group, { w: 0.045, h: 0.38, d: 0.04, x: -w * 0.06, y: h * 0.56, z: d / 2 + 0.045, color: "#d6b780", metalness: 0.35 });
        break;
      }
      case "tv": {
        this.box(group, { w, h, d, y: 1.0, color: item.color, roughness: 0.25, metalness: 0.2, emissive: "#263a39", emissiveIntensity: 0.18 });
        this.box(group, { w: w * 0.95, h: h * 0.9, d: 0.012, y: 1.0, z: d / 2 + 0.012, color: "#182a2d", roughness: 0.15 });
        this.box(group, { w: 0.06, h: 0.52, d: 0.06, y: 0.56, z: -0.04, color: "#3c4a48" });
        this.box(group, { w: 0.38, h: 0.03, d: 0.2, y: 0.31, z: -0.04, color: "#3c4a48" });
        break;
      }
      case "pendant": {
        this.cylinder(group, { radiusTop: 0.008, radiusBottom: 0.008, h: 1.9, y: 1.95, color: "#7e7669" });
        this.cylinder(group, { radiusTop: 0.18, radiusBottom: 0.25, h: 0.28, y: 2.22, color: item.color, transparent: true, opacity: 0.8, emissive: "#ffd18b", emissiveIntensity: 1.4 });
        this.sphere(group, { r: 0.08, y: 2.14, color: "#fff1c7", emissive: "#ffdf9e", emissiveIntensity: 1.8 });
        break;
      }
      case "bathtub": {
        this.box(group, { w, h: 0.44, d, y: 0.22, color: "#eef3f1", roughness: 0.3 });
        this.box(group, { w: w * 0.78, h: 0.03, d: d * 0.82, y: 0.43, color: "#b8d9de", transparent: true, opacity: 0.8, roughness: 0.18 });
        this.cylinder(group, { radiusTop: 0.025, h: 0.32, x: -w * 0.36, y: 0.62, z: -d * 0.3, color: "#a7b7b2", metalness: 0.5 });
        break;
      }
      case "sink": {
        this.cylinder(group, { radiusTop: 0.15, radiusBottom: 0.21, h: h, y: h / 2, color: "#e4eae7", roughness: 0.4 });
        this.box(group, { w, h: 0.12, d, y: h + 0.06, color: item.color, roughness: 0.28 });
        this.box(group, { w: 0.035, h: 0.25, d: 0.035, x: 0, y: h + 0.21, z: -d * 0.25, color: "#98aaa5" });
        break;
      }
      case "toilet": {
        this.cylinder(group, { radiusTop: w * 0.38, radiusBottom: w * 0.5, h: 0.28, y: 0.15, color: item.color, roughness: 0.35 });
        this.box(group, { w: w * 0.85, h: 0.09, d: d * 0.7, y: 0.32, z: 0.02, color: "#f3f6f3", roughness: 0.3 });
        this.box(group, { w: w * 0.8, h: 0.55, d: d * 0.3, y: 0.55, z: -d * 0.34, color: item.color, roughness: 0.35 });
        break;
      }
      case "shower": {
        this.box(group, { w, h: h, d, y: h / 2, color: "#c3dbd8", transparent: true, opacity: 0.25, roughness: 0.12 });
        this.box(group, { w, h: h, d, y: h / 2, color: "#dbe8e4", transparent: true, opacity: 0.12, side: THREE.BackSide });
        this.box(group, { w, h: 0.06, d, y: 0.03, color: "#d9e3e0", roughness: 0.7 });
        this.cylinder(group, { radiusTop: 0.025, h: 0.25, x: 0.12, y: h - 0.15, z: 0.12, color: "#9eafab", metalness: 0.6 });
        break;
      }
      case "bench": {
        this.box(group, { w, h: 0.075, d, y: h, color, roughness: 0.95 });
        for (const sx of [-1, 1]) {
          this.box(group, { w: 0.04, h, d: 0.04, x: sx * (w / 2 - 0.08), y: h / 2, z: 0, color: "#8d755a" });
        }
        break;
      }
      case "nightstand": {
        this.box(group, { w, h: 0.42, d, y: 0.21, color, roughness: 0.88 });
        this.box(group, { w: w * 0.85, h: 0.018, d: 0.025, y: 0.26, z: d / 2 + 0.01, color: "#806b53" });
        this.cylinder(group, { radiusTop: 0.045, radiusBottom: 0.065, h: 0.22, y: 0.55, color: "#d6b77e" });
        this.sphere(group, { r: 0.09, y: 0.7, color: "#f4d39d", emissive: "#f4cd84", emissiveIntensity: 0.2 });
        break;
      }
      case "loungeChair": {
        this.box(group, { w, h: 0.1, d: d * 0.65, y: 0.35, z: d * 0.12, color, roughness: 0.95 });
        this.box(group, { w, h: 0.75, d: 0.09, y: 0.5, z: -d * 0.28, rot: 0, color, roughness: 0.95 });
        for (const sx of [-1, 1]) {
          this.box(group, { w: 0.04, h: 0.34, d: 0.04, x: sx * w * 0.36, y: 0.17, z: d * 0.2, color: "#7e6c58" });
        }
        break;
      }
      case "cabinet": {
        this.box(group, { w, h, d, y: h / 2, color, roughness: 0.88 });
        break;
      }
      default:
        this.box(group, { w, h, d, y: h / 2, color, roughness: 0.88 });
        break;
    }
  }

  /* ======================================================================
     Charging pad
     ====================================================================== */

  buildChargePad() {
    const pad = HOME_LAYOUT.charging;
    const group = new THREE.Group();
    group.position.set(pad.x, 0.04, pad.z);
    this.layoutGroup.add(group);

    const baseMat = this.material("#213a35", { roughness: 0.4, metalness: 0.18 });
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(pad.radius, pad.radius, 0.055, 48),
      baseMat,
    );
    base.position.y = 0.028;
    group.add(base);

    this.chargeRingMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#79e0be"),
      emissive: new THREE.Color("#50b999"),
      emissiveIntensity: 1.25,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.86,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(pad.radius * 0.68, 0.028, 8, 48),
      this.chargeRingMaterial,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.068;
    group.add(ring);

    this.chargeInnerRing = new THREE.Mesh(
      new THREE.TorusGeometry(pad.radius * 0.42, 0.012, 6, 36),
      this.chargeRingMaterial.clone(),
    );
    this.chargeInnerRing.rotation.x = -Math.PI / 2;
    this.chargeInnerRing.position.y = 0.074;
    group.add(this.chargeInnerRing);

    const glyph = this.makeChargeGlyph();
    glyph.position.set(0, 0.09, 0);
    glyph.rotation.x = -Math.PI / 2;
    glyph.rotation.z = Math.PI;
    group.add(glyph);

    this.chargePadGroup = group;
    this.chargePadRing = ring;
  }

  makeChargeGlyph() {
    const shape = new THREE.Shape();
    shape.moveTo(0.08, -0.09);
    shape.lineTo(-0.07, 0.015);
    shape.lineTo(-0.005, 0.015);
    shape.lineTo(-0.045, 0.1);
    shape.lineTo(0.06, -0.015);
    shape.lineTo(-0.01, -0.015);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    return new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0xbbffe8, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
  }

  /* ======================================================================
     Robot
     ====================================================================== */

  buildRobot() {
    const group = new THREE.Group();
    this.layoutGroup.add(group);
    this.robotGroup = group;

    const visual = new THREE.Group();
    visual.scale.setScalar(1.18);
    group.add(visual);
    this.robotVisual = visual;

    this.robotSkin = {
      body: [],
      limb: [],
      head: [],
      belly: [],
      accent: [],
      screen: [],
      accessory: [],
    };

    const bodyMat = this.material(this.theme.colors.bodyA, { roughness: 0.42 });
    this.robotSkin.body.push(bodyMat);
    const limbMat = this.material(this.theme.colors.limb, { roughness: 0.55 });
    this.robotSkin.limb.push(limbMat);
    const headMat = this.material(this.theme.colors.headA, { roughness: 0.38 });
    this.robotSkin.head.push(headMat);
    const bellyMat = this.material(this.theme.colors.belly, { roughness: 0.5, transparent: true, opacity: 0.86 });
    this.robotSkin.belly.push(bellyMat);
    const accentMat = this.material(this.theme.colors.accent, { roughness: 0.35, metalness: 0.05 });
    this.robotSkin.accent.push(accentMat);
    const screenMat = this.material(this.theme.colors.screenA, { roughness: 0.16, metalness: 0.15 });
    this.robotSkin.screen.push(screenMat);

    // Body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 18), bodyMat);
    body.position.set(0, 0.4, 0);
    body.scale.set(1.06, 0.92, 0.78);
    visual.add(body);

    const belly = new THREE.Mesh(new THREE.CircleGeometry(0.135, 28), bellyMat);
    belly.position.set(0, 0.4, 0.245);
    visual.add(belly);

    const bellyRing = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.012, 6, 28), accentMat);
    bellyRing.position.set(0, 0.4, 0.25);
    visual.add(bellyRing);

    const bellyMark = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.056, 24), accentMat);
    bellyMark.position.set(0, 0.4, 0.252);
    visual.add(bellyMark);

    // Arms and feet
    const armGeo = new THREE.CapsuleGeometry(0.065, 0.18, 4, 10);
    this.robotArms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, limbMat);
      arm.position.set(side * 0.31, 0.4, 0.01);
      arm.rotation.z = side * 0.32;
      visual.add(arm);
      this.robotArms.push(arm);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), limbMat);
      foot.position.set(side * 0.13, 0.12, 0.03);
      foot.scale.set(1, 0.7, 1.15);
      visual.add(foot);
    }

    // Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.86, 0);
    visual.add(headGroup);
    this.robotHeadGroup = headGroup;

    const head = new THREE.Mesh(roundedPanelGeometry(0.74, 0.55, 0.42, 0.17), headMat);
    headGroup.add(head);
    this.robotHitMeshes = [head];

    const screen = new THREE.Mesh(roundedPanelGeometry(0.58, 0.38, 0.045, 0.12), screenMat);
    screen.position.set(0, 0.005, 0.218);
    headGroup.add(screen);

    this.faceCanvas = document.createElement("canvas");
    this.faceCanvas.width = 512;
    this.faceCanvas.height = 320;
    this.faceContext = this.faceCanvas.getContext("2d");
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.faceTexture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const faceMaterial = new THREE.MeshBasicMaterial({
      map: this.faceTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.34), faceMaterial);
    faceMesh.position.set(0, 0.005, 0.275);
    faceMesh.renderOrder = 4;
    headGroup.add(faceMesh);

    const cheekGeo = new THREE.CircleGeometry(0.052, 20);
    const cheekMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.theme.colors.blush),
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    this.cheekMaterial = cheekMat;
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(cheekGeo, cheekMat);
      cheek.position.set(side * 0.235, -0.075, 0.277);
      cheek.scale.set(1, 0.6, 1);
      cheek.renderOrder = 5;
      headGroup.add(cheek);
    }

    // Antenna (part of the base silhouette only)
    this.robotAntenna = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.016, 0.2, 8),
      limbMat,
    );
    stem.position.y = 0.36;
    this.robotAntenna.add(stem);
    this.antennaTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 12),
      accentMat,
    );
    this.antennaTip.position.y = 0.49;
    this.robotAntenna.add(this.antennaTip);
    headGroup.add(this.robotAntenna);

    this.buildRobotAccessories(headGroup);
    this.updateRobotAccessory();
    this.drawRobotFace();
    this.robotGroup.position.set(this.robotPosition.x, 0, this.robotPosition.z);
    this.robotHitMeshes.push(body);

    // A quiet floor marker makes the little mascot easy to find in the wide
    // full-house view.
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.theme.colors.accent),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.robotMarkerMaterial = markerMaterial;
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.31, 32),
      markerMaterial,
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.025;
    this.robotGroup.add(marker);
    this.robotMarker = marker;

    this.robotTag = this.makeRobotTag();
    this.robotTag.position.y = 1.56;
    this.robotGroup.add(this.robotTag);
  }

  makeRobotTag() {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(255, 253, 247, .92)";
    this.roundRect(context, 18, 15, 284, 66, 24);
    context.fill();
    context.strokeStyle = "rgba(78, 123, 108, .26)";
    context.lineWidth = 2;
    this.roundRect(context, 18, 15, 284, 66, 24);
    context.stroke();
    context.fillStyle = this.theme.colors.accent;
    context.beginPath();
    context.arc(58, 48, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#35584f";
    context.font = "800 31px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText("tianbao", 80, 50);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0.92,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.45, 0.435, 1);
    sprite.renderOrder = 20;
    return sprite;
  }

  buildRobotAccessories(headGroup) {
    this.robotAccessories = {};
    const accessoryColor = this.theme.colors.accessory;
    const deepColor = this.theme.colors.accessoryDeep;
    const accentColor = this.theme.colors.accent;
    const add = (name, group) => {
      group.visible = false;
      this.robotAccessories[name] = group;
      headGroup.add(group);
      group.traverse((object) => {
        if (object.isMesh) this.robotSkin.accessory.push(object.material);
      });
      return group;
    };

    const halo = new THREE.Group();
    const haloRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.33, 0.022, 8, 48),
      this.material(accessoryColor, { emissive: accessoryColor, emissiveIntensity: 0.35 }),
    );
    haloRing.rotation.x = Math.PI / 2;
    haloRing.position.y = 0.47;
    halo.add(haloRing);
    add("halo", halo);

    const cat = new THREE.Group();
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.26, 4),
        this.material(this.theme.colors.headB, { roughness: 0.55 }),
      );
      ear.position.set(side * 0.22, 0.38, 0);
      ear.rotation.z = side * -0.16;
      ear.rotation.y = Math.PI / 4;
      cat.add(ear);
      const inner = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.15, 4),
        this.material(this.theme.colors.blush, { roughness: 0.7 }),
      );
      inner.position.set(side * 0.22, 0.37, 0.035);
      inner.rotation.z = side * -0.16;
      inner.rotation.y = Math.PI / 4;
      cat.add(inner);
    }
    add("cat", cat);

    const bunny = new THREE.Group();
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.055, 0.22, 4, 10),
        this.material(this.theme.colors.headB, { roughness: 0.55 }),
      );
      ear.position.set(side * 0.14, 0.53, 0);
      ear.rotation.z = side * -0.12;
      bunny.add(ear);
    }
    add("bunny", bunny);

    const horns = new THREE.Group();
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.065, 0.27, 8),
        this.material(accessoryColor, { roughness: 0.45 }),
      );
      horn.position.set(side * 0.27, 0.38, 0);
      horn.rotation.z = side * -0.62;
      horns.add(horn);
    }
    add("horns", horns);

    const twin = new THREE.Group();
    for (const side of [-1, 1]) {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.012, 0.22, 6),
        this.material(deepColor, { roughness: 0.5 }),
      );
      stem.position.set(side * 0.22, 0.4, 0);
      stem.rotation.z = side * -0.22;
      twin.add(stem);
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 12, 8),
        this.material(side > 0 ? accessoryColor : accentColor, { emissive: accessoryColor, emissiveIntensity: 0.4 }),
      );
      ball.position.set(side * 0.255, 0.51, 0);
      twin.add(ball);
    }
    add("twin", twin);

    const moon = new THREE.Group();
    const crescent = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.032, 8, 22, Math.PI * 1.35),
      this.material(accessoryColor, { emissive: accessoryColor, emissiveIntensity: 0.18 }),
    );
    crescent.position.set(0.39, 0.14, 0.06);
    crescent.rotation.z = 0.6;
    moon.add(crescent);
    add("moon", moon);

    const headphones = new THREE.Group();
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.028, 8, 38, Math.PI),
      this.material(accessoryColor, { roughness: 0.5 }),
    );
    band.position.y = 0.01;
    headphones.add(band);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.095, 18),
        this.material(accessoryColor, { roughness: 0.46 }),
      );
      cup.position.set(side * 0.36, -0.045, 0.02);
      cup.rotation.z = Math.PI / 2;
      headphones.add(cup);
    }
    add("headphones", headphones);

    const visor = new THREE.Group();
    const glass = new THREE.Mesh(
      roundedPanelGeometry(0.65, 0.43, 0.022, 0.15),
      this.material(accentColor, { transparent: true, opacity: 0.2, roughness: 0.16, metalness: 0.05 }),
    );
    glass.position.set(0, 0.005, 0.287);
    visor.add(glass);
    const visorEdge = new THREE.Mesh(
      roundedPanelGeometry(0.67, 0.45, 0.01, 0.16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accentColor), transparent: true, opacity: 0.55 }),
    );
    visorEdge.position.set(0, 0.005, 0.285);
    visor.add(visorEdge);
    add("visor", visor);

    const cap = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      this.material(accessoryColor, { roughness: 0.55 }),
    );
    dome.position.y = 0.24;
    dome.scale.y = 0.8;
    cap.add(dome);
    const brim = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.035, 0.3),
      this.material(deepColor, { roughness: 0.6 }),
    );
    brim.position.set(0, 0.26, 0.2);
    cap.add(brim);
    add("cap", cap);

    const beret = new THREE.Group();
    const hat = new THREE.Mesh(
      new THREE.SphereGeometry(0.33, 20, 12),
      this.material(accessoryColor, { roughness: 0.62 }),
    );
    hat.position.y = 0.29;
    hat.scale.set(1.08, 0.32, 1);
    hat.rotation.z = -0.12;
    beret.add(hat);
    const nub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.08, 6),
      this.material(deepColor, { roughness: 0.5 }),
    );
    nub.position.set(0.02, 0.45, 0);
    beret.add(nub);
    add("beret", beret);

    const crown = new THREE.Group();
    const crownBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.25, 0.09, 16, 1, true),
      this.material(accessoryColor, { roughness: 0.42, metalness: 0.25 }),
    );
    crownBand.position.y = 0.36;
    crown.add(crownBand);
    for (let i = 0; i < 5; i += 1) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.14, 4),
        this.material(accessoryColor, { roughness: 0.4, metalness: 0.3 }),
      );
      const angle = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * 0.22, 0.47, Math.sin(angle) * 0.22);
      crown.add(spike);
    }
    add("crown", crown);

    const sprout = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.016, 0.18, 6),
      this.material(deepColor, { roughness: 0.6 }),
    );
    stem.position.y = 0.38;
    sprout.add(stem);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 8),
        this.material(accessoryColor, { roughness: 0.7 }),
      );
      leaf.position.set(side * 0.08, 0.48, 0);
      leaf.scale.set(0.95, 0.32, 0.6);
      leaf.rotation.z = side * 0.45;
      sprout.add(leaf);
    }
    add("sprout", sprout);

    const flower = new THREE.Group();
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const petal = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 10, 8),
        this.material(accessoryColor, { roughness: 0.6 }),
      );
      petal.position.set(Math.cos(angle) * 0.1 + 0.32, 0.25 + Math.sin(angle) * 0.1, 0.04);
      flower.add(petal);
    }
    const center = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 10, 8),
      this.material(deepColor, { roughness: 0.5 }),
    );
    center.position.set(0.32, 0.25, 0.065);
    flower.add(center);
    add("flower", flower);

    const glasses = new THREE.Group();
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.011, 6, 22),
        this.material("#253a38", { roughness: 0.35, metalness: 0.1 }),
      );
      rim.position.set(side * 0.14, 0.02, 0.283);
      glasses.add(rim);
    }
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.012, 0.012),
      this.material("#253a38", { roughness: 0.35 }),
    );
    bridge.position.set(0, 0.02, 0.283);
    glasses.add(bridge);
    add("glasses", glasses);
  }

  updateRobotAccessory() {
    if (!this.robotAccessories) return;
    const active = this.theme.accessory || "antenna";
    for (const [name, group] of Object.entries(this.robotAccessories)) {
      group.visible = name === active;
    }
    if (this.robotAntenna) this.robotAntenna.visible = active === "antenna";
  }

  drawRobotFace() {
    if (!this.faceContext) return;
    const context = this.faceContext;
    const w = this.faceCanvas.width;
    const h = this.faceCanvas.height;
    const face = this.theme.colors.face;
    const blush = this.theme.colors.blush;
    const eye = this.faceEye || "open";
    const mouth = this.faceMouth || "smile";
    const blinking = performance.now() < this.blinkUntil;
    context.clearRect(0, 0, w, h);
    context.lineCap = "round";
    context.lineJoin = "round";

    const eyeX = [168, 344];
    const eyeY = 132;
    const stroke = 19;
    context.strokeStyle = face;
    context.fillStyle = face;
    context.lineWidth = stroke;

    for (const x of eyeX) {
      if (blinking || eye === "closed" || eye === "calm" || eye === "squint" || eye === "squintSoft") {
        context.beginPath();
        context.moveTo(x - 24, eyeY);
        context.quadraticCurveTo(x, eyeY + 26, x + 24, eyeY);
        context.stroke();
      } else if (eye === "happy") {
        context.beginPath();
        context.moveTo(x - 25, eyeY + 16);
        context.quadraticCurveTo(x, eyeY - 28, x + 25, eyeY + 16);
        context.stroke();
      } else if (eye === "sadSoft" || eye === "sadHeavy") {
        context.save();
        context.translate(x, eyeY);
        context.rotate(x < 250 ? 0.15 : -0.15);
        context.beginPath();
        context.ellipse(0, 0, 18, 25, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      } else if (eye === "bright" || eye === "wide") {
        context.beginPath();
        context.ellipse(x, eyeY, 25, eye === "wide" ? 34 : 30, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#ffffff";
        context.globalAlpha = 0.8;
        context.beginPath();
        context.arc(x + 7, eyeY - 9, 5, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        context.fillStyle = face;
      } else if (eye === "neutral") {
        context.beginPath();
        context.ellipse(x, eyeY, 20, 27, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#ffffff";
        context.globalAlpha = 0.55;
        context.beginPath();
        context.arc(x + 5, eyeY - 7, 4, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        context.fillStyle = face;
      } else {
        context.beginPath();
        context.ellipse(x, eyeY, 20, 28, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#ffffff";
        context.globalAlpha = 0.75;
        context.beginPath();
        context.arc(x + 6, eyeY - 9, 5, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        context.fillStyle = face;
      }
    }

    // Cheeks are painted into the face texture as a soft glow.
    context.fillStyle = blush;
    context.globalAlpha = 0.26;
    for (const x of [112, 400]) {
      context.beginPath();
      context.ellipse(x, 192, 34, 18, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    context.strokeStyle = face;
    context.fillStyle = face;
    context.lineWidth = 15;
    const cx = w / 2;
    const cy = 218;
    if (mouth === "laugh" || mouth === "grin") {
      context.beginPath();
      context.moveTo(cx - 56, cy - 18);
      context.quadraticCurveTo(cx, cy + 48, cx + 56, cy - 18);
      context.stroke();
    } else if (mouth === "frown" || mouth === "wail" || mouth === "frownSmall") {
      context.beginPath();
      context.moveTo(cx - 42, cy + 19);
      context.quadraticCurveTo(cx, cy - 26, cx + 42, cy + 19);
      context.stroke();
    } else if (mouth === "touchBliss" || mouth === "bliss") {
      context.beginPath();
      context.ellipse(cx, cy + 2, 22, 15, 0, 0, Math.PI * 2);
      context.fill();
    } else if (mouth === "o" || mouth === "listenO") {
      context.beginPath();
      context.ellipse(cx, cy, 16, 23, 0, 0, Math.PI * 2);
      context.fill();
    } else if (mouth === "flat" || mouth === "listenFlat") {
      context.beginPath();
      context.moveTo(cx - 32, cy);
      context.lineTo(cx + 32, cy);
      context.stroke();
    } else {
      context.beginPath();
      context.moveTo(cx - 38, cy - 4);
      context.quadraticCurveTo(cx, cy + 26, cx + 38, cy - 4);
      context.stroke();
    }

    this.faceTexture.needsUpdate = true;
  }

  setFace(eye, mouth) {
    this.faceEye = eye || this.faceEye || "open";
    this.faceMouth = mouth || this.faceMouth || "smile";
    const blinkable = new Set(["open", "wide", "bright", "neutral", "sadSoft", "sadHeavy"]);
    if (!blinkable.has(this.faceEye)) this.blinkUntil = 0;
    this.drawRobotFace();
  }

  applyTheme(theme, { initial = false } = {}) {
    if (!theme || !theme.colors) return;
    this.theme = theme;
    if (!this.robotSkin) return;
    const update = (materials, color, options = {}) => {
      for (const material of materials) {
        material.color.set(color);
        if (options.emissive) material.emissive.set(options.emissive);
      }
    };
    update(this.robotSkin.body, theme.colors.bodyA);
    update(this.robotSkin.limb, theme.colors.limb);
    update(this.robotSkin.head, theme.colors.headA);
    update(this.robotSkin.belly, theme.colors.belly);
    update(this.robotSkin.accent, theme.colors.accent);
    update(this.robotSkin.screen, theme.colors.screenA);
    for (const material of this.robotSkin.accessory) {
      if (!material || !material.color) continue;
      // Visor/glasses/accessory parts keep their own contrast; only re-tint
      // the pieces that were built from the palette's accessory family.
      if (material.userData?.skinAccessory) {
        material.color.set(theme.colors.accessory);
      }
    }
    if (this.cheekMaterial) this.cheekMaterial.color.set(theme.colors.blush);
    if (this.robotMarkerMaterial) this.robotMarkerMaterial.color.set(theme.colors.accent);

    // Accessories mix several palette entries, so rebuilding this small
    // group is simpler and less error-prone than trying to recolour every
    // mesh in place.
    if (this.robotHeadGroup && this.robotAccessories) {
      for (const group of Object.values(this.robotAccessories)) {
        this.robotHeadGroup.remove(group);
        group.traverse((object) => {
          if (object.isMesh) object.geometry?.dispose?.();
        });
      }
      this.robotAccessories = {};
      this.robotSkin.accessory = [];
      this.buildRobotAccessories(this.robotHeadGroup);
    }
    this.updateRobotAccessory();
    this.drawRobotFace();
    if (!initial) this.updateChargeUI();
  }

  /* ======================================================================
     Robot movement / docking
     ====================================================================== */

  placeRobot(x, z, rotation = this.robotGroup?.rotation.y || 0) {
    this.robotPosition.x = x;
    this.robotPosition.z = z;
    if (this.robotGroup) {
      this.robotGroup.position.set(x, 0, z);
      this.robotGroup.rotation.y = rotation;
    }
  }

  updateRobotRoom(force = false) {
    const room = roomAt(this.robotPosition.x, this.robotPosition.z);
    const changed = force || !this.robotRoom || room?.id !== this.robotRoom?.id;
    this.robotRoom = room;
    if (changed) {
      if (this.roomStatus) this.roomStatus.textContent = room ? room.name : "未知房间";
      if (this.footerRoom) this.footerRoom.textContent = room ? room.name : "未知房间";
      this.updateCameraLabels();
      this.callbacks.onRoomChange(room);
    }
    return room;
  }

  updateRobotStatus(force = false) {
    const now = performance.now();
    if (!force && now - this.lastStatusAt < 250) return;
    this.lastStatusAt = now;
    if (!this.robotStatus) return;
    let text = "安静地待在这里";
    if (this.docked && this.charging) text = "正在无线充电";
    else if (this.docked) text = "已停靠在充电座";
    else if (this.docking) text = "正在自动归位";
    else if (this.keyboardMoving) text = "正在用键盘移动";
    else if (this.path.length > this.pathIndex) text = "正在穿过房间";
    if (this.robotStatus.textContent !== text) this.robotStatus.textContent = text;
    this.updateRobotRoom();
  }

  setEnergy(energy) {
    this.energy = clamp(Number(energy) || 0, 0, 100);
    this.updateChargeUI();
  }

  updateChargeUI() {
    if (!this.chargeStatus) return;
    const full = this.docked && this.energy >= 99.95;
    const state = full
      ? { phase: "full", label: "已充满 · 可以出发啦", percent: 100 }
      : chargingStateFor({
        energy: this.energy,
        docked: this.docked,
        charging: this.charging,
      });
    this.chargeStatus.textContent = state.label;
    if (this.chargeCard) this.chargeCard.classList.toggle("is-charging", state.phase === "charging");
    if (this.chargeBar) this.chargeBar.style.width = `${state.percent}%`;
    this.callbacks.onStatus({ ...this.getState(), charge: state });
  }

  setCharging(charging) {
    this.charging = Boolean(charging && this.docked);
    this.updateChargeUI();
    this.updateRobotStatus(true);
  }

  setDockedFromApp(docked) {
    // Only used to reconcile after a view switch; Home3D still owns movement.
    if (!docked && this.docked) this.leaveDock("external");
  }

  walkTo(x, z, { onArrive = null } = {}) {
    if (!this.mounted) return false;
    if (this.docked || this.docking) this.leaveDock("move");
    const targetRoom = roomAt(x, z);
    if (!targetRoom) return false;
    const path = findPath(this.grid, this.robotPosition, { x, z });
    if (!path || !path.length) {
      this.callbacks.onStatus({ message: "这里过不去" });
      return false;
    }
    this.path = path.slice(1);
    this.pathIndex = 0;
    this.pathOnArrive = onArrive;
    this.updateRobotStatus(true);
    return true;
  }

  returnToDock(trigger = "manual") {
    if (!this.mounted) return false;
    if (this.docked) {
      this.callbacks.onDockChange({
        docked: true,
        docking: false,
        trigger,
        x: this.robotPosition.x,
        z: this.robotPosition.z,
      });
      return true;
    }
    if (this.docking) return true;
    const approach = HOME_LAYOUT.charging.approach;
    this.dockTrigger = trigger;
    const started = this.walkTo(approach.x, approach.z, {
      onArrive: () => this.beginDock(trigger),
    });
    if (!started) {
      // Fallback for a blocked approach: dock from where tianbao is, still
      // letting the scene take over and glide to the pad.
      this.beginDock(trigger);
    }
    return true;
  }

  beginDock(trigger = "manual") {
    if (!this.mounted || this.docked || this.docking) return false;
    this.path = [];
    this.pathIndex = 0;
    this.docking = true;
    this.dockTrigger = trigger;
    this.dockStart = {
      x: this.robotPosition.x,
      z: this.robotPosition.z,
    };
    this.dockProgress = 0;
    this.updateRobotStatus(true);
    return true;
  }

  completeDock() {
    const pad = HOME_LAYOUT.charging;
    this.placeRobot(pad.x, pad.z, 0);
    this.docking = false;
    this.docked = true;
    this.dockProgress = 1;
    this.dockCooldownUntil = performance.now() + 1500;
    this.updateRobotStatus(true);
    this.updateChargeUI();
    this.callbacks.onDockChange({
      docked: true,
      docking: false,
      trigger: this.dockTrigger || "manual",
      x: pad.x,
      z: pad.z,
    });
    this.dockTrigger = null;
  }

  leaveDock(reason = "manual") {
    if (!this.docked && !this.docking) return false;
    const wasDocked = this.docked;
    this.docked = false;
    this.docking = false;
    this.charging = false;
    this.dockProgress = 0;
    this.dockCooldownUntil = performance.now() + 2200;
    this.updateRobotStatus(true);
    this.updateChargeUI();
    if (wasDocked) {
      this.callbacks.onDockChange({
        docked: false,
        docking: false,
        trigger: this.dockTrigger || "manual",
        reason,
        x: this.robotPosition.x,
        z: this.robotPosition.z,
      });
    }
    this.dockTrigger = null;
    return wasDocked;
  }

  hasKeyboardMoveInput() {
    for (const code of MOVE_CODES) {
      if (this.moveKeys.has(code)) return true;
    }
    return false;
  }

  clearKeyboard() {
    this.moveKeys.clear();
    this.lookKeys.clear();
    this.keyboardMoving = false;
  }

  updateLook(dt) {
    if (!this.lookKeys.size) return;
    const yawInput = (this.lookKeys.has("ArrowRight") ? 1 : 0)
      - (this.lookKeys.has("ArrowLeft") ? 1 : 0);
    const pitchInput = (this.lookKeys.has("ArrowUp") ? 1 : 0)
      - (this.lookKeys.has("ArrowDown") ? 1 : 0);

    if (this.mode === "camera") {
      this.eye.yaw += yawInput * LOOK_YAW_SPEED * dt;
      this.eye.pitch = clamp(
        this.eye.pitch + pitchInput * LOOK_PITCH_SPEED * dt,
        -1.18,
        1.18,
      );
    } else if (this.mode === "orbit") {
      this.orbit.azimuth += yawInput * LOOK_YAW_SPEED * dt;
      this.orbit.polar = clamp(
        this.orbit.polar - pitchInput * LOOK_PITCH_SPEED * dt,
        0.28,
        1.36,
      );
    }
  }

  keyboardDirection() {
    const forwardAxis = (this.moveKeys.has("KeyW") ? 1 : 0)
      - (this.moveKeys.has("KeyS") ? 1 : 0);
    const rightAxis = (this.moveKeys.has("KeyD") ? 1 : 0)
      - (this.moveKeys.has("KeyA") ? 1 : 0);
    if (forwardAxis === 0 && rightAxis === 0) return null;

    if (this.mode === "camera") {
      _moveForward.set(
        Math.sin(this.eye.yaw),
        0,
        Math.cos(this.eye.yaw),
      );
    } else {
      this.camera.getWorldDirection(_moveForward);
      _moveForward.y = 0;
      if (_moveForward.lengthSq() < 0.0001) {
        _moveForward.set(
          Math.sin(this.orbit.azimuth),
          0,
          Math.cos(this.orbit.azimuth),
        );
      } else {
        _moveForward.normalize();
      }
    }

    _moveRight.set(_moveForward.z, 0, -_moveForward.x);
    _moveVector.set(0, 0, 0)
      .addScaledVector(_moveForward, forwardAxis)
      .addScaledVector(_moveRight, rightAxis);
    if (_moveVector.lengthSq() < 0.0001) return null;
    return _moveVector.normalize();
  }

  tryKeyboardMove(dx, dz) {
    const x = this.robotPosition.x;
    const z = this.robotPosition.z;
    const targetX = x + dx;
    const targetZ = z + dz;
    if (this.grid.isWalkable(targetX, targetZ) && roomAt(targetX, targetZ)) {
      this.placeRobot(targetX, targetZ, this.robotGroup.rotation.y);
      return true;
    }
    if (this.grid.isWalkable(targetX, z) && roomAt(targetX, z)) {
      this.placeRobot(targetX, z, this.robotGroup.rotation.y);
      return true;
    }
    if (this.grid.isWalkable(x, targetZ) && roomAt(x, targetZ)) {
      this.placeRobot(x, targetZ, this.robotGroup.rotation.y);
      return true;
    }
    return false;
  }

  updateKeyboardMovement(dt) {
    this.keyboardMoving = false;
    const direction = this.keyboardDirection();
    if (!direction) return;

    if (this.docked || this.docking) this.leaveDock("keyboard");
    this.path = [];
    this.pathIndex = 0;
    this.pathOnArrive = null;

    const step = ROBOT_KEYBOARD_SPEED * dt;
    const moved = this.tryKeyboardMove(direction.x * step, direction.z * step);
    this.keyboardMoving = true;
    if (!moved) return;

    if (this.mode === "camera") {
      this.robotGroup.rotation.y = this.eye.yaw;
    } else {
      const desiredRotation = Math.atan2(direction.x, direction.z);
      this.robotGroup.rotation.y = this.lerpAngle(
        this.robotGroup.rotation.y,
        desiredRotation,
        Math.min(1, dt * 12),
      );
      if (this.mode !== "follow") {
        // Keep orbit keyboard movement camera relative; no forced camera turn.
      }
    }
    this.updateRobotRoom();
  }

  maybeProximityDock(now) {
    if (this.docked || this.docking) return;
    if (this.path.length > this.pathIndex) return;
    if (now <= this.dockCooldownUntil) return;
    const distance = Math.hypot(
      this.robotPosition.x - HOME_LAYOUT.charging.x,
      this.robotPosition.z - HOME_LAYOUT.charging.z,
    );
    if (distance <= DOCK_RADIUS) this.beginDock("proximity");
  }

  updateMovement(dt, now) {
    this.updateLook(dt);

    if (this.docking) {
      const pad = HOME_LAYOUT.charging;
      this.dockProgress = Math.min(1, (this.dockProgress || 0) + dt * 1.15);
      const eased = easeInOut(this.dockProgress);
      const from = this.dockStart || this.robotPosition;
      this.placeRobot(
        from.x + (pad.x - from.x) * eased,
        from.z + (pad.z - from.z) * eased,
        -easeInOut(this.dockProgress) * 0.4,
      );
      if (this.dockProgress >= 1) this.completeDock();
      return;
    }

    if (this.docked) {
      // The pad owns the pose. WASD is handled by keydown, which explicitly
      // undocks before moving. Keep the robot still while keys are idle.
      this.robotGroup.position.y = 0;
      this.robotGroup.rotation.y = this.mode === "camera" ? this.eye.yaw : 0;
      this.keyboardMoving = false;
      return;
    }

    this.updateKeyboardMovement(dt);

    if (this.path.length > this.pathIndex) {
      const target = this.path[this.pathIndex];
      const dx = target.x - this.robotPosition.x;
      const dz = target.z - this.robotPosition.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.05) {
        this.placeRobot(target.x, target.z);
        this.pathIndex += 1;
        if (this.pathIndex >= this.path.length) {
          const onArrive = this.pathOnArrive;
          this.path = [];
          this.pathIndex = 0;
          this.pathOnArrive = null;
          this.updateRobotStatus(true);
          if (onArrive) onArrive();
        }
      } else {
        const step = Math.min(distance, ROBOT_WALK_SPEED * dt);
        const nx = this.robotPosition.x + (dx / distance) * step;
        const nz = this.robotPosition.z + (dz / distance) * step;
        const desiredRotation = Math.atan2(dx, dz);
        if (this.mode === "camera") {
          this.robotGroup.rotation.y = this.eye.yaw;
        } else {
          this.robotGroup.rotation.y = this.lerpAngle(
            this.robotGroup.rotation.y,
            desiredRotation,
            Math.min(1, dt * 10),
          );
        }
        this.placeRobot(nx, nz, this.robotGroup.rotation.y);
      }
      this.updateRobotRoom();
    }

    this.maybeProximityDock(now);
  }

  lerpAngle(from, to, amount) {
    let delta = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * amount;
  }

  animateRobot(now) {
    if (!this.robotVisual) return;
    const moving = this.path.length > this.pathIndex
      || this.keyboardMoving
      || this.docking;
    const speed = moving ? 8 : 1.7;
    const amplitude = moving ? 0.025 : 0.012;
    this.robotVisual.position.y = Math.sin(now * 0.001 * speed) * amplitude;
    if (this.robotHeadGroup) {
      this.robotHeadGroup.rotation.z = Math.sin(now * 0.001 * 1.2) * 0.012;
      this.robotHeadGroup.rotation.x = moving ? Math.sin(now * 0.009) * 0.015 : 0;
    }
    if (this.robotArms) {
      for (let i = 0; i < this.robotArms.length; i += 1) {
        this.robotArms[i].rotation.x = moving
          ? Math.sin(now * 0.012 + i * Math.PI) * 0.35
          : Math.sin(now * 0.002 + i) * 0.04;
      }
    }
    if (this.antennaTip) {
      const pulse = this.docked && this.charging ? 1.2 : 1;
      this.antennaTip.scale.setScalar(pulse);
    }
    if (this.robotMarker) {
      this.robotMarker.rotation.z = now * 0.00035;
      const markerPulse = 0.86 + Math.sin(now * 0.0022) * 0.14;
      this.robotMarker.scale.setScalar(markerPulse);
      this.robotMarkerMaterial.opacity = this.docked ? 0.34 : 0.55;
    }

    if (now > this.nextBlinkAt && !this.docked) {
      this.blinkUntil = now + 120;
      this.nextBlinkAt = now + 2600 + Math.random() * 3200;
      this.drawRobotFace();
    } else if (this.blinkUntil && now > this.blinkUntil) {
      this.blinkUntil = 0;
      this.drawRobotFace();
    }
  }

  /* ======================================================================
     Camera / UI modes
     ====================================================================== */

  defaultEyeYaw() {
    const room = roomAt(this.robotPosition.x, this.robotPosition.z);
    if (!room) return this.eye.yaw;
    // Looking at the room centre gives a lived-in view: sofa and window in
    // the living hall, bed/desk in bedrooms, island in the kitchen. The
    // balcony and entry face back into the home.
    if (room.id === "balcony" || room.id === "foyer") return -Math.PI / 2;
    const center = roomCenter(room);
    const dx = center.x - this.robotPosition.x;
    const dz = center.z - this.robotPosition.z;
    if (Math.hypot(dx, dz) < 0.1) return this.robotGroup?.rotation.y || 0;
    return Math.atan2(dx, dz);
  }

  setMode(mode, { silent = false } = {}) {
    if (!CAMERA_MODES.has(mode)) return;
    const previousMode = this.mode;
    this.mode = mode;
    this.shell.dataset.mode = mode;
    this.wallsUp = mode === "camera";

    if (mode === "camera" && previousMode !== "camera") {
      // The camera is mounted in tianbao's head. Point it toward the room
      // rather than into the nearest exterior glass wall.
      this.eye.yaw = this.defaultEyeYaw();
      this.eye.pitch = -0.02;
      if (this.robotGroup) this.robotGroup.rotation.y = this.eye.yaw;
      this.clearKeyboard();
    }

    for (const button of this.modeButtons) {
      const active = button.dataset.homeMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
    this.updateCameraOverlay();
    this.updateModeFooter();
    if (!silent) this.callbacks.onModeChange(mode);
  }

  updateModeFooter() {
    if (!this.footerMode) return;
    const labels = {
      orbit: "全屋俯视",
      follow: "第三人称跟随",
      camera: "tianbao 第一视角",
    };
    this.footerMode.textContent = labels[this.mode] || labels.orbit;
    if (this.footerRoom) {
      this.footerRoom.textContent = this.robotRoom?.name || "横厅 · 客厅";
    }
    if (this.keyAction) {
      const hints = {
        orbit: "拖动 / 方向键旋转视角",
        follow: "镜头自动跟随",
        camera: "↑↓←→ 环视",
      };
      this.keyAction.textContent = hints[this.mode] || hints.orbit;
    }
    this.updateCameraLabels();
  }

  updateCameraLabels() {
    if (this.camName) {
      const short = this.robotRoom?.short || "家";
      this.camName.textContent = `TIANBAO EYE · ${short}`;
    }
  }

  updateCameraOverlay() {
    const isCamera = this.mode === "camera";
    if (this.cameraOverlay) this.cameraOverlay.hidden = !isCamera;
    if (this.canvas) {
      this.canvas.setAttribute(
        "aria-label",
        isCamera ? "tianbao 第一人称仿真视角画面" : "可拖拽旋转的 tianbao 3D 大平层",
      );
    }
    this.updateCameraLabels();
  }

  updateClock() {
    if (this.camTime) {
      const now = new Date();
      this.camTime.textContent = now.toLocaleTimeString("zh-CN", { hour12: false });
    }
    if (this.camMeta) {
      this.camMeta.textContent = this.mode === "camera"
        ? "FIRST PERSON · 1080P · SIM"
        : "1080P · 25 FPS";
    }
    this.updateCameraLabels();
  }

  updateCamera(dt, now) {
    if (!this.camera) return;
    const isCamera = this.mode === "camera";
    const wallTarget = this.wallsUp ? 1 : WALL_CUTAWAY;
    this.wallScale += (wallTarget - this.wallScale) * Math.min(1, dt * 5.5);
    if (this.wallGroup) this.wallGroup.scale.y = this.wallScale;
    if (this.windowGroup) this.windowGroup.scale.y = this.wallScale;
    if (this.ceilingGroup) this.ceilingGroup.visible = isCamera;
    if (this.labelGroup) this.labelGroup.visible = !isCamera;
    if (this.robotVisual) this.robotVisual.visible = !isCamera;
    if (this.robotMarker) this.robotMarker.visible = !isCamera;
    if (this.robotTag) this.robotTag.visible = !isCamera;

    if (isCamera) {
      // First-person eye camera. The robot's own meshes are hidden so the
      // lens is never swallowed by the inside of its head.
      this.robotGroup.rotation.y = this.eye.yaw;
      const eyeHeight = this.docked ? 0.82 : 1.03;
      const bob = Math.sin(now * 0.0032) * (this.keyboardMoving ? 0.024 : 0.006);
      const cosPitch = Math.cos(this.eye.pitch);
      const dirX = Math.sin(this.eye.yaw) * cosPitch;
      const dirY = Math.sin(this.eye.pitch);
      const dirZ = Math.cos(this.eye.yaw) * cosPitch;
      const x = this.robotPosition.x - LAYOUT_CENTER.x + dirX * 0.1;
      const z = this.robotPosition.z - LAYOUT_CENTER.z + dirZ * 0.1;
      this.camera.position.set(x, eyeHeight + bob, z);
      this.camera.lookAt(
        x + dirX * 8,
        eyeHeight + bob + dirY * 8,
        z + dirZ * 8,
      );
      if (Math.abs(this.camera.fov - FIRST_PERSON_FOV) > 0.02) {
        this.camera.fov += (FIRST_PERSON_FOV - this.camera.fov) * Math.min(1, dt * 8);
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    if (this.mode === "follow") {
      const target = new THREE.Vector3(
        this.robotPosition.x - LAYOUT_CENTER.x,
        0.55,
        this.robotPosition.z - LAYOUT_CENTER.z,
      );
      const desired = target.clone().add(new THREE.Vector3(4.8, 6.4, 6.2));
      const smoothing = Math.min(1, dt * 3.2);
      this.camera.position.lerp(desired, smoothing);
      this.followTarget.lerp(target, smoothing);
      this.camera.lookAt(this.followTarget);
      this.followPosition.copy(this.camera.position);
      if (Math.abs(this.camera.fov - 42) > 0.02) {
        this.camera.fov += (42 - this.camera.fov) * Math.min(1, dt * 8);
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    // Orbit
    const { azimuth, polar, radius, target } = this.orbit;
    const x = target.x + radius * Math.sin(polar) * Math.sin(azimuth);
    const y = target.y + radius * Math.cos(polar);
    const z = target.z + radius * Math.sin(polar) * Math.cos(azimuth);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(target);
    if (Math.abs(this.camera.fov - 42) > 0.01) {
      this.camera.fov = 42;
      this.camera.updateProjectionMatrix();
    }
  }


  /* ======================================================================
     Pointer / camera interaction + petting
     ====================================================================== */

  bindUI() {
    for (const button of this.modeButtons) {
      button.addEventListener("click", () => this.setMode(button.dataset.homeMode));
    }
    this.dockButton?.addEventListener("click", () => this.returnToDock("button"));
    this.bindPetButton();
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.addEventListener("lostpointercapture", this.handlePointerCancel);
    this.canvas.addEventListener("pointerleave", (event) => {
      if (this.pet && this.pet.pointerId === event.pointerId) return;
      if (!this.pointer.down) this.pointer.dragging = false;
    });
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleWindowBlur);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.lastClockTimer = window.setInterval(this.updateClock, 1000);
  }

  handleKeyDown(event) {
    if (!this.active || event.defaultPrevented || event.isComposing) return;
    if (isTypingTarget(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === "Escape" && this.mode === "camera") {
      event.preventDefault();
      this.setMode("orbit");
      return;
    }

    if (MOVE_CODES.has(event.code)) {
      if (!event.repeat) {
        if (this.docked || this.docking) this.leaveDock("keyboard");
        if (this.path.length) {
          this.path = [];
          this.pathIndex = 0;
          this.pathOnArrive = null;
        }
        this.moveKeys.add(event.code);
      }
      event.preventDefault();
      return;
    }

    if (LOOK_CODES.has(event.code)
        && (this.mode === "camera" || this.mode === "orbit")) {
      this.lookKeys.add(event.code);
      event.preventDefault();
    }
  }

  handleKeyUp(event) {
    if (!this.active) return;
    if (MOVE_CODES.has(event.code)) {
      this.moveKeys.delete(event.code);
      if (!this.hasKeyboardMoveInput()) this.keyboardMoving = false;
      event.preventDefault();
      return;
    }
    if (LOOK_CODES.has(event.code)) {
      this.lookKeys.delete(event.code);
      if (this.mode === "camera" || this.mode === "orbit") event.preventDefault();
    }
  }

  handleWindowBlur() {
    this.clearKeyboard();
  }

  handleVisibility() {
    if (document.hidden) this.clearKeyboard();
  }

  bindPetButton() {
    if (!this.petButton) return;
    let active = false;
    let startAt = 0;
    let level = "light";
    let timers = [];
    let keyboardTimer = null;
    const start = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      if (active) return;
      active = true;
      startAt = performance.now();
      level = "light";
      this.callbacks.onPetStart({ level, source: "3d-button" });
      this.setFace("squint", "smile");
      try { this.petButton.setPointerCapture(event.pointerId); } catch { /* ignore */ }
      timers = [
        window.setTimeout(() => {
          if (!active) return;
          level = "medium";
          this.callbacks.onPetLevel({ level });
          this.setFace("squint", "touchEnjoy");
        }, 500),
        window.setTimeout(() => {
          if (!active) return;
          level = "affectionate";
          this.callbacks.onPetLevel({ level });
          this.setFace("closed", "bliss");
        }, 1500),
      ];
    };
    const end = (send) => {
      if (!active) return;
      for (const timer of timers) clearTimeout(timer);
      if (keyboardTimer) {
        clearTimeout(keyboardTimer);
        keyboardTimer = null;
      }
      const elapsed = performance.now() - startAt;
      active = false;
      this._endButtonPet = null;
      const amount = touchAmountFor(elapsed);
      const finalLevel = touchLevelFor(elapsed);
      this.setFace("open", "smile");
      if (!send) {
        this.callbacks.onPetCancel({ source: "3d-button" });
        return;
      }
      this.callbacks.onPetEnd({
        amount,
        level: finalLevel,
        durationMs: Math.round(elapsed),
        source: "3d-button",
      });
    };
    this._endButtonPet = end;
    this.petButton.addEventListener("pointerdown", start);
    this.petButton.addEventListener("pointerup", (event) => {
      event.preventDefault();
      end(true);
    });
    this.petButton.addEventListener("pointercancel", () => end(false));
    this.petButton.addEventListener("lostpointercapture", () => end(false));
    this.petButton.addEventListener("contextmenu", (event) => event.preventDefault());
    this.petButton.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (active) return;
      active = true;
      startAt = performance.now();
      level = "medium";
      this.callbacks.onPetStart({ level, source: "3d-button" });
      this.setFace("squint", "smile");
      keyboardTimer = window.setTimeout(() => {
        if (!active) return;
        end(true);
      }, 800);
    });
  }

  raycasterFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, this.camera);
    return _raycaster;
  }

  hitRobot(event) {
    if (!this.robotHitMeshes) return false;
    const hits = this.raycasterFromEvent(event).intersectObjects(this.robotHitMeshes, false);
    return hits.length > 0;
  }

  screenToFloor(event) {
    const raycaster = this.raycasterFromEvent(event);
    const hit = raycaster.ray.intersectPlane(_groundPlane, _v3);
    if (!hit) return null;
    const local = this.layoutGroup.worldToLocal(hit.clone());
    if (local.x < 0 || local.x > W || local.z < 0 || local.z > D) return null;
    if (!roomAt(local.x, local.z)) return null;
    return { x: local.x, z: local.z };
  }

  handlePointerDown(event) {
    if (!this.active) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    this.pointer.down = true;
    this.pointer.dragging = false;
    this.pointer.startX = event.clientX;
    this.pointer.startY = event.clientY;
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
    this.pointer.pointerId = event.pointerId;
    this.pointer.startedAt = performance.now();
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }

    if (this.mode === "camera") {
      this.viewport.classList.add("is-looking");
      return;
    }

    if (this.hitRobot(event)) {
      this.startPet(event);
      this.pointer.dragging = true;
      return;
    }
    if (this.mode === "orbit") {
      this.viewport.classList.add("is-dragging");
    }
  }

  handlePointerMove(event) {
    if (!this.pointer.down) return;
    if (this.pet) {
      this.updatePet(event);
      return;
    }

    const dx = event.clientX - this.pointer.lastX;
    const dy = event.clientY - this.pointer.lastY;
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
    if (!this.pointer.dragging
      && Math.hypot(event.clientX - this.pointer.startX, event.clientY - this.pointer.startY) > 4) {
      this.pointer.dragging = true;
    }
    if (!this.pointer.dragging) return;

    if (this.mode === "camera") {
      // FPS-style look. Yaw is absolute (matching the robot's local +Z),
      // pitch is clamped so the view cannot flip upside down.
      this.eye.yaw += dx * 0.0042;
      this.eye.pitch = clamp(this.eye.pitch - dy * 0.0035, -1.18, 1.18);
      this.robotGroup.rotation.y = this.eye.yaw;
      return;
    }
    if (this.mode !== "orbit") return;

    this.orbit.azimuth -= dx * 0.006;
    this.orbit.polar = clamp(this.orbit.polar + dy * 0.0045, 0.28, 1.36);
  }

  handlePointerUp(event) {
    if (!this.pointer.down) return;
    const wasDragging = this.pointer.dragging;
    const elapsed = performance.now() - this.pointer.startedAt;
    this.pointer.down = false;
    this.pointer.dragging = false;
    this.viewport.classList.remove("is-dragging", "is-looking");
    try { this.canvas.releasePointerCapture(event.pointerId); } catch { /* ignore */ }

    if (this.pet) {
      this.endPet(true);
      return;
    }

    if (!wasDragging && elapsed < 500 && this.mode !== "camera") {
      const point = this.screenToFloor(event);
      if (point) {
        this.walkTo(point.x, point.z);
      }
    }
  }

  handlePointerCancel() {
    this.pointer.down = false;
    this.pointer.dragging = false;
    this.viewport.classList.remove("is-dragging", "is-looking");
    if (this.pet) this.endPet(false);
  }

  handleWheel(event) {
    if (!this.active || this.mode !== "orbit") return;
    event.preventDefault();
    this.orbit.radius = clamp(this.orbit.radius + event.deltaY * 0.012, 9, 34);
  }

  startPet(event) {
    this.pet = {
      start: performance.now(),
      level: "light",
      pointerId: event.pointerId,
      timers: [],
    };
    this.callbacks.onPetStart({ level: "light", source: "3d-canvas" });
    this.setFace("squint", "smile");
    this.pet.timers = [
      window.setTimeout(() => {
        if (!this.pet) return;
        this.pet.level = "medium";
        this.callbacks.onPetLevel({ level: "medium" });
        this.setFace("squint", "touchEnjoy");
      }, 500),
      window.setTimeout(() => {
        if (!this.pet) return;
        this.pet.level = "affectionate";
        this.callbacks.onPetLevel({ level: "affectionate" });
        this.setFace("closed", "bliss");
      }, 1500),
    ];
  }

  updatePet() {
    // Level changes are timer-driven; this hook intentionally stays cheap.
  }

  endPet(send) {
    if (!this.pet) return;
    for (const timer of this.pet.timers) clearTimeout(timer);
    const elapsed = performance.now() - this.pet.start;
    const level = touchLevelFor(elapsed);
    const amount = touchAmountFor(elapsed);
    this.pet = null;
    this.setFace("open", "smile");
    if (!send) {
      this.callbacks.onPetCancel({ source: "3d-canvas" });
      return;
    }
    this.callbacks.onPetEnd({
      amount,
      level,
      durationMs: Math.round(elapsed),
      source: "3d-canvas",
    });
  }

  endButtonPet(send = false) {
    if (typeof this._endButtonPet === "function") {
      this._endButtonPet(send);
    }
  }

  /* ======================================================================
     Frame loop
     ====================================================================== */

  renderLoop(timestamp) {
    if (!this.active || !this.renderer) return;
    this.rafId = window.requestAnimationFrame(this.renderLoop);
    const dt = Math.min(0.2, Math.max(0.001, (timestamp - this.lastFrameAt) / 1000));
    this.lastFrameAt = timestamp;

    this.updateMovement(dt, timestamp);
    this.animateRobot(timestamp);
    this.updateCamera(dt, timestamp);
    this.updateChargeVisuals(timestamp);
    this.updateRobotStatus();

    const second = Math.floor(timestamp / 1000);
    if (second !== this.lastClockSecond) {
      this.lastClockSecond = second;
      this.updateClock();
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateChargeVisuals(timestamp) {
    if (!this.chargeRingMaterial) return;
    const active = this.docked || this.docking;
    const pulse = 0.72 + Math.sin(timestamp * 0.0028) * 0.18;
    this.chargeRingMaterial.opacity = active ? 0.92 : 0.44;
    this.chargeRingMaterial.emissiveIntensity = active ? 1.4 + pulse * 0.9 : 0.6;
    if (this.chargeInnerRing) {
      this.chargeInnerRing.material.opacity = active ? 0.8 : 0.3;
      this.chargeInnerRing.rotation.z += this.charging ? 0.008 : 0.002;
    }
    this.chargeRingMaterial.emissive.set(this.charging ? "#78f4ca" : "#50b999");
    if (this.chargeLight) {
      this.chargeLight.intensity = active ? (this.charging ? 2.2 : 1.2) : 0.7;
    }
    if (this.chargePadGroup) {
      this.chargePadGroup.position.y = 0.04 + (active ? Math.sin(timestamp * 0.002) * 0.008 : 0);
    }
  }

  getState() {
    return {
      mode: this.mode,
      room: this.robotRoom ? this.robotRoom.name : "",
      roomId: this.robotRoom ? this.robotRoom.id : "",
      docked: this.docked,
      docking: this.docking,
      charging: this.charging,
      energy: this.energy,
      look: { yaw: this.eye.yaw, pitch: this.eye.pitch },
      position: { ...this.robotPosition },
    };
  }

  get cameraMode() {
    return this.mode === "camera";
  }

  dispose() {
    this.deactivate();
    if (this.lastClockTimer) clearInterval(this.lastClockTimer);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.handleResize);
    if (this.renderer) this.renderer.dispose();
  }
}
