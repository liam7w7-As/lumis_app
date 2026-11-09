import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { Choice, Copy, NovaledPage, Panel, Problem, Spinner, ui } from '../components/NovaledUI';
import { novaled, quoteStatus, type MobileQuote } from '../lib/novaled';
export function NovaledQuoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { token } = useAuth(); const { business } = useBusiness();
  const [quote, setQuote] = useState<MobileQuote | null>(null); const [versions, setVersions] = useState<MobileQuote[]>([]);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(true); const revision = useRef(0);
  const load = useCallback(async () => {
    if (!token) return; const current = ++revision.current; setBusy(true); setError(null); setQuote(null);
    try { const result = await novaled.quote(Number(id), token); if (current !== revision.current) return; setQuote(result.data); setVersions(result.versions); }
    catch (err) { if (current === revision.current) setError(err instanceof Error ? err.message : 'No se pudo abrir la cotización.'); }
    finally { if (current === revision.current) setBusy(false); }
  }, [token, id]);
  useFocusEffect(useCallback(() => { void load(); return () => { revision.current++; }; }, [load]));
  const money = (value: number) => value.toFixed(2) + ' ' + (business?.moneda ?? 'Bs');
  return <NovaledPage title={quote ? 'Cotización #' + quote.number : 'Cotización'}>
    <Problem message={error} retry={() => void load()} />{busy && <Spinner />}
    {!!quote && <><Panel><Copy large>{quote.clientName}</Copy><Copy>{quote.branchName}</Copy>
      <Copy muted>Versión {quote.version} · {quoteStatus[quote.status] ?? quote.status}</Copy>
      <Copy>Emitida: {quote.issuedAt}</Copy><Copy>Válida hasta: {quote.expiresAt}</Copy><Copy muted>Asesor: {quote.sellerName}</Copy></Panel>
      <View style={ui.row}><Choice label="Ver PDF / compartir" onPress={() => router.push('/quotes/' + quote.id + '/preview')} />
        {quote.canRequote && <Choice label="Recotizar" onPress={() => router.push({ pathname: '/quotes/new', params: { from: quote.id } })} />}</View>
      {quote.canConvert && <Choice label="Convertir en venta" onPress={() => router.push({ pathname: '/pos/new', params: { from: quote.id } })} />}
      {(quote.items ?? []).map(item => <Panel key={item.id}><Copy large>{item.name}</Copy>{!!item.description && <Copy muted>{item.description}</Copy>}
        <Copy>{item.quantity} {item.unit} × {money(item.unitPrice)}</Copy><Copy>{money(item.subtotal)}</Copy></Panel>)}
      <Panel><Copy>Subtotal original: {money(quote.subtotal)}</Copy>{quote.savings > 0 && <Copy>Ahorro en productos: {money(quote.savings)}</Copy>}
        {quote.discount > 0 && <Copy>Descuento: {money(quote.discount)}</Copy>}<Copy large>Total: {money(quote.total)}</Copy></Panel>
      {!!quote.notes && <Panel><Copy large>Observaciones</Copy><Copy>{quote.notes}</Copy></Panel>}
      {!!quote.terms && <Panel><Copy large>Condiciones</Copy><Copy>{quote.terms}</Copy></Panel>}
      {versions.length > 1 && <Panel><Copy large>Versiones</Copy>{versions.map(version => <Choice key={version.id} label={'V' + version.version + ' · #' + version.number + ' · ' + (quoteStatus[version.status] ?? version.status)}
        active={quote.id === version.id} onPress={() => router.replace('/quotes/' + version.id)} />)}</Panel>}
    </>}
  </NovaledPage>;
}
