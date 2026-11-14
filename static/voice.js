"use strict";

/**
 * tianbao virtual V0.5 - browser voice input/output.
 *
 * Input: real microphone recording through MediaRecorder. The user can replay
 * their own recording. Output: a real browser TTS voice (SpeechSynthesis) for
 * the placeholder line below. No speech recognition or semantic reply exists
 * yet; the UI is labelled accordingly.
 */

export const VOICE_RESPONSE_TEXT = "我听到了, 但是后续回应还在开发中...";
export const MAX_RECORDING_MS = 30000;

export class VoiceController {
  constructor({ onChange, onRecorded } = {}) {
    this.onChange = onChange || (() => {});
    this.onRecorded = onRecorded || (() => {});

    this.state = "idle"; // idle | requesting | recording | processing | ready | playing | speaking
    this.error = "";
    this.elapsedMs = 0;
    this.hasRecording = false;
    this.recordingUrl = null;
    this.lastDurationMs = 0;

    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.abortRequested = false;
    this.discardNext = false;
    this.tickTimer = null;
    this.maxTimer = null;
    this.startedAt = 0;

    this.audio = null;
    this.utterance = null;
    this.speechTicket = 0;
    this.speechFinish = null;

    this.secure = window.isSecureContext;
    this.mediaSupported = Boolean(
      navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === "function"
      && typeof window.MediaRecorder === "function",
    );
    this.speechSupported = typeof window.speechSynthesis !== "undefined"
      && typeof window.SpeechSynthesisUtterance !== "undefined";

    if (this.speechSupported && typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", () => this.emit());
    }
  }

  get isRecording() {
    return this.state === "recording" || this.state === "requesting";
  }

  get isPlaying() {
    return this.state === "playing";
  }

  snapshot() {
    return {
      state: this.state,
      error: this.error,
      elapsedMs: this.elapsedMs,
      hasRecording: this.hasRecording,
      secure: this.secure,
      mediaSupported: this.mediaSupported,
      speechSupported: this.speechSupported,
      isRecording: this.state === "recording" || this.state === "requesting",
      isPlaying: this.state === "playing",
      isSpeaking: this.state === "speaking",
    };
  }

  emit() {
    this.onChange(this.snapshot());
  }

  setState(state) {
    this.state = state;
    this.emit();
  }

  fail(message) {
    this.error = message;
    this.state = this.hasRecording ? "ready" : "idle";
    this.emit();
  }

  /* ---------------- recording ---------------- */

  async toggleRecording() {
    if (this.state === "requesting") return false;
    if (this.state === "recording") {
      this.stopRecording();
      return true;
    }
    return this.startRecording();
  }

  async startRecording() {
    if (this.state === "recording" || this.state === "requesting") return false;

    this.cancelSpeech();
    this.stopPlayback();
    this.error = "";
    this.elapsedMs = 0;
    this.abortRequested = false;
    this.discardNext = false;

    if (!this.secure) {
      this.fail("麦克风需要 HTTPS 或 localhost 才能使用. 请用安全地址打开页面.");
      return false;
    }
    if (!this.mediaSupported) {
      this.fail("当前浏览器不支持录音, 请使用较新的 Chrome / Edge / Safari.");
      return false;
    }

    this.setState("requesting");

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      if (this.abortRequested) {
        this.abortRequested = false;
        this.cleanupStream();
        this.setState(this.hasRecording ? "ready" : "idle");
        return false;
      }

      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = candidates.find((type) => (
        typeof MediaRecorder.isTypeSupported === "function"
        && MediaRecorder.isTypeSupported(type)
      ));

      this.recorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);

      this.chunks = [];
      this.recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onerror = (event) => {
        this.cleanupStream();
        this.fail(`录音出了点问题: ${event.error && event.error.message ? event.error.message : "未知错误"}`);
      };
      this.recorder.onstop = () => this.finishRecording();

      this.startedAt = performance.now();
      this.elapsedMs = 0;
      this.recorder.start(250);
      this.setState("recording");

      this.tickTimer = window.setInterval(() => {
        this.elapsedMs = performance.now() - this.startedAt;
        this.emit();
      }, 200);
      this.maxTimer = window.setTimeout(() => {
        if (this.state === "recording") this.stopRecording();
      }, MAX_RECORDING_MS);

