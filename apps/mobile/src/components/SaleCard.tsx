import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SwipeRow, type SwipeRowHandle } from './SwipeRow';
import { useTheme } from '../theme/ThemeContext';
import { gradientFor } from '../lib/brandColors';
import { formatDate } from '../lib/format';
import { useMoney } from '../context/BusinessContext';
import type { Sale, SaleEstadoPago } from '../lib/api';

export const SALE_STATUS_LABEL: Record<SaleEstadoPago, string> = {
  por_cobrar: 'Por Cobrar',
  pagado: 'Pagado',
};

export const SALE_STATUS_COLOR: Record<SaleEstadoPago, string> = {
  por_cobrar: '#0ea5e9',
  pagado: '#22c55e',
};

const ACTIONS_WIDTH = 258;

interface SaleCardProps {
  sale: Sale;
  onPress?: () => void;
  onOpened?: (ref: SwipeRowHandle | null) => void;
  onVoid: () => void;
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

export function SaleCard({
  sale,
  onPress,
  onOpened,
  onVoid,
  onPreview,
  onDelete,
  onDuplicate,
}: SaleCardProps) {
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const [scale] = useState(() => new Animated.Value(1));
  const swipeRef = useRef<SwipeRowHandle>(null);
  const statusColor = SALE_STATUS_COLOR[sale.estadoPago];
  const voided = sale.estado === 'anulada';

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
      <ActionButton label="Vista previa" onPress={onPreview} color={colors.onPrimary}>
        <Ionicons name="document-text-outline" size={24} color={colors.onPrimary} />
      </ActionButton>
      <ActionButton label="Anular venta" onPress={onVoid} color={colors.onPrimary}>
        <Text style={[styles.dollar, { color: colors.onPrimary }]}>$</Text>
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
            {
              backgroundColor: colors.surface,
              opacity: voided ? 0.6 : 1,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={[styles.accent, { backgroundColor: statusColor }]} />
          <View style={styles.content}>
            <View style={styles.headRow}>
              <Text style={[styles.client, { color: colors.text }]} numberOfLines={1}>
                {sale.clientName ?? 'Sin Cliente'}
              </Text>
              {voided && (
                <View style={[styles.voidedPill, { backgroundColor: '#ef44441A' }]}>
                  <Text style={[styles.voidedText, { color: '#ef4444' }]}>Anulada</Text>
                </View>
              )}
              {!voided && sale.entregadaAt && (
                <View style={[styles.voidedPill, { backgroundColor: '#22c55e1A' }]}>
                  <Text style={[styles.voidedText, { color: '#22c55e' }]}>Entregada</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.icon} />
            </View>
            <View style={styles.metaRow}>
              <View style={[styles.pill, { backgroundColor: colors.background }]}>
                <Text style={[styles.pillText, { color: colors.muted }]}>#{sale.id}</Text>
              </View>

              <View style={[styles.pill, { backgroundColor: `${colors.primary}14` }]}>
                <Text style={[styles.pillText, styles.amountText, { color: colors.primary }]}>
                  {formatMoney(sale.total)}
                </Text>
              </View>

              <View style={[styles.pill, { backgroundColor: colors.background }]}>
                <Ionicons name="calendar-outline" size={12} color={colors.muted} />
                <Text style={[styles.pillText, { color: colors.muted }]}>
                  {formatDate(sale.createdAt)}
                </Text>
              </View>

              <View style={[styles.pill, { backgroundColor: colors.background }]}>
                <Ionicons name="person-outline" size={12} color={colors.muted} />
                <Text style={[styles.pillText, { color: colors.muted }]} numberOfLines={1}>
                  {sale.sellerName.toUpperCase()}
                </Text>
              </View>

              <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A` }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {SALE_STATUS_LABEL[sale.estadoPago]}
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
    width: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  actionLabel: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'Poppins',
    fontWeight: '600',
    textAlign: 'center',
  },
  dollar: {
    color: '#ffffff',
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
  headRow: {
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
  voidedPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  voidedText: {
    fontSize: 11,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  metaRow: {
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
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
});
