const fs = require('node:fs');
const path = require('node:path');
const { generateImageAsync, generateImageBackgroundAsync, compositeImagesAsync } = require('@expo/image-utils');

const projectRoot = path.resolve(__dirname, '..');
const assets = path.join(projectRoot, 'assets', 'novaled');
const source = path.join(assets, 'logo.png');

async function resize(width, height) {
  return (await generateImageAsync({ projectRoot, cacheType: 'novaled-brand' }, {
    src: source, width, height, resizeMode: 'contain',
  })).source;
}

(async () => {
  const canvas = (backgroundColor) => generateImageBackgroundAsync({
    width: 1024, height: 1024, resizeMode: 'contain', backgroundColor,
  });
  const icon = await compositeImagesAsync({
    foreground: await resize(880, 880), background: await canvas('#ffffff'), x: 72, y: 72,
  });
  fs.writeFileSync(path.join(assets, 'icon.png'), icon);
  const opaqueIcon = await generateImageAsync({ projectRoot, cacheType: 'novaled-brand-opaque' }, {
    src: path.join(assets, 'icon.png'), width: 1024, height: 1024,
    resizeMode: 'contain', backgroundColor: '#ffffff', removeTransparency: true,
  });
  fs.writeFileSync(path.join(assets, 'icon.png'), opaqueIcon.source);
  // Mantener el logotipo completo dentro del área segura de todas las máscaras.
  const adaptive = await compositeImagesAsync({
    foreground: await resize(600, 600), background: await canvas('#00000000'), x: 212, y: 212,
  });
  fs.writeFileSync(path.join(assets, 'android-icon-foreground.png'), adaptive);
  const favicon = await generateImageAsync({ projectRoot, cacheType: 'novaled-brand' }, {
    src: path.join(assets, 'icon.png'), width: 64, height: 64, resizeMode: 'contain',
  });
  fs.writeFileSync(path.join(assets, 'favicon.png'), favicon.source);
  console.log('Recursos de Novaled preparados: icono, adaptativo y favicon.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
