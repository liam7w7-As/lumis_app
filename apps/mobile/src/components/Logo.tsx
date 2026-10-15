import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../config';
import { useTheme } from '../theme/ThemeContext';

interface LogoProps {
  size?: number;
  showTagline?: boolean;
}

export function Logo({ size = 34, showTagline = true }: LogoProps) {
  const { colors } = useTheme();
  const rest = BRAND.name.slice(0, -1);
  const last = BRAND.name.slice(-1);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.text, { fontSize: size, color: colors.logoInk }]}>
        {rest}
        <Text style={{ color: colors.primary }}>{last}</Text>
      </Text>
      {showTagline && <Text style={[styles.sub, { color: colors.muted }]}>{BRAND.tagline}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  text: {
    fontWeight: '700',
  },
  sub: {
    fontSize: 10,
    fontFamily: 'Poppins',
    letterSpacing: 3,
    marginTop: 2,
  },
});
