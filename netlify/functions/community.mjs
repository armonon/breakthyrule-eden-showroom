// Anonymous, read-only projection of Circle's public feed. Never forward shopper
// cookies, authorization, client headers, or an arbitrary destination upstream.
const UPSTREAM = 'https://thecreatingco.com/api/community/network';
const COMMUNITY = 'https://thecreatingco.com/community/network';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
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
  return post ? { ...post, comments: count(item.comments), url: COMMUNITY + '?post=' + encodeURIComponent(post.id) } : null;
}

export function createCommunityHandler({ fetchImpl = globalThis.fetch, timeoutMs = 6000, maxResponseBytes = 256 * 1024 } = {}) {
  return async function community(request) {
    if (request.method !== 'GET') return json(405, { error: 'This feed is read-only.', code: 'method_not_allowed' }, { Allow: 'GET' });
    const query = new URL(request.url).searchParams;
    const postId = query.get('post');
    if ([...query.keys()].some(key => key !== 'post') || query.getAll('post').length > 1 || postId !== null && !UUID.test(postId)) return json(400, { error: 'Invalid community request.', code: 'bad_request' });
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), timeoutMs);
    async function read(view, id) {
      const url = new URL(UPSTREAM);
      url.searchParams.set('view', view);
      if (id) url.searchParams.set('id', id);
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
        const feed = await read('feed');
        if (!Array.isArray(feed?.posts)) throw new Error('Invalid community feed');
        const posts = feed.posts.map(publicPost).filter(Boolean);
        return json(200, { posts: posts.slice(0, 20), hasMore: posts.length > 20 || Boolean(feed.cursor), ...links });
      }
      const detail = await read('post', postId);
      const post = Array.isArray(detail?.posts) ? detail.posts.map(publicPost).find(item => item?.id === postId) : null;
      if (!post) return json(404, { error: 'This public post is unavailable.', code: 'post_unavailable' });
      const sourceComments = await read('comments', postId);
      if (!Array.isArray(sourceComments)) throw new Error('Invalid community comments');
      const comments = sourceComments.filter(item => item?.post === postId && item.status === 'published').map(item => {
        const comment = presentation(item);
        return comment ? { ...comment, parent: typeof item.parent === 'string' && UUID.test(item.parent) ? item.parent : null } : null;
      }).filter(Boolean);
      return json(200, { post, comments: comments.slice(0, 50), hasMore: sourceComments.length > 50, ...links });
    } catch (error) {
      return error.notFound ? json(404, { error: 'This public post is unavailable.', code: 'post_unavailable' }) : json(503, { error: 'The community feed is temporarily unavailable.', code: 'community_unavailable' });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export default createCommunityHandler();
