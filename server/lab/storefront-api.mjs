// Recovered from the verified 2026-11-14 production API. Keep service behavior intact;
// prices and order validation import the canonical browser/server labkit modules.
import { CURRENCY, PRODUCTION_STATUSES, skuFor, slotFor, allSkus, allSlots } from '../../labkit/catalog.mjs';
import { priceCart, describeItem, unitsFor, expectedUnitsFor } from '../../labkit/pricing.mjs';
import { ARTWORK_POOL } from '../../labkit/artwork-pool.mjs';
import { createSquare, squareConfiguration, verifySquareSignature } from './square.mjs';
import { createSquareOrders } from './square-orders.mjs';
import { createRequire as __cr } from "node:module";
import crypto3 from "node:crypto";
import crypto2 from "node:crypto";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import crypto4 from "node:crypto";
import crypto5 from "node:crypto";
var require2 = __cr(import.meta.url);
var MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
var MAX_UPLOAD_DIMENSION = 8192;
var MAX_UPLOAD_PIXELS = 24e6;
var MAX_UPLOAD_REFS = 4;
var UPLOAD_MIMES = ["image/png", "image/jpeg", "image/webp"];
var isUploadId = (id) => typeof id === "string" && /^upload_[a-f0-9]{32}$/.test(id);
var validKey = (key) => typeof key === "string" && /^[a-f0-9]{64}$/.test(key);
var uploadName = (name) => typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[\\/]/g, "_").trim().slice(0, 100) || "Uploaded artwork" : "Uploaded artwork";
function normalizeUploadRefs(raw) {
  if (raw == null) return { ok: true, uploads: [], errors: [] };
  if (!Array.isArray(raw) || raw.length > MAX_UPLOAD_REFS) return { ok: false, uploads: [], errors: ["A garment can use up to four uploaded images."] };
  const uploads = [], seen = /* @__PURE__ */ new Set();
  for (const ref of raw) {
    if (!ref || !isUploadId(ref.id) || !validKey(ref.key) || !UPLOAD_MIMES.includes(ref.mime) || !Number.isInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > MAX_UPLOAD_BYTES || !Number.isInteger(ref.width) || !Number.isInteger(ref.height) || ref.width < 1 || ref.height < 1 || ref.width > MAX_UPLOAD_DIMENSION || ref.height > MAX_UPLOAD_DIMENSION || ref.width * ref.height > MAX_UPLOAD_PIXELS || ref.sha256 != null && (typeof ref.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(ref.sha256))) {
      return { ok: false, uploads: [], errors: ["An uploaded image reference is invalid. Upload the image again."] };
    }
    if (seen.has(ref.id)) {
      if (uploads.find((item) => item.id === ref.id).key !== ref.key) return { ok: false, uploads: [], errors: ["An uploaded image has conflicting access keys."] };
      continue;
    }
    seen.add(ref.id);
    uploads.push({ id: ref.id, key: ref.key, name: uploadName(ref.name), mime: ref.mime, bytes: ref.bytes, width: ref.width, height: ref.height, ...ref.sha256 ? { sha256: ref.sha256 } : {} });
  }
  return { ok: true, uploads, errors: [] };
}
function uploadForId(id, uploads = []) {
  return Array.isArray(uploads) ? uploads.find((ref) => ref?.id === id && isUploadId(ref.id) && validKey(ref.key)) || null : null;
}
function uploadedArtworkUrl(ref) {
  if (!ref || !isUploadId(ref.id) || !validKey(ref.key)) throw new TypeError("Invalid uploaded artwork reference.");
  return "/api/lab/artwork/" + ref.id + "?key=" + ref.key;
}
var ROLES = {
  owner: ["orders:read", "orders:write", "orders:refund", "inventory:write", "settings:write", "archive:write", "staff:write"],
  artist: ["orders:read", "orders:write", "archive:write"]
};
var TOKEN_HOURS = 12;
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  if (typeof password !== "string" || password.length < 10) throw new Error("Passwords need at least 10 characters.");
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(hash, "hex");
  return want.length === test.length && crypto.timingSafeEqual(want, test);
}
var b64 = (s) => Buffer.from(s).toString("base64url");
function signToken(payload, secret, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error("LAB_SESSION_SECRET must be at least 32 characters.");
  const body = b64(JSON.stringify({ ...payload, exp: now + TOKEN_HOURS * 36e5 }));
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + sig;
}
function verifyToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const want = crypto.createHmac("sha256", secret).update(body).digest();
  const got = Buffer.from(sig || "", "base64url");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > now ? p : null;
  } catch {
    return null;
  }
}
var can = (staff, permission) => !!staff && (ROLES[staff.role] || []).includes(permission);
var newKey = () => crypto.randomBytes(24).toString("base64url");
var hashKey = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");
function keyMatches(key, hash) {
  if (typeof key !== "string" || typeof hash !== "string") return false;
  const a = Buffer.from(hashKey(key), "hex"), b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
var UPLOADS_PER_CLIENT_HOUR = 12;
var UPLOADS_PER_SITE_DAY = 120;
function inspectArtworkBytes(mime, bytes) {
  let width = 0, height = 0;
  const invalid = () => {
    throw new Error("The file is not a supported, complete PNG, JPEG or WebP image.");
  };
  if (mime === "image/png") {
    if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) invalid();
    let offset = 8, header = false, pixels = false, ended = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
      if (length > bytes.length - offset - 12) invalid();
      if (!header) {
        if (type !== "IHDR" || length !== 13) invalid();
        width = bytes.readUInt32BE(offset + 8);
        height = bytes.readUInt32BE(offset + 12);
        if (bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) invalid();
        header = true;
      } else if (type === "IHDR" || type === "acTL") invalid();
      if (type === "IDAT" && length > 0) pixels = true;
      offset += length + 12;
      if (type === "IEND") {
        if (length !== 0 || offset !== bytes.length) invalid();
        ended = true;
        break;
      }
    }
    if (!header || !pixels || !ended) invalid();
  } else if (mime === "image/jpeg") {
    if (bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) invalid();
    let offset = 2, scan = false, frame = false;
    while (offset < bytes.length - 2) {
      if (bytes[offset++] !== 255) invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if ([0, 216, 217].includes(marker) || marker >= 208 && marker <= 215) invalid();
      if (offset + 2 > bytes.length) invalid();
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) invalid();
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
        if (frame || ![192, 193, 194].includes(marker) || length < 8 || bytes[offset + 2] !== 8) invalid();
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        frame = true;
      }
      if (marker === 218) {
        scan = true;
        break;
      }
      offset += length;
    }
    if (!scan || !width || !height) invalid();
  } else if (mime === "image/webp") {
    if (bytes.length < 26 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.toString("ascii", 8, 12) !== "WEBP") invalid();
    let offset = 12, pixels = false, extended = false;
    while (offset + 8 <= bytes.length) {
      const type = bytes.toString("ascii", offset, offset + 4), length = bytes.readUInt32LE(offset + 4), start = offset + 8;
      if (length > bytes.length - start) invalid();
      if (type === "ANIM" || type === "ANMF") invalid();
      if (type === "VP8X") {
        if (offset !== 12 || extended || length !== 10 || bytes[start] & 2) invalid();
        extended = true;
        width = 1 + bytes.readUIntLE(start + 4, 3);
        height = 1 + bytes.readUIntLE(start + 7, 3);
      } else if (type === "VP8 ") {
        if (pixels || length < 10 || bytes[start] & 1 || !bytes.subarray(start + 3, start + 6).equals(Buffer.from([157, 1, 42]))) invalid();
        const w = bytes.readUInt16LE(start + 6) & 16383, h = bytes.readUInt16LE(start + 8) & 16383;
        if (width && (width !== w || height !== h)) invalid();
        width = w;
        height = h;
        pixels = true;
      } else if (type === "VP8L") {
        if (pixels || length < 5 || bytes[start] !== 47) invalid();
        const bits = bytes.readUInt32LE(start + 1), w = (bits & 16383) + 1, h = (bits >>> 14 & 16383) + 1;
        if (bits >>> 29 || width && (width !== w || height !== h)) invalid();
        width = w;
        height = h;
        pixels = true;
      }
      offset = start + length + (length & 1);
    }
    if (!pixels || offset !== bytes.length) invalid();
  } else invalid();
  if (width < 1 || height < 1 || width > MAX_UPLOAD_DIMENSION || height > MAX_UPLOAD_DIMENSION || width * height > MAX_UPLOAD_PIXELS) throw new Error("Use an image up to 8192 pixels per side and 24 megapixels.");
  return { width, height };
}
function createCustomerArtwork({ store, now, LabError: LabError2 }) {
  async function consume(key, maximum, period) {
    await store.update(key, (current) => {
      const bucket = !current || now() >= current.resetAt ? { count: 0, resetAt: now() + period } : current;
      if (bucket.count >= maximum) throw new LabError2(429, "upload_limit", "The image upload limit has been reached. Please try again later.");
      bucket.count++;
      return bucket;
    });
  }
  const metadata = (asset) => ({ id: asset.id, name: asset.name, mime: asset.mime, bytes: asset.bytes, width: asset.width, height: asset.height, sha256: asset.sha256 });
  async function upload(input, clientIP = "") {
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.dataUrl !== "string") throw new LabError2(400, "invalid_image", "Upload a PNG, JPEG or WebP image.");
    const { name, dataUrl } = input;
    if (dataUrl.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 + 50) throw new LabError2(413, "too_large", "Images must be 3 MB or smaller.");
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match || !UPLOAD_MIMES.includes(match[1])) throw new LabError2(400, "invalid_image", "Upload a PNG, JPEG or WebP image.");
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new LabError2(413, "too_large", "Images must be 3 MB or smaller.");
    if (bytes.toString("base64") !== match[2]) throw new LabError2(400, "invalid_image", "The image data is incomplete.");
    let dimensions;
    try {
      dimensions = inspectArtworkBytes(match[1], bytes);
    } catch (error) {
      throw new LabError2(400, "invalid_image", error.message);
    }
    await consume("customer-artwork-rate/client-" + hashKey(String(clientIP || "shared").slice(0, 200)), UPLOADS_PER_CLIENT_HOUR, 36e5);
    await consume("customer-artwork-rate/site", UPLOADS_PER_SITE_DAY, 864e5);
    const id = "upload_" + crypto2.randomBytes(16).toString("hex"), key = crypto2.randomBytes(32).toString("hex");
    const record = { id, name: uploadName(name), mime: match[1], bytes: bytes.length, ...dimensions, sha256: crypto2.createHash("sha256").update(bytes).digest("hex"), keyHash: hashKey(key), data: match[2], createdAt: new Date(now()).toISOString() };
    if (!await store.set("customer-artwork/" + id, record, { ifNew: true })) throw new LabError2(503, "upload_busy", "Could not save the image. Please try again.");
    const asset = { ...metadata(record), key };
    return { asset, url: uploadedArtworkUrl(asset) };
  }
  async function find(id, key, staff) {
    const asset = isUploadId(id) ? (await store.get("customer-artwork/" + id))?.value : null;
    if (!asset || !(can(staff, "orders:read") || typeof key === "string" && /^[a-f0-9]{64}$/.test(key) && keyMatches(key, asset.keyHash))) throw new LabError2(404, "not_found", "Artwork not found.");
    return asset;
  }
  async function read(id, key, staff) {
    const asset = await find(id, key, staff);
    return { ...metadata(asset), content: Buffer.from(asset.data, "base64") };
  }
  async function validateItems(items) {
    for (const item of items) if (item.uploads?.length) {
      const verified = [];
      for (const ref of item.uploads) {
        let asset;
        try {
          asset = await find(ref.id, ref.key, null);
        } catch (error) {
          if (error instanceof LabError2 && error.status === 404) throw new LabError2(400, "invalid_artwork", "An uploaded image is missing or its access key is invalid. Upload it again.");
          throw error;
        }
        verified.push({ ...metadata(asset), key: ref.key });
      }
      item.uploads = verified;
    }
  }
  return { upload, read, validateItems };
}
// Product references and prices shared by product pages, the Lab and checkout.
var LabError = class extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
};
var RESERVE_MINUTES = 30;
var SWEEP_GRACE_MS = 5 * 6e4;
var ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
var randomId = (prefix, n = 8) => prefix + Array.from(crypto3.randomBytes(n), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
var PROD_IDS = PRODUCTION_STATUSES.map((s) => s.id);
var DEFAULT_SETTINGS = {
  launch: { sizeChartsVerified: false, relicPoliciesPublished: false, shippingTaxConfigured: false },
  relicPolicies: { contents: "", condition: "", sizing: "", fulfillment: "" },
  notice: "",
  shippingNote: "",
  returnsNote: ""
  // shown under Add to cart only when filled in
};
function createLab({ store, env = {}, stripe = null, square = null, artworkPool = [], now = () => Date.now() }) {
  const secret = env.LAB_SESSION_SECRET || "";
  const squareSelected = env.LAB_PAYMENT_PROVIDER === "square";
  const gatewayAllowed = env.LAB_PAYMENT_PROVIDER === "test-gateway" && env.LAB_ALLOW_TEST_GATEWAY === "true" && env.CONTEXT !== "production" && !stripe && !square;
  const provider = squareSelected ? "square" : stripe ? "stripe" : gatewayAllowed ? "test-gateway" : null;
  const mode = squareSelected ? square?.mode || null : stripe ? stripe.mode : gatewayAllowed ? "test" : null;
  const squareOrders = createSquareOrders({ store, env, square, now, LabError });
  const customerArtwork = createCustomerArtwork({ store, now, LabError });
  async function settings() {
    return { ...DEFAULT_SETTINGS, ...(await store.get("settings"))?.value || {} };
  }
  async function inventory() {
    return (await store.get("inventory"))?.value || { skus: {} };
  }
  async function capacity() {
    return (await store.get("capacity"))?.value || { slots: {} };
  }
  const skuAvail = (inv, sku) => {
    const s = inv.skus[sku];
    return s ? Math.max(0, s.onHand - s.reserved) : 0;
  };
  const slotAvail = (cap, slot) => {
    const s = cap.slots[slot];
    return s && Number.isInteger(s.limit) && s.open !== false ? Math.max(0, s.limit - s.used - s.reserved) : 0;
  };
  async function publicStatus() {
    const [set, inv, cap] = await Promise.all([settings(), inventory(), capacity()]);
    const reasons = [];
    if (!provider) reasons.push("Payments are not configured yet.");
    if (provider === "square") reasons.push(...squareConfiguration(env).reasons);
    if (provider === "square" && !square && !reasons.length) reasons.push("Square payments are not connected yet.");
    if (mode === "live" && env.LAB_ALLOW_LIVE !== "true") reasons.push("Live checkout has not been switched on.");
    if (mode === "live" && !set.launch.sizeChartsVerified) reasons.push("Size charts are not published yet.");
    if (mode === "live" && !set.launch.shippingTaxConfigured) reasons.push("Shipping and tax settings are not ready yet.");
    const slots = {}, skus = {};
    for (const { slot } of allSlots()) {
      const s = cap.slots[slot] || {};
      slots[slot] = { available: slotAvail(cap, slot), leadTimeDays: Number.isInteger(s.leadTimeDays) ? s.leadTimeDays : null };
    }
    for (const { sku } of allSkus()) skus[sku] = { available: skuAvail(inv, sku) };
    const availabilityConfigured = Object.keys(slots).some(slot => cap.slots[slot] != null) || Object.keys(skus).some(sku => inv.skus[sku] != null);
    if (mode === "live" && !availabilityConfigured) reasons.push("Product availability has not been configured yet.");
    return {
      checkout: { available: !reasons.length, provider, mode, reasons },
      ...(provider === "square" ? { shipping: squareConfiguration(env).shippingPolicy } : {}),
      launch: set.launch,
      relicPolicies: set.launch.relicPoliciesPublished ? set.relicPolicies : null,
      notice: set.notice,
      shippingNote: set.shippingNote || "",
      returnsNote: set.returnsNote || "",
      slots,
      skus
    };
  }
  function needsFor(items) {
    const skus = {}, slots = {};
    for (const it of items) {
      const sku = skuFor(it), slot = slotFor(it);
      if (sku) skus[sku] = (skus[sku] || 0) + it.quantity;
      if (slot) slots[slot] = (slots[slot] || 0) + it.quantity;
    }
    return { skus, slots };
  }
  async function reserve(needs) {
    if (Object.keys(needs.skus).length) await store.update("inventory", (inv) => {
      inv = inv || { skus: {} };
      for (const [sku, q] of Object.entries(needs.skus)) if (skuAvail(inv, sku) < q) throw new LabError(409, "out_of_stock", "That is sold out right now.", { sku });
      for (const [sku, q] of Object.entries(needs.skus)) inv.skus[sku].reserved += q;
      return inv;
    });
    try {
      if (Object.keys(needs.slots).length) await store.update("capacity", (cap) => {
        cap = cap || { slots: {} };
        for (const [slot, q] of Object.entries(needs.slots)) if (slotAvail(cap, slot) < q) throw new LabError(409, "at_capacity", "The studio is at capacity for that piece. Join the waitlist.", { slot });
        for (const [slot, q] of Object.entries(needs.slots)) cap.slots[slot].reserved += q;
        return cap;
      });
    } catch (e) {
      await adjust(needs, "release", { skusOnly: true });
      throw e;
    }
  }
  async function adjust(needs, op, { skusOnly = false } = {}) {
    if (Object.keys(needs.skus).length) await store.update("inventory", (inv) => {
      inv = inv || { skus: {} };
      for (const [sku, q] of Object.entries(needs.skus)) {
        const s = inv.skus[sku] || (inv.skus[sku] = { onHand: 0, reserved: 0 });
        s.reserved = Math.max(0, s.reserved - q);
        if (op === "commit") s.onHand = Math.max(0, s.onHand - q);
      }
      return inv;
    });
    if (!skusOnly && Object.keys(needs.slots).length) await store.update("capacity", (cap) => {
      cap = cap || { slots: {} };
      for (const [slot, q] of Object.entries(needs.slots)) {
        const s = cap.slots[slot] || (cap.slots[slot] = { limit: null, used: 0, reserved: 0, leadTimeDays: null });
        s.reserved = Math.max(0, s.reserved - q);
        if (op === "commit") s.used += q;
      }
      return cap;
    });
  }
  async function checkout({ items, note = "", idempotencyKey, origin, shippingRegion }) {
    if (provider === "square") await squareOrders.sweepExpired();
    const st = await publicStatus();
    if (!st.checkout.available) throw new LabError(503, "checkout_unavailable", st.checkout.reasons.join(" "));
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) throw new LabError(400, "bad_request", "Missing checkout key.");
    const priced = priceCart(items, { artworkPool });
    if (!priced.ok) throw new LabError(400, "invalid_cart", priced.errors.join(" "), { errors: priced.errors });
    await customerArtwork.validateItems(priced.items);
    if (mode === "live") {
      const set = await settings();
      if (!set.launch.sizeChartsVerified) throw new LabError(409, "not_launched", "Size charts are not published yet.");
      if (!set.launch.shippingTaxConfigured) throw new LabError(409, "not_launched", "Shipping and tax are not configured yet.");
      if (priced.items.some((i) => i.product === "relic-box") && !set.launch.relicPoliciesPublished) throw new LabError(409, "not_launched", "The Relic Box policies are not published yet.");
      if (priced.items.some((i) => i.product === "mystery-pack") && !set.launch.relicPoliciesPublished) throw new LabError(409, "not_launched", "The mystery package policies are not published yet.");
    }
    if (provider === "square") return squareOrders.checkout({ priced, note, idempotencyKey, shippingRegion });
    const reqKey = "checkout-requests/" + idempotencyKey;
    const claimed = await store.set(reqKey, { at: now(), orderId: null }, { ifNew: true });
    if (!claimed) {
      const prior = (await store.get(reqKey))?.value;
      if (prior?.orderId && prior.url) return { orderId: prior.orderId, url: prior.url, duplicate: true };
      throw new LabError(409, "in_progress", "This checkout is already being prepared.");
    }
    const needs = needsFor(priced.items);
    try {
      await reserve(needs);
    } catch (e) {
      await store.delete(reqKey);
      throw e;
    }
    const id = randomId("BTR-"), key = newKey(), expiresAt = now() + RESERVE_MINUTES * 6e4;
    const order = {
      id,
      createdAt: new Date(now()).toISOString(),
      accessKeyHash: hashKey(key),
      mode,
      provider,
      items: priced.items.map((it) => {
        const expectedUnits = expectedUnitsFor(it);
        return { ...it, describe: describeItem(it), units: unitsFor(it), ...expectedUnits ? { expectedUnits } : {} };
      }),
      subtotalCents: priced.subtotalCents,
      currency: CURRENCY,
      customerNote: typeof note === "string" ? note.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 500) : "",
      payment: { status: "pending", sessionId: null },
      production: { status: null, history: [] },
      reservation: { needs, state: "held", expiresAt },
      internalNotes: [],
      assignee: "",
      progressImages: [],
      shipment: null,
      relic: {},
      customer: null
    };
    await store.set("orders/" + id, order, { ifNew: true });
    const base = (env.LAB_PUBLIC_URL || origin || "").replace(/\/$/, "");
    const success = `${base}/lab-order?ref=${id}&key=${encodeURIComponent(key)}`;
    let url, sessionId;
    try {
      if (provider === "stripe") {
        const params = {
          mode: "payment",
          client_reference_id: id,
          success_url: success + "&paid=1",
          cancel_url: `${base}/lab?canceled=${id}`,
          expires_at: Math.floor(expiresAt / 1e3),
          metadata: { order_id: id },
          payment_intent_data: { metadata: { order_id: id } },
          shipping_address_collection: { allowed_countries: (env.LAB_SHIP_COUNTRIES || "US").split(",").map((s) => s.trim()).filter(Boolean) },
          line_items: order.items.map((it) => ({
            quantity: it.quantity,
            price_data: { currency: CURRENCY, unit_amount: it.unitCents, product_data: { name: it.describe.title, description: it.describe.spec.join(" \xB7 ").slice(0, 500) } }
          }))
        };
        const rates = (env.LAB_STRIPE_SHIPPING_RATES || "").split(",").map((s) => s.trim()).filter(Boolean);
        if (rates.length) params.shipping_options = rates.map((r) => ({ shipping_rate: r }));
        if (env.LAB_STRIPE_AUTOMATIC_TAX === "true") params.automatic_tax = { enabled: true };
        const session = await stripe.createCheckoutSession(params, "checkout-" + idempotencyKey);
        url = session.url;
        sessionId = session.id;
      } else {
        sessionId = randomId("cs_testgw_", 16);
        url = `${base}/lab-testpay?ref=${id}&key=${encodeURIComponent(key)}`;
      }
    } catch (e) {
      await adjust(needs, "release");
      await store.update("orders/" + id, (o) => {
        o.payment.status = "failed";
        o.payment.error = "Could not start checkout";
        o.reservation.state = "released";
        return o;
      });
      await store.delete(reqKey);
      throw new LabError(502, "payment_unavailable", "The payment page could not be opened. Nothing was charged. Try again.");
    }
    await store.update("orders/" + id, (o) => {
      o.payment.sessionId = sessionId;
      return o;
    });
    await store.set(reqKey, { at: now(), orderId: id, url });
    return { orderId: id, url, key };
  }
  async function handleEvent(event) {
    if (!event?.id || !event?.type) throw new LabError(400, "bad_event", "Malformed event.");
    const first = await store.set("events/" + event.id, { type: event.type, at: now() }, { ifNew: true });
    if (!first) return { duplicate: true };
    const obj = event.data?.object || {};
    const orderId = obj.metadata?.order_id || obj.client_reference_id;
    try {
      switch (event.type) {
        case "checkout.session.completed":
          if (obj.payment_status === "paid" || obj.payment_status === "no_payment_required") return await markPaid(orderId, obj);
          return { ok: true, waiting: "async_payment" };
        case "checkout.session.async_payment_succeeded":
          return await markPaid(orderId, obj);
        case "checkout.session.async_payment_failed":
          return await markEnded(orderId, "failed");
        case "checkout.session.expired":
          return await markEnded(orderId, "expired");
        case "charge.refunded":
          return await markRefund(obj);
        default:
          return { ignored: event.type };
      }
    } catch (e) {
      await store.delete("events/" + event.id);
      throw e;
    }
  }
  async function markPaid(orderId, session) {
    if (!orderId) throw new LabError(400, "bad_event", "Event has no order.");
    let release = null, recommit = false;
    const order = await store.update("orders/" + orderId, (o) => {
      if (!o) throw new LabError(404, "not_found", "Order not found.");
      if (["paid", "refunded", "partially_refunded"].includes(o.payment.status)) return void 0;
      if (session.id && o.payment.sessionId && session.id !== o.payment.sessionId) throw new LabError(400, "bad_event", "Session does not match order.");
      const amountOk = session.amount_subtotal === o.subtotalCents && (session.currency || CURRENCY) === CURRENCY;
      o.payment = {
        ...o.payment,
        status: amountOk ? "paid" : "review",
        paidAt: new Date(now()).toISOString(),
        amountTotal: session.amount_total ?? null,
        amountTax: session.total_details?.amount_tax ?? null,
        amountShipping: session.total_details?.amount_shipping ?? session.shipping_cost?.amount_total ?? null,
        paymentIntent: session.payment_intent || null,
        reviewReason: amountOk ? null : "Paid amount does not match the order total."
      };
      o.customer = {
        email: session.customer_details?.email || null,
        name: session.customer_details?.name || null,
        shipping: session.shipping_details || session.collected_information?.shipping_details || null
      };
      o.production = { status: "payment_confirmed", history: [{ status: "payment_confirmed", at: new Date(now()).toISOString(), by: "payment" }] };
      if (o.reservation.state === "held") {
        o.reservation.state = "committed";
        release = o.reservation.needs;
      } else if (o.reservation.state === "released") {
        recommit = true;
      }
      return o;
    });
    if (release) await adjust(release, "commit");
    if (recommit) {
      try {
        await reserve(order.reservation.needs);
        await adjust(order.reservation.needs, "commit");
        await store.update("orders/" + orderId, (o) => {
          o.reservation.state = "committed";
          return o;
        });
      } catch {
        await store.update("orders/" + orderId, (o) => {
          o.payment.status = "review";
          o.payment.reviewReason = "Paid after the hold lapsed and stock or capacity ran out \u2014 contact the customer.";
          return o;
        });
      }
    }
    return { ok: true, orderId };
  }
  async function markEnded(orderId, status) {
    if (!orderId) return { ignored: true };
    let needs = null;
    await store.update("orders/" + orderId, (o) => {
      if (!o || o.payment.status !== "pending") return void 0;
      o.payment.status = status;
      o.payment.endedAt = new Date(now()).toISOString();
      if (o.reservation.state === "held") {
        o.reservation.state = "released";
        needs = o.reservation.needs;
      }
      return o;
    });
    if (needs) await adjust(needs, "release");
    return { ok: true };
  }
  async function markRefund(charge) {
    const orderId = charge.metadata?.order_id;
    if (!orderId) return { ignored: true };
    await store.update("orders/" + orderId, (o) => {
      if (!o) return void 0;
      const refunded = charge.amount_refunded || 0;
      o.payment.amountRefunded = refunded;
      o.payment.status = refunded >= (o.payment.amountTotal ?? charge.amount ?? Infinity) ? "refunded" : "partially_refunded";
      return o;
    });
    return { ok: true };
  }
  async function sweepExpired() {
    let released = await squareOrders.sweepExpired();
    for (const key of await store.list("orders/")) {
      const o = (await store.get(key))?.value;
      if (o?.provider !== "square" && o?.payment.status === "pending" && o.reservation.state === "held" && o.reservation.expiresAt + SWEEP_GRACE_MS < now()) {
        await markEnded(o.id, "expired");
        released++;
      }
    }
    return released;
  }
  function customerView(o) {
    return {
      id: o.id,
      createdAt: o.createdAt,
      mode: o.mode,
      items: o.items.map((i) => ({ title: i.describe.title, spec: i.describe.spec, quantity: i.quantity, unitCents: i.unitCents, totalCents: i.totalCents, lines: i.lines, product: i.product, construction: i.construction, garment: i.garment, picks: i.picks || null, color: i.color, customColor: i.customColor || "", artwork: i.artwork, art: i.art || null, print: i.print || null, sourceDesign: i.sourceDesign || null, graphicLayout: i.graphicLayout || null, productDesign: i.productDesign || null, productId: i.productId || null, options: i.options || null, notes: i.notes || "", ...i.product === "mystery-pack" ? { package: i.package, units: i.units, ...i.expectedUnits ? { expectedUnits: i.expectedUnits } : {} } : {}, ...i.uploads?.length ? { uploads: i.uploads } : {} })),
      subtotalCents: o.subtotalCents,
      currency: o.currency,
      payment: { status: o.payment.status, amountTotal: o.payment.amountTotal ?? null, amountTax: o.payment.amountTax ?? null, amountShipping: o.payment.amountShipping ?? null },
      production: { status: o.production.status, history: o.production.history.map((h) => ({ status: h.status, at: h.at })) },
      shipment: o.shipment ? { carrier: o.shipment.carrier, tracking: o.shipment.tracking, shippedAt: o.shipment.shippedAt } : null,
      customerNote: o.customerNote
    };
  }
  async function customerOrder(id, key) {
    const o = typeof id === "string" && /^BTR-[A-Z0-9]{8}$/.test(id) ? (await store.get("orders/" + id))?.value : null;
    if (!o || !keyMatches(key, o.accessKeyHash)) throw new LabError(404, "not_found", "Order not found.");
    return customerView(o);
  }
  async function testGateway(action, { ref, key }) {
    if (provider !== "test-gateway") throw new LabError(404, "not_found", "Not found.");
    const o = (await store.get("orders/" + ref))?.value;
    if (!o || !keyMatches(key, o.accessKeyHash)) throw new LabError(404, "not_found", "Order not found.");
    const base = { id: o.payment.sessionId, client_reference_id: o.id, metadata: { order_id: o.id }, currency: CURRENCY, amount_subtotal: o.subtotalCents, amount_total: o.subtotalCents, total_details: { amount_tax: 0, amount_shipping: 0 } };
    const evId = "evt_testgw_" + crypto3.randomBytes(8).toString("hex");
    if (action === "pay") return handleEvent({ id: evId, type: "checkout.session.completed", data: { object: { ...base, payment_status: "paid", payment_intent: "pi_testgw_" + o.id, customer_details: { email: "test-buyer@example.test", name: "Test Buyer" } } } });
    if (action === "abandon") return handleEvent({ id: evId, type: "checkout.session.expired", data: { object: { ...base, payment_status: "unpaid" } } });
    if (action === "fail") return handleEvent({ id: evId, type: "checkout.session.async_payment_failed", data: { object: { ...base, payment_status: "unpaid" } } });
    throw new LabError(400, "bad_request", "Unknown action.");
  }
  async function staffFromToken(token) {
    const p = verifyToken(token, secret, now());
    if (!p) return null;
    const rec = (await store.get("staff/" + p.email))?.value;
    return rec && rec.active !== false && rec.role === p.role ? { email: p.email, role: p.role } : null;
  }
  function need(staff, permission) {
    if (!staff) throw new LabError(401, "unauthorized", "Sign in to the studio.");
    if (!can(staff, permission)) throw new LabError(403, "forbidden", "Your role cannot do that.");
  }
  async function login(email, password) {
    if (!secret) throw new LabError(503, "auth_unavailable", "Studio sign-in is not configured (LAB_SESSION_SECRET).");
    email = String(email || "").trim().toLowerCase();
    const lockKey = "login-failures/" + hashKey(email);
    const lock = (await store.get(lockKey))?.value;
    if (lock && lock.count >= 8 && now() - lock.at < 15 * 6e4) throw new LabError(429, "locked", "Too many attempts. Try again in 15 minutes.");
    let rec = (await store.get("staff/" + email))?.value;
    if (!rec && env.LAB_BOOTSTRAP_OWNER) {
      const [bootEmail, bootHash] = env.LAB_BOOTSTRAP_OWNER.split(":");
      if (bootEmail?.toLowerCase() === email) {
        rec = { email, role: "owner", passwordHash: bootHash, active: true };
        await store.set("staff/" + email, rec, { ifNew: true });
      }
    }
    if (!rec || rec.active === false || !verifyPassword(password, rec.passwordHash)) {
      await store.update(lockKey, (l) => ({ count: (l && now() - l.at < 15 * 6e4 ? l.count : 0) + 1, at: now() }));
      throw new LabError(401, "unauthorized", "Wrong email or password.");
    }
    await store.delete(lockKey);
    return { token: signToken({ email, role: rec.role }, secret, now()), role: rec.role, email };
  }
  async function addStaff(staff, { email, password, role }) {
    need(staff, "staff:write");
    if (!["owner", "artist"].includes(role)) throw new LabError(400, "bad_request", "Role must be owner or artist.");
    email = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new LabError(400, "bad_request", "Enter a valid email.");
    let passwordHash;
    try {
      passwordHash = hashPassword(password);
    } catch (e) {
      throw new LabError(400, "bad_request", e.message);
    }
    await store.set("staff/" + email, { email, role, passwordHash, active: true, addedBy: staff.email, at: new Date(now()).toISOString() });
    return { email, role };
  }
  async function listStaff(staff) {
    need(staff, "staff:write");
    const out = [];
    for (const k of await store.list("staff/")) {
      const s = (await store.get(k)).value;
      out.push({ email: s.email, role: s.role, active: s.active !== false });
    }
    return out;
  }
  async function setStaffActive(staff, email, active) {
    need(staff, "staff:write");
    if (email === staff.email) throw new LabError(400, "bad_request", "You cannot disable yourself.");
    await store.update("staff/" + email, (s) => {
      if (!s) throw new LabError(404, "not_found", "No such staff.");
      s.active = !!active;
      return s;
    });
    return { ok: true };
  }
  async function listOrders(staff, { payment, production, q } = {}) {
    need(staff, "orders:read");
    await sweepExpired();
    const out = [];
    for (const key of await store.list("orders/")) {
      const o = (await store.get(key)).value;
      if (payment && o.payment.status !== payment) continue;
      if (production && o.production.status !== production) continue;
      if (q && !(o.id + " " + (o.customer?.email || "") + " " + (o.customer?.name || "")).toLowerCase().includes(String(q).toLowerCase())) continue;
      out.push({ id: o.id, createdAt: o.createdAt, mode: o.mode, payment: o.payment.status, production: o.production.status, assignee: o.assignee, subtotalCents: o.subtotalCents, items: o.items.map((i) => i.describe.title), customer: o.customer?.name || null });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function getOrder(staff, id) {
    need(staff, "orders:read");
    const o = (await store.get("orders/" + id))?.value;
    if (!o) throw new LabError(404, "not_found", "Order not found.");
    const { accessKeyHash, ...rest } = o;
    void accessKeyHash;
    return rest;
  }
  async function editOrder(staff, id, fn, permission = "orders:write") {
    need(staff, permission);
    return store.update("orders/" + id, (o) => {
      if (!o) throw new LabError(404, "not_found", "Order not found.");
      return fn(o) || o;
    });
  }
  async function setProduction(staff, id, status) {
    if (!PROD_IDS.includes(status)) throw new LabError(400, "bad_request", "Unknown production status.");
    return editOrder(staff, id, (o) => {
      if (o.payment.status !== "paid") throw new LabError(409, "not_paid", "Production can only move on paid orders.");
      o.production.status = status;
      o.production.history.push({ status, at: new Date(now()).toISOString(), by: staff.email });
    });
  }
  const clean2 = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
  const addNote = (staff, id, text) => editOrder(staff, id, (o) => {
    const t = clean2(text, 1e3);
    if (!t) throw new LabError(400, "bad_request", "Empty note.");
    o.internalNotes.push({ at: new Date(now()).toISOString(), by: staff.email, text: t });
  });
  const assign = (staff, id, assignee) => editOrder(staff, id, (o) => {
    o.assignee = clean2(assignee, 80);
  });
  const recordShipment = (staff, id, { carrier, tracking }) => editOrder(staff, id, (o) => {
    if (o.payment.status !== "paid") throw new LabError(409, "not_paid", "Only paid orders ship.");
    o.shipment = { carrier: clean2(carrier, 40), tracking: clean2(tracking, 80), shippedAt: new Date(now()).toISOString(), by: staff.email };
    if (PROD_IDS.indexOf(o.production.status) < PROD_IDS.indexOf("shipped")) {
      o.production.status = "shipped";
      o.production.history.push({ status: "shipped", at: o.shipment.shippedAt, by: staff.email });
    }
  });
  const assignRelic = (staff, id, index, contents) => editOrder(staff, id, (o) => {
    const it = o.items[index];
    if (!it || !["relic-box", "mystery-pack"].includes(it.product)) throw new LabError(400, "bad_request", "That item is not a mystery package or Relic Box.");
    o.relic[index] = (Array.isArray(contents) ? contents : []).map((c) => clean2(c, 120)).filter(Boolean).slice(0, it.product === "mystery-pack" ? 30 : 20);
  });
  async function cancelOrder(staff, id) {
    need(staff, "orders:refund");
    const existing = (await store.get("orders/" + id))?.value;
    if (existing?.provider === "square") return squareOrders.cancel(id);
    let needs = null;
    await editOrder(staff, id, (o2) => {
      if (o2.payment.status === "paid") throw new LabError(409, "paid", "Paid orders are refunded, not canceled.");
      if (o2.payment.status !== "pending") return;
      o2.payment.status = "canceled";
      if (o2.reservation.state === "held") {
        o2.reservation.state = "released";
        needs = o2.reservation.needs;
      }
    }, "orders:refund");
    if (needs) await adjust(needs, "release");
    const o = (await store.get("orders/" + id)).value;
    if (stripe && o.payment.sessionId?.startsWith("cs_")) {
      try {
        await stripe.expireCheckoutSession(o.payment.sessionId);
      } catch {
      }
    }
    return { ok: true };
  }
  async function refund(staff, id, { amountCents } = {}) {
    need(staff, "orders:refund");
    const o = (await store.get("orders/" + id))?.value;
    if (!o) throw new LabError(404, "not_found", "Order not found.");
    if (o.provider === "square") return squareOrders.refund(id, staff, amountCents);
    if (!["paid", "partially_refunded", "review"].includes(o.payment.status) || !o.payment.paymentIntent) throw new LabError(409, "not_refundable", "Nothing to refund on this order.");
    const amount = amountCents == null ? void 0 : Number(amountCents);
    if (amount !== void 0 && (!Number.isInteger(amount) || amount < 1 || amount > (o.payment.amountTotal || o.subtotalCents))) throw new LabError(400, "bad_request", "Refund amount is out of range.");
    if (provider === "stripe") {
      await stripe.createRefund({ payment_intent: o.payment.paymentIntent, amount, metadata: { order_id: id } }, `refund-${id}-${amount ?? "full"}-${(o.payment.refundRequests || []).length}`);
    }
    await editOrder(staff, id, (x) => {
      x.payment.refundRequests = [...x.payment.refundRequests || [], { at: new Date(now()).toISOString(), by: staff.email, amountCents: amount ?? null }];
      if (provider === "test-gateway") {
        const total = x.payment.amountTotal || x.subtotalCents;
        const done = (x.payment.amountRefunded || 0) + (amount ?? total);
        x.payment.amountRefunded = Math.min(done, total);
        x.payment.status = done >= total ? "refunded" : "partially_refunded";
      }
    }, "orders:refund");
    return { ok: true, pending: provider === "stripe" };
  }
  async function stock(staff) {
    need(staff, "orders:read");
    const [inv, cap] = await Promise.all([inventory(), capacity()]);
    return {
      skus: allSkus().map((s) => ({ ...s, onHand: inv.skus[s.sku]?.onHand ?? 0, reserved: inv.skus[s.sku]?.reserved ?? 0 })),
      slots: allSlots().map((s) => ({ ...s, ...{ limit: null, used: 0, reserved: 0, leadTimeDays: null, open: true }, ...cap.slots[s.slot] || {} }))
    };
  }
  async function setStock(staff, sku, onHand) {
    need(staff, "inventory:write");
    if (!allSkus().some((s) => s.sku === sku)) throw new LabError(400, "bad_request", "Unknown SKU.");
    if (!Number.isInteger(onHand) || onHand < 0 || onHand > 1e5) throw new LabError(400, "bad_request", "Stock must be a whole number.");
    return store.update("inventory", (inv) => {
      inv = inv || { skus: {} };
      const s = inv.skus[sku] || (inv.skus[sku] = { onHand: 0, reserved: 0 });
      if (onHand < s.reserved) throw new LabError(409, "below_reserved", `${s.reserved} are held in open checkouts.`);
      s.onHand = onHand;
      return inv;
    });
  }
  async function setSlot(staff, slot, { limit, leadTimeDays, open }) {
    need(staff, "inventory:write");
    if (!allSlots().some((s) => s.slot === slot)) throw new LabError(400, "bad_request", "Unknown production slot.");
    const okInt = (v) => v === null || Number.isInteger(v) && v >= 0 && v <= 1e4;
    if (limit !== void 0 && !okInt(limit)) throw new LabError(400, "bad_request", "Capacity must be a whole number or empty.");
    if (leadTimeDays !== void 0 && !okInt(leadTimeDays)) throw new LabError(400, "bad_request", "Lead time must be whole days or empty.");
    return store.update("capacity", (cap) => {
      cap = cap || { slots: {} };
      const s = cap.slots[slot] || (cap.slots[slot] = { limit: null, used: 0, reserved: 0, leadTimeDays: null, open: true });
      if (limit !== void 0) s.limit = limit;
      if (leadTimeDays !== void 0) s.leadTimeDays = leadTimeDays;
      if (open !== void 0) s.open = !!open;
      return cap;
    });
  }
  async function getSettings(staff) {
    need(staff, "orders:read");
    return settings();
  }
  async function saveSettings(staff, patch) {
    need(staff, "settings:write");
    return store.update("settings", (cur) => {
      const s = { ...DEFAULT_SETTINGS, ...cur || {} };
      if (patch.launch) {
        for (const k of Object.keys(DEFAULT_SETTINGS.launch)) if (k in patch.launch) s.launch = { ...s.launch, [k]: !!patch.launch[k] };
      }
      if (patch.relicPolicies) {
        for (const k of Object.keys(DEFAULT_SETTINGS.relicPolicies)) if (k in patch.relicPolicies) s.relicPolicies = { ...s.relicPolicies, [k]: clean2(patch.relicPolicies[k], 1200) };
      }
      if ("notice" in patch) s.notice = clean2(patch.notice, 280);
      if ("shippingNote" in patch) s.shippingNote = clean2(patch.shippingNote, 400);
      if ("returnsNote" in patch) s.returnsNote = clean2(patch.returnsNote, 400);
      if (s.launch.relicPoliciesPublished && Object.values(s.relicPolicies).some((v) => !v)) throw new LabError(400, "bad_request", "Fill in all four Relic Box policies before publishing them.");
      return s;
    });
  }
  async function joinWaitlist({ email, slot }) {
    email = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new LabError(400, "bad_request", "Enter a valid email.");
    if (!allSlots().some((s) => s.slot === slot) && !allSkus().some((s) => s.sku === slot)) throw new LabError(400, "bad_request", "Unknown piece.");
    await store.set("waitlist/" + hashKey(slot + "|" + email), { email, slot, at: new Date(now()).toISOString() });
    return { ok: true };
  }
  async function listWaitlist(staff) {
    need(staff, "orders:read");
    const out = [];
    for (const k of await store.list("waitlist/")) out.push((await store.get(k)).value);
    return out;
  }
  async function upload(staff, { dataUrl, purpose = "progress", orderId }) {
    need(staff, purpose === "archive" ? "archive:write" : "orders:write");
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
    if (!m) throw new LabError(400, "bad_request", "Upload a JPEG, PNG or WebP image.");
    if (m[2].length * 0.75 > 3 * 1024 * 1024) throw new LabError(413, "too_large", "Images must be under 3 MB.");
    const id = randomId("img_", 12);
    await store.set("uploads/" + id, { mime: m[1], data: m[2], by: staff.email, at: new Date(now()).toISOString(), public: false, purpose });
    if (purpose === "progress" && orderId) await editOrder(staff, orderId, (o) => {
      o.progressImages.push(id);
    });
    return { id };
  }
  async function getUpload(id, staff) {
    const u = /^img_[A-Z0-9]{12}$/.test(id) ? (await store.get("uploads/" + id))?.value : null;
    if (!u || !u.public && !can(staff, "orders:read")) throw new LabError(404, "not_found", "Not found.");
    return { mime: u.mime, bytes: Buffer.from(u.data, "base64") };
  }
  const ARCHIVE_FIELDS = ["garmentType", "construction", "materials", "technique", "createdOn", "edition", "title", "description"];
  const publicEntry = (e) => ({ id: e.id, ...Object.fromEntries(ARCHIVE_FIELDS.map((f) => [f, e[f] || ""])), photos: e.photos || [], publishedAt: e.publishedAt || null });
  async function saveArchive(staff, input) {
    need(staff, "archive:write");
    const id = input.id && /^BTR-P[A-Z0-9]{6}$/.test(input.id) ? input.id : randomId("BTR-P", 6);
    const photos = (Array.isArray(input.photos) ? input.photos : []).filter((p) => /^img_[A-Z0-9]{12}$/.test(p)).slice(0, 12);
    const entry = await store.update("archive/" + id, (cur) => {
      const e = { id, status: "draft", ...cur || {} };
      for (const f of ARCHIVE_FIELDS) if (f in input) e[f] = clean2(input[f], f === "description" ? 2e3 : 120);
      e.photos = photos;
      e.orderId = input.orderId ? clean2(input.orderId, 20) : e.orderId || null;
      if (input.status === "published" && e.status !== "published") {
        e.status = "published";
        e.publishedAt = new Date(now()).toISOString();
      }
      if (input.status === "draft") e.status = "draft";
      e.updatedBy = staff.email;
      return e;
    });
    for (const p of photos) await store.update("uploads/" + p, (u) => {
      if (!u) return void 0;
      u.public = entry.status === "published";
      return u;
    });
    return entry;
  }
  async function listArchive(staff) {
    const out = [];
    for (const k of await store.list("archive/")) {
      const e = (await store.get(k)).value;
      if (e.status === "published" || can(staff, "archive:write")) out.push(staff && can(staff, "archive:write") ? e : publicEntry(e));
    }
    return out.sort((a, b) => String(b.publishedAt || b.id).localeCompare(String(a.publishedAt || a.id)));
  }
  async function getArchive(id) {
    const e = (await store.get("archive/" + id))?.value;
    if (!e || e.status !== "published") throw new LabError(404, "not_found", "No passport with that number.");
    return publicEntry(e);
  }
  return {
    provider,
    mode,
    publicStatus,
    checkout,
    handleEvent,
    handleSquareEvent: squareOrders.handleEvent,
    sweepExpired,
    customerOrder,
    testGateway,
    login,
    staffFromToken,
    addStaff,
    listStaff,
    setStaffActive,
    listOrders,
    getOrder,
    setProduction,
    addNote,
    assign,
    recordShipment,
    assignRelic,
    cancelOrder,
    refund,
    stock,
    setStock,
    setSlot,
    getSettings,
    saveSettings,
    joinWaitlist,
    listWaitlist,
    upload,
    getUpload,
    uploadArtwork: customerArtwork.upload,
    getArtwork: customerArtwork.read,
    saveArchive,
    listArchive,
    getArchive,
    _test: { needsFor, reserve, adjust, inventory, capacity }
  };
}
var getString = (input) => typeof input === "string" ? input : JSON.stringify(input);
var base64Decode = globalThis.Buffer ? (input) => Buffer.from(input, "base64").toString() : (input) => atob(input);
var base64Encode = globalThis.Buffer ? (input) => Buffer.from(getString(input)).toString("base64") : (input) => btoa(getString(input));
var getEnvironment = () => {
  const { Deno, Netlify, process: process2 } = globalThis;
  return Netlify?.env ?? Deno?.env ?? {
    delete: (key) => delete process2?.env[key],
    get: (key) => process2?.env[key],
    has: (key) => Boolean(process2?.env[key]),
    set: (key, value) => {
      if (process2?.env) {
        process2.env[key] = value;
      }
    },
    toObject: () => process2?.env ?? {}
  };
};
var GET_TRACER = "__netlify__getTracer";
var getTracer = (name, version) => {
  return globalThis[GET_TRACER]?.(name, version);
};
function withActiveSpan(tracer, name, optionsOrFn, contextOrFn, fn) {
  const func = typeof contextOrFn === "function" ? contextOrFn : typeof optionsOrFn === "function" ? optionsOrFn : fn;
  if (!func) {
    throw new Error("function to execute with active span is missing");
  }
  if (!tracer) {
    return func();
  }
  return tracer.withActiveSpan(name, optionsOrFn, contextOrFn, func);
}
var getEnvironmentContext = () => {
  const context = globalThis.netlifyBlobsContext || getEnvironment().get("NETLIFY_BLOBS_CONTEXT");
  if (typeof context !== "string" || !context) {
    return {};
  }
  const data = base64Decode(context);
  try {
    return JSON.parse(data);
  } catch {
  }
  return {};
};
var MissingBlobsEnvironmentError = class extends Error {
  constructor(requiredProperties) {
    super(
      `The environment has not been configured to use Netlify Blobs. To use it manually, supply the following properties when creating a store: ${requiredProperties.join(
        ", "
      )}`
    );
    this.name = "MissingBlobsEnvironmentError";
  }
};
var BASE64_PREFIX = "b64;";
var METADATA_HEADER_INTERNAL = "x-amz-meta-user";
var METADATA_HEADER_EXTERNAL = "netlify-blobs-metadata";
var METADATA_MAX_SIZE = 2 * 1024;
var encodeMetadata = (metadata) => {
  if (!metadata) {
    return null;
  }
  const encodedObject = base64Encode(JSON.stringify(metadata));
  const payload = `b64;${encodedObject}`;
  if (METADATA_HEADER_EXTERNAL.length + payload.length > METADATA_MAX_SIZE) {
    throw new Error("Metadata object exceeds the maximum size");
  }
  return payload;
};
var decodeMetadata = (header) => {
  if (!header?.startsWith(BASE64_PREFIX)) {
    return {};
  }
  const encodedData = header.slice(BASE64_PREFIX.length);
  const decodedData = base64Decode(encodedData);
  const metadata = JSON.parse(decodedData);
  return metadata;
};
var getMetadataFromResponse = (response) => {
  if (!response.headers) {
    return {};
  }
  const value = response.headers.get(METADATA_HEADER_EXTERNAL) || response.headers.get(METADATA_HEADER_INTERNAL);
  try {
    return decodeMetadata(value);
  } catch {
    throw new Error(
      "An internal error occurred while trying to retrieve the metadata for an entry. Please try updating to the latest version of the Netlify Blobs client."
    );
  }
};
var NF_ERROR = "x-nf-error";
var NF_REQUEST_ID = "x-nf-request-id";
var DEPLOY_STORE_PREFIX = "deploy:";
var SITE_STORE_PREFIX = "site:";
var isDeniedWrite = (res, { method, storeName }) => (res.status === 401 || res.status === 403) && (method === "put" || method === "delete") && storeName !== void 0 && !storeName.startsWith(DEPLOY_STORE_PREFIX);
var blobsErrorMessage = (res, context, responseBody) => {
  let details = res.headers.get(NF_ERROR) || `${res.status} status code`;
  if (res.headers.has(NF_REQUEST_ID)) {
    details += `, ID: ${res.headers.get(NF_REQUEST_ID)}`;
  }
  if (isDeniedWrite(res, context)) {
    const storeName = context.storeName?.startsWith(SITE_STORE_PREFIX) ? context.storeName.slice(SITE_STORE_PREFIX.length) : context.storeName;
    const summary = `Netlify Blobs could not write to store '${storeName}' (${details}).`;
    if (context.edgeAccess) {
      return summary;
    }
    return `${summary} Builds and build plugins can only write to deploy-specific stores: use 'getDeployStore' instead of 'getStore', or pass a 'token' with write access to the store. If this code is not running in a build, check that the token and site ID are valid. See https://docs.netlify.com/build/data-and-storage/netlify-blobs/#deploy-specific-stores`;
  }
  let message = `Netlify Blobs has generated an internal error (${details})`;
  if (!res.headers.get(NF_ERROR) && responseBody) {
    message += `: ${responseBody}`;
  }
  return message;
};
var BlobsInternalError = class extends Error {
  constructor(res, context = {}, responseBody) {
    super(blobsErrorMessage(res, context, responseBody));
    this.name = "BlobsInternalError";
    this.status = res.status;
    this.responseBody = responseBody;
  }
};
var createBlobsInternalError = async (res, context = {}) => {
  const responseBody = await res.clone().text().catch(() => void 0);
  return new BlobsInternalError(res, context, responseBody);
};
var discardBody = async (res) => {
  await res.body?.cancel().catch(() => {
  });
};
var collectIterator = async (iterator) => {
  const result = [];
  for await (const item of iterator) {
    result.push(item);
  }
  return result;
};
function withSpan(span, name, fn) {
  if (span) return fn(span);
  return withActiveSpan(getTracer(), name, (span2) => {
    return fn(span2);
  });
}
var BlobsConsistencyError = class extends Error {
  constructor() {
    super(
      `Netlify Blobs has failed to perform a read using strong consistency because the environment has not been configured with a 'uncachedEdgeURL' property`
    );
    this.name = "BlobsConsistencyError";
  }
};
var REGION_AUTO = "auto";
var regions = {
  "us-east-1": true,
  "us-east-2": true,
  "eu-central-1": true,
  "ap-southeast-1": true,
  "ap-southeast-2": true
};
var isValidRegion = (input) => Object.keys(regions).includes(input);
var InvalidBlobsRegionError = class extends Error {
  constructor(region) {
    super(
      `${region} is not a supported Netlify Blobs region. Supported values are: ${Object.keys(regions).join(", ")}.`
    );
    this.name = "InvalidBlobsRegionError";
  }
};
var DEFAULT_RETRY_DELAY = getEnvironment().get("NODE_ENV") === "test" ? 1 : 5e3;
var MIN_RETRY_DELAY = 1e3;
var MAX_RETRY = 5;
var RATE_LIMIT_HEADER = "X-RateLimit-Reset";
var fetchAndRetry = async (fetch, url, options, attemptsLeft = MAX_RETRY, getRetryUrl) => {
  try {
    const res = await fetch(url, options);
    const isRetryable = res.status === 429 || res.status >= 500 || getRetryUrl !== void 0 && res.status === 403;
    if (attemptsLeft > 0 && isRetryable) {
      await discardBody(res);
      const delay = getDelay(res.headers.get(RATE_LIMIT_HEADER));
      await sleep(delay);
      const retryUrl = getRetryUrl ? await getRetryUrl() : url;
      return fetchAndRetry(fetch, retryUrl, options, attemptsLeft - 1, getRetryUrl);
    }
    return res;
  } catch (error) {
    if (attemptsLeft === 0) {
      throw error;
    }
    const delay = getDelay();
    await sleep(delay);
    const retryUrl = getRetryUrl ? await getRetryUrl() : url;
    return fetchAndRetry(fetch, retryUrl, options, attemptsLeft - 1, getRetryUrl);
  }
};
var getDelay = (rateLimitReset) => {
  if (!rateLimitReset) {
    return DEFAULT_RETRY_DELAY;
  }
  return Math.max(Number(rateLimitReset) * 1e3 - Date.now(), MIN_RETRY_DELAY);
};
var sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
var SIGNED_URL_ACCEPT_HEADER = "application/json;type=signed-url";
var Client = class {
  /**
   * Whether requests reach Blobs through the edge rather than the API. Only
   * runtime environments are given an edge URL.
   */
  get edgeAccess() {
    return this.edgeURL !== void 0;
  }
  constructor({ apiURL, consistency, edgeURL, fetch, region, siteID, token, uncachedEdgeURL }) {
    this.apiURL = apiURL;
    this.consistency = consistency ?? "eventual";
    this.edgeURL = edgeURL;
    this.fetch = fetch ?? globalThis.fetch;
    this.region = region;
    this.siteID = siteID;
    this.token = token;
    this.uncachedEdgeURL = uncachedEdgeURL;
    if (!this.fetch) {
      throw new Error(
        "Netlify Blobs could not find a `fetch` client in the global scope. You can either update your runtime to a version that includes `fetch` (like Node.js 18.0.0 or above), or you can supply your own implementation using the `fetch` property."
      );
    }
  }
  async getFinalRequest({
    consistency: opConsistency,
    key,
    metadata,
    method,
    parameters = {},
    storeName
  }) {
    const encodedMetadata = encodeMetadata(metadata);
    const consistency = opConsistency ?? this.consistency;
    let urlPath = `/${this.siteID}`;
    if (storeName) {
      urlPath += `/${storeName}`;
    }
    if (key) {
      urlPath += `/${key}`;
    }
    if (this.edgeURL) {
      if (consistency === "strong" && !this.uncachedEdgeURL) {
        throw new BlobsConsistencyError();
      }
      const headers = {
        authorization: `Bearer ${this.token}`
      };
      if (encodedMetadata) {
        headers[METADATA_HEADER_INTERNAL] = encodedMetadata;
      }
      if (this.region) {
        urlPath = `/region:${this.region}${urlPath}`;
      }
      const url2 = new URL(urlPath, consistency === "strong" ? this.uncachedEdgeURL : this.edgeURL);
      for (const key2 in parameters) {
        url2.searchParams.set(key2, parameters[key2]);
      }
      return {
        headers,
        url: url2.toString()
      };
    }
    const apiHeaders = { authorization: `Bearer ${this.token}` };
    const url = new URL(`/api/v1/blobs${urlPath}`, this.apiURL ?? "https://api.netlify.com");
    for (const key2 in parameters) {
      url.searchParams.set(key2, parameters[key2]);
    }
    if (this.region) {
      url.searchParams.set("region", this.region);
    }
    if (storeName === void 0 || key === void 0) {
      return {
        headers: apiHeaders,
        url: url.toString()
      };
    }
    if (encodedMetadata) {
      apiHeaders[METADATA_HEADER_EXTERNAL] = encodedMetadata;
    }
    if (method === "head" || method === "delete") {
      return {
        headers: apiHeaders,
        url: url.toString()
      };
    }
    const res = await this.fetch(url.toString(), {
      headers: { ...apiHeaders, accept: SIGNED_URL_ACCEPT_HEADER },
      method
    });
    if (res.status !== 200) {
      throw await createBlobsInternalError(res, { edgeAccess: this.edgeAccess, method, storeName });
    }
    const { url: signedURL } = await res.json();
    const userHeaders = encodedMetadata ? { [METADATA_HEADER_INTERNAL]: encodedMetadata } : void 0;
    return {
      headers: userHeaders,
      url: signedURL
    };
  }
  async makeRequest({
    body,
    conditions = {},
    consistency,
    headers: extraHeaders,
    key,
    metadata,
    method,
    parameters,
    storeName
  }) {
    const { headers: baseHeaders = {}, url } = await this.getFinalRequest({
      consistency,
      key,
      metadata,
      method,
      parameters,
      storeName
    });
    const headers = {
      ...baseHeaders,
      ...extraHeaders
    };
    if (method === "put") {
      headers["cache-control"] = "max-age=0, stale-while-revalidate=60";
    }
    if ("onlyIfMatch" in conditions && conditions.onlyIfMatch) {
      headers["if-match"] = conditions.onlyIfMatch;
    } else if ("onlyIfNew" in conditions && conditions.onlyIfNew) {
      headers["if-none-match"] = "*";
    }
    const options = {
      body,
      headers,
      method
    };
    if (body instanceof ReadableStream) {
      options.duplex = "half";
    }
    const usesSignedUrl = !this.edgeURL && key !== void 0 && storeName !== void 0 && method !== "head" && method !== "delete";
    let getRetryUrl;
    if (usesSignedUrl) {
      getRetryUrl = async () => {
        const finalRequest = await this.getFinalRequest({ consistency, key, metadata, method, parameters, storeName });
        return finalRequest.url;
      };
    }
    return fetchAndRetry(this.fetch, url, options, void 0, getRetryUrl);
  }
};
var getClientOptions = (options, contextOverride) => {
  const context = contextOverride ?? getEnvironmentContext();
  const siteID = context.siteID ?? options.siteID;
  const token = context.token ?? options.token;
  if (!siteID || !token) {
    throw new MissingBlobsEnvironmentError(["siteID", "token"]);
  }
  if (options.region !== void 0 && !isValidRegion(options.region)) {
    throw new InvalidBlobsRegionError(options.region);
  }
  const clientOptions = {
    apiURL: context.apiURL ?? options.apiURL,
    consistency: options.consistency,
    edgeURL: context.edgeURL ?? options.edgeURL,
    fetch: options.fetch,
    region: options.region,
    siteID,
    token,
    uncachedEdgeURL: context.uncachedEdgeURL ?? options.uncachedEdgeURL
  };
  return clientOptions;
};
var LEGACY_STORE_INTERNAL_PREFIX = "netlify-internal/legacy-namespace/";
var STATUS_OK = 200;
var STATUS_PRE_CONDITION_FAILED = 412;
var STATUS_CONFLICT = 409;
var Store = class _Store {
  constructor(options) {
    this.client = options.client;
    if ("deployID" in options) {
      _Store.validateDeployID(options.deployID);
      let name = DEPLOY_STORE_PREFIX + options.deployID;
      if (options.name) {
        name += `:${options.name}`;
      }
      this.name = name;
    } else if (options.name.startsWith(LEGACY_STORE_INTERNAL_PREFIX)) {
      const storeName = options.name.slice(LEGACY_STORE_INTERNAL_PREFIX.length);
      _Store.validateStoreName(storeName);
      this.name = storeName;
    } else {
      _Store.validateStoreName(options.name);
      this.name = SITE_STORE_PREFIX + options.name;
    }
  }
  async delete(key) {
    const res = await this.client.makeRequest({ key, method: "delete", storeName: this.name });
    await discardBody(res);
    if (![200, 204, 404].includes(res.status)) {
      throw new BlobsInternalError(res, {
        edgeAccess: this.client.edgeAccess,
        method: "delete",
        storeName: this.name
      });
    }
  }
  async deleteAll() {
    let totalDeletedBlobs = 0;
    let hasMore = true;
    while (hasMore) {
      const res = await this.client.makeRequest({ method: "delete", storeName: this.name });
      if (res.status !== 200) {
        await discardBody(res);
        throw new BlobsInternalError(res, {
          edgeAccess: this.client.edgeAccess,
          method: "delete",
          storeName: this.name
        });
      }
      const data = await res.json();
      if (typeof data.blobs_deleted !== "number") {
        throw new BlobsInternalError(res);
      }
      totalDeletedBlobs += data.blobs_deleted;
      hasMore = typeof data.has_more === "boolean" && data.has_more;
    }
    return {
      deletedBlobs: totalDeletedBlobs
    };
  }
  async get(key, options) {
    return withSpan(options?.span, "blobs.get", async (span) => {
      const { consistency, type } = options ?? {};
      span?.setAttributes({
        "blobs.store": this.name,
        "blobs.key": key,
        "blobs.type": type,
        "blobs.method": "GET",
        "blobs.consistency": consistency
      });
      const res = await this.client.makeRequest({
        consistency,
        key,
        method: "get",
        storeName: this.name
      });
      span?.setAttributes({
        "blobs.response.body.size": res.headers.get("content-length") ?? void 0,
        "blobs.response.status": res.status
      });
      if (res.status === 404) {
        await discardBody(res);
        return null;
      }
      if (res.status !== 200) {
        await discardBody(res);
        throw new BlobsInternalError(res);
      }
      if (type === void 0 || type === "text") {
        return res.text();
      }
      if (type === "arrayBuffer") {
        return res.arrayBuffer();
      }
      if (type === "blob") {
        return res.blob();
      }
      if (type === "json") {
        return res.json();
      }
      if (type === "stream") {
        return res.body;
      }
      await discardBody(res);
      throw new BlobsInternalError(res);
    });
  }
  async getMetadata(key, options = {}) {
    return withSpan(options?.span, "blobs.getMetadata", async (span) => {
      span?.setAttributes({
        "blobs.store": this.name,
        "blobs.key": key,
        "blobs.method": "HEAD",
        "blobs.consistency": options.consistency
      });
      const res = await this.client.makeRequest({
        consistency: options.consistency,
        key,
        method: "head",
        storeName: this.name
      });
      span?.setAttributes({
        "blobs.response.status": res.status
      });
      if (res.status === 404) {
        return null;
      }
      if (res.status !== 200 && res.status !== 304) {
        throw new BlobsInternalError(res);
      }
      const etag = res?.headers.get("etag") ?? void 0;
      const metadata = getMetadataFromResponse(res);
      const result = {
        etag,
        metadata
      };
      return result;
    });
  }
  async getWithMetadata(key, options) {
    return withSpan(options?.span, "blobs.getWithMetadata", async (span) => {
      const { consistency, etag: requestETag, type } = options ?? {};
      const headers = requestETag ? { "if-none-match": requestETag } : void 0;
      span?.setAttributes({
        "blobs.store": this.name,
        "blobs.key": key,
        "blobs.method": "GET",
        "blobs.consistency": options?.consistency,
        "blobs.type": type,
        "blobs.request.etag": requestETag
      });
      const res = await this.client.makeRequest({
        consistency,
        headers,
        key,
        method: "get",
        storeName: this.name
      });
      const responseETag = res?.headers.get("etag") ?? void 0;
      span?.setAttributes({
        "blobs.response.body.size": res.headers.get("content-length") ?? void 0,
        "blobs.response.etag": responseETag,
        "blobs.response.status": res.status
      });
      if (res.status === 404) {
        await discardBody(res);
        return null;
      }
      if (res.status !== 200 && res.status !== 304) {
        await discardBody(res);
        throw new BlobsInternalError(res);
      }
      const metadata = getMetadataFromResponse(res);
      const result = {
        etag: responseETag,
        metadata
      };
      if (res.status === 304 && requestETag) {
        return { data: null, ...result };
      }
      if (type === void 0 || type === "text") {
        return { data: await res.text(), ...result };
      }
      if (type === "arrayBuffer") {
        return { data: await res.arrayBuffer(), ...result };
      }
      if (type === "blob") {
        return { data: await res.blob(), ...result };
      }
      if (type === "json") {
        return { data: await res.json(), ...result };
      }
      if (type === "stream") {
        return { data: res.body, ...result };
      }
      await discardBody(res);
      throw new Error(`Invalid 'type' property: ${type}. Expected: arrayBuffer, blob, json, stream, or text.`);
    });
  }
  list(options = {}) {
    return withSpan(options.span, "blobs.list", (span) => {
      span?.setAttributes({
        "blobs.store": this.name,
        "blobs.method": "GET",
        "blobs.list.paginate": options.paginate ?? false
      });
      const iterator = this.getListIterator(options);
      if (options.paginate) {
        return iterator;
      }
      return collectIterator(iterator).then(
        (items) => items.reduce(
          (acc, item) => ({
            blobs: [...acc.blobs, ...item.blobs],
            directories: [...acc.directories, ...item.directories]
          }),
          { blobs: [], directories: [] }
        )
      );
    });
  }
  async set(key, data, options = {}) {
    return withSpan(options.span, "blobs.set", async (span) => {
      span?.setAttributes({
        "blobs.store": this.name,
        "blobs.key": key,
        "blobs.method": "PUT",
        "blobs.data.size": typeof data == "string" ? data.length : data instanceof Blob ? data.size : data.byteLength,
        "blobs.data.type": typeof data == "string" ? "string" : data instanceof Blob ? "blob" : "arrayBuffer",
        "blobs.atomic": Boolean(options.onlyIfMatch ?? options.onlyIfNew)
      });
      _Store.validateKey(key);
      const conditions = _Store.getConditions(options);
      const res = await this.client.makeRequest({
        conditions,
        body: data,
        key,
        metadata: options.metadata,
        method: "put",
        storeName: this.name
      });
      const etag = res.headers.get("etag") ?? "";
      span?.setAttributes({
        "blobs.response.etag": etag,
        "blobs.response.status": res.status
      });
      if (conditions) {
        if (res.status === STATUS_PRE_CONDITION_FAILED || res.status === STATUS_CONFLICT) {
          await discardBody(res);
          return { modified: false };
        }
        if (res.ok) {
          await discardBody(res);
          return { etag, modified: true };
        }
        throw await createBlobsInternalError(res, {
          edgeAccess: this.client.edgeAccess,
          method: "put",
          storeName: this.name
        });
      }
      if (res.status === STATUS_OK) {
        await discardBody(res);
        return {
          etag,
          modified: true
        };
      }
      throw await createBlobsInternalError(res, {
        edgeAccess: this.client.edgeAccess,
        method: "put",
        storeName: this.name
      });
    });
  }
  async setJSON(key, data, options = {}) {
    return withSpan(options.span, "blobs.setJSON", async (span) => {
      span?.setAttributes({
        "blobs.store": this.name,
        "blobs.key": key,
        "blobs.method": "PUT",
        "blobs.data.type": "json",
        "blobs.atomic": Boolean(options.onlyIfMatch ?? options.onlyIfNew)
      });
      _Store.validateKey(key);
      const conditions = _Store.getConditions(options);
      const payload = JSON.stringify(data);
      const headers = {
        "content-type": "application/json"
      };
      const res = await this.client.makeRequest({
        conditions,
        body: payload,
        headers,
        key,
        metadata: options.metadata,
        method: "put",
        storeName: this.name
      });
      const etag = res.headers.get("etag") ?? "";
      span?.setAttributes({
        "blobs.response.etag": etag,
        "blobs.response.status": res.status
      });
      if (conditions) {
        if (res.status === STATUS_PRE_CONDITION_FAILED || res.status === STATUS_CONFLICT) {
          await discardBody(res);
          return { modified: false };
        }
        if (res.ok) {
          await discardBody(res);
          return { etag, modified: true };
        }
        throw await createBlobsInternalError(res, {
          edgeAccess: this.client.edgeAccess,
          method: "put",
          storeName: this.name
        });
      }
      if (res.status === STATUS_OK) {
        await discardBody(res);
        return {
          etag,
          modified: true
        };
      }
      throw await createBlobsInternalError(res, {
        edgeAccess: this.client.edgeAccess,
        method: "put",
        storeName: this.name
      });
    });
  }
  static formatListResultBlob(result) {
    if (!result.key) {
      return null;
    }
    return {
      etag: result.etag,
      key: result.key
    };
  }
  static getConditions(options) {
    if ("onlyIfMatch" in options && "onlyIfNew" in options) {
      throw new Error(
        `The 'onlyIfMatch' and 'onlyIfNew' options are mutually exclusive. Using 'onlyIfMatch' will make the write succeed only if there is an entry for the key with the given content, while 'onlyIfNew' will make the write succeed only if there is no entry for the key.`
      );
    }
    if ("onlyIfMatch" in options && options.onlyIfMatch) {
      if (typeof options.onlyIfMatch !== "string") {
        throw new Error(`The 'onlyIfMatch' property expects a string representing an ETag.`);
      }
      return {
        onlyIfMatch: options.onlyIfMatch
      };
    }
    if ("onlyIfNew" in options && options.onlyIfNew) {
      if (typeof options.onlyIfNew !== "boolean") {
        throw new Error(
          `The 'onlyIfNew' property expects a boolean indicating whether the write should fail if an entry for the key already exists.`
        );
      }
      return {
        onlyIfNew: true
      };
    }
  }
  static validateKey(key) {
    if (key === "") {
      throw new Error("Blob key must not be empty.");
    }
    if (key.startsWith("/") || key.startsWith("%2F")) {
      throw new Error("Blob key must not start with forward slash (/).");
    }
    if (new TextEncoder().encode(key).length > 600) {
      throw new Error(
        "Blob key must be a sequence of Unicode characters whose UTF-8 encoding is at most 600 bytes long."
      );
    }
  }
  static validateDeployID(deployID) {
    if (!/^\w{1,24}$/.test(deployID)) {
      throw new Error(`'${deployID}' is not a valid Netlify deploy ID.`);
    }
  }
  static validateStoreName(name) {
    if (name.includes("/") || name.includes("%2F")) {
      throw new Error("Store name must not contain forward slashes (/).");
    }
    if (new TextEncoder().encode(name).length > 64) {
      throw new Error(
        "Store name must be a sequence of Unicode characters whose UTF-8 encoding is at most 64 bytes long."
      );
    }
  }
  getListIterator(options) {
    const { client, name: storeName } = this;
    const parameters = {};
    if (options?.prefix) {
      parameters.prefix = options.prefix;
    }
    if (options?.directories) {
      parameters.directories = "true";
    }
    return {
      [Symbol.asyncIterator]() {
        let currentCursor = null;
        let done = false;
        return {
          async next() {
            return withSpan(options?.span, "blobs.list.next", async (span) => {
              span?.setAttributes({
                "blobs.store": storeName,
                "blobs.method": "GET",
                "blobs.list.paginate": options?.paginate ?? false,
                "blobs.list.done": done,
                "blobs.list.cursor": currentCursor ?? void 0
              });
              if (done) {
                return { done: true, value: void 0 };
              }
              const nextParameters = { ...parameters };
              if (currentCursor !== null) {
                nextParameters.cursor = currentCursor;
              }
              const res = await client.makeRequest({
                method: "get",
                parameters: nextParameters,
                storeName
              });
              span?.setAttributes({
                "blobs.response.status": res.status
              });
              let blobs = [];
              let directories = [];
              if (![200, 204, 404].includes(res.status)) {
                await discardBody(res);
                throw new BlobsInternalError(res);
              }
              if (res.status === 404) {
                await discardBody(res);
                done = true;
              } else {
                const page = await res.json();
                if (page.next_cursor) {
                  currentCursor = page.next_cursor;
                } else {
                  done = true;
                }
                blobs = (page.blobs ?? []).map(_Store.formatListResultBlob).filter(Boolean);
                directories = page.directories ?? [];
              }
              return {
                done: false,
                value: {
                  blobs,
                  directories
                }
              };
            });
          }
        };
      }
    };
  }
};
var getDeployStoreRegion = (clientOptions, context) => {
  if (clientOptions.region) {
    return clientOptions.region;
  }
  if (clientOptions.edgeURL || clientOptions.uncachedEdgeURL) {
    if (!context.primaryRegion) {
      throw new Error(
        "When accessing a deploy store, the Netlify Blobs client needs to be configured with a region, and one was not found in the environment. To manually set the region, set the `region` property in the store options. If you are using the Netlify CLI, you may have an outdated version; run `npm install -g netlify-cli@latest` to update and try again."
      );
    }
    return context.primaryRegion;
  }
  return REGION_AUTO;
};
var getStore = (input, options) => {
  if (typeof input === "string") {
    const contextOverride = options?.siteID && options?.token ? { siteID: options?.siteID, token: options?.token } : void 0;
    const clientOptions = getClientOptions(options ?? {}, contextOverride);
    const client = new Client(clientOptions);
    return new Store({ client, name: input });
  }
  if (typeof input?.name === "string") {
    const { name } = input;
    const contextOverride = input?.siteID && input?.token ? { siteID: input?.siteID, token: input?.token } : void 0;
    const clientOptions = getClientOptions(input, contextOverride);
    if (!name) {
      throw new MissingBlobsEnvironmentError(["name"]);
    }
    const client = new Client(clientOptions);
    return new Store({ client, name });
  }
  if (typeof input?.deployID === "string") {
    const context = getEnvironmentContext();
    const clientOptions = getClientOptions(input, context);
    const { deployID } = input;
    if (!deployID) {
      throw new MissingBlobsEnvironmentError(["deployID"]);
    }
    clientOptions.region = getDeployStoreRegion(clientOptions, context);
    const client = new Client(clientOptions);
    return new Store({ client, deployID });
  }
  throw new Error(
    "The `getStore` method requires the name of the store as a string or as the `name` property of an options object"
  );
};
var ConflictError = class extends Error {
  constructor(key) {
    super("Concurrent update on " + key);
    this.code = "CONFLICT";
  }
};
var BaseStore = class {
  // fn(current|null) → next value, or undefined to leave unchanged. Returns the stored value.
  async update(key, fn, { retries = 12 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const cur = await this.get(key);
      const next = await fn(cur ? structuredClone(cur.value) : null);
      if (next === void 0) return cur?.value ?? null;
      const ok = await this.set(key, next, cur ? { ifMatch: cur.etag } : { ifNew: true });
      if (ok) return next;
      await new Promise((r) => setTimeout(r, Math.random() * 15 * (attempt + 1)));
    }
    throw new ConflictError(key);
  }
};
var MemoryStore = class extends BaseStore {
  constructor() {
    super();
    this.map = /* @__PURE__ */ new Map();
    this.n = 0;
  }
  async get(key) {
    const e = this.map.get(key);
    return e ? { value: structuredClone(e.value), etag: e.etag } : null;
  }
  async set(key, value, { ifMatch, ifNew } = {}) {
    const e = this.map.get(key);
    if (ifNew && e) return false;
    if (ifMatch && (!e || e.etag !== ifMatch)) return false;
    this.map.set(key, { value: structuredClone(value), etag: "e" + ++this.n });
    return true;
  }
  async delete(key) {
    this.map.delete(key);
  }
  async list(prefix = "") {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
};
var FileStore = class extends BaseStore {
  constructor(dir) {
    super();
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.locks = /* @__PURE__ */ new Map();
  }
  file(key) {
    return path.join(this.dir, encodeURIComponent(key) + ".json");
  }
  async lock(key, fn) {
    const prev = this.locks.get(key) || Promise.resolve();
    let release;
    const next = new Promise((r) => {
      release = r;
    });
    this.locks.set(key, prev.then(() => next));
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }
  read(key) {
    try {
      const raw = fs.readFileSync(this.file(key), "utf8");
      const w = JSON.parse(raw);
      return { value: w.value, etag: w.etag };
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async get(key) {
    return this.read(key);
  }
  async set(key, value, { ifMatch, ifNew } = {}) {
    return this.lock(key, () => {
      const cur = this.read(key);
      if (ifNew && cur) return false;
      if (ifMatch && (!cur || cur.etag !== ifMatch)) return false;
      const etag = crypto4.randomBytes(8).toString("hex");
      const tmp = this.file(key) + "." + process.pid + "." + etag + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify({ etag, value }));
      fs.renameSync(tmp, this.file(key));
      return true;
    });
  }
  async delete(key) {
    try {
      fs.unlinkSync(this.file(key));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  async list(prefix = "") {
    return fs.readdirSync(this.dir).filter((f) => f.endsWith(".json")).map((f) => decodeURIComponent(f.slice(0, -5))).filter((k) => k.startsWith(prefix)).sort();
  }
};
var BlobsStore = class _BlobsStore extends BaseStore {
  constructor(store) {
    super();
    this.s = store;
  }
  static async open(name) {
    try {
      return new _BlobsStore(getStore({ name, consistency: "strong" }));
    } catch (err) {
      const e = new Error("Netlify Blobs is not available here: " + err.message);
      e.code = "STORE_UNAVAILABLE";
      throw e;
    }
  }
  async get(key) {
    const r = await this.s.getWithMetadata(key, { type: "json" });
    return r ? { value: r.data, etag: r.etag } : null;
  }
  async set(key, value, { ifMatch, ifNew } = {}) {
    const opts = ifMatch ? { onlyIfMatch: ifMatch } : ifNew ? { onlyIfNew: true } : {};
    const r = await this.s.setJSON(key, value, opts);
    return r?.modified !== false;
  }
  async delete(key) {
    await this.s.delete(key);
  }
  async list(prefix = "") {
    const r = await this.s.list({ prefix });
    return r.blobs.map((b) => b.key).sort();
  }
};
async function openStore(env = process.env) {
  const kind = env.LAB_STORE || (env.NETLIFY || env.NETLIFY_BLOBS_CONTEXT ? "blobs" : "file");
  if (kind === "memory") return new MemoryStore();
  if (kind === "blobs") return BlobsStore.open(env.LAB_STORE_NAME || (env.CONTEXT === "production" ? "garment-lab" : "garment-lab-preview"));
  return new FileStore(env.LAB_DATA_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data/lab"));
}
var API = "https://api.stripe.com/v1/";
function formEncode(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === void 0 || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formEncode(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out.join("&");
}
function createStripe({ secretKey, fetchImpl = globalThis.fetch }) {
  if (!secretKey) return null;
  const mode = secretKey.startsWith("sk_live_") ? "live" : "test";
  async function call(method, path2, params, idempotencyKey) {
    const res = await fetchImpl(API + path2, {
      method,
      headers: {
        Authorization: "Bearer " + secretKey,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
        ...idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}
      },
      body: method === "GET" ? void 0 : formEncode(params || {})
    });
    const json2 = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(json2?.error?.message || "Stripe request failed");
      e.status = res.status;
      e.stripe = json2?.error;
      throw e;
    }
    return json2;
  }
  return {
    mode,
    createCheckoutSession: (params, idempotencyKey) => call("POST", "checkout/sessions", params, idempotencyKey),
    expireCheckoutSession: (id) => call("POST", `checkout/sessions/${encodeURIComponent(id)}/expire`, {}),
    createRefund: (params, idempotencyKey) => call("POST", "refunds", params, idempotencyKey)
  };
}
function verifyStripeSignature(rawBody, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!secret || !header || typeof rawBody !== "string") return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = header.split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(now / 1e3 - t) > toleranceSec) return false;
  const want = crypto5.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === want.length && crypto5.timingSafeEqual(got, want);
  });
}
var JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
var json = (status, data, extra = {}) => ({ status, headers: { ...JSON_HEADERS, ...extra }, body: JSON.stringify(data) });
var MAX_BODY = 5 * 1024 * 1024;
var cached = null;
async function labFromEnv(env = process.env) {
  if (cached && cached.env === env) return cached.lab;
  const store = await openStore(env);
  const stripe = env.LAB_PAYMENT_PROVIDER === "square" ? null : createStripe({ secretKey: env.STRIPE_SECRET_KEY });
  const square = createSquare({ env });
  let labEnv = env;
  if (!env.LAB_SESSION_SECRET && env.LAB_PREVIEW === "true") {
    let s = (await store.get("preview-session-secret"))?.value;
    if (!s) {
      const fresh = (await import("node:crypto")).randomBytes(48).toString("base64url");
      await store.set("preview-session-secret", fresh, { ifNew: true });
      s = (await store.get("preview-session-secret")).value;
    }
    labEnv = { ...env, LAB_SESSION_SECRET: s };
  }
  const lab = createLab({ store, env: labEnv, stripe, square, artworkPool: ARTWORK_POOL.map((a) => a.id) });
  cached = { env, lab };
  return lab;
}
function createHandler(getLab, env = process.env) {
  return async function handle({ method, url, headers, rawBody = "", clientIP = "" }) {
    try {
      const path2 = url.pathname.replace(/^\/\.netlify\/functions\/lab/, "/api/lab").replace(/\/+$/, "");
      if (!path2.startsWith("/api/lab")) return json(404, { error: "Not found." });
      const route = path2.slice("/api/lab".length) || "/";
      if (rawBody.length > MAX_BODY) throw new LabError(413, "too_large", "Request too large.");
      if (method === "POST" && route === "/artwork" && (headers.origin && headers.origin !== url.origin || headers["sec-fetch-site"] === "cross-site")) throw new LabError(403, "cross_origin", "Upload artwork from this shop.");
      const lab = await getLab();
      const body = () => {
        try {
          return rawBody ? JSON.parse(rawBody) : {};
        } catch {
          throw new LabError(400, "bad_json", "Malformed JSON.");
        }
      };
      const auth = String(headers.authorization || "");
      const staff = auth.startsWith("Bearer ") ? await lab.staffFromToken(auth.slice(7)) : null;
      const origin = env.LAB_PUBLIC_URL || `${url.protocol}//${url.host}`;
      const seg = route.split("/").filter(Boolean);
      const is = (m, ...parts) => method === m && seg.length === parts.length && parts.every((p, i) => p === "*" || p === seg[i]);
      if (is("GET", "status")) return json(200, await lab.publicStatus());
      if (is("POST", "artwork")) return json(201, await lab.uploadArtwork(body(), clientIP));
      if (is("GET", "artwork", "*")) {
        const artwork = await lab.getArtwork(seg[1], url.searchParams.get("key"), staff);
        return { status: 200, headers: { "Content-Type": artwork.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer", "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(artwork.name) }, body: artwork.content };
      }
      if (is("POST", "checkout")) {
        const b = body();
        return json(200, await lab.checkout({ items: b.items, note: b.note, idempotencyKey: b.idempotencyKey, origin, shippingRegion: b.shippingRegion }));
      }
      if (is("GET", "orders", "*")) return json(200, await lab.customerOrder(seg[1], url.searchParams.get("key")));
      if (is("POST", "square-webhook")) {
        if (!verifySquareSignature(rawBody, headers["x-square-hmacsha256-signature"], env.SQUARE_WEBHOOK_SIGNATURE_KEY, env.SQUARE_WEBHOOK_URL)) return json(400, { error: "Invalid signature." });
        return json(200, await lab.handleSquareEvent(body()));
      }
      if (is("POST", "stripe-webhook")) {
        if (!verifyStripeSignature(rawBody, headers["stripe-signature"], env.STRIPE_WEBHOOK_SECRET)) return json(400, { error: "Invalid signature." });
        return json(200, await lab.handleEvent(JSON.parse(rawBody)));
      }
      if (is("POST", "test-gateway", "*")) return json(200, await lab.testGateway(seg[1], body()));
      if (is("POST", "waitlist")) return json(200, await lab.joinWaitlist(body()));
      if (is("GET", "archive")) return json(200, await lab.listArchive(null));
      if (is("GET", "archive", "*")) return json(200, await lab.getArchive(seg[1]));
      if (is("GET", "uploads", "*")) {
        const u = await lab.getUpload(seg[1], staff);
        return { status: 200, headers: { "Content-Type": u.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" }, body: u.bytes };
      }
      if (seg[0] === "admin") {
        if (is("POST", "admin", "login")) {
          const b = body();
          return json(200, await lab.login(b.email, b.password));
        }
        if (!staff) throw new LabError(401, "unauthorized", "Sign in to the studio.");
        if (is("GET", "admin", "me")) return json(200, staff);
        if (is("GET", "admin", "orders")) return json(200, await lab.listOrders(staff, Object.fromEntries(url.searchParams)));
        if (is("GET", "admin", "orders", "*")) return json(200, await lab.getOrder(staff, seg[2]));
        if (method === "POST" && seg[1] === "orders" && seg.length === 4) {
          const id = seg[2], b = body();
          switch (seg[3]) {
            case "production":
              return json(200, await lab.setProduction(staff, id, b.status));
            case "note":
              return json(200, await lab.addNote(staff, id, b.text));
            case "assign":
              return json(200, await lab.assign(staff, id, b.assignee));
            case "shipment":
              return json(200, await lab.recordShipment(staff, id, b));
            case "relic":
              return json(200, await lab.assignRelic(staff, id, b.index, b.contents));
            case "cancel":
              return json(200, await lab.cancelOrder(staff, id));
            case "refund":
              return json(200, await lab.refund(staff, id, b));
          }
        }
        if (is("GET", "admin", "stock")) return json(200, await lab.stock(staff));
        if (is("POST", "admin", "stock")) {
          const b = body();
          return json(200, await lab.setStock(staff, b.sku, b.onHand));
        }
        if (is("POST", "admin", "capacity")) {
          const b = body();
          return json(200, await lab.setSlot(staff, b.slot, b));
        }
        if (is("GET", "admin", "settings")) return json(200, await lab.getSettings(staff));
        if (is("POST", "admin", "settings")) return json(200, await lab.saveSettings(staff, body()));
        if (is("GET", "admin", "waitlist")) return json(200, await lab.listWaitlist(staff));
        if (is("POST", "admin", "uploads")) return json(200, await lab.upload(staff, body()));
        if (is("GET", "admin", "archive")) return json(200, await lab.listArchive(staff));
        if (is("POST", "admin", "archive")) return json(200, await lab.saveArchive(staff, body()));
        if (is("GET", "admin", "staff")) return json(200, await lab.listStaff(staff));
        if (is("POST", "admin", "staff")) return json(200, await lab.addStaff(staff, body()));
        if (is("POST", "admin", "staff", "active")) {
          const b = body();
          return json(200, await lab.setStaffActive(staff, b.email, b.active));
        }
      }
      return json(404, { error: "Not found." });
    } catch (e) {
      if (e instanceof LabError) return json(e.status, { error: e.message, code: e.code, ...e.extra || {} });
      if (e.code === "STORE_UNAVAILABLE") return json(503, { error: "The order store is not set up yet.", code: "store_unavailable" });
      if (e.code === "CONFLICT") return json(409, { error: "Busy \u2014 please try again.", code: "conflict" });
      if (e.code === "SQUARE_UNAVAILABLE") return json(502, { error: "Square could not be reached. Please retry the same request.", code: "payment_unavailable" });
      console.error("[lab]", e);
      return json(500, { error: "Something went wrong. Please retry or check your order status before starting another checkout." });
    }
  };
}

export { createHandler, labFromEnv, MAX_BODY, createLab, MemoryStore, ARTWORK_POOL, LabError };
