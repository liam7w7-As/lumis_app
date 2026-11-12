import { TutorialTarget, TutorialScrollView, TutorialHelpButton, useTutorialAvailability, withTutorial } from '../tutorials/TutorialElements';
import { feedback } from '../lib/feedback';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useDraft } from '../context/DraftContext';
import { useTheme } from '../theme/ThemeContext';
import { ApiError, api, type Product } from '../lib/api';
import { useMoney, useBusiness } from '../context/BusinessContext';
import { DEFAULT_UNITS, loadUnits, saveUnits } from '../lib/units';
import { AnimatedInput } from '../components/AnimatedInput';
import { UnitSheet } from '../components/UnitSheet';
import { IS_NOVALED } from '../lib/backend';
import { usePagedCollection } from '../hooks/usePagedCollection';
import { CollectionFooter } from '../components/CollectionFooter';

function parseNumber(raw: string): number {
  return Number.parseFloat(raw.replace(',', '.'));
}

function AddItemScreenContent({ quoteId, saleId }: { quoteId?: number; saleId?: number }) {
  useTutorialAvailability({ ready: true });
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const { business } = useBusiness();
  const insets = useSafeAreaInsets();
  const { addItem } = useDraft();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('Unidad');
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS);
  const [marca, setMarca] = useState('');
  const [procedencia, setProcedencia] = useState('');
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const userId = user?.id ?? null;

  useEffect(() => {
    let active = true;
    loadUnits(userId).then((loaded) => {
      if (!active || loaded.length === 0) return;
      setUnits(loaded);
      setUnit((prev) => (loaded.includes(prev) ? prev : loaded[0]));
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const persistUnits = (next: string[]) => {
    setUnits(next);
    saveUnits(userId, next);
  };

  const handleAddUnit = (unitName: string) => {
    persistUnits([...units, unitName]);
    setUnit(unitName);
  };

  const handleRenameUnit = (oldName: string, newName: string) => {
    persistUnits(units.map((u) => (u === oldName ? newName : u)));
    setUnit((prev) => (prev === oldName ? newName : prev));
  };

  const handleDeleteUnit = (unitName: string) => {
    const next = units.filter((u) => u !== unitName);
    persistUnits(next);
    setUnit((prev) => (prev === unitName ? (next[0] ?? prev) : prev));
  };

  const query = name.trim().toLowerCase();
  const catalogQuery = IS_NOVALED ? query : '';
  const fetchPage = useCallback(async (page: number) => {
    if (!token) return { items: [] };
    const result = await api.products(token, catalogQuery.slice(0, 100) || undefined, page);
    return { items: result.products, meta: result.meta };
  }, [token, catalogQuery]);
  const { items: catalog, setItems: setCatalog, loading: catalogLoading, loadingMore, hasMore, error: catalogError, load, loadMore } = usePagedCollection(fetchPage);
  const filtered =
    !IS_NOVALED && query.length > 0
      ? catalog.filter((p) => p.name.toLowerCase().includes(query))
      : catalog;

  const fillFromProduct = (product: Product) => {
    setSelectedProduct(product);
    setName(product.name);
    setPrice(String(product.price));
    setUnit(product.unit);
    setMarca(product.marca ?? '');
    setProcedencia(product.procedencia ?? '');
  };

  const handleDeleteProduct = (product: Product) => {
    if (!token) return;
    feedback.alert('Borrar producto', `¿Borrar "${product.name}" del catálogo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteProduct(product.id, token);
            setCatalog((prev) => prev.filter((p) => p.id !== product.id));
          } catch (err) {
            feedback.alert(
              'Error',
              err instanceof ApiError ? err.message : 'No se pudo borrar el producto',
            );
          }
        },
      },
    ]);
  };

  const saveLine = async () => {
    if (!token) return;
    const trimmedName = name.trim();
    const parsedPrice = parseNumber(price);
    const parsedQty = parseNumber(quantity);
    if (trimmedName.length === 0) {
      setError('El nombre del artículo es obligatorio'); feedback.warning('Revisa el producto', 'El nombre del artículo es obligatorio');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError('El precio debe ser mayor a 0'); feedback.warning('Revisa el producto', 'El precio debe ser mayor a 0');
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setError('La cantidad debe ser mayor a 0'); feedback.warning('Revisa el producto', 'La cantidad debe ser mayor a 0');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const match = selectedProduct?.name.toLowerCase() === trimmedName.toLowerCase()
        ? selectedProduct : catalog.find((p) => p.name.toLowerCase() === trimmedName.toLowerCase());
      let productId: number | null = match?.id ?? null;
      const lineMarca = marca.trim() || match?.marca || null;
      const lineProcedencia = procedencia.trim() || match?.procedencia || null;
      if (!match && !IS_NOVALED) {
        const { product } = await api.createProduct(
          { name: trimmedName, price: parsedPrice, unit, marca: lineMarca, procedencia: lineProcedencia },
          token,
        );
        productId = product.id;
      }
      const line = {
        productId,
        name: match?.name ?? trimmedName,
        quantity: parsedQty,
        unit,
        unitPrice: parsedPrice,
        marca: lineMarca,
        procedencia: lineProcedencia,
      };
      if (quoteId != null) {
        await api.addQuoteItem(
          quoteId,
          {
            productId: line.productId,
            description: line.name,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            marca: line.marca,
            procedencia: line.procedencia,
          },
          token,
        );
      } else if (saleId != null) {
        await api.addSaleItem(
          saleId,
          {
            productId: line.productId,
            description: line.name,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            marca: line.marca,
            procedencia: line.procedencia,
          },
          token,
        );
      } else {
        addItem(line);
      }
      router.back();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'No se pudo añadir el artículo.';
      setError(message); feedback.error('No se pudo añadir el producto', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TutorialScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: 32 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>Añadir producto</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><TutorialHelpButton  /><TutorialTarget id="save" ><Pressable
            style={[styles.circleButton, { backgroundColor: colors.primary }]}
            onPress={saveLine}
            disabled={saving}
            hitSlop={8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>Guardar</Text>
            )}
          </Pressable></TutorialTarget></View>
        </View>

        <TutorialTarget id="fields" ><AnimatedInput
          icon="cube-outline"
          placeholder="Nombre del artículo"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        /></TutorialTarget>

        <View style={styles.labelsRow}>
          <Text style={[styles.miniLabel, styles.priceWrap, { color: colors.muted }]}>Precio</Text>
          <Text style={[styles.miniLabel, styles.qtyWrap, { color: colors.muted }]}>Cantidad</Text>
          <Text style={[styles.miniLabel, styles.unitWrap, { color: colors.muted }]}>U. Medida</Text>
        </View>
        <View style={styles.formRow}>
          <View style={styles.priceWrap}>
            <View style={[styles.priceControl, { borderBottomColor: colors.border }]}>
              <Text style={[styles.prefix, { color: colors.muted }]}>{business?.moneda ?? 'Bs.'}</Text>
              <TextInput
                style={[styles.priceInput, { color: colors.text }]}
                accessibilityLabel="Precio del producto"
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <View style={styles.qtyWrap}>
            <TextInput
              style={[styles.miniInput, { color: colors.text, borderBottomColor: colors.border }]}
              accessibilityLabel="Cantidad del producto"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.unitWrap}>
            <Pressable
              style={[styles.unitButton, { borderBottomColor: colors.border }]}
              onPress={() => setUnitsOpen(true)}
            >
              <Text style={[styles.unitText, { color: colors.text }]} numberOfLines={1}>
                {unit}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

        <AnimatedInput
          icon="pricetag-outline"
          placeholder="Marca (opcional)"
          value={marca}
          onChangeText={setMarca}
          autoCapitalize="words"
        />
        <AnimatedInput
          icon="globe-outline"
          placeholder="Procedencia (opcional)"
          value={procedencia}
          onChangeText={setProcedencia}
          autoCapitalize="words"
        />

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {filtered.map((product) => (
          <Pressable key={product.id} onPress={() => fillFromProduct(product)}>
            <View style={styles.catalogRow}>
              <Text style={[styles.catalogName, { color: colors.text }]} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={[styles.catalogPrice, { color: colors.muted }]}>
                {formatMoney(product.price)} {product.unit}
              </Text>
              <Pressable onPress={() => handleDeleteProduct(product)} hitSlop={10}>
                <Ionicons name="trash-outline" size={20} color={colors.muted} />
              </Pressable>
            </View>
          </Pressable>
        ))}
        <CollectionFooter loading={catalogLoading || loadingMore} hasMore={hasMore} error={catalogError}
          onMore={() => { void loadMore(); }} onRetry={() => { void (catalog.length ? loadMore(true) : load()); }} />
      </TutorialScrollView>

      <UnitSheet
        visible={unitsOpen}
        units={units}
        selected={unit}
        canDelete={units.length > 1}
        onSelect={setUnit}
        onAdd={handleAddUnit}
        onRename={handleRenameUnit}
        onDelete={handleDeleteUnit}
        onClose={() => setUnitsOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  title: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  circleButton: {
    minWidth: 76,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 4,
    marginBottom: 24,
  },
  labelsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 4,
  },
  priceWrap: {
    flex: 1,
    minWidth: 0,
  },
  priceControl: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderBottomWidth: 1,
    gap: 6,
  },
  priceInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    padding: 0,
    fontSize: 16,
    fontFamily: 'Poppins',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  prefix: {
    fontSize: 14,
    fontFamily: 'Poppins',
    includeFontPadding: false,
  },
  qtyWrap: {
    flex: 1,
    minWidth: 0,
  },
  unitWrap: {
    flex: 1.2,
    minWidth: 0,
  },
  miniLabel: {
    fontSize: 13,
    fontFamily: 'Poppins',
    minHeight: 20,
    marginBottom: 0,
    includeFontPadding: false,
  },
  miniInput: {
    borderBottomWidth: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
    height: 44,
    padding: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  unitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    height: 44,
    gap: 4,
  },
  unitText: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontFamily: 'Poppins',
    includeFontPadding: false,
  },
  error: {
    textAlign: 'center',
    marginTop: 12,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  catalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  catalogName: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  catalogPrice: {
    fontSize: 13,
    fontFamily: 'Poppins',
  },
});

export const AddItemScreen = withTutorial(AddItemScreenContent, "products");
