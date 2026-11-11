import { useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FormModal } from './FormModal';
import { PrimaryButton } from './PrimaryButton';
import { useTheme } from '../theme/ThemeContext';
import { decimalValue } from '../lib/novaled';
import { finishStockSelection, getStockSelection, subscribeStockSelection, type StockChoiceItem, type StockSelections } from '../lib/stockSelection';

function sourceKey(id: number | null) { return id === null ? 'general' : String(id); }
function initial(items: StockChoiceItem[]) {
  return Object.fromEntries(items.map(item => {
    let missing = Math.round(item.quantity*100); const values: Record<string,string> = {};
    for (const source of item.sources) { const take = Math.min(missing,Math.round(source.quantity*100)); values[sourceKey(source.locationId)] = String(take/100); missing -= take; }
    return [String(item.index),values];
  }));
}
function StockForm({ items }: { items: StockChoiceItem[] }) {
  const { colors } = useTheme(); const [values,setValues] = useState(() => initial(items));
  const [entries,setEntries] = useState<Record<string,{ cost: string; reason: string; quantity: number; locationId: number | null }>>({});
  const [error,setError] = useState<string | null>(null);
  const toggleEntry = (item: StockChoiceItem) => {
    const key = String(item.index);
    if (entries[key]) { setEntries(current => { const next = { ...current }; delete next[key]; return next; }); setValues(current => ({ ...current,[key]: initial([item])[key] })); return; }
    const missing = Math.max(0,item.quantity-item.sources.reduce((sum,source) => sum+source.quantity,0));
    const locationId = item.sources[0]?.locationId ?? null; const selected = sourceKey(locationId);
    setEntries(current => ({ ...current,[key]: { cost: '',reason: '',quantity: missing || item.quantity,locationId } }));
    setValues(current => ({ ...current,[key]: { ...current[key],[selected]: String((Number(current[key]?.[selected]) || 0)+(missing || item.quantity)) } }));
  };
  const confirm = () => {
    try {
      const selections: StockSelections = {};
      for (const item of items) {
        const key = String(item.index); const entry = entries[key];
        const sources = item.sources.map(source => ({ sub_ubicacion_id: source.locationId,
          cantidad: decimalValue(values[key]?.[sourceKey(source.locationId)] || '0','Cantidad por ubicación') })).filter(source => source.cantidad>0);
        if (Math.round(sources.reduce((sum,row) => sum+row.cantidad,0)*100) !== Math.round(item.quantity*100)) throw Error('Reparte exactamente ' + item.quantity + ' ' + item.unit + ' de ' + item.name + '.');
        if (entry && entry.reason.trim().length<3) throw Error('Escribe el motivo de la entrada inicial.');
        if (entry) sources.sort((a,b) => Number(b.sub_ubicacion_id === entry.locationId)-Number(a.sub_ubicacion_id === entry.locationId));
        selections[key] = { sources,...(entry ? { entry: { cantidad: entry.quantity,costo_unitario: decimalValue(entry.cost,'Costo de entrada'),motivo: entry.reason.trim() } }: {}) };
      }
      finishStockSelection(selections);
    } catch (err) { setError(err instanceof Error ? err.message:'Revisa las cantidades.'); }
  };
  const input = [styles.input,{ color: colors.text,borderColor: colors.border }];
  return <FormModal visible title="Procedencia de los productos" icon="cube-outline" onClose={() => finishStockSelection(null)}>
    <Text style={[styles.hint,{ color: colors.muted }]}>Revisa de dónde salen estos productos para completar la venta.</Text>
    {items.map(item => <View key={item.index} style={styles.group}>
      <Text style={[styles.name,{ color: colors.text }]}>{item.name} · {item.quantity} {item.unit}</Text>
      {item.sources.map(source => <View key={sourceKey(source.locationId)} style={styles.row}>
        <View style={{ flex: 1 }}><Text style={[styles.label,{ color: colors.text }]}>{source.name}</Text><Text style={[styles.hint,{ color: colors.muted }]}>Disponible: {source.quantity} {item.unit}</Text></View>
        <TextInput accessibilityLabel={'Cantidad desde ' + source.name} style={[input,styles.amount]} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted}
          value={values[String(item.index)]?.[sourceKey(source.locationId)] ?? ''} onChangeText={value => setValues(current => ({ ...current,[String(item.index)]: { ...current[String(item.index)],[sourceKey(source.locationId)]: value } }))} />
      </View>)}
      {item.canEntry && <Pressable onPress={() => toggleEntry(item)} style={styles.link}><Text style={[styles.label,{ color: colors.primary }]}>{entries[String(item.index)] ? 'Quitar entrada inicial':'Registrar entrada inicial recibida'}</Text></Pressable>}
      {entries[String(item.index)] && <View style={{ gap: 10 }}>
        <Text style={[styles.hint,{ color: colors.muted }]}>Confirma {entries[String(item.index)].quantity} {item.unit} recibidas en {item.sources[0]?.name ?? 'Stock general'}.</Text>
        <TextInput style={input} accessibilityLabel="Costo unitario de entrada" keyboardType="decimal-pad" placeholder="Costo unitario" placeholderTextColor={colors.muted}
          value={entries[String(item.index)].cost} onChangeText={cost => setEntries(current => ({ ...current,[String(item.index)]: { ...current[String(item.index)],cost } }))} />
        <TextInput style={input} accessibilityLabel="Motivo de entrada" placeholder="Motivo de la entrada" placeholderTextColor={colors.muted} maxLength={200}
          value={entries[String(item.index)].reason} onChangeText={reason => setEntries(current => ({ ...current,[String(item.index)]: { ...current[String(item.index)],reason } }))} />
      </View>}
    </View>)}
    {!!error && <Text accessibilityRole="alert" style={[styles.hint,{ color: colors.error }]}>{error}</Text>}
    <PrimaryButton title="Confirmar y guardar" onPress={confirm} />
  </FormModal>;
}
export function StockSelectionHost() {
  const request = useSyncExternalStore(subscribeStockSelection,getStockSelection,() => null);
  return request ? <StockForm items={request.items} />:null;
}
const styles = StyleSheet.create({
  group: { gap: 10,paddingVertical: 12 }, row: { flexDirection: 'row',gap: 12,alignItems: 'center' },
  name: { fontFamily: 'Poppins-SemiBold',fontSize: 16 }, label: { fontFamily: 'Poppins',fontSize: 14 },
  hint: { fontFamily: 'Poppins',fontSize: 13,lineHeight: 20 }, input: { minHeight: 46,borderWidth: 1,borderRadius: 12,paddingHorizontal: 12,fontSize: 16,fontFamily: 'Poppins' },
  amount: { width: 85,textAlign: 'center' }, link: { minHeight: 44,justifyContent: 'center' },
});
