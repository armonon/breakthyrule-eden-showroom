// Real wearer photographs, with decoded swaps and a static HTML fallback.
const mounted = new WeakMap();
const INTERVAL = 2000;
const SIZES = '(max-width: 700px) 100vw, 34vw';

export function setupPeopleHero(section = document.getElementById('wearer-hero')) {
  if (!section) return null;
  if (mounted.has(section)) return mounted.get(section);
  const controls = section.querySelector('#wearer-index');
  const toggle = section.querySelector('#wearer-play');
  const counter = section.querySelector('#wearer-count');
  const choices = [...section.querySelectorAll('[data-wearer-choice]')];
  const items = choices.map(button => ({
    button,
    index: Number(button.dataset.wearerChoice),
    src: button.dataset.src,
    thumb: button.dataset.thumb,
    width: Number(button.dataset.width),
    thumbWidth: Number(button.dataset.thumbWidth),
    height: Number(button.dataset.height),
    alt: button.dataset.alt || '',
    position: button.dataset.position || '50% 35%'
  })).sort((a, b) => a.index - b.index);
  const frames = [...section.querySelectorAll('figure[data-wearer-frame]')].map(element => ({
    element,
    offset: ({ previous: -1, current: 0, next: 1 })[element.dataset.wearerFrame]
  }));
  if (items.length < 3 || items.some((item, index) => item.index !== index || !item.src) || frames.length !== 3 || frames.some(frame => frame.offset === undefined)) return null;

  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const initial = Number(section.dataset.current);
  let current = Number.isInteger(initial) && items[initial] ? initial : 1;
  let playing = !media.matches, explicitChoice = false;
  let visible = false, destroyed = false, loading = false, revision = 0;
  let timer = 0, transitionTimer = 0, enterFrame = 0, paintFrame = 0;
  let pending = [];
  const modulo = index => (index + items.length) % items.length;
  const active = () => playing && visible && !document.hidden && !destroyed;

  function updateControls() {
    section.dataset.current = String(current);
    section.dataset.playing = String(playing);
    if (controls) controls.hidden = false;
    if (toggle) {
      toggle.hidden = false;
      toggle.textContent = playing ? 'Pause photos Ⅱ' : 'Play photos ▶';
      toggle.setAttribute('aria-pressed', String(playing));
      toggle.setAttribute('aria-label', playing ? 'Pause wearer photos' : 'Play wearer photos');
    }
    if (counter) counter.textContent = `${String(current + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    for (const item of items) {
      const selected = item.index === current;
      item.button.setAttribute('aria-pressed', String(selected));
      if (selected) item.button.setAttribute('aria-current', 'true');
      else item.button.removeAttribute('aria-current');
    }
  }
  function describe(image, item, decorative) {
    image.alt = decorative ? '' : item.alt;
    if (decorative) image.setAttribute('aria-hidden', 'true');
    else image.removeAttribute('aria-hidden');
    image.style.objectPosition = item.position;
  }
  function settle() {
    clearTimeout(transitionTimer); transitionTimer = 0;
    cancelAnimationFrame(enterFrame); cancelAnimationFrame(paintFrame);
    enterFrame = 0; paintFrame = 0;
    for (const frame of frames) {
      const images = [...frame.element.querySelectorAll('img.wearer-photo')];
      const image = images.pop();
      images.forEach(old => old.remove());
      if (image) {
        image.classList.remove('is-entering', 'is-leaving');
        describe(image, items[modulo(current + frame.offset)], frame.offset !== 0);
      }
    }
  }
  function cancelPending() {
    revision++;
    for (const job of pending) job.cancel();
    pending = []; loading = false;
  }
  function stop() {
    clearTimeout(timer); timer = 0;
    cancelPending(); settle();
  }
  function schedule() {
    clearTimeout(timer); timer = 0;
    if (!active() || loading) return;
    timer = setTimeout(() => {
      timer = 0;
      if (active()) change(modulo(current + 1), true);
    }, INTERVAL);
  }
  function prepare(item) {
    const image = new Image();
    image.className = 'wearer-photo is-entering';
    image.decoding = 'async'; image.loading = 'eager';
    if (item.width > 0) image.width = item.width;
    if (item.height > 0) image.height = item.height;
    image.sizes = SIZES;
    if (item.thumb && item.thumbWidth > 0 && item.width > item.thumbWidth) image.srcset = `${item.thumb} ${item.thumbWidth}w, ${item.src} ${item.width}w`;
    image.src = item.src;
    let timeout = 0, rejectCancel = null, cancelled = false;
    const cancellation = new Promise((_, reject) => {
      rejectCancel = reject;
      timeout = setTimeout(() => reject(Error('Wearer photo unavailable')), 12000);
    });
    const promise = Promise.race([image.decode(), cancellation]).then(() => {
      if (cancelled || !image.naturalWidth) throw Error('Wearer photo unavailable');
      return image;
    }).finally(() => clearTimeout(timeout));
    return {
      image, promise,
      cancel() {
        if (cancelled) return;
        cancelled = true; clearTimeout(timeout);
        rejectCancel(new DOMException('Photo change cancelled', 'AbortError'));
        image.removeAttribute('src'); image.removeAttribute('srcset');
      }
    };
  }
  function commit(target, images) {
    current = target;
    frames.forEach((frame, index) => {
      const incoming = images[index];
      describe(incoming, items[modulo(current + frame.offset)], frame.offset !== 0);
      for (const old of frame.element.querySelectorAll('img.wearer-photo')) {
        old.alt = ''; old.setAttribute('aria-hidden', 'true'); old.classList.add('is-leaving');
      }
      frame.element.append(incoming);
    });
    updateControls();
    if (media.matches) settle();
    else {
      // Give the entering state a painted frame before starting the short dissolve.
      paintFrame = requestAnimationFrame(() => {
        paintFrame = 0;
        enterFrame = requestAnimationFrame(() => {
          enterFrame = 0;
          for (const image of images) image.classList.remove('is-entering');
        });
      });
      transitionTimer = setTimeout(settle, 450);
    }
  }
  async function change(target, automatic = false) {
    if (destroyed || (automatic && !active())) return;
    stop();
    if (target === current) { schedule(); return; }
    const requestRevision = revision;
    loading = true;
    const jobs = frames.map(frame => prepare(items[modulo(target + frame.offset)]));
    pending = jobs;
    try {
      const images = await Promise.all(jobs.map(job => job.promise));
      if (destroyed || requestRevision !== revision || (automatic && !active())) return;
      pending = []; loading = false;
      commit(target, images);
      schedule();
    } catch {
      if (requestRevision !== revision || destroyed) return;
      jobs.forEach(job => job.cancel());
      pending = []; loading = false;
      // Keep the complete old triptych when any incoming photograph fails.
      schedule();
    }
  }
  function togglePlaying() {
    explicitChoice = true; playing = !playing;
    stop(); updateControls(); schedule();
  }
  function choose(event) {
    const button = event.target.closest('[data-wearer-choice]');
    if (!button || !section.contains(button)) return;
    const target = Number(button.dataset.wearerChoice);
    if (Number.isInteger(target) && items[target]) change(target);
  }
  function visibilityChanged() { stop(); schedule(); }
  function motionChanged() {
    if (media.matches) playing = false;
    else if (!explicitChoice) playing = true;
    stop(); updateControls(); schedule();
  }
  const observer = new IntersectionObserver(([entry]) => {
    const nextVisible = entry.isIntersecting;
    if (visible === nextVisible) return;
    visible = nextVisible; stop(); schedule();
  }, { threshold: .01 });
  observer.observe(section);
  toggle?.addEventListener('click', togglePlaying);
  controls?.addEventListener('click', choose);
  document.addEventListener('visibilitychange', visibilityChanged);
  media.addEventListener('change', motionChanged);
  settle(); updateControls();
  const api = {
    destroy() {
      if (destroyed) return;
      destroyed = true; stop(); observer.disconnect();
      toggle?.removeEventListener('click', togglePlaying);
      controls?.removeEventListener('click', choose);
      document.removeEventListener('visibilitychange', visibilityChanged);
      media.removeEventListener('change', motionChanged);
      section.dataset.playing = 'false';
      if (toggle) toggle.hidden = true;
      if (controls) controls.hidden = true;
      mounted.delete(section);
    }
  };
  mounted.set(section, api);
  return api;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setupPeopleHero(), { once: true });
else setupPeopleHero();
