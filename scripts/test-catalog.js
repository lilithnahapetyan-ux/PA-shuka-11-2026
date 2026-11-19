// Step 4 checks: categories, search, filters, sort, pagination, product page, reviews.
// Usage: npm run test:catalog
import { startServer, client, reporter } from './lib/harness.js';

const server = await startServer();
const { check, finish } = reporter();
const guest = client(server.base);
const list = async (qs = '') => (await guest.get(`/api/products${qs}`)).json;
const isSorted = (xs, cmp) => xs.every((x, i) => i === 0 || cmp(xs[i - 1], x) <= 0);
const findId = async (title) => (await list(`?q=${encodeURIComponent(title)}`)).items.find((p) => p.title === title)?.id;

try {
  // Categories
  let r = await guest.get('/api/categories');
  const cats = r.json?.categories ?? [];
  check('categories: 8, with slugs', r.status === 200 && cats.length === 8 && cats.every((c) => c.slug));
  check('category counts add up to 42 published products', cats.reduce((s, c) => s + c.productCount, 0) === 42);

  // Default list and pagination
  let p1 = await list();
  check('default list: 42 published products, 24 per page, 2 pages',
    p1.total === 42 && p1.items.length === 24 && p1.pages === 2 && p1.page === 1, `total ${p1.total}`);
  const p2 = await list('?page=2');
  check('page 2 has the remaining 18', p2.items.length === 18);
  const ids = [...p1.items, ...p2.items].map((p) => p.id);
  check('no product repeated across pages', new Set(ids).size === 42);
  check('unpublished product is not listed', !ids.some((id) => id === undefined) && !(await list('?q=beret')).total);
  check('page past the end: empty items, same total', (await list('?page=9')).items.length === 0);

  // Card shape
  const card = p1.items[0];
  check('card has image URLs, price, rating, seller store name',
    card.image?.thumb?.startsWith('/uploads/') && Number.isInteger(card.priceAmd) && 'ratingAvg' in card && card.seller?.storeName);
  check('card leaks no description, phone or email', !('description' in card) && !/phone|email/.test(JSON.stringify(p1)));
  const img = await fetch(server.base + card.image.thumb);
  check('card thumbnail URL serves a webp image', img.status === 200 && img.headers.get('content-type') === 'image/webp');

  // Sorting
  check('sort newest (default): newest first', isSorted(p1.items, (a, b) => b.createdAt.localeCompare(a.createdAt)));
  const asc = (await list('?sort=price_asc&pageSize=48')).items;
  check('sort price_asc: low to high', isSorted(asc, (a, b) => a.priceAmd - b.priceAmd));
  const desc = (await list('?sort=price_desc&pageSize=48')).items;
  check('sort price_desc: high to low', isSorted(desc, (a, b) => b.priceAmd - a.priceAmd));
  const byRating = (await list('?sort=rating')).items;
  check('sort rating: rated products first, 5 stars on top', byRating[0].ratingAvg === 5 && isSorted(byRating, (a, b) => b.ratingAvg - a.ratingAvg));

  // Search
  let s = await list('?q=silver');
  check('search "silver": finds ring and pendant', ['Silver ring with garnet', 'Pomegranate pendant, sterling silver'].every((t) => s.items.some((p) => p.title === t)));
  s = await list('?q=SILVER');
  check('search is case-insensitive (Latin letters)', s.total >= 2);
  s = await list('?q=Dilijan');
  check('search matches the description, not only the title', s.items.some((p) => p.title === 'Hiking backpack, 30 L'));
  s = await list('?q=silver%20garnet');
  check('search with two words: both must match', s.total === 1 && s.items[0].title === 'Silver ring with garnet');
  s = await list('?q=%25');
  check('search "%" is literal, not a wildcard', s.total === 0);
  s = await list('?q=zzzzz');
  check('search with no match: total 0', s.total === 0 && s.items.length === 0);

  // Filters
  const jewelry = await list('?category=jewelry-accessories');
  check('filter by category: 5 jewelry products', jewelry.total === 5 && jewelry.items.every((p) => p.category.slug === 'jewelry-accessories'));
  const range = await list('?minPrice=10000&maxPrice=20000&pageSize=48');
  check('filter by price range: all within 10,000–20,000', range.total > 0 && range.items.every((p) => p.priceAmd >= 10000 && p.priceAmd <= 20000));
  const combo = await list('?category=electronics&maxPrice=16000&sort=price_asc');
  check('category + price + sort combined', combo.items.every((p) => p.category.slug === 'electronics' && p.priceAmd <= 16000)
    && isSorted(combo.items, (a, b) => a.priceAmd - b.priceAmd));
  check('unknown category: empty result, not an error', (await list('?category=nope')).total === 0);

  // Invalid input → 400 with fields
  r = await guest.get('/api/products?minPrice=abc');
  check('minPrice=abc: 400 on minPrice', r.status === 400 && r.json.error.fields?.minPrice);
  r = await guest.get('/api/products?minPrice=5000&maxPrice=100');
  check('min above max: 400 on maxPrice', r.status === 400 && r.json.error.fields?.maxPrice);
  r = await guest.get('/api/products?sort=cheapest');
  check('unknown sort: 400 on sort', r.status === 400 && r.json.error.fields?.sort);
  r = await guest.get('/api/products?page=0');
  check('page=0: 400 on page', r.status === 400 && r.json.error.fields?.page);
  r = await guest.get('/api/products?pageSize=1000');
  check('pageSize=1000: 400 on pageSize', r.status === 400 && r.json.error.fields?.pageSize);

  // Product page
  const earbudsId = await findId('Wireless earbuds with charging case');
  r = await guest.get(`/api/products/${earbudsId}`);
  const prod = r.json?.product;
  check('product page: title, description, price, stock, seller, category',
    r.status === 200 && prod.description && prod.stock === 24 && prod.seller.storeName === 'Ararat Tech' && prod.category.slug === 'electronics');
  check('product page: images ordered by position, each with thumb and large',
    prod.images.length >= 1 && prod.images.every((im, i) => im.position === i && im.thumb && im.large));
  check('product page: rating from the seeded review', prod.ratingAvg === 5 && prod.ratingCount === 1);

  r = await guest.get('/api/products/abc');
  check('product id "abc": 404', r.status === 404 && r.json?.error?.code === 'NOT_FOUND');
  r = await guest.get('/api/products/999999');
  check('missing product: 404', r.status === 404);

  // Unpublished: 404 to everyone except its own seller
  const owner = client(server.base);
  await owner.post('/api/auth/login', { email: 'kond@shuka.test', password: 'shuka-demo-2026' });
  const other = client(server.base);
  await other.post('/api/auth/login', { email: 'ararat@shuka.test', password: 'shuka-demo-2026' });
  const mine = await owner.get('/api/products?q=beret');
  check('owner does not see own unpublished product in the public list either', mine.json.total === 0);
  // Find the beret's id through the owner's product page by scanning ids (no seller API yet).
  let beretId;
  for (let id = 1; id <= 43 && !beretId; id++) {
    const x = await owner.get(`/api/products/${id}`);
    if (x.json?.product?.title === 'Wool beret') beretId = id;
  }
  check('unpublished product: owner can open it', Boolean(beretId));
  r = await guest.get(`/api/products/${beretId}`);
  check('unpublished product: guest gets 404', r.status === 404);
  r = await other.get(`/api/products/${beretId}`);
  check('unpublished product: another seller gets 404', r.status === 404);

  // Reviews
  r = await guest.get(`/api/products/${earbudsId}/reviews`);
  const rev = r.json?.items?.[0];
  check('reviews: one review, 5 stars, with text', r.status === 200 && r.json.total === 1 && rev.rating === 5 && rev.body);
  check('reviews: buyer shown as "Anna G.", no id or email', rev.buyerName === 'Anna G.' && !/buyer_?id|email/i.test(JSON.stringify(r.json)));
  r = await guest.get(`/api/products/${beretId}/reviews`);
  check('reviews of an unpublished product: 404 for guests', r.status === 404);
} finally {
  server.stop();
}

process.exit(finish());
