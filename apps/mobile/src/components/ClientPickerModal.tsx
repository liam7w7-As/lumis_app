import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, type Client } from '../lib/api';
import { IS_NOVALED } from '../lib/backend';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { usePagedCollection } from '../hooks/usePagedCollection';
import { FormModal } from './FormModal';
import { CollectionFooter } from './CollectionFooter';

export function ClientPickerModal({ selectedId, onPick, onClose }: {
  selectedId: number | null; onPick: (client: Client) => void; onClose: () => void;
}) {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const query = search.trim();
  const remoteQuery = IS_NOVALED ? query : '';
  const fetchPage = useCallback(async (page: number) => {
    if (!token) return { items: [] };
    const result = await api.clients(token, { search: remoteQuery, page });
    return { items: result.clients, meta: result.meta };
  }, [token, remoteQuery]);
  const { items, loading, loadingMore, hasMore, error, load, loadMore } = usePagedCollection(fetchPage);
  const clients = IS_NOVALED ? items : items.filter(client => client.name.toLowerCase().includes(query.toLowerCase()));
  return <FormModal visible title="Elegir cliente" icon="people-outline" onClose={onClose}>
    <TextInput accessibilityLabel="Buscar cliente" placeholder="Buscar cliente" placeholderTextColor={colors.muted}
      value={search} onChangeText={setSearch} maxLength={100} autoCapitalize="none"
      style={{ color: colors.text, fontFamily: 'Poppins', fontSize: 16, minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border }} />
    <Pressable onPress={onClose} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontFamily: 'Poppins' }}>Sin Cliente</Text>
    </Pressable>
    {clients.map(client => <Pressable key={client.id} accessibilityRole="button" onPress={() => onPick(client)}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: client.id === selectedId ? colors.primary : colors.text, fontFamily: 'Poppins' }}>{client.name}</Text>
      {client.id === selectedId && <Ionicons name="checkmark" size={18} color={colors.primary} />}
    </Pressable>)}
    {!loading && !error && clients.length === 0 && <View><Text style={{ color: colors.muted, fontFamily: 'Poppins' }}>Sin resultados para esa búsqueda.</Text></View>}
    <CollectionFooter loading={loading || loadingMore} hasMore={hasMore} error={error}
      onMore={() => { void loadMore(); }} onRetry={() => { void (items.length ? loadMore(true) : load()); }} />
  </FormModal>;
}
