// Asset-only conversion: no Electron app or desktop window is launched.
// Set COMMAND_NOTE_IMAGE_MODULES to an existing node_modules folder containing
// sharp, or install sharp in a separate tooling environment.
const { createRequire } = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const imageRequire = process.env.COMMAND_NOTE_IMAGE_MODULES
  ? createRequire(path.join(path.resolve(process.env.COMMAND_NOTE_IMAGE_MODULES), '__commandnote_icons.cjs'))
  : require;
const sharp = imageRequire('sharp');

async function main() {
  const brand = path.join(root, 'public', 'brand');
  const svg = await fs.readFile(path.join(brand, 'commandnote.svg'));
  const tray = await fs.readFile(path.join(brand, 'tray.svg'));
  await fs.mkdir(path.join(root, 'resources'), { recursive: true });
  await sharp(svg, { density: 192 }).resize(512, 512).png().toFile(path.join(brand, 'commandnote.png'));
  await sharp(tray, { density: 384 }).resize(32, 32).png().toFile(path.join(brand, 'tray.png'));
  await fs.writeFile(path.join(root, 'public', 'favicon.svg'), svg);

  // Modern Windows ICO entries can contain PNG images. Keep all common sizes
  // so Explorer and the taskbar do not have to scale a single low-res bitmap.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map(size => sharp(svg, { density: 192 }).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  await fs.writeFile(path.join(root, 'resources', 'commandnote.ico'), Buffer.concat([header, ...images]));

  // Inspect the app at common icon sizes on light and dark backgrounds.
  const background = Buffer.from('<svg width="840" height="360" xmlns="http://www.w3.org/2000/svg"><rect width="420" height="360" fill="#f4f7f5"/><rect x="420" width="420" height="360" fill="#252d30"/></svg>');
  const layers = [];
  for (const base of [0, 420]) {
    const raster = size => {
      const image = sharp(svg, { density: 192 }).resize(size, size);
      return (base ? image.greyscale() : image).png().toBuffer();
    };
    layers.push({ input: await raster(216), left: base + 102, top: 28 });
    for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
      layers.push({ input: await raster(size), left: base + 55 + index * 66, top: 280 - Math.floor(size / 2) });
    }
  }
  await sharp(background).composite(layers).png().toFile(path.join(brand, 'preview.png'));
  console.log('Created SVG/PNG, 7-size Windows ICO, tray PNG, favicon and preview.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
