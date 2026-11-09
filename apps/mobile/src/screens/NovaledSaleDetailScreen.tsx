import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNovaledSale } from '../hooks/useNovaledSale';
import { Choice, Copy, Field, NovaledPage, Panel, Problem, Spinner, ui } from '../components/NovaledUI';
import { PrimaryButton } from '../components/PrimaryButton';
import { decimalValue, newOperationUuid, novaled, paymentMethods, paymentStatus, type PaymentMethod, type PaymentSubmission } from '../lib/novaled';
import { sendPendingQuote } from '../lib/pendingQuote';
import { STORAGE_NAMESPACE } from '../lib/backend';
export function NovaledSaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const saleId = Number(id);
  const { token,user } = useAuth(); const { business } = useBusiness(); const { sale,setSale,loading,error,reload } = useNovaledSale(saleId);
  const [amount,setAmount] = useState(''); const [method,setMethod] = useState<PaymentMethod>('efectivo'); const [reference,setReference] = useState('');
  const [pending,setPending] = useState<PaymentSubmission | null>(null); const [queueReady,setQueueReady] = useState(false);
  const [busy,setBusy] = useState(false); const [problem,setProblem] = useState<string | null>(null); const lock = useRef(false);
  const key = STORAGE_NAMESPACE + '_payment_' + user?.id + '_' + saleId;
  useEffect(() => {
    let alive = true;
    void SecureStore.getItemAsync(key).then(raw => {
      if (!alive) return;
      if (raw) { const payload = JSON.parse(raw) as PaymentSubmission; if (!payload.clave_operacion) throw Error('No se pudo recuperar el cobro pendiente.');
        setPending(payload); setAmount(String(payload.monto)); setMethod(payload.metodo_pago); setReference(payload.referencia_pago); }
      setQueueReady(true);
    }).catch(err => { if (alive) setProblem(err instanceof Error ? err.message : 'No se pudo recuperar el cobro.'); });
    return () => { alive = false; };
  }, [key]);
  const pay = async () => {
    if (!token || lock.current || !queueReady) return; lock.current = true; setBusy(true); setProblem(null);
    try {
      const payload = pending ?? { monto: decimalValue(amount,'Importe del cobro',0.01), metodo_pago: method, referencia_pago: reference, clave_operacion: newOperationUuid() };
      const result = await sendPendingQuote(payload,{ write: value => SecureStore.setItemAsync(key,value), remove: () => SecureStore.deleteItemAsync(key) },
        value => novaled.pay(saleId,value,token),setPending);
      setSale(result.data); setAmount(''); setReference('');
    } catch (err) { setProblem(err instanceof Error ? err.message : 'No se pudo registrar el cobro.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const money = (value: number) => value.toFixed(2) + ' ' + (business?.moneda ?? 'Bs');
  const disabled = busy || !!pending || !queueReady;
  return <NovaledPage title={sale ? 'Venta #' + sale.number : 'Venta'}>
    <Problem message={error} retry={() => void reload()} />{loading && <Spinner />}
    {!!sale && !loading && <>
      <Panel><Copy large>{sale.clientName}</Copy><Copy>{sale.branchName}</Copy><Copy muted>Asesor: {sale.sellerName}</Copy>
        <Copy>{sale.status === 'anulada' ? 'Venta anulada' : paymentStatus[sale.paymentStatus] ?? sale.paymentStatus}</Copy>
        <Copy large>Total: {money(sale.total)}</Copy><Copy>Cobrado: {money(sale.paid)}</Copy><Copy large>Saldo: {money(sale.balance)}</Copy></Panel>
      <View style={ui.row}><Choice label="PDF de venta" onPress={() => router.push('/pos/' + sale.id + '/preview')} />
        {sale.quoteId && user?.permissions?.viewQuotes && <Choice label="Cotización de origen" onPress={() => router.push('/quotes/' + sale.quoteId)} />}
        {sale.paymentProof && <Choice label="Comprobante de pago" onPress={() => router.push('/pos/' + sale.id + '/payment-proof')} />}
        {(sale.canDeliver || sale.delivery) && <Choice label={sale.delivery?.status === 'entregada' ? 'Ver entrega' : 'Preparar entrega'} onPress={() => router.push('/pos/' + sale.id + '/delivery')} />}</View>
      {(sale.items ?? []).map(item => <Panel key={item.id}><Copy large>{item.name}</Copy><Copy>{item.quantity} {item.unit} × {money(item.unitPrice)}</Copy><Copy>{money(item.subtotal)}</Copy>
        {(item.sources ?? []).map((source,index) => <Copy key={index} muted>{source.ubicacion_nombre ?? 'Stock general'}: {source.cantidad} {item.unit}</Copy>)}</Panel>)}
      {(sale.savings > 0 || sale.discount > 0) && <Panel>{sale.savings > 0 && <Copy>Ahorro en productos: {money(sale.savings)}</Copy>}{sale.discount > 0 && <Copy>Descuento: {money(sale.discount)}</Copy>}</Panel>}
      {!!sale.notes && <Panel><Copy large>Observaciones</Copy><Copy>{sale.notes}</Copy></Panel>}
      {(sale.canPay || pending) && <Panel><Copy large>{pending ? 'Cobro pendiente de confirmar' : 'Registrar cobro'}</Copy>
        {pending && <Copy muted>Reintenta con estos mismos datos para confirmar el cobro sin duplicarlo.</Copy>}
        <Field label="Importe del cobro" value={amount} keyboardType="decimal-pad" editable={!disabled} onChangeText={setAmount} />
        <View style={ui.row}>{paymentMethods.map(item => <Choice key={item.id} label={item.label} active={method === item.id} disabled={disabled} onPress={() => setMethod(item.id)} />)}</View>
        <Field label="Referencia del cobro" value={reference} maxLength={100} editable={!disabled} onChangeText={setReference} />
        <Problem message={problem} /><PrimaryButton title={pending ? 'Confirmar cobro pendiente' : 'Registrar cobro'} loading={busy} disabled={!queueReady} onPress={() => void pay()} /></Panel>}
      {!sale.canPay && !pending && <Problem message={problem} />}
      <Panel><Copy large>Historial de cobros</Copy>{!sale.payments?.length && <Copy muted>Sin cobros registrados.</Copy>}
        {(sale.payments ?? []).map(payment => <View key={payment.id} style={{ gap: 3, paddingVertical: 8 }}><Copy>{money(payment.amount)} · {paymentMethods.find(item => item.id === payment.method)?.label ?? payment.method}{payment.voided ? ' · Anulado' : ''}</Copy>
          <Copy muted>{payment.date.slice(0,10)} · {payment.userName}</Copy>{!!payment.reference && <Copy muted>{payment.reference}</Copy>}</View>)}</Panel>
    </>}
  </NovaledPage>;
}
