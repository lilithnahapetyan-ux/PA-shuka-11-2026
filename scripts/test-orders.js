// Cart, checkout, buyer orders, seller orders, status flow and reviews: the teacher's demo, as code.
// Usage: npm run test:orders
import { startServer, client, reporter, loginAs, newBuyer, makeProduct, key, ADDRESS } from './lib/harness.js';

const server = await startServer();
const { check, finish } = reporter();
const B = server.base;

try {
  const ararat = await loginAs(B, 'ararat@shuka.test');
  const kond = await loginAs(B, 'kond@shuka.test');
  const lamp = await makeProduct(ararat, { title: 'Desk lamp', priceAmd: 12000, stock: 5, categorySlug: 'electronics' });
  const vase = await makeProduct(kond, { title: 'Clay vase', priceAmd: 7000, stock: 2 });
  const guest = client(B);
  const buyer = await newBuyer(B);

  // ---- Cart
  let r = await guest.get('/api/cart');
  check('cart signed out: 401', r.status === 401);
  r = await guest.put(`/api/cart/items/${lamp}`, { quantity: 1 });
  check('add to cart signed out: 401', r.status === 401);
  r = await ararat.put(`/api/cart/items/${lamp}`, { quantity: 1 });
  check("seller adds own product: 403 (can't buy own products)", r.status === 403);

  r = await buyer.put(`/api/cart/items/${lamp}`, { quantity: 2 });
  check('add 2 lamps: 200', r.status === 200 && r.json.cart.itemCount === 2);
  r = await buyer.put(`/api/cart/items/${vase}`, { quantity: 1 });
  const cart = r.json.cart;
  check('cart grouped by seller with subtotals', cart.groups.length === 2
    && cart.groups.find((g) => g.seller.storeName === 'Ararat Tech').subtotalAmd === 24000
    && cart.groups.find((g) => g.seller.storeName === 'Kond Home & Style').subtotalAmd === 7000);
  check('grand total 31,000 and can check out', cart.totalAmd === 31000 && cart.canCheckout === true);

  r = await buyer.put(`/api/cart/items/${vase}`, { quantity: 3 });
  check('quantity above stock: 409 "Only 2 left."', r.status === 409 && r.json.error.code === 'NOT_ENOUGH_STOCK' && r.json.error.message === 'Only 2 left.');
  r = await buyer.put(`/api/cart/items/${vase}`, { quantity: 0 });
  check('quantity 0: 400', r.status === 400);
  r = await buyer.put(`/api/cart/items/${vase}`, { quantity: 2 });
  check('change quantity to 2: 200', r.status === 200 && r.json.cart.itemCount === 4);
  r = await buyer.del(`/api/cart/items/${vase}`);
  check('remove item: 200, one group left', r.status === 200 && r.json.cart.groups.length === 1);
  await buyer.put(`/api/cart/items/${vase}`, { quantity: 1 });

  // Warnings when things change after adding
  await kond.patch(`/api/seller/products/${vase}`, { stock: 0 });
  r = await buyer.get('/api/cart');
  const vaseItem = r.json.cart.groups.flatMap((g) => g.items).find((i) => i.productId === vase);
  check('item sold out since added: SOLD_OUT warning, checkout blocked',
    vaseItem.warnings.some((w) => w.code === 'SOLD_OUT') && r.json.cart.canCheckout === false);
  await kond.patch(`/api/seller/products/${vase}`, { stock: 2 });

  // ---- Checkout validation
  r = await buyer.post('/api/orders', { requestKey: key() });
  const fields = r.json?.error?.fields ?? {};
  check('checkout with no address: 400 with a message per field',
    r.status === 400 && ['recipient', 'phone', 'region', 'city', 'street'].every((k) => fields[k]), Object.keys(fields).join(', '));
  r = await buyer.post('/api/orders', { ...ADDRESS, region: 'Moscow', requestKey: key() });
  check('region outside Armenia: 400', r.status === 400 && r.json.error.fields?.region);
  r = await buyer.post('/api/orders', { ...ADDRESS });
  check('checkout without a request key: 400', r.status === 400 && r.json.error.fields?.requestKey);
  r = await buyer.get('/api/orders/last-address');
  check('no previous order: last address is null', r.status === 200 && r.json.address === null);

  // ---- Place the order
  r = await buyer.post('/api/orders', { ...ADDRESS, requestKey: key() });
  const order = r.json?.order;
  check('place order: 201 with an order number', r.status === 201 && Number.isInteger(order?.id));
  check('one order split into 2 seller orders, both placed',
    order.parts.length === 2 && order.parts.every((p) => p.status === 'placed' && p.canCancel));
  check('total 31,000, cash on delivery, address copied', order.totalAmd === 31000 && order.payment === 'cash_on_delivery'
    && order.address.street === 'Abovyan 10' && order.address.note === 'Ring twice');
  check('each part starts with one history row (→ placed by buyer)',
    order.parts.every((p) => p.history.length === 1 && p.history[0].to === 'placed' && p.history[0].by === 'buyer'));
  r = await buyer.get('/api/cart');
  check('cart is empty after checkout', r.json.cart.itemCount === 0);
  check('stock reduced: lamp 5 → 3, vase 2 → 1',
    (await guest.get(`/api/products/${lamp}`)).json.product.stock === 3 && (await guest.get(`/api/products/${vase}`)).json.product.stock === 1);
  r = await buyer.get('/api/orders/last-address');
  check('last address is pre-filled from this order', r.json.address?.street === 'Abovyan 10' && r.json.address?.region === 'Yerevan');
  r = await buyer.post('/api/orders', { ...ADDRESS, requestKey: key() });
  check('checkout with an empty cart: 400 CART_EMPTY', r.status === 400 && r.json.error.code === 'CART_EMPTY');

  // ---- Buyer's order list and detail
  r = await buyer.get('/api/orders');
  check('my orders: number, date, total, a status per seller',
    r.json.items.length === 1 && r.json.items[0].id === order.id && r.json.items[0].parts.length === 2 && r.json.items[0].createdAt);

  // ---- Seller side
  const lampPart = order.parts.find((p) => p.seller.storeName === 'Ararat Tech');
  r = await ararat.get('/api/seller/orders?status=placed');
  check('seller tab "placed": the new order is there, with counts', r.json.items.some((o) => o.id === lampPart.id) && r.json.counts.placed >= 1);
  r = await ararat.get(`/api/seller/orders/${lampPart.id}`);
  const so = r.json.order;
  check("seller order: buyer's phone and full delivery address",
    so.delivery.phone === ADDRESS.phone && so.delivery.street === 'Abovyan 10' && so.delivery.apartment === '5' && so.delivery.note === 'Ring twice');
  check('seller order: only own items, at purchase price, cash to collect 24,000',
    so.items.length === 1 && so.items[0].title === 'Desk lamp' && so.items[0].unitPriceAmd === 12000 && so.cashToCollectAmd === 24000);
  check('seller order: allowed moves from placed are confirm or cancel', so.allowedMoves.join() === 'confirmed,cancelled');
  r = await ararat.get('/api/seller/orders?status=lost');
  check('unknown status tab: 400', r.status === 400);

  // Move through the lifecycle
  for (const to of ['confirmed', 'shipped', 'delivered']) {
    r = await ararat.post(`/api/seller/orders/${lampPart.id}/status`, { to });
    check(`seller moves order to ${to}: 200`, r.status === 200 && r.json.order.status === to);
  }
  check('history has 4 rows in order', r.json.order.history.map((h) => h.to).join() === 'placed,confirmed,shipped,delivered');
  check('delivered order has no more allowed moves', r.json.order.allowedMoves.length === 0);
  r = await ararat.post(`/api/seller/orders/${lampPart.id}/status`, { to: 'cancelled' });
  check('cancel a delivered order: 409', r.status === 409 && r.json.error.code === 'STATUS_NOT_ALLOWED');

  r = await buyer.get(`/api/orders/${order.id}`);
  const lampView = r.json.order.parts.find((p) => p.id === lampPart.id);
  check('buyer sees the status history of each part', lampView.status === 'delivered' && lampView.history.length === 4
    && r.json.order.parts.find((p) => p.id !== lampPart.id).status === 'placed');
  check('buyer can cancel the placed part but not the delivered one',
    lampView.canCancel === false && r.json.order.parts.find((p) => p.id !== lampPart.id).canCancel === true);
  check('delivered item shows "can review"', lampView.items[0].canReview === true);

  // Overview updates
  r = await ararat.get('/api/seller/overview');
  check('seller revenue includes the delivered 24,000 (37,900 + 24,000)', r.json.revenueLast30DaysAmd === 61900, String(r.json.revenueLast30DaysAmd));

  // ---- Reviews
  r = await buyer.post(`/api/products/${vase}/reviews`, { rating: 5, body: 'Lovely vase' });
  check('review an item not yet delivered: 403 NOT_DELIVERED', r.status === 403 && r.json.error.code === 'NOT_DELIVERED');
  const stranger = await newBuyer(B);
  r = await stranger.post(`/api/products/${lamp}/reviews`, { rating: 1, body: 'Never bought it' });
  check('review without buying: 403', r.status === 403);
  r = await buyer.post(`/api/products/${lamp}/reviews`, { rating: 9, body: '' });
  check('review with bad rating and empty text: 400 on both', r.status === 400 && r.json.error.fields?.rating && r.json.error.fields?.body);
  r = await buyer.post(`/api/products/${lamp}/reviews`, { rating: 4, body: 'Bright and sturdy.' });
  check('review a delivered item: 201', r.status === 201);
  check('product rating updated to 4.0 from 1 review', r.json.product.ratingAvg === 4 && r.json.product.ratingCount === 1);
  r = await guest.get(`/api/products/${lamp}`);
  check('product page shows the new rating', r.json.product.ratingAvg === 4 && r.json.product.ratingCount === 1);
  r = await guest.get(`/api/products/${lamp}/reviews`);
  check('review appears on the product, newest first', r.json.items[0].body === 'Bright and sturdy.');
  r = await buyer.post(`/api/products/${lamp}/reviews`, { rating: 5, body: 'Second try' });
  check('second review of the same product: 409 ALREADY_REVIEWED', r.status === 409 && r.json.error.code === 'ALREADY_REVIEWED');
  r = await buyer.get(`/api/orders/${order.id}`);
  check('order page now shows the item as reviewed', r.json.order.parts.find((p) => p.id === lampPart.id).items[0].reviewed === true);

  // ---- Seller cancels the other part (before shipping): stock comes back
  const vasePart = order.parts.find((p) => p.seller.storeName === 'Kond Home & Style');
  r = await kond.post(`/api/seller/orders/${vasePart.id}/status`, { to: 'cancelled' });
  check('seller cancels a placed order: 200', r.status === 200 && r.json.order.status === 'cancelled' && r.json.order.cashToCollectAmd === 0);
  check('vase stock returned 1 → 2', (await guest.get(`/api/products/${vase}`)).json.product.stock === 2);
  r = await buyer.get(`/api/orders/${order.id}`);
  check('buyer sees the part as cancelled, by the seller', r.json.order.parts.find((p) => p.id === vasePart.id).history.at(-1).by === 'seller');

  // ---- Price changed → accept → checkout works
  const b2 = await newBuyer(B);
  await b2.put(`/api/cart/items/${vase}`, { quantity: 1 });
  await kond.patch(`/api/seller/products/${vase}`, { priceAmd: 7500 });
  r = await b2.post('/api/orders', { ...ADDRESS, requestKey: key() });
  check('price changed: 409 PRICE_CHANGED with old and new price', r.status === 409 && r.json.error.code === 'PRICE_CHANGED'
    && r.json.error.items[0].oldPriceAmd === 7000 && r.json.error.items[0].newPriceAmd === 7500);
  r = await b2.post('/api/cart/accept-prices');
  check('accept new prices: warning gone, total 7,500', r.json.cart.canCheckout === true && r.json.cart.totalAmd === 7500);
  r = await b2.post('/api/orders', { ...ADDRESS, requestKey: key() });
  check('checkout after accepting: 201 at the new price', r.status === 201 && r.json.order.totalAmd === 7500);
} finally {
  server.stop();
}

process.exit(finish());
