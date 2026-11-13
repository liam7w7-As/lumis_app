import { TutorialTarget, TutorialHelpButton, useTutorialAvailability, withTutorial } from '../tutorials/TutorialElements';
import { useTutorial } from '../tutorials/TutorialContext';
import { feedback } from '../lib/feedback';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import type { SwipeRowHandle } from '../components/SwipeRow';
import { useTheme } from '../theme/ThemeContext';
import { ApiError, api, type Quote } from '../lib/api';
import { IS_NOVALED } from '../lib/backend';
import { matchesQuoteSearch, searchTerm } from '../lib/documentSearch';
import { usePagedCollection } from '../hooks/usePagedCollection';
import { CollectionFooter } from '../components/CollectionFooter';
import { QuoteCard } from '../components/QuoteCard';
import { useDocumentEditAccess } from '../hooks/useDocumentEditAccess';

function QuotesScreenContent() {
  const tutorial = useTutorial();
  const { colors } = useTheme();
  const { token } = useAuth();
  const {requestEdit}=useDocumentEditAccess();
  const insets = useSafeAreaInsets();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const remoteQuery = IS_NOVALED ? searchTerm(query) : '';
  const fetchPage = useCallback(async (page: number) => {
    if (!token) return { items: [] };
    const result = await api.quotes(token, { search: remoteQuery, page });
    return { items: result.quotes, meta: result.meta };
  }, [token, remoteQuery]);
  const { items: quotes, setItems: setQuotes, loading, refreshing, loadingMore, hasMore, error, load, loadMore } = usePagedCollection(fetchPage);
  useTutorialAvailability({ ready: !loading, hasItems: quotes.length > 0 });
  const openRow = useRef<SwipeRowHandle | null>(null);

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
    feedback.alert('Error', err instanceof ApiError ? err.message : fallback);
  };

  const handleDelete = (quote: Quote) => {
    if(!requestEdit())return;
    if (!token) return;
    closeRow();
    feedback.alert('Borrar cotización', `¿Borrar la cotización #${quote.id}?`, [
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
      feedback.alert('Venta generada', `Se generó la venta #${sale.number ?? sale.id}`);
      load(true);
    } catch (err) {
      showApiError(err, 'No se pudo generar la venta');
    }
  };

  const q = searchTerm(query);
  const filtered = IS_NOVALED ? quotes : quotes.filter(item => matchesQuoteSearch(item, query));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Cotizaciones</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><TutorialHelpButton  /><TutorialTarget id="search" ><Pressable
          onPress={() => {
            setSearchOpen(!searchOpen); tutorial.notify('search');
            if (searchOpen) setQuery('');
          }}
          hitSlop={10}
        >
          <Ionicons
            name={searchOpen ? 'close-outline' : 'search-outline'}
            size={24}
            color={colors.text}
          />
        </Pressable></TutorialTarget></View>
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
              maxLength={100}
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
      ) : error && quotes.length === 0 ? (
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
          onEndReached={() => { void loadMore(); }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={<CollectionFooter loading={loadingMore} hasMore={hasMore} error={error}
            onMore={() => { void loadMore(); }} onRetry={() => { void loadMore(true); }} />}
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
          renderItem={({ item, index }) => (
            <QuoteCard tutorialRow={index === 0}
              quote={item}
              onPress={() => router.push(`/quotes/${item.id}`)}
              onOpened={handleOpened}
              onGenerateSale={() => handleSale(item)}
              onPreview={() => { closeRow(); router.push("/quotes/" + item.id + "/preview"); }}
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

      <TutorialTarget id="create" style={[styles.fab, { backgroundColor: colors.primary, bottom: 24 + insets.bottom }]}><Pressable
        style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
        onPress={() => { tutorial.notify('create'); router.push('/quotes/new'); }}
      >
        <Ionicons name="add" size={30} color={colors.onPrimary} />
      </Pressable></TutorialTarget>
    </View>
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

export const QuotesScreen = withTutorial(QuotesScreenContent, "quotes");
