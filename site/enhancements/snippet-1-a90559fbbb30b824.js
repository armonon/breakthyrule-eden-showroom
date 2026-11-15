(()=>{if(document.getElementById('btr-endless-styles'))return;const style=document.createElement('style');style.id='btr-endless-styles';style.textContent="/* A continuous, full-bleed photo wall with every original frame preserved. */\nbody.btr-collage-active { overflow-x: clip; }\nbody.btr-collage-active > main.wrap { width: min(1500px, calc(100% - 72px)); }\nbody.btr-collage-active #masonry { display: none !important; }\nbody[data-page=gallery].btr-collage-active .page-head {\n  padding: 14px 0; margin-bottom: 12px; border-bottom: 0;\n}\nbody[data-page=gallery].btr-collage-active .page-head .lede {\n  margin: 0; max-width: none; color: #77746d;\n  font: 400 13px/1.55 'DM Sans', Arial, sans-serif;\n}\nbody[data-page=gallery].btr-collage-active .page-head .rubric { color: inherit; font-style: normal; }\n.btr-collage-toolbar { align-items: center; gap: 18px; margin: 0 0 16px !important; }\n.btr-collage-toolbar #filters { gap: 6px 10px; flex: 1 1 auto; scroll-margin-top: 130px; }\nbody.btr-collage-active #filters button {\n  display: inline-flex; align-items: center; gap: 9px; min-height: 42px;\n  padding: 9px 15px; border: 1px solid transparent; background: transparent;\n  color: #77746d; font: 500 11px/1.2 'DM Sans', Arial, sans-serif;\n  letter-spacing: .12em; text-transform: uppercase; border-radius: 0;\n  transition: color .2s, border-color .2s, background .2s;\n}\nbody.btr-collage-active #filters button:hover { color: #171715; border-color: #c6c3b9; }\nbody.btr-collage-active #filters button[aria-pressed=true] { color: #f8f5ee; background: #191a18; border-color: #191a18; }\nbody.btr-collage-active #filters button:disabled { opacity: .35; cursor: default; }\n.btr-filter-count { font: 400 10px/1.2 ui-monospace, SFMono-Regular, monospace; opacity: .6; letter-spacing: 0; }\n.btr-collage-toolbar #count { margin: 0; color: #77746d; font: 400 11px/1.3 ui-monospace, monospace; letter-spacing: .02em; white-space: nowrap; }\n#btr-collage {\n  position: relative; isolation: isolate; overflow-anchor: none;\n  width: var(--btr-wall-width, 100vw); max-width: none;\n  margin-inline: calc((100% - var(--btr-wall-width, 100vw)) / 2);\n  padding: 0; border: 0;\n}\n.btr-collage-window, .btr-collage-batch { display: block; position: relative; margin: 0; padding: 0; border: 0; }\n.btr-collage-spacer { height: 0; margin: 0; padding: 0; pointer-events: none; }\n.btr-collage-row {\n  display: flex; align-items: stretch; width: 100%; min-width: 0;\n  margin: 0; padding: 0; border: 0; gap: 0; overflow: hidden;\n}\nbutton.btr-collage-card {\n  display: block; min-width: 0; min-height: 0; width: 0;\n  margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent;\n  position: relative; z-index: 1; cursor: zoom-in; text-align: left;\n  align-self: stretch; line-height: 0; overflow: hidden;\n  transform: none; box-shadow: none; filter: none;\n  -webkit-tap-highlight-color: transparent; touch-action: manipulation;\n}\n.btr-collage-card img {\n  display: block; width: 100%; max-width: none; height: 100%; object-fit: cover;\n  margin: 0; padding: 0; border: 0; background: transparent;\n  box-shadow: none; -webkit-mask-image: none; mask-image: none;\n}\n.btr-collage-card:focus-visible {\n  outline: 2px solid #f4f0e4; outline-offset: -4px; z-index: 6;\n}\n.btr-collage-card[data-rotation=\"90\"] img {\n  position: absolute; left: 50%; top: 50%;\n  width: var(--btr-rotated-width); height: var(--btr-rotated-height);\n  transform: translate(-50%, -50%) rotate(90deg); object-fit: contain;\n}\n.btr-collage-card.is-unavailable { background: rgba(110,100,80,.06); }\nbutton.btr-collage-more {\n  display: block; margin: 32px auto 64px; min-height: 48px; padding: 14px 26px;\n  border: 1px solid #bbb7ab; background: transparent; color: #5c5b54;\n  font: 500 10px/1.4 'DM Sans', Arial, sans-serif; letter-spacing: .18em;\n  text-transform: uppercase; cursor: pointer; border-radius: 0;\n}\n.btr-collage-more:hover { color: #181916; border-color: #181916; }\n.btr-collage-more[aria-busy=true] { opacity: .55; }\n.btr-collage-empty { padding: 70px 20px; text-align: center; color: #76736b; }\n.btr-collage-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }\nbody.btr-collage-viewer-open { overflow: hidden; }\ndialog.btr-collage-viewer {\n  background: rgba(14, 15, 14, .97); color: #f3f1e9; padding: 0;\n  width: 100vw; height: 100dvh; max-width: none; max-height: none;\n  border: 0; margin: 0;\n}\n.btr-collage-viewer::backdrop { background: rgba(14,15,14,.65); }\n.btr-collage-viewer[open] { display: grid; grid-template-rows: 62px minmax(0,1fr) 58px; }\n.btr-collage-viewer header, .btr-collage-viewer footer { padding: 12px 24px; align-items: center; font: 400 11px/1.4 'DM Sans', Arial, sans-serif; letter-spacing: .08em; }\n.btr-collage-viewer #lb-count { font: inherit; color: #b4b5ae; }\n.btr-collage-viewer .frame { min-height: 0; padding: 8px 72px; }\n.btr-collage-viewer .frame img { display: block; width: auto; height: auto; max-width: 100%; max-height: 100%; padding: 0; background: transparent; box-shadow: none; object-fit: contain; }\n.btr-collage-viewer .frame img[data-rotation=\"90\"] {\n  transform: rotate(90deg);\n  max-width: calc(100dvh - 136px); max-height: calc(100vw - 144px);\n}\n.btr-collage-viewer button { min-width: 44px; min-height: 44px; border: 1px solid #42443e; color: #e7e8df; font: 400 24px/1 Arial, sans-serif; background: transparent; }\n.btr-collage-viewer button:hover { background: #30332d; color: #fff; }\n.btr-collage-viewer button:disabled { opacity: .2; cursor: default; }\n.btr-collage-viewer #lb-close { border: 0; font-size: 20px; }\n.btr-collage-viewer #lb-caption { display: none !important; }\n.btr-collage-viewer #lb-product { color: #d1d2c7; margin-left: auto; font: 400 11px/1.4 'DM Sans', Arial, sans-serif; letter-spacing: .06em; text-decoration-thickness: 1px; text-underline-offset: 5px; }\n@media (max-width: 1120px) {\n  body.btr-collage-active > main.wrap { width: calc(100% - 48px); }\n}\n@media (max-width: 680px) {\n  body.btr-collage-active > main.wrap { width: calc(100% - 28px); }\n  .btr-collage-toolbar { gap: 12px 4px; margin-bottom: 14px !important; }\n  .btr-collage-toolbar #filters { flex-basis: 100%; gap: 4px; }\n  body.btr-collage-active #filters button { flex: 1 1 auto; justify-content: center; gap: 5px; padding: 10px 8px; min-height: 42px; font-size: 9px; letter-spacing: .07em; }\n  .btr-collage-toolbar #count { font-size: 10px; }\n  .btr-collage-viewer[open] { grid-template-rows: 56px minmax(0,1fr) 60px; }\n  .btr-collage-viewer .frame { padding: 0 12px; }\n  .btr-collage-viewer .frame img[data-rotation=\"90\"] { max-width: calc(100dvh - 116px); max-height: calc(100vw - 24px); }\n  .btr-collage-viewer header, .btr-collage-viewer footer { padding-inline: 16px; }\n  .btr-collage-viewer .prev, .btr-collage-viewer .next { top: auto; bottom: 10px; transform: none; min-width: 42px; min-height: 40px; }\n  .btr-collage-viewer .prev { left: 14px; }\n  .btr-collage-viewer .next { left: 65px; right: auto; }\n  .btr-collage-viewer #lb-product { max-width: calc(100% - 110px); font-size: 10px; }\n}\n@media (prefers-reduced-motion: reduce) {\n  button.btr-collage-card, body.btr-collage-active #filters button { transition: none !important; animation: none !important; }\n}\n\n/* The effect lives above the collage and below navigation/dialogs. */\n#btr-gallery-smoke {\n  position: fixed;\n  inset: 0;\n  z-index: 4;\n  width: 100%;\n  height: 100%;\n  display: block;\n  pointer-events: none;\n  user-select: none;\n  contain: strict;\n}\n#btr-gallery-smoke[hidden] { display: none !important; }\n\n.btr-smoke-toggle {\n  display: inline-flex;\n  align-items: center;\n  gap: 7px;\n  flex: 0 0 auto;\n  padding: 7px 11px;\n  border: 1px solid rgba(67, 59, 48, 0.28);\n  border-radius: 2px;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  font-size: 12px;\n  line-height: 1.2;\n  white-space: nowrap;\n  cursor: pointer;\n}\n.btr-smoke-toggle::before {\n  content: '';\n  width: 6px;\n  height: 6px;\n  border: 1px solid currentColor;\n  border-radius: 50%;\n  opacity: 0.65;\n}\n.btr-smoke-toggle[aria-pressed=\"true\"]::before { background: currentColor; }\n.btr-smoke-toggle:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }\n.btr-smoke-toggle:disabled { cursor: default; opacity: 0.5; }\n\n@media (prefers-reduced-motion: reduce) {\n  #btr-gallery-smoke { display: none; }\n}\n\n@media print {\n  #btr-gallery-smoke { display: none; }\n}\n\n/* A native control remains reachable while the full-bleed wall moves. */\n#btr-gallery-motion {\n  position: fixed; right: max(18px, env(safe-area-inset-right));\n  bottom: calc(18px + env(safe-area-inset-bottom)); z-index: 110;\n  display: inline-flex; align-items: center; justify-content: center; gap: 9px;\n  min-width: 132px; min-height: 44px; padding: 11px 16px;\n  border: 1px solid rgba(35, 32, 24, .55); border-radius: 999px;\n  background: #f4e585; color: #24221c; box-shadow: 0 3px 16px rgba(20, 18, 12, .15);\n  font: 600 11px/1.3 'DM Sans', Arial, sans-serif; letter-spacing: .035em;\n  cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;\n}\n#btr-gallery-motion[hidden], body.btr-shuffle-active #btr-gallery-motion { display: none !important; }\n#btr-gallery-motion:hover { background: #fff0a9; }\n#btr-gallery-motion:focus-visible { outline: 3px solid #24221c; outline-offset: 3px; }\n#btr-gallery-motion:disabled { background: #f2ebdd; color: #655f52; cursor: default; }\n#btr-gallery-motion .btr-motion-icon { display: block; width: 9px; height: 11px; border-left: 3px solid currentColor; border-right: 3px solid currentColor; box-sizing: border-box; }\n#btr-gallery-motion[aria-pressed=false] .btr-motion-icon { width: 0; height: 0; border: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 9px solid currentColor; }\n@media (max-width: 680px) {\n  #btr-gallery-motion { right: max(12px, env(safe-area-inset-right)); bottom: calc(12px + env(safe-area-inset-bottom)); min-width: 126px; padding-inline: 14px; }\n}\n@media print { #btr-gallery-motion { display: none !important; } }\n\n/* Stone, bone and a quiet bitmap grain, confined to the control strip. */\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] {\n  --toolbar-bone:#e9e3d1;\n  --toolbar-edge:#6b6b5d;\n  --toolbar-grain:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' shape-rendering='crispEdges'%3E%3Cpath fill='%23e9e3d1' fill-opacity='.055' d='M0 1h1v1H0zM5 3h1v1H5zM2 6h1v1H2z'/%3E%3C/svg%3E\");\n  position:sticky;top:var(--btr-toolbar-top,0px);z-index:19;\n  scroll-margin-top:var(--btr-toolbar-top,0px);\n  display:flex;align-items:center;flex-wrap:nowrap;gap:16px;\n  box-sizing:border-box;width:var(--btr-wall-width,100vw);max-width:none;\n  margin:0 calc((100% - var(--btr-wall-width,100vw))/2)!important;\n  padding:9px max(18px,3.2vw);min-height:64px;\n  background:var(--toolbar-grain) #10120f!important;color:var(--toolbar-bone)!important;\n  border-top:1px solid #42473b;border-bottom:1px solid #747667;\n  box-shadow:0 3px 0 #050705,0 4px 0 #42473b;\n  isolation:isolate;\n}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] #filters {\n  display:flex;flex:1 1 auto;flex-wrap:nowrap;align-items:center;gap:4px;\n  margin:0;padding:0;border:0;scroll-margin-top:calc(var(--btr-toolbar-top,0px) + 72px);\n}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] :is(button,select,summary) {\n  box-sizing:border-box;border:1px solid #52594b!important;border-radius:0!important;\n  background:var(--toolbar-grain) #1a1e17!important;color:var(--toolbar-bone)!important;\n  box-shadow:inset 1px 1px 0 #3f4637,2px 2px 0 #050705!important;\n  min-height:42px;min-width:0;padding:9px 12px;\n  font:700 11px/1.2 'Courier New',monospace!important;letter-spacing:.045em!important;\n  text-transform:uppercase;text-shadow:none!important;filter:none!important;cursor:pointer;\n  transition:background-color .12s,color .12s!important;\n}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] #filters button {\n  gap:6px;flex:0 0 auto;border-color:transparent!important;box-shadow:none!important;background:transparent!important;\n}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] #filters button[aria-pressed=\"true\"] {\n  background:var(--toolbar-grain) #e9e3d1!important;color:#181b15!important;border-color:#fff8e5!important;\n  box-shadow:inset 2px 2px 0 #fff8e5,2px 2px 0 #050705!important;\n}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] :is(button,summary):hover {\n  border-color:#9a9f8b!important;background-color:#2e3527!important;color:#fff7df!important;\n}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] :is(button,select,summary):focus-visible {\n  outline:2px solid #f2ead2!important;outline-offset:2px!important;\n}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] button:disabled {opacity:.5;cursor:default}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] .btr-filter-count {\n  color:inherit;font:inherit;opacity:.65;letter-spacing:0;\n}\n#btr-collage-toolbar[data-compact-toolbar] .btr-toolbar-playback {display:flex;align-items:center;gap:14px;flex:0 0 auto}\n#btr-collage-toolbar[data-compact-toolbar] .btr-toolbar-playback[hidden] {display:none!important}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] #btr-gallery-motion {\n  position:static;inset:auto;min-width:82px;min-height:42px;margin:0;padding:9px 12px;\n  display:inline-flex!important;align-items:center;gap:8px;justify-content:center;\n}\n#btr-collage-toolbar[data-compact-toolbar] #btr-gallery-pass {\n  display:block;min-width:84px;margin:0;color:#c4c3b2;\n  font:700 10px/1.3 'Courier New',monospace;letter-spacing:.025em;white-space:nowrap;\n}\n#btr-collage-toolbar[data-compact-toolbar] #btr-gallery-pass[data-complete=\"true\"] {color:#eee8d5}\n#btr-collage-toolbar[data-compact-toolbar] .btr-toolbar-options {position:relative;flex:0 0 auto;margin:0;padding:0}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] .btr-toolbar-options>summary {\n  display:flex;align-items:center;justify-content:center;width:42px;list-style:none;padding:0;\n}\n.btr-toolbar-options>summary::-webkit-details-marker {display:none}\n.btr-toolbar-dots {display:block;width:3px;height:3px;background:currentColor;box-shadow:-6px 0 currentColor,6px 0 currentColor}\n.btr-toolbar-options-panel {\n  position:absolute;top:calc(100% + 10px);right:0;min-width:200px;padding:10px;\n  background:var(--toolbar-grain) #141811;border:1px solid #777d69;box-shadow:3px 3px 0 #050705;\n  display:grid;gap:8px;\n}\n.btr-toolbar-options:not([open]) .btr-toolbar-options-panel {display:none}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] .btr-toolbar-options-panel button {\n  display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;\n}\n.btr-toolbar-options-panel button[aria-pressed=\"true\"]::after {content:'\\2713';margin-left:10px}\nhtml body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] #count {\n  order:3;margin:3px 0 0;padding:8px 2px 0;border-top:1px dotted #52594b;color:#b1b5a3!important;\n  font:400 10px/1.3 'Courier New',monospace;\n}\n#btr-gallery-filter {display:none}\n@media(max-width:1050px) and (min-width:681px) {\n  html body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] {gap:10px;padding-inline:16px}\n  html body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] #filters button {padding-inline:8px;font-size:10px!important;gap:4px}\n  #btr-collage-toolbar[data-compact-toolbar] .btr-toolbar-playback {gap:10px}\n}\n@media(max-width:680px) {\n  html body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] {gap:8px;padding:7px 12px;min-height:58px}\n  html body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] #filters {display:none}\n  html body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] #btr-gallery-filter {\n    display:block;flex:1 1 auto;width:0;min-width:92px;max-width:210px;padding:8px 22px 8px 8px;\n    font-size:10px!important;letter-spacing:0!important;appearance:auto;\n  }\n  #btr-collage-toolbar[data-compact-toolbar] .btr-toolbar-playback {gap:8px;margin-left:auto}\n  html body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] #btr-gallery-motion {min-width:66px;padding-inline:8px;font-size:10px!important;gap:6px}\n  #btr-collage-toolbar[data-compact-toolbar] #btr-gallery-pass {min-width:68px;font-size:9px;letter-spacing:0}\n  html body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] .btr-toolbar-options>summary {width:36px}\n}\n@media(prefers-reduced-motion:reduce) {\n  html body[data-page=\"gallery\"] #btr-collage-toolbar[data-compact-toolbar] :is(button,select,summary) {transition:none!important}\n}\n@media print {#btr-collage-toolbar[data-compact-toolbar] {display:none!important}}\n";document.head.append(style);})();
/* BREAKTHYRULE: finite browsing with reversible playback cycles. No dependencies. */
(() => {
  'use strict';
  const BATCH = 14;
  const WINDOW = 15; // At most 210 live photo buttons, regardless of scroll depth.
  const labels = {all: 'All', worn: 'Worn', garments: 'Garments', inspiration: 'Inspiration'};
  const clockwisePhotos = new Set(['original-product-100-img_6652', 'original-product-101-img_6653', 'original-product-war-tee-back']);
  let instance = null;

  const element = (tag, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  };
  const shuffle = values => {
    const result = values.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };


  const visitOrder = values => {
    const result = shuffle(values);
    const product = item => String(item?.id || '').startsWith('original-product-');
    let run = 0;
    for (let i = 0; i < result.length; i++) {
      run = product(result[i]) ? run + 1 : 0;
      if (run <= 3) continue;
      let swap = result.findIndex((item, index) => index > i && !product(item));
      if (swap < 0) {
        // A product-heavy tail can borrow an earlier separator only when its
        // removal will not create another long run in the already mixed prefix.
        swap = result.findIndex((item, index) => {
          if (index >= i || product(item)) return false;
          let neighbours = 0;
          for (let j = index - 1; j >= 0 && product(result[j]); j--) neighbours++;
          for (let j = index + 1; j < i && product(result[j]); j++) neighbours++;
          return neighbours < 3;
        });
      }
      if (swap >= 0) {
        [result[i], result[swap]] = [result[swap], result[i]];
        run = 0;
      }
    }
    return result;
  };

  function init(gallery) {
    if (instance) return instance;
    const original = document.getElementById('masonry');
    const oldFilters = document.getElementById('filters');
    const oldDialog = document.getElementById('lightbox');
    if (!original || !oldFilters || !oldDialog || !Array.isArray(gallery?.items)) return null;
    const seen = new Set();
    const items = visitOrder(gallery.items.filter(item => {
      if (!item?.src) return false;
      const key = item.id || item.src;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
    if (!items.length) return null;

    const container = element('section', 'btr-collage');
    container.id = 'btr-collage';
    container.setAttribute('aria-label', 'Photo gallery');
    container.style.setProperty('--btr-wall-width', (document.documentElement.clientWidth || innerWidth) + 'px');
    const top = element('div', 'btr-collage-spacer');
    const stage = element('div', 'btr-collage-window');
    const bottom = element('div', 'btr-collage-spacer');
    top.setAttribute('aria-hidden', 'true');
    bottom.setAttribute('aria-hidden', 'true');
    const more = element('button', 'btr-collage-more');
    more.type = 'button';
    more.textContent = 'Keep exploring';
    more.setAttribute('aria-label', 'Load more photos');
    const sentinel = element('div', 'btr-collage-end');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.height = '1px';
    sentinel.style.pointerEvents = 'none';
    const status = element('p', 'btr-collage-sr');
    status.setAttribute('role', 'status');
    container.append(top, stage, bottom, more, sentinel, status);

    // A detached clone discards the previous initializer's click, touch and
    // keydown listeners, while retaining the site's existing dialog hooks.
    const filters = oldFilters.cloneNode(false);
    const dialog = oldDialog.cloneNode(true);
    dialog.removeAttribute('open');
    dialog.removeAttribute('aria-labelledby');
    dialog.setAttribute('aria-label', 'Photo viewer');
    dialog.classList.add('btr-collage-viewer');
    const image = dialog.querySelector('#lb-img');
    const counter = dialog.querySelector('#lb-count');
    const caption = dialog.querySelector('#lb-caption');
    const source = dialog.querySelector('#lb-product');
    const previous = dialog.querySelector('#lb-prev');
    const next = dialog.querySelector('#lb-next');
    const close = dialog.querySelector('#lb-close');
    if (!image || !counter || !caption || !source || !previous || !next || !close) return null;
    caption.hidden = true;
    caption.textContent = '';
    source.hidden = true;
    image.removeAttribute('src');
    previous.setAttribute('aria-label', 'Previous photo');
    next.setAttribute('aria-label', 'Next photo');
    close.setAttribute('aria-label', 'Close photo viewer');

    const state = {
      filter: 'all', pool: items, records: [], nodes: new Map(), start: 0,
      cycleQueues: new Map(), recent: [], serial: 0,
      viewer: -1, opener: null, pendingAnchor: null, busy: false, frame: 0, destroyed: false,
      width: 0, collectionRevision: 0, windowRevision: 0,
      playbackMode: 'finite', cycleBase: 0, inputHeld: false
    };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const buttons = new Map();
    const count = document.getElementById('count');
    function photoAspect(item) {
      const width = Number(item.width), height = Number(item.height);
      const aspect = width > 0 && height > 0 ? width / height : 1 / (Number(item.ratio) > 0 ? Number(item.ratio) : 1.2);
      return clockwisePhotos.has(item.id) ? 1 / aspect : aspect;
    }

    function rowSizes(record, width) {
      if (width <= 680) return [2, 2, 2, 2, 2, 2, 2];
      return width > 1100 ? [4, 3, 4, 3] : [3, 4, 3, 4];
    }

    function recordHeight(record, width) {
      let cursor = 0, height = 0;
      for (const size of rowSizes(record, width)) {
        const entries = record.entries.slice(cursor, cursor + size);
        if (!entries.length) break;
        const aspect = entries.reduce((sum, entry) => sum + photoAspect(entry.item), 0);
        height += width / aspect;
        cursor += size;
      }
      return height;
    }

    // A row's summed aspect ratio gives every photograph the same height while
    // preserving its full frame. Reuse buttons when the responsive grouping changes.
    function groupRecord(batch, record, width) {
      const layout = width <= 680 ? 'pairs' : width > 1100 ? 'wide' : 'medium';
      if (batch.dataset.layout === layout) return;
      const cards = Array.from(batch.querySelectorAll('.btr-collage-card'));
      const rows = document.createDocumentFragment();
      let cursor = 0;
      for (const size of rowSizes(record, width)) {
        const entries = record.entries.slice(cursor, cursor + size);
        if (!entries.length) break;
        const row = element('div', 'btr-collage-row');
        const aspect = entries.reduce((sum, entry) => sum + photoAspect(entry.item), 0);
        row.style.aspectRatio = String(aspect);
        entries.forEach((entry, index) => {
          const node = cards[cursor + index];
          node.style.flex = photoAspect(entry.item) + ' 1 0%';
          row.append(node);
        });
        rows.append(row);
        cursor += size;
      }
      batch.replaceChildren(rows);
      batch.dataset.layout = layout;
    }

    function finiteEndSequence() {return state.cycleBase + state.pool.length - 1;}
    function canAppend() {
      return !state.destroyed && state.pool.length > 0 &&
        (state.playbackMode === 'loop' || state.serial <= finiteEndSequence());
    }
    function updateMore() {more.hidden = !canAppend();}
    function getState() {
      return {filter: state.filter, uniqueCount: state.pool.length, collectionRevision: state.collectionRevision,
        playbackMode: state.playbackMode, cycleBase: state.cycleBase, finiteEndSequence: finiteEndSequence(),
        canAppend: canAppend(), windowRevision: state.windowRevision,
        loadedCount: state.records.reduce((sum, record) => sum + record.entries.length, 0), nextSequence: state.serial,
        liveCards: stage.querySelectorAll('.btr-collage-card').length,
        batchCount: state.records.length, firstLiveBatch: state.start,
        firstPhotos: state.records[0]?.entries.slice(0, 2).map(entry => entry.item.id) || [],
        reducedMotion: reducedMotion.matches};
    }
    function announceChange() {
      const metadata = getState();
      Object.assign(container.dataset, {playbackMode: metadata.playbackMode,
        cycleBase: String(metadata.cycleBase), finiteEndSequence: String(metadata.finiteEndSequence),
        loadedCount: String(metadata.loadedCount), nextSequence: String(metadata.nextSequence),
        canAppend: String(metadata.canAppend), windowRevision: String(metadata.windowRevision),
        collectionRevision: String(metadata.collectionRevision), uniqueCount: String(metadata.uniqueCount)});
      window.dispatchEvent(new CustomEvent('btr:collagechange', {detail: {
        ...metadata, container, renderedCount: metadata.liveCards
      }}));
    }

    function cycleQueue(cycle) {
      if (!state.cycleQueues.has(cycle)) {
        const queue = cycle === 0 ? state.pool.slice() : shuffle(state.pool);
        // Protect the cycle seam from immediately repeating recently seen photos.
        if (cycle && state.pool.length > 1) {
          const tail = new Set(state.recent.slice(-Math.min(8, state.pool.length - 1)));
          const prefix = Math.min(8, Math.max(1, state.pool.length - tail.size));
          for (let i = 0; i < prefix; i++) {
            if (!tail.has(queue[i])) continue;
            const swap = queue.findIndex((item, j) => j > i && !tail.has(item));
            if (swap >= 0) [queue[i], queue[swap]] = [queue[swap], queue[i]];
          }
        }
        state.cycleQueues.set(cycle, queue);
      }
      return state.cycleQueues.get(cycle);
    }

    function nextEntry() {
      if (!canAppend()) return null;
      const cycle = Math.floor(state.serial / state.pool.length);
      const item = cycleQueue(cycle)[state.serial % state.pool.length];
      state.recent.push(item);
      if (state.recent.length > 16) state.recent.shift();
      return {item, serial: state.serial++, cycle};
    }

    function createRecord() {
      if (!canAppend()) return null;
      // End every batch at the cycle seam. A finite set never borrows photos
      // from its next pass merely to fill a fourteen-card batch.
      const remaining = state.pool.length - state.serial % state.pool.length;
      const record = {
        index: state.records.length,
        entries: Array.from({length: Math.min(BATCH, remaining)}, nextEntry),
        height: 0,
        width: container.clientWidth || innerWidth
      };
      record.height = recordHeight(record, record.width);
      state.records.push(record);
      updateMore();
      return record;
    }

    function card(entry) {
      const {item, serial} = entry;
      const button = element('button', 'btr-collage-card');
      button.type = 'button';
      button.dataset.sequence = String(serial);
      button.dataset.photoId = item.id || item.src;
      if (clockwisePhotos.has(item.id)) {
        button.dataset.rotation = '90';
        button.style.setProperty('--btr-rotated-width', 100 / photoAspect(item) + '%');
        button.style.setProperty('--btr-rotated-height', 100 * photoAspect(item) + '%');
      }
      button.setAttribute('aria-label', 'Open photo: ' + (item.alt || 'Breakthyrule photograph'));
      button.dataset.collageTilt = '0';
      if (serial < 2) button.classList.add('is-featured');
      const photograph = element('img');
      photograph.alt = item.alt || 'Breakthyrule photograph';
      photograph.width = Number(item.width) || 1000;
      photograph.height = Number(item.height) || Math.round(photograph.width * (Number(item.ratio) || 1.2));
      photograph.loading = serial < 2 ? 'eager' : 'lazy';
      photograph.decoding = 'async';
      if (serial < 2) photograph.fetchPriority = 'high';
      photograph.src = item.src;
      photograph.addEventListener('load', () => button.classList.add('is-loaded'), {once: true});
      photograph.addEventListener('error', () => button.classList.add('is-unavailable'), {once: true});
      button.append(photograph);
      button.addEventListener('click', () => openViewer(serial, button));
      return button;
    }

    function renderRecord(record) {
      const batch = element('div', 'btr-collage-batch');
      batch.dataset.batch = String(record.index);
      if (record.index === 0) batch.classList.add('is-opening');
      for (const entry of record.entries) batch.append(card(entry));
      groupRecord(batch, record, container.clientWidth || innerWidth);
      return batch;
    }

    function captureAnchor() {
      for (const node of stage.querySelectorAll('.btr-collage-card')) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom > 12 && rect.top < innerHeight) return {sequence: node.dataset.sequence, top: rect.top};
      }
      return null;
    }

    function spacerHeights() {
      let above = 0, below = 0;
      const end = state.start + state.nodes.size;
      state.records.forEach((record, index) => {
        if (index < state.start) above += record.height;
        else if (index >= end) below += record.height;
      });
      top.style.height = above + 'px';
      bottom.style.height = below + 'px';
    }

    function renderWindow(start, preserve = true, preferredAnchor = null) {
      const anchor = preserve ? preferredAnchor || captureAnchor() : null;
      const activeCard = stage.contains(document.activeElement)
        ? document.activeElement.closest('.btr-collage-card') : null;
      const focusSequence = activeCard?.dataset.sequence;
      start = Math.max(0, Math.min(start, Math.max(0, state.records.length - WINDOW)));
      const end = Math.min(state.records.length, start + WINDOW);
      const nextNodes = new Map();
      const fragment = document.createDocumentFragment();
      for (let i = start; i < end; i++) {
        const node = state.nodes.get(i) || renderRecord(state.records[i]);
        groupRecord(node, state.records[i], container.clientWidth || innerWidth);
        nextNodes.set(i, node);
        fragment.append(node);
      }
      stage.replaceChildren(fragment);
      state.nodes = nextNodes;
      state.start = start;
      const width = container.clientWidth;
      for (const [index, node] of state.nodes) {
        state.records[index].height = node.getBoundingClientRect().height;
        state.records[index].width = width;
      }
      spacerHeights();
      if (focusSequence != null) {
        stage.querySelector('[data-sequence="' + focusSequence + '"]')?.focus({preventScroll: true});
      }
      if (anchor && !dialog.open) {
        const node = stage.querySelector('[data-sequence="' + anchor.sequence + '"]');
        if (node) {
          const adjustment = node.getBoundingClientRect().top - anchor.top;
          if (Math.abs(adjustment) > .5) window.scrollBy({top: adjustment, behavior: 'instant'});
        }
      }
      announceChange();
    }

    function appendBatch() {
      if (state.busy || dialog.open || !canAppend() || (state.playbackMode === 'loop' && state.inputHeld)) return false;
      const revision = state.windowRevision;
      state.busy = true;
      more.setAttribute('aria-busy', 'true');
      createRecord();
      // Keep the reader's current window in place. Scroll-driven rehydration
      // advances it before the next placeholder reaches the viewport.
      renderWindow(state.start);
      requestAnimationFrame(() => {
        if (revision !== state.windowRevision) return;
        state.busy = false;
        more.removeAttribute('aria-busy');
        if (canAppend() && container.getClientRects().length && sentinel.getBoundingClientRect().top < innerHeight + 900) scheduleViewport();
      });
      return true;
    }

    function recordAtViewport() {
      const offset = Math.max(0, -container.getBoundingClientRect().top + innerHeight * .2);
      let height = 0;
      for (let i = 0; i < state.records.length; i++) {
        height += state.records[i].height;
        if (height > offset) return i;
      }
      return Math.max(0, state.records.length - 1);
    }

    function updateViewport() {
      state.frame = 0;
      if (state.destroyed || dialog.open) return;
      const visible = recordAtViewport();
      const end = state.start + state.nodes.size;
      if (visible < state.start + 2 || visible >= end - 3 || state.nodes.size !== Math.min(WINDOW, state.records.length)) {
        const desired = Math.max(0, Math.min(visible - 3, state.records.length - WINDOW));
        if (desired !== state.start || state.nodes.size !== Math.min(WINDOW, state.records.length)) renderWindow(desired);
      }
      if (canAppend() && sentinel.getBoundingClientRect().top < innerHeight + 900 && container.getBoundingClientRect().bottom > 0) appendBatch();
    }

    function scheduleViewport() {
      if (!state.frame && !state.destroyed) state.frame = requestAnimationFrame(updateViewport);
    }

    function resetFilter(value, moveToGallery = false) {
      if (!Object.prototype.hasOwnProperty.call(labels, value)) value = 'all';
      if (dialog.open) dialog.close();
      state.collectionRevision++;
      state.windowRevision++;
      state.playbackMode = 'finite';
      state.cycleBase = 0;
      state.filter = value;
      state.pool = value === 'all' ? items : items.filter(item => item.category === value);
      state.records = [];
      state.nodes = new Map();
      state.cycleQueues = new Map();
      state.serial = 0;
      state.recent = [];
      state.start = 0;
      state.busy = false;
      state.pendingAnchor = null;
      more.removeAttribute('aria-busy');
      stage.replaceChildren();
      top.style.height = bottom.style.height = '0px';
      for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === value));
      if (count) count.textContent = state.pool.length + (state.pool.length === 1 ? ' photo' : ' photos');
      updateMore();
      if (state.pool.length) {
        createRecord();
        renderWindow(0, false);
      } else {
        const empty = element('p', 'btr-collage-empty');
        empty.textContent = 'No photos in this collection yet.';
        stage.append(empty);
        announceChange();
      }
      status.textContent = '';
      if (moveToGallery && container.getBoundingClientRect().top < 0) {
        const toolbar = document.getElementById('btr-collage-toolbar');
        if (toolbar?.dataset.compactToolbar) {
          // A sticky control no longer identifies the start of the photo wall.
          const inset = parseFloat(toolbar.style.getPropertyValue('--btr-toolbar-top')) || 0;
          window.scrollTo({top: Math.max(0, container.getBoundingClientRect().top + scrollY - toolbar.offsetHeight - inset), behavior: 'instant'});
        } else filters.scrollIntoView({block: 'start', behavior: 'instant'});
      }
      scheduleViewport();
    }

    function setPlaybackMode(mode, options = {}) {
      if (mode !== 'finite' && mode !== 'loop') throw new TypeError('Unknown gallery playback mode.');
      if (state.destroyed || mode === state.playbackMode) return getState();

      // The toolbar can cover the first row. Choose a photograph the reader can
      // actually see; an offscreen focus left by an earlier click is not an anchor.
      const toolbarRect = document.getElementById('btr-collage-toolbar')?.getBoundingClientRect();
      const visibleTop = toolbarRect && toolbarRect.top < innerHeight && toolbarRect.bottom > 0
        ? Math.max(12, toolbarRect.bottom) : 12;
      const visibleCards = Array.from(stage.querySelectorAll('.btr-collage-card'));
      let anchor = null;
      for (const node of visibleCards) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom <= visibleTop || rect.top >= innerHeight) continue;
        const candidate = {sequence: node.dataset.sequence, top: rect.top};
        if (!anchor) anchor = candidate;
        if (node === document.activeElement) {anchor = candidate; break;}
      }
      // At a seam the pointer may be over the next cycle while the viewport's
      // first row belongs to the previous one. Preserve the intended target.
      const hintedSequence = options?.anchorSequence == null ? NaN : Number(options.anchorSequence);
      if (Number.isSafeInteger(hintedSequence)) {
        const hintedCard = visibleCards.find(node => Number(node.dataset.sequence) === hintedSequence);
        const rect = hintedCard?.getBoundingClientRect();
        if (rect && rect.bottom > visibleTop && rect.top < innerHeight) {
          anchor = {sequence: hintedCard.dataset.sequence, top: rect.top};
        }
      }
      if (dialog.open) {
        const viewerCard = visibleCards.find(node => Number(node.dataset.sequence) === state.viewer);
        if (viewerCard) anchor = {sequence: viewerCard.dataset.sequence, top: viewerCard.getBoundingClientRect().top};
      }
      const fallback = state.records[recordAtViewport()]?.entries[0]?.serial ?? state.cycleBase;
      const sequence = dialog.open && state.viewer >= 0 ? state.viewer : Number(anchor?.sequence ?? fallback);

      state.playbackMode = mode;
      state.windowRevision++;
      state.busy = false;
      more.removeAttribute('aria-busy');
      if (mode === 'finite' && state.pool.length && state.records.length) {
        const cycle = Math.floor(sequence / state.pool.length);
        const retained = state.records.filter(record => record.entries[0].cycle === cycle);
        // All records end at a cycle seam, so compaction keeps the same rows,
        // button objects and randomized order. Only their outer spacers change.
        if (retained.length) {
          const order = state.cycleQueues.get(cycle);
          const nodes = new Map();
          retained.forEach((record, index) => {
            const node = state.nodes.get(record.index);
            if (node) {node.dataset.batch = String(index); nodes.set(index, node);}
            record.index = index;
          });
          state.records = retained;
          state.nodes = nodes;
          state.cycleBase = cycle * state.pool.length;
          const last = retained[retained.length - 1].entries;
          state.serial = last[last.length - 1].serial + 1;
          // The complete queue is saved when a cycle first starts. Re-entering
          // finite mode must not reshuffle its as-yet-unloaded photographs.
          state.cycleQueues = new Map([[cycle, order]]);
          state.recent = order.slice(0, state.serial - state.cycleBase).slice(-16);
          state.start = Math.min(state.start, Math.max(0, retained.length - WINDOW));
          if (anchor && Math.floor(Number(anchor.sequence) / state.pool.length) !== cycle) anchor = null;
        }
        updateMore();
        if (dialog.open && anchor) state.pendingAnchor = anchor;
        renderWindow(state.start, true, anchor);
        if (dialog.open) showViewer();
      } else {
        updateMore();
        announceChange();
      }
      scheduleViewport();
      return getState();
    }

    function entryAt(sequence) {
      if (!Number.isSafeInteger(sequence) || sequence < state.cycleBase || !state.pool.length ||
          (state.playbackMode === 'finite' && sequence > finiteEndSequence())) return null;
      // Viewer navigation advances one photo at a time. Refuse arbitrary jumps
      // beyond one cycle, and bound generation even if the mode changes.
      if (sequence >= state.serial + state.pool.length) return null;
      const limit = Math.ceil(state.pool.length / BATCH) + 1;
      for (let attempts = 0; state.serial <= sequence && attempts < limit; attempts++) {
        if (!createRecord()) return null;
      }
      let lo = 0, hi = state.records.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1, entries = state.records[mid].entries;
        if (entries[entries.length - 1].serial < sequence) lo = mid + 1;
        else hi = mid;
      }
      const entries = state.records[lo]?.entries;
      return entries?.[sequence - entries[0].serial] || null;
    }

    function showViewer() {
      const entry = entryAt(state.viewer);
      if (!entry) return false;
      const item = entry.item;
      image.src = item.src;
      image.dataset.rotation = clockwisePhotos.has(item.id) ? '90' : '0';
      image.alt = item.alt || 'Breakthyrule photograph';
      image.width = Number(item.width) || 1000;
      image.height = Number(item.height) || Math.round(image.width * (Number(item.ratio) || 1.2));
      counter.textContent = (state.pool.indexOf(item) + 1) + ' / ' + state.pool.length;
      previous.disabled = state.viewer <= state.cycleBase;
      next.disabled = state.playbackMode === 'finite' && state.viewer >= finiteEndSequence();
      source.hidden = true;
      source.textContent = '';
      source.removeAttribute('href');
      if (item.postUrl) {
        try {
          const url = new URL(item.postUrl);
          if (url.protocol === 'https:' && /(^|\.)instagram\.com$/.test(url.hostname)) {
            source.href = url.href;
            source.textContent = 'View on Instagram ↗';
            source.target = '_blank';
            source.rel = 'noopener noreferrer';
            source.hidden = false;
          }
        } catch (_) { /* Uploaded and archive photos have no outbound post. */ }
      }
      dialog.classList.remove('is-graphic');
      return true;
    }

    function openViewer(sequence, opener) {
      state.viewer = sequence;
      state.opener = opener;
      if (!showViewer()) return;
      dialog.showModal();
      document.body.classList.add('btr-collage-viewer-open');
      close.focus({preventScroll: true});
    }

    function stepViewer(delta) {
      state.viewer = Math.max(state.cycleBase, Math.min(state.viewer + delta,
        state.playbackMode === 'finite' ? finiteEndSequence() : Infinity));
      showViewer();
    }
    previous.addEventListener('click', () => stepViewer(-1));
    next.addEventListener('click', () => stepViewer(1));
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        stepViewer(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('btr-collage-viewer-open');
      image.removeAttribute('src');
      const anchor = state.pendingAnchor;
      state.pendingAnchor = null;
      renderWindow(state.start, !anchor);
      if (anchor) {
        const node = stage.querySelector('[data-sequence="' + anchor.sequence + '"]');
        if (node) window.scrollBy({top: node.getBoundingClientRect().top - anchor.top, behavior: 'instant'});
      }
      state.opener?.isConnected && state.opener.focus({preventScroll: true});
      scheduleViewport();
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog || event.target === dialog.querySelector('.frame')) dialog.close();
    });
    let touch = null;
    dialog.addEventListener('touchstart', event => {
      touch = event.touches.length === 1 ? {x: event.touches[0].clientX, y: event.touches[0].clientY} : null;
    }, {passive: true});
    dialog.addEventListener('touchend', event => {
      if (!touch || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touch.x;
      const dy = event.changedTouches[0].clientY - touch.y;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) stepViewer(dx < 0 ? 1 : -1);
      touch = null;
    }, {passive: true});

    for (const [key, label] of Object.entries(labels)) {
      const amount = key === 'all' ? items.length : items.filter(item => item.category === key).length;
      const button = element('button');
      button.type = 'button';
      button.append(document.createTextNode(label));
      const number = element('span', 'btr-filter-count');
      number.textContent = String(amount);
      button.append(number);
      button.setAttribute('aria-label', label + ', ' + amount + ' photos');
      button.setAttribute('aria-pressed', String(key === 'all'));
      button.disabled = !amount;
      button.addEventListener('click', () => resetFilter(key, true));
      filters.append(button);
      buttons.set(key, button);
    }

    // Install the working replacement before hiding anything from the old page.
    original.after(container);
    try {
      const requested = new URLSearchParams(location.search).get('filter');
      resetFilter(Object.prototype.hasOwnProperty.call(labels, requested) ? requested : 'all');
      if (!stage.querySelector('.btr-collage-card')) throw new Error('Collage has no initial photos');
      oldFilters.replaceWith(filters);
      oldDialog.replaceWith(dialog);
      original.hidden = true;
      original.setAttribute('aria-hidden', 'true');
      document.body.classList.add('btr-collage-active');
      filters.parentElement.classList.add('btr-collage-toolbar');
      if (!filters.parentElement.id) filters.parentElement.id = 'btr-collage-toolbar';
      // Active CSS can alter grid width; refresh measured batch geometry once.
      renderWindow(0, false);
    } catch (error) {
      state.destroyed = true;
      container.remove();
      if (filters.isConnected) filters.replaceWith(oldFilters);
      if (dialog.isConnected) dialog.replaceWith(oldDialog);
      document.body.classList.remove('btr-collage-active', 'btr-collage-viewer-open');
      original.hidden = false;
      original.removeAttribute('aria-hidden');
      if (state.frame) cancelAnimationFrame(state.frame);
      console.warn('Gallery collage could not initialize:', error);
      return null;
    }

    // Release the old wall's image nodes only after replacement succeeded.
    original.replaceChildren();

    more.addEventListener('click', () => {
      if (appendBatch()) status.textContent = 'More photos loaded.';
    });
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) scheduleViewport();
    }, {rootMargin: '900px 0px', threshold: 0}) : null;
    observer?.observe(sentinel);
    window.addEventListener('scroll', scheduleViewport, {passive: true});
    // Motion defers compaction until release so a pressed photograph still gets
    // its click. During that short handoff, a long swipe must not grow the loop.
    document.addEventListener('pointerdown', () => {state.inputHeld = true;}, {passive: true});
    document.addEventListener('pointerup', () => {state.inputHeld = false;}, {passive: true});
    document.addEventListener('pointercancel', () => {state.inputHeld = false;}, {passive: true});
    document.addEventListener('touchstart', () => {state.inputHeld = true;}, {passive: true});
    document.addEventListener('touchend', event => {state.inputHeld = Boolean(event.touches.length);}, {passive: true});
    document.addEventListener('touchcancel', () => {state.inputHeld = false;}, {passive: true});
    window.addEventListener('blur', () => {state.inputHeld = false;});
    let resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const width = document.documentElement.clientWidth || innerWidth;
        if (!width || Math.abs(width - state.width) < 1) return;
        const anchor = captureAnchor();
        const active = stage.contains(document.activeElement)
          ? document.activeElement.closest('.btr-collage-card') : null;
        const focusSequence = active?.dataset.sequence;
        container.style.setProperty('--btr-wall-width', width + 'px');
        state.records.forEach(record => {
          // Exact offscreen geometry prevents blank strips or jumps after a
          // desktop-to-mobile regroup, even several cycles down the stream.
          record.height = recordHeight(record, width);
          record.width = width;
        });
        state.width = width;
        renderWindow(state.start, false);
        if (focusSequence != null) {
          stage.querySelector('[data-sequence="' + focusSequence + '"]')?.focus({preventScroll: true});
        }
        if (anchor && !dialog.open) {
          const node = stage.querySelector('[data-sequence="' + anchor.sequence + '"]');
          if (node) window.scrollBy({top: node.getBoundingClientRect().top - anchor.top, behavior: 'instant'});
        }
        scheduleViewport();
      }, 100);
    }
    state.width = container.clientWidth;
    window.addEventListener('resize', onResize, {passive: true});
    window.addEventListener('pageshow', event => {
      if (!event.persisted || state.destroyed) return;
      // Back/forward restoration is a new visit, while ordinary filter changes
      // keep this visit's private order and never mutate the input manifest.
      items.splice(0, items.length, ...visitOrder(items));
      resetFilter(state.filter, true);
    });
    document.addEventListener('visibilitychange', () => {if (!document.hidden) scheduleViewport();});
    instance = {
      container,
      loadMore: appendBatch,
      setFilter: value => resetFilter(value, true),
      setPlaybackMode,
      getState,
      refresh: onResize
    };
    announceChange();
    return instance;
  }
  window.BTRCollage = {init, readyWithoutLegacy: true, get current() {return instance;}};
})();

