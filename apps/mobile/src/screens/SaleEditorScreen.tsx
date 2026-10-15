import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import {
  ApiError,
  api,
  mediaUrl,
  type Agent,
  type Branch,
  type Client,
  type QuoteItemInput,
  type SaleDetail,
  type SaleEstadoPago,
  type SaleMetodoPago,
  type SalePayment,
} from '../lib/api';
import { pickImageFromCamera, pickImageFromLibrary, type ReceiptExt } from '../lib/media';
import { useMoney } from '../context/BusinessContext';
import { ItemSwipe } from '../components/ItemSwipe';
import { ReorderItemsModal } from '../components/ReorderItemsModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { SalePaymentSection } from '../components/SalePaymentSection';

type DocTab = 'venta' | 'entrega';
type LineKey = string | number;

const METODOS: { key: SaleMetodoPago; label: string }[] = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'qr', label: 'QR' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'por_pagar', label: 'Por pagar' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

function dayMonthYear(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${String(d.getFullYear()).slice(2)}`;
}

function todayLabel(): string {
  return dayMonthYear(new Date().toISOString());
}

function parseNum(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function SaleEditorScreen({ saleId }: { saleId?: number }) {
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { client, setClient, items, updateItem, removeItem, clear } = useDraft();

  const isDetail = saleId != null;
  const basePath = isDetail ? `/pos/${saleId}` : '/pos/new';

  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [docTab, setDocTab] = useState<DocTab>('venta');
  const [metodo, setMetodo] = useState<SaleMetodoPago>('efectivo');
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [clientsOpen, setClientsOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [lineBusy, setLineBusy] = useState(false);
  const [expanded, setExpanded] = useState<LineKey | null>(null);
  const [editQty, setEditQty] = useState('1');
  const [editPrice, setEditPrice] = useState('');
  const [notaPago, setNotaPago] = useState('');
  const [transferenciaNumero, setTransferenciaNumero] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [pendingReceipt, setPendingReceipt] = useState<{ base64: string; ext: ReceiptExt } | null>(
    null,
  );
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [totalPagado, setTotalPagado] = useState(0);
  const [payInicial, setPayInicial] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [busyPayment, setBusyPayment] = useState(false);
  const [includeSello, setIncludeSello] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [details, br, cls, ags, nxt] = await Promise.all([
        isDetail ? api.saleDetail(saleId as number, token) : Promise.resolve(null),
        api.branches(token),
        api.clients(token),
        api.agents(token).catch(() => ({ agents: [] })),
        api.nextSaleNumber(token),
      ]);
      setBranches(br.branches);
      setClients(cls.clients);
      setAgents(ags.agents);
      setNextNumber(nxt.nextNumber);
      if (details) {
        setSale(details.sale);
        setMetodo(details.sale.metodoPago);
        setBranchId(details.sale.branchId);
        setAgentId(details.sale.agentId);
        setNotaPago(details.sale.notaPago ?? '');
        setTransferenciaNumero(details.sale.transferenciaNumero ?? '');
        setReceiptUri(mediaUrl(details.sale.comprobanteUrl));
        setPayments(details.sale.payments);
        setTotalPagado(details.sale.totalPagado);
        setIncludeSello(details.sale.includeSello);
      } else {
        setBranchId(br.branches[0]?.id ?? null);
        setAgentId(null);
        setPendingReceipt(null);
        setPayments([]);
        setTotalPagado(0);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, [token, saleId, isDetail]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const branchName = isDetail
    ? (sale?.branchName ?? null)
    : (branches.find((b) => b.id === branchId)?.name ?? null);
  const sellerName = isDetail
    ? (agents.find((a) => a.id === sale?.agentId)?.name ?? sale?.sellerName ?? '')
    : agentId != null
      ? (agents.find((a) => a.id === agentId)?.name ?? user?.name ?? '')
      : (user?.name ?? '');
  const clientName = isDetail ? (sale?.client?.name ?? null) : (client?.name ?? null);
  const clientId = isDetail ? (sale?.clientId ?? null) : (client?.id ?? null);
  const total = isDetail ? (sale?.total ?? 0) : round2(items.reduce((s, it) => s + it.quantity * it.unitPrice, 0));
  const hasItems = isDetail ? (sale?.items.length ?? 0) > 0 : items.length > 0;
  const isPaid = isDetail && sale?.estadoPago === 'pagado';
  const isVoided = isDetail && sale?.estado === 'anulada';
  const hasReceipt = receiptUri != null;
  const sectionEstadoPago: SaleEstadoPago = isDetail
    ? (sale?.estadoPago ?? 'por_cobrar')
    : metodo === 'por_pagar'
      ? 'por_cobrar'
      : 'pagado';

  const showApiError = (err: unknown, fallback: string) =>
    Alert.alert('Error', err instanceof ApiError ? err.message : fallback);

  const toInput = (line: {
    productId: number | null;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    marca: string | null;
    procedencia: string | null;
  }): QuoteItemInput => ({
    productId: line.productId,
    description: line.name,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    marca: line.marca,
    procedencia: line.procedencia,
  });

  const openEditor = (key: LineKey, quantity: number, unitPrice: number) => {
    setExpanded(key);
    setEditQty(String(quantity));
    setEditPrice(String(unitPrice));
  };

  const saveSavedItem = async (itemId: number) => {
    if (!token || saleId == null) return;
    const quantity = parseNum(editQty);
    const unitPrice = parseNum(editPrice);
    if (quantity == null || quantity <= 0 || unitPrice == null || unitPrice < 0) {
      Alert.alert('Datos inválidos', 'Revisa la cantidad y el precio.');
      return;
    }
    try {
      await api.updateSaleItem(saleId, itemId, { quantity, unitPrice }, token);
      setExpanded(null);
      await refreshLineItems();
    } catch (err) {
      showApiError(err, 'No se pudo guardar el artículo');
    }
  };

  const removeSavedItem = async (itemId: number) => {
    if (!token || saleId == null) return;
    try {
      await api.deleteSaleItem(saleId, itemId, token);
      setExpanded(null);
      await refreshLineItems();
    } catch (err) {
      showApiError(err, 'No se pudo borrar el artículo');
    }
  };

  const persistMetodo = async (next: SaleMetodoPago) => {
    setMetodo(next);
    if (!isDetail || !token || saleId == null) return;
    try {
      await api.updateSale(saleId, { metodoPago: next }, token);
      setSale((prev) => (prev ? { ...prev, metodoPago: next } : prev));
    } catch (err) {
      setMetodo(sale?.metodoPago ?? 'efectivo');
      showApiError(err, 'No se pudo guardar el método de pago');
    }
  };

  const persistNota = async () => {
    if (!isDetail || !token || saleId == null) return;
    const next = notaPago.trim() || null;
    if (next === (sale?.notaPago ?? null)) return;
    try {
      await api.updateSale(saleId, { notaPago: next }, token);
      setSale((prev) => (prev ? { ...prev, notaPago: next } : prev));
    } catch (err) {
      showApiError(err, 'No se pudo guardar la nota de pago');
    }
  };

  const persistTransferencia = async () => {
    if (!isDetail || !token || saleId == null) return;
    const next = transferenciaNumero.trim();
    if ((next || null) === (sale?.transferenciaNumero ?? null)) return;
    try {
      await api.updateSale(saleId, { transferenciaNumero: next || null }, token);
      setSale((prev) => (prev ? { ...prev, transferenciaNumero: next || null } : prev));
    } catch (err) {
      showApiError(err, 'No se pudo guardar el N° de transferencia');
    }
  };

  const handlePickReceipt = async (source: 'library' | 'camera') => {
    if (uploadingReceipt || isVoided) return;
    const picked =
      source === 'library' ? await pickImageFromLibrary() : await pickImageFromCamera();
    if (!picked) return;
    setReceiptUri(picked.uri);
    setPendingReceipt({ base64: picked.base64, ext: picked.ext });

    // En una venta ya guardada el comprobante se sube al instante.
    if (!isDetail || !token || saleId == null) return;
    setUploadingReceipt(true);
    try {
      const { url } = await api.uploadSaleReceipt(
        saleId,
        { base64: picked.base64, ext: picked.ext },
        token,
      );
      setPendingReceipt(null);
      setReceiptUri(mediaUrl(url));
      setSale((prev) => (prev ? { ...prev, comprobanteUrl: url } : prev));
    } catch (err) {
      showApiError(err, 'No se pudo subir el comprobante');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleAddPayment = async () => {
    if (!token || saleId == null || busyPayment) return;
    const monto = parseNum(payAmount);
    if (monto == null || monto <= 0) {
      Alert.alert('Datos inválidos', 'Escribe un monto mayor a 0.');
      return;
    }
    setBusyPayment(true);
    try {
      const res = await api.addSalePayment(saleId, { monto }, token);
      setPayments((prev) => [...prev, res.payment]);
      setTotalPagado(res.totalPagado);
      setSale((prev) =>
        prev ? { ...prev, estadoPago: res.estadoPago, totalPagado: res.totalPagado } : prev,
      );
      setPayAmount('');
      if (res.estadoPago === 'pagado') {
        Alert.alert('Venta pagada', 'Los abonos completaron el total de la venta.');
      }
    } catch (err) {
      showApiError(err, 'No se pudo registrar el pago');
    } finally {
      setBusyPayment(false);
    }
  };

  const handleDeletePayment = (paymentId: number) => {
    Alert.alert('Borrar pago', '¿Quieres eliminar este abono del historial?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          if (!token || saleId == null) return;
          setBusyPayment(true);
          try {
            const res = await api.deleteSalePayment(saleId, paymentId, token);
            setPayments((prev) => prev.filter((p) => p.id !== paymentId));
            setTotalPagado(res.totalPagado);
            setSale((prev) =>
              prev ? { ...prev, estadoPago: res.estadoPago, totalPagado: res.totalPagado } : prev,
            );
          } catch (err) {
            showApiError(err, 'No se pudo borrar el pago');
          } finally {
            setBusyPayment(false);
          }
        },
      },
    ]);
  };

  const pickClient = async (picked: Client) => {
    setClientsOpen(false);
    if (!isDetail) {
      setClient({ id: picked.id, name: picked.name, phone: picked.phone, email: picked.email });
      return;
    }
    if (!token || saleId == null) return;
    try {
      await api.updateSale(saleId, { clientId: picked.id }, token);
      setSale((prev) =>
        prev
          ? {
              ...prev,
              clientId: picked.id,
              clientName: picked.name,
              client: { id: picked.id, name: picked.name, phone: picked.phone, email: picked.email },
            }
          : prev,
      );
    } catch (err) {
      showApiError(err, 'No se pudo cambiar el cliente');
    }
  };

  const pickBranch = async (picked: Branch) => {
    setBranchesOpen(false);
    if (!isDetail) {
      setBranchId(picked.id);
      return;
    }
    if (!token || saleId == null) return;
    try {
      await api.updateSale(saleId, { branchId: picked.id }, token);
      setSale((prev) => (prev ? { ...prev, branchId: picked.id, branchName: picked.name } : prev));
    } catch (err) {
      showApiError(err, 'No se pudo cambiar la sucursal');
    }
  };

  const pickAgent = async (picked: Agent | null) => {
    setAgentsOpen(false);
    if (!isDetail) {
      setAgentId(picked?.id ?? null);
      return;
    }
    if (!token || saleId == null) return;
    try {
      const res = await api.updateSale(saleId, { agentId: picked?.id ?? null }, token);
      setAgentId(picked?.id ?? null);
      setSale((prev) =>
        prev
          ? { ...prev, agentId: picked?.id ?? null, sellerName: res.sellerName ?? prev.sellerName }
          : prev,
      );
    } catch (err) {
      showApiError(err, 'No se pudo cambiar el vendedor');
    }
  };

  const handleHeaderCheck = async () => {
    if (docTab === 'entrega' && isDetail) {
      handleDeliver();
      return;
    }
    if (isDetail) {
      if (!token || saleId == null || isVoided) { router.back(); return; }
      setSaving(true);
      try {
        await persistLineDraft();
        await api.updateSale(saleId, { notaPago: notaPago.trim() || null, transferenciaNumero: transferenciaNumero.trim() || null }, token);
        router.back();
      } catch (err) { showApiError(err, 'No se pudo guardar la venta'); }
      finally { setSaving(false); }
      return;
    }
    await handleRealizar();
  };

  const discardDraft = () => {
    Alert.alert('Descartar nota de venta', 'Se perderá lo que agregaste.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: () => {
          clear();
          router.back();
        },
      },
    ]);
  };

  // El ✓ en la pestaña de entrega: marca la venta como entregada (la primera
  // vez fija la fecha) y abre la vista previa de su nota de entrega.
  const handleDeliver = async () => {
    if (!token || saleId == null) return;
    if (isVoided) {
      Alert.alert('Venta anulada', 'No se puede entregar una venta anulada.');
      return;
    }
    setSaving(true);
    try {
      await persistLineDraft();
      if (!sale?.entregadaAt) {
        const res = await api.deliverSale(saleId, token);
        setSale((prev) => (prev ? { ...prev, entregadaAt: res.entregadaAt } : prev));
      }
      router.push(`/pos/${saleId}/delivery`);
    } catch (err) {
      showApiError(err, 'No se pudo registrar la entrega');
    } finally {
      setSaving(false);
    }
  };

  const toggleSello = async () => {
    const next = !includeSello;
    setIncludeSello(next);
    if (!isDetail || !token || saleId == null) return;
    try {
      await api.updateSale(saleId, { includeSello: next }, token);
      setSale((prev) => (prev ? { ...prev, includeSello: next } : prev));
    } catch (err) {
      setIncludeSello(!next);
      showApiError(err, 'No se pudo guardar el sello');
    }
  };

  const handleRealizar = async () => {
    if (!token) return;

    if (metodo === 'qr' && !hasReceipt) {
      Alert.alert('Falta la boleta', 'Adjunta la boleta de pago para registrar la venta.');
      return;
    }
    if (metodo === 'transferencia' && transferenciaNumero.trim().length === 0) {
      Alert.alert(
        'Falta el N° de transferencia',
        'Escribe el número de transferencia para registrar la venta.',
      );
      return;
    }
    const pagoInicialNum = parseNum(payInicial);
    if (metodo === 'por_pagar' && payInicial.trim() && (pagoInicialNum == null || pagoInicialNum <= 0)) {
      Alert.alert('Datos inválidos', 'El pago inicial debe ser mayor a 0.');
      return;
    }

    if (isDetail) {
      if (saleId == null || isPaid || isVoided) return;
      setSaving(true);
      try {
        if (pendingReceipt) {
          const { url } = await api.uploadSaleReceipt(saleId, pendingReceipt, token);
          setPendingReceipt(null);
          setReceiptUri(mediaUrl(url));
        }
        await api.updateSale(
          saleId,
          {
            estadoPago: 'pagado',
            metodoPago: metodo,
            notaPago: metodo === 'efectivo' && notaPago.trim() ? notaPago.trim() : undefined,
            transferenciaNumero:
              metodo === 'transferencia' ? transferenciaNumero.trim() : undefined,
          },
          token,
        );
        setSale((prev) =>
          prev
            ? {
                ...prev,
                estadoPago: 'pagado',
                metodoPago: metodo,
                notaPago: metodo === 'efectivo' ? notaPago.trim() || null : prev.notaPago,
                transferenciaNumero:
                  metodo === 'transferencia' ? transferenciaNumero.trim() : prev.transferenciaNumero,
              }
            : prev,
        );
        Alert.alert('Venta realizada', `Se registró el pago de la venta #${saleId}.`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } catch (err) {
        showApiError(err, 'No se pudo registrar el pago');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (items.length === 0) {
      Alert.alert('Venta vacía', 'Agrega al menos un producto.');
      return;
    }
    setSaving(true);
    try {
      const { sale: created } = await api.createSale(
        {
          clientId: client?.id ?? null,
          branchId,
          agentId,
          metodoPago: metodo,
          notaPago: metodo === 'efectivo' && notaPago.trim() ? notaPago.trim() : null,
          transferenciaNumero: metodo === 'transferencia' ? transferenciaNumero.trim() : null,
          pagoInicial:
            metodo === 'por_pagar' && pagoInicialNum != null && pagoInicialNum > 0
              ? pagoInicialNum
              : undefined,
          items: items.map(toInput),
        },
        token,
      );
      let receiptWarning = false;
      if (pendingReceipt) {
        try {
          await api.uploadSaleReceipt(created.id, pendingReceipt, token);
        } catch {
          receiptWarning = true;
        }
      }
      clear();
      Alert.alert(
        'Venta realizada',
        receiptWarning
          ? `Se generó la venta #${created.id}, pero el comprobante no se pudo subir. Adjúntalo desde el detalle.`
          : `Se generó la venta #${created.id}.`,
        [{ text: 'OK', onPress: () => router.replace(`/pos/${created.id}`) }],
      );
    } catch (err) {
      showApiError(err, 'No se pudo crear la venta');
    } finally {
      setSaving(false);
    }
  };

  const editorRow = (
    onCommit: () => void,
    onRemove: () => void,
    onQty: (v: string) => void,
    onPrice: (v: string) => void,
  ) => (
    <View style={styles.editorRow}>
      <TextInput
        style={[styles.editorInput, { color: colors.text, borderColor: colors.border }]}
        value={editQty}
        onChangeText={onQty}
        keyboardType="decimal-pad"
        placeholder="Cant."
        placeholderTextColor={colors.muted}
      />
      <TextInput
        style={[styles.editorInput, { color: colors.text, borderColor: colors.border }]}
        value={editPrice}
        onChangeText={onPrice}
        keyboardType="decimal-pad"
        placeholder="Precio"
        placeholderTextColor={colors.muted}
      />
      <Pressable
        style={[styles.editorDone, { backgroundColor: colors.primary }]}
        onPress={onCommit}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>Guardar</Text>
      </Pressable>
      <Pressable
        style={[styles.editorDone, { backgroundColor: colors.background }]}
        onPress={onRemove}
      >
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </Pressable>
    </View>
  );

  const refreshLineItems = async () => {
    if (!token || saleId == null) return;
    const { sale: updated } = await api.saleDetail(saleId, token);
    setSale(updated); setTotalPagado(updated.totalPagado); setPayments(updated.payments);
  };
  const persistLineDraft = async () => {
    if (!token || saleId == null || typeof expanded !== "number") return;
    const quantity = parseNum(editQty), unitPrice = parseNum(editPrice);
    if (quantity == null || quantity <= 0 || unitPrice == null || unitPrice < 0) throw new Error("Revisa la cantidad y el precio.");
    await api.updateSaleItem(saleId, expanded, { quantity, unitPrice }, token);
    setExpanded(null);
  };
  const duplicateLine = async (itemId: number) => {
    if (!token || saleId == null || lineBusy) return;
    setLineBusy(true);
    try { await persistLineDraft(); await api.duplicateItem('sales', saleId, itemId, token); await refreshLineItems(); }
    catch (err) { showApiError(err, 'No se pudo duplicar el producto'); }
    finally { setLineBusy(false); }
  };
  const reorderLines = async (ids: number[]) => {
    if (!token || saleId == null) return;
    await persistLineDraft(); await api.reorderItems('sales', saleId, ids, token); await refreshLineItems();
  };
  const renderLines = () => {
    if (isDetail) {
      return (sale?.items ?? []).map((it, index) => (
        <ItemSwipe key={it.id} disabled={isVoided || lineBusy} onEdit={() => openEditor(it.id, it.quantity, it.unitPrice)}
          onDelete={() => Alert.alert("Quitar producto", it.description, [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: () => { void removeSavedItem(it.id); } }])}
          onDuplicate={() => { void duplicateLine(it.id); }} onMove={() => setOrdering(true)}>
        <View style={[styles.itemCard, { backgroundColor: colors.surface }]}>
          <View style={styles.itemHead}>
            <View style={[styles.itemBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.itemBadgeText}>{index + 1}</Text>
            </View>
            <Pressable
              style={styles.itemInfo}
              onPress={() => openEditor(it.id, it.quantity, it.unitPrice)}
            >
              <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>
                {it.description}
              </Text>
              <Text style={[styles.itemMeta, { color: colors.muted }]}>
                {it.quantity} {it.unit} × {formatMoney(it.unitPrice)}
              </Text>
            </Pressable>
            <Text style={[styles.itemTotal, { color: colors.text }]}>{formatMoney(it.subtotal)}</Text>
          </View>
          {expanded === it.id &&
            editorRow(
              () => saveSavedItem(it.id),
              () => removeSavedItem(it.id),
              setEditQty,
              setEditPrice,
            )}
        </View>
        </ItemSwipe>
      ));
    }

    return items.map((it, index) => (
      <View key={it.key} style={[styles.itemCard, { backgroundColor: colors.surface }]}>
        <View style={styles.itemHead}>
          <View style={[styles.itemBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.itemBadgeText}>{index + 1}</Text>
          </View>
          <Pressable
            style={styles.itemInfo}
            onPress={() => openEditor(it.key, it.quantity, it.unitPrice)}
          >
            <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>
              {it.name}
            </Text>
            <Text style={[styles.itemMeta, { color: colors.muted }]}>
              {it.quantity} {it.unit} × {formatMoney(it.unitPrice)}
            </Text>
          </Pressable>
          <Text style={[styles.itemTotal, { color: colors.text }]}>
            {formatMoney(round2(it.quantity * it.unitPrice))}
          </Text>
        </View>
        {expanded === it.key &&
          editorRow(
            () => setExpanded(null),
            () => {
              removeItem(it.key);
              setExpanded(null);
            },
            (v) => {
              setEditQty(v);
              updateItem(it.key, { quantity: parseNum(v) ?? it.quantity });
            },
            (v) => {
              setEditPrice(v);
              updateItem(it.key, { unitPrice: parseNum(v) ?? it.unitPrice });
            },
          )}
      </View>
    ));
  };

  const metodoSelector = (
    <View style={styles.metodoRow}>
      {METODOS.map((m) => {
        const selected = m.key === metodo;
        return (
          <Pressable
            key={m.key}
            style={[
              styles.metodo,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
            onPress={() => persistMetodo(m.key)}
          >
            <Text
              style={[
                styles.metodoText,
                { color: selected ? colors.onPrimary : colors.muted },
              ]}
              numberOfLines={1}
            >
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const paymentSection = (
    <SalePaymentSection
      metodo={metodo}
      isDetail={isDetail}
      isVoided={isVoided}
      total={total}
      estadoPago={sectionEstadoPago}
      notaPago={notaPago}
      onChangeNota={setNotaPago}
      onBlurNota={persistNota}
      transferenciaNumero={transferenciaNumero}
      onChangeTransferencia={setTransferenciaNumero}
      onBlurTransferencia={persistTransferencia}
      receiptUri={receiptUri}
      onPickReceipt={handlePickReceipt}
      payments={payments}
      totalPagado={totalPagado}
      payInicial={payInicial}
      onChangePayInicial={setPayInicial}
      payAmount={payAmount}
      onChangePayAmount={setPayAmount}
      onAddPayment={handleAddPayment}
      onDeletePayment={handleDeletePayment}
      busyPayment={busyPayment}
    />
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.icon} />
        <Text style={[styles.emptyText, { color: colors.muted }]}>{error}</Text>
        <Pressable
          style={[styles.retryButton, { borderColor: colors.primary }]}
          onPress={() => {
            setLoading(true);
            load();
          }}
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: 32 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => isDetail ? router.back() : discardDraft()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>
            {docTab === 'entrega' ? 'Nota de entrega' : 'Nota de Venta'}
          </Text>
          <Pressable
            style={[styles.circleButton, { backgroundColor: colors.primary }]}
            onPress={handleHeaderCheck}
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

        <View style={styles.metaRow}>
          <Pressable style={styles.dateWrap} onPress={() => Alert.alert('Fecha', 'Próximamente')}>
            <Text style={[styles.metaMuted, { color: colors.muted }]}>
              Fecha {isDetail && sale ? dayMonthYear(sale.createdAt) : todayLabel()}
            </Text>
            <Ionicons name="pencil-outline" size={13} color={colors.muted} />
          </Pressable>
          <Text style={[styles.metaDoc, { color: colors.muted }]}>
            {docTab === 'entrega'
              ? `NOTA DE ENTREGA N° ${sale?.id ?? ''}`
              : `NOTA DE VENTA N° ${isDetail ? (sale?.id ?? '') : (nextNumber ?? '—')}`}
          </Text>
        </View>

        {isVoided && (
          <View style={[styles.voidBanner, { backgroundColor: '#ef444414' }]}>
            <Ionicons name="ban-outline" size={16} color="#ef4444" />
            <Text style={[styles.voidBannerText, { color: '#ef4444' }]}>
              Esta venta está anulada y no admite cambios.
            </Text>
          </View>
        )}

        {!isVoided && sale?.entregadaAt && (
          <View style={[styles.voidBanner, { backgroundColor: '#22c55e14' }]}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            <Text style={[styles.voidBannerText, { color: '#22c55e' }]}>
              Entregada el {dayMonthYear(sale.entregadaAt)}
            </Text>
          </View>
        )}

        <View style={[styles.vendorCard, { backgroundColor: colors.surface }]}>
          <Pressable
            style={styles.vendorBlock}
            onPress={() => setAgentsOpen(true)}
            disabled={isVoided}
          >
            <Text style={[styles.vendorLabel, { color: colors.text }]}>Vendedor</Text>
            <View style={styles.vendorValue}>
              <Ionicons name="person-outline" size={14} color={colors.muted} />
              <Text style={[styles.vendorText, { color: colors.muted }]} numberOfLines={1}>
                {(sellerName || '—').toUpperCase()}
              </Text>
              {!isVoided && <Ionicons name="chevron-down" size={13} color={colors.muted} />}
            </View>
          </Pressable>
          <View style={[styles.vendorDivider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.vendorBlock} onPress={() => setBranchesOpen(true)}>
            <Text style={[styles.vendorLabel, { color: colors.text }]}>Sucursal</Text>
            <View style={styles.vendorValue}>
              <Ionicons name="storefront-outline" size={14} color={colors.muted} />
              <Text style={[styles.vendorText, { color: colors.muted }]} numberOfLines={1}>
                {branchName ?? 'Sin sucursal'}
              </Text>
              <Ionicons name="chevron-down" size={13} color={colors.muted} />
            </View>
          </Pressable>
        </View>

        <SegmentedTabs<DocTab>
          options={[
            { key: 'venta', label: 'Nota de Venta' },
            { key: 'entrega', label: 'Nota de entrega' },
          ]}
          value={docTab}
          onChange={(key) => {
            if (key === 'entrega' && !isDetail) {
              Alert.alert(
                'Nota de entrega',
                'Registra la venta para generar su nota de entrega.',
              );
              return;
            }
            setDocTab(key);
          }}
        />

        <View>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Cliente / Empresa</Text>
          {clientName ? (
            <Pressable style={styles.clientRow} onPress={() => setClientsOpen(true)}>
              <Text style={[styles.clientName, { color: colors.text }]}>{clientName}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.icon} />
            </Pressable>
          ) : (
            <PrimaryButton
              title="+  Añadir cliente"
              onPress={() => router.push(`${basePath}/client`)}
            />
          )}
          {clientName && (
            <Pressable style={styles.clientPick} onPress={() => setClientsOpen(true)}>
              <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
              <Text style={[styles.clientPickText, { color: colors.primary }]}>Cambiar</Text>
            </Pressable>
          )}
        </View>

        {renderLines()}

        {hasItems ? (
          <PrimaryButton
            title="+  Añadir producto"
            onPress={() =>
              router.push(isDetail ? `${basePath}/item` : `${basePath}/item`)
            }
          />
        ) : (
          <Pressable
            style={[styles.outlineButton, { borderColor: colors.primary }]}
            onPress={() => router.push(`${basePath}/item`)}
          >
            <Text style={[styles.outlineText, { color: colors.primary }]}>+  Añadir artículo</Text>
          </Pressable>
        )}

        {hasItems && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>{formatMoney(total)}</Text>
            </View>

            {docTab === 'entrega' ? (
              <>
                <Pressable style={styles.toggleRow} onPress={toggleSello}>
                  <Text style={[styles.toggleLabel, { color: colors.text }]}>Incluir sello</Text>
                  <View
                    style={[
                      styles.toggle,
                      { borderColor: colors.primary },
                      includeSello && { backgroundColor: colors.primary },
                    ]}
                  >
                    {includeSello && (
                      <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
                    )}
                  </View>
                </Pressable>

                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Estado de pago</Text>
                {metodoSelector}
                {paymentSection}
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Estado de pago</Text>
                {metodoSelector}
                {paymentSection}

                {!(isDetail && metodo === 'por_pagar') && (
                  <PrimaryButton
                    title={
                      isVoided
                        ? 'Venta anulada'
                        : isPaid
                          ? 'Venta pagada'
                          : metodo === 'por_pagar'
                            ? 'Registrar venta'
                            : 'Realizar venta'
                    }
                    onPress={handleRealizar}
                    loading={saving}
                    disabled={isPaid || isVoided}
                  />
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      <ReorderItemsModal visible={ordering} items={sale?.items ?? []} onClose={() => setOrdering(false)} onSave={reorderLines} />
      <Modal
        visible={branchesOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBranchesOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setBranchesOpen(false)}>
          <Pressable style={[styles.optionsCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.optionsTitle, { color: colors.text }]}>Sucursal</Text>
            {branches.map((b) => (
              <Pressable key={b.id} style={styles.optionRow} onPress={() => pickBranch(b)}>
                <Text
                  style={[
                    styles.optionText,
                    { color: b.id === branchId ? colors.primary : colors.text },
                    b.id === branchId && styles.optionSelected,
                  ]}
                  numberOfLines={2}
                >
                  {b.name}
                </Text>
                {b.id === branchId && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={agentsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAgentsOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setAgentsOpen(false)}>
          <Pressable style={[styles.optionsCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.optionsTitle, { color: colors.text }]}>Vendedor</Text>
            <Pressable style={styles.optionRow} onPress={() => pickAgent(null)}>
              <Text
                style={[
                  styles.optionText,
                  { color: agentId == null ? colors.primary : colors.text },
                  agentId == null && styles.optionSelected,
                ]}
                numberOfLines={1}
              >
                Yo ({user?.name ?? '—'})
              </Text>
              {agentId == null && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </Pressable>
            {agents.map((a) => (
              <Pressable key={a.id} style={styles.optionRow} onPress={() => pickAgent(a)}>
                <Text
                  style={[
                    styles.optionText,
                    { color: a.id === agentId ? colors.primary : colors.text },
                    a.id === agentId && styles.optionSelected,
                  ]}
                  numberOfLines={1}
                >
                  {a.name}
                </Text>
                {a.id === agentId && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            ))}
            {agents.length === 0 && (
              <Text style={[styles.optionText, { color: colors.muted }]} numberOfLines={2}>
                Agrega agentes de venta en Configuración para asignarlos a las ventas.
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={clientsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClientsOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setClientsOpen(false)}>
          <Pressable style={[styles.optionsCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.optionsTitle, { color: colors.text }]}>Cliente</Text>
            <Pressable style={styles.optionRow} onPress={() => setClientsOpen(false)}>
              <Text style={[styles.optionText, { color: colors.text }]}>Sin Cliente</Text>
              {clientId == null && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </Pressable>
            {clients.map((c) => (
              <Pressable key={c.id} style={styles.optionRow} onPress={() => pickClient(c)}>
                <Text
                  style={[
                    styles.optionText,
                    { color: c.id === clientId ? colors.primary : colors.text },
                    c.id === clientId && styles.optionSelected,
                  ]}
                  numberOfLines={1}
                >
                  {c.name}
                </Text>
                {c.id === clientId && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaMuted: {
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  metaDoc: {
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  voidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  voidBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '600',
  },
  vendorCard: {
    flexDirection: 'row',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  vendorBlock: {
    flex: 1,
    gap: 6,
  },
  vendorDivider: {
    width: 1,
    marginHorizontal: 14,
  },
  vendorLabel: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  vendorValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vendorText: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: 'Poppins',
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Poppins',
    marginBottom: 8,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#d5d9e4',
    paddingBottom: 10,
  },
  clientName: {
    fontSize: 18,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  clientPick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  clientPickText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  itemCard: {
    borderRadius: 16,
    padding: 14,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: 12,
    fontFamily: 'Poppins',
    marginTop: 2,
  },
  itemTotal: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  editorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  editorInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Poppins',
  },
  editorDone: {
    minWidth: 38,
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
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
  divider: {
    height: 1,
    opacity: 0.5,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 14,
  },
  totalLabel: {
    fontSize: 17,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 17,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  metodoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metodo: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  metodoText: {
    fontSize: 12,
    fontFamily: 'Poppins',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  toggle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    maxHeight: '80%',
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
  },
  optionText: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  optionSelected: {
    fontWeight: '700',
  },
});
