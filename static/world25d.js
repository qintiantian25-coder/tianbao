"use strict";

/**
 * tianbao virtual V0.5 - 2.5D room controller.
 *
 * A small pseudo-3D living room: up/down move in depth, left/right move
 * across, Space jumps. Holding Shift runs; tapping Shift dashes. The same
 * movement can be driven by the on-screen pad or by the debug panel buttons.
 *
 * Positions are percentages of the world box, so the scene scales with the
 * browser. The character's scale follows its depth to keep the 2.5D feeling.
 */

const DIRECTION_CODES = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

const X_MIN = 10;
const X_MAX = 90;
const Y_MIN = 46;
const Y_MAX = 92;
const WALK_X = 27;
const WALK_Y = 22;
const RUN_MULT = 1.85;
const DASH_MULT = 3.6;
const DASH_MS = 190;
const DASH_COOLDOWN_MS = 430;
const QUICK_SHIFT_MS = 230;
const JUMP_SPEED = 430;
const GRAVITY = 1350;

const CHARGE_DOCK = { x: 17.5, y: 89.5 };
const CHARGE_ZONE = { halfX: 5.8, halfY: 6.2 };
const DOCK_LEAVE_COOLDOWN_MS = 1800;

const MINI_EYES = new Set(["open", "happy", "calm", "sad", "squint", "closed", "wide", "bright", "neutral"]);
const MINI_MOUTHS = new Set(["smile", "laugh", "calm", "frown", "wail", "o", "flat", "w", "wide", "bliss"]);

function eyeFor(eye) {
  if (eye === "sadSoft" || eye === "sadHeavy") return "sad";
  if (eye === "squintSoft") return "squint";
  return MINI_EYES.has(eye) ? eye : "open";
}

function mouthFor(mouth) {
  const map = {
    laugh: "laugh",
    grin: "laugh",
    smile: "smile",
    calm: "calm",
    frownSmall: "frown",
    frown: "frown",
    wail: "wail",
    touchSoft: "smile",
    touchEnjoy: "smile",
    touchBliss: "bliss",
    listenO: "o",
    listenFlat: "flat",
    listenSmile: "smile",
    zhuzhuMouth: "w",
    "talk-a": "o",
    "talk-o": "o",
    "talk-e": "wide",
    "talk-closed": "smile",
  };
  const mapped = map[mouth] || mouth;
  return MINI_MOUTHS.has(mapped) ? mapped : "smile";
}

function isTypingTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export class World25D {
  constructor({ root, entity, char, flip, shadow, bubble, onStatus, onDockChange }) {
    this.root = root;
    this.entity = entity;
    this.char = char;
    this.flip = flip;
    this.shadow = shadow;
    this.bubble = bubble;
    this.onStatus = onStatus || (() => {});
    this.onDockChange = onDockChange || (() => {});
    this.chargePadEl = root.querySelector("#isoChargePad");

    this.active = false;
    this.pos = { x: 50, y: 74 };
    this.facing = "right";
    this.keyDirs = new Set();
    this.buttonDirs = new Set();
    this.shiftHeld = false;
    this.shiftDownAt = 0;
    this.runToggle = false;
    this.grounded = true;
    this.jumpZ = 0;
    this.jumpV = 0;
    this.dashUntil = 0;
    this.dashCooldownUntil = 0;
    this.dashDir = { x: 1, y: 0 };
    this.rafId = null;
    this.lastTs = 0;
    this.lastStatusAt = 0;
    this.lastMotion = "";
    this.eye = "open";
    this.mouth = "smile";
    this.docked = false;
    this.docking = false;
    this.dockTrigger = null;
    this.dockCooldownUntil = 0;
    this.charging = false;

    this.miniEyes = [...root.querySelectorAll("[data-mini-eye]")];
    this.miniMouths = [...root.querySelectorAll("[data-mini-mouth]")];

    this.tick = this.tick.bind(this);
    this.bindKeyboard();
    this.setFace("open", "smile");
    this.render(performance.now());
  }

  /* ---------------- lifecycle ---------------- */

  activate() {
    if (this.active) return;
    this.active = true;
    this.lastTs = performance.now();
    this.lastStatusAt = 0;
    this.emitStatus(true);
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  deactivate() {
    this.active = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.clearInputs();
    this.char.classList.remove("is-moving", "is-running", "is-jumping", "is-dashing");
    this.entity.classList.remove("is-dashing");
    document.querySelectorAll("[data-move]").forEach((button) => {
      button.classList.remove("is-pressed");
      button.setAttribute("aria-pressed", "false");
    });
    this.emitStatus(true);
  }

  bindKeyboard() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  handleBlur = () => {
    this.clearInputs();
  };

  handleVisibility = () => {
    if (document.hidden) this.clearInputs();
  };

  clearInputs() {
    this.keyDirs.clear();
    this.buttonDirs.clear();
    this.shiftHeld = false;
    this.changed();
  }

  /* ---------------- keyboard ---------------- */

  onKeyDown = (event) => {
    if (!this.active || isTypingTarget(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const direction = DIRECTION_CODES[event.code];
    if (direction) {
      event.preventDefault();
      if (this.docked || this.docking) this.leaveDock("move");
      this.keyDirs.add(direction);
      this.changed();
      return;
    }

    if (event.code === "Space") {
      // While the character itself is focused, Space pets tianbao
      // (handled by TouchController) instead of jumping.
      if (event.target instanceof Element && event.target.closest("#char25d")) return;
      event.preventDefault();
      if (!event.repeat) this.jump();
      return;
    }

    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      event.preventDefault();
      if (!event.repeat && !this.shiftHeld) {
        this.shiftHeld = true;
        this.shiftDownAt = performance.now();
        this.changed();
      }
    }
  };

  onKeyUp = (event) => {
    if (!this.active) return;
    const direction = DIRECTION_CODES[event.code];
    if (direction) {
      this.keyDirs.delete(direction);
      this.changed();
      return;
    }

    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      const wasHeld = this.shiftHeld;
      const quick = wasHeld && performance.now() - this.shiftDownAt < QUICK_SHIFT_MS;
      this.shiftHeld = false;
      if (quick) this.dash();
      this.changed();
    }
  };

  /* ---------------- public controls ---------------- */

  pressDirection(direction, pressed) {
    if (!this.active) return;
    if (pressed && (this.docked || this.docking)) this.leaveDock("move");
    if (pressed) this.buttonDirs.add(direction);
    else this.buttonDirs.delete(direction);
    this.changed();
  }

  /** Small step for a quick tap / keyboard activation of a direction button. */
  nudge(direction, amount = 2.4) {
    if (!this.active) return;
    if (this.docked || this.docking) this.leaveDock("move");
    let dx = 0;
    let dy = 0;
    if (direction === "left") dx = -amount;
    else if (direction === "right") dx = amount;
    else if (direction === "up") dy = -amount * 0.8;
    else if (direction === "down") dy = amount * 0.8;
    else return;

    if (dx !== 0) this.facing = dx < 0 ? "left" : "right";
    const depth = this.getDepth();
    const minX = 17 - depth * 7;
    const maxX = 83 + depth * 7;
    this.pos.x = Math.max(minX, Math.min(maxX, this.pos.x + dx));
    this.pos.y = Math.max(Y_MIN, Math.min(Y_MAX, this.pos.y + dy));
    this.render();
    this.emitStatus(true);
  }

  toggleRun() {
    this.runToggle = !this.runToggle;
    this.changed();
    return this.runToggle;
  }

  setRunToggle(value) {
    this.runToggle = Boolean(value);
    this.changed();
  }

  jump() {
    if (!this.active || !this.grounded || this.docked || this.docking) return false;
    this.grounded = false;
    this.jumpV = JUMP_SPEED;
    this.char.classList.add("is-jumping");
    this.emitStatus(true);
    return true;
  }

  dash() {
    if (!this.active || this.docked || this.docking) return false;
    const now = performance.now();
    if (now < this.dashCooldownUntil) return false;

    const input = this.inputVector();
    const hasInput = input.x !== 0 || input.y !== 0;
    const direction = hasInput
      ? input
      : { x: this.facing === "left" ? -1 : 1, y: 0 };

    this.dashDir = direction;
    this.dashUntil = now + DASH_MS;
    this.dashCooldownUntil = now + DASH_COOLDOWN_MS;
    this.char.classList.add("is-dashing");
    this.entity.classList.add("is-dashing");
    this.emitStatus(true);
    return true;
  }

  /* ---------------- wireless charging dock ---------------- */

  beginDock(trigger = "manual") {
    if (!this.active || this.docked || this.docking) return false;
    this.docking = true;
    this.dockTrigger = trigger;
    this.clearInputs();
    this.char.classList.add("is-docking");
    this.entity.classList.remove("is-charging");
    this.chargePadEl?.classList.add("is-active");
    this.emitStatus(true);
    return true;
  }

  isNearChargePad() {
    return Math.abs(this.pos.x - CHARGE_DOCK.x) <= CHARGE_ZONE.halfX
      && Math.abs(this.pos.y - CHARGE_DOCK.y) <= CHARGE_ZONE.halfY;
  }

  completeDock() {
    this.pos.x = CHARGE_DOCK.x;
    this.pos.y = CHARGE_DOCK.y;
    this.docking = false;
    this.docked = true;
    this.facing = "left";
    this.char.classList.remove("is-docking", "is-moving", "is-running");
    this.char.classList.add("is-docked");
    this.chargePadEl?.classList.add("is-active");
    this.render();
    this.emitStatus(true);
    this.onDockChange({
      docked: true,
      docking: false,
      trigger: this.dockTrigger || "manual",
      x: this.pos.x,
      y: this.pos.y,
    });
    this.dockTrigger = null;
  }

  leaveDock(reason = "manual") {
    if (!this.docked && !this.docking) return false;
    const wasDocked = this.docked;
    this.docked = false;
    this.docking = false;
    this.dockCooldownUntil = performance.now() + DOCK_LEAVE_COOLDOWN_MS;
    this.char.classList.remove("is-docked", "is-docking");
    this.entity.classList.remove("is-charging");
    this.charging = false;
    this.chargePadEl?.classList.remove("is-active", "is-charging");
    this.grounded = true;
    this.jumpZ = 0;
    this.jumpV = 0;
    this.emitStatus(true);
    this.onDockChange({
      docked: false,
      docking: false,
      trigger: this.dockTrigger || "manual",
      reason,
      x: this.pos.x,
      y: this.pos.y,
    });
    this.dockTrigger = null;
    return wasDocked;
  }

  returnToDock(trigger = "manual") {
    if (!this.active) return false;
    if (this.docked) {
      this.emitStatus(true);
      this.onDockChange({
        docked: true,
        docking: false,
        trigger,
        x: this.pos.x,
        y: this.pos.y,
      });
      return true;
    }
    this.docking = false;
    this.char.classList.remove("is-docking");
    return this.beginDock(trigger);
  }

  setCharging(charging) {
    this.charging = Boolean(charging);
    this.entity.classList.toggle("is-charging", this.charging && this.docked);
    this.chargePadEl?.classList.toggle("is-charging", this.charging && this.docked);
    this.emitStatus(true);
  }

  getDockState() {
    return {
      docked: this.docked,
      docking: this.docking,
      charging: this.charging,
      x: this.pos.x,
      y: this.pos.y,
    };
  }

  /* ---------------- status / face / bubble ---------------- */

  getDepth() {
    return (this.pos.y - Y_MIN) / (Y_MAX - Y_MIN);
  }

  motionLabel() {
    const now = performance.now();
    if (now < this.dashUntil) return "冲刺";
    if (!this.grounded) return "跳跃";
    const input = this.inputVector();
    if (input.x !== 0 || input.y !== 0) {
      return (this.shiftHeld || this.runToggle) ? "奔跑" : "行走";
    }
    return "待机";
  }

  emitStatus(force = false) {
    const now = performance.now();
    if (!force && now - this.lastStatusAt < 160) return;
    this.lastStatusAt = now;
    const motion = this.motionLabel();
    this.lastMotion = motion;
    this.onStatus({
      x: this.pos.x,
      y: this.pos.y,
      motion,
      running: this.shiftHeld || this.runToggle,
      grounded: this.grounded,
      facing: this.facing,
      runToggle: this.runToggle,
      docked: this.docked,
      docking: this.docking,
      charging: this.charging,
    });
  }

  setFace(eye, mouth) {
    const nextEye = eyeFor(eye);
    const nextMouth = mouthFor(mouth);
    if (nextEye !== this.eye) {
      this.eye = nextEye;
      for (const group of this.miniEyes) {
        group.classList.toggle("is-on", group.dataset.miniEye === nextEye);
      }
    }
    if (nextMouth !== this.mouth) {
      this.mouth = nextMouth;
      for (const group of this.miniMouths) {
        group.classList.toggle("is-on", group.dataset.miniMouth === nextMouth);
      }
    }
    this.char.dataset.mood = nextEye === "sad"
      ? "sad"
      : nextEye === "calm" ? "calm" : "happy";
  }

  setExpression(expression) {
    this.root.dataset.expression = expression;
  }

  setBubble({ label = "", text = "", visible = false } = {}) {
    const labelEl = this.bubble.querySelector(".iso-bubble-label");
    const textEl = this.bubble.querySelector(".iso-bubble-text");
    if (!labelEl || !textEl) return;
    labelEl.textContent = label;
    labelEl.hidden = !label;
    textEl.textContent = text;
    this.bubble.classList.toggle("is-visible", Boolean(visible && (label || text)));
    this.bubble.setAttribute("aria-hidden", String(!visible || (!label && !text)));
  }

  /* ---------------- loop ---------------- */

  inputVector() {
    const left = this.keyDirs.has("left") || this.buttonDirs.has("left");
    const right = this.keyDirs.has("right") || this.buttonDirs.has("right");
    const up = this.keyDirs.has("up") || this.buttonDirs.has("up");
    const down = this.keyDirs.has("down") || this.buttonDirs.has("down");
    let x = (right ? 1 : 0) - (left ? 1 : 0);
    let y = (down ? 1 : 0) - (up ? 1 : 0);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  changed() {
    this.emitStatus(true);
  }

  tick(timestamp) {
    if (!this.active) return;
    const dt = Math.min(0.05, Math.max(0, (timestamp - this.lastTs) / 1000));
    this.lastTs = timestamp;
    const now = performance.now();

    if (this.docking) {
      const dx = CHARGE_DOCK.x - this.pos.x;
      const dy = CHARGE_DOCK.y - this.pos.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0.65) {
        this.completeDock();
      } else {
        const step = Math.min(distance, 150 * dt);
        this.pos.x += (dx / distance) * step;
        this.pos.y += (dy / distance) * step;
        this.facing = dx < 0 ? "left" : "right";
        this.char.classList.add("is-moving");
        this.char.classList.remove("is-running");
      }
      this.render(timestamp);
      this.emitStatus(false);
      this.rafId = window.requestAnimationFrame(this.tick);
      return;
    }

    const input = this.docked ? { x: 0, y: 0 } : this.inputVector();
    const moving = input.x !== 0 || input.y !== 0;
    const running = this.shiftHeld || this.runToggle;
    let speedX = WALK_X;
    let speedY = WALK_Y;
    if (running) {
      speedX *= RUN_MULT;
      speedY *= RUN_MULT;
    }

    let moveX = input.x * speedX;
    let moveY = input.y * speedY;

    if (!this.docked && now < this.dashUntil) {
      moveX = this.dashDir.x * WALK_X * DASH_MULT;
      moveY = this.dashDir.y * WALK_Y * DASH_MULT;
    }

    if (!this.docked && (moveX !== 0 || moveY !== 0)) {
      const depth = this.getDepth();
      const minX = 17 - depth * 7;
      const maxX = 83 + depth * 7;
      this.pos.x = Math.max(minX, Math.min(maxX, this.pos.x + moveX * dt));
      this.pos.y = Math.max(Y_MIN, Math.min(Y_MAX, this.pos.y + moveY * dt));
      if (input.x < 0) this.facing = "left";
      if (input.x > 0) this.facing = "right";
    }

    // The pad takes over as soon as tianbao is close enough. A short
    // cooldown after leaving prevents an immediate re-dock while walking out.
    if (!this.docked && !this.docking
        && now > this.dockCooldownUntil
        && this.isNearChargePad()) {
      this.beginDock("proximity");
    }

    if (!this.grounded) {
      this.jumpV -= GRAVITY * dt;
      this.jumpZ += this.jumpV * dt;
      if (this.jumpZ <= 0) {
        this.jumpZ = 0;
        this.jumpV = 0;
        this.grounded = true;
        this.char.classList.remove("is-jumping");
        this.emitStatus(true);
      }
    }

    const dashing = now < this.dashUntil;
    if (!dashing) {
      this.char.classList.remove("is-dashing");
      this.entity.classList.remove("is-dashing");
    }

    const actuallyMoving = moveX !== 0 || moveY !== 0;
    this.char.classList.toggle("is-moving", actuallyMoving);
    this.char.classList.toggle("is-running", actuallyMoving && running && !dashing);

    this.render(timestamp);
    this.emitStatus(false);
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  render() {
    const depth = this.getDepth();
    const scale = 0.72 + depth * 0.38;

    this.entity.style.left = `${this.pos.x.toFixed(2)}%`;
    this.entity.style.top = `${this.pos.y.toFixed(2)}%`;
    this.char.style.transform = `translateX(-50%) translateY(${-this.jumpZ.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    this.flip.style.transform = this.facing === "left" ? "scaleX(-1)" : "";

    const shadowScale = Math.max(0.35, scale * (1 - this.jumpZ / 150));
    this.shadow.style.transform = `translateX(-50%) scale(${shadowScale.toFixed(3)})`;
    this.shadow.style.opacity = String(Math.max(0.08, 0.3 - this.jumpZ / 360));
  }
}
