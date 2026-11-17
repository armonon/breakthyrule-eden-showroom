const API = '/api/community';
const MAX_BODY = 2000;
export const COMMUNITY_CATEGORIES = Object.freeze([
  { id: 'all', label: 'All conversations', icon: '◌' },
  { id: 'general', label: 'General', icon: '↳' },
  { id: 'garments', label: 'Garments & style', icon: '◇' },
  { id: 'art', label: 'Art & process', icon: '✳' },
  { id: 'music', label: 'Music', icon: '≋' },
  { id: 'reading', label: 'Reading room', icon: '▤' }
]);
const categoryFor = value => COMMUNITY_CATEGORIES.find(category => category.id === value && value !== 'all') || COMMUNITY_CATEGORIES[1];
const node = (tag, props = {}, ...children) => {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children.flat().filter(child => child != null));
  return element;
};
const action = (label, className = 'forum-button') => node('button', { type: 'button', className, textContent: label });

export function publicHttpURL(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function postBody(text) {
  const body = node('p', { className: 'forum-post-body' });
  let position = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const candidate = match[0].replace(/[.,!?;:)\]}]+$/, '');
    const href = publicHttpURL(candidate);
    if (!href) continue;
    body.append(text.slice(position, match.index), node('a', { href, textContent: candidate, target: '_blank', rel: 'noopener noreferrer ugc' }));
    position = match.index + candidate.length;
  }
  body.append(text.slice(position));
  return body;
}
const validItem = item => item && typeof item === 'object' && typeof item.id === 'string' && item.id.length > 0 && typeof item.body === 'string';
const memberName = item => typeof item.name === 'string' && item.name.trim() ? item.name : 'Community member';
function postMeta(item) {
  const name = memberName(item);
  const identity = node('div', { className: 'forum-person' }, node('span', { className: 'forum-avatar', textContent: name.slice(0, 1).toUpperCase(), ariaHidden: 'true' }), node('strong', { textContent: name }));
  const date = item.createdAt ? new Date(item.createdAt) : null;
  if (date && Number.isFinite(date.getTime())) identity.append(node('time', { dateTime: date.toISOString(), textContent: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }));
  return identity;
}

export function createCommunityClient({ fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  let session = null, sessionRequest = null;
  async function request(path, { method = 'GET', body, csrfToken } = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetchImpl(API + path, {
        method, cache: 'no-store', redirect: 'error', credentials: path.startsWith('/feed') ? 'omit' : 'same-origin', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(typeof data.error === 'string' ? data.error.slice(0, 350) : 'The conversation could not be reached. Please try again.');
        error.code = data.code; error.status = response.status;
        if ([401, 403].includes(response.status)) session = null;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.status) throw error;
      throw new Error('We could not confirm the request. Your draft is kept; try again in a moment.');
    } finally { clearTimeout(timer); }
  }
  async function ensureSession() {
    if (session) return session;
    if (sessionRequest) return sessionRequest;
    sessionRequest = (async () => {
      let value = await request('/session');
      if (!value?.guest) value = await request('/session', { method: 'POST', body: {} });
      if (typeof value?.guest?.name !== 'string' || typeof value.csrfToken !== 'string' || !value.csrfToken) throw new Error('Your guest identity could not be prepared. Please try again.');
      session = value;
      return value;
    })();
    try { return await sessionRequest; } finally { sessionRequest = null; }
  }
  return { request, ensureSession };
}

function draftStorage() { try { return globalThis.sessionStorage; } catch { return null; } }
function readDraft(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) || 'null');
    if (value && typeof value.body === 'string') return { body: value.body.slice(0, MAX_BODY), category: categoryFor(value.category).id, requestId: typeof value.requestId === 'string' ? value.requestId : '', signature: typeof value.signature === 'string' ? value.signature : '' };
  } catch {}
  return { body: '', category: 'general', requestId: '', signature: '' };
}
function saveDraft(storage, key, draft) { try { storage?.setItem(key, JSON.stringify(draft)); } catch {} }
function clearDraft(storage, key) { try { storage?.removeItem(key); } catch {} }

