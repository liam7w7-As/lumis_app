import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import type { SwipeRowHandle } from '../components/SwipeRow';
import { useTheme } from '../theme/ThemeContext';
import { ApiError, api, type Branch, type Sale, type SaleEstadoPago } from '../lib/api';
import { SaleCard } from '../components/SaleCard';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { BranchFilterSheet } from '../components/BranchFilterSheet';

type StatusTab = 'todos' | 'pagado' | 'por_cobrar';

const TAB_ESTADO: Record<StatusTab, SaleEstadoPago | undefined> = {
  todos: undefined,
  pagado: 'pagado',
  por_cobrar: 'por_cobrar',
};

export function SalesScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const [sales, setSales] = useState<Sale[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tab, setTab] = useState<StatusTab>('todos');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openRow = useRef<SwipeRowHandle | null>(null);

  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fade]);

  const query = search.trim();

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
        const { sales: data } = await api.sales(token, {
          estadoPago: TAB_ESTADO[tab],
          branchId,
          search: query || undefined,
        });
        setSales(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Ocurrió un error inesperado');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, tab, branchId, query],
  );

  useEffect(() => {
    if (!token) return;
    api
      .branches(token)
      .then(({ branches: data }) => setBranches(data))
      .catch(() => setBranches([]));
  }, [token]);

  // useFocusEffect corre también en el montaje, así que no hace falta un
  // useEffect adicional (evita el doble fetch inicial).
  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === branchId) ?? null,
    [branches, branchId],
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

  const handleVoid = (sale: Sale) => {
    if (!token) return;
    closeRow();
    Alert.alert(
      'Anular venta',
      `La venta #${sale.id} quedará anulada y dejará de aparecer en el punto de venta.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Anular',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.anularSale(sale.id, token);
              setSales((prev) => prev.filter((s) => s.id !== sale.id));
            } catch (err) {
              showApiError(err, 'No se pudo anular la venta');
            }
          },
        },
      ],
    );
  };

  const handleDelete = (sale: Sale) => {
    if (!token) return;
    closeRow();
    Alert.alert('Borrar venta', `¿Borrar la venta #${sale.id}? No se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSale(sale.id, token);
            setSales((prev) => prev.filter((s) => s.id !== sale.id));
          } catch (err) {
            showApiError(err, 'No se pudo borrar la venta');
          }
        },
      },
    ]);
  };

  const handleDuplicate = (sale: Sale) => {
    if (!token) return;
    closeRow();
    (async () => {
      try {
        const { sale: created } = await api.duplicateSale(sale.id, token);
        Alert.alert('Venta copiada', `Se creó la venta #${created.id} por cobrar.`, [
          { text: 'OK', onPress: () => load(true) },
        ]);
      } catch (err) {
        showApiError(err, 'No se pudo copiar la venta');
      }
    })();
  };

  const handleSelect = (sale: Sale) => {
    router.push(`/pos/${sale.id}`);
  };

  return (
    <Animated.View style={[styles.screen, { backgroundColor: colors.background, opacity: fade }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Punto de venta</Text>
        <Pressable
          onPress={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setSearch('');
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

      <View style={styles.filtersRow}>
        <View style={styles.tabsWrap}>
          <SegmentedTabs<StatusTab>
            options={[
              { key: 'todos', label: 'Todos' },
              { key: 'pagado', label: 'Pagados' },
              { key: 'por_cobrar', label: 'Por cobrar' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
        <Pressable
          style={[styles.filterButton, { backgroundColor: colors.surface }]}
          onPress={() => setSheetOpen(true)}
          hitSlop={8}
        >
          <Ionicons
            name={selectedBranch ? 'storefront' : 'options-outline'}
            size={20}
            color={selectedBranch ? colors.primary : colors.text}
          />
        </Pressable>
      </View>

      {selectedBranch && (
        <View style={styles.activeFilterRow}>
          <View style={[styles.activeFilter, { backgroundColor: `${colors.primary}14` }]}>
            <Ionicons name="storefront-outline" size={12} color={colors.primary} />
            <Text style={[styles.activeFilterText, { color: colors.primary }]} numberOfLines={1}>
              {selectedBranch.name}
            </Text>
            <Pressable onPress={() => setBranchId(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      )}

      {searchOpen && (
        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
            <Ionicons name="search-outline" size={18} color={colors.icon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Buscar por cliente o #"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
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
          data={sales}
          keyExtractor={(item) => String(item.id)}
          onScrollBeginDrag={closeRow}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: 100 + insets.bottom },
            sales.length === 0 && styles.listEmpty,
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
            <SaleCard
              sale={item}
              onPress={() => handleSelect(item)}
              onOpened={handleOpened}
              onVoid={() => handleVoid(item)}
              onDelete={() => handleDelete(item)}
              onDuplicate={() => handleDuplicate(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cart-outline" size={48} color={colors.icon} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {query ? 'Sin resultados para esa búsqueda' : 'Sin ventas todavía'}
              </Text>
              {!query && (
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
        onPress={() => router.push('/pos/new')}
      >
        <Ionicons name="add" size={30} color={colors.onPrimary} />
      </Pressable>

      <BranchFilterSheet
        visible={sheetOpen}
        branches={branches}
        selectedId={branchId}
        onSelect={(id) => {
          setBranchId(id);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
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
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tabsWrap: {
    flex: 1,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    maxWidth: '100%',
  },
  activeFilterText: {
    fontSize: 12,
    fontFamily: 'Poppins',
    fontWeight: '600',
    flexShrink: 1,
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
