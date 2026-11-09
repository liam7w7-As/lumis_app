import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { Choice, Copy, Field, NovaledPage, Panel, Problem, Spinner, ui } from '../components/NovaledUI';
import { sendPendingQuote } from '../lib/pendingQuote';
import { STORAGE_NAMESPACE } from '../lib/backend';
import { addDays, decimalValue, newSubmissionKey, novaled, paymentMethods, validDate, type MobileCatalog, type MobileClient, type MobileProduct, type QuoteSubmission, type SaleSubmission, type StockSnapshot, type PaymentMethod } from '../lib/novaled';
import { saleSources, suggestSources, type StockLine } from '../lib/saleStock';
import { SaleStockFields } from '../components/SaleStockFields';

type Line = StockLine & { name: string; description: string; unitPrice: string; unit: string; applyDiscount: boolean };
type InitialPayment = { key: string; amount: string; method: PaymentMethod; reference: string };
function line(): Line { return { key: newSubmissionKey(), productId: null, name: '', description: '', quantity: '1', unitPrice: '0', unit: 'Unidad', applyDiscount: true }; }

function CatalogPicker({ kind, close, select }: { kind: 'products' | 'clients'; close: () => void; select: (item: MobileProduct | MobileClient) => void }) {
  const { token } = useAuth(); const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [last, setLast] = useState(1);
  const [items, setItems] = useState<(MobileProduct | MobileClient)[]>([]); const [busy, setBusy] = useState(true); const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setBusy(true); setError(null);
      if (!token) return;
      const request = kind === 'products' ? novaled.products(token, search, page) : novaled.clients(token, search, page);
      void request.then(result => { if (alive) { setItems(result.data); setLast(result.meta.last_page); } })
        .catch(err => { if (alive) { setItems([]); setError(err instanceof Error ? err.message : 'No se pudo consultar el catálogo.'); } })
        .finally(() => { if (alive) setBusy(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [token, kind, search, page, retry]);
  return <Modal animationType="slide" onRequestClose={close}>
    <NovaledPage title={kind === 'products' ? 'Elegir producto' : 'Elegir cliente'} back={false}>
      <Choice label="Cerrar catálogo" onPress={close} />
      <Field label="Buscar" value={search} onChangeText={value => { setSearch(value); setPage(1); setBusy(true); }} placeholder={kind === 'products' ? 'Nombre o código' : 'Nombre del cliente'} autoFocus />
      <Problem message={error} retry={() => setRetry(value => value + 1)} />
      {busy ? <Spinner /> : items.length === 0 ? <Copy muted>No se encontraron resultados.</Copy> : items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Elegir ' + item.name} onPress={() => { select(item); close(); }} style={{ marginBottom: 12 }}>
          <Panel><Copy large>{item.name}</Copy>{'price' in item ? <Copy muted>{item.price.toFixed(2)} / {item.unit} · {item.code}</Copy> : <Copy muted>{item.phone ?? item.email ?? 'Cliente registrado'}</Copy>}</Panel>
        </Pressable>)}
      <View style={ui.row}><Choice label="Anterior" disabled={page <= 1 || busy} onPress={() => setPage(value => value - 1)} />
        <Copy>{page} / {last}</Copy><Choice label="Siguiente" disabled={page >= last || busy} onPress={() => setPage(value => value + 1)} /></View>
    </NovaledPage>
  </Modal>;
}

export function NovaledQuoteEditorScreen({ mode = 'quote' }: { mode?: 'quote' | 'sale' }) {
  const isSale = mode === 'sale';
  const { from } = useLocalSearchParams<{ from?: string }>(); const { token, user } = useAuth(); const { business } = useBusiness();
  const [catalog, setCatalog] = useState<MobileCatalog | null>(null); const [loading, setLoading] = useState(true); const [reload, setReload] = useState(0);
  const [branchId, setBranchId] = useState<number>(0); const [clientId, setClientId] = useState<number | null>(null); const [clientName, setClientName] = useState('');
  const [issuedAt, setIssuedAt] = useState(''); const [expiresAt, setExpiresAt] = useState(''); const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([line()]); const [policyId, setPolicyId] = useState<number | null>(null); const [scope, setScope] = useState<'global' | 'seleccion'>('global');
  const [percent, setPercent] = useState('0'); const [amount, setAmount] = useState('0'); const [policyValue, setPolicyValue] = useState('0');
  const [picker, setPicker] = useState<'products' | 'clients' | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<QuoteSubmission | SaleSubmission | null>(null); const lock = useRef(false);
  const [stock, setStock] = useState<StockSnapshot | null>(null); const [stockBusy, setStockBusy] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null); const [stockRevision, setStockRevision] = useState(0);
  const [payments, setPayments] = useState<InitialPayment[]>([]);
  const pendingKey = STORAGE_NAMESPACE + '_' + mode + '_pending_' + (user?.id ?? 'guest');
  const hydrate = useCallback((payload: QuoteSubmission | SaleSubmission) => {
    setBranchId(payload.sucursal_id); setClientId(payload.cliente_id); setClientName(payload.cliente_nombre);
    if (payload.tipo_documento === 'cotizacion') { setIssuedAt(payload.fecha_documento); setExpiresAt(payload.fecha_vencimiento); }
    setNotes(payload.notas);
    setPolicyId(payload.politica_descuento_id); setPolicyValue(String(payload.descuento_valor ?? 0)); setScope(payload.descuento_alcance);
    setPercent(String(payload.descuento_global_porcentaje)); setAmount(String(payload.descuento_global_monto));
    const saleItems = payload.tipo_documento === 'nota_venta' ? payload.items : undefined;
    if (payload.tipo_documento === 'nota_venta') setPayments((payload.pagos ?? []).map(payment => ({ key: newSubmissionKey(), amount: String(payment.monto), method: payment.metodo_pago, reference: payment.referencia_pago ?? '' })));
    setLines(payload.items.map((item, index) => ({ key: newSubmissionKey(), productId: item.articulo_id, name: item.nombre,
      description: item.descripcion ?? '', quantity: String(item.cantidad), unitPrice: String(item.precio_unitario_venta), unit: item.unidad_medida, applyDiscount: item.aplica_descuento,
      ...(saleItems?.[index] ? { sources: Object.fromEntries(saleItems[index].salidas_stock.map(source => [source.sub_ubicacion_id === null ? 'general' : String(source.sub_ubicacion_id), String(source.cantidad)])),
        ...(saleItems[index].entrada_manual ? { entry: { quantity: String(saleItems[index].entrada_manual.cantidad), cost: String(saleItems[index].entrada_manual.costo_unitario), reason: saleItems[index].entrada_manual.motivo, locationId: saleItems[index].salidas_stock[0]?.sub_ubicacion_id ?? null } } : {}) } : {}),
    })));
  }, []);
  useEffect(() => {
    let alive = true;
    if (!token) return;
    void (async () => {
      await Promise.resolve();
      if (!alive) return;
      setLoading(true); setError(null);
      const available = await novaled.catalog(token);
      const stored = await SecureStore.getItemAsync(pendingKey);
      if (!alive) return;
      setCatalog(available); setIssuedAt(available.today); setExpiresAt(addDays(available.today, available.validDays));
      setBranchId(available.branches.find(item => item.id === user?.branchId)?.id ?? available.branches[0]?.id ?? 0);
      if (stored) {
        const payload = JSON.parse(stored) as QuoteSubmission | SaleSubmission;
        if (payload.tipo_documento !== (isSale ? 'nota_venta' : 'cotizacion') || !Array.isArray(payload.items) || !payload.solicitud_id) throw new Error('No se pudo recuperar el envío pendiente.');
        hydrate(payload); setPending(payload); return;
      }
      if (from) {
        const { data: quote } = await novaled.quote(Number(from), token); if (!alive) return;
        if (isSale ? !quote.canConvert : !quote.canRequote) throw new Error(isSale ? 'Esta cotización ya no puede convertirse en venta.' : 'Esta cotización no admite una nueva versión con tu usuario.');
        setBranchId(quote.branchId); setClientId(quote.clientId); setClientName(quote.clientName); setNotes(quote.notes ?? '');
        setPolicyId(quote.discountPolicyId); setPolicyValue(String(quote.discountValue)); setScope(quote.discountScope ?? 'global');
        setPercent(String(quote.discountPercent)); setAmount(String(quote.discountAmount ?? 0));
        setLines((quote.items ?? []).map(item => ({ key: newSubmissionKey(), productId: item.productId, name: item.name,
          description: item.description ?? '', quantity: String(item.quantity), unitPrice: String(item.unitPrice), unit: item.unit, applyDiscount: item.applyDiscount })));
      }
    })().catch(err => { if (alive) { setCatalog(null); setError(err instanceof Error ? err.message : 'No se pudo abrir el formulario.'); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token, from, pendingKey, reload, user?.branchId, hydrate, isSale]);
  const productIds = [...new Set(lines.map(item => item.productId).filter((id): id is number => id !== null))].sort((a,b) => a-b).join(',');
  useEffect(() => {
    if (!isSale || !token || !branchId) return;
    let alive = true;
    const timer = setTimeout(() => {
      setStockBusy(true); setStockError(null);
      const ids = productIds ? productIds.split(',').map(Number) : [];
      const chunks = ids.length ? Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i*50, i*50+50)) : [[]];
      void Promise.all(chunks.map(chunk => novaled.stock(token, branchId, chunk, from ? Number(from) : undefined)))
        .then(results => { if (alive) setStock({ ...results[0], products: results.flatMap(result => result.products) }); })
        .catch(err => { if (alive) { setStock(null); setStockError(err instanceof Error ? err.message : 'No se pudo consultar el inventario.'); } })
        .finally(() => { if (alive) setStockBusy(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [isSale, token, branchId, productIds, from, stockRevision]);
  const suggested = stock?.branchId === branchId ? suggestSources(lines, stock) : {};
  const disabled = busy || !!pending;
  const patchLine = (key: string, input: Partial<Line>) => setLines(items => items.map(item => item.key === key ? { ...item, ...input } : item));
  const createPayload = (): QuoteSubmission | SaleSubmission => {
    if (!catalog || !catalog.branches.some(item => item.id === branchId)) throw new Error('Elige una sucursal disponible.');
    if (!clientName.trim()) throw new Error('Escribe el nombre del cliente o elige uno del catálogo.');
    if (!isSale && (!validDate(issuedAt) || !validDate(expiresAt) || expiresAt < issuedAt)) throw new Error('Revisa las fechas. Usa AAAA-MM-DD y una vigencia posterior o igual a la emisión.');
    if (!lines.length) throw new Error('Agrega al menos un producto.');
    const discountPercent = decimalValue(percent, 'Descuento porcentual');
    if (discountPercent > 100) throw new Error('El descuento porcentual no puede superar el 100%.');
    if (policyId && !catalog.discounts.some(item => item.id === policyId)) throw new Error('El descuento anterior ya no está disponible. Elige otro descuento.');
    const base = {
      solicitud_id: newSubmissionKey(), sucursal_id: branchId,
      cliente_id: clientId, cliente_nombre: clientName.trim(), notas: notes,
      politica_descuento_id: policyId, ...(policyId ? { descuento_valor: decimalValue(policyValue, 'Valor del descuento') } : {}),
      descuento_alcance: scope, descuento_global_porcentaje: discountPercent, descuento_global_monto: decimalValue(amount, 'Descuento fijo'),
      items: lines.map((item, index) => {
        if (!item.name.trim() || !item.unit.trim()) throw new Error('Completa el nombre y la unidad del producto ' + (index + 1) + '.');
        return { articulo_id: item.productId, nombre: item.name.trim(), descripcion: item.description, cantidad: decimalValue(item.quantity, 'Cantidad del producto ' + (index + 1), 0.01),
          precio_unitario_venta: decimalValue(item.unitPrice, 'Precio del producto ' + (index + 1)), unidad_medida: item.unit.trim(), aplica_descuento: item.applyDiscount };
      }),
    };
    if (!isSale) return { ...base, tipo_documento: 'cotizacion', fecha_documento: issuedAt, fecha_vencimiento: expiresAt, metodo_pago: 'efectivo', monto_pagado: 0,
      ...(from ? { recotizacion_de_id: Number(from) } : {}) };
    if (!stock || stock.branchId !== branchId || stockBusy || stockError) throw new Error('Actualiza las existencias de la sucursal antes de emitir la venta.');
    return { ...base, tipo_documento: 'nota_venta', metodo_pago: payments[0]?.method ?? 'efectivo', monto_pagado: 0,
      ...(from ? { documento_origen_id: Number(from) } : {}),
      pagos: payments.map(payment => ({ monto: decimalValue(payment.amount, 'Importe del cobro', 0.01), metodo_pago: payment.method, referencia_pago: payment.reference })),
      items: base.items.map((item,index) => {
        const current = lines[index];
        if (current.entry && current.entry.reason.trim().length < 3) throw new Error('Escribe el motivo de la entrada inicial del producto.');
        return { ...item, salidas_stock: saleSources(current, suggested[current.key] ?? {}, stock),
          ...(current.entry ? { entrada_manual: { cantidad: decimalValue(current.entry.quantity, 'Cantidad de entrada', 0.01), costo_unitario: decimalValue(current.entry.cost, 'Costo unitario'), motivo: current.entry.reason.trim() } } : {}) };
      }) };
  };
  const save = async () => {
    if (!token || lock.current) return; lock.current = true; setBusy(true); setError(null);
    try {
      const result = await sendPendingQuote<{ data: { id: number } }, QuoteSubmission | SaleSubmission>(pending ?? createPayload(), {
        write: value => SecureStore.setItemAsync(pendingKey, value),
        remove: () => SecureStore.deleteItemAsync(pendingKey),
      }, payload => payload.tipo_documento === 'nota_venta' ? novaled.createSale(payload, token) : novaled.create(payload, token), setPending);
      router.replace((isSale ? '/pos/' : '/quotes/') + result.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Puedes volver a intentar el mismo envío.');
    } finally { lock.current = false; setBusy(false); }
  };
  const selectedPolicy = catalog?.discounts.find(item => item.id === policyId);
  const num = (value: string) => Number(value.replace(',', '.')) || 0;
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const subtotal = lines.reduce((sum, item) => sum + round(num(item.quantity) * num(item.unitPrice)), 0);
  const discountBase = lines.filter(item => scope === 'global' || item.applyDiscount).reduce((sum, item) => sum + round(num(item.quantity) * num(item.unitPrice)), 0);
  const estimatedDiscount = selectedPolicy ? (selectedPolicy.tipo === 'porcentaje' ? round(discountBase * Math.min(100, num(policyValue)) / 100) : Math.min(discountBase, num(policyValue)))
    : Math.min(subtotal, round(subtotal * Math.min(100, num(percent)) / 100) + num(amount));
  return <NovaledPage title={isSale ? from ? 'Venta desde cotización' : 'Nueva venta' : from ? 'Nueva versión' : 'Nueva cotización'}>
    <Problem message={error} retry={!catalog ? () => setReload(value => value + 1) : undefined} />
    {loading ? <Spinner /> : !(isSale ? user?.permissions?.createSales : user?.permissions?.createQuotes) ? <Copy>No tienes permiso para crear este documento.</Copy> : !!catalog && <>
      {pending && <Panel><Copy large>Envío pendiente de confirmar</Copy><Copy>Reintenta para recuperar la misma cotización. Los datos quedan protegidos hasta recibir la respuesta de Novaled.</Copy></Panel>}
      <Panel><Copy large>Sucursal</Copy><View style={ui.row}>{catalog.branches.map(branch => <Choice key={branch.id} label={branch.name} active={branchId === branch.id} disabled={disabled} onPress={() => { setBranchId(branch.id); setLines(items => items.map(item => ({ ...item, sources: undefined, entry: undefined }))); }} />)}</View>
        <Copy muted>El número se asigna al guardar en Novaled.</Copy></Panel>
      <Panel><Field label="Cliente" maxLength={255} value={clientName} editable={!disabled} onChangeText={value => { setClientName(value); setClientId(null); }} />
        <Choice label="Elegir cliente registrado" disabled={disabled} onPress={() => setPicker('clients')} />
        {!isSale && <><Field label="Fecha de emisión · AAAA-MM-DD" value={issuedAt} maxLength={10} editable={!disabled && !!user?.permissions?.editQuoteDates} onChangeText={setIssuedAt} />
        <Field label="Válida hasta · AAAA-MM-DD" value={expiresAt} maxLength={10} editable={!disabled} onChangeText={setExpiresAt} /></>}</Panel>
      {isSale && <><Problem message={stockError} retry={() => setStockRevision(value => value+1)} />{stockBusy && <Spinner />}<Choice label="Actualizar existencias" disabled={disabled || stockBusy} onPress={() => setStockRevision(value => value+1)} /></>}
      <Copy large>Productos</Copy>
      {lines.map((item, index) => <Panel key={item.key}>
        <Field label={'Producto ' + (index + 1)} value={item.name} maxLength={255} editable={!disabled} onChangeText={value => patchLine(item.key, { name: value })} />
        {!item.productId && <Field label="Descripción" value={item.description} multiline maxLength={5000} editable={!disabled} onChangeText={value => patchLine(item.key, { description: value })} />}
        <View style={ui.row}><View style={{ flex: 1, minWidth: 120 }}><Field label="Cantidad" value={item.quantity} keyboardType="decimal-pad" editable={!disabled} onChangeText={value => patchLine(item.key, { quantity: value, sources: undefined })} /></View>
          <View style={{ flex: 1, minWidth: 120 }}><Field label="Precio unitario" value={item.unitPrice} keyboardType="decimal-pad" editable={!disabled} onChangeText={value => patchLine(item.key, { unitPrice: value })} /></View></View>
        <Field label="Unidad de medida" value={item.unit} maxLength={50} editable={!disabled} onChangeText={value => patchLine(item.key, { unit: value })} />
        {isSale && stock?.branchId === branchId && <SaleStockFields item={item} stock={stock} selected={suggested[item.key] ?? {}} disabled={disabled} allowEntry={!!user?.permissions?.manualEntry} change={patch => patchLine(item.key, patch)} />}
        {!!policyId && scope === 'seleccion' && <Choice label={item.applyDiscount ? '✓ Aplica descuento' : 'Aplicar descuento'} active={item.applyDiscount} disabled={disabled} onPress={() => patchLine(item.key, { applyDiscount: !item.applyDiscount })} />}
        <Choice label="Quitar producto" disabled={disabled} onPress={() => setLines(items => items.filter(current => current.key !== item.key))} />
      </Panel>)}
      <View style={ui.row}><Choice label="Agregar del catálogo" disabled={disabled || lines.length >= 200} onPress={() => setPicker('products')} />
        <Choice label="Agregar producto libre" disabled={disabled || lines.length >= 200} onPress={() => setLines(items => [...items, line()])} /></View>
      <Panel><Copy large>Descuento</Copy><View style={ui.row}><Choice label="Manual / sin descuento" active={!policyId} disabled={disabled} onPress={() => { setPolicyId(null); setPercent('0'); setAmount('0'); }} />
        {catalog.discounts.map(policy => <Choice key={policy.id} label={policy.nombre} active={policyId === policy.id} disabled={disabled} onPress={() => { setPolicyId(policy.id); setPolicyValue(String(policy.valor)); setScope(policy.alcance_default); setPercent('0'); setAmount('0'); }} />)}</View>
        {policyId ? <><Field label={selectedPolicy?.tipo === 'porcentaje' ? 'Porcentaje de descuento' : 'Importe del descuento'} value={policyValue} keyboardType="decimal-pad" editable={!disabled} onChangeText={setPolicyValue} />
          <View style={ui.row}><Choice label="Todos los productos" active={scope === 'global'} disabled={disabled} onPress={() => setScope('global')} /><Choice label="Productos seleccionados" active={scope === 'seleccion'} disabled={disabled} onPress={() => setScope('seleccion')} /></View></>
          : <><Field label="Descuento porcentual" value={percent} keyboardType="decimal-pad" editable={!disabled} onChangeText={setPercent} /><Field label="Descuento fijo" value={amount} keyboardType="decimal-pad" editable={!disabled} onChangeText={setAmount} /></>}
      </Panel>
      {isSale && <Panel><Copy large>Cobro inicial</Copy><Copy muted>Sin cobros, la venta queda por cobrar.</Copy>
        {payments.map(payment => <View key={payment.key} style={{ gap: 10 }}>
          <Field label="Importe del cobro" value={payment.amount} keyboardType="decimal-pad" editable={!disabled} onChangeText={value => setPayments(items => items.map(item => item.key === payment.key ? { ...item, amount: value } : item))} />
          <View style={ui.row}>{paymentMethods.map(method => <Choice key={method.id} label={method.label} active={payment.method === method.id} disabled={disabled} onPress={() => setPayments(items => items.map(item => item.key === payment.key ? { ...item, method: method.id } : item))} />)}</View>
          <Field label="Referencia del cobro" value={payment.reference} maxLength={100} editable={!disabled} onChangeText={value => setPayments(items => items.map(item => item.key === payment.key ? { ...item, reference: value } : item))} />
          <Choice label="Quitar cobro" disabled={disabled} onPress={() => setPayments(items => items.filter(item => item.key !== payment.key))} />
        </View>)}
        {user?.permissions?.takePayments && <Choice label="Agregar cobro" disabled={disabled || payments.length >= 10} onPress={() => setPayments(items => [...items, { key: newSubmissionKey(), amount: '', method: 'efectivo', reference: '' }])} />}
      </Panel>}
      <Field label="Observaciones" value={notes} multiline editable={!disabled} onChangeText={setNotes} />
      <Panel><Copy large>Total estimado: {Math.max(0, round(subtotal - estimatedDiscount)).toFixed(2)} {business?.moneda ?? 'Bs'}</Copy>
        <Copy muted>{isSale ? 'Al emitir, Novaled registra el cobro y descuenta las existencias seleccionadas.' : 'Novaled confirma el importe final y conserva esta cotización al emitirla.'}</Copy></Panel>
      <PrimaryButton title={pending ? 'Confirmar envío pendiente' : isSale ? 'Emitir venta' : from ? 'Guardar nueva versión' : 'Emitir cotización'} loading={busy} onPress={() => void save()} />
    </>}
    {picker && <CatalogPicker kind={picker} close={() => setPicker(null)} select={item => {
      if ('price' in item) setLines(items => [...items.filter(current => current.name.trim()), { ...line(), productId: item.id, name: item.name, description: item.description ?? '', unitPrice: String(item.price), unit: item.unit }]);
      else { setClientId(item.id); setClientName(item.name); }
    }} />}
  </NovaledPage>;
}
