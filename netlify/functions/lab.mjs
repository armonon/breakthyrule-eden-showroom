// Netlify Function for the Garment Lab API. Routed by _redirects: /api/lab/*  →  /.netlify/functions/lab/:splat
//
// Deploy context decides the defaults:
//   production          — the "garment-lab" store; payments only through Stripe (no test gateway, ever).
//   any other context   — the separate "garment-lab-preview" store; without Stripe keys the test gateway is
//                         on so the whole flow can be tried with no money moving (LAB_DISABLE_PREVIEW_GATEWAY
//                         turns that off).
import { createHandler, labFromEnv, MAX_BODY } from '../../server/lab/api.mjs';

let env = null, handle = null;
function setup(context) {
  const deployContext = process.env.CONTEXT || context?.deploy?.context || '';
  const base = { ...process.env, CONTEXT: deployContext };
  const preview = deployContext && deployContext !== 'production';
  if (preview) {
    base.LAB_PREVIEW = 'true';
    if (!base.STRIPE_SECRET_KEY && base.LAB_DISABLE_PREVIEW_GATEWAY !== 'true') { base.LAB_PAYMENT_PROVIDER = 'test-gateway'; base.LAB_ALLOW_TEST_GATEWAY = 'true'; }
  }
  env = base;
  handle = createHandler(() => labFromEnv(env), env);
}

export default async (request, context) => {
  if (!handle) setup(context);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response(JSON.stringify({ error: 'Request too large.' }), { status: 413 });
  const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
  const res = await handle({ method: request.method, url: new URL(request.url), headers, rawBody: raw });
  return new Response(res.body, { status: res.status, headers: { ...res.headers, 'X-Lab-Context': env.CONTEXT || 'unknown' } });
};
