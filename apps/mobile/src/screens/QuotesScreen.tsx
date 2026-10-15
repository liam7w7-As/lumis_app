import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useAnimatedValue,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import type { SwipeRowHandle } from '../components/SwipeRow';
import { useTheme } from '../theme/ThemeContext';
import { ApiError, api, type Quote } from '../lib/api';
import { QuoteCard } from '../components/QuoteCard';

export function QuotesScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const fade = useAnimatedValue(0);
  const openRow = useRef<SwipeRowHandle | null>(null);
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fade]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!token) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const { quotes: data } = await api.quotes(token);
        setQuotes(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Ocurrió un error inesperado');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  const closeRow = () => {
    openRow.current?.close();
    openRow.current = null;
  };

  const handleOpened = (ref: SwipeRowHandle | null) => {
    if (openRow.current && openRow.current !== ref) {
      openRow.current.close();
    }
    openRow.current = ref;
  };

  const showApiError = (err: unknown, fallback: string) => {
    Alert.alert('Error', err instanceof ApiError ? err.message : fallback);
  };

  const handleDelete = (quote: Quote) => {
    if (!token) return;
    closeRow();
    Alert.alert('Borrar cotización', `¿Borrar la cotización #${quote.id}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteQuote(quote.id, token);
            setQuotes((prev) => prev.filter((item) => item.id !== quote.id));
          } catch (err) {
            showApiError(err, 'No se pudo borrar la cotización');
          }
        },
      },
    ]);
  };

  const handleDuplicate = async (quote: Quote) => {
    if (!token) return;
    closeRow();
    try {
      await api.duplicateQuote(quote.id, token);
      load(true);
    } catch (err) {
      showApiError(err, 'No se pudo copiar la cotización');
    }
  };

  const handleSale = async (quote: Quote) => {
    if (!token) return;
    closeRow();
    try {
      const { sale } = await api.saleFromQuote(quote.id, token);
      Alert.alert('Venta generada', `Se generó la venta #${sale.id}`);
      load(true);
    } catch (err) {
      showApiError(err, 'No se pudo generar la venta');
    }
  };

  const handleDeliveryNote = () => {
    closeRow();
    Alert.alert('Nota de entrega', 'Próximamente');
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? quotes.filter(
        (item) =>
          item.clientName?.toLowerCase().includes(q) || String(item.id).includes(q),
      )
    : quotes;

  return (
    <Animated.View style={[styles.screen, { backgroundColor: colors.background, opacity: fade }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Cotizaciones</Text>
        <Pressable
          onPress={() => {
            setSearchOpen(!searchOpen);
            if (searchOpen) setQuery('');
          }}
          hitSlop={10}
        >
          <Ionicons
            name={searchOpen ? 'close-outline' : 'search-outline'}
            size={24}
            color={colors.text}
          />
        </Pressable>
      </View>

      {searchOpen && (
        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
            <Ionicons name="search-outline" size={18} color={colors.icon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Buscar por cliente o #"
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.icon} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>{error}</Text>
          <Pressable
            style={[styles.retryButton, { borderColor: colors.primary }]}
            onPress={() => load()}
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          onScrollBeginDrag={closeRow}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: 100 + insets.bottom },
            filtered.length === 0 && styles.listEmpty,
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <QuoteCard
              quote={item}
              onPress={() => router.push(`/quotes/${item.id}`)}
              onOpened={handleOpened}
              onGenerateSale={() => handleSale(item)}
              onDeliveryNote={handleDeliveryNote}
              onDelete={() => handleDelete(item)}
              onDuplicate={() => handleDuplicate(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="document-text-outline" size={48} color={colors.icon} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {q ? 'Sin resultados para esa búsqueda' : 'Sin cotizaciones todavía'}
              </Text>
              {!q && (
                <Text style={[styles.emptyHint, { color: colors.muted }]}>
                  Toca + para crear la primera
                </Text>
              )}
            </View>
          }
        />
      )}

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary, bottom: 24 + insets.bottom }]}
        onPress={() => router.push('/quotes/new')}
      >
        <Ionicons name="add" size={30} color={colors.onPrimary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  listEmpty: {
    flexGrow: 1,
  },
  separator: {
    height: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Poppins',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: 'Poppins',
    textAlign: 'center',
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 6,
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