/* Brief smoke reveals and hover curls. Photos stay crisp and the renderer sleeps at rest. */
(() => {
  'use strict';
  if (window.BTRGallerySmoke) return;
  const CONFIG = {"hover":{"columns":8,"rows":4,"frameWidth":192,"frameHeight":256,"frames":32,"duration":8.0,"src":"https://6af612f2a65cab1f9fb94ce9--breakthyrule-eden-showroom.netlify.app/smoke-atlas.f6ab627fdc0f2e4c5abafe8e5a10b9adc8a918ca4b098318200ec15691ced1cb.webp"},"curtain":{"columns":8,"rows":4,"frameWidth":256,"frameHeight":128,"frames":32,"duration":1.2,"src":"https://6af62e9e99fdb596c56e379a--breakthyrule-eden-showroom.netlify.app/smoke-atlas.143eb26273698660c976a24844bd1c7519c6dd7d898801f0c5bb19f361499e25.webp"}};
  const SMOKE_SCALE = 1.5;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const hoverCapable = matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const smooth = n => {n = clamp(n, 0, 1); return n * n * (3 - 2 * n);};
  const profiles = [{fps: 24, scale: 1}, {fps: 20, scale: .8}, {fps: 16, scale: .65}];
  const hash = value => {
    let n = 2166136261;
    for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
    return (n >>> 0) / 4294967295;
  };
  let scene, canvas, ctx, toggle, viewer, navigation;
  let started = false, waiting = false, enabled = true, failed = false, loading = false, ready = false;
  let atlases = {}, generation = 0, rows = [], rowCache = [], cardCache = new WeakMap();
  let sceneBox, clip, visibleRows = [], pending = null, effect = null;
  let filter = 'all', structureDirty = true, layoutDirty = true, previewRequested = false;
  let animation = 0, layoutFrame = 0, settleTimer = 0, loadTimer = 0;
  let width = 0, height = 0, dpr = 1, quality = 0;
  let lastFrame = 0, lastTick = 0, lastReport = 0, lastQualityCheck = 0, healthySince = 0, telemetryKey = '';
  let lastScrollY = scrollY, lastScrollAt = 0, fastUntil = 0, lastHoverAt = -10000, hoverKey = null;
  let observer, resizeObserver, viewerObserver, bodyObserver;
  // Four sequence watermarks stay bounded even after hours of endless scrolling.
  const history = {all: -1, worn: -1, garments: -1, inspiration: -1};
  const stats = {reveals: 0, hovers: 0, frames: 0, draws: 0, layouts: 0, layoutReads: 0, callbackMs: 0, maxCallbackMs: 0, rafMs: 16.7};

  function clear() {if (ctx) ctx.clearRect(0, 0, width, height);}
  function blockedState() {
    if (failed) return 'unavailable';
    if (!enabled) return 'disabled';
    if (motion.matches) return 'reduced-motion';
    if (document.hidden) return 'hidden';
    if (document.body.classList.contains('btr-shuffle-active')) return 'shuffled';
    if (viewer?.open || document.body.classList.contains('btr-collage-viewer-open')) return 'lightbox';
    if (!scene?.isConnected || !clip || clip.bottom <= clip.top) return 'offscreen';
    return null;
  }
  function report(now) {
    if (!canvas) return;
    const key = [canvas.dataset.smokeState, quality, effect?.kind || 'none', ready, dpr, stats.reveals, stats.hovers].join(':');
    if (key === telemetryKey && now - lastReport < 1000) return;
    telemetryKey = key; lastReport = now;
    Object.assign(canvas.dataset, {
      smokeScale: String(SMOKE_SCALE), smokeActiveEffect: effect?.kind || 'none',
      smokeReveals: String(stats.reveals), smokeHovers: String(stats.hovers), smokeQuality: String(quality),
      smokeFps: String(profiles[quality].fps), smokeDpr: dpr.toFixed(2), smokeFrames: String(stats.frames),
      smokeDrawCalls: String(stats.draws), smokeLayouts: String(stats.layouts), smokeLayoutReads: String(stats.layoutReads),
      smokeCallbackMs: stats.callbackMs.toFixed(3), smokeMaxCallbackMs: stats.maxCallbackMs.toFixed(3),
      smokeRafMs: stats.rafMs.toFixed(2), smokeAtlasReady: String(ready)
    });
  }
  function updatePlayback() {
    if (!started) return;
    const blocked = blockedState();
    const fast = performance.now() < fastUntil;
    if (blocked || fast) effect = null;
    if (blocked && blocked !== 'offscreen') {
      pending = null; clearTimeout(settleTimer); settleTimer = 0;
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      layoutFrame = 0;
    }
    const state = blocked || (fast ? 'fast-scroll' : loading ? 'loading' : !ready ? 'waiting-for-photos' : effect ? 'playing' : 'idle');
    if (canvas.dataset.smokeState !== state) canvas.dataset.smokeState = state;
    const play = state === 'playing';
    canvas.hidden = !play;
    if (toggle) {
      const disabled = failed || motion.matches;
      const pressed = String(enabled && !motion.matches && !failed);
      const title = failed ? 'Smoke is unavailable' : motion.matches ? 'Off with reduced motion enabled' : enabled ? 'Turn smoke off' : 'Turn smoke on';
      if (toggle.disabled !== disabled) toggle.disabled = disabled;
      if (toggle.getAttribute('aria-pressed') !== pressed) toggle.setAttribute('aria-pressed', pressed);
      if (toggle.title !== title) toggle.title = title;
    }
    if (play && !animation) {
      lastFrame = lastTick = 0;
      animation = requestAnimationFrame(frame);
    } else if (!play) {
      if (animation) cancelAnimationFrame(animation);
      animation = 0; clear();
    }
    report(performance.now());
  }
  function fail() {failed = true; loading = false; clearTimeout(loadTimer); updatePlayback();}
  function validConfig(config) {
    return config && typeof config.src === 'string' && config.src &&
      ['columns', 'rows', 'frameWidth', 'frameHeight', 'frames'].every(k => Number.isInteger(config[k]) && config[k] > 0) &&
      config.duration > 0 && config.frames <= config.columns * config.rows &&
      config.columns * config.frameWidth <= 4096 && config.rows * config.frameHeight <= 4096;
  }
  function loadAtlases() {
    if (ready || loading || failed) return;
    const configs = [CONFIG?.hover, CONFIG?.curtain];
    if (configs.some(config => !validConfig(config)) ||
        configs.reduce((sum, c) => sum + c.columns * c.rows * c.frameWidth * c.frameHeight, 0) >= 4194304) {fail(); return;}
    loading = true;
    const token = generation;
    const decode = config => new Promise((resolve, reject) => {
      const image = new Image(); image.decoding = 'async'; image.fetchPriority = 'low';
      image.onload = async () => {
        try {
          if (image.decode) await image.decode();
          if (image.naturalWidth !== config.columns * config.frameWidth || image.naturalHeight !== config.rows * config.frameHeight) throw new Error('Atlas dimensions');
          resolve(image);
        } catch (error) {reject(error);}
      };
      image.onerror = reject;
      image.src = config.src;
    });
    loadTimer = setTimeout(() => {if (started && token === generation) fail();}, 20000);
    Promise.all(configs.map(decode)).then(([hover, curtain]) => {
      if (!started || token !== generation || failed) return;
      clearTimeout(loadTimer); atlases = {hover, curtain}; ready = true; loading = false;
      scheduleLayout(); updatePlayback();
    }).catch(() => {if (started && token === generation) fail();});
  }
  function resizeCanvas() {
    width = document.documentElement.clientWidth || innerWidth; height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1) * profiles[quality].scale;
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    }
  }
  function cacheLayout() {
    if (structureDirty) {
      rows = Array.from(scene.querySelectorAll('.btr-collage-row'), node => ({node,
        cards: Array.from(node.children, card => ({card, image: card.querySelector('img')}))}));
      structureDirty = false;
    }
    const sx = scrollX, sy = scrollY, bounds = scene.getBoundingClientRect();
    stats.layoutReads++;
    sceneBox = {left: bounds.left + sx, right: bounds.right + sx, top: bounds.top + sy, bottom: bounds.bottom + sy};
    rowCache = []; cardCache = new WeakMap();
    for (const row of rows) {
      if (!row.node.isConnected) continue;
      const rect = row.node.getBoundingClientRect(); stats.layoutReads++;
      if (!rect.width || !rect.height) continue;
      const aspects = row.cards.map(({image}) => image ? (Number(image.width) || 1) / (Number(image.height) || 1) : 1);
      const total = aspects.reduce((sum, aspect) => sum + aspect, 0);
      const sequences = row.cards.map(({card}) => card.dataset.sequence + ':' + card.dataset.photoId);
      const key = filter + '|' + sequences.join('|');
      const record = {key, seed: hash(key), firstSequence: Number(row.cards[0]?.card.dataset.sequence),
        lastSequence: Number(row.cards[row.cards.length - 1]?.card.dataset.sequence), left: rect.left + sx, right: rect.right + sx,
        top: rect.top + sy, bottom: rect.bottom + sy, seams: [], cards: [],
        loaded: row.cards.every(({image}) => image?.complete && image.naturalWidth)};
      let offset = 0;
      row.cards.forEach(({card}, index) => {
        const left = record.left + rect.width * offset / total;
        offset += aspects[index];
        const right = record.left + rect.width * offset / total;
        const bounds = {card, row: record, left, right};
        record.cards.push(bounds); cardCache.set(card, bounds);
        if (index < row.cards.length - 1) record.seams.push(right);
      });
      rowCache.push(record);
    }
    rowCache.sort((a, b) => a.top - b.top);
    stats.layouts++; layoutDirty = false;
  }
  function visibleCandidates() {
    let navigationBottom = 0;
    if (navigation?.isConnected) {
      const rect = navigation.getBoundingClientRect(); stats.layoutReads++;
      if (rect.top <= 1 && rect.bottom > 0) navigationBottom = rect.bottom;
    }
    clip = sceneBox ? {left: Math.max(0, sceneBox.left - scrollX), right: Math.min(width, sceneBox.right - scrollX),
      top: Math.max(0, navigationBottom, sceneBox.top - scrollY), bottom: Math.min(height, sceneBox.bottom - scrollY)} : null;
    visibleRows = [];
    if (!clip || clip.bottom - clip.top < 45) return;
    const top = scrollY + clip.top, bottom = scrollY + clip.bottom;
    let lo = 0, hi = rowCache.length;
    while (lo < hi) {const mid = (lo + hi) >>> 1; if (rowCache[mid].bottom < top) lo = mid + 1; else hi = mid;}
    for (let i = lo; i < Math.min(lo + 12, rowCache.length); i++) {
      const row = rowCache[i]; if (row.top >= bottom) break;
      const overlap = Math.min(bottom, row.bottom) - Math.max(top, row.top);
      if (row.loaded && overlap >= Math.min(90, (row.bottom - row.top) * .28)) visibleRows.push(row);
    }
  }
  function choosePending() {
    if (pending) pending = visibleRows.find(row => row.key === pending.key) || null;
    const watermark = history[filter] ?? -1;
    const fresh = visibleRows.filter(row => row.firstSequence > watermark);
    for (const row of visibleRows) history[filter] = Math.max(history[filter] ?? -1, row.lastSequence);
    // One candidate replaces the previous candidate; there is never a row queue.
    if (fresh.length) {
      const target = scrollY + (clip.top + clip.bottom) * .55;
      fresh.sort((a, b) => Math.abs((a.top + a.bottom) / 2 - target) - Math.abs((b.top + b.bottom) / 2 - target));
      pending = fresh[0];
    }
    if (previewRequested && visibleRows.length) {pending = visibleRows[0]; previewRequested = false;}
  }
  function startReveal(row) {
    const config = CONFIG.curtain;
    const baseWidth = (250 + row.seed * 110) * SMOKE_SCALE;
    const w = Math.min(baseWidth, width - 16), h = w * config.frameHeight / config.frameWidth;
    const seam = row.seams.length ? row.seams[Math.floor(row.seed * row.seams.length)] : (row.left + row.right) / 2;
    const x = clamp(seam, row.left + w / 2, row.right - w / 2);
    const top = Math.max(row.top, scrollY + clip.top), bottom = Math.min(row.bottom, scrollY + clip.bottom);
    const inset = Math.min(h * .35, (row.bottom - row.top) / 2);
    const y = clamp((top + bottom) / 2, row.top + inset, row.bottom - inset);
    effect = {kind: 'curtain', rowKey: row.key, x, y, w, h, seed: row.seed,
      start: performance.now(), duration: 1200, bend: 0};
    stats.reveals++; pending = null;
    updatePlayback();
  }
  function runLayout() {
    layoutFrame = 0;
    if (!started || failed) return;
    try {
      if (layoutDirty) cacheLayout();
      visibleCandidates();
      const blocked = blockedState();
      if (blocked) {updatePlayback(); return;}
      choosePending();
      if (visibleRows.length && !ready) loadAtlases();
      if (ready && pending && !effect && performance.now() >= fastUntil) startReveal(pending);
      updatePlayback();
    } catch (_) {fail();}
  }
  function scheduleLayout(rebuild = false) {
    if (!started) return;
    if (rebuild) layoutDirty = true;
    if (!layoutFrame) layoutFrame = requestAnimationFrame(runLayout);
  }
  function changed(event) {
    const requested = event?.detail?.filter || window.BTRCollage?.current?.getState()?.filter || filter;
    const nextFilter = Object.prototype.hasOwnProperty.call(history, requested) ? requested : 'all';
    if (nextFilter !== filter) {filter = nextFilter; pending = null; effect = null; hoverKey = null; clear();}
    structureDirty = true; scheduleLayout(true);
  }
  function onScroll() {
    const now = performance.now(), elapsed = Math.max(16, Math.min(80, now - lastScrollAt));
    const speed = Math.abs(scrollY - lastScrollY) / elapsed;
    lastScrollY = scrollY; lastScrollAt = now;
    const blocked = blockedState();
    if (blocked && blocked !== 'offscreen') {fastUntil = 0; updatePlayback(); return;}
    if (speed > 1.2) {fastUntil = now + 180; updatePlayback();}
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {settleTimer = 0; fastUntil = 0; scheduleLayout();}, 190);
    scheduleLayout();
  }
  function onResize() {if (started) {effect = null; clear(); resizeCanvas(); structureDirty = true; scheduleLayout(true);}}
  function onPhotoLoad(event) {if (event.target.tagName === 'IMG') scheduleLayout(true);}
  function onVisibility() {updatePlayback(); if (!document.hidden && !motion.matches && enabled) scheduleLayout(true);}
  function onBodyChange() {
    updatePlayback();
    if (!blockedState() || canvas.dataset.smokeState === 'offscreen') {structureDirty = true; scheduleLayout(true);}
  }
  function onPointerLeave() {hoverKey = null;}
  function onPointerMove(event) {
    if (!hoverCapable.matches || event.pointerType === 'touch' || width <= 680 || !ready || blockedState() || performance.now() < fastUntil) return;
    const card = event.target.closest?.('.btr-collage-card');
    const bounds = card && cardCache.get(card);
    if (!bounds?.row.loaded) return;
    const row = bounds.row, x = event.clientX + scrollX, y = event.clientY + scrollY;
    if (effect?.kind === 'hover') {effect.bend = clamp(x - effect.x, -15, 15); return;}
    if (effect || performance.now() - lastHoverAt < 1700) return;
    const near = row.seams.find(seam => Math.abs(seam - x) <= 64);
    // Entering a photo is also discoverable; its plume remains at a lower corner.
    const entering = hoverKey !== card.dataset.sequence;
    if (!entering && (near == null || y < row.top + (row.bottom - row.top) * .58)) return;
    if (!entering && hoverKey === card.dataset.sequence) return;
    const anchorX = near ?? (bounds.right < row.right - 1 ? bounds.right : bounds.left);
    const seed = hash(row.key + ':' + card.dataset.sequence);
    const h = (220 + seed * 65) * SMOKE_SCALE, w = h * CONFIG.hover.frameWidth / CONFIG.hover.frameHeight;
    const anchorY = row.bottom - h * .43 - 8;
    // Do not create a hidden curl below the screen when a tall photo is entered.
    if (anchorY - h / 2 >= scrollY + clip.bottom || anchorY + h / 2 <= scrollY + clip.top) return;
    effect = {kind: 'hover', rowKey: row.key, x: anchorX, y: anchorY, w, h, seed,
      start: performance.now(), duration: 1300, bend: 0};
    lastHoverAt = performance.now(); hoverKey = card.dataset.sequence; stats.hovers++;
    updatePlayback();
  }
  function drawEffect(now) {
    const progress = clamp((now - effect.start) / effect.duration, 0, 1);
    const config = CONFIG[effect.kind === 'curtain' ? 'curtain' : 'hover'];
    const image = atlases[effect.kind === 'curtain' ? 'curtain' : 'hover'];
    const position = effect.kind === 'curtain' ? progress * (config.frames - 1)
      : ((effect.seed + progress * .35) % 1) * config.frames;
    const first = Math.floor(position), fraction = position - first;
    const fade = smooth(progress / .13) * smooth((1 - progress) / .30);
    const scale = 1 + progress * .045;
    const dx = effect.kind === 'hover' ? effect.bend : (progress - .5) * 24;
    const dy = effect.kind === 'hover' ? -progress * 26 : -progress * 12;
    ctx.save(); ctx.translate(effect.x - scrollX + dx, effect.y - scrollY + dy);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const index = effect.kind === 'curtain' ? Math.min(config.frames - 1, first + i) : (first + i) % config.frames;
      ctx.globalAlpha = .90 * fade * (i ? fraction : 1 - fraction);
      ctx.drawImage(image, (index % config.columns) * config.frameWidth, Math.floor(index / config.columns) * config.frameHeight,
        config.frameWidth, config.frameHeight, -effect.w * scale / 2, -effect.h * scale / 2, effect.w * scale, effect.h * scale);
      stats.draws++;
    }
    ctx.restore();
  }
  function adapt(now) {
    if (now - lastQualityCheck < 2000) return;
    lastQualityCheck = now;
    if (stats.callbackMs > 5 || stats.rafMs > 45) {
      healthySince = 0;
      if (quality < 2) {quality++; resizeCanvas();}
    } else if (stats.callbackMs < 2.5 && stats.rafMs < 38) {
      if (!healthySince) healthySince = now;
      if (quality && now - healthySince > 10000) {quality--; healthySince = now; resizeCanvas();}
    } else healthySince = 0;
  }
  function frame(now) {
    animation = 0;
    if (!effect || blockedState() || now < fastUntil) {updatePlayback(); return;}
    if (now - effect.start >= effect.duration) {
      effect = null; clear(); updatePlayback();
      if (pending) scheduleLayout();
      return;
    }
    if (lastTick && now - lastTick < 200) stats.rafMs += (now - lastTick - stats.rafMs) * .08;
    lastTick = now;
    const interval = 1000 / profiles[quality].fps;
    if (!lastFrame || now - lastFrame >= interval) {
      const start = performance.now(); lastFrame = now - ((now - lastFrame) % interval);
      try {
        clear(); ctx.save(); ctx.beginPath();
        ctx.rect(clip.left, clip.top, Math.max(0, clip.right - clip.left), Math.max(0, clip.bottom - clip.top)); ctx.clip();
        drawEffect(now); ctx.restore();
      } catch (_) {fail(); return;}
      const cost = performance.now() - start;
      stats.callbackMs += (cost - stats.callbackMs) * .08;
      stats.maxCallbackMs = Math.max(stats.maxCallbackMs, cost); stats.frames++;
      adapt(now); report(now);
    }
    animation = requestAnimationFrame(frame);
  }
  function setEnabled(value) {
    const wasEnabled = enabled; enabled = Boolean(value);
    if (enabled && !wasEnabled) {fastUntil = 0; previewRequested = true; scheduleLayout();}
    updatePlayback();
  }
  function init() {
    if (started) {changed(); return true;}
    scene = document.getElementById('btr-collage');
    if (!scene) {
      if (!waiting) {waiting = true; window.addEventListener('btr:collagechange', init, {once: true});}
      return false;
    }
    waiting = false; generation++; failed = ready = loading = false;
    filter = window.BTRCollage?.current?.getState()?.filter || 'all';
    canvas = document.createElement('canvas'); canvas.id = 'btr-gallery-smoke'; canvas.hidden = true;
    canvas.setAttribute('aria-hidden', 'true'); canvas.setAttribute('role', 'presentation');
    try {ctx = canvas.getContext('2d', {alpha: true, desynchronized: true});} catch (_) {return false;}
    if (!ctx) return false;
    canvas.addEventListener('contextlost', fail); document.body.append(canvas);
    viewer = document.getElementById('lightbox'); navigation = document.querySelector('.site-top');
    const filters = document.getElementById('filters');
    const toolbar = document.getElementById('btr-collage-toolbar') || filters?.parentElement;
    if (toolbar) {
      toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'btr-smoke-toggle'; toggle.textContent = 'Smoke';
      toggle.setAttribute('aria-label', 'Smoke effect'); toggle.addEventListener('click', () => setEnabled(!enabled));
      if (filters?.parentElement === toolbar) filters.insertAdjacentElement('afterend', toggle); else toolbar.append(toggle);
    }
    started = true; resizeCanvas();
    window.addEventListener('resize', onResize, {passive: true}); window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('btr:collagechange', changed); document.addEventListener('visibilitychange', onVisibility);
    motion.addEventListener('change', onVisibility); scene.addEventListener('load', onPhotoLoad, true);
    scene.addEventListener('pointermove', onPointerMove, {passive: true}); scene.addEventListener('pointerleave', onPointerLeave, {passive: true});
    if ('IntersectionObserver' in window) {observer = new IntersectionObserver(() => scheduleLayout(), {threshold: 0}); observer.observe(scene);}
    if ('ResizeObserver' in window) {resizeObserver = new ResizeObserver(() => scheduleLayout(true)); resizeObserver.observe(scene);}
    if ('MutationObserver' in window) {
      if (viewer) {viewerObserver = new MutationObserver(updatePlayback); viewerObserver.observe(viewer, {attributes: true, attributeFilter: ['open']});}
      bodyObserver = new MutationObserver(onBodyChange); bodyObserver.observe(document.body, {attributes: true, attributeFilter: ['class']});
    }
    scheduleLayout(true); updatePlayback(); return true;
  }
  function destroy() {
    generation++; if (waiting) window.removeEventListener('btr:collagechange', init); waiting = false;
    if (!started) return;
    started = false; cancelAnimationFrame(animation); cancelAnimationFrame(layoutFrame); clearTimeout(settleTimer); clearTimeout(loadTimer);
    animation = layoutFrame = 0;
    observer?.disconnect(); resizeObserver?.disconnect(); viewerObserver?.disconnect(); bodyObserver?.disconnect();
    window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll); window.removeEventListener('btr:collagechange', changed);
    document.removeEventListener('visibilitychange', onVisibility); motion.removeEventListener('change', onVisibility);
    scene.removeEventListener('load', onPhotoLoad, true); scene.removeEventListener('pointermove', onPointerMove); scene.removeEventListener('pointerleave', onPointerLeave);
    canvas.remove(); toggle?.remove(); rows = []; rowCache = []; visibleRows = []; atlases = {}; effect = pending = null;
    scene = canvas = ctx = toggle = viewer = navigation = sceneBox = clip = null; structureDirty = layoutDirty = true;
  }
  window.BTRGallerySmoke = {init, changed, setEnabled, destroy};
})();

