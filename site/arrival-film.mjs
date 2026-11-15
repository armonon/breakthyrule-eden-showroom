import { createVideoDotRenderer } from './video-dot-renderer.mjs?v=site-audit-1';

const base = 'https://apple-cover-assets--breakthyrule-eden-showroom.netlify.app/';
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function createArrivalFilm(mount, pauseButton) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const video = document.createElement('video'), poster = mount.querySelector('img') || new Image();
  const canvas = document.createElement('canvas'), still = document.createElement('canvas');
  const context = still.getContext('2d', { willReadFrequently: true });
  video.crossOrigin = poster.crossOrigin = 'anonymous';
  video.muted = video.defaultMuted = video.loop = video.playsInline = true;
  video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
  video.preload = 'auto'; video.disablePictureInPicture = true;
  poster.alt = ''; poster.decoding = 'async';
  canvas.setAttribute('aria-hidden', 'true'); still.setAttribute('aria-hidden', 'true');
  mount.append(poster, video, still, canvas);
  poster.src = base + 'hero-film-poster.jpg';
  let renderer, disposed = false, failed = false, frame = 0, wanted = !reduced.matches;
  let playPending = false, source = poster, lastTime = -1, lastDraw = 0;
  const callbacks = typeof video.requestVideoFrameCallback === 'function';
  try { renderer = createVideoDotRenderer(canvas); } catch { canvas.hidden = true; }
  function cancel() {
    if (!frame) return;
    if (callbacks) video.cancelVideoFrameCallback(frame); else cancelAnimationFrame(frame);
    frame = 0;
  }
  function draw(now = performance.now()) {
    if (disposed || document.hidden || !(source.videoWidth || source.naturalWidth)) return;
    try {
      if (renderer) {
        if (!renderer.setFrame(source)) return;
        renderer.draw(); still.hidden = true;
      } else if (context) {
        // Small, dithered bitmap also works on devices without WebGL.
        const sw = source.videoWidth || source.naturalWidth, sh = source.videoHeight || source.naturalHeight;
        const w = still.width, h = still.height, scale = Math.max(w / sw, h / sh);
        context.drawImage(source, (w - sw * scale) / 2, (h - sh * scale) / 2, sw * scale, sh * scale);
        const image = context.getImageData(0, 0, w, h), pixels = image.data;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const p = (y * w + x) * 4, offset = (bayer[(y & 3) * 4 + (x & 3)] / 15 - .5) * 22;
          for (let c = 0; c < 3; c++) pixels[p + c] = Math.round(((pixels[p + c] - 128) * 1.08 + 128 + offset) / (255 / 7)) * (255 / 7);
        }
        context.putImageData(image, 0, 0);
      } else return;
      poster.hidden = true; lastDraw = now;
      mount.dataset.state = source === video ? 'playing' : 'poster';
    } catch {
      renderer?.destroy(); renderer = null; canvas.hidden = true; still.hidden = false;
      poster.hidden = false;
    }
  }
  function resize() {
    const { width, height } = mount.getBoundingClientRect();
    if (!width || !height || disposed) return;
    try { renderer?.resize(width, height, Math.max(width < 700 ? 2 : 2.8, Math.sqrt(width * height / 95000))); }
    catch { renderer?.destroy(); renderer = null; canvas.hidden = true; still.hidden = false; }
    still.width = Math.ceil(width / 4); still.height = Math.ceil(height / 4); draw();
  }
  function schedule() {
    if (frame || disposed || video.paused || document.hidden || !wanted) return;
    frame = callbacks ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (disposed || document.hidden || video.paused || !wanted) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime && (renderer || now - lastDraw > 80)) {
      source = video; lastTime = video.currentTime; draw(now);
    }
    schedule();
  }
  function sync() {
    pauseButton.textContent = wanted ? 'Pause film' : 'Play film';
    if (disposed || document.hidden || !wanted || failed) { video.pause(); cancel(); if (reduced.matches) { source = poster; draw(); } return; }
    if (!video.src) video.src = base + 'hero-film.mp4';
    if (!video.paused) { schedule(); return; }
    if (playPending) return;
    playPending = true; let aborted = false;
    video.play().then(() => {
      if (disposed || document.hidden || !wanted) video.pause(); else schedule();
    }).catch(error => {
      aborted = error.name === 'AbortError';
      if (!aborted) { wanted = false; pauseButton.textContent = 'Play film'; source = poster; draw(); }
    }).finally(() => { playPending = false; if (aborted && !disposed && !document.hidden && wanted && !failed) sync(); });
  }
  function toggle() { wanted = !wanted; sync(); }
  function preference() { wanted = !reduced.matches; sync(); }
  function loaded() { if (source !== video) draw(); }
  function unavailable() { failed = true; cancel(); source = poster; draw(); pauseButton.hidden = true; }
  function lost(event) { event.preventDefault(); renderer?.destroy(); renderer = null; canvas.hidden = true; still.hidden = false; draw(); }
  poster.addEventListener('load', loaded);
  video.addEventListener('playing', schedule); video.addEventListener('error', unavailable);
  canvas.addEventListener('webglcontextlost', lost);
  pauseButton.hidden = false; pauseButton.addEventListener('click', toggle);
  reduced.addEventListener('change', preference); document.addEventListener('visibilitychange', sync);
  const observer = new ResizeObserver(resize); observer.observe(mount);
  resize(); sync();
  return { destroy() {
    if (disposed) return; disposed = true; cancel(); observer.disconnect();
    video.pause(); video.removeAttribute('src'); video.load(); renderer?.destroy();
    reduced.removeEventListener('change', preference); document.removeEventListener('visibilitychange', sync);
    pauseButton.removeEventListener('click', toggle); poster.removeEventListener('load', loaded);
    video.removeEventListener('playing', schedule); video.removeEventListener('error', unavailable);
    canvas.removeEventListener('webglcontextlost', lost);
  } };
}
