import { useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { offlineOperations, offlineSnapshot, resolveOfflineConflict, retryOffline, subscribeOffline } from '../offline/runtime';
import { feedback } from '../lib/feedback';
import { FormModal } from './FormModal';
import { PrimaryButton } from './PrimaryButton';
export function OfflineStatus() {
    const status = useSyncExternalStore(subscribeOffline, offlineSnapshot, offlineSnapshot);
    const { user } = useAuth();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const [open, setOpen] = useState(false);
    if (!user || status.online && !status.pending && !status.preparing && !status.message)
        return null;
    const title = status.preparing ? 'Preparando datos sin conexión' : !status.online ? 'Sin conexión' : status.errors ? 'Revisa los cambios pendientes' : status.syncing ? 'Sincronizando' : 'Cambios pendientes';
    const color = status.errors ? colors.error : colors.primary;
    const retry = () => { void retryOffline().catch(error => feedback.error('No se pudo sincronizar', error instanceof Error ? error.message : 'Inténtalo nuevamente.')); };
    return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${status.pending} cambios pendientes. Ver sincronización`} onPress={() => setOpen(true)} style={{ position: 'absolute', left: 14, bottom: insets.bottom + 80, zIndex: 100, width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderColor: color, borderWidth: 1, alignItems: 'center', justifyContent: 'center', elevation: 3 }}>
      {status.syncing ? <ActivityIndicator size="small" color={color}/> : <Ionicons name={status.errors ? 'alert-circle-outline' : status.online ? 'cloud-upload-outline' : 'cloud-offline-outline'} size={23} color={color}/>}
      {!!status.pending && <View style={{ position: 'absolute', right: -4, top: -5, borderRadius: 10, backgroundColor: color, paddingHorizontal: 5 }}><Text style={{ color: colors.onPrimary, fontSize: 10 }}>{status.pending}</Text></View>}
    </Pressable>
    <FormModal visible={open} title="Sincronización" icon="cloud-outline" onClose={() => setOpen(false)}>
      <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.text, fontSize: 17, marginBottom: 12 }}>{title}</Text>
      <Text style={{ fontFamily: 'Poppins', color: colors.muted, marginBottom: 12 }}>{status.readyAt ? 'Última descarga: ' + new Date(status.readyAt).toLocaleString() : 'Mantén la app abierta y conectada hasta completar la primera descarga.'}</Text>
      {!!status.message && <Text style={{ fontFamily: 'Poppins', color: colors.error, marginBottom: 12 }}>{status.message}</Text>}
      <Text style={{ fontFamily: 'Poppins', color: colors.text, marginBottom: 12 }}>{status.pending} cambios guardados en este teléfono pendientes de confirmación.</Text>
      <ScrollView style={{ maxHeight: 240 }}>{offlineOperations().map(op => <View key={op.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontFamily: 'Poppins', color: colors.text }}>{op.method === 'DELETE' ? 'Eliminar' : op.method === 'POST' ? 'Registrar' : 'Actualizar'} · {op.root ?? op.path.replace('/api/', '')}</Text>
        {!!op.error && <Text style={{ fontFamily: 'Poppins', color: colors.error }}>{op.error}</Text>}
        {op.code === 'OFFLINE_DOCUMENT_CONFLICT' && <Pressable accessibilityRole="button" onPress={() => feedback.alert('Resolver cambio de documento', 'Otro equipo modificó este documento. ¿Quieres aplicar tus cambios pendientes sobre la versión actual del servidor? Se conservarán las demás operaciones pendientes.', [
                    { text: 'Cancelar', style: 'cancel' }, { text: 'Aplicar mis cambios', onPress: () => { void resolveOfflineConflict(op.id).catch(error => feedback.error('No se pudo resolver', String(error))); } },
                ])}><Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.primary, paddingVertical: 8 }}>Revisar conflicto</Text></Pressable>}
      </View>)}</ScrollView>
      <View style={{ marginTop: 16 }}><PrimaryButton title="Sincronizar ahora" onPress={retry} loading={status.syncing}/></View>
    </FormModal>
  </>;
}
