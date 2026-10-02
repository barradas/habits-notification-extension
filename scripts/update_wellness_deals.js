const fs = require('fs');
const path = require('path');

const PRODUCT_CATEGORIES = [
  {
    id: "hydration_1",
    category: "Hydration",
    fallback_title: "LARQ Smart Self-Cleaning Water Bottle",
    fallback_desc: "Uses UV-C LED light to sanitize water & clean inner bottle surfaces automatically.",
    fallback_price: "$99.00",
    fallback_rating: "★ 4.8",
    badge_class: "hydration",
    image_url: "/icons/product-bottle.png",
    direct_url: "https://www.amazon.com/dp/B07G2CS3PL?tag=deskhabits-20"
  },
  {
    id: "posture_1",
    category: "Posture",
    fallback_title: "Everlasting Comfort Memory Foam Cushion",
    fallback_desc: "Ergonomic U-shape cut-out relieves tailbone pressure & improves posture during long hours.",
    fallback_price: "$39.95",
    fallback_rating: "★ 4.9",
    badge_class: "posture",
    image_url: "/icons/product-cushion.png",
    direct_url: "https://www.amazon.com/dp/B01EBDV9BU?tag=deskhabits-20"
  },
  {
    id: "recovery_1",
    category: "Recovery",
    fallback_title: "Theragun Mini Deep Tissue Massage Gun",
    fallback_desc: "Ultra-portable massage gun designed to relieve neck stiffness & shoulder strain during breaks.",
    fallback_price: "$179.00",
    fallback_rating: "★ 4.8",
    badge_class: "recovery",
    image_url: "/icons/product-massage.png",
    direct_url: "https://www.amazon.com/dp/B0B5F4M7V4?tag=deskhabits-20"
  },
  {
    id: "eye_health_1",
    category: "Eye Health",
    fallback_title: "ANRRI Blue Light Blocking Glasses",
    fallback_desc: "Reduces digital eye strain, glare & headaches during extended screen & coding sessions.",
    fallback_price: "$25.95",
    fallback_rating: "★ 4.7",
    badge_class: "eye-health",
    image_url: "/icons/product-glasses.png",
    direct_url: "https://www.amazon.com/dp/B07D38JMB9?tag=deskhabits-20"
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
    affiliate_url: cat.direct_url
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
