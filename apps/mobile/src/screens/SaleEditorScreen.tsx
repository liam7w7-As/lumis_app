import { TutorialTarget, TutorialScrollView, TutorialHelpButton, useTutorialAvailability, withTutorial } from '../tutorials/TutorialElements';
import { useTutorial } from '../tutorials/TutorialContext';
import { FormModal } from '../components/FormModal';
import { DatePickerModal } from '../components/DatePickerModal';
import { feedback } from '../lib/feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IS_NOVALED } from '../lib/backend';
import { useLegacyPending } from '../hooks/useLegacyPending';
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
import { DocumentOptions, type DocumentOptionValues } from '../components/DocumentOptions';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { SalePaymentSection } from '../components/SalePaymentSection';
import { DocumentClientModal } from '../components/DocumentClientModal';
import { getDocumentClient, verifySavedDocumentClient } from '../lib/documentClient';
import { ClientPickerModal } from '../components/ClientPickerModal';
import { useDocumentEditAccess } from '../hooks/useDocumentEditAccess';
import { ProBadge } from '../components/ProBadge';
import { useKeyboardAwareNotes } from '../hooks/useKeyboardAwareNotes';

type DocTab = 'venta' | 'entrega';
type LineKey = string | number;
const METADATA_MAX_LENGTH = IS_NOVALED ? 150 : 100;

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

