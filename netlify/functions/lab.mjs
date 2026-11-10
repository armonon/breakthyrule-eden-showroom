// Netlify Function for the Garment Lab API. Routed by _redirects: /api/lab/*  →  /.netlify/functions/lab/:splat
import { createHandler, labFromEnv, MAX_BODY } from '../../server/lab/api.mjs';

const handle = createHandler(() => labFromEnv(process.env), process.env);

export default async (request) => {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response(JSON.stringify({ error: 'Request too large.' }), { status: 413 });
  const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
  const res = await handle({ method: request.method, url: new URL(request.url), headers, rawBody: raw });
  return new Response(res.body, { status: res.status, headers: res.headers });
};
