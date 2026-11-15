'use strict';
// The opening gallery is a living scrapbook. The two equal groups in each lane
// make the loop seamless; only the original photographs enter the tab order.
(() => {
 const host = document.getElementById('gallery-reel');
 if (!host) return;
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const css = document.createElement('style');
 css.textContent = `
.gallery-reel{--reel-paper:#e9dfc9;--reel-ink:#201b16;position:relative;isolation:isolate;overflow:hidden;background:var(--reel-paper);color:var(--reel-ink);padding:28px 0 18px;border-block:1px solid #bba78a;box-shadow:inset 0 7px 12px -11px #46321b;background-image:repeating-linear-gradient(0deg,transparent 0 31px,#9a34220a 31px 32px)}
.gallery-reel::before,.gallery-reel::after{content:'';position:absolute;top:80px;bottom:52px;width:clamp(16px,4vw,60px);z-index:2;pointer-events:none}
.gallery-reel::before{left:0;background:linear-gradient(90deg,var(--reel-paper),transparent)}.gallery-reel::after{right:0;background:linear-gradient(270deg,var(--reel-paper),transparent)}
.gallery-reel .reel-head{position:relative;z-index:3;display:flex;justify-content:space-between;align-items:center;gap:18px;padding:0 clamp(20px,4vw,60px) 15px;color:var(--reel-ink);font:italic 18px/1.2 var(--serif,Georgia,serif)}
.gallery-reel .reel-head>span{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.gallery-reel .reel-head b{font:400 clamp(30px,3.1vw,45px)/1 var(--blackletter,Georgia,serif);color:#8f2a22;white-space:nowrap}
.gallery-reel .reel-tools{display:flex;gap:18px;align-items:center;flex-shrink:0}
.gallery-reel .reel-head a{color:var(--reel-ink);font:italic 16px/1.3 var(--serif,Georgia,serif);text-decoration:underline;text-underline-offset:4px;white-space:nowrap}
.gallery-reel #reel-motion{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:9px 13px;border:1px solid #564838;border-radius:0;background:#f4eddf;color:#33261b;box-shadow:2px 2px 0 #ae9a79;font:12px/1.2 Georgia,serif;cursor:pointer;white-space:nowrap}
.gallery-reel #reel-motion::before{content:'Ⅱ';font-size:14px;font-style:normal}.gallery-reel #reel-motion[aria-pressed=false]::before{content:'▷'}
.gallery-reel #reel-motion:hover{background:#fff8e9;box-shadow:3px 3px 0 #ae9a79}.gallery-reel :focus-visible{outline:3px solid #a3322a;outline-offset:4px}
.reel-lane{position:relative;overflow:hidden;padding:18px 0 22px;transform:rotate(-1deg);margin-inline:-14px;contain:layout paint}
.reel-lane:nth-of-type(2){transform:rotate(1deg);margin-top:-12px}
.gallery-reel .reel-track{display:flex;width:max-content;gap:0;animation:reel-drift var(--reel-duration,100s) linear infinite;animation-play-state:paused;will-change:transform}
.gallery-reel .reel-lane:nth-of-type(2) .reel-track{animation-direction:reverse}
.gallery-reel[data-reel-running=true] .reel-track{animation-play-state:running}
.reel-group{display:flex;align-items:center;gap:20px;padding-right:20px;flex:0 0 auto}
.gallery-reel .reel-track a{position:relative;display:block;flex:0 0 auto;height:198px;min-width:126px;max-width:310px;width:auto;padding:7px;background:#f6f0e5;border:1px solid #b3a18a;border-radius:0;box-shadow:3px 7px 9px #51361c28;transform:rotate(var(--r));transition:transform .25s ease,box-shadow .25s ease;overflow:visible}
.gallery-reel .reel-lane:nth-of-type(2) .reel-track a{height:154px;max-width:260px}
.gallery-reel .reel-track a:nth-child(4n+2){padding:5px;background:#242017;border-color:#242017;box-shadow:4px 7px 0 #8d725032}
.gallery-reel .reel-track a:nth-child(5n+3){outline:1px solid #a6423355;outline-offset:4px}
.gallery-reel .reel-track a::before{content:'';position:absolute;z-index:1;left:34%;top:-10px;width:35%;height:20px;background:#c2a76e91;box-shadow:inset 0 0 0 1px #907a4b20;transform:rotate(-6deg);pointer-events:none}
.gallery-reel .reel-track a:nth-child(even)::before{background:#b95a4c64;transform:rotate(8deg);left:44%}
.gallery-reel .reel-track a:nth-child(4n+2)::before{display:none}
.gallery-reel .reel-track a:hover,.gallery-reel .reel-track a:focus-visible{transform:rotate(0) translateY(-5px) scale(1.035);z-index:2;box-shadow:5px 12px 15px #51361c40}
.gallery-reel .reel-track img{display:block;height:100%;width:100%;object-fit:cover;background:#d1c4ad}
.reel-foot{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:3px clamp(20px,4vw,60px) 0;font:italic 17px/1.3 var(--serif,Georgia,serif);color:#776047}
.reel-live{font:11px/1.3 Georgia,serif;letter-spacing:.12em;text-transform:uppercase;color:#8f2a22;display:flex;align-items:center;gap:8px}
.reel-live::before{content:'';width:6px;height:6px;flex:0 0 auto;border-radius:50%;background:currentColor}
.gallery-reel[data-reel-running=true] .reel-live::before{animation:reel-heartbeat 2.4s ease-in-out infinite}
.reel-foot em{font:italic 23px/1 var(--serif,Georgia,serif);color:#8f2a22;transform:rotate(-3deg)}
.gallery-reel[data-reel-static=true] .reel-lane{overflow-x:auto;scrollbar-width:thin;scrollbar-color:#a3322a transparent;transform:none;margin-inline:0;padding-inline:20px}
.gallery-reel[data-reel-static=true] .reel-track{animation:none;will-change:auto}.gallery-reel[data-reel-static=true] .reel-group[aria-hidden=true]{display:none}
.gallery-reel[data-reel-static=true]::before,.gallery-reel[data-reel-static=true]::after{display:none}
@keyframes reel-drift{to{transform:translateX(-50%)}}
@keyframes reel-heartbeat{50%{opacity:.35}}
@media(max-width:700px){.gallery-reel{padding-top:22px;padding-bottom:16px}.gallery-reel .reel-head{flex-wrap:wrap;gap:15px;padding-bottom:8px}.gallery-reel .reel-head>span{gap:7px;font-size:16px;flex:1 1 100%}.gallery-reel .reel-tools{width:100%;justify-content:space-between}.gallery-reel .reel-head b{font-size:32px}.gallery-reel .reel-track a{height:156px;min-width:102px;max-width:230px;padding:5px}.gallery-reel .reel-lane:nth-of-type(2) .reel-track a{height:124px;max-width:190px}.reel-group{gap:14px;padding-right:14px}.reel-lane{padding-block:17px 19px}.reel-foot{font-size:15px;padding-top:5px}.reel-foot em{font-size:20px}.reel-live{font-size:9px;letter-spacing:.08em}}
@media(prefers-reduced-motion:reduce){.gallery-reel .reel-track a{transition:none}.gallery-reel .reel-track a:hover,.gallery-reel .reel-track a:focus-visible{transform:rotate(0)}.gallery-reel .reel-live::before{animation:none!important}}
`;
 document.head.append(css);

 let started = false;
 function mountReel() {
 if (started) return;
 started = true;
 fetch('/site/data/gallery.json', {cache:'no-cache'}).then(response => {
  if (!response.ok) throw new Error('Gallery unavailable');
  return response.json();
 }).then(data => {
  const items = (data.items || []).filter(item => item.thumb || item.src);
  if (!items.length) { host.hidden = true; return; }
  for (let i = items.length - 1; i > 0; i--) {
   const j = Math.floor(Math.random() * (i + 1));
   [items[i], items[j]] = [items[j], items[i]];
  }
  const head = document.createElement('div'); head.className = 'reel-head';
  const title = document.createElement('span');
  const heading = document.createElement('b'); heading.textContent = 'The gallery';
  title.append(heading, 'A scrapbook in motion');
  const tools = document.createElement('div'); tools.className = 'reel-tools';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.id = 'reel-motion';
  const link = document.createElement('a'); link.href = '/gallery'; link.textContent = 'Gallery ↗';
  tools.append(toggle, link); head.append(title, tools);
  const lanes = document.createElement('div'); lanes.className = 'reel-lanes';
  const rows = [items.filter((_, index) => index % 2 === 0), items.filter((_, index) => index % 2 === 1)];
  if (!rows[1].length) rows.pop();

  rows.forEach((photos, row) => {
   const lane = document.createElement('div'); lane.className = 'reel-lane';
   const track = document.createElement('div'); track.className = 'reel-track';
   // A minimum of eight prints fills wide screens even when a catalog is tiny.
   const count = Math.max(8, photos.length);
   track.style.setProperty('--reel-duration', Math.max(65, count * (row ? 8.5 : 7)) + 's');
   const group = document.createElement('div'); group.className = 'reel-group';
   for (let index = 0; index < count; index++) {
    const photo = photos[index % photos.length];
    const a = document.createElement('a');
    a.href = '/gallery' + (photo.category ? '?filter=' + encodeURIComponent(photo.category) : '');
    a.style.aspectRatio = String(photo.ratio || 1);
    a.style.setProperty('--r', ((index % 2 ? 1 : -1) * (1.5 + index % 4)).toFixed(1) + 'deg');
    a.setAttribute('aria-label', (photo.alt || 'Break Thy Rule photograph') + ' — open the gallery');
    if (index >= photos.length) { a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); }
    const img = document.createElement('img');
    img.src = photo.thumb || photo.src; img.alt = ''; img.loading = index < 4 ? 'eager' : 'lazy'; img.decoding = 'async'; img.draggable = false;
    img.addEventListener('error', () => { if (photo.src && img.getAttribute('src') !== photo.src) img.src = photo.src; }, {once:true});
    a.append(img); group.append(a);
   }
   const repeat = group.cloneNode(true); repeat.setAttribute('aria-hidden', 'true');
   repeat.querySelectorAll('a').forEach(a => { a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); });
   track.append(group, repeat); lane.append(track); lanes.append(lane);
  });
  const foot = document.createElement('div'); foot.className = 'reel-foot';
  const live = document.createElement('span'); live.className = 'reel-live'; live.textContent = 'The living archive';
  const note = document.createElement('em'); note.textContent = 'Wear it. Make a scene.';
  foot.append(live, note); host.replaceChildren(head, lanes, foot);

  let requested = !reduced.matches, onscreen = false, hovering = false, focusing = false;
  function update() {
   const running = requested && onscreen && !document.hidden && !hovering && !focusing;
   host.dataset.reelRunning = String(running);
   host.dataset.reelStatic = String(reduced.matches && !requested);
   toggle.setAttribute('aria-pressed', String(requested));
   toggle.textContent = requested ? 'Pause motion' : 'Play motion';
  }
  toggle.addEventListener('click', () => { requested = !requested; update(); });
  lanes.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovering = true; update(); } });
  lanes.addEventListener('pointerleave', () => { hovering = false; update(); });
  lanes.addEventListener('focusin', () => { focusing = true; update(); });
  lanes.addEventListener('focusout', event => { if (!lanes.contains(event.relatedTarget)) { focusing = false; update(); } });
  document.addEventListener('visibilitychange', update);
  reduced.addEventListener('change', () => { if (reduced.matches) requested = false; update(); });
  new IntersectionObserver(([entry]) => { onscreen = entry.isIntersecting; update(); }, {threshold:.02}).observe(host);
  update();
 }).catch(() => { host.hidden = true; });
 }
 // This section sits below the heavy 3D hero. Avoid allocating its entire
 // photo strip or requesting images until the visitor approaches it.
 if ('IntersectionObserver' in window) {
  const loader = new IntersectionObserver(entries => {
   if (!entries.some(entry => entry.isIntersecting)) return;
   loader.disconnect(); mountReel();
  }, {rootMargin:'500px 0px'});
  loader.observe(host);
 } else mountReel();
})();
