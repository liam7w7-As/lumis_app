import { loadRemoteImage } from '../lib/remoteImage';
import { NoticeCard } from '../components/NoticeCard';
import { StoredImage } from '../components/StoredImage';
import { feedback } from '../lib/feedback';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InlineSettingInput } from '../components/InlineSettingInput';
import { createInlineAutosave, type InlineSaveState } from '../lib/inlineAutosave';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme, type ThemeMode } from '../theme/ThemeContext';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { ColorWheel } from '../components/ColorWheel';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  ApiError,
  api,
  mediaUrl,
  type Business,
  type Agent,
  type Branch,
} from '../lib/api';
import { generatePalette } from '../lib/brandColors';
import { pickImageFromLibrary } from '../lib/media';
import { BRAND } from '../config';
import { FormModal } from '../components/FormModal';
import { TeamUsers } from '../components/TeamUsers';
import { useBusiness } from '../context/BusinessContext';

type SettingsTab = 'info' | 'color';

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'info', label: 'Información' },
  { key: 'color', label: 'Color de marca' },
];

const MODES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Sistema' },
  { key: 'light', label: 'Claro' },
  { key: 'dark', label: 'Oscuro' },
];

type InfoFieldKey =
  | 'nombre'
  | 'email'
  | 'telefono'
  | 'nit'
  | 'moneda'
  | 'redes_sociales'
  | 'website'
  | 'direccion'
  | 'ciudad';

interface InfoField {
  key: InfoFieldKey;
  label: string;
  placeholder: string;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
}

const INFO_FIELDS: InfoField[] = [
  { key: 'nombre', maxLength: 150, label: 'Nombre de la empresa', placeholder: 'Mi Negocio', autoCapitalize: 'words' },
  { key: 'email', maxLength: 254, label: 'Correo', placeholder: 'correo@ejemplo.com', keyboardType: 'email-address', autoCapitalize: 'none' },
  { key: 'telefono', maxLength: 40, label: 'Número de contacto', placeholder: '+591 70000000', keyboardType: 'phone-pad' },
  { key: 'nit', maxLength: 30, label: 'NIT', placeholder: '12345678' },
  { key: 'moneda', maxLength: 10, label: 'Tipo de moneda', placeholder: 'Bs.' },
  { key: 'redes_sociales', maxLength: 150, label: 'Red Social', placeholder: '@minegocio', autoCapitalize: 'none' },
  { key: 'website', maxLength: 150, label: 'Página Web', placeholder: 'www.minegocio.com', keyboardType: 'url', autoCapitalize: 'none' },
  { key: 'direccion', maxLength: 255, label: 'Dirección', placeholder: 'Av. Principal #123', autoCapitalize: 'words' },
  { key: 'ciudad', maxLength: 150, label: 'Ciudad', placeholder: 'La Paz - Bolivia', autoCapitalize: 'words' },
];

type SettingsFieldKey = InfoFieldKey | 'color_primario';
const EMPTY_FIELDS: Record<SettingsFieldKey, string> = {
  nombre: '', email: '', telefono: '', nit: '', moneda: '', redes_sociales: '',
  website: '', direccion: '', ciudad: '', color_primario: '#5F5BF2',
};
function normalizeField(key: SettingsFieldKey, raw: string): string | null {
  const value = raw.trim();
  if ((key === 'nombre' || key === 'moneda') && !value) {
    throw new Error(key === 'nombre' ? 'Escribe el nombre de la empresa.' : 'Escribe la moneda que utiliza tu empresa.');
  }
  if (key === 'color_primario') {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error('Escribe seis dígitos hexadecimales, por ejemplo 5F5BF2.');
    return value.toLowerCase();
  }
  return value || null;
}
function businessFields(business: Business): Record<SettingsFieldKey, string> {
  return Object.fromEntries(Object.keys(EMPTY_FIELDS).map((key) => [key, business[key as SettingsFieldKey] ?? ''])) as Record<SettingsFieldKey, string>;
}

const SHADE_KEYS = ['brand-300', 'brand-400', 'brand-500', 'brand-600', 'brand-700'];

