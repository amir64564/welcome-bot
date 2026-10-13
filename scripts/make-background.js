// Generates the default branded background: node scripts/make-background.js
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs'); const path = require('path');
const W = 1024, H = 450; const c = createCanvas(W, H); const x = c.getContext('2d');
const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0f172a'); g.addColorStop(0.5, '#312e81'); g.addColorStop(1, '#6d28d9');
x.fillStyle = g; x.fillRect(0, 0, W, H);
x.globalAlpha = 0.12; x.fillStyle = '#ffffff';
for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(80 + i * 180, i % 2 ? 60 : 400, 90 + i * 8, 0, Math.PI * 2); x.fill(); }
x.globalAlpha = 1; x.strokeStyle = 'rgba(255,209,102,0.6)'; x.lineWidth = 4; x.strokeRect(14, 14, W - 28, H - 28);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'background.png'), c.toBuffer('image/png'));
console.log('assets/background.png written');
