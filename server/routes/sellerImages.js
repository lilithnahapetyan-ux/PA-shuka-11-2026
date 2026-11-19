// Product images (seller, own products only).
//   POST   /seller/products/:id/images             multipart, field "images", 1–5 files
//   DELETE /seller/products/:id/images/:imageId
//   PUT    /seller/products/:id/images/:imageId/main   make this the main image
//
// Order of work (hard parts #2 and #9):
//   1. multer keeps uploads in memory and rejects anything over the size limit
//   2. each file is decoded to check it really is an image (a renamed .exe fails here)
//   3. resized files are written to disk — outside any transaction
//   4. one short transaction claims free positions and inserts the rows
//   If step 4 fails (e.g. too many images), the files from step 3 are deleted again.
import { Router } from 'express';
import multer from 'multer';
import db from '../db.js';
import { ApiError, badRequest, conflict, notFound } from '../errors.js';
import { requireSeller } from '../auth.js';
import { MAX_IMAGES, MAX_UPLOAD_MB, inspectImage, saveProductImage, deleteProductImageFiles } from '../images.js';
import { ownProduct, productImages } from './seller.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: MAX_IMAGES, fields: 5 },
}).array('images', MAX_IMAGES);

/** Runs multer and turns its errors into the API error shape with a clear message. */
function receiveImages(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, 'FILE_TOO_LARGE', `Each photo must be ${MAX_UPLOAD_MB} MB or smaller.`));
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new ApiError(400, 'TOO_MANY_FILES', `Upload up to ${MAX_IMAGES} photos, in the "images" field.`));
    }
    next(badRequest('Could not read the upload. Send the photos as multipart/form-data.'));
  });
}

/** Rewrites positions 0..n-1 in the given order. Must run inside a transaction. */
function rewritePositions(productId, orderedIds) {
  // Delete + re-insert keeps UNIQUE (product_id, position) and CHECK (0–4) satisfied
  // at every moment, which a series of in-place swaps would not.
  const rows = db.prepare('SELECT id, file_path FROM product_images WHERE product_id = ?').all(productId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  db.prepare('DELETE FROM product_images WHERE product_id = ?').run(productId);
  const insert = db.prepare('INSERT INTO product_images (id, product_id, file_path, position) VALUES (?, ?, ?, ?)');
  orderedIds.forEach((id, pos) => insert.run(id, productId, byId.get(id).file_path, pos));
}

const touchProduct = db.prepare(
  "UPDATE products SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
);

// POST /seller/products/:id/images
router.post('/seller/products/:id/images', requireSeller, receiveImages, async (req, res) => {
  const product = ownProduct(req);
  const files = req.files ?? [];
  if (files.length === 0) throw badRequest('Choose at least one photo.');

  // Quick count check before doing any slow work. The transaction below re-checks.
  const existing = productImages(product.id).length;
  if (existing + files.length > MAX_IMAGES) {
    throw conflict('TOO_MANY_IMAGES', `A product can have up to ${MAX_IMAGES} photos. It has ${existing}.`);
  }

  // Check every file before saving any, so one bad file rejects the whole upload.
  for (const f of files) {
    const problem = await inspectImage(f.buffer);
    if (problem) throw new ApiError(400, 'INVALID_IMAGE', `${f.originalname}: ${problem}`);
  }

  const keys = [];
  try {
    for (const f of files) keys.push(await saveProductImage(f.buffer, product.id));

    db.transaction(() => {
      const used = new Set(db.prepare('SELECT position FROM product_images WHERE product_id = ?')
        .all(product.id).map((r) => r.position));
      const free = [0, 1, 2, 3, 4].filter((p) => !used.has(p));
      if (free.length < keys.length) {
        throw conflict('TOO_MANY_IMAGES', `A product can have up to ${MAX_IMAGES} photos.`);
      }
      const insert = db.prepare('INSERT INTO product_images (product_id, file_path, position) VALUES (?, ?, ?)');
      keys.forEach((key, i) => insert.run(product.id, key, free[i]));
      touchProduct.run(product.id);
    }).immediate();
  } catch (e) {
    await Promise.all(keys.map(deleteProductImageFiles)); // no orphan files left on disk
    throw e;
  }

  res.status(201).json({ images: productImages(product.id) });
});

/** The image row, if it belongs to this (already ownership-checked) product. */
function imageOf(productId, rawId) {
  const id = /^\d+$/.test(rawId) ? Number(rawId) : null;
  const img = id && db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(id, productId);
  if (!img) throw notFound('Image not found.');
  return img;
}

// DELETE /seller/products/:id/images/:imageId
router.delete('/seller/products/:id/images/:imageId', requireSeller, async (req, res) => {
  const product = ownProduct(req);
  const img = imageOf(product.id, req.params.imageId);

  db.transaction(() => {
    const remaining = db.prepare('SELECT id FROM product_images WHERE product_id = ? AND id <> ? ORDER BY position')
      .all(product.id, img.id).map((r) => r.id);
    const published = db.prepare('SELECT is_published FROM products WHERE id = ?').get(product.id).is_published;
    if (remaining.length === 0 && published === 1) {
      throw conflict('LAST_IMAGE', 'A published product needs at least one photo. Unpublish it first, or add another photo.');
    }
    rewritePositions(product.id, remaining); // the next photo becomes main if the main one was deleted
    touchProduct.run(product.id);
  }).immediate();

  await deleteProductImageFiles(img.file_path); // after commit, outside the transaction
  res.json({ images: productImages(product.id) });
});

// PUT /seller/products/:id/images/:imageId/main
router.put('/seller/products/:id/images/:imageId/main', requireSeller, (req, res) => {
  const product = ownProduct(req);
  const img = imageOf(product.id, req.params.imageId);

  db.transaction(() => {
    const others = db.prepare('SELECT id FROM product_images WHERE product_id = ? AND id <> ? ORDER BY position')
      .all(product.id, img.id).map((r) => r.id);
    rewritePositions(product.id, [img.id, ...others]);
    touchProduct.run(product.id);
  }).immediate();

  res.json({ images: productImages(product.id) });
});

export default router;
