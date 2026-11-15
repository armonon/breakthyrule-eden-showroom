
/* Sitewide editorial cleanup. Product IDs, URLs, assets and commerce keys are retained. */
(() => {
  'use strict';
  const word = /\bkiss\b/i;
  function cleanCopy(value) {
    if (typeof value !== 'string' || !word.test(value)) return value;
    return value
      .replace(/ — ["“]every kiss begins with K["”] set in cursive above/gi, '')
      .replace(/\s*["“]kiss["”] in cursive at the hem\./gi, '')
      .replace(/Pray for it\. Kiss it\. Both\./gi, 'Pray for it.')
      .replace(/Every Kiss Begins With K Tank/gi, 'Horse & Portrait Tank')
      .replace(/Kiss Rosary Tee/gi, 'Rosary Tee')
      .replace(/\bkiss\b/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([,.!?;:])/g, '$1');
  }

  // Run before the deferred catalog consumers, including the canvas showroom.
  function cleanCatalog(items) {
    if (Array.isArray(items)) for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      for (const key of ['name', 'tagline', 'description', 'imageAlt', 'modelNote']) {
        if (typeof item[key] === 'string') item[key] = cleanCopy(item[key]);
      }
    }
    return items;
  }
  let collection = cleanCatalog(window.showroomCollection);
  const descriptor = Object.getOwnPropertyDescriptor(window, 'showroomCollection');
  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(window, 'showroomCollection', {
      configurable: true, enumerable: true,
      get: () => collection,
      set: value => { collection = cleanCatalog(value); }
    });
  }

  const skip = 'script,style,textarea,pre,code,[contenteditable]:not([contenteditable="false"])';
  const copyAttributes = ['alt', 'title', 'aria-label', 'aria-description', 'placeholder'];
  const photoTooltips = '#masonry figure, #masonry figure img, #gallery-reel .reel-track a, #gallery-reel .reel-track img, #witness-strip .polaroid, #witness-strip .polaroid img, .btr-polaroid, .btr-polaroid img, .btr-grid.photos .btr-tile, .btr-grid.photos .btr-tile img, #showcase .showcase-plate, #showcase .showcase-plate img';
  function setChangedAttribute(node, name, value) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function cleanElement(node) {
    if (node.closest(skip)) return;
    for (const attr of copyAttributes) {
      if (node.hasAttribute(attr)) setChangedAttribute(node, attr, cleanCopy(node.getAttribute(attr)));
    }
    if (node.matches(photoTooltips)) node.removeAttribute('title');
    if (node.matches('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]')) {
      if (node.hasAttribute('content')) setChangedAttribute(node, 'content', cleanCopy(node.getAttribute('content')));
    }
  }
  function cleanTree(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (root.parentElement && !root.parentElement.closest(skip)) {
        const copy = cleanCopy(root.data);
        if (copy !== root.data) root.data = copy;
      }
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(skip)) return;
    cleanElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.nodeType === Node.ELEMENT_NODE && node.matches(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.ELEMENT_NODE) cleanElement(node);
      else {
        const copy = cleanCopy(node.data);
        if (copy !== node.data) node.data = copy;
      }
    }
  }
  function updateViewers() {
    const gallery = document.getElementById('lightbox');
    if (gallery?.hasAttribute('aria-labelledby') && document.getElementById('lb-caption')) {
      gallery.removeAttribute('aria-labelledby');
      setChangedAttribute(gallery, 'aria-label', 'Gallery photograph');
    }
    const caption = document.querySelector('#btr-lightbox .btr-lb-caption');
    if (caption) {
      const isPhoto = /\/\s*(PHOTO|GALLERY)\s*$/.test(caption.querySelector('small')?.textContent || '');
      if (caption.hasAttribute('data-btr-photo-caption') !== isPhoto) caption.toggleAttribute('data-btr-photo-caption', isPhoto);
    }
    const poster = document.getElementById('poster-dialog');
    const navigation = document.getElementById('poster-navigation');
    if (poster && navigation) {
      if (!navigation.hidden) {
        poster.removeAttribute('aria-labelledby');
        setChangedAttribute(poster, 'aria-label', 'Gallery photograph');
      } else {
        poster.removeAttribute('aria-label');
        setChangedAttribute(poster, 'aria-labelledby', 'poster-title');
      }
    }
  }
  cleanTree(document.documentElement);
  updateViewers();
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) cleanTree(node);
      else if (record.type === 'characterData') cleanTree(record.target);
      else if (record.type === 'attributes') cleanElement(record.target);
    }
    updateViewers();
  }).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: [...copyAttributes, 'content', 'hidden']
  });
})();
