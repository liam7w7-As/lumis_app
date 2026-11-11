const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Cada servidor necesita su propia caché de variables públicas compiladas.
config.cacheVersion = [config.cacheVersion ?? '', process.env.EXPO_PUBLIC_BACKEND ?? 'lumis', process.env.EXPO_PUBLIC_API_URL ?? ''].join(':');
// PDF.js se ejecuta dentro de la WebView, no en Hermes.
config.resolver.assetExts.push('pdfjs');
module.exports = config;
