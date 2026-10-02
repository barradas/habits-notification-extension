const fs = require('fs');
const path = require('path');

const PRODUCT_CATEGORIES = [
  {
    id: "hydration_1",
    category: "Hydration",
    icon: "💧",
    title: "Smart Self-Cleaning Water Bottle",
    description: "Uses UV-C light to sanitize water and keep your desk bottle odor-free.",
    badge_class: "hydration",
    affiliate_url: "https://www.amazon.com/s?k=Smart+Self+Cleaning+Water+Bottle&tag=deskhabits-20"
  },
  {
    id: "posture_1",
    category: "Posture",
    icon: "🪑",
    title: "Ergonomic Memory Foam Seat Cushion",
    description: "Relieves tailbone pressure & supports spine posture for long sitting sessions.",
    badge_class: "posture",
    affiliate_url: "https://www.amazon.com/s?k=Ergonomic+Memory+Foam+Seat+Cushion&tag=deskhabits-20"
  },
  {
    id: "recovery_1",
    category: "Recovery",
    icon: "💆",
    title: "Mini Deep Tissue Massage Gun",
    description: "Compact massage tool to soothe neck stiffness & shoulder tension during work breaks.",
    badge_class: "recovery",
    affiliate_url: "https://www.amazon.com/s?k=Mini+Deep+Tissue+Massage+Gun&tag=deskhabits-20"
  },
  {
    id: "eye_health_1",
    category: "Eye Health",
    icon: "👓",
    title: "Blue Light Blocking Glasses",
    description: "Protects against glare and digital eye fatigue during extended screen time.",
    badge_class: "eye-health",
    affiliate_url: "https://www.amazon.com/s?k=Blue+Light+Blocking+Glasses&tag=deskhabits-20"
  }
];

async function updateDeals() {
  console.log('🔄 Running automated product feed updater...');
  const todayStr = new Date().toISOString().split('T')[0];

  const payload = {
    version: "1.0",
    updated_at: todayStr,
    auto_generated: true,
    deals: PRODUCT_CATEGORIES
  };

  const outputPath = path.join(__dirname, '..', 'wellness_deals.json');
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅ Automated product feed successfully updated at: ${outputPath}`);
}

updateDeals().catch(err => {
  console.error('❌ Error updating product feed:', err);
  process.exit(1);
});
