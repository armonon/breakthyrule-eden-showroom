import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCommunityFeed, publicHttpURL, createCommunityClient } from '../../site/community-feed.mjs';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.value = ''; this.hidden = false; }
  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  focus() { document.activeElement = this; }
  scrollIntoView() {}
  set innerHTML(value) { throw new Error('Conversation content must not use innerHTML'); }
}
const elements = root => [root, ...root.children.filter(child => child instanceof Element).flatMap(elements)];
const text = root => typeof root === 'string' ? root : (root.textContent || '') + root.children.map(text).join('');
const find = (root, predicate) => elements(root).find(predicate);
const byId = (root, id) => find(root, element => element.id === id);
const byClass = (root, name) => find(root, element => element.className?.split(' ').includes(name));
const click = element => element.listeners.click({ preventDefault() {} });
const submit = form => form.listeners.submit({ preventDefault() {} });
function memoryStorage() {
  const data = new Map();
  return { data, getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function fixture(fetchFeed, storage = memoryStorage()) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag), activeElement: null };
  const mount = new Element('div');
  let sequence = 0;
  return { mount, storage, feed: mountCommunityFeed(mount, { fetchFeed, storage, makeRequestId: () => 'request-' + ++sequence }), restore: () => { globalThis.document = previous; } };
}
const post = { id: 'a', name: 'Circle member', body: 'A public conversation.', createdAt: '2026-11-17T14:00:00.000Z', comments: 0 };
const guest = { guest: { name: 'Guest1234' }, csrfToken: 'csrf-example' };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const openButtons = mount => elements(mount).filter(element => element.className?.split(' ').includes('forum-thread-open'));

test('feed is lazy and credential-free; untrusted content becomes text and safe links only', async () => {
  let calls = 0;
  const unsafePost = { ...post, name: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script> https://example.test/story. javascript:alert(1) https://user:secret@example.test/\n' + 'A longer plaintext excerpt. '.repeat(12) };
  const f = fixture(async (url, options) => {
    calls++;
    assert.equal(options.credentials, 'omit');
    return response(url.includes('?post=') ? { post: unsafePost, comments: [] } : { posts: [unsafePost] });
  });
  try {
    assert.equal(calls, 0);
    await Promise.all([f.feed.load(), f.feed.load()]); await f.feed.load();
    assert.equal(calls, 1);
    assert.match(text(f.mount), /<script>alert\(1\)<\/script>/);
    assert.match(text(f.mount), /<img src=x onerror=alert\(1\)>/);
    assert.ok(Array.from(byClass(f.mount, 'forum-topic-title').textContent).length <= 95);
    assert.ok(Array.from(byClass(f.mount, 'forum-topic-excerpt').textContent).length <= 160);
    assert.equal(elements(byClass(f.mount, 'forum-posts')).filter(element => element.tag === 'a').length, 0);
    assert.equal(byClass(byClass(f.mount, 'forum-posts'), 'forum-avatar'), undefined);
    assert.equal(byClass(f.mount, 'forum-posts').attributes['aria-busy'], 'false');
    assert.equal(openButtons(f.mount)[0].tag, 'button');
    await click(openButtons(f.mount)[0]);
    const links = elements(f.mount).filter(element => element.tag === 'a');
    assert.deepEqual(links.map(link => link.href), ['https://example.test/story']);
    assert.ok(links.every(link => link.target === '_blank' && link.rel.includes('noopener')));
    assert.equal(find(f.mount, element => element.tag === 'time').dateTime, post.createdAt);
  } finally { f.restore(); }
});

test('feed retries and failed refresh keeps visible posts; empty success is explicit', async () => {
  let attempt = 0;
  const f = fixture(async () => {
    attempt++;
    if ([1, 3].includes(attempt)) throw new Error('offline');
    return response({ posts: attempt === 2 ? [post] : [] });
  });
  try {
    await f.feed.load();
    const refresh = find(f.mount, element => element.textContent === 'Try again');
    assert.equal(refresh.disabled, false);
    await click(refresh);
    const list = byClass(f.mount, 'forum-posts'), first = list.children[0];
    await click(refresh);
    assert.equal(list.children[0], first); assert.match(text(f.mount), /posts already here are kept/);
    await click(refresh);
    assert.equal(list.children.length, 1); assert.match(text(f.mount), /No public conversations to show yet/);
  } finally { f.restore(); }
});

test('categories filter only loaded records and pagination deduplicates posts', async () => {
  const calls = [];
  const f = fixture(async url => {
    calls.push(url);
    return response(calls.length === 1 ? { posts: [post, { ...post, id: 'b', category: 'art' }], nextCursor: 'next+page=', hasMore: true } : { posts: [post, { ...post, id: 'c', category: 'music' }] });
  });
  try {
    await f.feed.load();
    const music = find(f.mount, element => element.className === 'forum-category' && text(element).includes('Music'));
    await click(music);
    assert.equal(music.attributes['aria-pressed'], 'true');
    assert.match(text(f.mount), /among the posts loaded so far/);
    await click(byClass(f.mount, 'forum-button-more'));
    assert.equal(calls[1], '/api/community/feed?cursor=next%2Bpage%3D');
    assert.equal(byClass(f.mount, 'forum-posts').children.length, 1);
    assert.match(text(byClass(f.mount, 'forum-status')), /1 of 3 loaded conversations/);
    assert.equal(byClass(f.mount, 'forum-button-more').hidden, true);
  } finally { f.restore(); }
});

test('guest session creation is deduplicated and stays on the same origin', async () => {
  const requests = [];
  const client = createCommunityClient({ fetchImpl: async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.credentials, 'same-origin');
    return response(options.method === 'GET' ? { guest: null, csrfToken: null } : guest);
  } });
  const sessions = await Promise.all([client.ensureSession(), client.ensureSession()]);
  assert.equal(sessions[0], sessions[1]);
  assert.deepEqual(requests.map(item => [item.url, item.options.method]), [['/api/community/session', 'GET'], ['/api/community/session', 'POST']]);
  assert.deepEqual(JSON.parse(requests[1].options.body), {});
  await client.ensureSession(); assert.equal(requests.length, 2);
});

