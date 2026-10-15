import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SwipeRow, type SwipeRowHandle } from './SwipeRow';
import { useTheme } from '../theme/ThemeContext';
import { gradientFor } from '../lib/brandColors';
import { avatarColor, formatDate, initials } from '../lib/format';
import { useMoney } from '../context/BusinessContext';
import type { Quote, QuoteStatus } from '../lib/api';

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  borrador: 'Borrador',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  convertida: 'Convertida',
};

export const STATUS_COLOR: Record<QuoteStatus, string> = {
  borrador: '#8a8fa3',
  aprobada: '#22c55e',
  rechazada: '#ef4444',
  convertida: '#5b3df5',
};

const ACTIONS_WIDTH = 260;

interface QuoteCardProps {
  quote: Quote;
  onPress?: () => void;
  onOpened?: (ref: SwipeRowHandle | null) => void;
  onGenerateSale: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function ActionButton({
  label,
  onPress,
  color,
  children,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      {children}
      <Text style={[styles.actionLabel, color ? { color } : null]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export function QuoteCard({
  quote,
  onPress,
  onOpened,
  onGenerateSale,
  onPreview,
  onDelete,
  onDuplicate,
}: QuoteCardProps) {
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const [scale] = useState(() => new Animated.Value(1));
  const swipeRef = useRef<SwipeRowHandle>(null);
  const statusColor = quote.status === 'convertida' ? colors.primary : STATUS_COLOR[quote.status];

  const press = (to: number) => {
    Animated.timing(scale, { toValue: to, duration: 120, useNativeDriver: true }).start();
  };

  const renderRightActions = () => (
    <LinearGradient
      colors={gradientFor(colors.primary)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.actions}
    >
      <ActionButton label="Generar venta" onPress={onGenerateSale} color={colors.onPrimary}>
        <Text style={[styles.dollar, { color: colors.onPrimary }]}>$</Text>
      </ActionButton>
      <ActionButton label="Vista previa" onPress={onPreview} color={colors.onPrimary}>
        <Ionicons name="document-text-outline" size={24} color={colors.onPrimary} />
      </ActionButton>
      <ActionButton label="Borrar" onPress={onDelete} color={colors.onPrimary}>
        <Ionicons name="trash-outline" size={24} color={colors.onPrimary} />
      </ActionButton>
      <ActionButton label="Copiar" onPress={onDuplicate} color={colors.onPrimary}>
        <Ionicons name="copy-outline" size={24} color={colors.onPrimary} />
      </ActionButton>
    </LinearGradient>
  );

  return (
    <SwipeRow
      ref={swipeRef}
      actionsWidth={ACTIONS_WIDTH}
      renderRightActions={renderRightActions}
      onOpen={() => onOpened?.(swipeRef.current)}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        onPressIn={() => press(0.98)}
        onPressOut={() => press(1)}
      >
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.surface, transform: [{ scale }] },
          ]}
        >
          <View style={[styles.accent, { backgroundColor: statusColor }]} />
          <View style={styles.content}>
            <View style={styles.row1}>
              <Text style={[styles.client, { color: colors.text }]} numberOfLines={1}>
                {quote.clientName ?? 'Sin Cliente'}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A` }]}>
                <View style={[styles.dot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {STATUS_LABEL[quote.status]}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.icon} />
            </View>
            <View style={styles.row2}>
              <View style={[styles.pill, { backgroundColor: colors.background }]}>
                <Text style={[styles.pillText, { color: colors.muted }]}>#{quote.id}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: `${colors.primary}14` }]}>
                <Text style={[styles.pillText, styles.amountText, { color: colors.primary }]}>
                  {formatMoney(quote.total)}
                </Text>
              </View>
              <View style={[styles.pill, { backgroundColor: colors.background }]}>
                <Ionicons name="calendar-outline" size={12} color={colors.muted} />
                <Text style={[styles.pillText, { color: colors.muted }]}>
                  {formatDate(quote.createdAt)}
                </Text>
              </View>
              <View style={styles.seller}>
                <View style={[styles.avatar, { backgroundColor: avatarColor(quote.sellerName) }]}>
                  <Text style={styles.avatarText}>{initials(quote.sellerName)}</Text>
                </View>
                <Text style={[styles.sellerName, { color: colors.muted }]} numberOfLines={1}>
                  {quote.sellerName.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
  },
  actions: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    paddingHorizontal: 6,
  },
  action: {
    width: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Poppins',
    fontWeight: '600',
    textAlign: 'center',
  },
  dollar: {
    color: '#fff',
    fontSize: 24,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  accent: {
    width: 4,
    borderRadius: 2,
    marginRight: 12,
  },
  content: {
    flex: 1,
    gap: 10,
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  client: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  amountText: {
    fontWeight: '700',
  },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  sellerName: {
    fontSize: 12,
    fontFamily: 'Poppins',
    fontWeight: '600',
    maxWidth: 90,
  },
});
