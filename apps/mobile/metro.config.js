const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// PDF.js se ejecuta dentro de la WebView, no en Hermes.
config.resolver.assetExts.push('pdfjs');
module.exports = config;