/* Gentle gallery playback. Uses the existing scroll/infinite-gallery lifecycle. */
(() => {
  'use strict';
  if (window.BTRGalleryMotion) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const HOLD_MS = 5000, START_MS = 5000, PASS_LIMIT = 3;
  let scene, button, label, playback, passCounter, passLabel, passDetail, more, rows = [], bounds = null;
  let started = false, waiting = false, enabled = !reduced.matches, modalOpen = false, shuffled = false;
  let frameId = 0, measureFrame = 0, wakeTimer = 0, lastTick = 0, fraction = 0;
  let resizePending = false, resizeUntil = 0, resizeTimer = 0;
  let geometryPending = false, syncing = false, handoffTimer = 0, restartPending = false, handoffAnchor = null;
  let stream = {playbackMode: 'finite', windowRevision: null, canAppend: true};
  let holdUntil = 0, startAt = 0, pointerDown = false, touches = 0, keyboardFocus = false, keyboardMode = false;
  let pointer = null, lastAutoAt = -10000, expectedY = 0, ignoreScrollUntil = 0, lastLoadAt = -10000;
  let distance = 0, ticks = 0, loads = 0, lastReport = 0, reportKey = '';
  let resizeObserver, bodyObserver, modalObserver, intersectionObserver;
  let collection = {filter: 'all', size: 0, revision: null};
  let progress = {first: null, target: null, viewed: 0, completed: false, endY: null, endReady: false};
  const speed = () => innerWidth <= 680 ? 22 : 28;
  const now = () => performance.now();
  function wallVisible() {
    return Boolean(bounds && !shuffled && bounds.bottom > scrollY + 60 && bounds.top < scrollY + innerHeight - 40);
  }
  function photosReady() {
    if (!bounds || bounds.top > scrollY + innerHeight * .72) return false;
    const top = scrollY + 70, bottom = scrollY + innerHeight - 30;
    let lo = 0, hi = rows.length;
    while (lo < hi) {const mid = (lo + hi) >>> 1; if (rows[mid].bottom <= top) lo = mid + 1; else hi = mid;}
    for (let i = lo; i < Math.min(lo + 12, rows.length); i++) {
      if (rows[i].top >= bottom) break;
      if (rows[i].ready && rows[i].bottom > top) return true;
    }
    return false;
  }
  function resetProgress(restart = false) {
    progress = {first: null, target: null, viewed: 0, completed: false, endY: null, endReady: false};
    restartPending = restart;
    if (restart) beginProgress(true);
  }
  function readCollection(metadata) {
    if (!metadata || !Number.isFinite(Number(metadata.uniqueCount))) return;
    const next = {filter: metadata.filter || 'all', size: Number(metadata.uniqueCount),
      revision: metadata.collectionRevision ?? null};
    if (next.filter !== collection.filter || next.size !== collection.size || next.revision !== collection.revision) {
      collection = next;
      rows = []; // Never initialize a new filter from the previous filter's cached geometry.
      resetProgress(); handoffAnchor = null;
      holdUntil = now() + HOLD_MS;
    }
    if (metadata.playbackMode) stream.playbackMode = metadata.playbackMode;
    if (metadata.windowRevision != null) stream.windowRevision = metadata.windowRevision;
    if (metadata.canAppend != null) stream.canAppend = metadata.canAppend;
  }
  function invalidateGeometry() {
    geometryPending = true; rows = []; bounds = null;
    progress.endY = null; progress.endReady = false;
    stopFrame(); scheduleMeasure();
  }
  function setPlaybackMode(mode) {
    if (stream.playbackMode === mode) {if (mode === 'finite') handoffAnchor = null; return false;}
    const gallery = window.BTRCollage?.current;
    if (typeof gallery?.setPlaybackMode !== 'function') return false;
    // Set the local mode before the synchronous gallery event. That event only
    // invalidates geometry; it never recursively starts playback.
    stream.playbackMode = mode;
    ignoreScrollUntil = now() + 180;
    invalidateGeometry();
    const anchorSequence = keyboardFocus ? cardSequence(document.activeElement) ?? handoffAnchor : handoffAnchor;
    const metadata = gallery.setPlaybackMode(mode, mode === 'finite' && anchorSequence != null ? {anchorSequence} : undefined);
    if (mode === 'finite') handoffAnchor = null;
    if (metadata && typeof metadata === 'object') readCollection(metadata);
    if (mode === 'loop') requestMore(now(), true);
    return true;
  }
  function cacheEndpoint() {
    const targetRow = rows.find(row => progress.target != null && row.first <= progress.target && row.last >= progress.target);
    progress.endY = targetRow ? Math.max(0, targetRow.bottom - innerHeight) : null;
    progress.endReady = Boolean(targetRow?.readyAll);
  }
  function beginProgress(restart = false) {
    if (geometryPending || progress.first != null || !collection.size || !rows.length) return;
    restart = restart || restartPending;
    // A completed run starts its next allowance with the first row not yet fully
    // revealed. Ordinary pause/resume never calls this reset or moves the page.
    const edge = scrollY + (restart ? innerHeight + .5 : 70);
    const row = rows.find(item => item.bottom > edge);
    if (!row && !restart) return;
    progress.first = row ? row.first : rows[rows.length - 1].last + 1;
    progress.target = progress.first + collection.size * PASS_LIMIT - 1;
    restartPending = false;
    cacheEndpoint();
  }
  function updateProgress() {
    if (geometryPending || resizePending || progress.completed || !wallVisible() || !photosReady()) return;
    beginProgress();
    if (progress.first == null) return;
    const bottom = scrollY + innerHeight;
    // Only row boundaries actually reached by the viewport count. Preloaded
    // batches, offscreen DOM nodes and virtualized placeholders add no progress.
    let lo = 0, hi = rows.length;
    while (lo < hi) {const mid = (lo + hi) >>> 1; if (rows[mid].bottom <= bottom + .5) lo = mid + 1; else hi = mid;}
    for (let i = lo - 1; i >= Math.max(0, lo - 12); i--) {
      const row = rows[i];
      if (row.bottom <= scrollY + 70) break;
      if (!row.readyAll) continue;
      progress.viewed = Math.max(progress.viewed, Math.min(collection.size * PASS_LIMIT, Math.max(0, row.last - progress.first + 1)));
      break;
    }
    if (progress.target != null && ((progress.endY != null && progress.endReady && scrollY >= progress.endY - .5) ||
        (progress.endY == null && progress.viewed >= collection.size * PASS_LIMIT))) {
      progress.viewed = collection.size * PASS_LIMIT;
      progress.completed = true;
    }
  }
  function gate(time) {
    if (reduced.matches) return 'reduced-motion';
    if (progress.completed) return 'complete';
    if (!enabled) return 'paused';
    if (resizePending) return 'resizing';
    if (document.hidden) return 'hidden';
    if (shuffled) return 'shuffled';
    if (modalOpen) return 'dialog';
    if (pointerDown || touches || handoffTimer) return 'pointer';
    if (keyboardFocus) return 'focus';
    if (time < holdUntil) return 'interaction';
    if (time < startAt) return 'starting';
    return '';
  }
  function reason(time) {
    const stopped = gate(time);
    if (stopped) return stopped;
    if (geometryPending || !bounds) return 'measuring';
    if (!collection.size) return 'empty';
    // Before the wall, drift toward it at the ordinary speed without counting
    // photos. Below a finite end, first extend the wall beneath this viewport.
    if (bounds.top > scrollY + innerHeight * .72) return 'approaching';
    if (bounds.photoBottom <= scrollY + 70) return 'extending';
    if (!photosReady() || (progress.endY != null && scrollY >= progress.endY - .5 && !progress.endReady)) return 'waiting-for-photos';
    return 'playing';
  }
  function updatePassDisplay() {
    if (!passCounter) return;
    const current = progress.completed ? PASS_LIMIT : Math.min(PASS_LIMIT,
      collection.size ? Math.floor(progress.viewed / collection.size) + 1 : 1);
    const text = `Pass ${current} of ${PASS_LIMIT}`;
    const detail = progress.completed ? '. Three passes complete.' : '';
    if (passLabel.textContent !== text) passLabel.textContent = text;
    if (passDetail.textContent !== detail) passDetail.textContent = detail;
    if (passCounter.dataset.pass !== String(current)) passCounter.dataset.pass = String(current);
    if (passCounter.dataset.complete !== String(progress.completed)) passCounter.dataset.complete = String(progress.completed);
  }
  function report(state, time) {
    updatePassDisplay();
    const key = [state, enabled, reduced.matches, speed(), progress.viewed, collection.filter].join(':');
    if (key === reportKey && time - lastReport < 1000) return;
    reportKey = key; lastReport = time;
    Object.assign(button.dataset, {motionState: state, motionSpeed: String(speed()),
      motionEnabled: String(enabled && !reduced.matches && !progress.completed), motionDistance: distance.toFixed(1),
      motionPasses: String(collection.size ? Math.min(PASS_LIMIT, Math.floor(progress.viewed / collection.size)) : 0),
      motionPassLimit: String(PASS_LIMIT), motionPhotosViewed: String(progress.viewed),
      motionPhotoTarget: String(collection.size * PASS_LIMIT), motionStartSequence: String(progress.first ?? ''),
      motionTargetSequence: String(progress.target ?? ''), motionCompleted: String(progress.completed), motionFilter: collection.filter,
      motionTicks: String(ticks), motionLoads: String(loads), motionHoldMs: String(Math.max(0, Math.round(holdUntil - time))),
      motionPhotosReady: String(photosReady()), motionPlaybackMode: stream.playbackMode, motionGeometryPending: String(geometryPending)});
  }
  function stopFrame() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0; lastTick = 0; fraction = 0;
  }
  function sync() {
    if (!started || syncing) return;
    syncing = true;
    updateProgress();
    const time = now();
    const finite = !enabled || reduced.matches || progress.completed || time < holdUntil || time < startAt || keyboardFocus;
    // A pressed photo must remain attached until its click has been delivered.
    if (finite && !pointerDown && !touches && !handoffTimer) setPlaybackMode('finite');
    else if (!gate(time) && collection.size) setPlaybackMode('loop');
    let state = reason(time);
    if (state === 'extending' || state === 'waiting-for-photos') {
      requestMore(time);
      state = reason(time);
    }
    const active = enabled && !reduced.matches && !progress.completed;
    if (playback) playback.hidden = shuffled || modalOpen;
    if (button.disabled !== reduced.matches) button.disabled = reduced.matches;
    if (button.getAttribute('aria-pressed') !== String(active)) button.setAttribute('aria-pressed', String(active));
    const text = active ? 'Pause' : 'Play';
    if (label.textContent !== text) label.textContent = text;
    const accessibleLabel = `${text} gallery motion`;
    if (button.getAttribute('aria-label') !== accessibleLabel) button.setAttribute('aria-label', accessibleLabel);
    const title = reduced.matches ? 'Automatic motion is off because reduced motion is enabled' :
      progress.completed ? 'Three passes finished. Play another three passes' :
      state === 'interaction' ? 'Motion resumes after a short pause' : accessibleLabel;
    if (button.title !== title) button.title = title;
    clearTimeout(wakeTimer); wakeTimer = 0;
    if (state === 'playing' || state === 'approaching') {
      if (!frameId) {lastTick = 0; frameId = requestAnimationFrame(frame);}
    } else {
      stopFrame();
      if (state === 'starting' || state === 'interaction') {
        wakeTimer = setTimeout(sync, Math.max(20, Math.max(startAt, holdUntil) - time + 5));
      } else if (state === 'extending' || state === 'waiting-for-photos') {
        wakeTimer = setTimeout(sync, 950);
      }
    }
    report(state, time);
    syncing = false;
  }
  function requestMore(time, force = false) {
    if (progress.completed || stream.playbackMode !== 'loop' || (!force && (!bounds || bounds.photoBottom - (scrollY + innerHeight) > 950)) || time - lastLoadAt < 900) return;
    const gallery = window.BTRCollage?.current;
    if (typeof gallery?.loadMore !== 'function' || more?.getAttribute('aria-busy') === 'true') return;
    lastLoadAt = time; loads++;
    gallery.loadMore();
    scheduleMeasure();
  }
  function frame(time) {
    frameId = 0;
    updateProgress();
    const state = reason(time);
    if (state !== 'playing' && state !== 'approaching') {sync(); return;}
    const delta = lastTick ? Math.min(64, Math.max(0, time - lastTick)) : 0;
    lastTick = time; ticks++;
    requestMore(time);
    if (geometryPending) {sync(); return;}
    fraction += speed() * delta / 1000;
    const wanted = Math.floor(fraction);
    const remaining = progress.endY == null ? Infinity : Math.max(0, progress.endY - scrollY);
    const step = Math.min(wanted, remaining);
    if (step > 0) {
      fraction -= step;
      const before = scrollY;
      // Instant, small native scroll steps preserve the gallery's own observers.
      lastAutoAt = time; expectedY = before + step;
      window.scrollBy({top: step, left: 0, behavior: 'instant'});
      expectedY = scrollY;
      distance += Math.max(0, expectedY - before);
      if (expectedY === before) requestMore(time);
    }
    updateProgress();
    if (progress.completed) {sync(); return;}
    report(state, time);
    frameId = requestAnimationFrame(frame);
  }
  function measure() {
    measureFrame = 0;
    if (!started || !scene.isConnected) return;
    if (resizePending && now() < resizeUntil) return;
    const rect = scene.getBoundingClientRect();
    if (!rect.width || !rect.height || shuffled) {bounds = null; rows = []; resizePending = false; sync(); return;}
    more = scene.querySelector('.btr-collage-more');
    const end = more && !more.hidden && more.getClientRects().length ? more.getBoundingClientRect() : null;
    bounds = {top: rect.top + scrollY, bottom: rect.bottom + scrollY,
      photoBottom: end ? end.top + scrollY : rect.bottom + scrollY};
    rows = Array.from(scene.querySelectorAll('.btr-collage-row'), row => {
      const r = row.getBoundingClientRect();
      const cards = Array.from(row.querySelectorAll('.btr-collage-card'));
      const images = cards.map(card => card.querySelector('img'));
      return {top: r.top + scrollY, bottom: r.bottom + scrollY,
        first: Number(cards[0]?.dataset.sequence), last: Number(cards[cards.length - 1]?.dataset.sequence),
        ready: images.some(image => image?.complete && image.naturalWidth > 0),
        readyAll: images.length > 0 && images.every(image => image?.complete && image.naturalWidth > 0)};
    }).sort((a, b) => a.top - b.top);
    geometryPending = false;
    cacheEndpoint();
    resizePending = false;
    sync();
  }
  function onResize() {
    if (!started) return;
    // Collage regrouping settles after100ms. Keep the same target, but neither
    // count nor scroll against the temporary geometry during a viewport change.
    resizePending = true; resizeUntil = now() + 180;
    stopFrame(); clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {resizeTimer = 0; scheduleMeasure();}, 185);
    sync();
  }
  function scheduleMeasure() {if (started && !measureFrame) measureFrame = requestAnimationFrame(measure);}
  function cardSequence(target) {
    const raw = target?.closest?.('#btr-collage .btr-collage-card')?.dataset.sequence;
    const sequence = raw == null ? NaN : Number(raw);
    return Number.isInteger(sequence) && sequence >= 0 ? sequence : null;
  }
  function rememberAnchor(target) {
    const sequence = cardSequence(target);
    if (sequence != null) handoffAnchor = sequence;
  }
  function hold() {holdUntil = now() + HOLD_MS; sync();}
  function deferHandoff() {
    clearTimeout(handoffTimer);
    handoffTimer = setTimeout(() => {handoffTimer = 0; sync();}, 0);
  }
  function onScroll() {
    if (!started) return;
    const time = now();
    const own = time < ignoreScrollUntil || (time - lastAutoAt < 160 && Math.abs(scrollY - expectedY) < 4);
    if (!own) holdUntil = time + HOLD_MS;
    sync();
  }
  function onCollageChange(event) {
    readCollection(event?.detail);
    ignoreScrollUntil = now() + 120;
    invalidateGeometry();
  }
  function onLoad(event) {if (event.target.tagName === 'IMG') scheduleMeasure();}
  function onWheel(event) {rememberAnchor(event?.target); hold();}
  function onPointerDown(event) {
    if (button.contains(event.target)) return;
    rememberAnchor(event.target);
    keyboardMode = false; keyboardFocus = false; pointerDown = true; hold();
  }
  function onPointerUp() {if (pointerDown) {pointerDown = false; deferHandoff(); hold();}}
  function onTouch(event) {rememberAnchor(event.target); touches = event.touches.length; if (!touches) deferHandoff(); hold();}
  function onPointerMove(event) {
    if (event.pointerType === 'touch') return;
    const moved = Math.abs(event.movementX || 0) + Math.abs(event.movementY || 0) > 0 ||
      Boolean(pointer && Math.abs(event.clientX - pointer.x) + Math.abs(event.clientY - pointer.y) > 1);
    pointer = {x: event.clientX, y: event.clientY};
    if (!moved) return;
    rememberAnchor(event.target);
    hold();
  }
  function onPointerLeave() {pointer = null;}
  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
    if (button.contains(event.target) && (event.key === ' ' || event.key === 'Enter')) return;
    rememberAnchor(event.target);
    keyboardMode = true;
    keyboardFocus = Boolean(document.activeElement?.closest?.('#btr-collage .btr-collage-card'));
    hold();
  }
  function onFocus() {
    if (keyboardMode) rememberAnchor(document.activeElement);
    keyboardFocus = keyboardMode && Boolean(document.activeElement?.closest?.('#btr-collage .btr-collage-card'));
    sync();
  }
  function onClick(event) {
    if (!button.contains(event.target) && event.target.closest?.('a,button,input,select,textarea')) hold();
  }
  function inspectModes() {
    modalOpen = Boolean(document.querySelector('dialog[open]')) || document.body.classList.contains('btr-cover-open');
    const next = document.body.classList.contains('btr-shuffle-active');
    const changed = next !== shuffled; shuffled = next;
    if (changed) scheduleMeasure();
    sync();
  }
  function releasePointers() {pointerDown = false; touches = 0; pointer = null;}
  function onBlur() {releasePointers(); hold();}
  function onVisibility() {
    stopFrame();
    if (document.hidden) releasePointers(); else scheduleMeasure();
    sync();
  }
  function onReduced() {if (reduced.matches) enabled = false; sync();}
  function setEnabled(value) {
    if (value && !reduced.matches && progress.completed) resetProgress(true);
    enabled = Boolean(value) && !reduced.matches;
    if (enabled) {
      holdUntil = 0; keyboardFocus = false; pointerDown = false; touches = 0;
      startAt = now() + 200; pointer = null;
      clearTimeout(handoffTimer); handoffTimer = 0;
      scheduleMeasure();
    }
    sync();
  }
  function init() {
    if (started) {scheduleMeasure(); return true;}
    scene = document.getElementById('btr-collage');
    if (!scene) {
      if (!waiting) {waiting = true; window.addEventListener('btr:collagechange', init, {once: true});}
      return false;
    }
    if (document.getElementById('btr-gallery-motion')) return false;
    const toolbar = document.querySelector('.btr-collage-toolbar') || document.getElementById('filters')?.parentElement;
    if (!toolbar) return false;
    waiting = false;
    playback = document.createElement('div'); playback.className = 'btr-toolbar-playback';
    button = document.createElement('button'); button.id = 'btr-gallery-motion'; button.type = 'button';
    button.setAttribute('aria-controls', 'btr-collage');
    const icon = document.createElement('span'); icon.className = 'btr-motion-icon'; icon.setAttribute('aria-hidden', 'true');
    label = document.createElement('span'); button.append(icon, label);
    passCounter = document.createElement('span'); passCounter.id = 'btr-gallery-pass';
    passCounter.setAttribute('role', 'status'); passCounter.setAttribute('aria-live', 'polite'); passCounter.setAttribute('aria-atomic', 'true');
    passLabel = document.createElement('span');
    passDetail = document.createElement('span'); passDetail.className = 'btr-collage-sr';
    passCounter.append(passLabel, passDetail);
    button.setAttribute('aria-describedby', passCounter.id);
    playback.append(button, passCounter); toolbar.append(playback);
    button.addEventListener('click', () => setEnabled(progress.completed || !enabled));
    readCollection(window.BTRCollage?.current?.getState());
    started = true; startAt = now() + START_MS; holdUntil = startAt;
    window.addEventListener('scroll', onScroll, {passive: true}); window.addEventListener('resize', onResize, {passive: true});
    window.addEventListener('btr:collagechange', onCollageChange); window.addEventListener('blur', onBlur);
    document.addEventListener('wheel', onWheel, {passive: true});
    document.addEventListener('pointerdown', onPointerDown, {passive: true}); document.addEventListener('pointerup', onPointerUp, {passive: true});
    document.addEventListener('pointercancel', onPointerUp, {passive: true}); document.addEventListener('pointermove', onPointerMove, {passive: true});
    document.documentElement.addEventListener('pointerleave', onPointerLeave, {passive: true});
    document.addEventListener('touchstart', onTouch, {passive: true}); document.addEventListener('touchmove', onTouch, {passive: true});
    document.addEventListener('touchend', onTouch, {passive: true}); document.addEventListener('touchcancel', onTouch, {passive: true});
    document.addEventListener('keydown', onKey); document.addEventListener('focusin', onFocus); document.addEventListener('focusout', onFocus);
    document.addEventListener('click', onClick); document.addEventListener('visibilitychange', onVisibility);
    scene.addEventListener('load', onLoad, true); reduced.addEventListener('change', onReduced);
    if ('ResizeObserver' in window) {resizeObserver = new ResizeObserver(scheduleMeasure); resizeObserver.observe(scene);}
    if ('IntersectionObserver' in window) {intersectionObserver = new IntersectionObserver(scheduleMeasure); intersectionObserver.observe(scene);}
    if ('MutationObserver' in window) {
      bodyObserver = new MutationObserver(inspectModes); bodyObserver.observe(document.body, {attributes: true, attributeFilter: ['class']});
      modalObserver = new MutationObserver(inspectModes); modalObserver.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['open']});
    }
    inspectModes(); scheduleMeasure(); return true;
  }
  function destroy() {
    if (waiting) window.removeEventListener('btr:collagechange', init); waiting = false;
    if (!started) return;
    started = false; stopFrame(); clearTimeout(wakeTimer); clearTimeout(resizeTimer); clearTimeout(handoffTimer); handoffTimer = 0; cancelAnimationFrame(measureFrame); measureFrame = 0; resizePending = false;
    resizeObserver?.disconnect(); intersectionObserver?.disconnect(); bodyObserver?.disconnect(); modalObserver?.disconnect();
    window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); window.removeEventListener('btr:collagechange', onCollageChange); window.removeEventListener('blur', onBlur);
    document.removeEventListener('wheel', onWheel); document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp); document.removeEventListener('pointermove', onPointerMove);
    document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    for (const name of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) document.removeEventListener(name, onTouch);
    document.removeEventListener('keydown', onKey); document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onFocus);
    document.removeEventListener('click', onClick); document.removeEventListener('visibilitychange', onVisibility);
    scene.removeEventListener('load', onLoad, true); reduced.removeEventListener('change', onReduced);
    playback.remove(); scene = button = label = playback = passCounter = passLabel = passDetail = more = bounds = null; rows = [];
  }
  window.BTRGalleryMotion = {init, destroy, setEnabled};
})();