function parseNum(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

class ItemEditError extends Error {}

function SaleEditorScreenContent({ saleId }: { saleId?: number }) {
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const { token, user } = useAuth();
  const editAccess=useDocumentEditAccess();
  const insets = useSafeAreaInsets();
  const { scrollRef: notesScrollRef, inputRef: notesInputRef, onScroll: onNotesScroll,
    reveal: revealNotes, inputStyle: notesInputStyle } = useKeyboardAwareNotes();
  const { client, setClient, items, addItem, updateItem, removeItem, clear } = useDraft();

  const isDetail = saleId != null;
  const basePath = isDetail ? `/pos/${saleId}` : '/pos/new';

  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [nextNumber, setNextNumber] = useState<number | string | null>(null);
  const [docTab, setDocTab] = useState<DocTab>('venta');
  const [metodo, setMetodo] = useState<SaleMetodoPago>(IS_NOVALED && !user?.permissions?.takePayments ? 'por_pagar' : 'efectivo');
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [draftCreatedAt, setDraftCreatedAt] = useState<string | null>(null);
  const [clientsOpen, setClientsOpen] = useState(false);
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const submitLock=useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [lineBusy, setLineBusy] = useState(false);
  const [expanded, setExpanded] = useState<LineKey | null>(null);
  const [editName, setEditName] = useState('');
  const [editMarca, setEditMarca] = useState('');
  const [editProcedencia, setEditProcedencia] = useState('');
  const [editedMetadata, setEditedMetadata] = useState({ marca: false, procedencia: false });
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
  const [includeSello, setIncludeSello] = useState(false);
  const [documentNotes, setDocumentNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(false);
  const [optionsBusy, setOptionsBusy] = useState(false);
  const pending = useLegacyPending('/api/sales');
  const restored = useRef<unknown>(null);
  const canEditLines = !isDetail || sale?.canEditItems !== false;
  useEffect(() => {
    if (isDetail || !pending || saving || !token || restored.current === pending.body.solicitud_id) return;
    restored.current = pending.body.solicitud_id;
    const body = pending.body as unknown as Parameters<typeof api.createSale>[0];
    void Promise.resolve().then(async () => {
      clear(); setBranchId(body.branchId ?? null); setAgentId(body.agentId ?? null); setMetodo(body.metodoPago ?? 'por_pagar');
      setNotaPago(body.notaPago ?? ''); setTransferenciaNumero(body.transferenciaNumero ?? ''); setPayInicial(body.pagoInicial ? String(body.pagoInicial) : '');
      for (const item of body.items) addItem({ productId: item.productId ?? null, name: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, marca: item.marca ?? null, procedencia: item.procedencia ?? null });
      if (body.clientId) { const result = await api.clients(token, { id: body.clientId }); setClient(result.clients.find(item => item.id === body.clientId) ?? null); }
    }).catch(() => {});
  }, [isDetail, pending, saving, token, clear, addItem, setClient]);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [details, br, ags, nxt] = await Promise.all([
        isDetail ? api.saleDetail(saleId as number, token) : Promise.resolve(null),
        api.branches(token),
        api.agents(token).catch(() => ({ agents: [] })),
        api.nextSaleNumber(token).catch(() => ({ nextNumber: null })),
      ]);
      setBranches(br.branches);
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
        setDocumentNotes(details.sale.notes ?? '');
        setShowNotes(details.sale.showNotes ?? false);
        setIncludeSignature(details.sale.includeSignature ?? false);
      } else {
        setBranchId(current => current ?? br.branches[0]?.id ?? null);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'No se pudo cargar la venta.';
      setError(message); feedback.error('No se pudo abrir la venta', message);
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
  const clientName = isDetail ? (sale?.clientName ?? sale?.client?.name ?? null) : (client?.name ?? null);
  const clientId = isDetail ? (sale?.clientId ?? null) : (client?.id ?? null);
  const total = isDetail ? (sale?.total ?? 0) : round2(items.reduce((s, it) => s + it.quantity * it.unitPrice, 0));
  const hasItems = isDetail ? (sale?.items.length ?? 0) > 0 : items.length > 0;
  useTutorialAvailability({ ready: !loading && !error, hasItems });
  const tutorial = useTutorial();

  const isPaid = isDetail && sale?.estadoPago === 'pagado';
  const isVoided = isDetail && sale?.estado === 'anulada';
  const hasReceipt = receiptUri != null;
  const sectionEstadoPago: SaleEstadoPago = isDetail
    ? (sale?.estadoPago ?? 'por_cobrar')
    : metodo === 'por_pagar'
      ? 'por_cobrar'
      : 'pagado';

  const showApiError = (err: unknown, fallback: string) =>
    feedback.alert('Error', err instanceof ApiError || err instanceof ItemEditError ? err.message : fallback);

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

  const openEditor = (key: LineKey, quantity: number, unitPrice: number, description = '', marca: string | null = null, procedencia: string | null = null) => {
    if (!canEditLines || lineBusy || saving || isVoided) return;
    if(isDetail&&!editAccess.requestEdit())return;
    if (!isDetail && typeof expanded === 'string') {
      try { updateItem(expanded, draftLinePatch()); }
      catch (error) { showApiError(error, 'Revisa los datos del artículo'); return; }
      if (expanded === key) { setExpanded(null); return; }
    }
    setExpanded(key);
    setEditName(description);
    setEditMarca(marca ?? '');
    setEditProcedencia(procedencia ?? '');
    setEditedMetadata({ marca: false, procedencia: false });
    setEditQty(String(quantity));
    setEditPrice(String(unitPrice));
  };

  const lineDraftInput = () => {
    const description = editName.trim();
    if (!description) throw new ItemEditError('El nombre del artículo no puede quedar vacío.');
    if (description.length > 255) throw new ItemEditError('El nombre del artículo admite hasta 255 caracteres.');
    const quantity = parseNum(editQty), unitPrice = parseNum(editPrice);
    if (quantity == null || quantity <= 0 || unitPrice == null || unitPrice < 0) {
      throw new ItemEditError('Revisa la cantidad y el precio.');
    }
    const marca = editMarca.trim() || null, procedencia = editProcedencia.trim() || null;
    if ((marca?.length ?? 0) > METADATA_MAX_LENGTH) throw new ItemEditError(`La marca admite hasta ${METADATA_MAX_LENGTH} caracteres.`);
    if ((procedencia?.length ?? 0) > METADATA_MAX_LENGTH) throw new ItemEditError(`La procedencia admite hasta ${METADATA_MAX_LENGTH} caracteres.`);
    return { description, quantity, unitPrice,
      ...(editedMetadata.marca ? { marca } : {}),
      ...(editedMetadata.procedencia ? { procedencia } : {}) };
  };

  const draftLinePatch = () => {
    const { description, ...input } = lineDraftInput();
    return { name: description, ...input };
  };

  const saveDraftItem = (key: string) => {
    try {
      updateItem(key, draftLinePatch());
      setExpanded(null);
    } catch (error) { showApiError(error, 'Revisa los datos del artículo'); }
  };

  const saveSavedItem = async (itemId: number) => {
    if(!editAccess.requestEdit())return;
    if (!token || saleId == null || lineBusy || saving) return;
    try {
      const input = lineDraftInput();
      setLineBusy(true);
      await api.updateSaleItem(saleId, itemId, input, token);
      setExpanded(null);
      await refreshLineItems();
    } catch (err) {
      showApiError(err, 'No se pudo guardar el artículo');
    } finally {
      setLineBusy(false);
    }
  };

  const removeSavedItem = async (itemId: number) => {
    if(!editAccess.requestEdit())return;
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
      feedback.alert('Datos inválidos', 'Escribe un monto mayor a 0.');
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
        feedback.alert('Venta pagada', 'Los abonos completaron el total de la venta.');
      }
    } catch (err) {
      showApiError(err, 'No se pudo registrar el pago');
    } finally {
      setBusyPayment(false);
    }
  };

  const handleDeletePayment = (paymentId: number) => {
    feedback.alert('Borrar pago', '¿Quieres eliminar este abono del historial?', [
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
    if(!editAccess.requestEdit())return;
    try {
      await api.updateSale(saleId, { clientId: picked.id }, token);
      setSale((prev) =>
        prev
          ? {
              ...prev,
              clientId: picked.id,
              clientName: picked.name,
              clientDetails: undefined,
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
    if(!editAccess.requestEdit())return;
    try {
      await api.updateSale(saleId, { branchId: picked.id }, token);
      setSale((prev) => (prev ? { ...prev, branchId: picked.id, branchName: picked.name } : prev));
    } catch (err) {
      showApiError(err, 'No se pudo cambiar la sucursal');
    }
  };

  const saveDate = async (createdAt: string) => {
    if (!isDetail) {
      setDraftCreatedAt(createdAt);
      return;
    }
    if (!token || saleId == null || isVoided) throw new Error('Esta venta no admite cambios.');
    if(!editAccess.requestEdit())return;
    const result = await api.updateSale(saleId, { createdAt }, token);
    setSale((prev) => prev ? { ...prev, createdAt: result.createdAt ?? createdAt } : prev);
  };

  const pickAgent = async (picked: Agent | null) => {
    setAgentsOpen(false);
    if (!isDetail) {
      setAgentId(picked?.id ?? null);
      return;
    }
    if (!token || saleId == null) return;
    if(!editAccess.requestEdit())return;
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
    if (optionsBusy || saving) return;
    if (docTab === 'entrega' && isDetail) {
      handleDeliver();
      return;
    }
    if (isDetail) {
      if (!token || saleId == null || isVoided) { router.back(); return; }
      setSaving(true);
      try {
        await persistLineDraft();
        if (!await persistDocumentNotes()) return;
        await api.updateSale(saleId, { notaPago: notaPago.trim() || null, transferenciaNumero: transferenciaNumero.trim() || null,
          ...(IS_NOVALED && sale?.canEditItems ? { confirmDraft: true } : {}) }, token);
        router.back();
      } catch (err) { showApiError(err, 'No se pudo guardar la venta'); }
      finally { setSaving(false); }
      return;
    }
    await handleRealizar();
  };

  const discardDraft = () => {
    feedback.alert('Descartar nota de venta', 'Se perderá lo que agregaste.', [
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
      feedback.alert('Venta anulada', 'No se puede entregar una venta anulada.');
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

  const toggleDocumentOption = async (key: keyof DocumentOptionValues) => {
    if (!isDetail || !token || saleId == null || optionsBusy || isVoided) return;
    if (editAccess.access === 'read_only' || editAccess.access === 'checking') { editAccess.requestEdit(); return; }
    const values = { showNotes, includeSignature, includeSeal: includeSello };
    const next = !values[key];
    const patch = key === 'includeSeal' ? { includeSello: next } : { [key]: next };
    setOptionsBusy(true);
    try {
      await api.updateSale(saleId, patch, token);
      if (key === 'includeSeal') setIncludeSello(next);
      else if (key === 'showNotes') setShowNotes(next);
      else setIncludeSignature(next);
      setSale(prev => prev ? { ...prev, ...patch } : prev);
    } catch (err) {
      showApiError(err, 'No se pudo guardar la opción del documento');
    } finally {
      setOptionsBusy(false);
    }
  };

  const persistDocumentNotes = async () => {
    const next = documentNotes.trim() || null;
    if (!isDetail || !token || saleId == null || next === (sale?.notes ?? null)) return true;
    if (!editAccess.requestEdit()) return false;
    await api.updateSale(saleId, { notes: next }, token);
    setSale(prev => prev ? { ...prev, notes: next } : prev);
    return true;
  };

  const openDocumentPreview = async () => {
    if (!isDetail || saleId == null || saving || optionsBusy) return;
    setSaving(true);
    try {
      await persistLineDraft();
      if (!await persistDocumentNotes()) return;
      router.push(docTab === 'entrega' ? `/pos/${saleId}/delivery` : `/pos/${saleId}/preview`);
    } catch (err) {
      showApiError(err, docTab === 'entrega' ? 'No se pudo abrir el PDF de la entrega' : 'No se pudo abrir el PDF de la venta');
    } finally {
      setSaving(false);
    }
  };

  const handleRealizar = async () => {
    if (!token || submitLock.current) return;

    if (metodo === 'qr' && !hasReceipt) {
      feedback.alert('Falta la boleta', 'Adjunta la boleta de pago para registrar la venta.');
      return;
    }
    if (metodo === 'transferencia' && transferenciaNumero.trim().length === 0) {
      feedback.alert(
        'Falta el N° de transferencia',
        'Escribe el número de transferencia para registrar la venta.',
      );
      return;
    }
    const pagoInicialNum = parseNum(payInicial);
    if (metodo === 'por_pagar' && payInicial.trim() && (pagoInicialNum == null || pagoInicialNum <= 0)) {
      feedback.alert('Datos inválidos', 'El pago inicial debe ser mayor a 0.');
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
        feedback.alert('Venta realizada', `Se registró el pago de la venta #${sale?.number ?? saleId}.`, [
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
      feedback.alert('Venta vacía', 'Agrega al menos un producto.');
      return;
    }
    submitLock.current=true;
    setSaving(true);
    try {
      const draftPatch = !pending && typeof expanded === 'string' ? draftLinePatch() : null;
      const { sale: created } = await api.createSale(
        pending ? { ...pending.body, solicitud_id: undefined } as unknown as Parameters<typeof api.createSale>[0] : {
          clientId: client?.id ?? null,
          createdAt: draftCreatedAt ?? undefined,
          branchId,
          agentId,
          metodoPago: metodo,
          notaPago: metodo === 'efectivo' && notaPago.trim() ? notaPago.trim() : null,
          transferenciaNumero: metodo === 'transferencia' ? transferenciaNumero.trim() : null,
          pagoInicial:
            metodo === 'por_pagar' && pagoInicialNum != null && pagoInicialNum > 0
              ? pagoInicialNum
              : undefined,
          items: items.map(item => toInput(draftPatch && item.key === expanded ? { ...item, ...draftPatch } : item)),
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
      router.replace(`/pos/${created.id}/preview?created=1`);
      if(receiptWarning)feedback.warning('Venta guardada',`La venta #${created.number??created.id} está guardada. El comprobante no se pudo subir; puedes adjuntarlo desde el detalle.`);
    } catch (err) {
      showApiError(err, 'No se pudo crear la venta');
    } finally {
      submitLock.current=false;
      setSaving(false);
    }
  };

  const editorRow = (
    onCommit: () => void,
    onRemove: () => void,
    onQty: (v: string) => void,
    onPrice: (v: string) => void,
  ) => (
    <View>
    <View style={styles.editorNameField}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>Nombre del artículo</Text>
      <TextInput
        style={[styles.editorInput, styles.editorName, { color: colors.text, borderColor: colors.border }]}
        value={editName}
        onChangeText={setEditName}
        accessibilityLabel="Nombre del producto"
        editable={!lineBusy && !saving}
        maxLength={255}
        autoCorrect={false}
        multiline
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
      />
    </View>
    <View style={styles.editorNameField}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>Marca (opcional)</Text>
      <TextInput
        style={[styles.editorInput, styles.editorName, { color: colors.text, borderColor: colors.border }]}
        value={editMarca}
        onChangeText={value => { setEditMarca(value); setEditedMetadata(previous => ({ ...previous, marca: true })); }}
        accessibilityLabel="Marca del producto"
        editable={!lineBusy && !saving}
        maxLength={METADATA_MAX_LENGTH}
        autoCorrect={false}
        multiline
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
      />
    </View>
    <View style={styles.editorNameField}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>Procedencia (opcional)</Text>
      <TextInput
        style={[styles.editorInput, styles.editorName, { color: colors.text, borderColor: colors.border }]}
        value={editProcedencia}
        onChangeText={value => { setEditProcedencia(value); setEditedMetadata(previous => ({ ...previous, procedencia: true })); }}
        accessibilityLabel="Procedencia del producto"
        editable={!lineBusy && !saving}
        maxLength={METADATA_MAX_LENGTH}
        autoCorrect={false}
        multiline
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
      />
    </View>
    <View style={styles.editorRow}>
      <View style={styles.editorField}>
      <Text style={[styles.editorLabel, { color: colors.muted }]}>Cantidad</Text>
      <TextInput
        style={[styles.editorInput, { color: colors.text, borderColor: colors.border }]}
        value={editQty}
        onChangeText={onQty}
        accessibilityLabel="Cantidad del producto"
        editable={!lineBusy && !saving}
        keyboardType="decimal-pad"
      />
      </View>
      <View style={styles.editorField}>
      <Text style={[styles.editorLabel, { color: colors.muted }]}>Precio</Text>
      <TextInput
        style={[styles.editorInput, { color: colors.text, borderColor: colors.border }]}
        value={editPrice}
        onChangeText={onPrice}
        accessibilityLabel="Precio del producto"
        editable={!lineBusy && !saving}
        keyboardType="decimal-pad"
      />
      </View>
      <Pressable
        style={[styles.editorDone, { backgroundColor: colors.primary }]}
        onPress={onCommit}
        accessibilityRole="button"
        accessibilityLabel="Guardar cambios del producto"
        disabled={lineBusy || saving}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>Guardar</Text>
      </Pressable>
      <Pressable
        style={[styles.editorDone, { backgroundColor: colors.background }]}
        onPress={onRemove}
        disabled={lineBusy || saving}
      >
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </Pressable>
    </View>
    </View>
  );

  const refreshLineItems = async () => {
    if (!token || saleId == null) return;
    const { sale: updated } = await api.saleDetail(saleId, token);
    setSale(updated); setTotalPagado(updated.totalPagado); setPayments(updated.payments);
  };
  const persistLineDraft = async () => {
    if (!token || saleId == null || typeof expanded !== "number") return;
    if(!editAccess.canEdit)return;
    await api.updateSaleItem(saleId, expanded, lineDraftInput(), token);
    setExpanded(null);
  };
  const duplicateLine = async (itemId: number) => {
    if(!editAccess.requestEdit())return;
    if (!token || saleId == null || lineBusy) return;
    setLineBusy(true);
    try { await persistLineDraft(); await api.duplicateItem('sales', saleId, itemId, token); await refreshLineItems(); }
    catch (err) { showApiError(err, 'No se pudo duplicar el producto'); }
    finally { setLineBusy(false); }
  };
  const reorderLines = async (ids: number[]) => {
    if(!editAccess.requestEdit())return;
    if (!token || saleId == null) return;
    await persistLineDraft(); await api.reorderItems('sales', saleId, ids, token); await refreshLineItems();
  };
  const renderLines = () => {
    if (isDetail) {
      return (sale?.items ?? []).map((it, index) => (
        <ItemSwipe tutorialRow={index === 0} key={it.id} proLocked={editAccess.proLocked} disabled={isVoided || lineBusy || !canEditLines} onEdit={() => openEditor(it.id, it.quantity, it.unitPrice, it.description, it.marca, it.procedencia)}
          onDelete={() => {if(editAccess.requestEdit())feedback.alert("Quitar producto", it.description, [{ text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: () => { void removeSavedItem(it.id); } }]);}}
          onDuplicate={() => { void duplicateLine(it.id); }} onMove={() => {if(editAccess.requestEdit())setOrdering(true);}}>
        <View style={[styles.itemCard, { backgroundColor: colors.surface }]}>
          <View style={styles.itemHead}>
            <View style={[styles.itemBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.itemBadgeText}>{index + 1}</Text>
            </View>
            <Pressable
              style={styles.itemInfo}
              onPress={() => openEditor(it.id, it.quantity, it.unitPrice, it.description, it.marca, it.procedencia)}
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
      <View key={it.key} style={[styles.itemCard, styles.draftItemCard, { backgroundColor: colors.surface }]}>
        <View style={styles.itemHead}>
          <View style={[styles.itemBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.itemBadgeText}>{index + 1}</Text>
          </View>
          <Pressable
            style={styles.itemInfo}
            onPress={() => openEditor(it.key, it.quantity, it.unitPrice, it.name, it.marca, it.procedencia)}
            accessibilityRole="button"
            accessibilityLabel={`Editar artículo ${index + 1}`}
            accessibilityState={{ expanded: expanded === it.key }}
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
            () => saveDraftItem(it.key),
            () => {
              removeItem(it.key);
              setExpanded(null);
            },
            setEditQty,
            setEditPrice,
          )}
      </View>
    ));
  };

  const metodoSelector = (
    <TutorialTarget id="payment" ><View style={styles.metodoRow}>
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
    </View></TutorialTarget>
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.screen, { backgroundColor: colors.background }]}>
      <TutorialScrollView
        ref={notesScrollRef}
        onScroll={onNotesScroll}
        onLayout={revealNotes}
        onContentSizeChange={revealNotes}
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
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {docTab === 'entrega' ? 'Nota de entrega' : 'Nota de Venta'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TutorialHelpButton /><TutorialTarget id="save" ><Pressable
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
          </Pressable></TutorialTarget></View>
        </View>

        {!isDetail && pending && !saving && <Text style={{ color: colors.muted, fontFamily: 'Poppins', marginVertical: 12 }}>Envío pendiente. Pulsa Guardar para confirmar esta misma venta.</Text>}
        <View collapsable={false} pointerEvents={!isDetail && pending ? 'none' : 'auto'}>
        <View style={styles.metaRow}>
          <TutorialTarget id="date" ><Pressable style={styles.dateWrap} onPress={() => {if(!isDetail||editAccess.requestEdit())setDateOpen(true);}}
            accessibilityRole="button" accessibilityLabel="Editar fecha de la venta" disabled={isVoided || loading || IS_NOVALED}>
            <Text style={[styles.metaMuted, { color: colors.muted }]}>
              Fecha {dayMonthYear(sale?.createdAt ?? draftCreatedAt ?? new Date().toISOString())}
            </Text>
            {!isVoided && !IS_NOVALED && (isDetail&&editAccess.proLocked?<ProBadge/>:<Ionicons name="pencil-outline" size={13} color={colors.muted} />)}
          </Pressable></TutorialTarget>
          <Text style={[styles.metaDoc, { color: colors.muted }]}>
            {docTab === 'entrega'
              ? `ENTREGA · VENTA N° ${sale?.number ?? sale?.id ?? ''}`
              : `NOTA DE VENTA N° ${isDetail ? (sale?.number ?? sale?.id ?? '') : (nextNumber ?? '—')}`}
          </Text>
        </View>

        <TutorialTarget id="document" ><SegmentedTabs<DocTab>
          fullWidth
          options={[
            { key: 'venta', label: 'Nota de Venta' },
            { key: 'entrega', label: 'Nota de entrega' },
          ]}
          value={docTab}
          onChange={(key) => {
            if (key === 'entrega' && !isDetail) {
              feedback.alert(
                'Nota de entrega',
                'Registra la venta para generar su nota de entrega.',
              );
              return;
            }
            setDocTab(key);
          }}
        /></TutorialTarget>

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

        <TutorialTarget id="seller" ><View style={[styles.vendorCard, { backgroundColor: colors.surface }]}>
          <Pressable
            style={styles.vendorBlock}
            onPress={() => {if(!isDetail||editAccess.requestEdit())setAgentsOpen(true);}}
            disabled={isVoided}
          >
            <Text style={[styles.vendorLabel, { color: colors.text }]}>Vendedor</Text>
            <View style={styles.vendorValue}>
              <Ionicons name="person-outline" size={14} color={colors.muted} />
              <Text style={[styles.vendorText, { color: colors.muted }]} numberOfLines={1}>
                {(sellerName || '—').toUpperCase()}
              </Text>
              {!isVoided && (isDetail&&editAccess.proLocked?<ProBadge/>:<Ionicons name="chevron-down" size={13} color={colors.muted} />)}
            </View>
          </Pressable>
          <View style={[styles.vendorDivider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.vendorBlock} onPress={() => {if(!isDetail||editAccess.requestEdit())setBranchesOpen(true);}} disabled={sale?.canChangeBranch === false}>
            <Text style={[styles.vendorLabel, { color: colors.text }]}>Sucursal</Text>
            <View style={styles.vendorValue}>
              <Ionicons name="storefront-outline" size={14} color={colors.muted} />
              <Text style={[styles.vendorText, { color: colors.muted }]} numberOfLines={1}>
                {branchName ?? 'Sin sucursal'}
              </Text>
              {isDetail&&editAccess.proLocked?<ProBadge/>:<Ionicons name="chevron-down" size={13} color={colors.muted} />}
            </View>
          </Pressable>
        </View></TutorialTarget>

        <TutorialTarget id="client" ><View>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Cliente / Empresa</Text>
          {clientName ? (
            <Pressable style={styles.clientRow} accessibilityRole="button" accessibilityLabel={isDetail ? 'Editar datos del cliente' : 'Seleccionar cliente'}
              onPress={() => { if (isDetail) { if (editAccess.requestEdit()) setClientDetailsOpen(true); } else setClientsOpen(true); }} disabled={!!isVoided}>
              <Text style={[styles.clientName, { color: colors.text }]}>{clientName}</Text>
              {isDetail&&editAccess.proLocked?<ProBadge/>:<Ionicons name="chevron-forward" size={18} color={colors.icon} />}
            </Pressable>
          ) : (
            <PrimaryButton
              title="+  Añadir cliente"
              disabled={!!isVoided}
              onPress={() => {if(isDetail){if(editAccess.requestEdit())setClientDetailsOpen(true);}else{tutorial.notify('client');router.push(`${basePath}/client`);}}}
            />
          )}
          {clientName && sale?.canChangeBranch !== false && (
            <Pressable style={styles.clientPick} onPress={() => {if(!isDetail||editAccess.requestEdit())setClientsOpen(true);}}>
              {isDetail&&editAccess.proLocked?<ProBadge/>:<Ionicons name="swap-horizontal" size={14} color={colors.primary} />}
              <Text style={[styles.clientPickText, { color: colors.primary }]}>Cambiar</Text>
            </Pressable>
          )}
        </View></TutorialTarget>

        {renderLines()}

        {canEditLines && (hasItems ? (
          <TutorialTarget id="products" style={styles.addProductButton}><PrimaryButton
            title={isDetail&&editAccess.proLocked?'Pro · Añadir producto':'+  Añadir producto'} icon={isDetail&&editAccess.proLocked?'lock-closed-outline':undefined}
            onPress={() =>
              {if(!isDetail||editAccess.requestEdit()){tutorial.notify('product');router.push(`${basePath}/item`);}}
            }
          /></TutorialTarget>
        ) : (
          <TutorialTarget id="products"><Pressable
            style={[styles.outlineButton, { borderColor: colors.primary }]}
            onPress={() => {if(!isDetail||editAccess.requestEdit()){tutorial.notify('product');router.push(`${basePath}/item`);}}}
          >
            <Text style={[styles.outlineText, { color: colors.primary }]}>+  Añadir artículo</Text>
          </Pressable></TutorialTarget>
        ))}

        {hasItems && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>{formatMoney(total)}</Text>
            </View>

            {isDetail && docTab === 'venta' && (
              <>
                <DocumentOptions values={{ showNotes, includeSignature, includeSeal: includeSello }}
                  disabled={optionsBusy || saving || isVoided} onToggle={key => { void toggleDocumentOption(key); }} />
                {showNotes && <View style={styles.notesSection}>
                  <Pressable accessibilityRole="button" onPress={() => { if (!editAccess.canEdit) editAccess.requestEdit(); }}
                    style={styles.notesLabel}>
                    <Text style={[styles.toggleLabel, { color: colors.text }]}>Texto de las notas</Text>
                    {editAccess.proLocked && <ProBadge />}
                  </Pressable>
                  <TextInput value={documentNotes} onChangeText={setDocumentNotes} multiline maxLength={10000}
                    ref={notesInputRef} onFocus={revealNotes} onLayout={revealNotes}
                    onContentSizeChange={revealNotes} onSelectionChange={revealNotes} disableFullscreenUI
                    editable={editAccess.canEdit && !isVoided && !saving} accessibilityLabel="Texto de las notas adicionales"
                    placeholder="Notas adicionales" placeholderTextColor={colors.muted}
                    style={[styles.notesBox, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }, notesInputStyle]} />
                </View>}
              </>
            )}

            {docTab === 'entrega' ? (
              <>
                <DocumentOptions delivery values={{ showNotes, includeSignature, includeSeal: includeSello }}
                  disabled={optionsBusy || saving || isVoided} onToggle={key => { void toggleDocumentOption(key); }} />

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
                      !isDetail?'Guardar y ver PDF':isVoided
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
        </View>
        {isDetail&&<PrimaryButton title={docTab === 'entrega' ? 'Ver PDF de la entrega' : 'Ver PDF de la venta'} onPress={() => { void openDocumentPreview(); }} loading={saving} disabled={optionsBusy}/>}
      </TutorialScrollView>

      {dateOpen && <DatePickerModal value={sale?.createdAt ?? draftCreatedAt ?? new Date().toISOString()}
        onClose={() => setDateOpen(false)} onSave={saveDate} />}
      <ReorderItemsModal visible={ordering} items={sale?.items ?? []} onClose={() => setOrdering(false)} onSave={reorderLines} />
      <FormModal visible={branchesOpen} title="Elegir sucursal" icon="storefront-outline" onClose={() => setBranchesOpen(false)}>

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
      </FormModal>

      <FormModal visible={agentsOpen} title="Elegir vendedor" icon="person-outline" onClose={() => setAgentsOpen(false)}>

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
      </FormModal>

      {clientDetailsOpen && sale && <DocumentClientModal initial={getDocumentClient(sale)}
        onSave={async clientDetails => {
          if (!token || !editAccess.requestEdit() || isVoided) throw new Error('Esta venta está en modo consulta.');
          await api.updateSale(sale.id, { clientDetails }, token);
          const updated = await api.saleDetail(sale.id, token);
          verifySavedDocumentClient(updated.sale.clientDetails, clientDetails);
          setSale(current => current?.id === sale.id ? { ...current, clientDetails, clientName: clientDetails.name } : current);
        }} onClose={() => setClientDetailsOpen(false)} />}
      {clientsOpen && <ClientPickerModal selectedId={clientId} onPick={client => { void pickClient(client); }} onClose={() => setClientsOpen(false)} />}
    </KeyboardAvoidingView>
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateWrap: {
    minHeight: 44,
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
  draftItemCard: { marginTop: 12 },
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
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  editorField: { flex: 1, minWidth: 0, gap: 4 },
  editorLabel: { fontFamily: 'Poppins', fontSize: 12, lineHeight: 18 },
  editorNameField: {
    marginTop: 12,
  },
  editorName: {
    flex: 0,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  editorInput: {
    minWidth: 0,
    minHeight: 44,
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
  addProductButton: {
    marginTop: 16,
  },
  outlineButton: {
    marginTop: 16,
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
  toggleLabel: {
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  notesSection: { gap: 8, marginBottom: 12 },
  notesLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  notesBox: { borderWidth: 1, borderRadius: 12, minHeight: 90, padding: 12, fontSize: 15, fontFamily: 'Poppins', textAlignVertical: 'top' },
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

export const SaleEditorScreen = withTutorial(SaleEditorScreenContent, (props) => props.saleId != null ? 'sale-detail' : 'sale-editor');