test('uncertain post keeps its draft and request ID across remount, then clears only on confirmed publication', async () => {
  const storage = memoryStorage(), writes = [];
  let succeed = false;
  const fetchFeed = async (url, options) => {
    if (url.endsWith('/session')) return response(guest);
    if (url.endsWith('/posts')) {
      writes.push({ body: JSON.parse(options.body), csrf: options.headers['X-CSRF-Token'] });
      return succeed ? response({ post: { ...post, body: writes.at(-1).body.body, category: writes.at(-1).body.category } }, 201) : response({ pending: true }, 202);
    }
    return response({ posts: [] });
  };
  const first = fixture(fetchFeed, storage);
  try {
    const input = byId(first.mount, 'forum-post-compose-text'), select = byId(first.mount, 'forum-post-compose-category');
    input.value = 'My garment idea'; select.value = 'garments';
    await submit(byId(first.mount, 'forum-post-compose'));
    assert.equal(input.value, 'My garment idea');
    assert.match(text(first.mount), /could not confirm publication/);
    assert.equal(writes[0].csrf, guest.csrfToken);
    assert.equal([...storage.data.values()].some(value => value.includes(guest.csrfToken)), false);
  } finally { first.restore(); }
  succeed = true;
  const second = fixture(fetchFeed, storage);
  try {
    const input = byId(second.mount, 'forum-post-compose-text');
    assert.equal(input.value, 'My garment idea');
    await submit(byId(second.mount, 'forum-post-compose'));
    assert.equal(writes[1].body.requestId, writes[0].body.requestId);
    assert.equal(writes[1].body.category, 'garments');
    assert.equal(input.value, '');
    assert.equal(storage.getItem('btr-forum:draft:new'), undefined);
    assert.match(text(second.mount), /Your conversation is published/);
    assert.match(text(byClass(second.mount, 'forum-posts')), /My garment idea/);
  } finally { second.restore(); }
});