/* One quiet control strip; photos and the collage layout remain untouched. */
(() => {
  'use strict';
  if (window.BTRGalleryToolbar) return;
  function init() {
    const toolbar = document.getElementById('btr-collage-toolbar');
    const filters = document.getElementById('filters');
    if (!toolbar || !filters || toolbar.dataset.compactToolbar) return;
    toolbar.dataset.compactToolbar = 'true';
    toolbar.setAttribute('role', 'region');
    toolbar.setAttribute('aria-label', 'Gallery controls');

    const mobileFilter = document.createElement('select');
    mobileFilter.id = 'btr-gallery-filter';
    mobileFilter.setAttribute('aria-label', 'Filter the gallery');
    const keys = ['all', 'worn', 'garments', 'inspiration'];
    Array.from(filters.querySelectorAll('button')).forEach((button, index) => {
      const option = document.createElement('option');
      option.value = keys[index];
      option.textContent = button.getAttribute('aria-label').replace(', ', ' · ').replace(' photos', '');
      option.disabled = button.disabled;
      mobileFilter.append(option);
    });
    filters.after(mobileFilter);
    function syncFilter() {mobileFilter.value = window.BTRCollage.current.getState().filter;}
    mobileFilter.addEventListener('change', () => {
      window.BTRCollage.current.setFilter(mobileFilter.value);
    });
    window.addEventListener('btr:collagechange', syncFilter);
    syncFilter();

    const options = document.createElement('details');
    options.className = 'btr-toolbar-options';
    const summary = document.createElement('summary');
    summary.setAttribute('aria-label', 'Gallery options');
    summary.title = 'Smoke and shuffle';
    const dots = document.createElement('span');
    dots.className = 'btr-toolbar-dots'; dots.setAttribute('aria-hidden', 'true');
    summary.append(dots);
    const panel = document.createElement('div');
    panel.className = 'btr-toolbar-options-panel';
    options.append(summary, panel); toolbar.append(options);
    function collectOptions() {
      toolbar.querySelectorAll(':scope > .btr-smoke-toggle, :scope > .btr-shuffle-toggle, :scope > #count').forEach(node => panel.append(node));
    }
    collectOptions();
    // Shuffle is installed by the existing site enhancement after the gallery.
    new MutationObserver(collectOptions).observe(toolbar, {childList: true});
    panel.addEventListener('click', event => {
      if (event.target.closest('.btr-shuffle-toggle')) {options.open = false; summary.focus({preventScroll:true});}
    });
    document.addEventListener('click', event => {if (options.open && !options.contains(event.target)) options.open = false;});
    options.addEventListener('keydown', event => {
      if (event.key === 'Escape') {options.open = false; summary.focus({preventScroll:true}); event.stopPropagation();}
    });

    const header = document.querySelector('.site-top');
    function positionStrip() {
      const position = header && getComputedStyle(header).position;
      const top = position === 'sticky' || position === 'fixed' ? Math.ceil(header.getBoundingClientRect().height) : 0;
      toolbar.style.setProperty('--btr-toolbar-top', top + 'px');
    }
    positionStrip();
    if (header && 'ResizeObserver' in window) new ResizeObserver(positionStrip).observe(header);
    window.addEventListener('resize', positionStrip, {passive:true});
  }
  window.BTRGalleryToolbar = {init};
})();

