import { TutorialTarget } from '../tutorials/TutorialElements';
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SwipeActions, SWIPE_ACTIONS_WIDTH } from './SwipeActions';
import { SwipeRow, type SwipeRowHandle } from './SwipeRow';
import { useTheme } from '../theme/ThemeContext';
import { usePressMotion } from '../hooks/usePressMotion';
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

const ACTIONS_WIDTH = SWIPE_ACTIONS_WIDTH;

interface SaleCardProps {
  tutorialRow?: boolean;
  sale: Sale;
  onPress?: () => void;
  onOpened?: (ref: SwipeRowHandle | null) => void;
  onVoid: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function SaleCard({
  sale,
  tutorialRow = false,
  onPress,
  onOpened,
  onVoid,
  onPreview,
  onDelete,
  onDuplicate,
}: SaleCardProps) {
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const { scale, onPressIn, onPressOut } = usePressMotion();
  const swipeRef = useRef<SwipeRowHandle>(null);
  const statusColor = SALE_STATUS_COLOR[sale.estadoPago];
  const voided = sale.estado === 'anulada';

  const renderRightActions = () => <SwipeActions actions={[{ label: 'Vista previa', icon: 'document-text-outline', onPress: onPreview },
      { label: 'Anular venta', icon: 'close-circle-outline', onPress: onVoid },
      { label: 'Borrar', icon: 'trash-outline', onPress: onDelete },
      { label: 'Copiar', icon: 'copy-outline', onPress: onDuplicate }]} />;

  const content = (
    <SwipeRow
      ref={swipeRef}
      actionsWidth={ACTIONS_WIDTH}
      renderRightActions={renderRightActions}
      onOpen={() => onOpened?.(swipeRef.current)}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
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

              <View style={styles.seller}>
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
                <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A` }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {SALE_STATUS_LABEL[sale.estadoPago]}
                  </Text>
                </View>
                <Text style={[styles.sellerName, { color: colors.muted }]} numberOfLines={1}>
                  {sale.sellerName.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </SwipeRow>
  );
  return tutorialRow ? <TutorialTarget id="row" onShow={() => swipeRef.current?.open()} onHide={() => swipeRef.current?.close()}>{content}</TutorialTarget> : content;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
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
    flexShrink: 0,
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
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    maxWidth: '100%',
    flexShrink: 1,
  },
  sellerName: {
    fontSize: 12,
    fontFamily: 'Poppins',
    fontWeight: '600',
    maxWidth: 150,
    flexShrink: 1,
  },
  statusPill: {
    flexShrink: 0,
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