const PRESET_PALETTES = [
  { name: 'Morado', hex: '#5F5BF2' },
  { name: 'Océano', hex: '#0EA5E9' },
  { name: 'Esmeralda', hex: '#10B981' },
  { name: 'Atardecer', hex: '#F97316' },
  { name: 'Rosa', hex: '#EC4899' },
  { name: 'Grafito', hex: '#64748B' },
];

interface NameEditor {
  kind: 'agent' | 'branch';
  id: number | null;
}

export function SettingsScreen() {
  const { user, token, logout } = useAuth();
  const { colors, mode, brandColor } = useTheme();
  const insets = useSafeAreaInsets();
  const isAdmin = user?.role === 'admin';
  const { applyBusiness, changeMode, refresh: refreshBusiness, error: syncError } = useBusiness();

  const [tab, setTab] = useState<SettingsTab>('info');
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ ...EMPTY_FIELDS });
  const [fieldStates, setFieldStates] = useState<Partial<Record<SettingsFieldKey, InlineSaveState>>>({});
  const [focusedField, setFocusedField] = useState<SettingsFieldKey | null>(null);
  const focusedKey = useRef<SettingsFieldKey | null>(null);
  const inputs = useRef<Partial<Record<SettingsFieldKey, TextInput | null>>>({});
  const scroll = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [selloUrl, setSelloUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'logo' | 'sello' | null>(null);
  const failedAssets = useRef(new Set<string>());
  const [nameSaving, setNameSaving] = useState(false);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [editingAgents, setEditingAgents] = useState(false);
  const [editingBranches, setEditingBranches] = useState(false);
  const [nameEditor, setNameEditor] = useState<NameEditor | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const [color, setColor] = useState(brandColor ?? colors.primary);

  const palette = useMemo(() => generatePalette(color), [color]);

  const inlineSaver = useMemo(() => createInlineAutosave<SettingsFieldKey>({
    initial: { ...EMPTY_FIELDS },
    normalize: normalizeField,
    write: async (key, value) => {
      if (!token || !isAdmin) throw new Error('Inicia sesión con una cuenta administradora para guardar.');
      const { business } = await api.updateBusiness({ [key]: value }, token);
      // La descarga del logo no retrasa el siguiente guardado de texto.
      void applyBusiness(business).catch(() => {});
      return business[key] ?? '';
    },
    onChange: (values, states) => {
      setForm(values);
      setFieldStates(states);
      if (/^#[0-9a-fA-F]{6}$/.test(values.color_primario)) setColor(values.color_primario);
    },
    onError: (key, message) => feedback.error('No se pudo guardar ' +
      (INFO_FIELDS.find((field) => field.key === key)?.label.toLowerCase() ?? 'el color de marca'), message),
  }), [token, isAdmin, applyBusiness]);

  const keepFocusedVisible = useCallback(() => {
    const key = focusedKey.current;
    const input = key ? inputs.current[key] : null;
    if (!input || !scroll.current) return;
    input.measureInWindow((_x, y, _width, height) => {
      scroll.current?.getNativeScrollRef()?.measureInWindow((_sx, top, _sw, viewportHeight) => {
        const bottom = Math.min(top + viewportHeight, Keyboard.metrics()?.screenY ?? Infinity) - 28;
        if (y + height > bottom) scroll.current?.scrollTo({ y: Math.max(0, scrollY.current + y + height - bottom), animated: true });
        else if (y < top + 24) scroll.current?.scrollTo({ y: Math.max(0, scrollY.current + y - top - 24), animated: true });
      });
    });
  }, []);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', keepFocusedVisible);
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      const key = focusedKey.current;
      if (key) inputs.current[key]?.blur();
    });
    return () => { show.remove(); hide.remove(); };
  }, [keepFocusedVisible]);

  const focusField = (key: SettingsFieldKey) => {
    focusedKey.current = key;
    setFocusedField(key);
    requestAnimationFrame(keepFocusedVisible);
  };
  const finishField = (key: SettingsFieldKey) => {
    void inlineSaver.save(key);
  };
  const blurFields = () => {
    const key = focusedKey.current;
    if (key) {
      void inlineSaver.save(key);
      inputs.current[key]?.blur();
      focusedKey.current = null;
    }
    Keyboard.dismiss();
  };


  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await inlineSaver.flush();
      const [biz, agentList, branchList] = await Promise.all([
        api.business(token).then((r) => r.business),
        api.agents(token).then((r) => r.agents).catch(() => []),
        api.branches(token).then((r) => r.branches).catch(() => []),
      ]);
      if (biz) {
        inlineSaver.reset(businessFields(biz));
        setLogoUrl(biz.logo_url);
        setSelloUrl(biz.sello_url);
        if (biz.color_primario) {
          setColor(biz.color_primario);
        }
      }
      setAgents(agentList);
      setBranches(branchList);
    } catch (err) {
      feedback.alert(
        'Error',
        err instanceof ApiError ? err.message : 'No se pudo cargar la configuración',
      );
    } finally {
      setLoading(false);
    }
  }, [token, inlineSaver]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        const key = focusedKey.current;
        if (key) { void inlineSaver.save(key); inputs.current[key]?.blur(); }
        Keyboard.dismiss();
      };
    }, [load, inlineSaver]),
  );

  const handleSaveColor = async () => {
    blurFields();
    if (await inlineSaver.save('color_primario')) {
      feedback.success('Color guardado', 'El color de marca se actualizó para tu empresa.');
    }
  };

  const handleUploadAsset = async (tipo: 'logo' | 'sello') => {
    if (!token || uploading || !isAdmin) return;
    setUploading(tipo);
    let sent = false;
    try {
      const picked = await pickImageFromLibrary();
      if (!picked) return;
      const { url } = await api.uploadBusinessAsset({ tipo, base64: picked.base64, ext: picked.ext }, token);
      sent = true;
      await loadRemoteImage(mediaUrl(url)!, token, true);
      const updated = (await api.business(token)).business;
      if (!updated) throw new Error('No se pudo confirmar la configuración de la empresa. Vuelve a abrir Configuración.');
      if (tipo === 'logo') setLogoUrl(url); else setSelloUrl(url);
      const warning = await applyBusiness(updated);
      if (warning) feedback.warning('Imagen guardada con observaciones', warning);
      else feedback.success(tipo === 'logo' ? 'Logo actualizado' : 'Sello actualizado',
        'La imagen se guardó y verificó correctamente. Ya está disponible para tu empresa y sus documentos.');
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Inténtalo de nuevo o selecciona otra imagen.';
      feedback.error(sent ? 'No se pudo verificar la imagen' : 'No se pudo guardar la imagen',
        sent ? 'El servidor recibió el archivo, pero no pudimos confirmar que se pueda mostrar. ' + detail : detail);
    } finally { setUploading(null); }
  };
  const reportAssetError = (tipo: 'logo' | 'sello', url: string | null, error: Error) => {
    if (!url || failedAssets.current.has(url)) return;
    failedAssets.current.add(url);
    feedback.error(tipo === 'logo' ? 'No se pudo mostrar el logo' : 'No se pudo mostrar el sello',
      error.message);
  };

  const openNameEditor = (kind: 'agent' | 'branch', id: number | null, initial: string) => {
    setNameEditor({ kind, id });
    setNameDraft(initial);
    setNameError(null);
  };

  const closeNameEditor = () => {
    setNameEditor(null);
    setNameDraft('');
    setNameError(null);
  };

  const submitName = async () => {
    if (!token || !nameEditor || nameSaving) return;
    const name = nameDraft.trim();
    if (name.length < 2) {
      setNameError('El nombre debe tener al menos dos caracteres.');
      feedback.warning('Revisa el nombre', 'Escribe al menos dos caracteres antes de guardar.');
      return;
    }
    setNameSaving(true);
    try {
      if (nameEditor.kind === 'agent') {
        if (nameEditor.id == null) {
          const { agent } = await api.createAgent({ name }, token);
          setAgents((prev) => [...prev, agent]);
        } else {
          const { agent } = await api.updateAgent(nameEditor.id, { name }, token);
          setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, ...agent } : a)));
        }
      } else if (nameEditor.id == null) {
        const { branch } = await api.createBranch(name, token);
        setBranches((prev) => [...prev, branch]);
      } else {
        const { branch } = await api.updateBranch(nameEditor.id, { name }, token);
        setBranches((prev) => prev.map((b) => (b.id === branch.id ? { ...b, name: branch.name } : b)));
      }
      closeNameEditor();
      feedback.success('Datos actualizados', 'El cambio se guardó correctamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar. Inténtalo otra vez.';
      setNameError(message);
      feedback.error('No se pudo guardar', message);
    } finally { setNameSaving(false); }
  };

  const confirmDeleteAgent = (agent: Agent) => {
    feedback.alert('Borrar agente', `¿Borrar "${agent.name}" de la lista?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await api.deleteAgent(agent.id, token);
            setAgents((prev) => prev.filter((a) => a.id !== agent.id));
          } catch (err) {
            feedback.alert('Error', err instanceof ApiError ? err.message : 'No se pudo borrar');
          }
        },
      },
    ]);
  };

  const confirmDeleteBranch = (branch: Branch) => {
    feedback.alert('Borrar sucursal', `¿Borrar "${branch.name}" de la lista?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await api.deleteBranch(branch.id, token);
            setBranches((prev) => prev.filter((b) => b.id !== branch.id));
          } catch (err) {
            feedback.alert('Error', err instanceof ApiError ? err.message : 'No se pudo borrar');
          }
        },
      },
    ]);
  };

  const nameEditorTitle =
    nameEditor?.kind === 'agent'
      ? nameEditor.id == null
        ? 'Nuevo agente'
        : 'Editar agente'
      : nameEditor?.id == null
        ? 'Nueva sucursal'
        : 'Editar sucursal';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scroll}
        onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        onLayout={() => { requestAnimationFrame(keepFocusedVisible); }}
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: 24 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => { blurFields(); router.back(); }} accessibilityLabel="Volver" hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Configuración</Text>
          <View style={styles.headerSpacer} />
        </View>

        <SegmentedTabs<SettingsTab> options={isAdmin ? TABS : TABS.filter((item) => item.key === 'info')} value={tab} onChange={(next) => { blurFields(); setTab(next); }} />

        {syncError && <NoticeCard tone="error" title="Hay un problema de sincronización" message={syncError} action="Reintentar" onPress={() => { void refreshBusiness(); void load(); }} />}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : tab === 'info' ? (
          <>
            <View style={styles.block}>
              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Logo</Text>
                </View>
                {logoUrl ? (
                  <View style={styles.logoPreviewWrap}>
                    <StoredImage
                      uri={logoUrl} token={token}
                      onLoadError={(error) => reportAssetError("logo", logoUrl, error)}
                      style={[styles.logoPreview, { backgroundColor: '#ffffff', borderRadius: 8 }]}
                      resizeMode="contain"
                    />
                    <Pressable
                      style={[styles.assetButton, { borderColor: colors.border }]}
                      onPress={() => handleUploadAsset('logo')}
                      disabled={uploading !== null || !isAdmin}
                    >
                      {uploading === 'logo' ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={[styles.assetButtonText, { color: colors.primary }]}>
                          Cambiar logo
                        </Text>
                      )}
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.uploadZone, { borderColor: colors.border }]}
                    onPress={() => handleUploadAsset('logo')}
                    disabled={uploading !== null || !isAdmin}
                  >
                    {uploading === 'logo' ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={22} color={colors.primary} />
                        <Text style={[styles.uploadZoneText, { color: colors.muted }]}>Subir logo</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>

              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Información</Text>
                </View>
                {isAdmin && <Text style={[styles.assetHint, { color: colors.muted }]}>
                  Toca un campo para editar. Se guarda al salir.
                </Text>}
                {INFO_FIELDS.map((field, index) => (
                  <InlineSettingInput key={field.key} label={field.label} value={form[field.key]}
                    inputRef={(input) => { inputs.current[field.key] = input; }}
                    state={fieldStates[field.key]} focused={focusedField === field.key}
                    editable={isAdmin} placeholder={field.placeholder} maxLength={field.maxLength}
                    keyboardType={field.keyboardType} autoCapitalize={field.autoCapitalize ?? 'sentences'}
                    autoCorrect={field.key !== 'email' && field.key !== 'website'}
                    onChangeText={(value) => inlineSaver.change(field.key, value)}
                    onFocus={() => focusField(field.key)}
                    onBlur={() => {
                      if (focusedKey.current === field.key) { focusedKey.current = null; setFocusedField(null); }
                      finishField(field.key);
                    }}
                    onEndEditing={() => finishField(field.key)}
                    returnKeyType={index === INFO_FIELDS.length - 1 ? 'done' : 'next'}
                    submitBehavior={index === INFO_FIELDS.length - 1 ? 'blurAndSubmit' : 'submit'}
                    onSubmitEditing={() => {
                      const next = INFO_FIELDS[index + 1];
                      if (next) inputs.current[next.key]?.focus(); else blurFields();
                    }}
                    onRetry={() => { void inlineSaver.save(field.key); }}
                  />
                ))}
              </View>

              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Agentes de venta</Text>
                  <Pressable disabled={!isAdmin} onPress={() => setEditingAgents((v) => !v)} hitSlop={8}>
                    <Ionicons
                      name={editingAgents ? 'checkmark' : 'pencil-outline'}
                      size={18}
                      color={editingAgents ? colors.primary : colors.icon}
                    />
                  </Pressable>
                </View>
                <View style={styles.chipsWrap}>
                  {agents.map((agent) => (
                    <View
                      key={agent.id}
                      style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.background }]}
                    >
                      <Pressable
                        onPress={() => openNameEditor('agent', agent.id, agent.name)}
                        disabled={!editingAgents}
                      >
                        <Text style={[styles.chipText, { color: colors.text }]}>{agent.name}</Text>
                      </Pressable>
                      {editingAgents && !agent.accountId && (
                        <Pressable onPress={() => confirmDeleteAgent(agent)} hitSlop={8}>
                          <Ionicons name="close-circle" size={16} color={colors.error} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
                {agents.length === 0 && !editingAgents && (
                  <Text style={[styles.emptyHint, { color: colors.muted }]}>
                    Sin agentes. Cada venta puede registrarse a nombre de un agente.
                  </Text>
                )}
              </View>

              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Sucursal</Text>
                  <Pressable disabled={!isAdmin} onPress={() => setEditingBranches((v) => !v)} hitSlop={8}>
                    <Ionicons
                      name={editingBranches ? 'checkmark' : 'pencil-outline'}
                      size={18}
                      color={editingBranches ? colors.primary : colors.icon}
                    />
                  </Pressable>
                </View>
                <View style={styles.chipsWrap}>
                  {branches.map((branch) => (
                    <View
                      key={branch.id}
                      style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.background }]}
                    >
                      <Pressable
                        onPress={() => openNameEditor('branch', branch.id, branch.name)}
                        disabled={!editingBranches}
                      >
                        <Text style={[styles.chipText, { color: colors.text }]}>{branch.name}</Text>
                      </Pressable>
                      {editingBranches && (
                        <Pressable onPress={() => confirmDeleteBranch(branch)} hitSlop={8}>
                          <Ionicons name="close-circle" size={16} color={colors.error} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {editingBranches && (
                    <Pressable
                      style={[styles.chip, styles.chipAdd, { borderColor: colors.primary }]}
                      onPress={() => openNameEditor('branch', null, '')}
                    >
                      <Ionicons name="add" size={15} color={colors.primary} />
                      <Text style={[styles.chipText, { color: colors.primary }]}>Agregar</Text>
                    </Pressable>
                  )}
                </View>
                {branches.length === 0 && !editingBranches && (
                  <Text style={[styles.emptyHint, { color: colors.muted }]}>
                    Sin sucursales. Se usan para filtrar y organizar las ventas.
                  </Text>
                )}
              </View>

              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Sello</Text>
                </View>
                {selloUrl ? (
                  <View style={styles.selloPreviewWrap}>
                    <StoredImage
                      uri={selloUrl} token={token}
                      onLoadError={(error) => reportAssetError("sello", selloUrl, error)}
                      style={[styles.selloPreview, { backgroundColor: '#ffffff', borderRadius: 8 }]}
                      resizeMode="contain"
                    />
                    <Pressable
                      style={[styles.assetButton, { borderColor: colors.border }]}
                      onPress={() => handleUploadAsset('sello')}
                      disabled={uploading !== null || !isAdmin}
                    >
                      {uploading === 'sello' ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={[styles.assetButtonText, { color: colors.primary }]}>
                          Cambiar sello
                        </Text>
                      )}
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.uploadZone, { borderColor: colors.border }]}
                    onPress={() => handleUploadAsset('sello')}
                    disabled={uploading !== null || !isAdmin}
                  >
                    {uploading === 'sello' ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="ribbon-outline" size={22} color={colors.primary} />
                        <Text style={[styles.uploadZoneText, { color: colors.muted }]}>
                          Subir sello
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
                <Text style={[styles.assetHint, { color: colors.muted }]}>
                  Aparece en cotizaciones y notas de entrega cuando «Incluir sello» está activo.
                </Text>
              </View>

            </View>

            <TeamUsers onCreated={() => { void load(); }} />
            {!isAdmin && <Text style={{ color: colors.muted }}>La configuración de empresa la administra el administrador.</Text>}
            <Text style={[styles.section, { color: colors.muted }]}>Apariencia de mi cuenta</Text>
            <SegmentedTabs options={MODES} value={mode} onChange={(next) => { void changeMode(next).catch((err) => feedback.alert('Error', err.message)); }} />

            <Text style={[styles.section, { color: colors.muted }]}>Cuenta</Text>
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.userName, { color: colors.text }]}>{user?.name}</Text>
              <Text style={[styles.userDetail, { color: colors.muted }]}>@{user?.username}</Text>
              {user?.email && (
                <Text style={[styles.userDetail, { color: colors.muted }]}>{user.email}</Text>
              )}
            </View>

            <Text style={[styles.section, { color: colors.muted }]}>Acerca de</Text>
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.userName, { color: colors.text }]}>
                {BRAND.title} v{BRAND.version}
              </Text>
              <Text style={[styles.userDetail, { color: colors.muted }]}>{BRAND.tagline}</Text>
            </View>

            <Pressable style={[styles.logoutButton, { borderColor: colors.error }]} onPress={() => { blurFields(); void inlineSaver.flush().then(logout); }}>
              <Text style={[styles.logoutText, { color: colors.error }]}>Cerrar sesión</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.block}>
              <View style={styles.wheelWrap}>
                <ColorWheel color={color} size={248} onChange={(next) => inlineSaver.change('color_primario', next)} />
              </View>

              <View style={styles.hexRow}>
                <InlineSettingInput label="Color hexadecimal" value={form.color_primario.replace(/^#/, '').toUpperCase()}
                  inputRef={(input) => { inputs.current.color_primario = input; }}
                  state={fieldStates.color_primario} focused={focusedField === 'color_primario'}
                  placeholder="5F5BF2" autoCapitalize="characters" autoCorrect={false} maxLength={6}
                  onChangeText={(value) => inlineSaver.change('color_primario', '#' + value)}
                  onFocus={() => focusField('color_primario')}
                  onBlur={() => {
                    if (focusedKey.current === 'color_primario') { focusedKey.current = null; setFocusedField(null); }
                    finishField('color_primario');
                  }}
                  onEndEditing={() => finishField('color_primario')}
                  returnKeyType="done" submitBehavior="blurAndSubmit"
                  onRetry={() => { void inlineSaver.save('color_primario'); }} />
                <View style={[styles.hexSwatch, { backgroundColor: color, borderColor: colors.border }]} />
              </View>

              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Paleta seleccionada</Text>
                </View>
                <View style={styles.shadeRow}>
                  {SHADE_KEYS.map((key) => (
                    <Pressable key={key} onPress={() => { blurFields(); inlineSaver.change('color_primario', palette[key]); }} hitSlop={6}>
                      <View
                        style={[
                          styles.shadeDot,
                          { backgroundColor: palette[key] },
                          color.toUpperCase() === palette[key].toUpperCase() && {
                            borderWidth: 2,
                            borderColor: colors.text,
                          },
                        ]}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>

              <Text style={[styles.section, { color: colors.muted }]}>Paletas sugeridas</Text>
              <View style={styles.presetsGrid}>
                {PRESET_PALETTES.map((preset) => {
                  const presetPalette = generatePalette(preset.hex);
                  const selected = color.toUpperCase() === preset.hex.toUpperCase();
                  return (
                    <Pressable
                      key={preset.name}
                      style={[
                        styles.presetCard,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: colors.surface,
                        },
                      ]}
                      onPress={() => { blurFields(); inlineSaver.change('color_primario', preset.hex); }}
                    >
                      <View style={styles.presetHeader}>
                        <Text style={[styles.presetName, { color: colors.text }]}>{preset.name}</Text>
                        {selected && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                      </View>
                      <View style={styles.shadeRow}>
                        {SHADE_KEYS.map((key) => (
                          <View
                            key={key}
                            style={[styles.presetDot, { backgroundColor: presetPalette[key] }]}
                          />
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <PrimaryButton title="Guardar color" onPress={handleSaveColor} loading={fieldStates.color_primario?.status === 'saving'} />
            </View>
          </>
        )}
      </ScrollView>

      <FormModal visible={nameEditor !== null} title={nameEditorTitle} onClose={() => { if (!nameSaving) closeNameEditor(); }}>
        <TextInput style={[styles.modalInput, { color: colors.text, borderColor: nameError ? colors.error : colors.border, minHeight: 52 }]}
          value={nameDraft} onChangeText={(value) => { setNameDraft(value); setNameError(null); }}
          placeholder="Nombre" placeholderTextColor={colors.muted} autoFocus autoCapitalize="words" maxLength={150}
          editable={!nameSaving} onSubmitEditing={() => { void submitName(); }} returnKeyType="done" />
        {nameError && <Text style={{ color: colors.error }}>{nameError}</Text>}
        <PrimaryButton title="Guardar" onPress={submitName} loading={nameSaving} />
      </FormModal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  headerSpacer: {
    width: 24,
  },
  loading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  block: {
    gap: 16,
    marginTop: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  uploadZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 6,
  },
  uploadZoneText: {
    fontSize: 14,
    fontFamily: 'Poppins',
  },
  logoPreviewWrap: {
    alignItems: 'center',
    gap: 12,
  },
  logoPreview: {
    width: '100%',
    height: 110,
  },
  selloPreviewWrap: {
    alignItems: 'center',
    gap: 12,
  },
  selloPreview: {
    width: 140,
    height: 140,
  },
  assetButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  assetButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  assetHint: {
    fontSize: 12,
    fontFamily: 'Poppins',
    marginTop: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  fieldTexts: {
    flex: 1,
    gap: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  fieldValue: {
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  fieldInput: {
    fontSize: 15,
    fontFamily: 'Poppins',
    padding: 0,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipAdd: {
    borderStyle: 'dashed',
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: 'Poppins',
    marginTop: 4,
  },
  section: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 10,
  },
  userName: {
    fontSize: 17,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  userDetail: {
    fontSize: 14,
    fontFamily: 'Poppins',
  },
  logoutButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutText: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  wheelWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hexPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  hexText: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '600',
    letterSpacing: 1,
  },
  hexHash: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  hexInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '600',
    letterSpacing: 1,
    padding: 0,
  },
  hexSwatch: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
  },
  shadeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  shadeDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  presetCard: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  presetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presetName: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  presetDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  modalFill: {
    flex: 1,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 15, 25, 0.45)',
  },
  modalAnchor: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  modalError: {
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    borderWidth: 0,
  },
  modalButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
});
