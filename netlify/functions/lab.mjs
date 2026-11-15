// Request-scoped context preserves production payment gates and preview isolation.
import { createHandler, labFromEnv, MAX_BODY } from '../../server/lab/api.mjs';

function requestEnvironment(context) {
  const deployContext = process.env.CONTEXT || context?.deploy?.context || "";
  const base = { ...process.env, CONTEXT: deployContext };
  const preview = deployContext && deployContext !== "production";
  if (preview) {
    base.LAB_PREVIEW = "true";
    if (!base.STRIPE_SECRET_KEY && base.LAB_DISABLE_PREVIEW_GATEWAY !== "true") {
      base.LAB_PAYMENT_PROVIDER = "test-gateway";
      base.LAB_ALLOW_TEST_GATEWAY = "true";
    }
  }
  return base;
}
export default async function lab(request, context) {
  const env = requestEnvironment(context);
  const handle = createHandler(() => labFromEnv(env), env);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response(JSON.stringify({ error: "Request too large." }), { status: 413 });
  const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
  const res = await handle({ method: request.method, url: new URL(request.url), headers, rawBody: raw, clientIP: context?.ip || "" });
  return new Response(res.body, { status: res.status, headers: { ...res.headers, "X-Lab-Context": env.CONTEXT || "unknown" } });
}
