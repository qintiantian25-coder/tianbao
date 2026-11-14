"use strict";

/**
 * tianbao virtual V0.5 - robot view layer.
 *
 * The view owns all SVG presentation. It never talks to Flask and never
 * knows about the debug UI. The app controller gives it an expression name
 * (derived from backend emotion + front-end interaction mode) and it renders
 * that expression on the layered face rig.
 */

/** Continuous base emotion -> face profile. Boundaries match the backend. */
export const BASE_PROFILES = {
  happy_high: { eye: "happy", mouth: "laugh" },
  happy_mid: { eye: "happy", mouth: "grin" },
  happy_low: { eye: "open", mouth: "smile" },
  calm: { eye: "calm", mouth: "calm" },
  sad_low: { eye: "sadSoft", mouth: "frownSmall" },
  sad_mid: { eye: "sadHeavy", mouth: "frown" },
  sad_high: { eye: "sadHeavy", mouth: "wail" },
};

/** Temporary front-end interaction profiles. */
export const INTERACTION_PROFILES = {
  touch_light: { eye: "squintSoft", mouth: "touchSoft" },
  touch_medium: { eye: "squint", mouth: "touchEnjoy" },
  touch_affectionate: { eye: "closed", mouth: "touchBliss" },
  speaking: { eye: "base", mouth: "talk-a" },
  voice_listening: { eye: "bright", mouth: "listenO" },
  listening_environment: { eye: "wide", mouth: "listenO" },
  listening_stranger: { eye: "neutral", mouth: "listenFlat" },
  listening_zaizai: { eye: "bright", mouth: "listenSmile" },
  listening_zhuzhu: { eye: "happy", mouth: "zhuzhuMouth" },
};

const PROFILES = { ...BASE_PROFILES, ...INTERACTION_PROFILES };

/** Eye styles that can be squashed by the blink animation. */
const BLINKABLE_EYES = new Set(["open", "wide", "bright", "neutral", "sadSoft", "sadHeavy"]);

const TALK_FRAMES = ["talk-a", "talk-o", "talk-e", "talk-a", "talk-closed", "talk-o"];

/**
 * Map the authoritative backend state to one of the seven base expressions.
 * happy: 80-100 high / 50-79 mid / 1-49 low; sad uses the same thresholds.
 */
export function baseExpressionFor(emotion, intensity) {
  const value = Math.max(0, Math.min(100, Number(intensity) || 0));

  if (emotion === "sad") {
    if (value >= 80) return "sad_high";
    if (value >= 50) return "sad_mid";
    if (value > 0) return "sad_low";
    return "calm";
  }

  if (emotion === "happy") {
    if (value >= 80) return "happy_high";
    if (value >= 50) return "happy_mid";
    if (value > 0) return "happy_low";
    return "calm";
  }

  return "calm";
}

function moodFor(expression) {
  if (expression.startsWith("sad")) return "sad";
  if (expression === "calm") return "calm";
  return "happy";
}

export class RobotView {
  constructor(stage) {
    this.stage = stage;
    this.svg = stage.querySelector("#robotSvg");
    this.eyesLayer = stage.querySelector("#eyesLayer");
    this.eyesGaze = stage.querySelector("#eyesGaze");
    this.mouthLayer = stage.querySelector("#mouthLayer");
    this.head = stage.querySelector("#robotHead");

    this.eyeGroups = [...this.eyesLayer.querySelectorAll(".eye-style")];
    this.mouthGroups = [...this.mouthLayer.querySelectorAll(".mouth-shape")];

    this.baseExpression = "happy_mid";
    this.currentExpression = null;
    this.currentEye = null;
    this.currentMouth = null;
    this.onFaceChange = null;

    this.blinkTimer = null;
    this.talkTimer = null;

    this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.handleMotionChange = () => {
      if (this.motionQuery.matches) {
        this.stopBlinkVisual();
        clearTimeout(this.blinkTimer);
        this.blinkTimer = null;
        if (this.currentExpression === "speaking") {
          clearTimeout(this.talkTimer);
          this.talkTimer = null;
          this.setMouth("talk-o");
        }
      } else {
        this.scheduleBlink();
        if (this.currentExpression === "speaking" && !this.talkTimer) {
          this.startTalking();
        }
      }
    };
    if (typeof this.motionQuery.addEventListener === "function") {
      this.motionQuery.addEventListener("change", this.handleMotionChange);
    }

    this.scheduleBlink();
  }

  get reducedMotion() {
    return this.motionQuery.matches;
  }

  /** Called whenever the authoritative base state changes. */
  setBaseExpression(expression) {
    if (!(expression in BASE_PROFILES)) expression = "calm";
    this.baseExpression = expression;
    this.stage.dataset.mood = moodFor(expression);

    // While speaking the eyes still reflect the current base mood.
    if (this.currentExpression === "speaking") {
      this.setEye(this.resolveProfile("speaking").eye);
    }
  }

