import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { Choice, Copy, Field, NovaledPage, Panel, Problem, Spinner, ui } from '../components/NovaledUI';
import { novaled, quoteStatus, type MobileCatalog, type MobileQuote } from '../lib/novaled';
import { View } from 'react-native';
export function NovaledQuotesScreen({ home = false }: { home?: boolean }) {
  const { token, user } = useAuth(); const { business } = useBusiness();
  const [catalog, setCatalog] = useState<MobileCatalog | null>(null);
  const [quotes, setQuotes] = useState<MobileQuote[]>([]); const [search, setSearch] = useState('');
  const [branch, setBranch] = useState<number | undefined>(); const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const revision = useRef(0);
  const load = useCallback(async () => {
    if (!token) return; const current = ++revision.current; setBusy(true); setError(null);
    try {
      const [result, available] = await Promise.all([novaled.quotes(token, search.trim(), page, branch), novaled.catalog(token)]);
      if (current !== revision.current) return;
      setQuotes(result.data); setLastPage(result.meta.last_page); setCatalog(available);
    } catch (err) { if (current === revision.current) { setQuotes([]); setError(err instanceof Error ? err.message : 'No se pudieron cargar las cotizaciones.'); } }
    finally { if (current === revision.current) setBusy(false); }
  }, [token, search, page, branch]);
  useFocusEffect(useCallback(() => { const timer = setTimeout(() => void load(), 300); return () => { clearTimeout(timer); revision.current++; }; }, [load]));
  const money = (value: number) => value.toFixed(2) + ' ' + (business?.moneda ?? 'Bs');
  return <NovaledPage title={home ? 'Lumis · Novaled' : 'Cotizaciones'} back={!home}>
    {home && <Panel><Copy large>{business?.nombre ?? 'Novaled'}</Copy><Copy muted>{user?.name} · Documentos conectados</Copy>
      <View style={ui.row}>{user?.permissions?.viewSales && <Choice label="Ventas" onPress={() => router.push('/pos')} />}<Choice label="Mi cuenta" onPress={() => router.push('/settings')} /></View></Panel>}
    {user?.permissions?.createQuotes && <PrimaryButton title="Nueva cotización" onPress={() => router.push('/quotes/new')} />}
    <Field label="Buscar cotizaciones" value={search} onChangeText={value => { setSearch(value); setPage(1); }} placeholder="Cliente o número" />
    {!!catalog && catalog.branches.length > 1 && <View style={ui.row}>
      <Choice label="Todas las sucursales" active={!branch} onPress={() => { setBranch(undefined); setPage(1); }} />
      {catalog.branches.map(item => <Choice key={item.id} label={item.name} active={branch === item.id} onPress={() => { setBranch(item.id); setPage(1); }} />)}
    </View>}
    <Problem message={error} retry={() => void load()} />
    {busy ? <Spinner /> : !error && quotes.length === 0 ? <Panel><Copy muted>No hay cotizaciones para esta búsqueda.</Copy></Panel> : quotes.map(quote => <Panel key={quote.id}>
      <Copy large>Cotización #{quote.number} · V{quote.version}</Copy><Copy>{quote.clientName}</Copy>
      <Copy muted>{quote.branchName} · {quoteStatus[quote.status] ?? quote.status}</Copy>
      <Copy>{money(quote.total)}</Copy><Copy muted>Válida hasta {quote.expiresAt ?? '—'}</Copy>
      <Choice label="Ver cotización" onPress={() => router.push('/quotes/' + quote.id)} />
    </Panel>)}
    <View style={ui.row}><Choice label="Anterior" disabled={page <= 1 || busy} onPress={() => setPage(value => value - 1)} />
      <Copy>Página {page} de {lastPage}</Copy><Choice label="Siguiente" disabled={page >= lastPage || busy} onPress={() => setPage(value => value + 1)} /></View>
    <Choice label="Actualizar" disabled={busy} onPress={() => void load()} />
  </NovaledPage>;
}
