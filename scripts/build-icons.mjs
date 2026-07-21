/**
 * Generer FlowBooster-logo og PWA-ikoner fra kildelogo (hvit bakgrunn).
 * Kjør: node scripts/build-icons.mjs [sti/til/kilde.png]
 */

import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'icons');

const BG = { r: 0x0b, g: 0x0e, b: 0x13, alpha: 1 };

const defaultSource = join(
  process.env.HOME || '',
  '.cursor/projects/Users-ss-dev-treningsjournal/assets',
  'ChatGPT_Image_Jul_21__2026__01_00_58_PM-b022ea2c-7fee-420a-899c-48fdf79e01fd.png',
);

const source = resolve(process.argv[2] || join(iconsDir, 'flowbooster-logo.png') || defaultSource);

if (!existsSync(source)) {
  console.error(`Fant ikke kildelogo: ${source}`);
  process.exit(1);
}

/** Erstatt nesten-hvit bakgrunn med app-bakgrunn (#0b0e13). */
async function logoOnDarkBg(maxWidth) {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 235 && g > 235 && b > 235) {
      data[i] = BG.r;
      data[i + 1] = BG.g;
      data[i + 2] = BG.b;
      data[i + 3] = 255;
    }
  }

  let img = sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });

  if (maxWidth && info.width > maxWidth) {
    img = img.resize(maxWidth, null, { fit: 'inside' });
  }

  return img.png();
}

async function squareIcon(size, { padding = 0.12 } = {}) {
  const inner = Math.round(size * (1 - padding * 2));
  const logo = await logoOnDarkBg(inner);
  const logoBuf = await logo.toBuffer();
  const meta = await sharp(logoBuf).metadata();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{
      input: logoBuf,
      left: Math.round((size - meta.width) / 2),
      top: Math.round((size - meta.height) / 2),
    }])
    .png();
}

async function main() {
  console.log(`Kilde: ${source}`);

  await (await logoOnDarkBg(1024)).toFile(join(iconsDir, 'flowbooster-logo-dark.png'));
  console.log('  icons/flowbooster-logo-dark.png');

  await (await squareIcon(512, { padding: 0.1 })).toFile(join(iconsDir, 'icon-512.png'));
  console.log('  icons/icon-512.png');

  await (await squareIcon(192, { padding: 0.1 })).toFile(join(iconsDir, 'icon-192.png'));
  console.log('  icons/icon-192.png');

  await (await squareIcon(180, { padding: 0.1 })).toFile(join(iconsDir, 'apple-touch-icon.png'));
  console.log('  icons/apple-touch-icon.png');

  await (await squareIcon(512, { padding: 0.2 })).toFile(join(iconsDir, 'icon-512-maskable.png'));
  console.log('  icons/icon-512-maskable.png');

  // Behold original hvit variant for evt. lys tema / utskrift.
  if (source !== join(iconsDir, 'flowbooster-logo.png')) {
    await sharp(source).png().toFile(join(iconsDir, 'flowbooster-logo.png'));
    console.log('  icons/flowbooster-logo.png (kopi)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