export function mountCommunityFeed(mount, { fetchFeed = globalThis.fetch.bind(globalThis), storage = draftStorage(), makeRequestId = () => globalThis.crypto.randomUUID() } = {}) {
  const client = createCommunityClient({ fetchImpl: fetchFeed });
  let posts = [], loaded = false, busy = false, nextCursor = null, hasMore = false, category = 'all', changesDuringLoad = null;
  let threadId = null, threadGeneration = 0, threadOpener = null, threadPost = null, replies = [], replyComposer = null, knownGuestName = '';
  let commentsCursor = null, commentsBusy = false;
  const confirmedReplies = new Map();
  const categoryButtons = new Map();
  const sidebar = node('aside', { className: 'forum-category-sidebar', ariaLabel: 'Conversation categories' });
  const categories = node('nav', { className: 'forum-categories', ariaLabel: 'Filter conversations' });
  const heading = node('h2', { id: 'forum-feed-heading', tabIndex: -1, textContent: 'All conversations' });
  const feedStatus = node('p', { className: 'forum-status', role: 'status', ariaLive: 'polite' });
  const refresh = action('Refresh', 'forum-button forum-button-quiet');
  const start = action('+ Start a conversation', 'forum-button forum-button-primary');
  const feedList = node('ol', { className: 'forum-posts', id: 'forum-conversations', ariaLabel: 'Public conversations' });
  const more = action('Load more conversations', 'forum-button forum-button-more'); more.hidden = true;
  const feedView = node('section', { className: 'forum-feed-view', ariaLabel: 'Conversation list' });
  const threadTitle = node('h2', { tabIndex: -1, textContent: 'Conversation' });
  const threadStatus = node('p', { className: 'forum-status', role: 'status', ariaLive: 'polite' });
  const threadBack = action('← Back to conversations', 'forum-button forum-button-quiet');
  const threadRetry = action('Try again', 'forum-button forum-button-quiet'); threadRetry.hidden = true;
  const threadContent = node('div', { className: 'forum-thread-content' });
  const commentsMore = action('Load more replies', 'forum-button forum-button-more forum-comments-more'); commentsMore.hidden = true;
  const commentsStatus = node('p', { className: 'forum-status', role: 'status', ariaLive: 'polite' });
  const threadView = node('section', { className: 'forum-thread-view', hidden: true, ariaLabel: 'Selected conversation' }, threadBack, node('div', { className: 'forum-thread-heading' }, threadTitle), threadStatus, threadRetry, threadContent);
  const composer = createComposer('post', null, onPost);
  composer.form.hidden = true;
  const closeComposer = action('Keep draft & close', 'forum-button forum-button-quiet');
  closeComposer.addEventListener('click', () => { composer.form.hidden = true; start.setAttribute('aria-expanded', 'false'); start.focus(); });
  composer.tools.prepend(closeComposer);
  const toolbar = node('div', { className: 'forum-toolbar' }, node('div', {}, node('p', { className: 'forum-eyebrow', textContent: 'THE CONVERSATIONS' }), heading), node('div', { className: 'forum-toolbar-actions' }, refresh, start));
  feedView.append(toolbar, composer.form, feedStatus, feedList, more);
  const main = node('div', { className: 'forum-main' }, feedView, threadView);
  for (const item of COMMUNITY_CATEGORIES) {
    const button = node('button', { type: 'button', className: 'forum-category' }, node('span', { className: 'forum-category-icon', textContent: item.icon, ariaHidden: 'true' }), node('span', { textContent: item.label }));
    button.setAttribute('aria-pressed', String(item.id === category)); button.setAttribute('aria-controls', 'forum-conversations');
    button.addEventListener('click', () => { category = item.id; closeThread(false); renderFeed(); });
    categoryButtons.set(item.id, button); categories.append(button);
  }
  sidebar.append(node('p', { className: 'forum-eyebrow', textContent: 'FIND YOUR CORNER' }), categories,
    node('div', { className: 'forum-sidebar-note' }, node('span', { className: 'forum-sidebar-mark', textContent: '✳', ariaHidden: 'true' }), node('p', { textContent: 'A place for the things you make, find, wear, and wonder about.' }), node('small', { textContent: 'Public conversations, connected to The Circle / CreatingCo.' })));
  mount.className = 'btr-forum-workspace';
  mount.replaceChildren(sidebar, main);
  mount.setAttribute('aria-busy', 'false');
  start.setAttribute('aria-controls', 'forum-post-compose'); start.setAttribute('aria-expanded', 'false');
  start.addEventListener('click', () => {
    composer.form.hidden = false; start.setAttribute('aria-expanded', 'true');
    if (!composer.textarea.value.trim() && category !== 'all') composer.select.value = category;
    composer.textarea.focus(); composer.form.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  });
  refresh.addEventListener('click', () => load({ refresh: true }));
  more.addEventListener('click', () => load({ more: true }));
  threadBack.addEventListener('click', () => closeThread(true));
  threadRetry.addEventListener('click', () => { if (threadId) openThread(threadId, threadOpener); });
  commentsMore.addEventListener('click', loadMoreReplies);

  function createComposer(kind, postId, onSuccess) {
    const key = 'btr-forum:draft:' + (kind === 'post' ? 'new' : 'reply:' + postId);
    let draft = readDraft(storage, key), sending = false;
    const id = kind === 'post' ? 'forum-post-compose' : 'forum-reply-compose';
    const textarea = node('textarea', { id: id + '-text', name: 'body', value: draft.body, maxLength: MAX_BODY, required: true, rows: kind === 'post' ? 4 : 3, placeholder: kind === 'post' ? 'An idea, a question, a work in progress…' : 'Add your thought to the conversation…' });
    const select = node('select', { id: id + '-category', name: 'category' }, COMMUNITY_CATEGORIES.filter(item => item.id !== 'all').map(item => node('option', { value: item.id, textContent: item.label, selected: item.id === draft.category })));
    select.value = draft.category;
    const identity = node('p', { className: 'forum-guest-identity', textContent: knownGuestName ? 'Posting as ' + knownGuestName : 'Posting as a guest · no account needed' });
    const count = node('span', { className: 'forum-character-count', textContent: textarea.value.length + ' / ' + MAX_BODY });
    const help = node('p', { className: 'forum-compose-help', id: id + '-help', textContent: 'Text conversations are public and shared with The Circle. Your draft is kept until you publish.' });
    textarea.setAttribute('aria-describedby', help.id);
    const status = node('p', { className: 'forum-compose-status', role: 'status', ariaLive: 'polite' });
    const submit = node('button', { type: 'submit', className: 'forum-button forum-button-primary', textContent: kind === 'post' ? 'Publish conversation' : 'Publish reply' });
    const tools = node('div', { className: 'forum-compose-tools' }, count, submit);
    const form = node('form', { className: 'forum-composer', id, noValidate: true },
      node('div', { className: 'forum-compose-heading' }, node('h3', { textContent: kind === 'post' ? 'Put a thought on the table.' : 'Keep it going.' }), identity),
      kind === 'post' ? node('label', { className: 'forum-compose-category' }, node('span', { textContent: 'Choose a corner' }), select) : null,
      node('label', { className: 'forum-compose-body' }, node('span', { textContent: kind === 'post' ? 'Your conversation' : 'Your reply' }), textarea), help, status, tools);
    const persist = () => {
      draft.body = textarea.value; draft.category = select.value;
      saveDraft(storage, key, draft);
      count.textContent = textarea.value.length + ' / ' + MAX_BODY;
    };
    textarea.addEventListener('input', persist); select.addEventListener('change', persist);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (sending) return;
      const body = textarea.value.trim();
      if (!body || body.length > MAX_BODY) { status.textContent = 'Write between 1 and 2,000 characters.'; textarea.focus(); return; }
      const payload = kind === 'post' ? { body, category: categoryFor(select.value).id } : { body, postId };
      const signature = JSON.stringify(payload);
      if (!draft.requestId || draft.signature !== signature) { draft.requestId = makeRequestId(); draft.signature = signature; }
      persist();
      sending = true; textarea.readOnly = true; select.disabled = true; submit.disabled = true; form.setAttribute('aria-busy', 'true');
      status.textContent = 'Preparing your guest identity…'; submit.textContent = 'Publishing…';
      try {
        const session = await client.ensureSession();
        knownGuestName = session.guest.name;
        identity.textContent = 'Posting as ' + session.guest.name;
        composer.identity.textContent = identity.textContent;
        if (replyComposer) replyComposer.identity.textContent = identity.textContent;
        status.textContent = 'Publishing your ' + (kind === 'post' ? 'conversation' : 'reply') + '…';
        const data = await client.request(kind === 'post' ? '/posts' : '/replies', { method: 'POST', csrfToken: session.csrfToken, body: { ...payload, requestId: draft.requestId } });
        const item = kind === 'post' ? data.post : data.reply;
        if (!validItem(item)) throw new Error('We could not confirm publication. Your draft is kept; try again in a moment.');
        // A reply form can be reopened while an earlier request is pending. Keep
        // a newer draft in that form instead of deleting it with the old success.
        const latest = readDraft(storage, key);
        if (latest.requestId === draft.requestId && latest.body.trim() === body && (kind !== 'post' || latest.category === payload.category)) clearDraft(storage, key);
        draft = { body: '', category: select.value, requestId: '', signature: '' }; textarea.value = ''; count.textContent = '0 / ' + MAX_BODY;
        status.textContent = kind === 'post' ? 'Your conversation is published.' : 'Your reply is published.';
        onSuccess(item, payload);
      } catch (error) {
        status.textContent = error.message || 'Your message could not be published. Your draft is kept; please try again.';
      } finally {
        sending = false; textarea.readOnly = false; select.disabled = false; submit.disabled = false; form.setAttribute('aria-busy', 'false');
        submit.textContent = kind === 'post' ? 'Publish conversation' : 'Publish reply';
      }
    });
    return { form, textarea, select, tools, identity };
  }

  function card(post, full = false) {
    const itemCategory = categoryFor(post.category);
    const body = post.body.trim() ? post.body : 'This post has no text.';
    const article = node('article', { className: 'forum-post' }, node('div', { className: 'forum-post-header' }, postMeta(post), node('span', { className: 'forum-category-tag', textContent: itemCategory.label })), postBody(!full && body.length > 520 ? body.slice(0, 520) + '…' : body));
    if (!full) {
      const count = Number.isSafeInteger(post.comments) && post.comments > 0 ? `${post.comments} ${post.comments === 1 ? 'reply' : 'replies'}` : 'Be the first to reply';
      const open = action('Open conversation →', 'forum-button forum-thread-open');
      open.setAttribute('aria-label', 'Open the conversation by ' + memberName(post));
      open.addEventListener('click', () => openThread(post.id, open));
      article.append(node('div', { className: 'forum-post-footer' }, node('span', { textContent: count }), open));
    }
    return article;
  }
  function renderFeed() {
    for (const [id, button] of categoryButtons) button.setAttribute('aria-pressed', String(id === category));
    heading.textContent = COMMUNITY_CATEGORIES.find(item => item.id === category).label;
    const shown = posts.filter(post => category === 'all' || categoryFor(post.category).id === category);
    feedList.replaceChildren(...shown.map(post => node('li', {}, card(post))));
    if (!shown.length && loaded) feedList.append(node('li', { className: 'forum-empty' }, node('span', { textContent: '↳', ariaHidden: 'true' }), node('h3', { textContent: posts.length ? 'A little room for your idea.' : 'The table is open.' }), node('p', { textContent: posts.length ? 'No conversations in this corner among the posts loaded so far. Start one' + (nextCursor ? ', or load more below.' : '.') : 'No public conversations to show yet. Start one above.' })));
    more.hidden = !nextCursor;
    if (!busy) feedStatus.textContent = loaded ? `${shown.length} of ${posts.length} loaded conversations` + (hasMore || nextCursor ? ' · more to explore' : '') + '.' : 'Choose a corner, or start with everything.';
  }
  async function load({ refresh: force = false, more: append = false } = {}) {
    if (busy || append && !nextCursor || loaded && !force && !append) return;
    busy = true; changesDuringLoad = new Map(); refresh.disabled = true; more.disabled = true; feedList.setAttribute('aria-busy', 'true');
    feedStatus.textContent = append ? 'Loading more conversations…' : posts.length ? 'Refreshing conversations…' : 'Loading public conversations…';
    try {
      const data = await client.request('/feed' + (append ? '?cursor=' + encodeURIComponent(nextCursor) : ''));
      if (!Array.isArray(data?.posts)) throw new Error('Invalid feed');
      const received = data.posts.filter(validItem).slice(0, 20);
      // A read begun before publication must not hide the newly confirmed post.
      posts = [...new Map([...changesDuringLoad.values(), ...(append ? posts : []), ...received.filter(post => !changesDuringLoad.has(post.id))].map(post => [post.id, post])).values()];
      loaded = true; hasMore = data.hasMore === true; nextCursor = typeof data.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null;
      refresh.textContent = 'Refresh'; renderFeed();
      feedStatus.textContent = `${posts.filter(post => category === 'all' || categoryFor(post.category).id === category).length} of ${posts.length} loaded conversations` + (hasMore || nextCursor ? ' · more to explore' : '') + '.';
    } catch {
      feedStatus.textContent = posts.length ? 'The latest conversations could not be loaded. The posts already here are kept.' : 'The conversations could not be loaded. Please try again.';
      refresh.textContent = 'Try again';
    } finally { busy = false; changesDuringLoad = null; refresh.disabled = false; more.disabled = false; feedList.setAttribute('aria-busy', 'false'); }
  }
  function closeThread(focus) {
    threadGeneration++; threadId = null; threadPost = null; replyComposer = null;
    threadView.hidden = true; feedView.hidden = false;
    if (focus) { (threadOpener?.isConnected ? threadOpener : heading).focus(); }
  }
  function renderReplies() {
    const list = node('ol', { className: 'forum-replies', ariaLabel: 'Conversation replies' });
    const byId = new Map(replies.map(reply => [reply.id, reply]));
    for (const reply of replies) {
      const parent = reply.parent && byId.get(reply.parent);
      list.append(node('li', { className: 'forum-reply' }, postMeta(reply), parent ? node('p', { className: 'forum-reply-context', textContent: 'In reply to ' + memberName(parent) }) : null, postBody(reply.body)));
    }
    if (!replies.length) list.append(node('li', { className: 'forum-replies-empty', textContent: 'No replies yet. Bring your perspective.' }));
    return list;
  }
  function renderThreadContent() {
    commentsMore.hidden = !commentsCursor;
    threadContent.replaceChildren(card(threadPost, true), node('div', { className: 'forum-replies-heading' }, node('h3', { textContent: 'The conversation' }), node('span', { textContent: replies.length + ' loaded ' + (replies.length === 1 ? 'reply' : 'replies') })), renderReplies(), commentsMore, commentsStatus, replyComposer.form);
  }
  function mergeReplies(id, previous, received) {
    const confirmed = confirmedReplies.get(id) || new Map();
    const merged = [...new Map([...previous, ...received, ...confirmed.values()].map(reply => [reply.id, reply])).values()];
    for (const reply of received) confirmed.delete(reply.id);
    if (!confirmed.size) confirmedReplies.delete(id);
    return merged.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
  }
  function updatePostCount(post) {
    if (!Number.isSafeInteger(post.comments) || post.comments < 0) return;
    const count = Math.max(post.comments, threadPost?.id === post.id ? replies.length : 0, confirmedReplies.get(post.id)?.size || 0);
    const inFeed = posts.find(item => item.id === post.id);
    if (inFeed) { inFeed.comments = count; changesDuringLoad?.set(post.id, inFeed); renderFeed(); }
    if (threadPost?.id === post.id) threadPost.comments = count;
  }
  async function loadMoreReplies() {
    if (commentsBusy || !commentsCursor || !threadId) return;
    const id = threadId, generation = threadGeneration;
    commentsBusy = true; commentsMore.disabled = true; commentsStatus.textContent = 'Loading more replies…';
    try {
      const data = await client.request('/feed?post=' + encodeURIComponent(id) + '&commentCursor=' + encodeURIComponent(commentsCursor));
      if (generation !== threadGeneration) return;
      if (!validItem(data.post) || data.post.id !== id || !Array.isArray(data.comments)) throw new Error('More replies could not be loaded. Please try again.');
      replies = mergeReplies(id, replies, data.comments.filter(validItem));
      commentsCursor = typeof data.nextCommentsCursor === 'string' && data.nextCommentsCursor ? data.nextCommentsCursor : null;
      updatePostCount(data.post); renderThreadContent(); commentsStatus.textContent = 'More replies loaded.';
    } catch (error) { if (generation === threadGeneration) commentsStatus.textContent = error.message; }
    finally { if (generation === threadGeneration) { commentsBusy = false; commentsMore.disabled = false; } }
  }
  async function openThread(id, opener) {
    const generation = ++threadGeneration;
    threadId = id; threadOpener = opener; threadPost = null; replyComposer = null;
    commentsCursor = null; commentsBusy = false; commentsMore.disabled = false; commentsStatus.textContent = '';
    feedView.hidden = true; threadView.hidden = false; threadRetry.hidden = true; threadContent.replaceChildren();
    threadStatus.textContent = 'Loading this conversation…'; threadContent.setAttribute('aria-busy', 'true');
    threadTitle.focus({ preventScroll: true }); threadView.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    try {
      const data = await client.request('/feed?post=' + encodeURIComponent(id));
      if (generation !== threadGeneration) return;
      if (!validItem(data.post) || data.post.id !== id || !Array.isArray(data.comments)) throw new Error('This conversation could not be loaded. Please try again.');
      threadPost = data.post; replies = mergeReplies(id, [], data.comments.filter(validItem));
      commentsCursor = typeof data.nextCommentsCursor === 'string' && data.nextCommentsCursor ? data.nextCommentsCursor : null;
      updatePostCount(data.post);
      replyComposer = createComposer('reply', id, reply => {
        if (!confirmedReplies.has(id)) confirmedReplies.set(id, new Map());
        confirmedReplies.get(id).set(reply.id, reply);
        if (threadId === id && threadPost && replyComposer) {
          replies = mergeReplies(id, replies, []);
          renderThreadContent(); threadStatus.textContent = 'Your reply is published.';
        }
        // Reconcile the real total after a write; loaded replies may be only one page.
        client.request('/feed?post=' + encodeURIComponent(id)).then(fresh => {
          if (validItem(fresh.post) && fresh.post.id === id) updatePostCount(fresh.post);
        }).catch(() => {});
      });
      renderThreadContent(); threadStatus.textContent = commentsCursor ? 'More replies are available below.' : 'Read, reply, and stay awhile. No account needed.';
    } catch (error) {
      if (generation !== threadGeneration) return;
      threadStatus.textContent = error.message; threadRetry.hidden = false;
    } finally { if (generation === threadGeneration) threadContent.setAttribute('aria-busy', 'false'); }
  }
  function onPost(post, payload) {
    posts = [post, ...posts.filter(item => item.id !== post.id)]; loaded = true;
    changesDuringLoad?.set(post.id, post); closeThread(false);
    category = payload.category; composer.form.hidden = true; start.setAttribute('aria-expanded', 'false');
    renderFeed(); feedStatus.textContent = 'Your conversation is published.'; heading.focus({ preventScroll: true });
  }
  renderFeed();
  return { load };
}