  /** Render one expression. Repeated calls with the same name are cheap. */
  setExpression(expression, { force = false } = {}) {
    if (!(expression in PROFILES)) expression = this.baseExpression;
    const profile = this.resolveProfile(expression);
    const changed = expression !== this.currentExpression;

    this.currentExpression = expression;
    this.stage.dataset.expression = expression;
    this.stage.dataset.mood = moodFor(this.baseExpression);

    this.setEye(profile.eye);
    this.setMouth(profile.mouth);

    if (expression === "speaking") {
      this.startTalking();
    } else {
      this.stopTalking();
    }

    if (!changed && !force) return;
    if (!this.canBlink()) this.stopBlinkVisual();
  }

  resolveProfile(expression) {
    const profile = PROFILES[expression] || PROFILES.calm;
    const eye = profile.eye === "base"
      ? (BASE_PROFILES[this.baseExpression] || BASE_PROFILES.calm).eye
      : profile.eye;
    return { eye, mouth: profile.mouth };
  }

  setEye(name) {
    if (name === this.currentEye) return;
    this.currentEye = name;
    for (const group of this.eyeGroups) {
      group.classList.toggle("is-on", group.dataset.eye === name);
    }
    if (!this.canBlink()) this.stopBlinkVisual();
    this.emitFace();
  }

  setMouth(name) {
    if (name === this.currentMouth) return;
    this.currentMouth = name;
    for (const group of this.mouthGroups) {
      group.classList.toggle("is-on", group.dataset.mouthShape === name);
    }
    this.emitFace();
  }

  emitFace() {
    if (typeof this.onFaceChange === "function" && this.currentEye && this.currentMouth) {
      this.onFaceChange({ eye: this.currentEye, mouth: this.currentMouth });
    }
  }

  canBlink() {
    return BLINKABLE_EYES.has(this.currentEye);
  }

  /* ---------------- idle blinking ---------------- */

  scheduleBlink() {
    clearTimeout(this.blinkTimer);
    this.blinkTimer = null;
    if (this.reducedMotion) return;

    const delay = 2500 + Math.random() * 3200;
    this.blinkTimer = window.setTimeout(() => {
      if (this.canBlink()) {
        this.doBlink();
        if (Math.random() < 0.16) {
          window.setTimeout(() => {
            if (this.canBlink()) this.doBlink();
          }, 300);
        }
      }
      this.scheduleBlink();
    }, delay);
  }

  doBlink() {
    this.eyesLayer.classList.remove("is-blinking");
    // Force a reflow so quickly repeated blinks restart the CSS animation.
    void this.eyesLayer.getBoundingClientRect();
    this.eyesLayer.classList.add("is-blinking");
    window.setTimeout(() => this.eyesLayer.classList.remove("is-blinking"), 280);
  }

  stopBlinkVisual() {
    this.eyesLayer.classList.remove("is-blinking");
  }

  /* ---------------- simulated talking mouth ---------------- */

  startTalking() {
    if (this.talkTimer) return;
    if (this.reducedMotion) {
      this.setMouth("talk-o");
      return;
    }

    let index = 0;
    const tick = () => {
      this.setMouth(TALK_FRAMES[index % TALK_FRAMES.length]);
      index += 1;
      this.talkTimer = window.setTimeout(tick, 95 + Math.random() * 100);
    };
    tick();
  }

  stopTalking() {
    if (this.talkTimer) {
      clearTimeout(this.talkTimer);
      this.talkTimer = null;
    }
  }

  /* ---------------- pointer / idle head control ---------------- */

  setHovering(hovering) {
    this.stage.classList.toggle("is-hovering", Boolean(hovering));
    if (!hovering) {
      this.setGaze(0);
      this.setHeadTilt(0, 0);
    }
  }

  setGaze(offsetPx) {
    if (!this.eyesGaze) return;
    const value = Math.max(-3.2, Math.min(3.2, Number(offsetPx) || 0));
    this.eyesGaze.style.transform = value === 0 ? "" : `translateX(${value.toFixed(2)}px)`;
  }

  setHeadTilt(degrees, liftPx = 0) {
    if (!this.head) return;
    const tilt = Math.max(-2.4, Math.min(2.4, Number(degrees) || 0));
    const lift = Math.max(-4, Math.min(2, Number(liftPx) || 0));
    this.head.style.setProperty("--head-tilt", `${tilt.toFixed(2)}deg`);
    this.head.style.setProperty("--head-lift", `${lift.toFixed(2)}px`);
  }

  setTouchFocus(hasFocus) {
    this.stage.classList.toggle("is-head-focused", Boolean(hasFocus));
  }
}
