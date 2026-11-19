// Image storage (hard part #9): files go to UPLOADS_DIR, SQLite keeps only a base key.
// Every image is saved in two sizes; both names are derived from the key:
//   <key>-thumb.webp  400×400, cropped to a square (product cards, cart, tables)
//   <key>-large.webp  up to 1200 px on the long side (product page gallery)
// Never call these inside a database transaction: file work is slow (hard part #2).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { UPLOADS_DIR } from './config.js';

export const THUMB_SIZE = 400;
export const LARGE_SIZE = 1200;

export const MAX_IMAGES = 5;
export const MAX_UPLOAD_MB = 8;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MIN_SIDE = 200;

/**
 * Checks what a file really is by decoding it, not by trusting its name or MIME type,
 * so a renamed .exe is caught. Returns an error message, or null if the image is usable.
 */
export async function inspectImage(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    return 'This file is not an image. Use a JPEG, PNG or WebP photo.';
  }
  if (!ALLOWED_FORMATS.has(meta.format)) return 'Use a JPEG, PNG or WebP photo.';
  if (Math.min(meta.width, meta.height) < MIN_SIDE) return `Use a photo at least ${MIN_SIDE} × ${MIN_SIDE} pixels.`;
  return null;
}

/** Resize `input` (Buffer or file path) and write both versions. Returns the key. */
export async function saveProductImage(input, productId) {
  const key = `products/${productId}/${crypto.randomBytes(8).toString('hex')}`;
  await fs.mkdir(path.join(UPLOADS_DIR, 'products', String(productId)), { recursive: true });

  // rotate() applies the phone's EXIF orientation, so photos are not sideways.
  const source = sharp(input, { failOn: 'error' }).rotate();
  await Promise.all([
    source.clone()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(path.join(UPLOADS_DIR, `${key}-thumb.webp`)),
    source.clone()
      .resize(LARGE_SIZE, LARGE_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(UPLOADS_DIR, `${key}-large.webp`)),
  ]);
  return key;
}

/** Delete both files for a key. Missing files are ignored. */
export async function deleteProductImageFiles(key) {
  await Promise.all(['thumb', 'large'].map((size) =>
    fs.rm(path.join(UPLOADS_DIR, `${key}-${size}.webp`), { force: true })));
}

/** Public URLs for a key, as the API will return them. */
export function imageUrls(key) {
  return { thumb: `/uploads/${key}-thumb.webp`, large: `/uploads/${key}-large.webp` };
}
