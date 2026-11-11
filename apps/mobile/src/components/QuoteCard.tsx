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

const ACTIONS_WIDTH = SWIPE_ACTIONS_WIDTH;

interface QuoteCardProps {
  tutorialRow?: boolean;
  quote: Quote;
  onPress?: () => void;
  onOpened?: (ref: SwipeRowHandle | null) => void;
  onGenerateSale: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function QuoteCard({
  quote,
  tutorialRow = false,
  onPress,
  onOpened,
  onGenerateSale,
  onPreview,
  onDelete,
  onDuplicate,
}: QuoteCardProps) {
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const { scale, onPressIn, onPressOut } = usePressMotion();
  const swipeRef = useRef<SwipeRowHandle>(null);
  const statusColor = quote.status === 'convertida' ? colors.primary : STATUS_COLOR[quote.status];

  const renderRightActions = () => <SwipeActions actions={[{ label: 'Generar venta', icon: 'cash-outline', onPress: onGenerateSale },
      { label: 'Vista previa', icon: 'document-text-outline', onPress: onPreview },
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
            { backgroundColor: colors.surface, transform: [{ scale }] },
          ]}
        >
          <View style={[styles.accent, { backgroundColor: statusColor }]} />
          <View style={styles.content}>
            <View style={styles.row1}>
              <Text style={[styles.client, { color: colors.text }]} numberOfLines={1}>
                {quote.clientName ?? 'Sin Cliente'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.icon} />
            </View>
            <View style={styles.row2}>
              <View style={[styles.pill, { backgroundColor: colors.background }]}>
                <Text style={[styles.pillText, { color: colors.muted }]}>#{quote.number ?? quote.id}</Text>
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
                <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A` }]}>
                  <View style={[styles.dot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {STATUS_LABEL[quote.status]}
                  </Text>
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
    flexShrink: 0,
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
});
