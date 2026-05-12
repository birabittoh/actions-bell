// Generates media/icon.png (128x128) using node-canvas (no system deps).
// Run: node scripts/generate-icon.js
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 128;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

// Background with rounded corners (rx=22)
const R = 22;
ctx.fillStyle = '#1f6feb';
ctx.beginPath();
ctx.moveTo(R, 0);
ctx.lineTo(SIZE - R, 0);
ctx.quadraticCurveTo(SIZE, 0, SIZE, R);
ctx.lineTo(SIZE, SIZE - R);
ctx.quadraticCurveTo(SIZE, SIZE, SIZE - R, SIZE);
ctx.lineTo(R, SIZE);
ctx.quadraticCurveTo(0, SIZE, 0, SIZE - R);
ctx.lineTo(0, R);
ctx.quadraticCurveTo(0, 0, R, 0);
ctx.closePath();
ctx.fill();

ctx.fillStyle = '#ffffff';

// Hook: rect x=58 y=10 w=12 h=16 rx=6
const [hx, hy, hw, hh, hr] = [58, 10, 12, 16, 6];
ctx.beginPath();
ctx.moveTo(hx + hr, hy);
ctx.lineTo(hx + hw - hr, hy);
ctx.quadraticCurveTo(hx + hw, hy, hx + hw, hy + hr);
ctx.lineTo(hx + hw, hy + hh - hr);
ctx.quadraticCurveTo(hx + hw, hy + hh, hx + hw - hr, hy + hh);
ctx.lineTo(hx + hr, hy + hh);
ctx.quadraticCurveTo(hx, hy + hh, hx, hy + hh - hr);
ctx.lineTo(hx, hy + hr);
ctx.quadraticCurveTo(hx, hy, hx + hr, hy);
ctx.closePath();
ctx.fill();

// Bell body: M64 22 C 40 22 26 40 26 62 L 26 84 L 102 84 L 102 62 C 102 40 88 22 64 22 Z
ctx.beginPath();
ctx.moveTo(64, 22);
ctx.bezierCurveTo(40, 22, 26, 40, 26, 62);
ctx.lineTo(26, 84);
ctx.lineTo(102, 84);
ctx.lineTo(102, 62);
ctx.bezierCurveTo(102, 40, 88, 22, 64, 22);
ctx.closePath();
ctx.fill();

// Bell flare: M18 84 Q 18 96 30 96 L 98 96 Q 110 96 110 84 Z
ctx.beginPath();
ctx.moveTo(18, 84);
ctx.quadraticCurveTo(18, 96, 30, 96);
ctx.lineTo(98, 96);
ctx.quadraticCurveTo(110, 96, 110, 84);
ctx.closePath();
ctx.fill();

// Clapper: ellipse cx=64 cy=100 rx=9 ry=6
ctx.beginPath();
ctx.ellipse(64, 100, 9, 6, 0, 0, Math.PI * 2);
ctx.fill();

const outPath = path.join(__dirname, '..', 'media', 'icon.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log('Icon written to media/icon.png');
