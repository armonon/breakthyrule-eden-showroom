import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCommunityFeed, publicHttpURL } from '../../site/community-feed.mjs';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  set innerHTML(value) { throw new Error('Feed content must not use innerHTML'); }
}
const elements = root => [root, ...root.children.filter(child => child instanceof Element).flatMap(elements)];
const text = root => typeof root === 'string' ? root : (root.textContent || '') + root.children.map(text).join('');
function fixture(fetchFeed) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  const mount = new Element('div');
  return { mount, feed: mountCommunityFeed(mount, { fetchFeed }), restore: () => { globalThis.document = previous; } };
}
const post = { id: 'a', name: 'Circle member', body: 'A public conversation.', createdAt: '2026-11-17T14:00:00.000Z', comments: 2, url: 'https://thecreatingco.com/community/network?post=a' };
const response = posts => ({ ok: true, json: async () => ({ posts }) });

test('feed loads only on demand, deduplicates requests, and renders untrusted content as text', async () => {
  let calls = 0;
  const f = fixture(async (url, options) => {
    calls++;
    assert.equal(url, '/api/community/feed');
    assert.equal(options.credentials, 'omit');
    return response([{ ...post, name: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script> https://example.test/story. javascript:alert(1) https://user:secret@example.test/', url: 'javascript:alert(1)' }]);
  });
  try {
    assert.equal(calls, 0);
    await Promise.all([f.feed.load(), f.feed.load()]);
    await f.feed.load();
    assert.equal(calls, 1);
    assert.match(text(f.mount), /<script>alert\(1\)<\/script>/);
    assert.match(text(f.mount), /<img src=x onerror=alert\(1\)>/);
    const links = elements(f.mount).filter(element => element.tag === 'a');
    assert.deepEqual(links.map(link => link.href), ['https://example.test/story', 'https://thecreatingco.com/community/network']);
    assert.ok(links.every(link => link.target === '_blank' && link.rel.includes('noopener')));
    assert.equal(elements(f.mount).filter(element => element.tag === 'time')[0].dateTime, post.createdAt);
    assert.equal(f.mount.attributes['aria-busy'], 'false');
  } finally { f.restore(); }
});

test('failed feed can retry, failed refresh keeps visible posts, and empty success is explicit', async () => {
  let attempt = 0;
  const f = fixture(async () => {
    attempt++;
    if ([1, 3].includes(attempt)) throw new Error('offline');
    return response(attempt === 2 ? [post] : []);
  });
  try {
    await f.feed.load();
    const button = elements(f.mount).find(element => element.tag === 'button');
    assert.equal(button.textContent, 'Try again');
    assert.equal(button.disabled, false);
    await button.listeners.click();
    const list = elements(f.mount).find(element => element.tag === 'ol');
    assert.equal(list.children.length, 1);
    const first = list.children[0];
    await button.listeners.click();
    assert.equal(list.children[0], first);
    assert.match(text(f.mount), /Showing the posts already here/);
    await button.listeners.click();
    assert.equal(list.children.length, 0);
    assert.match(text(f.mount), /No public conversations to show yet/);
  } finally { f.restore(); }
});

test('feed links reject script URLs, credentials, and relative URLs', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '/private', 'https://name:password@example.test', null]) assert.equal(publicHttpURL(value), null);
  assert.equal(publicHttpURL('http://example.test/read'), 'http://example.test/read');
  assert.equal(publicHttpURL('https://example.test/read'), 'https://example.test/read');
});
