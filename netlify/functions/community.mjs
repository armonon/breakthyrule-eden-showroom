import { createGuestHandler } from '../../server/community/guest.mjs';
// Anonymous, read-only projection of Circle's public feed. Never forward shopper
// cookies, authorization, client headers, or an arbitrary destination upstream.
const UPSTREAM = 'https://thecreatingco.com/api/community/network';
const COMMUNITY = 'https://thecreatingco.com/community/network';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CURSOR = /^\d{13}\|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CATEGORIES = new Set(['general', 'garments', 'art', 'music', 'reading']);
const links = { communityUrl: COMMUNITY + '?view=Discover', composeUrl: COMMUNITY + '?view=Create' };
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (status, value, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max) : '';
const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1_000_000_000) : 0;
function presentation(item) {
  if (!item || typeof item !== 'object' || !UUID.test(item.id || '') || !Number.isSafeInteger(item.created) || item.created < 0 || item.created > 8_640_000_000_000_000) return null;
  return { id: item.id, body: text(item.body, 5000), name: text(item.name, 60) || 'Community member',
    handle: typeof item.handle === 'string' && /^[a-z0-9][a-z0-9_]{2,29}$/.test(item.handle) ? item.handle : '',
    createdAt: new Date(item.created).toISOString(), likes: count(item.likes) };
}
function publicPost(item) {
  if (item?.visibility !== 'public' || item?.status !== 'published') return null;
  const post = presentation(item);
  let tags = [];
  try { tags = Array.isArray(item.tags) ? item.tags : JSON.parse(item.tags || '[]'); } catch {}
  const category = Array.isArray(tags) ? tags.find(tag => typeof tag === 'string' && tag.startsWith('btr:') && CATEGORIES.has(tag.slice(4)))?.slice(4) : null;
  return post ? { ...post, category: category || (item.type === 'AUDIO' ? 'music' : 'general'), comments: count(item.comments), url: COMMUNITY + '?post=' + encodeURIComponent(post.id) } : null;
}

export function createCommunityHandler({ fetchImpl = globalThis.fetch, timeoutMs = 6000, maxResponseBytes = 256 * 1024 } = {}) {
  return async function community(request) {
    if (request.method !== 'GET') return json(405, { error: 'This feed is read-only.', code: 'method_not_allowed' }, { Allow: 'GET' });
    const query = new URL(request.url).searchParams;
    const postId = query.get('post');
    const cursor = query.get('cursor'), commentCursor = query.get('commentCursor');
    if ([...query.keys()].some(key => !['post','cursor','commentCursor'].includes(key)) || [...new Set(query.keys())].some(key => query.getAll(key).length > 1) || postId !== null && !UUID.test(postId) || cursor !== null && (!CURSOR.test(cursor) || postId !== null) || commentCursor !== null && (!CURSOR.test(commentCursor) || postId === null)) return json(400, { error: 'Invalid community request.', code: 'bad_request' });
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), timeoutMs);
    async function read(view, id, pageCursor) {
      const url = new URL(UPSTREAM);
      url.searchParams.set('view', view);
      if (id) url.searchParams.set('id', id);
      if (pageCursor) url.searchParams.set('cursor', pageCursor);
      const response = await fetchImpl(url.toString(), { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: abort.signal });
      if (!response.ok) {
        const error = new Error('Community unavailable');
        if (id && [401, 403, 404].includes(response.status)) error.notFound = true;
        throw error;
      }
      if (response.redirected || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || Number(response.headers.get('content-length')) > maxResponseBytes || !response.body) throw new Error('Invalid community response');
      const reader = response.body.getReader(), chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxResponseBytes) throw new Error('Community response too large');
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    try {
      if (!postId) {
        const feed = await read('feed', null, cursor);
        if (!Array.isArray(feed?.posts)) throw new Error('Invalid community feed');
        const page = feed.posts.slice(0, 20), posts = page.map(publicPost).filter(Boolean);
        const boundary = page.at(-1), ownCursor = boundary ? `${boundary.created}|${boundary.id}` : '';
        const nextCursor = feed.posts.length > 20 && CURSOR.test(ownCursor) ? ownCursor : CURSOR.test(feed.cursor || '') ? feed.cursor : null;
        return json(200, { posts, hasMore: Boolean(nextCursor), nextCursor, ...links });
      }
      const detail = await read('post', postId);
      const post = Array.isArray(detail?.posts) ? detail.posts.map(publicPost).find(item => item?.id === postId) : null;
      if (!post) return json(404, { error: 'This public post is unavailable.', code: 'post_unavailable' });
      const sourceComments = await read('comments', postId, commentCursor);
      if (!Array.isArray(sourceComments)) throw new Error('Invalid community comments');
      const commentPage = sourceComments.slice(0, 50);
      const comments = commentPage.filter(item => item?.post === postId && item.status === 'published').map(item => {
        const comment = presentation(item);
        return comment ? { ...comment, parent: typeof item.parent === 'string' && UUID.test(item.parent) ? item.parent : null } : null;
      }).filter(Boolean);
      const boundary = commentPage.at(-1), candidate = boundary ? `${boundary.created}|${boundary.id}` : '';
      const nextCommentsCursor = sourceComments.length > 50 && CURSOR.test(candidate) ? candidate : null;
      return json(200, { post, comments, hasMore: Boolean(nextCommentsCursor), nextCommentsCursor, ...links });
    } catch (error) {
      return error.notFound ? json(404, { error: 'This public post is unavailable.', code: 'post_unavailable' }) : json(503, { error: 'The community feed is temporarily unavailable.', code: 'community_unavailable' });
    } finally {
      clearTimeout(timeout);
    }
  };
}

const feed = createCommunityHandler();
export default function community(request, context) {
  const path = new URL(request.url).pathname;
  const route = path.replace(/^\/(?:api\/community|\.netlify\/functions\/community)\/?/, '');
  if (route === 'feed' || route === '') return feed(request);
  return createGuestHandler()(request, context, route);
}
