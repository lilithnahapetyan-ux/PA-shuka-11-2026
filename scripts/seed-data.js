// Demo content for the seed script. All names and stores are invented.
// Prices are whole dram. Stock is the stock *after* the demo orders below.

export const DEMO_PASSWORD = 'shuka-demo-2026';

export const categories = [
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Home & Kitchen', slug: 'home-kitchen' },
  { name: 'Clothing', slug: 'clothing' },
  { name: 'Beauty', slug: 'beauty' },
  { name: 'Books', slug: 'books' },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors' },
  { name: 'Toys & Kids', slug: 'toys-kids' },
  { name: 'Jewelry & Accessories', slug: 'jewelry-accessories' },
];

// `ref` is only used inside the seed to link rows; it is not stored.
export const users = [
  { ref: 'ararat', email: 'ararat@shuka.test', name: 'Aram Petrosyan', phone: '+374 91 100200', store: 'Ararat Tech' },
  { ref: 'vernissage', email: 'vernissage@shuka.test', name: 'Lusine Hakobyan', phone: '+374 93 300400', store: 'Vernissage Crafts' },
  { ref: 'kond', email: 'kond@shuka.test', name: 'Narek Sargsyan', phone: '+374 77 500600', store: 'Kond Home & Style' },
  { ref: 'anna', email: 'anna@shuka.test', name: 'Anna Grigoryan', phone: '+374 94 700800' },
  { ref: 'davit', email: 'davit@shuka.test', name: 'Davit Mkrtchyan', phone: '+374 98 900100' },
];

