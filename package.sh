#!/bin/bash
set -e

# Define release info
VERSION=$(grep '"version"' manifest.json | cut -d '"' -f 4)
BUILD_DIR="dist"
ZIP_NAME="deskhabits-v${VERSION}.zip"

echo "📦 Packaging DeskHabits v${VERSION} for Chrome Web Store..."

# Ensure clean dist folder
mkdir -p "$BUILD_DIR"
rm -f "$BUILD_DIR/$ZIP_NAME"

# Zip only production files
zip -r "$BUILD_DIR/$ZIP_NAME" \
  manifest.json \
  background.js \
  wellness_deals.json \
  popup/ \
  icons/ \
  -x "*.DS_Store" "*.git*" "icons/generate_icons.py"

echo "✅ Production package created successfully at: $BUILD_DIR/$ZIP_NAME"
echo "🔍 Package Contents:"
unzip -l "$BUILD_DIR/$ZIP_NAME"
