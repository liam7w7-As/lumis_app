import { View } from 'react-native';
import { Choice, Copy, Field, ui } from './NovaledUI';
import { sourceKey, type StockLine } from '../lib/saleStock';
import type { StockSnapshot } from '../lib/novaled';
export function SaleStockFields({ item, stock, selected, disabled, allowEntry, change }: {
  item: StockLine; stock: StockSnapshot; selected: Record<string, string>; disabled: boolean; allowEntry: boolean;
  change: (patch: Partial<StockLine>) => void;
}) {
  const product = stock.products.find(product => product.id === item.productId);
  const sources = (product?.sources ?? []).filter(source => source.quantity > 0 || selected[sourceKey(source.locationId)]);
  if (item.entry && !sources.some(source => source.locationId === item.entry!.locationId)) {
    sources.push({ locationId: item.entry.locationId, name: stock.locations.find(location => location.id === item.entry!.locationId)?.name ?? 'Selecciona una ubicación', quantity: 0 });
  }
  return <View style={{ gap: 10 }}>
    <Copy>Existencia en sucursal: {product?.quantity ?? 0}</Copy>
    <Copy muted>Procedencia de la venta</Copy>
    {sources.length === 0 && <Copy muted>Este producto no tiene existencias disponibles para vender.</Copy>}
    {sources.map(source => <Field key={sourceKey(source.locationId)} label={source.name + ' · disponibles: ' + source.quantity} value={selected[sourceKey(source.locationId)] ?? '0'}
      keyboardType="decimal-pad" editable={!disabled} onChangeText={value => change({ sources: { ...selected, [sourceKey(source.locationId)]: value } })} />)}
    {allowEntry && (!item.productId || product?.canManualEntry) && <Choice label={item.entry ? '✓ Entrada inicial confirmada' : 'Registrar entrada inicial para este producto nuevo'} active={!!item.entry}
      disabled={disabled} onPress={() => change({ entry: item.entry ? undefined : { quantity: item.quantity, cost: '0', reason: '', locationId: stock.locations[0]?.id ?? null }, sources: undefined })} />}
    {item.entry && <>
      <Copy muted>Confirma el ingreso físico antes de emitir. Novaled registrará la entrada y su costo junto con la venta.</Copy>
      <Field label="Cantidad que ingresa" keyboardType="decimal-pad" value={item.entry.quantity} editable={!disabled} onChangeText={value => change({ entry: { ...item.entry!, quantity: value }, sources: undefined })} />
      <Field label="Costo unitario de entrada" keyboardType="decimal-pad" value={item.entry.cost} editable={!disabled} onChangeText={value => change({ entry: { ...item.entry!, cost: value } })} />
      <Field label="Motivo del ingreso" value={item.entry.reason} maxLength={200} editable={!disabled} onChangeText={value => change({ entry: { ...item.entry!, reason: value } })} />
      {stock.usesLocations && <><Copy>Ubicación donde ingresa</Copy><View style={ui.row}>{stock.locations.map(location => <Choice key={sourceKey(location.id)} label={location.name}
        active={item.entry!.locationId === location.id} disabled={disabled} onPress={() => change({ entry: { ...item.entry!, locationId: location.id }, sources: undefined })} />)}</View></>}
    </>}
  </View>;
}
