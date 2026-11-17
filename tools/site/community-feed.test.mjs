import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityHandler } from '../../netlify/functions/community.mjs';

const id = 'f2b376d4-4a60-49d6-ab2d-ae2152cba17b';
const commentId = 'ee63b634-6bc5-4e02-ae5a-11cea722b3ea';
const published = (extra = {}) => ({ id, body: 'A public conversation', visibility: 'public', status: 'published', name: 'Creator', handle: 'creator', created: 1793929359893, comments: 3, likes: 2, ...extra });
const upstream = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const request = (query = '', options = {}) => new Request('https://shop.example.test/api/community/feed' + query, options);

test('public feed never forwards credentials and exposes only presentation fields', async () => {
  const calls = [];
  const handle = createCommunityHandler({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return upstream({ posts: [published({ author: 'internal-identity', email: 'private@example.test', own: true, saved: true,
      social: { token: 'private-marker' }, media: [{ private: true }], url: 'https://attacker.invalid/' }), published({ visibility: 'private' }), published({ status: 'draft' })], cursor: null });
  } });
  const response = await handle(request('', { headers: { Authorization: 'Bearer must-not-forward', Cookie: 'session=must-not-forward', Origin: 'https://attacker.invalid' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  const data = await response.json();
  assert.equal(data.posts.length, 1);
  assert.deepEqual(Object.keys(data.posts[0]).sort(), ['id', 'body', 'name', 'handle', 'createdAt', 'likes', 'comments', 'url'].sort());
  assert.equal(data.posts[0].url, 'https://thecreatingco.com/community/network?post=' + id);
  assert.equal(data.hasMore, false);
  assert.equal(JSON.stringify(data).includes('private'), false);
  assert.equal(JSON.stringify(data).includes('attacker'), false);
  assert.equal(calls[0].url, 'https://thecreatingco.com/api/community/network?view=feed');
  assert.deepEqual(calls[0].options.headers, { Accept: 'application/json' });
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('writes, arbitrary URLs, duplicate IDs and malformed post selectors never reach upstream', async () => {
  let calls = 0;
  const handle = createCommunityHandler({ fetchImpl: async () => { calls++; throw new Error('must not call'); } });
  for (const method of ['POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS']) {
    const response = await handle(request('', { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  }
  for (const query of ['?url=https://attacker.invalid', '?upstream=https://attacker.invalid', '?post=https://attacker.invalid', '?post=', '?post=' + id + '&post=' + id, '?view=messages']) {
    assert.equal((await handle(request(query))).status, 400);
  }
  assert.equal(calls, 0);
});

test('detail verifies the public post before exposing published replies from the same thread', async () => {
  const calls = [];
  const handle = createCommunityHandler({ fetchImpl: async url => {
    calls.push(url);
    return new URL(url).searchParams.get('view') === 'post' ? upstream({ posts: [published()] }) : upstream([
      published({ id: commentId, post: id, parent: null, own: true, liked: true }),
      published({ id: commentId, post: id, status: 'deleted', body: 'removed' }),
      published({ id: commentId, post: commentId, body: 'other thread' }),
    ]);
  } });
  const response = await handle(request('?post=' + id)), data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.post.id, id);
  assert.equal(data.comments.length, 1);
  assert.deepEqual(Object.keys(data.comments[0]).sort(), ['id', 'body', 'name', 'handle', 'createdAt', 'likes', 'parent'].sort());
  assert.equal(data.comments[0].parent, null);
  assert.deepEqual(calls.map(url => new URL(url).searchParams.get('view')), ['post', 'comments']);
  let privateCalls = 0;
  const privateHandler = createCommunityHandler({ fetchImpl: async () => { privateCalls++; return upstream({ posts: [published({ visibility: 'private' })] }); } });
  assert.equal((await privateHandler(request('?post=' + id))).status, 404);
  assert.equal(privateCalls, 1);
});

test('malformed records are omitted, presentation lengths are bounded and feed stops at twenty', async () => {
  const handle = createCommunityHandler({ fetchImpl: async () => upstream({ posts: [
    published({ id: 'https://attacker.invalid' }), published({ created: 'not-a-date' }),
    ...Array.from({ length: 24 }, () => published({ body: 'x'.repeat(7000), name: 'n'.repeat(100), handle: '<script>', likes: -3, comments: Infinity })),
  ], cursor: 'more' }) });
  const data = await (await handle(request())).json();
  assert.equal(data.posts.length, 20);
  assert.equal(data.hasMore, true);
  assert.equal(data.posts[0].body.length, 5000);
  assert.equal(data.posts[0].name.length, 60);
  assert.equal(data.posts[0].handle, '');
  assert.equal(data.posts[0].likes, 0);
  assert.equal(data.posts[0].comments, 0);
});

test('upstream errors, redirects, invalid content and oversized responses fail closed without details', async () => {
  const implementations = [
    async () => { throw new Error('secret error detail'); },
    async () => upstream({ error: 'private backend detail' }, 500),
    async () => new Response('', { status: 302, headers: { Location: 'https://attacker.invalid' } }),
    async () => new Response('<html>not JSON</html>', { headers: { 'Content-Type': 'text/html' } }),
    async () => upstream({ posts: [] }, 200, { 'Content-Length': '999999' }),
    async () => upstream({ posts: [published({ body: 'x'.repeat(2048) })] }),
    async () => upstream({ private: 'unexpected response' }),
  ];
  for (const fetchImpl of implementations) {
    const handle = createCommunityHandler({ fetchImpl, maxResponseBytes: 1024 });
    const response = await handle(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'The community feed is temporarily unavailable.', code: 'community_unavailable' });
  }
});

test('one deadline covers upstream reads and returns a recoverable error', async () => {
  let aborted = false;
  const handle = createCommunityHandler({ timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
  }) });
  assert.equal((await handle(request())).status, 503);
  assert.equal(aborted, true);
});
