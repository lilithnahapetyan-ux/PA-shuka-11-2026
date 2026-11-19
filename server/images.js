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