test('CSRF rejection renews session on retry while preserving the write ID and draft', async () => {
  let sessions = 0;
  const writes = [];
  const f = fixture(async (url, options) => {
    if (url.endsWith('/session')) return response({ ...guest, csrfToken: 'csrf-' + ++sessions });
    const body = JSON.parse(options.body); writes.push({ body, token: options.headers['X-CSRF-Token'] });
    return writes.length === 1 ? response({ error: 'Guest session expired. Try again.', code: 'csrf_invalid' }, 403) : response({ post: { ...post, body: body.body } }, 201);
  });
  try {
    const input = byId(f.mount, 'forum-post-compose-text'), form = byId(f.mount, 'forum-post-compose');
    input.value = 'A thought'; await submit(form);
    assert.equal(input.value, 'A thought');
    await submit(form);
    assert.equal(writes[0].body.requestId, writes[1].body.requestId);
    assert.notEqual(writes[0].token, writes[1].token);
    assert.equal(input.value, '');
  } finally { f.restore(); }
});

test('thread and replies stay in page; failed reply preserves draft and retry does not duplicate it', async () => {
  const writes = [];
  const f = fixture(async (url, options) => {
    if (url.endsWith('/session')) return response(guest);
    if (url.includes('/feed?post=')) return response({ post, comments: [] });
    if (url.endsWith('/feed')) return response({ posts: [post] });
    const body = JSON.parse(options.body); writes.push(body);
    return writes.length === 1 ? response({ error: 'Please try again.' }, 503) : response({ reply: { ...post, id: 'reply-1', body: body.body } }, 201);
  });
  try {
    await f.feed.load(); await click(openButtons(f.mount)[0]);
    assert.equal(byClass(f.mount, 'forum-feed-view').hidden, true);
    assert.equal(byClass(f.mount, 'forum-thread-view').hidden, false);
    const input = byId(f.mount, 'forum-reply-compose-text'), form = byId(f.mount, 'forum-reply-compose');
    input.value = 'My reply'; await submit(form);
    assert.equal(input.value, 'My reply');
    await submit(form);
    assert.equal(writes[0].postId, post.id); assert.equal(writes[1].requestId, writes[0].requestId);
    assert.equal(input.value, '');
    assert.equal(byClass(f.mount, 'forum-replies').children.length, 1);
    assert.match(text(byClass(f.mount, 'forum-replies')), /My reply/);
    assert.equal(f.storage.getItem('btr-forum:draft:reply:' + post.id), undefined);
    assert.equal(elements(f.mount).filter(element => element.tag === 'a').length, 0);
  } finally { f.restore(); }
});

test('feed links reject scripts, embedded credentials, and relative URLs', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '/private', 'https://name:password@example.test', null]) assert.equal(publicHttpURL(value), null);
  assert.equal(publicHttpURL('http://example.test/read'), 'http://example.test/read');
});

test('a feed read started before publication cannot remove the confirmed new post', async () => {
  let finishRead;
  const f = fixture(async (url, options) => {
    if (url.endsWith('/feed')) return new Promise(resolve => { finishRead = resolve; });
    if (url.endsWith('/session')) return response(guest);
    return response({ post: { ...post, id: 'new', body: JSON.parse(options.body).body } }, 201);
  });
  try {
    const loading = f.feed.load();
    byId(f.mount, 'forum-post-compose-text').value = 'Published during refresh';
    await submit(byId(f.mount, 'forum-post-compose'));
    finishRead(response({ posts: [post] })); await loading;
    assert.match(text(byClass(f.mount, 'forum-posts')), /Published during refresh/);
    assert.equal(byClass(f.mount, 'forum-posts').children.length, 2);
  } finally { f.restore(); }
});