      return true;
    } catch (error) {
      this.cleanupStream();
      this.recorder = null;
      if (this.abortRequested) {
        this.abortRequested = false;
        this.setState(this.hasRecording ? "ready" : "idle");
        return false;
      }
      const name = error && error.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        this.fail("麦克风权限被拒绝, 请在浏览器设置中允许麦克风访问.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        this.fail("没有找到可用的麦克风.");
      } else if (name === "NotReadableError") {
        this.fail("麦克风被其他程序占用了, 请关闭后重试.");
      } else if (name === "NotSupportedError") {
        this.fail("当前浏览器或设备不支持麦克风录音.");
      } else {
        this.fail(`无法打开麦克风: ${error && error.message ? error.message : "未知错误"}`);
      }
      return false;
    }
  }

  stopRecording() {
    if (this.state !== "recording" || !this.recorder) return;
    this.clearTimers();
    this.elapsedMs = performance.now() - this.startedAt;
    this.setState("processing");
    try {
      if (this.recorder.state !== "inactive") this.recorder.stop();
      else this.finishRecording();
    } catch {
      this.finishRecording();
    }
  }

  /** Stop and discard the current recording (view switch, stop simulation). */
  abortRecording() {
    if (this.state === "requesting") {
      this.abortRequested = true;
      this.error = "";
      this.state = this.hasRecording ? "ready" : "idle";
      this.emit();
      return;
    }
    if (this.state !== "recording") return;
    this.discardNext = true;
    this.clearTimers();
    this.elapsedMs = performance.now() - this.startedAt;
    this.setState("processing");
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
      else this.finishRecording();
    } catch {
      this.finishRecording();
    }
  }

  finishRecording() {
    this.clearTimers();
    if (this.discardNext) {
      this.discardNext = false;
      this.cleanupStream();
      this.error = "";
      this.setState(this.hasRecording ? "ready" : "idle");
      return;
    }
    const type = this.recorder && this.recorder.mimeType ? this.recorder.mimeType : "audio/webm";
    const blob = new Blob(this.chunks, { type });
    this.cleanupStream();

    if (!blob.size) {
      this.fail("这段录音是空的, 再试一次吧.");
      return;
    }

    if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);
    this.recordingUrl = URL.createObjectURL(blob);
    this.hasRecording = true;
    this.lastDurationMs = this.elapsedMs;
    this.error = "";
    this.setState("ready");
    this.onRecorded({
      blob,
      url: this.recordingUrl,
      durationMs: this.lastDurationMs,
    });
  }

  clearTimers() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
  }

  cleanupStream() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try { track.stop(); } catch { /* already stopped */ }
      }
      this.stream = null;
    }
    this.recorder = null;
  }

  /* ---------------- playback ---------------- */

  async playRecording() {
    if (!this.hasRecording || !this.recordingUrl) return false;
    this.cancelSpeech();
    this.stopPlayback();

    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = "auto";
    }
    this.audio.src = this.recordingUrl;
    this.audio.onended = () => {
      if (this.state === "playing") this.setState("ready");
    };
    this.audio.onerror = () => {
      this.fail("录音回放失败, 再试一次吧.");
    };

    this.setState("playing");
    try {
      await this.audio.play();
      return true;
    } catch {
      this.setState("ready");
      this.fail("浏览器阻止了播放, 请再点一次.");
      return false;
    }
  }

  stopPlayback() {
    if (this.audio) {
      try { this.audio.pause(); } catch { /* ignore */ }
      this.audio.currentTime = 0;
    }
    if (this.state === "playing") this.setState("ready");
  }

  /* ---------------- placeholder TTS response ---------------- */

  /**
   * Speak the placeholder line with the browser TTS voice. Resolves true when
   * the utterance finishes, false if cancelled. The caller still drives the
   * mouth animation and bubble; if TTS is unavailable, a timer keeps the
   * visual response alive for roughly the same duration.
   */
  async speak(text = VOICE_RESPONSE_TEXT, profile = null) {
    this.cancelSpeech();
    this.stopPlayback();
    this.error = "";

    const ticket = ++this.speechTicket;
    this.setState("speaking");

    return new Promise((resolve) => {
      const chars = Array.from(String(text)).length;
      const fallbackMs = Math.max(2800, Math.min(10000, chars * 210 + 1000));
      let settled = false;

      const settle = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        this.speechFinish = null;
        this.utterance = null;
        if (ticket === this.speechTicket) {
          this.state = this.hasRecording ? "ready" : "idle";
          this.emit();
        }
        resolve(Boolean(ok) && ticket === this.speechTicket);
      };

      const fallbackTimer = window.setTimeout(() => settle(true), fallbackMs);
      this.speechFinish = () => {
        if (this.speechSupported) {
          try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
        }
        settle(false);
      };

      if (!this.speechSupported) return;

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        const rate = Number(profile && profile.rate);
        const pitch = Number(profile && profile.pitch);
        utterance.rate = Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1.02;
        utterance.pitch = Number.isFinite(pitch) ? Math.max(0.5, Math.min(2, pitch)) : 1.16;
        utterance.volume = 1;
        const voice = this.pickVoice(profile);
        if (voice) utterance.voice = voice;
        utterance.lang = (voice && voice.lang) || "zh-CN";
        utterance.onend = () => settle(true);
        utterance.onerror = () => settle(true);

        this.utterance = utterance;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      } catch {
        // Fallback timer above will finish the visual response.
      }
    });
  }

  pickVoice(profile = null) {
    if (!this.speechSupported) return null;
    let voices = [];
    try { voices = window.speechSynthesis.getVoices() || []; } catch { voices = []; }
    if (!voices.length) return null;

    if (profile && profile.voiceURI) {
      const exact = voices.find((voice) => voice.voiceURI === profile.voiceURI);
      if (exact) return exact;
    }
    if (profile && profile.voiceName) {
      const named = voices.find((voice) => voice.name === profile.voiceName);
      if (named) return named;
    }

    const chinese = voices.filter((voice) => /^zh/i.test(voice.lang)
      || /chinese|mandarin|中文|普通话/i.test(voice.name));
    const pool = chinese.length ? chinese : voices;
    if (profile && Number.isInteger(profile.voiceIndex)) {
      return pool[profile.voiceIndex % pool.length];
    }
    return pool[0] || null;
  }

  cancelSpeech() {
    this.speechTicket += 1;
    if (this.speechFinish) {
      const finish = this.speechFinish;
      this.speechFinish = null;
      finish();
    }
    if (this.speechSupported) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
    this.utterance = null;
    if (this.state === "speaking") {
      this.state = this.hasRecording ? "ready" : "idle";
      this.emit();
    }
  }
}
