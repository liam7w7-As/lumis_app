import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useBusiness } from '../context/BusinessContext';
import { useAuth } from '../context/AuthContext';
import { mediaSource } from '../lib/api';

const LUMIS_LOGO = require('../../assets/brand/lumis-logo.png');

export function Logo({ size = 34, showTagline = true, imageOnly = false }: {
  size?: number; showTagline?: boolean; imageOnly?: boolean;
}) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const { colors } = useTheme();
  const { business, rememberedBrand } = useBusiness();
  const { token } = useAuth();
  const name = token ? business?.nombre : rememberedBrand?.name;
  const logo = token ? business?.logo_url : rememberedBrand?.logoUri;
  const companyLogo = !!logo && failedLogo !== logo;
  const width = Math.min(size * 5, 190);
  return (
    <View style={styles.wrap}>
      <View style={styles.imageWrap}>
        <Image
          source={companyLogo ? mediaSource(logo, token) : LUMIS_LOGO}
          onError={companyLogo ? () => setFailedLogo(logo) : undefined}
          resizeMode="contain"
          accessibilityLabel={companyLogo && name ? 'Logo de ' + name : 'Lumis · Cotiza y vende'}
          style={{ width, height: companyLogo ? size * 1.7 : width * 342 / 768 }}
        />
      </View>
      {showTagline && !imageOnly && companyLogo && !!name &&
        <Text numberOfLines={1} style={[styles.sub, { color: colors.muted }]}>{name}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { alignItems: 'center', maxWidth: 206 },
  imageWrap: { backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  sub: { fontSize: 9, fontFamily: 'Poppins', marginTop: 3 },
});