// [ref, seller, category slug, title, price_amd, stock, description, published?]
export const products = [
  // Ararat Tech
  ['earbuds', 'ararat', 'electronics', 'Wireless earbuds with charging case', 18900, 24, 'Bluetooth 5.3 earbuds with up to 6 hours of playback and three more charges in the case. Includes three sizes of ear tips.'],
  ['powerbank', 'ararat', 'electronics', 'Power bank, 20,000 mAh', 12500, 39, 'Charges a phone four to five times. Two USB-A ports and one USB-C port, with an LED charge indicator.'],
  ['keyboard', 'ararat', 'electronics', 'Mechanical keyboard, 87 keys', 34000, 8, 'Compact tenkeyless layout with brown switches and white backlight. Detachable USB-C cable.'],
  ['usbhub', 'ararat', 'electronics', 'USB-C hub, 7-in-1', 15900, 2, 'HDMI 4K, two USB-A 3.0, SD and microSD readers, USB-C power pass-through and Ethernet.'],
  ['webcam', 'ararat', 'electronics', 'Full HD webcam with microphone', 21000, 12, '1080p at 30 fps, automatic light correction and a privacy shutter. Clips onto any monitor.'],
  ['bulbs', 'ararat', 'electronics', 'Smart LED bulb, 2-pack', 7900, 0, 'E27 bulbs with warm-to-cool white and 16 million colours. Control from a phone app over Wi-Fi.'],
  ['speaker', 'ararat', 'electronics', 'Waterproof Bluetooth speaker', 16000, 11, 'IPX7 waterproof, 12 hours of playback, and a strap for hanging on a backpack.'],
  ['yogamat', 'ararat', 'sports-outdoors', 'Yoga mat, 6 mm', 9500, 28, 'Non-slip surface on both sides, with a carrying strap. 183 × 61 cm.'],
  ['bottle', 'ararat', 'sports-outdoors', 'Insulated steel water bottle, 750 ml', 6900, 50, 'Keeps drinks cold for 24 hours or hot for 12. Leak-proof lid with a loop.'],
  ['backpack', 'ararat', 'sports-outdoors', 'Hiking backpack, 30 L', 27500, 6, 'Padded back panel, rain cover and side pockets for bottles. Good for day hikes in Dilijan or Aragats.'],
  ['dumbbells', 'ararat', 'sports-outdoors', 'Adjustable dumbbell set, 2 × 10 kg', 45000, 3, 'Cast-iron plates with chrome handles and secure collars. Comes in a storage case.'],
  ['headlamp', 'ararat', 'sports-outdoors', 'Rechargeable headlamp', 5500, 20, '300 lumens, red light mode, USB charging. Weighs 80 g.'],
  ['blocks', 'ararat', 'toys-kids', 'Building blocks set, 120 pieces', 13500, 9, 'Compatible with major brick systems. Includes wheels, windows and an idea booklet. Ages 5+.'],
  ['rccar', 'ararat', 'toys-kids', 'Remote control off-road car', 19900, 6, '1:16 scale, 2.4 GHz remote, up to 25 km/h. Rechargeable battery included.'],

  // Vernissage Crafts
  ['ring', 'vernissage', 'jewelry-accessories', 'Silver ring with garnet', 24000, 5, 'Sterling silver band with a natural garnet. Handmade in Yerevan; sizes 16–19 on request in the delivery note.'],
  ['pendant', 'vernissage', 'jewelry-accessories', 'Pomegranate pendant, sterling silver', 18500, 7, 'A small pomegranate pendant on a 45 cm chain. Gift box included.'],
  ['bracelet', 'vernissage', 'jewelry-accessories', 'Hand-woven leather bracelet', 6500, 15, 'Braided brown leather with a magnetic clasp. One size fits most wrists.'],
  ['earrings', 'vernissage', 'jewelry-accessories', 'Obsidian stud earrings', 9800, 1, 'Polished Armenian obsidian set in sterling silver. 8 mm.'],
  ['scarf', 'vernissage', 'jewelry-accessories', 'Embroidered silk scarf', 14000, 9, 'Natural silk with traditional embroidered borders. 90 × 90 cm.'],
  ['bowl', 'vernissage', 'home-kitchen', 'Hand-painted ceramic bowl', 8500, 9, 'Glazed ceramic with a painted ornament. 18 cm wide; dishwasher safe.'],
  ['jazve', 'vernissage', 'home-kitchen', 'Copper jazve for coffee', 7200, 17, 'Hammered copper pot with a wooden handle, for two cups of Armenian coffee.'],
  ['teaglasses', 'vernissage', 'home-kitchen', 'Set of 6 tea glasses', 6000, 12, 'Classic armudi glasses with saucers. 100 ml each.'],
  ['board', 'vernissage', 'home-kitchen', 'Apricot wood cutting board', 11000, 8, 'Solid apricot wood, oiled and ready to use. 40 × 25 cm.'],
  ['cookbook', 'vernissage', 'books', 'Armenian home cooking, hardcover', 12000, 14, 'Eighty family recipes, from dolma to gata, with photos for every dish. English edition.'],
  ['sketchbook', 'vernissage', 'books', 'Yerevan city sketchbook', 5500, 20, 'Drawings of Yerevan streets and courtyards, with blank pages to add your own. A5.'],
  ['fairytales', 'vernissage', 'books', 'Illustrated Armenian fairy tales', 8900, 9, 'Twelve classic tales retold for children, with full-page illustrations.'],
  ['flashcards', 'vernissage', 'books', 'Armenian alphabet flashcards', 4200, 25, '39 cards, one per letter, each with a word and a picture. Ages 3+.'],

  // Kond Home & Style
  ['tablecloth', 'kond', 'home-kitchen', 'Linen tablecloth, 150 × 220 cm', 16500, 6, 'Stonewashed linen that softens with every wash. Natural oat colour.'],
  ['candle', 'kond', 'home-kitchen', 'Scented soy candle', 4500, 32, 'Fig and black tea scent, about 40 hours of burning time. Glass jar with a lid.'],
  ['sweater', 'kond', 'clothing', 'Merino wool sweater', 32000, 6, 'Fine-knit merino, warm without bulk. Unisex fit, sizes S–XL.'],
  ['tshirt', 'kond', 'clothing', 'Cotton crew-neck T-shirt', 6500, 60, 'Heavyweight organic cotton. Available in white, black and olive; choose in the delivery note.'],
  ['raincoat', 'kond', 'clothing', 'Waterproof rain jacket', 28000, 4, 'Taped seams, adjustable hood and a pocket that the jacket folds into.'],
  ['socks', 'kond', 'clothing', 'Knitted wool socks, 3 pairs', 5800, 40, 'Hand-knitted by a family workshop in Gyumri. One size, 38–43.'],
  ['denim', 'kond', 'clothing', 'Denim jacket', 24500, 5, 'Mid-wash cotton denim with metal buttons. Relaxed fit.'],
  ['beret', 'kond', 'clothing', 'Wool beret', 8000, 3, 'Classic felted wool beret. Last season; kept unpublished.', false],
  ['faceoil', 'kond', 'beauty', 'Apricot kernel face oil, 30 ml', 7500, 22, 'Cold-pressed apricot kernel oil for face and hair. Glass bottle with a dropper.'],
  ['soap', 'kond', 'beauty', 'Handmade olive oil soap, set of 3', 4800, 30, 'Olive oil, lavender and honey bars. Free from palm oil.'],
  ['rosewater', 'kond', 'beauty', 'Rosewater facial mist', 5200, 15, 'Distilled rose water in a spray bottle. 100 ml.'],
  ['shampoo', 'kond', 'beauty', 'Herbal shampoo bar', 3900, 25, 'Thyme and nettle. Lasts as long as two bottles of liquid shampoo.'],
  ['lipbalm', 'kond', 'beauty', 'Beeswax lip balm, 2-pack', 2900, 40, 'Beeswax, shea butter and a little mint.'],
  ['puzzle', 'kond', 'toys-kids', 'Wooden puzzle map of Armenia', 9000, 10, 'Each region is a piece, with its name in Armenian and English. 30 × 25 cm.'],
  ['bear', 'kond', 'toys-kids', 'Plush bear', 7500, 18, 'Soft, washable, 30 cm tall. Safe for ages 0+.'],
  ['paints', 'kond', 'toys-kids', 'Watercolour paint set for kids', 4900, 20, '12 colours, two brushes and a pad of thick paper.'],
];

