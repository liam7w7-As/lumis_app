import { TutorialTarget, TutorialScrollView, TutorialHelpButton, useTutorialAvailability, withTutorial } from '../tutorials/TutorialElements';
import { feedback } from '../lib/feedback';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useDraft } from '../context/DraftContext';
import { useTheme } from '../theme/ThemeContext';
import { ApiError, api, type Client } from '../lib/api';
import { AnimatedInput } from '../components/AnimatedInput';
import { FormDraftNotice } from '../components/FormDraftNotice';
import { useFormDraft } from '../hooks/useFormDraft';
import { EMPTY_CLIENT_FORM, readClientForm } from '../lib/formDrafts';
import { useClientSuggestions } from '../hooks/useClientSuggestions';

function AddClientScreenContent() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { setClient } = useDraft();
  const { value: { name, phone, email }, ready, status, hasDraft, restored, update, clear, retry } = useFormDraft('client', EMPTY_CLIENT_FORM, readClientForm);
  useTutorialAvailability({ ready });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitLock = useRef(false);
  const screenActive = useRef(false);
  const scopeToken = useRef(token);
  useLayoutEffect(() => { scopeToken.current = token; }, [token]);
  useFocusEffect(useCallback(() => {
    screenActive.current = true;
    return () => { screenActive.current = false; };
  }, []));
  const suggestions = useClientSuggestions(name, token, ready && !saving && status !== 'clearing');

  const acceptClient = async (client: Client) => {
    Keyboard.dismiss();
    setClient(client);
    await clear().catch(() => {
      if (screenActive.current && scopeToken.current === token)
        feedback.warning('Cliente seleccionado', 'No se pudo borrar el borrador local. Descártalo cuando regreses para evitar volver a registrarlo.');
    });
    if (screenActive.current && scopeToken.current === token) router.back();
  };
  const pick = async (client: Client) => {
    if (!token || !ready || !screenActive.current || scopeToken.current !== token || submitLock.current || status === 'clearing') return;
    submitLock.current = true; setSaving(true); setError(null);
    try { await acceptClient(client); }
    finally { submitLock.current = false; if (screenActive.current) setSaving(false); }
  };

  const save = async () => {
    if (!token || !ready || !screenActive.current || scopeToken.current !== token || submitLock.current || status === 'clearing') return;
    if (name.trim().length < 2) {
      setError('El nombre del cliente es obligatorio');
      feedback.warning('Revisa el nombre', 'Escribe al menos dos caracteres para registrar al cliente.');
      return;
    }
    setError(null);
    submitLock.current = true;
    setSaving(true);
    try {
      const { client } = await api.createClient(
        {
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
        },
        token,
      );
      if (screenActive.current && scopeToken.current === token) await acceptClient(client);
    } catch (err) {
      if (screenActive.current && scopeToken.current === token) {
        const message = err instanceof ApiError ? err.message : 'No se pudo guardar el cliente.';
        setError(message);
        feedback.error('No se pudo guardar el cliente', message);
      }
    } finally {
      submitLock.current = false;
      if (screenActive.current) setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TutorialScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => { screenActive.current = false; router.back(); }} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>Añadir cliente</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><TutorialHelpButton  /><TutorialTarget id="save" ><Pressable
            style={[styles.circleButton, { backgroundColor: colors.primary }]}
            onPress={save}
            disabled={saving || !ready || status === 'clearing'}
            hitSlop={8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>Guardar</Text>
            )}
          </Pressable></TutorialTarget></View>
        </View>

        <FormDraftNotice ready={ready} status={status} hasDraft={hasDraft} restored={restored} onRetry={retry} onDiscard={clear} />
        {ready && <View collapsable={false} pointerEvents={saving || status === 'clearing' ? 'none' : 'auto'}>
        <TutorialTarget id="fields" ><AnimatedInput
          icon="person-outline"
          placeholder="Cliente / Empresa"
          value={name}
          onChangeText={name => update({ name })}
          autoCapitalize="words"
        /></TutorialTarget>
        <AnimatedInput
          icon="call-outline"
          placeholder="Celular"
          value={phone}
          onChangeText={phone => update({ phone })}
          keyboardType="phone-pad"
        />
        <AnimatedInput
          icon="mail-outline"
          placeholder="Email"
          value={email}
          onChangeText={email => update({ email })}
          keyboardType="email-address"
        />

        {!saving && name.trim().length >= 2 && <View style={styles.suggestions}>
          {suggestions.loading ? <View style={styles.searchStatus} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.suggestionHint, { color: colors.muted }]}>Buscando clientes…</Text>
          </View> : suggestions.error ? <Pressable onPress={suggestions.retry} accessibilityRole="button"
            accessibilityLabel="Reintentar búsqueda de clientes" style={styles.searchStatus}>
            <Text style={[styles.suggestionHint, { color: colors.muted }]}>{suggestions.error}</Text>
            <Text style={[styles.suggestionHint, { color: colors.primary }]}>Reintentar</Text>
          </Pressable> : suggestions.clients.length > 0 && <>
            <Text style={[styles.suggestionLabel, { color: colors.muted }]}>Clientes guardados</Text>
            {suggestions.clients.map(client => <Pressable key={client.id} onPress={() => { void pick(client); }}
              accessibilityRole="button" accessibilityLabel={`Usar cliente ${client.name}`}
              style={[styles.suggestion, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.suggestionName, { color: colors.text }]}>{client.name}</Text>
                {!!(client.phone || client.email) && <Text style={[styles.suggestionHint, { color: colors.muted }]}>
                  {[client.phone, client.email].filter(Boolean).join(' · ')}
                </Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </Pressable>)}
          </>}
        </View>}

        {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
        </View>}
      </TutorialScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 36,
  },
  title: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  circleButton: {
    minWidth: 76,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    textAlign: 'center',
    marginTop: 8,
  },
  suggestions: { gap: 8, paddingBottom: 24 },
  suggestionLabel: { fontFamily: 'Poppins-Medium', fontSize: 12 },
  suggestion: { minHeight: 58, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  suggestionName: { fontFamily: 'Poppins-Medium', fontSize: 15 },
  suggestionHint: { fontFamily: 'Poppins', fontSize: 12, lineHeight: 18 },
  searchStatus: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
});

export const AddClientScreen = withTutorial(AddClientScreenContent, "clients");
