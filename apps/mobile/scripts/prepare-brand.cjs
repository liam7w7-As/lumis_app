const fs = require('node:fs');
const path = require('node:path');
const { generateImageAsync, generateImageBackgroundAsync, compositeImagesAsync } = require('@expo/image-utils');

const projectRoot = path.resolve(__dirname, '..');
const assets = path.join(projectRoot, 'assets');
const brand = path.join(assets, 'brand');
const color = '#5842F4';
async function resize(src, width, height, extra = {}) {
  return (await generateImageAsync({ projectRoot, cacheType: 'lumis-brand' }, {
    src, width, height, resizeMode: 'contain', ...extra,
  })).source;
}
(async () => {
  const logo = path.join(brand, 'source-logo.png');
  const icon = path.join(brand, 'source-icon.png');
  fs.writeFileSync(path.join(brand, 'lumis-logo.png'), await resize(logo, 768, 342));
  const appIcon = await resize(icon, 1024, 1024, { backgroundColor: color, removeTransparency: true });
  fs.writeFileSync(path.join(assets, 'icon.png'), appIcon);
  fs.writeFileSync(path.join(assets, 'splash-icon.png'), await resize(icon, 512, 512));
  fs.writeFileSync(path.join(assets, 'favicon.png'), await resize(icon, 64, 64));

  // El dibujo queda dentro de la zona segura; el launcher elige la máscara.
  const foreground = await resize(icon, 640, 640);
  const background = await generateImageBackgroundAsync({
    width: 1024, height: 1024, resizeMode: 'contain', backgroundColor: '#00000000',
  });
  const adaptive = await compositeImagesAsync({ foreground, background, x: 192, y: 192 });
  fs.writeFileSync(path.join(assets, 'android-icon-foreground.png'), adaptive);
  console.log('Recursos de Lumis preparados: logo, icono, adaptativo, splash y favicon.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
