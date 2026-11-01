import { estimateTextureMemory, measureTransferSize, rendererCounters } from './resource-metrics.js';
import { VERSION, THREE_REVISION } from '../config.js';

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))] || 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class BenchRunner extends EventTarget {
  constructor({ renderer, scene, quality, backendName, config, inspect }) {
    super();
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.backendName = backendName;
    this.config = config;
    this.inspect = inspect;
    this.collecting = false;
    this.samples = [];
    this.counterSamples = [];
    this.lastReport = null;
    this.running = false;
  }

  sample(frameMs) {
    if (!this.collecting) return;
    this.samples.push(frameMs);
    this.counterSamples.push(rendererCounters(this.renderer));
  }

  async _runPreset(name, onStatus) {
    this.quality.setPreset(name);
    this.quality.setLocked(true);
    this.dispatchEvent(new CustomEvent('presetstart', { detail: { name, startedAt: performance.now() } }));
    onStatus?.(`Warming ${name} preset…`);
    await sleep(this.config.warmupSeconds * 1000);
    this.samples = [];
    this.counterSamples = [];
    this.dispatchEvent(new CustomEvent('measurestart', { detail: { name, startedAt: performance.now() } }));
    onStatus?.(`Settling ${name} camera path…`);
    await sleep((this.config.settleSeconds || 0) * 1000);
    this.samples = [];
    this.counterSamples = [];
    this.collecting = true;
    onStatus?.(`Measuring ${name} preset…`);
    await sleep(this.config.sampleSeconds * 1000);
    this.collecting = false;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const mean = this.samples.reduce((sum, value) => sum + value, 0) / Math.max(1, this.samples.length);
    const maxCounter = key => this.counterSamples.reduce((max, row) => Math.max(max, Number(row[key]) || 0), 0);
    const textureMemory = estimateTextureMemory(this.scene);
    const transfer = measureTransferSize();
    const canvas = this.renderer.domElement;

    return {
      preset: name,
      backend: this.backendName,
      samples: this.samples.length,
      meanFrameMs: mean,
      medianFrameMs: percentile(sorted, .5),
      p95FrameMs: percentile(sorted, .95),
      p99FrameMs: percentile(sorted, .99),
      meanFps: mean > 0 ? 1000 / mean : 0,
      onePercentLowFps: percentile(sorted, .99) > 0 ? 1000 / percentile(sorted, .99) : 0,
      framesOver33Ms: this.samples.filter(value => value > 33.33).length,
      framesOver50Ms: this.samples.filter(value => value > 50).length,
      resolution: { cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, bufferWidth: canvas.width, bufferHeight: canvas.height },
      pixelRatio: this.quality.dynamicPixelRatio,
      drawCalls: maxCounter('drawCalls'),
      triangles: maxCounter('triangles'),
      points: maxCounter('points'),
      lines: maxCounter('lines'),
      textureCountEstimated: textureMemory.textures,
      textureMemoryMiBEstimated: textureMemory.mebibytes,
      sliceTransferMiB: transfer.transferMiB,
      sliceEncodedMiB: transfer.encodedMiB,
      sliceResourceCount: transfer.resourceCount,
      scene: this.inspect?.() || null,
    };
  }

  async runSuite(names = ['high', 'medium', 'low'], onStatus) {
    if (this.running) return this.lastReport;
    this.running = true;
    const original = this.quality.name;
    const adaptive = this.quality.adaptive;
    this.quality.setAdaptive(false);
    try {
      const results = [];
      for (const name of names) results.push(await this._runPreset(name, onStatus));
      this.lastReport = {
        schema: 'beyond-eden-benchmark-v1',
        createdAt: new Date().toISOString(),
        version: VERSION,
        threeRevision: THREE_REVISION,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        deviceMemoryGiB: navigator.deviceMemory || null,
        notes: [
          'Frame times are measured requestAnimationFrame intervals in this browser after a short path-settle interval.',
          'Texture memory is an estimate derived from loaded texture dimensions and compression state.',
          'Run on the target M4 with no unrelated heavy GPU job for the project verdict.',
        ],
        results,
        resources: measureTransferSize(),
      };
      this.dispatchEvent(new CustomEvent('complete', { detail: this.lastReport }));
      return this.lastReport;
    } finally {
      this.collecting = false;
      this.quality.setPreset(original);
      this.quality.setAdaptive(adaptive);
      this.quality.setLocked(false);
      this.running = false;
      onStatus?.('Benchmark complete.');
    }
  }

  download(report = this.lastReport) {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `beyond-eden-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
}
