let nextReaderId = 0;

const STYLESHEET_ID = 'museum-reader-stylesheet';
const asText = value => (value == null ? '' : String(value));
const pageNumber = value => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

// Callers supply collection-owned URLs. Never turn data into HTML or accept
// executable schemes, credentials, or protocol-relative external addresses.
function safeURL(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const input = value.trim();
  if (/[\u0000-\u001f\u007f\\]/u.test(input) || input.startsWith('//')) return null;
  try {
    const url = new URL(input, document.baseURI);
    if (url.username || url.password) return null;
    if (url.protocol === 'https:' ||
        (url.protocol === 'http:' && url.origin === window.location.origin)) {
      return url.href;
    }
  } catch { /* An unusable source is shown without an active link. */ }
  return null;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, listener, className = '') {
  const node = element('button', `mr-button ${className}`.trim(), text);
  node.type = 'button';
  node.addEventListener('click', listener);
  return node;
}

function setLink(link, url) {
  const href = safeURL(url);
  link.hidden = !href;
  if (href) link.href = href;
  else link.removeAttribute('href');
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
}

/** Create an independent, native-dialog reader; collection data remains caller-owned. */
export function createMuseumReader({
  onClose = () => {},
  onSeal = id => {},
  onEnter = () => {},
  getSeals = () => [],
  getPages = () => [],
  pdfUrl = '/assets/lost-eden/daily-apple/the-daily-apple.pdf',
} = {}) {
  if (!document.getElementById(STYLESHEET_ID)) {
    const stylesheet = element('link');
    stylesheet.id = STYLESHEET_ID;
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('./museum-reader.css', import.meta.url).href;
    document.head.append(stylesheet);
  }

  const id = `museum-reader-${++nextReaderId}`;
  const events = new AbortController();
  let disposed = false;
  let active = false;
  let opener = null;
  let mode = 'exhibit';
  let exhibit = null;
  let sources = [];
  let sourceIndex = 0;
  let pages = [];
  let currentPage = 1;
  let zoom = 'contain';
  let imageReady = false;
  let imageVersion = 0;
  const pendingSeals = new Set();

  const dialog = element('dialog', 'mr-dialog');
  dialog.id = id;
  dialog.setAttribute('aria-modal', 'true');
  const header = element('header', 'mr-header');
  const heading = element('div', 'mr-heading');
  const kicker = element('p', 'mr-kicker');
  const title = element('h2', 'mr-title');
  title.id = `${id}-title`;
  dialog.setAttribute('aria-labelledby', title.id);
  const closeButton = button('Close ×', close, 'mr-close');
  closeButton.autofocus = true;
  closeButton.setAttribute('aria-label', 'Close reader');
  heading.append(kicker, title);
  header.append(heading, closeButton);

  const body = element('div', 'mr-body');
  const notes = element('aside', 'mr-notes');
  notes.tabIndex = 0;
  notes.setAttribute('aria-label', 'About this exhibit');
  const notesTitle = element('h3', 'mr-section-title', 'About this exhibit');
  const description = element('p', 'mr-description');
  notes.append(notesTitle, description);
  const reader = element('section', 'mr-reader');
  reader.setAttribute('aria-label', 'Source viewer');
  const toolbar = element('nav', 'mr-toolbar');
  toolbar.setAttribute('aria-label', 'Reader controls');
  const navigation = element('div', 'mr-navigation');
  const previous = button('← Previous', () => navigate(-1));
  const next = button('Next →', () => navigate(1));
  const position = element('span', 'mr-position');
  const pagePicker = element('label', 'mr-page-picker');
  const pageLabel = element('span', '', 'Page');
  const pageSelect = element('select', 'mr-select');
  pageSelect.id = `${id}-page`;
  pagePicker.htmlFor = pageSelect.id;
  pageSelect.addEventListener('change', () => renderNewspaper(Number(pageSelect.value)));
  pagePicker.append(pageLabel, pageSelect);
  navigation.append(previous, position, pagePicker, next);
  const zoomControls = element('div', 'mr-zoom-controls');
  zoomControls.setAttribute('role', 'group');
  zoomControls.setAttribute('aria-label', 'Image size');
  const fitButton = button('Fit width', () => setZoom(zoom === 'width' ? 'contain' : 'width'));
  const actualButton = button('Actual size', () => setZoom(zoom === 'actual' ? 'contain' : 'actual'));
  zoomControls.append(fitButton, actualButton);
  toolbar.append(navigation, zoomControls);

  const figure = element('figure', 'mr-figure');
  const frame = element('div', 'mr-image-frame');
  frame.id = `${id}-image`;
  frame.tabIndex = 0;
  frame.setAttribute('role', 'region');
  frame.setAttribute('aria-label', 'Image reading area');
  fitButton.setAttribute('aria-controls', frame.id);
  actualButton.setAttribute('aria-controls', frame.id);
  frame.addEventListener('dblclick', event => {
    if (event.target.tagName === 'IMG' && imageReady) {
      setZoom(zoom === 'actual' ? 'contain' : 'actual');
    }
  });
  const caption = element('figcaption', 'mr-caption');
  const sourceDetails = element('div', 'mr-source-details');
  const sourceLabel = element('p', 'mr-source-label');
  const sourceTitle = element('h3', 'mr-source-title');
  const credit = element('p', 'mr-credit');
  sourceDetails.append(sourceLabel, sourceTitle, credit);
  const links = element('div', 'mr-source-links');
  const original = element('a', 'mr-link', 'Open original ↗');
  original.setAttribute('aria-label', 'Open original source (new tab)');
  const fullPDF = element('a', 'mr-link', 'Open full PDF ↗');
  fullPDF.setAttribute('aria-label', 'Open full newspaper PDF (new tab)');
  links.append(original, fullPDF);
  caption.append(sourceDetails, links);
  figure.append(frame, caption);
  const imageHint = element('p', 'mr-image-hint',
    'Choose Fit width or Actual size, then scroll to read. Double-click an image to toggle actual size.');
  imageHint.id = `${id}-image-hint`;
  frame.setAttribute('aria-describedby', imageHint.id);
  reader.append(toolbar, figure, imageHint);
  body.append(notes, reader);

  const footer = element('footer', 'mr-footer');
  const actions = element('div', 'mr-actions');
  const sealGroup = element('div', 'mr-seal-group');
  const sealClue = element('p', 'mr-seal-clue');
  sealClue.id = `${id}-clue`;
  const sealButton = button('', collectSeal, 'mr-button-primary');
  sealButton.setAttribute('aria-describedby', sealClue.id);
  sealGroup.append(sealClue, sealButton);
  const portalButton = button('', enterPortal, 'mr-button-primary');
  actions.append(sealGroup, portalButton);
  const footerText = element('div', 'mr-footer-text');
  const provenance = element('p', 'mr-provenance',
    'From the Break Thy Rule collection. Original authors and image credits are shown where supplied.');
  provenance.id = `${id}-provenance`;
  dialog.setAttribute('aria-describedby', provenance.id);
  const status = element('p', 'mr-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  footerText.append(provenance, status);
  footer.append(actions, footerText);
  dialog.append(header, body, footer);
  document.body.append(dialog);

  // Preserve the browser's Escape, Tab, select, scrolling, and activation
  // behavior while keeping movement/interaction keys out of game handlers.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('keyup', event => event.stopPropagation());
  dialog.addEventListener('close', () => {
    if (!dialog.open) finishClose();
  });
  dialog.addEventListener('focusin', refreshActions);
  window.addEventListener('focus', () => {
    if (dialog.open) refreshActions();
  }, { signal: events.signal });

  function announce(message) {
    status.textContent = message;
  }

  function seals() {
    const values = getSeals();
    return new Set(Array.isArray(values) ? values : []);
  }

  function refreshActions() {
    const collected = seals();
    const seal = mode === 'exhibit' ? exhibit?.seal : null;
    const hasSeal = seal?.id != null && asText(seal.id) !== '';
    sealGroup.hidden = !hasSeal;
    if (hasSeal) {
      const label = asText(seal.label) || 'seal';
      const hasCollected = collected.has(seal.id);
      const pending = pendingSeals.has(seal.id);
      sealClue.textContent = asText(seal.clue);
      sealClue.hidden = !sealClue.textContent;
      sealButton.textContent = hasCollected ? `Collected: ${label}` :
        pending ? `Collecting ${label}…` : `Collect ${label}`;
      // aria-disabled keeps focus on the button after collection.
      sealButton.setAttribute('aria-disabled', String(hasCollected || pending));
      sealButton.setAttribute('aria-busy', String(pending));
    }
    const hasPortal = mode === 'exhibit' && exhibit?.portal === true;
    portalButton.hidden = !hasPortal;
    portalButton.disabled = collected.size < 3;
    portalButton.textContent = collected.size < 3
      ? `Portal locked · ${collected.size}/3 seals collected`
      : `Enter portal · ${collected.size}/3 seals collected`;
    actions.hidden = !hasSeal && !hasPortal;
  }

  async function collectSeal() {
    const seal = exhibit?.seal;
    if (mode !== 'exhibit' || !seal || seals().has(seal.id) || pendingSeals.has(seal.id)) return;
    pendingSeals.add(seal.id);
    refreshActions();
    try {
      await onSeal(seal.id);
      if (!disposed && dialog.open && mode === 'exhibit' && exhibit?.seal?.id === seal.id) {
        announce(seals().has(seal.id)
          ? `Collected ${asText(seal.label) || 'seal'}.`
          : 'This seal is not collected yet. You can try again.');
      }
    } catch {
      if (!disposed && dialog.open && exhibit?.seal?.id === seal.id) {
        announce('Unable to collect this seal. Please try again.');
      }
    } finally {
      pendingSeals.delete(seal.id);
      if (!disposed) refreshActions();
    }
  }

  function enterPortal() {
    if (mode !== 'exhibit' || !exhibit?.portal) return;
    if (seals().size < 3) {
      refreshActions();
      announce('Collect three seals to enter the portal.');
      return;
    }
    close();
    onEnter();
  }

  function updateZoom() {
    frame.dataset.zoom = zoom;
    fitButton.textContent = zoom === 'width' ? 'Fit full page' : 'Fit width';
    fitButton.setAttribute('aria-pressed', String(zoom === 'width'));
    actualButton.setAttribute('aria-pressed', String(zoom === 'actual'));
    fitButton.disabled = !imageReady;
    actualButton.disabled = !imageReady;
    imageHint.hidden = !imageReady;
  }

  function setZoom(value) {
    if (!imageReady) return;
    zoom = value;
    updateZoom();
    frame.scrollTo(0, 0);
    announce(value === 'contain' ? 'Full image shown.' :
      value === 'width' ? 'Image fits the reading area width. Scroll to read.' :
        'Image shown at actual size. Scroll horizontally and vertically to read.');
  }

  function showImage(file, alt, width, height) {
    const version = ++imageVersion;
    imageReady = false;
    zoom = 'contain';
    updateZoom();
    frame.scrollTo(0, 0);
    const url = safeURL(file);
    const message = element('p', 'mr-image-message', url ? 'Loading source image…' :
      'No image is available for this source. Use the original source link when supplied.');
    frame.replaceChildren(message);
    frame.setAttribute('aria-busy', String(!!url));
    if (!url) return;
    const img = element('img', 'mr-image');
    img.alt = alt;
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.hidden = true;
    if (pageNumber(width)) img.width = Number(width);
    if (pageNumber(height)) img.height = Number(height);
    img.addEventListener('load', () => {
      if (disposed || version !== imageVersion) return;
      imageReady = true;
      img.hidden = false;
      message.hidden = true;
      frame.setAttribute('aria-busy', 'false');
      updateZoom();
    });
    img.addEventListener('error', () => {
      if (disposed || version !== imageVersion) return;
      frame.setAttribute('aria-busy', 'false');
      message.textContent = 'This image could not be loaded. Use the original source link when supplied.';
      announce('Image unavailable. The source information remains below.');
    });
    frame.append(img);
    img.src = url;
  }

  function renderExhibit() {
    const source = sources[sourceIndex];
    const count = sources.length;
    sourceLabel.textContent = source ? [
      `Source ${sourceIndex + 1} of ${count}`,
      asText(source.kind),
      source.page != null ? `Page ${asText(source.page)}` : '',
    ].filter(Boolean).join(' · ') : 'Collection sources';
    sourceTitle.textContent = asText(source?.title) || (source ? 'Untitled source' : 'No sources supplied');
    credit.textContent = source?.credit ? `Credit: ${asText(source.credit)}` : 'Credit not supplied.';
    credit.hidden = !source;
    position.textContent = count ? `${sourceIndex + 1} / ${count}` : '0 / 0';
    position.hidden = false;
    pagePicker.hidden = true;
    previous.disabled = sourceIndex <= 0;
    next.disabled = sourceIndex >= count - 1;
    previous.setAttribute('aria-label', 'Previous source');
    next.setAttribute('aria-label', 'Next source');
    setLink(original, source?.url || source?.image);
    fullPDF.hidden = true;
    showImage(source?.image, `${sourceTitle.textContent}${source?.page != null ? ` — page ${asText(source.page)}` : ''}`);
    announce(source ? `${sourceLabel.textContent}. ${sourceTitle.textContent}.` : 'No sources supplied for this exhibit.');
    refreshActions();
  }

  function readPages() {
    const supplied = getPages();
    const seen = new Set();
    return (Array.isArray(supplied) ? supplied : []).filter(page => {
      const number = pageNumber(page?.page);
      if (!number || seen.has(number)) return false;
      seen.add(number);
      return true;
    }).map(page => ({ ...page, page: Number(page.page) })).sort((a, b) => a.page - b.page);
  }

  function renderNewspaper(requestedPage = currentPage, step = 0) {
    pages = readPages();
    let index = pages.findIndex(page => page.page === requestedPage);
    if (index < 0) index = 0;
    index = Math.max(0, Math.min(pages.length - 1, index + step));
    const page = pages[index];
    currentPage = page?.page ?? requestedPage;
    pageSelect.replaceChildren(...pages.map(item => {
      const option = element('option', '', `${item.page}${item.title ? ` — ${asText(item.title)}` : ''}`);
      option.value = String(item.page);
      return option;
    }));
    pageSelect.value = String(currentPage);
    pageSelect.disabled = !pages.length;
    position.hidden = true;
    pagePicker.hidden = false;
    previous.disabled = !page || index === 0;
    next.disabled = !page || index === pages.length - 1;
    previous.setAttribute('aria-label', 'Previous newspaper page');
    next.setAttribute('aria-label', 'Next newspaper page');
    sourceLabel.textContent = page ? `Newspaper · Page ${page.page} · ${index + 1} of ${pages.length} pages` : 'Newspaper pages';
    sourceTitle.textContent = asText(page?.title) || (page ? `Page ${page.page}` : 'No page images supplied');
    credit.textContent = 'See the supplied page and original PDF for author and publication credits.';
    credit.hidden = false;
    setLink(original, page?.file);
    setLink(fullPDF, pdfUrl);
    showImage(page?.file, page ? `Newspaper page ${page.page}${page.title ? ` — ${asText(page.title)}` : ''}` : '', page?.width, page?.height);
    announce(page ? `${sourceLabel.textContent}. ${sourceTitle.textContent}.` : 'No newspaper page images are available. Use the full PDF link when supplied.');
    refreshActions();
  }

  function navigate(step) {
    if (mode === 'newspaper') renderNewspaper(currentPage, step);
    else {
      sourceIndex = Math.max(0, Math.min(sources.length - 1, sourceIndex + step));
      renderExhibit();
    }
  }

  function show() {
    document.exitPointerLock?.();
    if (!dialog.open) {
      opener = document.activeElement;
      dialog.showModal();
      active = true;
    }
    body.scrollTop = 0;
    closeButton.focus({ preventScroll: true });
  }

  function open(value) {
    if (disposed) return;
    mode = 'exhibit';
    exhibit = value && typeof value === 'object' ? value : {};
    sources = Array.isArray(exhibit.sources) ? exhibit.sources.filter(source => source && typeof source === 'object') : [];
    sourceIndex = 0;
    dialog.dataset.mode = mode;
    kicker.textContent = asText(exhibit.kicker) || 'Museum collection';
    title.textContent = asText(exhibit.title) || 'Exhibit';
    description.textContent = asText(exhibit.description);
    notes.hidden = !description.textContent;
    reader.setAttribute('aria-label', 'Exhibit source viewer');
    renderExhibit();
    show();
  }

  function openNewspaper(page = 1) {
    if (disposed) return;
    mode = 'newspaper';
    exhibit = null;
    dialog.dataset.mode = mode;
    kicker.textContent = 'From the collection';
    title.textContent = 'The Daily Apple';
    notes.hidden = true;
    reader.setAttribute('aria-label', 'Newspaper page viewer');
    renderNewspaper(pageNumber(page) || 1);
    show();
  }

  function finishClose() {
    if (!active) return;
    active = false;
    const returnTo = opener;
    opener = null;
    if (returnTo?.isConnected && typeof returnTo.focus === 'function') {
      returnTo.focus({ preventScroll: true });
    }
    onClose();
  }

  function close() {
    if (dialog.open) dialog.close();
    finishClose();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    ++imageVersion;
    try {
      close();
    } finally {
      events.abort();
      dialog.remove();
      // The singleton stylesheet is shared by all reader instances.
    }
  }

  return { open, openNewspaper, close, dispose, isOpen: () => !disposed && dialog.open };
}
