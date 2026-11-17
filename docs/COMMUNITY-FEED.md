# Public Circle feed

BreakThyRule's Archive can read the existing CreatingCo Circle community through `GET /api/community/feed`. This is the shared public Circle feed, not a newly created BreakThyRule-only space. Posting and replying use top-level links to Circle's existing guest composer and thread view. No account is required for Circle's supported guest text participation; uploads and some other features still require sign-in.

The Netlify `community` function fetches only `https://thecreatingco.com/api/community/network`, anonymously. It never forwards incoming cookies, authorization or client headers, follows redirects, creates guest identities or performs mutations. It preserves the upstream's no-store behavior. Both the upstream and response expose only public content; the proxy additionally requires posts to be explicitly `public` and `published` and returns an allowlist of presentation fields.

Feed response: `{posts,hasMore,communityUrl,composeUrl}`. Each post contains `id`, `body`, `name`, `handle`, `createdAt`, `likes`, `comments` and a fixed-origin canonical `url`. The first 20 posts are returned. `?post=<UUID>` returns `{post,comments,hasMore,communityUrl,composeUrl}` after verifying the post is public. The first 50 published replies from that same post contain `id`, `parent`, `body`, `name`, `handle`, `createdAt` and `likes`. Full discussions remain available at each post's Circle URL. Pagination is not provided by this proxy.

The function accepts only GET and the optional single `post` parameter. Invalid selectors return 400, unavailable public posts 404, mutations 405, and upstream failures 503 with a generic retryable message. A six-second total deadline and 256 KiB limit on each upstream response bound requests. No credentials, internal author IDs, account-specific saved/liked flags, media metadata or arbitrary upstream URLs are returned. Render body/name text as text, never as HTML.

Guest cookies belong to CreatingCo and remain there. Guest participation opens Circle in its own top-level page, preserving its own origin checks and browser session. This proxy neither makes cross-site identity work nor shares a studio account with visitors.

Checks:

```sh
node --test tools/site/community-feed.test.mjs
```

The read-only live check returned nine public posts and successfully loaded a public post and its replies endpoint. No public test posts, comments or guest identities were created.
