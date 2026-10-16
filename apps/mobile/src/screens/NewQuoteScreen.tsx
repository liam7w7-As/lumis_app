import { FormModal } from '../components/FormModal';
import { feedback } from '../lib/feedback';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useDraft } from '../context/DraftContext';
import { useTheme } from '../theme/ThemeContext';
import { ApiError, api, type Branch } from '../lib/api';
import { useMoney } from '../context/BusinessContext';
import { PrimaryButton } from '../components/PrimaryButton';

function todayLabel(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

export function NewQuoteScreen() {
  const { user, token } = useAuth();
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const insets = useSafeAreaInsets();
  const { client, setClient, items, removeItem, clear } = useDraft();
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .nextQuoteNumber(token)
      .then((r) => setNextNumber(r.nextNumber))
      .catch(() => {});
    api
      .branches(token)
      .then((r) => {
        setBranches(r.branches);
        if (r.branches.length > 0) {
          setBranchId((current) => current ?? r.branches[0].id);
        }
      })
      .catch(() => {});
  }, [token]);

  const branch = branches.find((b) => b.id === branchId) ?? null;

  const total = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);

  const save = async () => {
    if (!token) return;
    if (items.length === 0) {
      feedback.alert('Sin artículos', 'Agrega al menos un artículo a la cotización');
      return;
    }
    setSaving(true);
    try {
      const { quote } = await api.createQuote(
        {
          clientId: client?.id ?? null,
          branchId,
          items: items.map((it) => ({
            productId: it.productId,
            description: it.name,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            marca: it.marca,
            procedencia: it.procedencia,
          })),
        },
        token,
      );
      feedback.alert('Cotización creada', `Se creó la cotización #${quote.id}`, [
        {
          text: 'OK',
          onPress: () => {
            clear();
            router.back();
          },
        },
      ]);
    } catch (err) {
      feedback.alert('Error', err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: 32 + insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Nueva cotización</Text>
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.circleButton, { backgroundColor: colors.primary }]}
              onPress={save}
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
        </View>

        <View style={styles.metaRow}>
          <View style={styles.dateWrap}>
            <Text style={[styles.dateText, { color: colors.muted }]}>Fecha {todayLabel()}</Text>
            <Pressable onPress={() => feedback.alert('Fecha', 'Próximamente')} hitSlop={8}>
              <Ionicons name="pencil-outline" size={14} color={colors.muted} />
            </Pressable>
          </View>
          {nextNumber !== null && (
            <Text style={[styles.numberText, { color: colors.muted }]}>
              COTIZACIÓN Nº {nextNumber}
            </Text>
          )}
        </View>

        <View style={[styles.vendorCard, { backgroundColor: colors.surface }]}>
          <View style={styles.vendorBlock}>
            <Text style={[styles.vendorLabel, { color: colors.text }]}>Vendedor</Text>
            <View style={styles.vendorValue}>
              <Ionicons name="person-outline" size={16} color={colors.muted} />
              <Text style={[styles.vendorName, { color: colors.muted }]} numberOfLines={1}>
                {(user?.name ?? user?.username ?? '').toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.vendorBlock} onPress={() => setBranchesOpen(true)}>
            <Text style={[styles.vendorLabel, { color: colors.text }]}>Sucursal</Text>
            <View style={styles.vendorValue}>
              <Ionicons name="storefront-outline" size={16} color={colors.muted} />
              <Text style={[styles.vendorName, { color: colors.muted }]} numberOfLines={1}>
                {branch?.name ?? 'Seleccionar'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.muted} />
            </View>
          </Pressable>
        </View>

        {client ? (
          <View style={[styles.clientCard, { backgroundColor: colors.surface }]}>
            <View style={styles.clientInfo}>
              <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
                {client.name}
              </Text>
              {[client.phone, client.email].filter(Boolean).join('  ·  ') !== '' && (
                <Text style={[styles.clientDetail, { color: colors.muted }]} numberOfLines={1}>
                  {[client.phone, client.email].filter(Boolean).join('  ·  ')}
                </Text>
              )}
            </View>
            <Pressable onPress={() => setClient(null)} hitSlop={10}>
              <Ionicons name="close-outline" size={22} color={colors.muted} />
            </Pressable>
          </View>
        ) : (
          <PrimaryButton
            title="+  Añadir cliente"
            onPress={() => router.push('/quotes/new/client')}
          />
        )}

        {items.map((item) => (
          <View key={item.key} style={[styles.itemRow, { backgroundColor: colors.surface }]}>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.itemDetail, { color: colors.muted }]}>
                {item.quantity} {item.unit} × {formatMoney(item.unitPrice)}
              </Text>
            </View>
            <Text style={[styles.itemSubtotal, { color: colors.text }]}>
              {formatMoney(item.quantity * item.unitPrice)}
            </Text>
            <Pressable onPress={() => removeItem(item.key)} hitSlop={10}>
              <Ionicons name="trash-outline" size={20} color={colors.muted} />
            </Pressable>
          </View>
        ))}

        <Pressable
          style={[styles.outlineButton, { borderColor: colors.primary }]}
          onPress={() => router.push('/quotes/new/item')}
        >
          <Text style={[styles.outlineText, { color: colors.primary }]}>+  Añadir artículo</Text>
        </Pressable>

        {items.length > 0 && (
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.muted }]}>TOTAL</Text>
            <Text style={[styles.totalValue, { color: colors.text }]}>
              {formatMoney(total)}
            </Text>
          </View>
        )}
      </ScrollView>

      <FormModal visible={branchesOpen} title="Elegir sucursal" icon="storefront-outline" onClose={() => setBranchesOpen(false)}>

            {branches.map((option) => (
              <Pressable
                key={option.id}
                style={styles.optionRow}
                onPress={() => {
                  setBranchId(option.id);
                  setBranchesOpen(false);
                }}
              >
                <View>
                  <Text
                    style={[
                      styles.optionText,
                      { color: option.id === branchId ? colors.primary : colors.text },
                      option.id === branchId && styles.optionSelected,
                    ]}
                  >
                    {option.name}
                  </Text>
                  {option.address && (
                    <Text style={[styles.optionSub, { color: colors.muted }]}>
                      {option.address}
                    </Text>
                  )}
                </View>
                {option.id === branchId && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </Pressable>
            ))}
      </FormModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  circleButton: {
    minWidth: 76,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    fontFamily: 'Poppins',
  },
  numberText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '600',
  },
  vendorCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  vendorBlock: {
    flex: 1,
    gap: 6,
  },
  vendorLabel: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  vendorValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vendorName: {
    fontSize: 13,
    fontFamily: 'Poppins',
    flex: 1,
  },
  divider: {
    width: 1,
  },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  clientInfo: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    fontSize: 16,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  clientDetail: {
    fontSize: 13,
    fontFamily: 'Poppins',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  itemDetail: {
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  itemSubtotal: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  outlineButton: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  outlineText: {
    fontSize: 16,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
    letterSpacing: 1,
  },
  totalValue: {
    fontSize: 22,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  optionsCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 20,
    gap: 4,
  },
  optionsTitle: {
    fontSize: 17,
    fontFamily: 'Poppins',
    fontWeight: '700',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  optionText: {
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  optionSelected: {
    fontWeight: '700',
  },
  optionSub: {
    fontSize: 12,
    fontFamily: 'Poppins',
    marginTop: 2,
  },
});
