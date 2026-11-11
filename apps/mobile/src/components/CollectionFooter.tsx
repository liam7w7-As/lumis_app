import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export function CollectionFooter({ loading, hasMore, error, onMore, onRetry }: {
  loading: boolean; hasMore: boolean; error: string | null; onMore: () => void; onRetry: () => void;
}) {
  const { colors } = useTheme();
  if (loading) return <ActivityIndicator style={{ padding: 16 }} color={colors.primary} />;
  if (!hasMore && !error) return null;
  return <View style={{ paddingVertical: 12, gap: 8 }}>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontFamily: 'Poppins' }}>{error}</Text>}
    <Pressable accessibilityRole="button" onPress={error ? onRetry : onMore} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontFamily: 'Poppins-SemiBold' }}>{error ? 'Reintentar' : 'Cargar más'}</Text>
    </Pressable>
  </View>;
}
