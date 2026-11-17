/* One About-style navigation bar. Keep page controls and existing cart listeners intact. */
(() => {
  'use strict';
  function mount() {
    if (document.getElementById('btr-site-header')) return;
    const page = location.pathname.replace(/\/$/, '').split('/').pop().replace(/\.html$/, '') || 'index';
    document.body.dataset.sharedPage = page;
    const create = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    let header = document.querySelector('body > .site-top, body > .site-header');
    if (!header) {
      // .site-top is deliberately absent: the Codex uses it to detect site mode.
      header = create('header');
      document.body.prepend(header);
    }
    header.id = 'btr-site-header';
    header.classList.add('btr-about-header');
    header.dataset.sharedHeader = 'about';

    const worldActions = header.querySelector('.header-actions');
    if (worldActions) {
      const tools = create('div', 'btr-world-tools');
      tools.setAttribute('role', 'toolbar');
      tools.setAttribute('aria-label', 'Eden controls');
      tools.append(worldActions);
      header.after(tools);
    }
    header.querySelector('.header-label')?.remove();

    let brand = header.querySelector('.brand, .wordmark');
    if (!brand) { brand = create('a', 'brand'); header.prepend(brand); }
    brand.classList.add('brand');
    brand.href = '/?cover';
    brand.setAttribute('aria-label', 'Break Thy Rule — open Codex');
    brand.classList.add('btr-logo-brand', 'btr-logo-night');
    const logo = create('img', 'btr-brand-logo');
    logo.src = '/assets/brand/logo-night.svg?v=1';
    logo.alt = 'BreakThyRule, anonymous archive';
    logo.width = 1400; logo.height = 381;
    logo.decoding = 'async'; logo.fetchPriority = 'high';
    brand.replaceChildren(logo);

    let nav = header.querySelector('.tabs');
    if (!nav) { nav = create('nav', 'tabs'); brand.after(nav); }
    nav.setAttribute('aria-label', 'Main');
    const active = ['index', 'product', 'random-shirt', 'mystery-box', 'core', 'belts', 'accessories', 'reliquary', 'passport'].includes(page)
      ? 'products' : page.startsWith('lab') ? 'lab' : page;
    const links = [['/?nocover=1', 'Products'], ['/gallery', 'Gallery'], ['/archive', 'Archive'], ['/about', 'About']];
    for (const link of nav.querySelectorAll('a')) {
      const target = new URL(link.href, location.href);
      if (/^\/(?:lab|account)(?:\.html)?\/?$/.test(target.pathname) || link.textContent.trim().toLowerCase() === 'forum' || (/^\/archive(?:\.html)?\/?$/.test(target.pathname) && /^#forum(?:\/|$)/.test(target.hash))) link.remove();
    }
    const oldLinks = Array.from(nav.querySelectorAll('a'));
    for (const [href, label] of links) {
      let link = oldLinks.find(node => node.textContent.trim().toLowerCase() === label.toLowerCase());
      if (!link) link = create('a');
      link.href = href;
      link.textContent = label;
      link.removeAttribute('aria-current');
      if (active === label.toLowerCase()) link.setAttribute('aria-current', 'page');
      nav.append(link);
    }
    let eden = header.querySelector('.enter-showroom');
    if (!eden) { eden = create('a', 'enter-showroom'); header.append(eden); }
    eden.href = '/showroom';
    eden.classList.add('btr-eden-apple');
    eden.setAttribute('aria-label', 'Enter Eden showroom');
    eden.title = 'Enter Eden';
    const apple = create('img', 'btr-eden-apple-logo');
    apple.src = '/site/eden-apple-red-bitmap.png';
    apple.alt = '';
    apple.width = 40;
    apple.height = 42;
    apple.decoding = 'async';
    apple.draggable = false;
    eden.replaceChildren(apple);
    if (!document.getElementById('btr-eden-apple-style')) {
      const appleStyle = create('link');
      appleStyle.id = 'btr-eden-apple-style';
      appleStyle.rel = 'stylesheet';
      appleStyle.href = '/site/eden-apple.css?v=6c160db8a4e6e5c2';
      document.head.append(appleStyle);
    }

    if (!header.querySelector('.cart-button')) {
      const cartLink = create('a', 'cart-button');
      const count = create('span', 'cart-count', '0');
      cartLink.href = '/lab?cart=1';
      cartLink.setAttribute('aria-label', 'Open your cart');
      cartLink.append(create('span', '', 'Cart'), count);
      eden.before(cartLink);
      // Standalone worlds use the same cart, without importing a second drawer into their apps.
      import('/site/cart-store.mjs?v=site-audit-1').then(({ cart }) => {
        const render = () => { count.textContent = String(cart.items().reduce((total, item) => total + item.quantity, 0)); };
        cart.subscribe(render);
        render();
      }).catch(() => {});
    }
    let previousHeight;
    const setHeight = () => {
      const height = header.getBoundingClientRect().height;
      if (height === previousHeight) return;
      previousHeight = height;
      document.body.style.setProperty('--btr-header-height', `${height}px`);
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    };
    setHeight();
    if ('ResizeObserver' in window) new ResizeObserver(setHeight).observe(header);
    if (page === 'lab' && new URLSearchParams(location.search).get('cart') === '1') {
      document.dispatchEvent(new CustomEvent('lab:open-cart'));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
