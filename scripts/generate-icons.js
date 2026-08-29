/**
 * Run once to generate PNG icons for PWA:
 *   npm install --save-dev sharp
 *   node scripts/generate-icons.js
 *
 * Generates:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/apple-touch-icon.png  (180x180)
 */

const fs = require('node:fs')
const path = require('node:path')

const sharp = require('sharp')

const svgPath = path.join(__dirname, '../public/icons/icon.svg')
const outDir = path.join(__dirname, '../public/icons')

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

;(async () => {
  const svgBuffer = fs.readFileSync(svgPath)
  for (const { name, size } of sizes) {
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(outDir, name))
    console.log(`✓ Generated ${name} (${size}×${size})`)
  }
  console.log('\nAll icons generated. You can now uninstall sharp:\n  npm uninstall sharp')
})()
