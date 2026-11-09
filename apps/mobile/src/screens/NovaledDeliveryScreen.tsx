import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { useNovaledSale } from '../hooks/useNovaledSale';
import { Choice, Copy, Field, NovaledPage, Panel, Problem, Spinner, ui } from '../components/NovaledUI';
import { PrimaryButton } from '../components/PrimaryButton';
import { decimalValue, newOperationUuid, novaled, paymentMethods, validDate, type DeliverySubmission, type PaymentMethod } from '../lib/novaled';
import { sendPendingQuote } from '../lib/pendingQuote';
import { STORAGE_NAMESPACE } from '../lib/backend';
export function NovaledDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const saleId = Number(id); const { token,user } = useAuth();
  const { sale,setSale,loading,error,reload } = useNovaledSale(saleId);
  const [date,setDate] = useState(''); const [receiver,setReceiver] = useState(''); const [notes,setNotes] = useState(''); const [companySign,setCompanySign] = useState(true);
  const [amount,setAmount] = useState('0'); const [method,setMethod] = useState<PaymentMethod>('efectivo'); const [reference,setReference] = useState('');
  const [signature,setSignature] = useState<'asesor' | 'otro' | 'sin_nombre'>('asesor'); const [signatureName,setSignatureName] = useState('');
  const [pending,setPending] = useState<DeliverySubmission | null>(null); const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false); const [problem,setProblem] = useState<string | null>(null); const lock = useRef(false);
  const key = STORAGE_NAMESPACE + '_delivery_' + user?.id + '_' + saleId;
  useEffect(() => {
    if (!token) return; let alive = true;
    void Promise.all([novaled.catalog(token),SecureStore.getItemAsync(key)]).then(([catalog,raw]) => {
      if (!alive) return; setDate(catalog.today);
      if (raw) { const payload = JSON.parse(raw) as DeliverySubmission; if (!payload.clave_operacion) throw Error('No se pudo recuperar la entrega pendiente.');
        setPending(payload); setDate(payload.fecha_entrega); setReceiver(payload.recibido_por); setNotes(payload.observaciones_entrega);
        setCompanySign(payload.incluye_firma_empresa); setAmount(String(payload.monto)); setMethod(payload.metodo_pago ?? 'efectivo'); setReference(payload.referencia_pago); }
      setReady(true);
    }).catch(err => { if (alive) setProblem(err instanceof Error ? err.message : 'No se pudo recuperar la entrega.'); });
    return () => { alive = false; };
  }, [key,token]);
  const prepare = async () => {
    if (!token || lock.current) return; lock.current = true; setBusy(true); setProblem(null);
    try { setSale((await novaled.prepareDelivery(saleId,token)).data); }
    catch (err) { setProblem(err instanceof Error ? err.message : 'No se pudo preparar la nota.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const confirm = async () => {
    if (!token || lock.current || !ready) return; lock.current = true; setBusy(true); setProblem(null);
    try {
      if (!validDate(date)) throw Error('Escribe una fecha válida con el formato AAAA-MM-DD.');
      const value = decimalValue(amount,'Importe a cobrar');
      const payload = pending ?? { fecha_entrega: date, recibido_por: receiver, observaciones_entrega: notes, incluye_firma_empresa: companySign,
        monto: value, metodo_pago: value > 0 ? method : null, referencia_pago: reference, clave_operacion: newOperationUuid() };
      const result = await sendPendingQuote(payload,{ write: value => SecureStore.setItemAsync(key,value), remove: () => SecureStore.deleteItemAsync(key) },
        value => novaled.deliver(saleId,value,token),setPending);
      setSale(result.data);
    } catch (err) { setProblem(err instanceof Error ? err.message : 'No se pudo confirmar la entrega.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const preview = () => {
    if (signature === 'otro' && !signatureName.trim()) { setProblem('Escribe el nombre que se imprimirá en Entregué conforme.'); return; }
    router.push({ pathname: '/pos/[id]/delivery-preview', params: { id: String(saleId), signature, name: signatureName.trim() } });
  };
  const disabled = busy || !!pending || !ready;
  return <NovaledPage title="Nota de entrega"><Problem message={error} retry={() => void reload()} />{loading && <Spinner />}
    {!!sale && !loading && <><Panel><Copy large>Venta #{sale.number}</Copy><Copy>{sale.clientName}</Copy><Copy>Saldo: {sale.balance.toFixed(2)}</Copy>
      {sale.delivery && <Copy>{sale.delivery.status === 'entregada' ? 'Entrega confirmada' : 'Nota preparada'} · #{sale.delivery.number}</Copy>}
      {sale.delivery?.receivedBy && <Copy>Recibió: {sale.delivery.receivedBy}</Copy>}</Panel>
      <Problem message={problem} />
      {!sale.delivery && sale.canDeliver && <PrimaryButton title="Preparar nota sin confirmar entrega" loading={busy} onPress={() => void prepare()} />}
      {sale.delivery && <Panel><Copy large>Nombre en «Entregué conforme»</Copy>
        <View style={ui.row}>{(['asesor','otro','sin_nombre'] as const).map(value => <Choice key={value} label={{ asesor: 'Asesor', otro: 'Otro nombre', sin_nombre: 'Sin nombre' }[value]} active={signature === value} onPress={() => setSignature(value)} />)}</View>
        {signature === 'otro' && <Field label="Nombre para la firma" value={signatureName} maxLength={150} onChangeText={setSignatureName} />}
        <Choice label="Ver PDF / imprimir / compartir" onPress={preview} /></Panel>}
      {sale.canDeliver && (sale.delivery?.status !== 'entregada' || pending) && <Panel><Copy large>{pending ? 'Entrega pendiente de confirmar' : 'Confirmar entrega física'}</Copy>
        <Copy muted>Confirma cuando el cliente haya recibido los productos.</Copy>
        <Field label="Fecha de entrega · AAAA-MM-DD" value={date} maxLength={10} editable={!disabled} onChangeText={setDate} />
        <Field label="Nombre de quien recibe" value={receiver} maxLength={150} editable={!disabled} onChangeText={setReceiver} />
        <Field label="Observaciones de entrega" value={notes} maxLength={2000} multiline editable={!disabled} onChangeText={setNotes} />
        <Choice label={companySign ? '✓ Incluir firma de empresa' : 'Incluir firma de empresa'} active={companySign} disabled={disabled} onPress={() => setCompanySign(value => !value)} />
        {user?.permissions?.takePayments && <><Field label="Cobro al entregar · 0 si no aplica" value={amount} keyboardType="decimal-pad" editable={!disabled} onChangeText={setAmount} />
          <View style={ui.row}>{paymentMethods.map(item => <Choice key={item.id} label={item.label} active={method === item.id} disabled={disabled} onPress={() => setMethod(item.id)} />)}</View>
          <Field label="Referencia del cobro" value={reference} maxLength={100} editable={!disabled} onChangeText={setReference} /></>}
        <PrimaryButton title={pending ? 'Confirmar envío pendiente' : 'Confirmar entrega'} loading={busy} disabled={!ready} onPress={() => void confirm()} /></Panel>}
    </>}
  </NovaledPage>;
}
