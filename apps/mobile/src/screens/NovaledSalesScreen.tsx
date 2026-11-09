import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { Choice, Copy, Field, NovaledPage, Panel, Problem, Spinner, ui } from '../components/NovaledUI';
import { novaled, paymentStatus, type MobileCatalog, type MobileSale } from '../lib/novaled';
export function NovaledSalesScreen({ home = false }: { home?: boolean }) {
  const { token, user } = useAuth(); const { business } = useBusiness();
  const [catalog, setCatalog] = useState<MobileCatalog | null>(null); const [sales, setSales] = useState<MobileSale[]>([]);
  const [search, setSearch] = useState(''); const [branch, setBranch] = useState<number | undefined>(); const [status, setStatus] = useState<string | undefined>();
  const [page, setPage] = useState(1); const [last, setLast] = useState(1); const [busy, setBusy] = useState(true); const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const load = useCallback(async () => {
    if (!token) return; const current = ++revision.current; setBusy(true); setError(null);
    try { const [result, options] = await Promise.all([novaled.sales(token,search,page,branch,status), novaled.catalog(token)]);
      if (current !== revision.current) return; setSales(result.data); setLast(result.meta.last_page); setCatalog(options);
    } catch (err) { if (current === revision.current) { setSales([]); setError(err instanceof Error ? err.message : 'No se pudieron cargar las ventas.'); } }
    finally { if (current === revision.current) setBusy(false); }
  }, [token,search,page,branch,status]);
  useFocusEffect(useCallback(() => { const timer = setTimeout(() => void load(),250); return () => { clearTimeout(timer); revision.current++; }; }, [load]));
  const money = (value: number) => value.toFixed(2) + ' ' + (business?.moneda ?? 'Bs');
  return <NovaledPage title={home ? 'Lumis · Novaled' : 'Ventas'} back={!home}>
    <Panel><Copy large>{business?.nombre ?? 'Novaled'}</Copy><View style={ui.row}>
      {user?.permissions?.viewQuotes && <Choice label="Cotizaciones" onPress={() => router.push('/quotes')} />}
      <Choice label="Mi cuenta" onPress={() => router.push('/settings')} /></View></Panel>
    {user?.permissions?.createSales && <PrimaryButton title="Nueva venta" onPress={() => router.push('/pos/new')} />}
    <Field label="Buscar ventas" value={search} onChangeText={value => { setSearch(value); setPage(1); }} placeholder="Cliente o número" />
    <View style={ui.row}>{[undefined,'por_cobrar','parcial','pagado'].map(value => <Choice key={value ?? 'all'} label={value ? paymentStatus[value] : 'Todas'} active={status === value}
      onPress={() => { setStatus(value); setPage(1); }} />)}</View>
    {!!catalog && catalog.branches.length > 1 && <View style={ui.row}><Choice label="Todas las sucursales" active={!branch} onPress={() => { setBranch(undefined); setPage(1); }} />
      {catalog.branches.map(item => <Choice key={item.id} label={item.name} active={branch === item.id} onPress={() => { setBranch(item.id); setPage(1); }} />)}</View>}
    <Problem message={error} retry={() => void load()} />{busy ? <Spinner /> : !error && sales.length === 0 ? <Copy muted>No hay ventas para esta búsqueda.</Copy> : sales.map(sale => <Panel key={sale.id}>
      <Copy large>Venta #{sale.number}</Copy><Copy>{sale.clientName}</Copy><Copy muted>{sale.branchName} · {sale.status === 'anulada' ? 'Anulada' : paymentStatus[sale.paymentStatus] ?? sale.paymentStatus}</Copy>
      <Copy>Total: {money(sale.total)}</Copy><Copy>Saldo: {money(sale.balance)}</Copy><Choice label="Ver venta" onPress={() => router.push('/pos/' + sale.id)} /></Panel>)}
    <View style={ui.row}><Choice label="Anterior" disabled={busy || page <= 1} onPress={() => setPage(value => value - 1)} /><Copy>{page} / {last}</Copy>
      <Choice label="Siguiente" disabled={busy || page >= last} onPress={() => setPage(value => value + 1)} /></View>
    <Choice label="Actualizar" disabled={busy} onPress={() => void load()} />
  </NovaledPage>;
}
