import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useDraft } from '../context/DraftContext';
import { useTheme } from '../theme/ThemeContext';
import { ApiError, api, type Product } from '../lib/api';
import { useMoney, useBusiness } from '../context/BusinessContext';
import { DEFAULT_UNITS, loadUnits, saveUnits } from '../lib/units';
import { AnimatedInput } from '../components/AnimatedInput';
import { UnitSheet } from '../components/UnitSheet';

function parseNumber(raw: string): number {
  return Number.parseFloat(raw.replace(',', '.'));
}

export function AddItemScreen({ quoteId, saleId }: { quoteId?: number; saleId?: number }) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const { business } = useBusiness();
  const insets = useSafeAreaInsets();
  const { addItem } = useDraft();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('Unidad');
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS);
  const [marca, setMarca] = useState('');
  const [procedencia, setProcedencia] = useState('');
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>([]);
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

  const loadCatalog = useCallback(async () => {
    if (!token) return;
    try {
      const { products } = await api.products(token);
      setCatalog(products);
    } catch {
      // El catálogo es apoyo: si falla, el formulario sigue funcionando.
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadCatalog();
    }, [loadCatalog]),
  );

  const query = name.trim().toLowerCase();
  const filtered =
    query.length > 0
      ? catalog.filter((p) => p.name.toLowerCase().includes(query))
      : catalog;

  const fillFromProduct = (product: Product) => {
    setName(product.name);
    setPrice(String(product.price));
    setUnit(product.unit);
    setMarca(product.marca ?? '');
    setProcedencia(product.procedencia ?? '');
  };

  const handleDeleteProduct = (product: Product) => {
    if (!token) return;
    Alert.alert('Borrar producto', `¿Borrar "${product.name}" del catálogo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteProduct(product.id, token);
            setCatalog((prev) => prev.filter((p) => p.id !== product.id));
          } catch (err) {
            Alert.alert(
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
      setError('El nombre del artículo es obligatorio');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError('El precio debe ser mayor a 0');
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setError('La cantidad debe ser mayor a 0');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const match = catalog.find((p) => p.name.toLowerCase() === trimmedName.toLowerCase());
      let productId: number | null = match?.id ?? null;
      const lineMarca = marca.trim() || match?.marca || null;
      const lineProcedencia = procedencia.trim() || match?.procedencia || null;
      if (!match) {
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
      setError(err instanceof ApiError ? err.message : 'No se pudo añadir el artículo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
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
          <Text style={[styles.title, { color: colors.text }]}>Añadir producto</Text>
          <Pressable
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
          </Pressable>
        </View>

        <AnimatedInput
          icon="cube-outline"
          placeholder="Nombre del artículo"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <View style={styles.formRow}>
          <View style={styles.priceWrap}>
            <Text style={[styles.prefix, { color: colors.muted }]}>{business?.moneda ?? 'Bs.'}</Text>
            <TextInput
              style={[styles.miniInput, { color: colors.text, borderBottomColor: colors.border }]}
              placeholder="0"
              placeholderTextColor={colors.muted}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.qtyWrap}>
            <Text style={[styles.miniLabel, { color: colors.muted }]}>Cantidad</Text>
            <TextInput
              style={[styles.miniInput, { color: colors.text, borderBottomColor: colors.border }]}
              placeholder="1"
              placeholderTextColor={colors.muted}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.unitWrap}>
            <Text style={[styles.miniLabel, { color: colors.muted }]}>U. Medida</Text>
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
      </ScrollView>

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
    fontSize: 20,
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
    gap: 12,
    marginTop: 4,
  },
  priceWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  prefix: {
    fontSize: 14,
    fontFamily: 'Poppins',
    paddingBottom: 8,
  },
  qtyWrap: {
    flex: 1,
  },
  unitWrap: {
    flex: 1.2,
  },
  miniLabel: {
    fontSize: 13,
    fontFamily: 'Poppins',
    marginBottom: 2,
  },
  miniInput: {
    borderBottomWidth: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
    paddingBottom: 8,
  },
  unitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
    gap: 4,
  },
  unitText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
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
