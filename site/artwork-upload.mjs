import { MAX_UPLOAD_BYTES, MAX_UPLOAD_DIMENSION, MAX_UPLOAD_PIXELS, UPLOAD_MIMES, normalizeUploadRefs, uploadedArtworkUrl } from '/labkit/custom-artwork.mjs';

// Send the original print file. Never resize or recompress a customer's artwork.
export async function uploadArtworkFile(file) {
  if (!file || !UPLOAD_MIMES.includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.');
  if (!file.size) throw new Error('That file is empty. Choose another image.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Choose an image no larger than 3 MB.');
  // Header checks cannot tell whether the pixel data is intact. Decode locally
  // for validation only; the original bytes below remain the uploaded file.
  let width, height;
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width; height = bitmap.height; bitmap.close();
    } else {
      const url = URL.createObjectURL(file);
      try { const image = new Image(); image.src = url; await image.decode(); width = image.naturalWidth; height = image.naturalHeight; }
      finally { URL.revokeObjectURL(url); }
    }
  } catch { throw new Error('That image could not be opened. Choose a valid PNG, JPEG, or WebP file.'); }
  if (!width || !height || width > MAX_UPLOAD_DIMENSION || height > MAX_UPLOAD_DIMENSION || width * height > MAX_UPLOAD_PIXELS) {
    throw new Error('Choose an image up to 8192 pixels per side and 24 megapixels in total.');
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('That image could not be read. Try choosing it again.'));
    reader.onabort = () => reject(new Error('The upload was cancelled.'));
    reader.readAsDataURL(file);
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch('/api/lab/artwork', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ name: file.name || 'Uploaded graphic', dataUrl })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Your graphic could not be saved. Please try again.');
    const normalized = normalizeUploadRefs([result.asset]);
    if (!normalized.ok || normalized.uploads.length !== 1) throw new Error('The upload response was incomplete. Please try again.');
    const asset = normalized.uploads[0];
    return { asset, url: uploadedArtworkUrl(asset) };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The upload took too long. Please try again.');
    if (error instanceof TypeError) throw new Error('The upload could not connect. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timer); }
}
