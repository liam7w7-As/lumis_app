import { Image, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../config';
import { useTheme } from '../theme/ThemeContext';
import { useBusiness } from '../context/BusinessContext';
import { useAuth } from '../context/AuthContext';
import { mediaSource } from '../lib/api';

export function Logo({ size = 34, showTagline = true }: { size?: number; showTagline?: boolean }) {
  const { colors } = useTheme();
  const { business, rememberedBrand } = useBusiness();
  const { token } = useAuth();
  const name = token ? business?.nombre : rememberedBrand?.name;
  const logo = token ? business?.logo_url : rememberedBrand?.logoUri;
  return (
    <View style={styles.wrap}>
      {logo ? (
        <Image source={mediaSource(logo, token)} resizeMode="contain"
          accessibilityLabel={name ? 'Logo de ' + name : 'Logo de empresa'}
          style={{ width: size * 4.6, height: size * 1.7, backgroundColor: '#ffffff', borderRadius: 8 }} />
      ) : (
        <Text numberOfLines={1} style={[styles.text, { fontSize: name ? size * 0.72 : size, color: colors.logoInk }]}>
          {name || BRAND.name}
        </Text>
      )}
      {showTagline && <Text numberOfLines={1} style={[styles.sub, { color: colors.muted }]}>{name || BRAND.tagline}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { alignItems: 'center', maxWidth: 190 },
  text: { fontWeight: '700' },
  sub: { fontSize: 9, fontFamily: 'Poppins', marginTop: 3 },
});