test('a pending reply success preserves a newer draft in a reopened thread', async () => {
  let finishWrite;
  const f = fixture(async (url, options) => {
    if (url.endsWith('/session')) return response(guest);
    if (url.includes('/feed?post=')) return response({ post, comments: [] });
    if (url.endsWith('/feed')) return response({ posts: [post] });
    return new Promise(resolve => { finishWrite = () => resolve(response({ reply: { ...post, id: 'reply-old', body: JSON.parse(options.body).body } }, 201)); });
  });
  try {
    await f.feed.load(); await click(openButtons(f.mount)[0]);
    const firstInput = byId(f.mount, 'forum-reply-compose-text'); firstInput.value = 'First reply';
    const pending = submit(byId(f.mount, 'forum-reply-compose'));
    while (!finishWrite) await new Promise(resolve => setImmediate(resolve));
    await click(find(f.mount, element => element.textContent === '← Back to conversations'));
    await click(openButtons(f.mount)[0]);
    const nextInput = byId(f.mount, 'forum-reply-compose-text'); nextInput.value = 'A newer draft'; nextInput.listeners.input();
    finishWrite(); await pending;
    assert.equal(nextInput.value, 'A newer draft');
    assert.equal(JSON.parse(f.storage.getItem('btr-forum:draft:reply:' + post.id)).body, 'A newer draft');
    assert.match(text(byClass(f.mount, 'forum-replies')), /First reply/);
  } finally { f.restore(); }
});

test('a reply confirmed during a reopened thread load survives the older detail response', async () => {
  let finishWrite, finishDetail, detailReads = 0;
  const f = fixture(async (url, options) => {
    if (url.endsWith('/session')) return response(guest);
    if (url.includes('/feed?post=')) {
      detailReads++;
      if (detailReads === 2) return new Promise(resolve => { finishDetail = resolve; });
      return response({ post: { ...post, comments: detailReads > 2 ? 1 : 0 }, comments: [] });
    }
    if (url.endsWith('/feed')) return response({ posts: [post] });
    return new Promise(resolve => { finishWrite = () => resolve(response({ reply: { ...post, id: 'confirmed', body: JSON.parse(options.body).body } }, 201)); });
  });
  try {
    await f.feed.load(); await click(openButtons(f.mount)[0]);
    byId(f.mount, 'forum-reply-compose-text').value = 'Confirmed while loading';
    const sending = submit(byId(f.mount, 'forum-reply-compose'));
    while (!finishWrite) await new Promise(resolve => setImmediate(resolve));
    await click(find(f.mount, element => element.textContent === '← Back to conversations'));
    const reopening = click(openButtons(f.mount)[0]);
    finishWrite(); await sending;
    finishDetail(response({ post, comments: [] })); await reopening;
    assert.match(text(byClass(f.mount, 'forum-replies')), /Confirmed while loading/);
    assert.match(text(byClass(f.mount, 'forum-posts')), /1 reply/);
    assert.equal(byId(f.mount, 'forum-reply-compose-text').value, '');
    assert.match(text(byId(f.mount, 'forum-reply-compose')), /Posting as Guest1234/);
  } finally { f.restore(); }
});

test('reply pagination appends unique replies in time order and preserves a draft', async () => {
  const calls = [];
  const firstReply = { ...post, id: 'r1', body: 'First reply' };
  const nextReply = { ...post, id: 'r2', body: 'Second reply', createdAt: '2026-11-17T15:00:00.000Z' };
  const f = fixture(async url => {
    calls.push(url);
    if (url.includes('commentCursor=')) return response({ post: { ...post, comments: 4 }, comments: [nextReply, firstReply], nextCommentsCursor: null });
    if (url.includes('/feed?post=')) return response({ post: { ...post, comments: 4 }, comments: [firstReply], nextCommentsCursor: 'more+replies=' });
    return response({ posts: [post] });
  });
  try {
    await f.feed.load(); await click(openButtons(f.mount)[0]);
    const input = byId(f.mount, 'forum-reply-compose-text'); input.value = 'Still drafting'; input.listeners.input();
    await click(byClass(f.mount, 'forum-comments-more'));
    assert.ok(calls.includes('/api/community/feed?post=a&commentCursor=more%2Breplies%3D'));
    const list = byClass(f.mount, 'forum-replies');
    assert.equal(list.children.length, 2);
    assert.match(text(list.children[0]), /First reply/); assert.match(text(list.children[1]), /Second reply/);
    assert.equal(input.value, 'Still drafting');
    assert.equal(byClass(f.mount, 'forum-comments-more').hidden, true);
    assert.match(text(byClass(f.mount, 'forum-posts')), /4 replies/);
  } finally { f.restore(); }
});
