// Generates media/icon.png (128x128) from an inline SVG using ImageMagick.
// Run: node scripts/generate-icon.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Background -->
  <rect width="128" height="128" rx="22" fill="#1f6feb"/>

  <!-- Hook -->
  <rect x="58" y="10" width="12" height="16" rx="6" fill="#ffffff"/>

  <!-- Bell body (dome) -->
  <path d="M64 22
    C 40 22 26 40 26 62
    L 26 84
    L 102 84
    L 102 62
    C 102 40 88 22 64 22 Z"
    fill="#ffffff"/>

  <!-- Bell flare (bottom rim) -->
  <path d="M18 84
    Q 18 96 30 96
    L 98 96
    Q 110 96 110 84 Z"
    fill="#ffffff"/>

  <!-- Clapper -->
  <ellipse cx="64" cy="100" rx="9" ry="6" fill="#ffffff"/>
</svg>`;

const svgPath = path.join(__dirname, '..', 'media', '_icon_tmp.svg');
const outPath = path.join(__dirname, '..', 'media', 'icon.png');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(svgPath, svg);

try {
  execSync(`convert -background transparent -resize 128x128 "${svgPath}" "${outPath}"`, { stdio: 'inherit' });
  console.log('Icon written to media/icon.png');
} finally {
  fs.unlinkSync(svgPath);
}
