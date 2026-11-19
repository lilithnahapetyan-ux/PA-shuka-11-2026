-- 001_init.sql — the ten Shuka tables.
-- Conventions:
--   * Every table is STRICT: a wrong type is rejected, not silently stored.
--   * Money is INTEGER dram (*_amd). Never REAL.
--   * Dates are ISO-8601 UTC text, e.g. 2026-11-19T13:05:00.123Z
--   * Booleans are INTEGER 0/1 with a CHECK.

-- 1. users ---------------------------------------------------------------
-- One account type. store_name stays NULL until the user becomes a seller.
-- UNIQUE allows many NULLs in SQLite, so "unique when set" needs nothing extra.
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  phone         TEXT    NOT NULL,
  store_name    TEXT    COLLATE NOCASE UNIQUE,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- 2. categories ----------------------------------------------------------
-- Flat list, filled only by the seed script (no admin panel).
CREATE TABLE categories (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE,
  slug TEXT    NOT NULL UNIQUE
) STRICT;

-- 3. products ------------------------------------------------------------
-- Products that were ordered are unpublished (is_published = 0), never deleted.
CREATE TABLE products (
  id           INTEGER PRIMARY KEY,
  seller_id    INTEGER NOT NULL REFERENCES users(id),
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  title        TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  description  TEXT    NOT NULL,
  price_amd    INTEGER NOT NULL CHECK (price_amd > 0),
  stock        INTEGER NOT NULL CHECK (stock >= 0),
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  rating_avg   REAL    NOT NULL DEFAULT 0 CHECK (rating_avg BETWEEN 0 AND 5),
  rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Category pages and the home page: published products in a category, newest first.
CREATE INDEX idx_products_category ON products (category_id, is_published, created_at);
-- Seller dashboard: "my products".
CREATE INDEX idx_products_seller ON products (seller_id);

-- 4. product_images ------------------------------------------------------
-- 1–5 images per product; position 0 is the main image.
-- file_path is a base key such as "products/12/8f3a2c"; the server derives the
-- two resized files from it: <key>-thumb.webp and <key>-large.webp.
-- The 5-image limit is enforced by the CHECK on position plus the UNIQUE pair.
CREATE TABLE product_images (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_path  TEXT    NOT NULL,
  position   INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  UNIQUE (product_id, position)
) STRICT;

-- 5. cart_items ----------------------------------------------------------
-- price_when_added lets the cart warn "price changed" (hard part #3).
CREATE TABLE cart_items (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  price_when_added INTEGER NOT NULL CHECK (price_when_added > 0),
  PRIMARY KEY (user_id, product_id)
) STRICT;

-- 6. orders --------------------------------------------------------------
-- One row per checkout. The delivery address is copied here at purchase time.
-- street holds street + building ("Abovyan 12"); apartment is optional (houses).
-- request_key is the random key the checkout page sends: UNIQUE stops double orders (hard part #7).
CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  buyer_id    INTEGER NOT NULL REFERENCES users(id),
  recipient   TEXT    NOT NULL CHECK (length(trim(recipient)) > 0),
  phone       TEXT    NOT NULL,
  region      TEXT    NOT NULL CHECK (region IN (
                'Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik',
                'Kotayk', 'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor')),
  city        TEXT    NOT NULL,
  street      TEXT    NOT NULL,
  apartment   TEXT,
  note        TEXT,
  total_amd   INTEGER NOT NULL CHECK (total_amd > 0),
  request_key TEXT    NOT NULL UNIQUE,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Buyer's "My orders", newest first.
CREATE INDEX idx_orders_buyer ON orders (buyer_id, created_at);

-- 7. seller_orders -------------------------------------------------------
-- One buyer order splits into one seller order per seller (hard part #4).
-- Each part has its own status; only the status endpoint changes it.
CREATE TABLE seller_orders (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id),
  seller_id    INTEGER NOT NULL REFERENCES users(id),
  status       TEXT    NOT NULL DEFAULT 'placed' CHECK (status IN (
                 'placed', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  subtotal_amd INTEGER NOT NULL CHECK (subtotal_amd > 0),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (order_id, seller_id)
) STRICT;

-- Seller dashboard tabs: "my orders with status X".
CREATE INDEX idx_seller_orders_seller ON seller_orders (seller_id, status);

-- 8. order_items ---------------------------------------------------------
-- Title and unit price are copied at purchase time (hard part #3):
-- editing a product later never changes a past order.
CREATE TABLE order_items (
  id              INTEGER PRIMARY KEY,
  seller_order_id INTEGER NOT NULL REFERENCES seller_orders(id),
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  title           TEXT    NOT NULL,
  unit_price_amd  INTEGER NOT NULL CHECK (unit_price_amd > 0),
  quantity        INTEGER NOT NULL CHECK (quantity > 0)
) STRICT;

CREATE INDEX idx_order_items_seller_order ON order_items (seller_order_id);
-- "Units sold" per product and "did this buyer receive this product?" for reviews.
CREATE INDEX idx_order_items_product ON order_items (product_id);

-- 9. status_history ------------------------------------------------------
-- One row per allowed status move. from_status is NULL for the first row (-> placed).
-- Insert only: the triggers below make UPDATE and DELETE fail.
CREATE TABLE status_history (
  id              INTEGER PRIMARY KEY,
  seller_order_id INTEGER NOT NULL REFERENCES seller_orders(id),
  from_status     TEXT    CHECK (from_status IN (
                    'placed', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  to_status       TEXT    NOT NULL CHECK (to_status IN (
                    'placed', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  changed_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_status_history_seller_order ON status_history (seller_order_id, created_at);

CREATE TRIGGER status_history_no_update
BEFORE UPDATE ON status_history
BEGIN
  SELECT RAISE(ABORT, 'status_history is insert-only');
END;

CREATE TRIGGER status_history_no_delete
BEFORE DELETE ON status_history
BEGIN
  SELECT RAISE(ABORT, 'status_history is insert-only');
END;

-- 10. reviews ------------------------------------------------------------
-- One review per buyer per product. "Only for delivered items" is checked by the server.
CREATE TABLE reviews (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  buyer_id   INTEGER NOT NULL REFERENCES users(id),
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (product_id, buyer_id)
) STRICT;

-- Product page: reviews newest first.
CREATE INDEX idx_reviews_product ON reviews (product_id, created_at);
