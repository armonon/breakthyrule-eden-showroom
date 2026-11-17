# Break Thy Rule guest forum

The Archive Forum is an onsite conversation workspace. Visitors can read public Circle conversations, choose a category, publish a text post, and open/reply to threads without leaving Break Thy Rule or creating an account. The desktop category sidebar becomes a horizontal rail on mobile. Existing browser-only reading notes remain separate and private. Posts belong to the shared CreatingCo Circle community, not a new private Break Thy Rule space.

## Browser API

All routes are under `/api/community/`, served by the Netlify `community` function:

- `GET /feed`: public presentation-only posts, 20 per page, `{posts,hasMore,nextCursor}`. `?cursor=<timestamp|UUID>` continues the feed. Explicit `btr:<category>` tags map to general, garments, art, music, or reading; existing native AUDIO posts map to music; other untagged posts fall under general.
- `GET /feed?post=<UUID>`: a public post and its first 50 published replies. `commentCursor=<timestamp|UUID>` continues replies; `nextCommentsCursor` is returned when needed. Read APIs use anonymous Circle requests and reject private/unpublished posts.
- `GET /session`: restores this browser's existing guest, or returns `{guest:null,csrfToken:null}`. It never creates an identity.
- `POST /session` with `{}`: lazily creates or restores a guest, returns `{guest:{name},csrfToken}`, and sets a signed `__Host-btr-forum-guest` cookie. The cookie is Secure, HttpOnly, SameSite=Strict, host-only, Path=/, with a fixed 30-day expiry. Reads do not extend it.
- `POST /posts` with `{body,category,requestId}`: creates a public text conversation and returns `{post}`.
- `POST /replies` with `{postId,body,requestId}`: replies to a public, published thread and returns `{reply}`.

Post/reply calls require the session's `X-CSRF-Token`, exact same-origin JSON, a UUID request ID, and 1–2,000 characters of text. Extra input fields are rejected. No account cookies, shopper identity, email, uploads, or payment credentials are forwarded. Guest identity is independent of shop/Studio/Circle sign-in. Drafts and retry IDs stay in sessionStorage until successful publication; no session credentials are stored there. Network failures preserve the draft and request ID. Confirmed replies survive navigation and stale in-flight reads.

## Circle bridge

The read endpoint remains `https://thecreatingco.com/api/community/network`. Signed writes use the same Circle application's canonical hosting route, `https://momentium-collaboration.armonon.chatgpt.site/api/community/breakthyrule`, because the CreatingCo vanity-domain proxy does not expose new API routes automatically.

The dedicated bridge accepts only guest-session, text-post, and public-reply operations. It verifies HMAC-SHA256 over the exact timestamp/newline/body bytes, a five-minute timestamp window, and the fixed Break Thy Rule integration origin. This leaves Circle's native browser authentication and origin checks unchanged. It derives a distinct guest from each browser token, enforces active-profile/ban/claim checks, uses existing Circle data and moderation, and checks the exact stored payload before and after retries. Concurrent/lost-response retries cannot duplicate content or silently reuse an ID for changed content.

Runtime secrets:

- Circle Sites: `BTR_COMMUNITY_BRIDGE_SECRET` (secret).
- Netlify production Functions: matching `BTR_COMMUNITY_BRIDGE_SECRET` and a separate `BTR_COMMUNITY_SESSION_SECRET`.

Secrets never enter source or browser bundles. Previews cannot use production writes. The bridge receives a daily keyed digest of [Netlify's trusted `context.ip`](https://docs.netlify.com/build/functions/api/), never an IP taken from client-supplied forwarding headers. New guests are limited per client to 10/minute and 60/hour; messages share a 60/hour client limit plus Circle's per-guest post/reply limits. The request body is capped at12KiB, upstream responses at128KiB, and signed requests at8seconds. Public feed requests retain their six-second/256KiB bounds. Responses are no-store and render user content as text.

## Validation

BTR checks:

```sh
node --test tools/site/community-guest.test.mjs tools/site/community-feed.test.mjs tools/site/community-feed-ui.test.mjs tools/archive/topics.test.mjs
```

Circle checks: `tests/breakthyrule-bridge.test.ts`, native guest/API regressions, full TypeScript/build checks. The optional `tests/breakthyrule-adapter.test.ts` uses `BTR_ADAPTER_PATH` to run the real BTR handlers against the real signed bridge and migrated in-memory SQLite, covering separate visitors, public reads, posting/replies, lost-response retries, bans, and private-target rejection. Browser QA also published and replied through the isolated local database. No public test messages were posted.
