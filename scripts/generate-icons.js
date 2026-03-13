import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'electron', 'assets');

function drawBubble(ctx, size, alertDot = false) {
  const s = size;
  const cx = s / 2;
  const cy = s * 0.42;
  const bw = s * 0.7;
  const bh = s * 0.5;

  // Background — transparent
  ctx.clearRect(0, 0, s, s);

  // Message bubble
  ctx.beginPath();
  const rx = bw / 2;
  const ry = bh / 2;
  const r = s * 0.15; // corner radius

  // Rounded rectangle for bubble
  const left = cx - rx;
  const right = cx + rx;
  const top = cy - ry;
  const bottom = cy + ry;

  ctx.moveTo(left + r, top);
  ctx.lineTo(right - r, top);
  ctx.quadraticCurveTo(right, top, right, top + r);
  ctx.lineTo(right, bottom - r);
  ctx.quadraticCurveTo(right, bottom, right - r, bottom);
  // Tail
  ctx.lineTo(cx + s * 0.05, bottom);
  ctx.lineTo(cx - s * 0.08, bottom + s * 0.18);
  ctx.lineTo(cx - s * 0.05, bottom);
  ctx.lineTo(left + r, bottom);
  ctx.quadraticCurveTo(left, bottom, left, bottom - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();

  // Fill with iMessage blue
  ctx.fillStyle = '#34AADC';
  ctx.fill();

  // Three dots inside bubble
  const dotR = s * 0.045;
  const dotY = cy;
  const dotSpacing = s * 0.12;
  ctx.fillStyle = '#FFFFFF';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(cx + i * dotSpacing, dotY, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Alert dot (red circle, top-right)
  if (alertDot) {
    const dotSize = s * 0.2;
    ctx.beginPath();
    ctx.arc(right - s * 0.02, top + s * 0.02, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = '#FF3B30';
    ctx.fill();
    // White border on dot
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = s * 0.04;
    ctx.stroke();
  }
}

// Generate 32x32 icons
for (const [filename, alert] of [['tray-icon.png', false], ['tray-icon-alert.png', true]]) {
  const size = 32;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawBubble(ctx, size, alert);
  const buf = canvas.toBuffer('image/png');
  const outPath = join(assetsDir, filename);
  writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length} bytes)`);
}

// Also generate 256x256 for the app icon (electron-builder needs larger)
{
  const size = 256;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawBubble(ctx, size, false);
  const buf = canvas.toBuffer('image/png');
  const outPath = join(assetsDir, 'icon.png');
  writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length} bytes)`);
}
