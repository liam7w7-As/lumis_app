/** @param {import('expo/config').ConfigContext} context */
module.exports = ({ config }) => {
  const connected = process.env.APP_VARIANT === 'novaled' || process.env.EXPO_PUBLIC_BACKEND === 'novaled';
  const variant = connected ? {
    ...config,
    name: 'Lumis Novaled',
    scheme: 'lumis-novaled',
    android: { ...config.android, package: 'com.lumis.novaled' },
    ios: { ...config.ios, bundleIdentifier: 'com.lumis.novaled' },
  } : config;
  const requested = process.env.LUMIS_ANDROID_ARCHS;
  if (requested === undefined) return variant;
  const buildArchs = [...new Set(requested.split(',').map((value) => value.trim()))];
  const supported = new Set(['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']);
  if (!buildArchs.length || buildArchs.some((arch) => !supported.has(arch))) {
    throw new Error('LUMIS_ANDROID_ARCHS contiene una arquitectura Android no admitida.');
  }
  return {
    ...variant,
    plugins: (variant.plugins ?? []).map((plugin) => {
      if (!Array.isArray(plugin) || plugin[0] !== 'expo-build-properties') return plugin;
      const options = plugin[1] ?? {};
      return [plugin[0], { ...options, android: { ...options.android, buildArchs } }];
    }),
  };
};