// Demo order history so dashboards, ratings and status tabs are not empty.
// daysAgo: when the order was placed. Each part moves through `path` one day apart.
export const orders = [
  {
    buyer: 'anna', daysAgo: 20, requestKey: 'seed-order-1',
    address: { recipient: 'Anna Grigoryan', phone: '+374 94 700800', region: 'Yerevan', city: 'Yerevan', street: 'Tumanyan 21', apartment: '14', note: 'Call before arriving' },
    lines: [['earbuds', 1], ['ring', 1]],
    path: { ararat: ['confirmed', 'shipped', 'delivered'], vernissage: ['confirmed', 'shipped', 'delivered'] },
  },
  {
    buyer: 'davit', daysAgo: 12, requestKey: 'seed-order-2',
    address: { recipient: 'Davit Mkrtchyan', phone: '+374 98 900100', region: 'Shirak', city: 'Gyumri', street: 'Rijkov 5', apartment: null, note: null },
    lines: [['yogamat', 2], ['sweater', 1]],
    path: { ararat: ['confirmed', 'shipped', 'delivered'], kond: ['confirmed', 'shipped', 'delivered'] },
  },
  {
    buyer: 'davit', daysAgo: 8, requestKey: 'seed-order-3',
    address: { recipient: 'Davit Mkrtchyan', phone: '+374 98 900100', region: 'Shirak', city: 'Gyumri', street: 'Rijkov 5', apartment: null, note: null },
    lines: [['tshirt', 2]],
    path: { kond: ['cancelled'] }, cancelledBy: 'buyer',
  },
  {
    buyer: 'anna', daysAgo: 5, requestKey: 'seed-order-4',
    address: { recipient: 'Anna Grigoryan', phone: '+374 94 700800', region: 'Yerevan', city: 'Yerevan', street: 'Tumanyan 21', apartment: '14', note: null },
    lines: [['jazve', 1], ['candle', 3]],
    path: { vernissage: ['confirmed', 'shipped'], kond: ['confirmed'] },
  },
  {
    buyer: 'davit', daysAgo: 1, requestKey: 'seed-order-5',
    address: { recipient: 'Davit Mkrtchyan', phone: '+374 98 900100', region: 'Shirak', city: 'Gyumri', street: 'Rijkov 5', apartment: null, note: 'Leave with the neighbour if not home' },
    lines: [['powerbank', 1], ['bowl', 1]],
    path: {},
  },
];

// Reviews only on items that were delivered above.
export const reviews = [
  ['earbuds', 'anna', 5, 'Great sound for the price and the case lasts all week.', 15],
  ['ring', 'anna', 4, 'Beautiful stone. Took a few days longer than expected, but worth it.', 14],
  ['yogamat', 'davit', 4, 'Good grip, a bit of a smell for the first day.', 7],
  ['sweater', 'davit', 5, 'Warm, soft and not itchy at all.', 6],
];
