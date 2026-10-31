import { QUALITY_PRESETS } from '../config.js';

export class QualityManager extends EventTarget {
  constructor(renderer, initial = 'high') {
    super();
    this.renderer = renderer;
    this.name = initial;
    this.preset = QUALITY_PRESETS[initial];
    this.adaptive = true;
    this.dynamicPixelRatio = Math.min(devicePixelRatio || 1, this.preset.maxPixelRatio);
    this.frameWindow = [];
    this.lastAdjustment = performance.now();
    this.locked = false;
    this.applyRendererBudget();
  }

  setPreset(name, { silent = false } = {}) {
    if (!QUALITY_PRESETS[name]) throw new Error(`Unknown quality preset: ${name}`);
    this.name = name;
    this.preset = QUALITY_PRESETS[name];
    this.dynamicPixelRatio = Math.min(devicePixelRatio || 1, this.preset.maxPixelRatio);
    this.frameWindow.length = 0;
    this.applyRendererBudget();
    if (!silent) this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
  }

  setAdaptive(enabled) {
    this.adaptive = Boolean(enabled);
    this.frameWindow.length = 0;
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
  }

  setLocked(locked) {
    this.locked = Boolean(locked);
    this.frameWindow.length = 0;
  }

  applyRendererBudget() {
    this.renderer.setPixelRatio(this.dynamicPixelRatio);
    this.renderer.shadowMap.enabled = this.name !== 'low';
  }

  observe(frameMs, now = performance.now()) {
    if (!this.adaptive || this.locked || document.hidden || !Number.isFinite(frameMs)) return false;
    this.frameWindow.push(frameMs);
    if (this.frameWindow.length > 150) this.frameWindow.shift();
    if (this.frameWindow.length < 90 || now - this.lastAdjustment < 2200) return false;

    const sorted = [...this.frameWindow].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const target = this.preset.targetFrameMs;
    const ceiling = Math.min(devicePixelRatio || 1, this.preset.maxPixelRatio);
    const floor = this.preset.minPixelRatio;
    let next = this.dynamicPixelRatio;

    if (p90 > target * 1.09) next = Math.max(floor, next - 0.1);
    else if (p90 < target * 0.72) next = Math.min(ceiling, next + 0.08);

    if (Math.abs(next - this.dynamicPixelRatio) < 0.025) return false;
    this.dynamicPixelRatio = Math.round(next * 100) / 100;
    this.lastAdjustment = now;
    this.frameWindow.length = 0;
    this.applyRendererBudget();
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
    return true;
  }

  snapshot() {
    return {
      name: this.name,
      adaptive: this.adaptive,
      pixelRatio: this.dynamicPixelRatio,
      ...this.preset,
    };
  }
}
