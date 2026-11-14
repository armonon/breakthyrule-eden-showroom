// Shared customer-artwork references. Files live in the order service, never in a design URL.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_UPLOAD_DIMENSION = 8192;
export const MAX_UPLOAD_PIXELS = 24000000;
export const MAX_UPLOAD_REFS = 4;
export const UPLOAD_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
export const isUploadId = id => typeof id === 'string' && /^upload_[a-f0-9]{32}$/.test(id);
const validKey = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
export const uploadName = name => typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\\/]/g, '_').trim().slice(0, 100) || 'Uploaded artwork' : 'Uploaded artwork';

export function normalizeUploadRefs(raw) {
  if (raw == null) return { ok: true, uploads: [], errors: [] };
  if (!Array.isArray(raw) || raw.length > MAX_UPLOAD_REFS) return { ok: false, uploads: [], errors: ['A garment can use up to four uploaded images.'] };
  const uploads = [], seen = new Set();
  for (const ref of raw) {
    if (!ref || !isUploadId(ref.id) || !validKey(ref.key) || !UPLOAD_MIMES.includes(ref.mime) ||
      !Number.isInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > MAX_UPLOAD_BYTES ||
      !Number.isInteger(ref.width) || !Number.isInteger(ref.height) || ref.width < 1 || ref.height < 1 ||
      ref.width > MAX_UPLOAD_DIMENSION || ref.height > MAX_UPLOAD_DIMENSION || ref.width * ref.height > MAX_UPLOAD_PIXELS ||
      (ref.sha256 != null && (typeof ref.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256)))) {
      return { ok: false, uploads: [], errors: ['An uploaded image reference is invalid. Upload the image again.'] };
    }
    if (seen.has(ref.id)) {
      if (uploads.find(item => item.id === ref.id).key !== ref.key) return { ok: false, uploads: [], errors: ['An uploaded image has conflicting access keys.'] };
      continue;
    }
    seen.add(ref.id);
    uploads.push({ id: ref.id, key: ref.key, name: uploadName(ref.name), mime: ref.mime, bytes: ref.bytes, width: ref.width, height: ref.height, ...(ref.sha256 ? { sha256: ref.sha256 } : {}) });
  }
  return { ok: true, uploads, errors: [] };
}

export function uploadForId(id, uploads = []) { return Array.isArray(uploads) ? uploads.find(ref => ref?.id === id && isUploadId(ref.id) && validKey(ref.key)) || null : null; }
export function uploadedArtworkUrl(ref) {
  if (!ref || !isUploadId(ref.id) || !validKey(ref.key)) throw new TypeError('Invalid uploaded artwork reference.');
  return '/api/lab/artwork/' + ref.id + '?key=' + ref.key;
}
