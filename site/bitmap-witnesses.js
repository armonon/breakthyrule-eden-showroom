/* Move the original linked photos. No clones: the gallery updates images by index. */
(async () => {
  'use strict';
  const strip = document.getElementById('witness-strip');
  const button = document.getElementById('witness-motion');
  if (!strip || !button || strip.dataset.bitmapMotion) return;
  const { enableGalleryScroll } = await import('./horizontal-gallery.mjs?v=1');
  strip.dataset.bitmapMotion = 'ready';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const speed = 18;
  let playing = true, visible = false, hovered = false, focused = false, pressed = false;
  let frame = 0, last = 0, position = strip.scrollLeft, direction = 1, limit = 0;
  let edgeUntil = 0, manualUntil = 0, resumeTimer = 0;
  const canMove = () => playing && !reduced.matches && visible && !document.hidden &&
    !hovered && !focused && !pressed && limit > 1 && performance.now() >= manualUntil;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
  function tick(now) {
    frame = 0;
    if (!canMove()) { last = 0; return; }
    const elapsed = last ? Math.min(50, now - last) : 0;
    last = now;
    if (now >= edgeUntil) {
      // Keep the fractional position: small per-frame moves otherwise round to zero.
      position = Math.max(0, Math.min(limit, position + direction * speed * elapsed / 1000));
      strip.scrollLeft = position;
      if ((direction > 0 && position >= limit) || (direction < 0 && position <= 0)) {
        direction *= -1;
        edgeUntil = now + 800;
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    stop();
    limit = Math.max(0, strip.scrollWidth - strip.clientWidth);
    position = Math.min(limit, strip.scrollLeft);
    button.hidden = reduced.matches || limit <= 1;
    button.textContent = playing ? 'Ⅱ' : '▶';
    button.setAttribute('aria-label', playing ? 'Pause photo movement' : 'Play photo movement');
    if (canMove()) frame = requestAnimationFrame(tick);
  }
  function hold() {
    manualUntil = performance.now() + 10000;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(sync, 10050);
    sync();
  }
  button.addEventListener('click', () => { playing = !playing; sync(); });
  strip.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') { hovered = true; sync(); }
  });
  strip.addEventListener('pointerleave', () => { hovered = false; sync(); });
  strip.addEventListener('pointerdown', () => { pressed = true; sync(); }, { passive: true });
  const release = () => { if (pressed) { pressed = false; hold(); } };
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });
  enableGalleryScroll(strip, { label: 'People wearing Break Thy Rule', onInteract: hold });
  strip.addEventListener('focusin', () => { focused = true; sync(); });
  strip.addEventListener('focusout', () => queueMicrotask(() => {
    focused = strip.contains(document.activeElement); sync();
  }));
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); },
    { threshold: .08 }).observe(strip);
  new ResizeObserver(sync).observe(strip);
  new MutationObserver(sync).observe(strip, { childList: true });
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => {
    stop(); clearTimeout(resumeTimer); manualUntil = 0; pressed = false;
  });
  window.addEventListener('pageshow', sync);
  sync();
})();
