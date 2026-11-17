const COMMUNITY_URL = 'https://thecreatingco.com/community/network';
const node = (tag, props = {}, ...children) => {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children.flat());
  return element;
};

export function publicHttpURL(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function conversationURL(value) {
  const safe = publicHttpURL(value);
  if (!safe) return COMMUNITY_URL;
  const url = new URL(safe);
  return url.origin === 'https://thecreatingco.com' && url.pathname === '/community/network' ? url.href : COMMUNITY_URL;
}

function postBody(text) {
  const body = node('p', { className: 'community-post-body' });
  let position = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const candidate = match[0].replace(/[.,!?;:)\]}]+$/, '');
    const href = publicHttpURL(candidate);
    if (!href) continue;
    body.append(text.slice(position, match.index), node('a', {
      href, textContent: candidate, target: '_blank', rel: 'noopener noreferrer ugc'
    }));
    position = match.index + candidate.length;
  }
  body.append(text.slice(position));
  return body;
}

function postCard(post) {
  const name = typeof post.name === 'string' && post.name.trim() ? post.name : 'Community member';
  const meta = node('div', { className: 'community-post-meta' }, node('h3', { textContent: name }));
  const date = post.createdAt ? new Date(post.createdAt) : null;
  if (date && Number.isFinite(date.getTime())) meta.append(node('time', {
    dateTime: date.toISOString(), textContent: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }));
  const body = typeof post.body === 'string' && post.body.trim() ? post.body : 'This post has no text. Open The Circle to view it.';
  const count = Number.isSafeInteger(post.comments) && post.comments > 0 ? ` · ${post.comments} ${post.comments === 1 ? 'reply' : 'replies'}` : '';
  const link = node('a', {
    href: conversationURL(post.url), target: '_blank', rel: 'noopener',
    textContent: 'Read conversation' + count + ' ↗',
    ariaLabel: 'Read the conversation by ' + name + ' in The Circle (opens in a new tab)'
  });
  return node('li', {}, node('article', { className: 'community-post' }, meta, postBody(body), node('div', { className: 'community-post-actions' }, link)));
}

export function mountCommunityFeed(mount, { fetchFeed = globalThis.fetch.bind(globalThis) } = {}) {
  const status = node('p', { className: 'community-feed-status', role: 'status', ariaLive: 'polite' });
  const refresh = node('button', { type: 'button', className: 'community-feed-refresh', textContent: 'Refresh posts' });
  const list = node('ol', { className: 'community-feed-posts', ariaLabel: 'Recent public conversations' });
  mount.replaceChildren(node('div', { className: 'community-feed-toolbar' }, status, refresh), list);
  let loaded = false, busy = false, hasPosts = false;

  async function load({ refresh: force = false } = {}) {
    if (busy || loaded && !force) return;
    busy = true;
    refresh.disabled = true;
    mount.setAttribute('aria-busy', 'true');
    status.textContent = hasPosts ? 'Refreshing public conversations…' : 'Loading public conversations…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetchFeed('/api/community/feed', { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (!Array.isArray(data?.posts)) throw new Error('invalid_feed');
      const posts = data.posts.filter(post => post && typeof post === 'object').slice(0, 20);
      list.replaceChildren(...posts.map(postCard));
      hasPosts = posts.length > 0;
      loaded = true;
      refresh.textContent = 'Refresh posts';
      status.textContent = hasPosts ? `${posts.length} recent public ${posts.length === 1 ? 'post' : 'posts'} from The Circle.` : 'No public conversations to show yet. You can start one in The Circle.';
    } catch {
      status.textContent = hasPosts ? 'The latest posts could not be loaded. Showing the posts already here.' : 'The community feed could not be loaded. Try again, or open The Circle above.';
      refresh.textContent = 'Try again';
    } finally {
      clearTimeout(timer);
      busy = false;
      refresh.disabled = false;
      mount.setAttribute('aria-busy', 'false');
    }
  }
  refresh.addEventListener('click', () => load({ refresh: true }));
  return { load };
}
