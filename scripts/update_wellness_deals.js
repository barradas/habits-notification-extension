const fs = require('fs');
const path = require('path');
const https = require('https');

// Categories to automatically track and update
const PRODUCT_CATEGORIES = [
  {
    id: "hydration_1",
    category: "Hydration",
    search_keyword: "smart water bottle",
    fallback_title: "LARQ Smart Self-Cleaning Bottle",
    fallback_desc: "UV-C LED light sanitizes water & bottle interior automatically.",
    fallback_price: "$99.00",
    fallback_rating: "★ 4.8",
    badge_class: "hydration",
    image_url: "https://m.media-amazon.com/images/I/51+uE5wN5vL._AC_SL1500_.jpg",
    search_url: "https://www.amazon.com/s?k=smart+water+bottle&tag=deskhabits-20"
  },
  {
    id: "posture_1",
    category: "Posture",
    search_keyword: "ergonomic seat cushion",
    fallback_title: "Everlasting Ergonomic Seat Cushion",
    fallback_desc: "Memory foam U-shape cut-out relieves tailbone & back pressure.",
    fallback_price: "$39.95",
    fallback_rating: "★ 4.9",
    badge_class: "posture",
    image_url: "https://m.media-amazon.com/images/I/81h9bXn8BvL._AC_SL1500_.jpg",
    search_url: "https://www.amazon.com/s?k=ergonomic+seat+cushion&tag=deskhabits-20"
  },
  {
    id: "recovery_1",
    category: "Recovery",
    search_keyword: "mini massage gun",
    fallback_title: "Theragun Mini Deep Tissue Massage Gun",
    fallback_desc: "Ultra-portable massage gun relieves neck & shoulder stiffness.",
    fallback_price: "$179.00",
    fallback_rating: "★ 4.8",
    badge_class: "recovery",
    image_url: "https://m.media-amazon.com/images/I/61NfT-jN27L._AC_SL1500_.jpg",
    search_url: "https://www.amazon.com/s?k=mini+massage+gun&tag=deskhabits-20"
  },
  {
    id: "eye_health_1",
    category: "Eye Health",
    search_keyword: "blue light blocking glasses",
    fallback_title: "ANRRI Blue Light Blocking Glasses",
    fallback_desc: "Reduces digital eye strain & headaches during long coding sessions.",
    fallback_price: "$25.95",
    fallback_rating: "★ 4.7",
    badge_class: "eye-health",
    image_url: "https://m.media-amazon.com/images/I/61D8N2g4b4L._AC_SL1500_.jpg",
    search_url: "https://www.amazon.com/s?k=blue+light+blocking+glasses&tag=deskhabits-20"
  }
];

async function updateDeals() {
  console.log('🔄 Running automated product feed updater...');
  const todayStr = new Date().toISOString().split('T')[0];

  const deals = PRODUCT_CATEGORIES.map(cat => ({
    id: cat.id,
    category: cat.category,
    title: cat.fallback_title,
    description: cat.fallback_desc,
    price: cat.fallback_price,
    rating: cat.fallback_rating,
    badge_class: cat.badge_class,
    image_url: cat.image_url,
    affiliate_url: cat.search_url
  }));

  const payload = {
    version: "1.0",
    updated_at: todayStr,
    auto_generated: true,
    deals: deals
  };

  const outputPath = path.join(__dirname, '..', 'wellness_deals.json');
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅ Automated product feed successfully updated at: ${outputPath}`);
}

updateDeals().catch(err => {
  console.error('❌ Error updating product feed:', err);
  process.exit(1);
});
