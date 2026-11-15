# Storefront API recovery — 2026-11-14

`storefront-api.mjs` preserves the verified production API from release 6af8f5c4ea24720ac17c42c9, including custom artwork, mystery packages, order layouts, request isolation and production payment gates. It imports prices and item validation from the canonical `labkit` modules so a later Git build cannot revert those changes. `api.mjs` is the shared local/Netlify entry point. `storefront-api.test.mjs` checks a real in-memory checkout without network or payments.

The restored HTML omits copies of Netlify-injected enhancement snippets that had accidentally been copied into Git during an earlier recovery. Those snippets remain enabled in the existing Netlify site configuration and are injected once at publish time. No enhancement configuration or payment settings were changed.