/* BREAKTHYRULE gallery. Instagram and user-provided photos are hosted on the retained gallery asset branch. */
(()=>{
 'use strict';
 const assetOrigin="https://instagram-gallery-assets--breakthyrule-eden-showroom.netlify.app";
 const gallery={"generated":"2026-11-12","categories":["worn","garments","inspiration"],"items":[{"id":"upload-img-9229","src":"/images/upload-img-9229.webp","width":1125,"height":1084,"ratio":0.9635555555555556,"category":"worn","caption":"","alt":"Person wearing a patterned cap and a bright blue graphic sweatshirt seated in front of windows and large fans.","source":"Studio archive","platform":"archive"},{"id":"upload-img-9301","src":"/images/upload-img-9301.webp","width":1350,"height":1800,"ratio":1.3333333333333333,"category":"worn","caption":"","alt":"Close-up of a person with curly hair wearing a bright green illustrated long-sleeve top outdoors.","source":"Studio archive","platform":"archive"},{"id":"archive-img-0155","src":"/images/archive-img-0155.webp","width":1350,"height":1800,"ratio":1.3333333333333333,"category":"worn","caption":"","alt":"Person in a black beanie and dark jacket looking down at a black top with a red face and sun graphic beside leafy branches.","source":"Studio archive","platform":"archive"},{"id":"archive-img-0367","src":"/images/archive-img-0367.webp","width":1800,"height":1800,"ratio":1.0,"category":"worn","caption":"","alt":"Person with a hood covering their head wearing a black graphic sweatshirt and loose white trousers against a pale wall.","source":"Studio archive","platform":"archive"},{"id":"archive-img-0381","src":"/images/archive-img-0381.webp","width":1350,"height":1800,"ratio":1.3333333333333333,"category":"worn","caption":"","alt":"Back view of a person wearing an olive jacket with a large illustrated panel and fabric flowers resting on the shoulders.","source":"Studio archive","platform":"archive"},{"id":"archive-img-0516","src":"/images/archive-img-0516.webp","width":1350,"height":1800,"ratio":1.3333333333333333,"category":"worn","caption":"","alt":"Back view of a person in a pale yellow printed hoodie and white trousers outside a storefront.","source":"Studio archive","platform":"archive"},{"id":"archive-img-0694","src":"/images/archive-img-0694.webp","width":1124,"height":1090,"ratio":0.9697508896797153,"category":"worn","caption":"","alt":"Close view of an off-shoulder white T-shirt decorated with illustrated faces, leaves and lettering.","source":"Studio archive","platform":"archive"},{"id":"archive-img-2169","src":"/images/archive-img-2169.webp","width":1350,"height":1800,"ratio":1.3333333333333333,"category":"worn","caption":"","alt":"Person wearing a dark graphic top and red patterned boots beside an illuminated cross overlooking city lights at night.","source":"Studio archive","platform":"archive"},{"id":"archive-img-2440","src":"/images/archive-img-2440.webp","width":1350,"height":1800,"ratio":1.3333333333333333,"category":"worn","caption":"","alt":"Person walking toward the camera in a black printed sweatshirt and black trousers while holding a red can.","source":"Studio archive","platform":"archive"},{"id":"archive-img-2805","src":"/images/archive-img-2805.webp","width":1200,"height":1800,"ratio":1.5,"category":"worn","caption":"","alt":"Night photograph of a person wearing a pale yellow T-shirt with a large illustrated back print.","source":"Studio archive","platform":"archive"},{"id":"archive-img-3589","src":"/images/archive-img-3589.webp","width":1350,"height":1800,"ratio":1.3333333333333333,"category":"worn","caption":"","alt":"Outdoor close-up of a person wearing a colorful eye-print T-shirt beneath a pale jacket.","source":"Studio archive","platform":"archive"},{"id":"archive-img-8369","src":"/images/archive-img-8369.webp","width":1350,"height":1800,"ratio":1.3333333333333333,"category":"worn","caption":"","alt":"Person wearing a white graphic T-shirt and black printed trousers standing on a court beside a chain-link fence.","source":"Studio archive","platform":"archive"},{"id":"archive-t","src":"/images/archive-t.webp","width":1350,"height":1800,"ratio":1.3333333333333333,"category":"worn","caption":"","alt":"Person in a white graphic T-shirt and black trousers with a green, white and red printed cloth covering their face.","source":"Studio archive","platform":"archive"},{"id":"DIzzPxITlZB","src":"/images/breakthyrule/instagram/DIzzPxITlZB.webp","ratio":1.0,"width":640,"height":640,"category":"worn","caption":"Pale yellow graphic hoodie","alt":"Person wearing sunglasses and a pale yellow graphic hoodie in a studio.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/DIzzPxITlZB/","platform":"instagram"},{"id":"DC5Pt4gS30r","src":"/images/breakthyrule/instagram/DC5Pt4gS30r.webp","ratio":1.0,"width":640,"height":640,"category":"worn","caption":"Love in color","alt":"White I Love Gaza graphic T-shirt layered beneath a bright patterned jacket.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/DC5Pt4gS30r/","platform":"instagram"},{"id":"DCcYUOHSO2P","src":"/images/breakthyrule/instagram/DCcYUOHSO2P.webp","ratio":1.0,"width":640,"height":640,"category":"worn","caption":"Beyond the hills","alt":"Person in a patterned jacket and white graphic T-shirt beneath a cloudy sky.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/DCcYUOHSO2P/","platform":"instagram"},{"id":"C_Tb6LCP_5G","src":"/images/breakthyrule/instagram/C_Tb6LCP_5G.webp","ratio":1.0,"width":640,"height":640,"category":"worn","caption":"At the doorway","alt":"Person wearing a pale graphic tank top, standing against a doorway with hands covering their face.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C_Tb6LCP_5G/","platform":"instagram"},{"id":"C_G8W5yy-iY","src":"/images/breakthyrule/instagram/C_G8W5yy-iY.webp","ratio":1.0,"width":640,"height":640,"category":"worn","caption":"After dark","alt":"Person in a white Jesus graphic T-shirt, jeans and black boots, seated against a block wall.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C_G8W5yy-iY/","platform":"instagram"},{"id":"C_BW8cLvk3E","src":"/images/breakthyrule/instagram/C_BW8cLvk3E.webp","ratio":1.25,"width":512,"height":640,"category":"worn","caption":"Pari","alt":"Person wearing a white Pari butterfly graphic T-shirt and raising one hand.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C_BW8cLvk3E/","platform":"instagram"},{"id":"C9szMN_SZgx","src":"/images/breakthyrule/instagram/C9szMN_SZgx.webp","ratio":1.0,"width":640,"height":640,"category":"worn","caption":"Night on the pier","alt":"Group wearing graphic clothing on a wooden pier at night.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C9szMN_SZgx/","platform":"instagram"},{"id":"C83NsWRplEq","src":"/images/breakthyrule/instagram/C83NsWRplEq.webp","ratio":1.25,"width":512,"height":640,"category":"worn","caption":"Three perspectives","alt":"Three people in white and dark graphic outfits standing outdoors at night.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C83NsWRplEq/","platform":"instagram"},{"id":"C82kCO6SKkb","src":"/images/breakthyrule/instagram/C82kCO6SKkb.webp","ratio":1.0,"width":640,"height":640,"category":"worn","caption":"Wrapped in print","alt":"Close view of a person wearing a printed head covering and a black-and-white patterned top.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C82kCO6SKkb/","platform":"instagram"},{"id":"C80ZX61P0iW","src":"/images/breakthyrule/instagram/C80ZX61P0iW.webp","ratio":1.0,"width":640,"height":640,"category":"worn","caption":"Study in white","alt":"Two people wearing white shirts decorated with eye and red graphic prints.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C80ZX61P0iW/","platform":"instagram"},{"id":"C8wBsGwObCw","src":"/images/breakthyrule/instagram/C8wBsGwObCw.webp","ratio":1.0458,"width":612,"height":640,"category":"worn","caption":"On the steps","alt":"Group wearing graphic shirts and printed trousers on a stone staircase.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C8wBsGwObCw/","platform":"instagram"},{"id":"C8s7fhypZQw","src":"/images/breakthyrule/instagram/C8s7fhypZQw.webp","ratio":1.0,"width":640,"height":640,"category":"worn","caption":"In the studio","alt":"Two people in a studio, one wearing a black top with a red back graphic and another seated beside a printed sheet.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C8s7fhypZQw/","platform":"instagram"},{"id":"studio-img_0671","src":"/images/breakthyrule/studio-gallery/img_0671.webp","ratio":1.7778,"width":900,"height":1600,"category":"garments","caption":"Graphic trousers","alt":"Black flared trousers with illustrated patches on a white promotional background reading On site now.","source":"Studio archive","platform":"studio"},{"id":"studio-img_0675","src":"/images/breakthyrule/studio-gallery/img_0675.webp","ratio":1.7778,"width":900,"height":1600,"category":"garments","caption":"Color at the worktable","alt":"Brightly colored graphic trucker caps arranged on a worktable in a studio.","source":"Studio archive","platform":"studio"},{"id":"studio-img_0677","src":"/images/breakthyrule/studio-gallery/img_0677.webp","ratio":1.0068,"width":1179,"height":1187,"category":"worn","caption":"Butterfly layers","alt":"Person wearing a white butterfly graphic T-shirt, a textured jacket and leopard-print trousers.","source":"Studio archive","platform":"studio"},{"id":"studio-img_0678","src":"/images/breakthyrule/studio-gallery/img_0678.webp","ratio":1.0246,"width":1179,"height":1208,"category":"worn","caption":"By the water","alt":"Person in a pale Jesus graphic T-shirt and wide trousers standing above a blue bay.","source":"Studio archive","platform":"studio"},{"id":"studio-img_0679","src":"/images/breakthyrule/studio-gallery/img_0679.webp","ratio":0.9847,"width":1179,"height":1161,"category":"worn","caption":"After sunset","alt":"Person wearing an oversized white printed shirt, a cap and patterned boots outdoors at night.","source":"Studio archive","platform":"studio"},{"id":"studio-img_0680","src":"/images/breakthyrule/studio-gallery/img_0680.webp","ratio":0.8643,"width":1024,"height":885,"category":"worn","caption":"Between the boards","alt":"Person in a white sleeveless crop top and illustrated wide-leg trousers standing between surfboards.","source":"Studio archive","platform":"studio"},{"id":"studio-img_0681","src":"/images/breakthyrule/studio-gallery/img_0681.webp","ratio":0.9254,"width":1179,"height":1091,"category":"worn","caption":"Purple symbols","alt":"Person wearing sunglasses, a patterned head covering and a purple symbol-print T-shirt over white long sleeves.","source":"Studio archive","platform":"studio"},{"id":"studio-img_0682","src":"/images/breakthyrule/studio-gallery/img_0682.webp","ratio":0.4767,"width":1179,"height":562,"category":"garments","caption":"Caps in the studio","alt":"Two rows of colorful graphic caps displayed on a studio workbench.","source":"Studio archive","platform":"studio"},{"id":"studio-img_0683","src":"/images/breakthyrule/studio-gallery/img_0683.webp","ratio":0.9576,"width":1179,"height":1129,"category":"worn","caption":"Layered graphics","alt":"Person with long hair wearing a black hoodie over a printed T-shirt and patterned trousers.","source":"Studio archive","platform":"studio"},{"id":"C_Tb6LCP_5G-02","src":"/images/breakthyrule/instagram/C_Tb6LCP_5G-02.webp","width":1440,"height":1439,"ratio":0.9993055555555556,"category":"inspiration","caption":"","alt":"Dark artwork of four veiled figures with the word gatekeeper in red.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C_Tb6LCP_5G/","platform":"instagram"},{"id":"C_Tb6LCP_5G-03","src":"/images/breakthyrule/instagram/C_Tb6LCP_5G-03.webp","width":1440,"height":1440,"ratio":1.0,"category":"inspiration","caption":"","alt":"Black-and-white ornamental drawing with a tree, animals and a central emblem.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C_Tb6LCP_5G/","platform":"instagram"},{"id":"C8s67xvJ3JO","src":"/images/breakthyrule/instagram/C8s67xvJ3JO.webp","width":1280,"height":1600,"ratio":1.25,"category":"worn","caption":"","alt":"Person in a black hooded top and wide white trousers standing in a pale room.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C8s67xvJ3JO/","platform":"instagram"},{"id":"C8s6weRJYy7","src":"/images/breakthyrule/instagram/C8s6weRJYy7.webp","width":1116,"height":1116,"ratio":1.0,"category":"worn","caption":"","alt":"Three people in black and white graphic outfits standing against a pale wall.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C8s6weRJYy7/","platform":"instagram"},{"id":"C8dRkjUPJ2a","src":"/images/breakthyrule/instagram/C8dRkjUPJ2a.webp","width":1124,"height":1124,"ratio":1.0,"category":"worn","caption":"","alt":"Photo collage of a person wearing a white graphic T-shirt on a tree-lined road.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C8dRkjUPJ2a/","platform":"instagram"},{"id":"C7veSrVOd_I","src":"/images/breakthyrule/instagram/C7veSrVOd_I.webp","width":1600,"height":1600,"ratio":1.0,"category":"worn","caption":"","alt":"Two people wearing pale graphic tops and wide trousers outside a storefront at night.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C7veSrVOd_I/","platform":"instagram"},{"id":"C67yx-pOL8H","src":"/images/breakthyrule/instagram/C67yx-pOL8H.webp","width":1600,"height":1600,"ratio":1.0,"category":"worn","caption":"","alt":"Person in a white graphic T-shirt and illustrated white trousers on a wooded sidewalk.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C67yx-pOL8H/","platform":"instagram"},{"id":"C57sXDjO1-H","src":"/images/breakthyrule/instagram/C57sXDjO1-H.webp","width":1600,"height":1600,"ratio":1.0,"category":"worn","caption":"","alt":"Person wearing a black graphic outfit seated in the open doorway of a black car.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C57sXDjO1-H/","platform":"instagram"},{"id":"C5rowHuPgKv","src":"/images/breakthyrule/instagram/C5rowHuPgKv.webp","width":1600,"height":1600,"ratio":1.0,"category":"worn","caption":"","alt":"Person in a black graphic sweatshirt and trousers walking along a sidewalk.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C5rowHuPgKv/","platform":"instagram"},{"id":"C5prmQoutj3","src":"/images/breakthyrule/instagram/C5prmQoutj3.webp","width":1169,"height":1169,"ratio":1.0,"category":"inspiration","caption":"","alt":"An illuminated white cross overlooking city lights at night.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C5prmQoutj3/","platform":"instagram"},{"id":"C5lxMxkPcw1","src":"/images/breakthyrule/instagram/C5lxMxkPcw1.webp","width":1280,"height":1600,"ratio":1.25,"category":"worn","caption":"","alt":"Person wearing sunglasses and a white illustrated T-shirt over black sleeves.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C5lxMxkPcw1/","platform":"instagram"},{"id":"C5hmey2L5mW","src":"/images/breakthyrule/instagram/C5hmey2L5mW.webp","width":1280,"height":1600,"ratio":1.25,"category":"worn","caption":"","alt":"Person seated on a red chair wearing a white graphic T-shirt and decorated black flared trousers.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C5hmey2L5mW/","platform":"instagram"},{"id":"C5hmey2L5mW-02","src":"/images/breakthyrule/instagram/C5hmey2L5mW-02.webp","width":1280,"height":1600,"ratio":1.25,"category":"garments","caption":"","alt":"White short-sleeved graphic T-shirt displayed against a black background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C5hmey2L5mW/","platform":"instagram"},{"id":"C5W4s9BvUvL","src":"/images/breakthyrule/instagram/C5W4s9BvUvL.webp","width":1600,"height":1600,"ratio":1.0,"category":"worn","caption":"","alt":"Person with blond hair in a white graphic T-shirt outside a storefront.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C5W4s9BvUvL/","platform":"instagram"},{"id":"C5P9-JSO3Wc","src":"/images/breakthyrule/instagram/C5P9-JSO3Wc.webp","width":1600,"height":1600,"ratio":1.0,"category":"worn","caption":"","alt":"Person in a black hooded graphic outfit standing beside a colorful figure on a city street at night.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C5P9-JSO3Wc/","platform":"instagram"},{"id":"C5OTkrjLvBZ-01","src":"/images/breakthyrule/instagram/C5OTkrjLvBZ-01.webp","width":1600,"height":1600,"ratio":1.0,"category":"worn","caption":"","alt":"Person wearing a dark hooded sweatshirt with a red sun and face graphic outdoors at night.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C5OTkrjLvBZ/","platform":"instagram"},{"id":"C5AfgkHOTAa-01","src":"/images/breakthyrule/instagram/C5AfgkHOTAa-01.webp","width":1600,"height":1600,"ratio":1.0,"category":"worn","caption":"","alt":"Black-and-white portrait of a person in white sunglasses and a long-sleeve graphic shirt.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C5AfgkHOTAa/","platform":"instagram"},{"id":"C5AZ7R3uSG4-01","src":"/images/breakthyrule/instagram/C5AZ7R3uSG4-01.webp","width":1439,"height":1439,"ratio":1.0,"category":"worn","caption":"","alt":"Person wearing a yellow graphic T-shirt, dark jacket and printed trousers beside a Ferris wheel at night.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C5AZ7R3uSG4/","platform":"instagram"},{"id":"C419j3ROOuk-01","src":"/images/breakthyrule/instagram/C419j3ROOuk-01.webp","width":1600,"height":1600,"ratio":1.0,"category":"worn","caption":"","alt":"Two people wearing white graphic T-shirts and black printed trousers in front of a wooden fence.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C419j3ROOuk/","platform":"instagram"},{"id":"C4uURwIuEo3-01","src":"/images/breakthyrule/instagram/C4uURwIuEo3-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"worn","caption":"","alt":"Two people showing the front and back of dark tops with red graphics and printed trousers in a parking lot.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C4uURwIuEo3/","platform":"instagram"},{"id":"C4uURwIuEo3-02","src":"/images/breakthyrule/instagram/C4uURwIuEo3-02.webp","width":1440,"height":1439,"ratio":0.9993055555555556,"category":"worn","caption":"","alt":"Two people wearing dark graphic outfits, with red lettering and a red sun design on their tops.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C4uURwIuEo3/","platform":"instagram"},{"id":"C3w0CQpON21-01","src":"/images/breakthyrule/instagram/C3w0CQpON21-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Cream sweatshirt with an I Love Gaza design laid flat on a wood floor.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C3w0CQpON21/","platform":"instagram"},{"id":"C3w0CQpON21-02","src":"/images/breakthyrule/instagram/C3w0CQpON21-02.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Back of a cream sweatshirt with a collage of portraits and a ceasefire message, laid flat.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C3w0CQpON21/","platform":"instagram"},{"id":"C13lGoeukcd-01","src":"/images/breakthyrule/instagram/C13lGoeukcd-01.webp","width":1280,"height":1600,"ratio":1.25,"category":"worn","caption":"","alt":"Person with long hair wearing a black Seed Supply graphic shirt in sunlight.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C13lGoeukcd/","platform":"instagram"},{"id":"C1Bh3BUu9Db-01","src":"/images/breakthyrule/instagram/C1Bh3BUu9Db-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"worn","caption":"","alt":"Back of a printed T-shirt with a large star and illustrated symbols under red lighting.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/C1Bh3BUu9Db/","platform":"instagram"},{"id":"CxPtK5cOhlS-01","src":"/images/breakthyrule/instagram/CxPtK5cOhlS-01.webp","width":720,"height":720,"ratio":1.0,"category":"inspiration","caption":"","alt":"Purple and pink digital artwork showing a blue-robed figure and Spiritual Warfare 2 lettering.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CxPtK5cOhlS/","platform":"instagram"},{"id":"Cw8wY5_vB31-01","src":"/images/breakthyrule/instagram/Cw8wY5_vB31-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Collage showing four sides of white graphic T-shirts against a dark background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/Cw8wY5_vB31/","platform":"instagram"},{"id":"Cw8wVS9Pe9k-01","src":"/images/breakthyrule/instagram/Cw8wVS9Pe9k-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Pink and lavender graphic T-shirts arranged on a purple background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/Cw8wVS9Pe9k/","platform":"instagram"},{"id":"Cs4eqjLSR7--01","src":"/images/breakthyrule/instagram/Cs4eqjLSR7--01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Blue denim shorts with a colorful Seed Supply print laid flat on concrete.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/Cs4eqjLSR7-/","platform":"instagram"},{"id":"CspD8u1v5aL-01","src":"/images/breakthyrule/instagram/CspD8u1v5aL-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Purple and yellow graphic T-shirts laid side by side on concrete.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CspD8u1v5aL/","platform":"instagram"},{"id":"CmHd_j4psrN-01","src":"/images/breakthyrule/instagram/CmHd_j4psrN-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"White and gray sweatshirts and T-shirts with colorful freedom and peace graphics laid together.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CmHd_j4psrN/","platform":"instagram"},{"id":"CkYxWC1pZZH-01","src":"/images/breakthyrule/instagram/CkYxWC1pZZH-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Two white sweatshirts with red sun and face graphics laid on concrete.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CkYxWC1pZZH/","platform":"instagram"},{"id":"CgR_4sRpFpR-01","src":"/images/breakthyrule/instagram/CgR_4sRpFpR-01.webp","width":1280,"height":1600,"ratio":1.25,"category":"inspiration","caption":"","alt":"Printed portrait of a person wearing a dark hoodie with a circular colorful graphic, taped to a wall.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CgR_4sRpFpR/","platform":"instagram"},{"id":"CWwe-q2PS5Y-01","src":"/images/breakthyrule/instagram/CWwe-q2PS5Y-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"inspiration","caption":"","alt":"Black Friday promotional graphic with folded clothes, product thumbnails and Hybridation lettering.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CWwe-q2PS5Y/","platform":"instagram"},{"id":"CWwe-q2PS5Y-02","src":"/images/breakthyrule/instagram/CWwe-q2PS5Y-02.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Grid of graphic sweatshirts and hoodies in different colors on a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CWwe-q2PS5Y/","platform":"instagram"},{"id":"CPwt64KMW0Y-01","src":"/images/breakthyrule/instagram/CPwt64KMW0Y-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"worn","caption":"","alt":"Person wearing a black sweatshirt and trousers with dark red graphics against a plain wall.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CPwt64KMW0Y/","platform":"instagram"},{"id":"CPwt64KMW0Y-02","src":"/images/breakthyrule/instagram/CPwt64KMW0Y-02.webp","width":1440,"height":1440,"ratio":1.0,"category":"worn","caption":"","alt":"Back view of a person in a rust-colored hoodie with a cream emblem and white trousers.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CPwt64KMW0Y/","platform":"instagram"},{"id":"CPwt64KMW0Y-03","src":"/images/breakthyrule/instagram/CPwt64KMW0Y-03.webp","width":1440,"height":1440,"ratio":1.0,"category":"worn","caption":"","alt":"Front view of a person wearing a rust-colored hoodie and white trousers with matching cream emblems.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CPwt64KMW0Y/","platform":"instagram"},{"id":"COJdyVjMy_N-01","src":"/images/breakthyrule/instagram/COJdyVjMy_N-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"worn","caption":"","alt":"Person wearing a white long-sleeve shirt with a large grayscale oval graphic against a plain background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/COJdyVjMy_N/","platform":"instagram"},{"id":"COJdyVjMy_N-02","src":"/images/breakthyrule/instagram/COJdyVjMy_N-02.webp","width":1440,"height":1440,"ratio":1.0,"category":"worn","caption":"","alt":"Person wearing a black hoodie with pale green and white illustrated figures.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/COJdyVjMy_N/","platform":"instagram"},{"id":"COJdyVjMy_N-03","src":"/images/breakthyrule/instagram/COJdyVjMy_N-03.webp","width":1440,"height":1440,"ratio":1.0,"category":"worn","caption":"","alt":"Person with long hair wearing a black hoodie with pale green and white illustrated figures.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/COJdyVjMy_N/","platform":"instagram"},{"id":"COJdyVjMy_N-04","src":"/images/breakthyrule/instagram/COJdyVjMy_N-04.webp","width":1440,"height":1440,"ratio":1.0,"category":"worn","caption":"","alt":"Person wearing a white long-sleeve shirt with a large grayscale oval print.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/COJdyVjMy_N/","platform":"instagram"},{"id":"CKDD2Bys7rG-01","src":"/images/breakthyrule/instagram/CKDD2Bys7rG-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Cream tote bag with black rifle silhouettes arranged over paper target graphics.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CKDD2Bys7rG/","platform":"instagram"},{"id":"CKDD2Bys7rG-02","src":"/images/breakthyrule/instagram/CKDD2Bys7rG-02.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Cream tote bag with black rifle silhouettes shown against a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CKDD2Bys7rG/","platform":"instagram"},{"id":"CKDD2Bys7rG-03","src":"/images/breakthyrule/instagram/CKDD2Bys7rG-03.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Back of a cream tote bag with a small black emblem against a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CKDD2Bys7rG/","platform":"instagram"},{"id":"CI1kyGDs2uv-01","src":"/images/breakthyrule/instagram/CI1kyGDs2uv-01.webp","width":1329,"height":1600,"ratio":1.2039127163280663,"category":"worn","caption":"","alt":"Mirror photograph of a person in a purple symbol-print T-shirt, patterned head covering and dark wide-leg trousers.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CI1kyGDs2uv/","platform":"instagram"},{"id":"CI1kyGDs2uv-02","src":"/images/breakthyrule/instagram/CI1kyGDs2uv-02.webp","width":1331,"height":1600,"ratio":1.2021036814425243,"category":"worn","caption":"","alt":"Person in a purple graphic T-shirt and chain-trimmed dark trousers raising one leg in a mirror photograph.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CI1kyGDs2uv/","platform":"instagram"},{"id":"CIraYBCMMTj-01","src":"/images/breakthyrule/instagram/CIraYBCMMTj-01.webp","width":1280,"height":1600,"ratio":1.25,"category":"worn","caption":"","alt":"Person modeling a black sun-print sweatshirt and matching trousers with white sneakers in a studio.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CIraYBCMMTj/","platform":"instagram"},{"id":"CIraYBCMMTj-02","src":"/images/breakthyrule/instagram/CIraYBCMMTj-02.webp","width":1283,"height":1600,"ratio":1.2470771628994544,"category":"worn","caption":"","alt":"Two people modeling black outfits with circular white graphics in a white studio.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CIraYBCMMTj/","platform":"instagram"},{"id":"CIraYBCMMTj-03","src":"/images/breakthyrule/instagram/CIraYBCMMTj-03.webp","width":1284,"height":1600,"ratio":1.2461059190031152,"category":"worn","caption":"","alt":"Person in a black sun-print sweatshirt, cream trousers and a black beanie carrying a black bag.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CIraYBCMMTj/","platform":"instagram"},{"id":"CIraYBCMMTj-04","src":"/images/breakthyrule/instagram/CIraYBCMMTj-04.webp","width":1284,"height":1600,"ratio":1.2461059190031152,"category":"worn","caption":"","alt":"Close view of a black sweatshirt and wide-leg trousers with white circular graphics and black shoes.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CIraYBCMMTj/","platform":"instagram"},{"id":"CIraYBCMMTj-05","src":"/images/breakthyrule/instagram/CIraYBCMMTj-05.webp","width":1280,"height":1600,"ratio":1.25,"category":"worn","caption":"","alt":"Close view of a black sweatshirt worn with cream trousers bearing a dark sun emblem.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CIraYBCMMTj/","platform":"instagram"},{"id":"CFs0hFvsks_-01","src":"/images/breakthyrule/instagram/CFs0hFvsks_-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Close-up of red T-shirts layered together with purple and pink symbol prints.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CFs0hFvsks_/","platform":"instagram"},{"id":"CFs0hFvsks_-02","src":"/images/breakthyrule/instagram/CFs0hFvsks_-02.webp","width":1354,"height":1354,"ratio":1.0,"category":"garments","caption":"","alt":"Red T-shirt with purple and pink symbols displayed against a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CFs0hFvsks_/","platform":"instagram"},{"id":"CD2q24qjJZM-01","src":"/images/breakthyrule/instagram/CD2q24qjJZM-01.webp","width":1280,"height":1600,"ratio":1.25,"category":"worn","caption":"","alt":"Black-and-white portrait of a person wearing a white graphic long-sleeve shirt and layered necklaces.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CD2q24qjJZM/","platform":"instagram"},{"id":"CD2q24qjJZM-02","src":"/images/breakthyrule/instagram/CD2q24qjJZM-02.webp","width":1280,"height":1600,"ratio":1.25,"category":"worn","caption":"","alt":"Black-and-white studio photograph of a person in a white graphic shirt, dark jeans and a shoulder bag.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CD2q24qjJZM/","platform":"instagram"},{"id":"CD2q24qjJZM-03","src":"/images/breakthyrule/instagram/CD2q24qjJZM-03.webp","width":1280,"height":1600,"ratio":1.25,"category":"worn","caption":"","alt":"Black-and-white photograph of a person looking down while wearing a white graphic shirt and dark jeans.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CD2q24qjJZM/","platform":"instagram"},{"id":"CDfRLWOD0Yx-01","src":"/images/breakthyrule/instagram/CDfRLWOD0Yx-01.webp","width":1306,"height":1600,"ratio":1.225114854517611,"category":"worn","caption":"","alt":"Person in an orange graphic sweatshirt stepping out of a white car at night.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CDfRLWOD0Yx/","platform":"instagram"},{"id":"CDfRLWOD0Yx-02","src":"/images/breakthyrule/instagram/CDfRLWOD0Yx-02.webp","width":1311,"height":1600,"ratio":1.2204424103737606,"category":"worn","caption":"","alt":"Close view of an orange sweatshirt with a large pale symbol print being worn at night.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CDfRLWOD0Yx/","platform":"instagram"},{"id":"CDVEZ3MD7P6-01","src":"/images/breakthyrule/instagram/CDVEZ3MD7P6-01.webp","width":1365,"height":1396,"ratio":1.0227106227106226,"category":"inspiration","caption":"","alt":"Stylized figure wearing a red graphic T-shirt, with purple symbols covering the head and arms.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CDVEZ3MD7P6/","platform":"instagram"},{"id":"CDVEZ3MD7P6-02","src":"/images/breakthyrule/instagram/CDVEZ3MD7P6-02.webp","width":1376,"height":1398,"ratio":1.0159883720930232,"category":"garments","caption":"","alt":"Red T-shirt with layered purple and pink symbols on a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CDVEZ3MD7P6/","platform":"instagram"},{"id":"CCr0V0tjYsX-01","src":"/images/breakthyrule/instagram/CCr0V0tjYsX-01.webp","width":1402,"height":1600,"ratio":1.1412268188302426,"category":"garments","caption":"","alt":"White long-sleeve shirt with a pastel-colored symbol print hanging on a black hanger.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CCr0V0tjYsX/","platform":"instagram"},{"id":"CAEp0g9gjTU-01","src":"/images/breakthyrule/instagram/CAEp0g9gjTU-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"worn","caption":"","alt":"Person wearing a brown long-sleeve shirt with rows of human figures and white trousers outdoors.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/CAEp0g9gjTU/","platform":"instagram"},{"id":"B_8qbe9A1yH-01","src":"/images/breakthyrule/instagram/B_8qbe9A1yH-01.webp","width":1440,"height":1334,"ratio":0.9263888888888889,"category":"garments","caption":"","alt":"Promotional collage of six colored long-sleeve shirts with human-figure prints and care instructions.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B_8qbe9A1yH/","platform":"instagram"},{"id":"B_8qbe9A1yH-02","src":"/images/breakthyrule/instagram/B_8qbe9A1yH-02.webp","width":904,"height":841,"ratio":0.9303097345132744,"category":"garments","caption":"","alt":"Red long-sleeve shirt with pale human-figure silhouettes and My Shadows lettering on a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B_8qbe9A1yH/","platform":"instagram"},{"id":"B_8qbe9A1yH-03","src":"/images/breakthyrule/instagram/B_8qbe9A1yH-03.webp","width":928,"height":864,"ratio":0.9310344827586207,"category":"garments","caption":"","alt":"Yellow long-sleeve shirt with a pale figure print and lettering on a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B_8qbe9A1yH/","platform":"instagram"},{"id":"B_8qbe9A1yH-04","src":"/images/breakthyrule/instagram/B_8qbe9A1yH-04.webp","width":928,"height":864,"ratio":0.9310344827586207,"category":"garments","caption":"","alt":"Pink long-sleeve shirt with red figure silhouettes and lettering on a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B_8qbe9A1yH/","platform":"instagram"},{"id":"B_8qbe9A1yH-05","src":"/images/breakthyrule/instagram/B_8qbe9A1yH-05.webp","width":765,"height":712,"ratio":0.930718954248366,"category":"garments","caption":"","alt":"Brown long-sleeve shirt with black figure silhouettes and lettering on a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B_8qbe9A1yH/","platform":"instagram"},{"id":"B_8qbe9A1yH-06","src":"/images/breakthyrule/instagram/B_8qbe9A1yH-06.webp","width":1296,"height":1204,"ratio":0.9290123456790124,"category":"garments","caption":"","alt":"Purple long-sleeve shirt with darker figure silhouettes and lettering on a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B_8qbe9A1yH/","platform":"instagram"},{"id":"B_8qbe9A1yH-07","src":"/images/breakthyrule/instagram/B_8qbe9A1yH-07.webp","width":1395,"height":1299,"ratio":0.9311827956989247,"category":"garments","caption":"","alt":"Gray long-sleeve shirt with dark red figure silhouettes and lettering on a white background.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B_8qbe9A1yH/","platform":"instagram"},{"id":"B_6DO2YAiC1-01","src":"/images/breakthyrule/instagram/B_6DO2YAiC1-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Colorful shirts with human-figure prints layered in a circular arrangement.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B_6DO2YAiC1/","platform":"instagram"},{"id":"B95upoTg1AJ-01","src":"/images/breakthyrule/instagram/B95upoTg1AJ-01.webp","width":1200,"height":1200,"ratio":1.0,"category":"garments","caption":"","alt":"White long-sleeve shirt with a black sun and eye graphic laid on a dark reflective floor.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B95upoTg1AJ/","platform":"instagram"},{"id":"B95upoTg1AJ-02","src":"/images/breakthyrule/instagram/B95upoTg1AJ-02.webp","width":900,"height":900,"ratio":1.0,"category":"garments","caption":"","alt":"Close-up of script lettering and fine linework printed on white fabric.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B95upoTg1AJ/","platform":"instagram"},{"id":"B95upoTg1AJ-03","src":"/images/breakthyrule/instagram/B95upoTg1AJ-03.webp","width":901,"height":901,"ratio":1.0,"category":"garments","caption":"","alt":"Close-up of an eye inside a dark sun graphic printed on white fabric.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B95upoTg1AJ/","platform":"instagram"},{"id":"B273Ua8AG7j-01","src":"/images/breakthyrule/instagram/B273Ua8AG7j-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Pale yellow long-sleeve shirt with blue figure silhouettes laid on dry grass.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B273Ua8AG7j/","platform":"instagram"},{"id":"B23HBIxAcHk-01","src":"/images/breakthyrule/instagram/B23HBIxAcHk-01.webp","width":1440,"height":1440,"ratio":1.0,"category":"garments","caption":"","alt":"Black long-sleeve shirt with white figure silhouettes and lettering laid on a wood floor.","source":"@breakthyrule on Instagram","postUrl":"https://www.instagram.com/breakthyrule/p/B23HBIxAcHk/","platform":"instagram"}]};
 // Gallery-only exclusions requested on 2026-11-13; shared photo assets remain available.
 const excluded=new Set(["archive-img-8369","studio-img_0677","archive-img-0516","archive-img-0694","C8wBsGwObCw"]);gallery.items=gallery.items.filter(item=>!excluded.has(item.id));


 // Restore the original product-only photographs on the gallery page.
 if(/^\/gallery(?:\.html)?\/?$/.test(location.pathname)){const restoredGarments=[{"id":"original-product-000-6b49f5b5-3f27-4f32-b604-01645a7ae0cd","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/000-6b49f5b5-3f27-4f32-b604-01645a7ae0cd.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Cross Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-001-6b49f5b5-3f27-4f32-b604-01645a7ae0cd","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/001-6b49f5b5-3f27-4f32-b604-01645a7ae0cd.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-002-8ea2387e-42c7-4655-8f1f-ec4335658cee","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/002-8ea2387e-42c7-4655-8f1f-ec4335658cee.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Jesus\u2605 Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-003-black-market-baby","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/003-black-market-baby.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Blackmarket Baby Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-005-fm","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/005-fm.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"#Family Maxi Tank original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-006-img_0063","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/006-img_0063.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Divide & Conquer Crewneck original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-007-img_0064","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/007-img_0064.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Illuminati Crewneck original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-008-img_0065","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/008-img_0065.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"All-Seeing Crewneck original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-018-img_0367","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/018-img_0367.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Sacred Masters Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-019-img_0368","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/019-img_0368.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Sacred Masters Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-020-img_0369","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/020-img_0369.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Project Star Gate Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-021-img_0370","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/021-img_0370.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Project Star Gate Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-023-img_0620","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/023-img_0620.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Cave Painting Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-026-img_0623","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/026-img_0623.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Adonai 3/4 Sleeve original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-027-img_0624","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/027-img_0624.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Adonai 3/4 Sleeve original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-035-img_0919","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/035-img_0919.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"WANTED: Jesus Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-042-img_1465","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/042-img_1465.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Pari Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-043-img_1466","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/043-img_1466.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Pari Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-044-img_1467","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/044-img_1467.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-055-img_1747","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/055-img_1747.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Rosary Heart Tank original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-056-img_1748","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/056-img_1748.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Horse & Portrait Tank original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-057-img_1749","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/057-img_1749.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Rosary Heart Tank original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-058-img_1830","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/058-img_1830.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Over the Hill Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-059-img_1833","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/059-img_1833.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Over the Hill Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-062-img_2054","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/062-img_2054.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Divine Mother Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-063-img_2174","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/063-img_2174.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-069-img_2308","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/069-img_2308.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"God's Chariot Crop original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-074-img_2335","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/074-img_2335.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Apple Gloves original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-075-img_2848","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/075-img_2848.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-076-img_3178","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/076-img_3178.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Oh Allah Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-077-img_3180","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/077-img_3180.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Oh Allah Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-079-img_3462","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/079-img_3462.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Atlantis Parlour Tank original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-080-img_3463","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/080-img_3463.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Atlantis Parlour Tank original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-081-img_4570","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/081-img_4570.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-082-img_5473","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/082-img_5473.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"007 Angels Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-083-img_5474","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/083-img_5474.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-084-img_5637","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/084-img_5637.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-086-img_6024","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/086-img_6024.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-089-img_6048","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/089-img_6048.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Eternal Thermal original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-092-img_6431","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/092-img_6431.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-093-img_6620","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/093-img_6620.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Eternal Crewneck original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-094-img_6621","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/094-img_6621.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Bulletproof Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-096-img_6626","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/096-img_6626.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Rosary Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-097-img_6627","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/097-img_6627.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Rosary Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-099-img_6651","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/099-img_6651.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-100-img_6652","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/100-img_6652.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-101-img_6653","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/101-img_6653.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-104-img_6806","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/104-img_6806.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"GOD Loves YOU!!! Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-105-img_6807","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/105-img_6807.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-110-photoroom_20251013_215159","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/110-photoroom_20251013_215159.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-111-photoroom_20251014_024644","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/111-photoroom_20251014_024644.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-112-photoroom_20251017_090559","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/112-photoroom_20251017_090559.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Jesus Is My Companion Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-113-photoroom_20251017_090747","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/113-photoroom_20251017_090747.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Spiritual Warfare Tank original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-114-photoroom_20251017_091003","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/114-photoroom_20251017_091003.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Jesus Is My Health Insurance Hoodie original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-116-sw","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/116-sw.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"Break Thy Rule product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-118-warlord-f","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/118-warlord-f.webp","width":1024,"height":1024,"ratio":1.0,"category":"garments","caption":"","alt":"WARLORD Longsleeve original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-dance-to-your-vibration-tee","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/dance-to-your-vibration-tee.webp","width":768,"height":1024,"ratio":1.3333333333333333,"category":"garments","caption":"","alt":"Dance To Your Vibration Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-god-loves-you-tee","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/god-loves-you-tee.webp","width":768,"height":1024,"ratio":1.3333333333333333,"category":"garments","caption":"","alt":"God Loves You Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-war-tee-back","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/war-tee-back.webp","width":1024,"height":768,"ratio":0.75,"category":"garments","caption":"","alt":"WAR / Witnesses Tee original product photograph","source":"Product photography","platform":"archive"},{"id":"original-product-war-tee-front","src":"https://breakthyrule-eden-showroom.netlify.app/products/web/war-tee-front.webp","width":768,"height":1024,"ratio":1.3333333333333333,"category":"garments","caption":"","alt":"WAR / Witnesses Tee original product photograph","source":"Product photography","platform":"archive"}];gallery.items.splice(Math.min(2,gallery.items.length),0,...restoredGarments);}

 // Gallery-only removal requested on 2026-11-14.
 if(/^\/gallery(?:\.html)?\/?$/.test(location.pathname)){gallery.items=gallery.items.filter(item=>item.id!=="original-product-104-img_6806");}
 for(const item of gallery.items)item.src=new URL(item.src,assetOrigin).href;
 const itemsBySrc=new Map(gallery.items.map(item=>[item.src,item]));
 const nativeFetch=window.fetch.bind(window);
 window.fetch=function(input,options){
  const raw=typeof input==='string'||input instanceof URL?input:input?.url;
  const method=options?.method||input?.method||'GET';
  let url;try{url=new URL(raw,location.href);}catch{return nativeFetch(input,options);}
  if(url.origin===location.origin&&url.pathname==='/site/data/gallery.json'&&method.toUpperCase()==='GET'){
   if(options?.signal?.aborted)return Promise.reject(options.signal.reason||new DOMException('Aborted','AbortError'));
   return Promise.resolve(new Response(JSON.stringify(gallery),{status:200,headers:{'Content-Type':'application/json'}}));
  }
  return nativeFetch(input,options);
 };
 function ready(){
  if(document.body.dataset.page==='gallery'){
   const filters=document.getElementById('filters');
   if(filters){
    const updateFilters=()=>{
     const inspiration=[...filters.children].find(button=>button.firstChild?.textContent.toLowerCase()==='inspiration');
     if(inspiration){
      inspiration.firstChild.textContent='Inspiration';
      if(new URLSearchParams(location.search).get('filter')==='inspiration')for(const button of filters.children)button.setAttribute('aria-pressed',String(button===inspiration));
     }
    };
    new MutationObserver(updateFilters).observe(filters,{childList:true});updateFilters();
   }
   // This gallery no longer has a community submission section.
   // Its async page initializer may still try to mount the original board.
   const renderDiscussion=window.siteDiscussion;
   if(typeof renderDiscussion==='function')window.siteDiscussion=function(mount,options){
    if(!mount||options?.key==='gallery')return;
    return renderDiscussion.call(this,mount,options);
   };
   const fitSection=document.getElementById('discussion')?.closest('section');
   if(fitSection){
    const divider=fitSection.previousElementSibling;
    if(divider?.classList.contains('ornament'))divider.remove();
    fitSection.remove();
   }
   const lede=document.querySelector('.page-head .lede');
   if(lede){
    const intro=document.createElement('span');intro.className='rubric';intro.textContent='From the Break Thy Rule archive. ';
    const link=document.createElement('a');link.id='ig-link';link.href='https://www.instagram.com/breakthyrule/';link.target='_blank';link.rel='noopener noreferrer';link.style.textDecoration='underline';link.textContent='Instagram';
    lede.replaceChildren(intro,'Photos from @breakthyrule and the studio archive. Follow along on ',link,'.');
   }
   const image=document.getElementById('lb-img'),link=document.getElementById('lb-product');
   if(image&&link){
    const updateLink=()=>{
     const item=itemsBySrc.get(image.src);if(!item)return;
     link.hidden=!item.postUrl;
     if(item.postUrl){link.href=item.postUrl;link.textContent='View on Instagram ↗';link.target='_blank';link.rel='noopener noreferrer';}
     else{link.removeAttribute('href');link.removeAttribute('target');link.removeAttribute('rel');link.textContent='';}
    };
    new MutationObserver(updateLink).observe(image,{attributes:true,attributeFilter:['src']});
    updateLink();
   }
  }
  const witnessStrip=document.getElementById('witness-strip');
  if(witnessStrip){
   const updateWitnesses=()=>{
    Array.from(witnessStrip.querySelectorAll('img')).forEach((img,index)=>{
     const item=gallery.items[index%gallery.items.length];if(img.src!==item.src)img.src=item.src;img.alt=item.alt;
    });
   };
   new MutationObserver(updateWitnesses).observe(witnessStrip,{childList:true,subtree:true});updateWitnesses();
  }
  const reel=document.getElementById('gallery-reel');
  if(reel){
   const updateReel=()=>{
    const track=reel.querySelector('.reel-track');
    if(track)track.style.animationDuration=String(Math.max(160,160*gallery.items.length/21))+'s';
    const title=reel.querySelector('.reel-head > span');
    if(title&&!title.dataset.instagram){title.dataset.instagram='true';const b=document.createElement('b');b.textContent='The gallery';title.replaceChildren(b,'Instagram and the studio archive');}
    for(const img of reel.querySelectorAll('.reel-track img')){
     const item=itemsBySrc.get(img.src);if(!item)continue;
     img.parentElement.style.aspectRatio=String(1/item.ratio);
     const label=img.parentElement.querySelector('span'),text=item.platform==='instagram'?'@breakthyrule':'Studio archive';if(label&&label.textContent!==text)label.textContent=text;
    }
   };
   new MutationObserver(updateReel).observe(reel,{childList:true,subtree:true});updateReel();
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();

 let collageStarted=false,collageAttempts=0;
 function startCollage(){
  if(collageStarted||document.body?.dataset.page!=='gallery')return;
  if(!document.getElementById('masonry')||!document.getElementById('filters')||!document.getElementById('lightbox')){
   if(collageAttempts++<120)requestAnimationFrame(startCollage);
   return;
  }
  try{if(window.BTRCollage.init(gallery)){collageStarted=true;window.BTRGallerySmoke.init();window.BTRGalleryMotion.init();window.BTRGalleryToolbar.init();}}
  catch(error){console.error('Gallery enhancement could not start.',error);}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startCollage,{once:true});else startCollage();
 window.addEventListener('btr:gallery-ready',startCollage);
 window.addEventListener('load',startCollage,{once:true});
})();
