/**
 * Generer PWA-ikoner og evt. logo-varianter.
 *
 * App-ikon (kvadrat): node scripts/build-icons.mjs icons/app-icon-source.png
 * Horisontal logo:      node scripts/build-icons.mjs icons/flowbooster-logo.png --logo
 */

import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'icons');

const BG = { r: 0x0b, g: 0x0e, b: 0x13, alpha: 1 };

const args = process.argv.slice(2);
const logoMode = args.includes('--logo');
const sourceArg = args.find((a) => !a.startsWith('--'));

const defaultAppIcon = join(iconsDir, 'app-icon-source.png');
const defaultLogo = join(iconsDir, 'flowbooster-logo.png');

const source = resolve(
  sourceArg
  || (logoMode ? defaultLogo : defaultAppIcon),
);

if (!existsSync(source)) {
  console.error(`Fant ikke kilde: ${source}`);
  process.exit(1);
}

async function resizeAppIcon(size) {
  return sharp(source)
    .resize(size, size, { fit: 'cover' })
    .png();
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

async function squareLogoIcon(size, { padding = 0.12 } = {}) {
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

async function buildPwaFromAppIcon() {
  await (await resizeAppIcon(512)).toFile(join(iconsDir, 'icon-512.png'));
  console.log('  icons/icon-512.png');

  await (await resizeAppIcon(192)).toFile(join(iconsDir, 'icon-192.png'));
  console.log('  icons/icon-192.png');

  await (await resizeAppIcon(180)).toFile(join(iconsDir, 'apple-touch-icon.png'));
  console.log('  icons/apple-touch-icon.png');

  // Maskable: litt mindre for Androids safe zone
  const maskSize = 512;
  const inner = Math.round(maskSize * 0.82);
  const innerBuf = await (await resizeAppIcon(inner)).toBuffer();
  await sharp({
    create: { width: maskSize, height: maskSize, channels: 4, background: BG },
  })
    .composite([{
      input: innerBuf,
      left: Math.round((maskSize - inner) / 2),
      top: Math.round((maskSize - inner) / 2),
    }])
    .png()
    .toFile(join(iconsDir, 'icon-512-maskable.png'));
  console.log('  icons/icon-512-maskable.png');
}

async function buildFromLogo() {
  await (await logoOnDarkBg(1024)).toFile(join(iconsDir, 'flowbooster-logo-dark.png'));
  console.log('  icons/flowbooster-logo-dark.png');

  await (await squareLogoIcon(512, { padding: 0.1 })).toFile(join(iconsDir, 'icon-512.png'));
  await (await squareLogoIcon(192, { padding: 0.1 })).toFile(join(iconsDir, 'icon-192.png'));
  await (await squareLogoIcon(180, { padding: 0.1 })).toFile(join(iconsDir, 'apple-touch-icon.png'));
  await (await squareLogoIcon(512, { padding: 0.2 })).toFile(join(iconsDir, 'icon-512-maskable.png'));
  console.log('  icons/icon-*.png (fra logo)');
}

async function main() {
  console.log(`Kilde: ${source}`);

  const meta = await sharp(source).metadata();
  const isSquare = meta.width && meta.height && Math.abs(meta.width - meta.height) < 8;
  const useAppIcon = !logoMode && (isSquare || source.includes('app-icon'));

  if (useAppIcon) {
    await buildPwaFromAppIcon();
  } else {
    await buildFromLogo();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
