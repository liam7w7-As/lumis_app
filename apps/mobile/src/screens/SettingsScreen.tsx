import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  type Agent,
  type Branch,
  type BusinessUpdateInput,
} from '../lib/api';
import { generatePalette } from '../lib/brandColors';
import { pickImageFromLibrary } from '../lib/media';
import { BRAND } from '../config';

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
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
}

const INFO_FIELDS: InfoField[] = [
  { key: 'nombre', label: 'Nombre de la empresa', placeholder: 'Mi Negocio', autoCapitalize: 'words' },
  { key: 'email', label: 'Correo', placeholder: 'correo@ejemplo.com', keyboardType: 'email-address', autoCapitalize: 'none' },
  { key: 'telefono', label: 'Número de contacto', placeholder: '+591 70000000', keyboardType: 'phone-pad' },
  { key: 'nit', label: 'NIT', placeholder: '12345678' },
  { key: 'moneda', label: 'Tipo de moneda', placeholder: 'Bs.' },
  { key: 'redes_sociales', label: 'Red Social', placeholder: '@minegocio', autoCapitalize: 'none' },
  { key: 'website', label: 'Página Web', placeholder: 'www.minegocio.com', keyboardType: 'url', autoCapitalize: 'none' },
  { key: 'direccion', label: 'Dirección', placeholder: 'Av. Principal #123', autoCapitalize: 'words' },
  { key: 'ciudad', label: 'Ciudad', placeholder: 'La Paz - Bolivia', autoCapitalize: 'words' },
];

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
  const { colors, mode, setMode, brandColor, setBrandColor } = useTheme();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<SettingsTab>('info');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Record<InfoFieldKey, string>>({
    nombre: '',
    email: '',
    telefono: '',
    nit: '',
    moneda: '',
    redes_sociales: '',
    website: '',
    direccion: '',
    ciudad: '',
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [selloUrl, setSelloUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'logo' | 'sello' | null>(null);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [editingAgents, setEditingAgents] = useState(false);
  const [editingBranches, setEditingBranches] = useState(false);
  const [nameEditor, setNameEditor] = useState<NameEditor | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const [editingField, setEditingField] = useState<InfoFieldKey | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');

  const [color, setColor] = useState(brandColor ?? colors.primary);
  const [hexEditing, setHexEditing] = useState(false);
  const [hexDraft, setHexDraft] = useState('');

  const palette = useMemo(() => generatePalette(color), [color]);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [biz, agentList, branchList] = await Promise.all([
        api.business(token).then((r) => r.business),
        api.agents(token).then((r) => r.agents).catch(() => []),
        api.branches(token).then((r) => r.branches).catch(() => []),
      ]);
      if (biz) {
        setForm({
          nombre: biz.nombre ?? '',
          email: biz.email ?? '',
          telefono: biz.telefono ?? '',
          nit: biz.nit ?? '',
          moneda: biz.moneda ?? '',
          redes_sociales: biz.redes_sociales ?? '',
          website: biz.website ?? '',
          direccion: biz.direccion ?? '',
          ciudad: biz.ciudad ?? '',
        });
        setLogoUrl(biz.logo_url);
        setSelloUrl(biz.sello_url);
        if (biz.color_primario) {
          setColor(biz.color_primario);
        }
      }
      setAgents(agentList);
      setBranches(branchList);
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof ApiError ? err.message : 'No se pudo cargar la configuración',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const startEditField = (key: InfoFieldKey) => {
    setEditingField(key);
    setFieldDraft(form[key]);
  };

  const commitField = () => {
    if (!editingField) return;
    setForm((prev) => ({ ...prev, [editingField]: fieldDraft.trim() }));
    setEditingField(null);
  };

  const handleSave = async () => {
    if (!token || saving) return;
    setSaving(true);
    try {
      const payload: BusinessUpdateInput = {
        nombre: form.nombre.trim() || undefined,
        moneda: form.moneda.trim() || undefined,
        email: form.email.trim() || null,
        telefono: form.telefono.trim() || null,
        nit: form.nit.trim() || null,
        redes_sociales: form.redes_sociales.trim() || null,
        website: form.website.trim() || null,
        direccion: form.direccion.trim() || null,
        ciudad: form.ciudad.trim() || null,
        color_primario: color,
      };
      const { business } = await api.updateBusiness(payload, token);
      setForm({
        nombre: business.nombre ?? '',
        email: business.email ?? '',
        telefono: business.telefono ?? '',
        nit: business.nit ?? '',
        moneda: business.moneda ?? '',
        redes_sociales: business.redes_sociales ?? '',
        website: business.website ?? '',
        direccion: business.direccion ?? '',
        ciudad: business.ciudad ?? '',
      });
      setLogoUrl(business.logo_url);
      setSelloUrl(business.sello_url);
      setColor(business.color_primario);
      await setBrandColor(business.color_primario);
      Alert.alert('Guardado', 'La configuración se guardó correctamente.');
    } catch (err) {
      Alert.alert('Error', err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadAsset = async (tipo: 'logo' | 'sello') => {
    if (!token || uploading) return;
    const picked = await pickImageFromLibrary();
    if (!picked) return;
    setUploading(tipo);
    try {
      const { url } = await api.uploadBusinessAsset(
        { tipo, base64: picked.base64, ext: picked.ext },
        token,
      );
      if (tipo === 'logo') {
        setLogoUrl(url);
      } else {
        setSelloUrl(url);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof ApiError ? err.message : 'No se pudo subir la imagen');
    } finally {
      setUploading(null);
    }
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
    if (!token || !nameEditor) return;
    const name = nameDraft.trim();
    if (name.length < 2) {
      setNameError('El nombre es muy corto');
      return;
    }
    try {
      if (nameEditor.kind === 'agent') {
        if (nameEditor.id == null) {
          const { agent } = await api.createAgent({ name }, token);
          setAgents((prev) => [...prev, agent]);
        } else {
          const { agent } = await api.updateAgent(nameEditor.id, { name }, token);
          setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
        }
      } else if (nameEditor.id == null) {
        const { branch } = await api.createBranch(name, token);
        setBranches((prev) => [...prev, branch]);
      } else {
        const { branch } = await api.updateBranch(nameEditor.id, { name }, token);
        setBranches((prev) => prev.map((b) => (b.id === branch.id ? { ...b, name: branch.name } : b)));
      }
      closeNameEditor();
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    }
  };

  const confirmDeleteAgent = (agent: Agent) => {
    Alert.alert('Borrar agente', `¿Borrar "${agent.name}" de la lista?`, [
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
            Alert.alert('Error', err instanceof ApiError ? err.message : 'No se pudo borrar');
          }
        },
      },
    ]);
  };

  const confirmDeleteBranch = (branch: Branch) => {
    Alert.alert('Borrar sucursal', `¿Borrar "${branch.name}" de la lista?`, [
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
            Alert.alert('Error', err instanceof ApiError ? err.message : 'No se pudo borrar');
          }
        },
      },
    ]);
  };

  const startHexEdit = () => {
    setHexDraft(color.replace('#', '').toUpperCase());
    setHexEditing(true);
  };

  const commitHex = () => {
    const clean = hexDraft.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
      Alert.alert('Color inválido', 'Escribe un color en formato hexadecimal, por ejemplo 5F5BF2.');
      return;
    }
    setColor(`#${clean.toLowerCase()}`);
    setHexEditing(false);
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
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: 24 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Configuración</Text>
          <View style={styles.headerSpacer} />
        </View>

        <SegmentedTabs options={TABS} value={tab} onChange={setTab} />

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
                    <Image
                      source={{ uri: mediaUrl(logoUrl) ?? undefined }}
                      style={styles.logoPreview}
                      resizeMode="contain"
                    />
                    <Pressable
                      style={[styles.assetButton, { borderColor: colors.border }]}
                      onPress={() => handleUploadAsset('logo')}
                      disabled={uploading !== null}
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
                    disabled={uploading !== null}
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
                {INFO_FIELDS.map((field, index) => {
                  const isEditing = editingField === field.key;
                  const value = form[field.key];
                  return (
                    <View
                      key={field.key}
                      style={[
                        styles.fieldRow,
                        index < INFO_FIELDS.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                        },
                      ]}
                    >
                      <View style={styles.fieldTexts}>
                        <Text style={[styles.fieldLabel, { color: colors.muted }]}>{field.label}</Text>
                        {isEditing ? (
                          <TextInput
                            style={[styles.fieldInput, { color: colors.text }]}
                            value={fieldDraft}
                            onChangeText={setFieldDraft}
                            placeholder={field.placeholder}
                            placeholderTextColor={colors.muted}
                            keyboardType={field.keyboardType}
                            autoCapitalize={field.autoCapitalize ?? 'sentences'}
                            autoFocus
                            onSubmitEditing={commitField}
                            returnKeyType="done"
                          />
                        ) : (
                          <Text
                            style={[
                              styles.fieldValue,
                              { color: value ? colors.text : colors.muted },
                            ]}
                            numberOfLines={1}
                          >
                            {value || field.placeholder}
                          </Text>
                        )}
                      </View>
                      <Pressable
                        onPress={() => (isEditing ? commitField() : startEditField(field.key))}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={isEditing ? 'checkmark' : 'pencil-outline'}
                          size={18}
                          color={isEditing ? colors.primary : colors.icon}
                        />
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Agentes de venta</Text>
                  <Pressable onPress={() => setEditingAgents((v) => !v)} hitSlop={8}>
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
                      {editingAgents && (
                        <Pressable onPress={() => confirmDeleteAgent(agent)} hitSlop={8}>
                          <Ionicons name="close-circle" size={16} color={colors.error} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {editingAgents && (
                    <Pressable
                      style={[styles.chip, styles.chipAdd, { borderColor: colors.primary }]}
                      onPress={() => openNameEditor('agent', null, '')}
                    >
                      <Ionicons name="add" size={15} color={colors.primary} />
                      <Text style={[styles.chipText, { color: colors.primary }]}>Agregar</Text>
                    </Pressable>
                  )}
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
                  <Pressable onPress={() => setEditingBranches((v) => !v)} hitSlop={8}>
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
                    <Image
                      source={{ uri: mediaUrl(selloUrl) ?? undefined }}
                      style={styles.selloPreview}
                      resizeMode="contain"
                    />
                    <Pressable
                      style={[styles.assetButton, { borderColor: colors.border }]}
                      onPress={() => handleUploadAsset('sello')}
                      disabled={uploading !== null}
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
                    disabled={uploading !== null}
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

              <PrimaryButton title="Guardar" onPress={handleSave} loading={saving} />
            </View>

            <Text style={[styles.section, { color: colors.muted }]}>Apariencia</Text>
            <SegmentedTabs options={MODES} value={mode} onChange={setMode} />

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

            <Pressable style={[styles.logoutButton, { borderColor: colors.error }]} onPress={logout}>
              <Text style={[styles.logoutText, { color: colors.error }]}>Cerrar sesión</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.block}>
              <View style={styles.wheelWrap}>
                <ColorWheel color={color} size={248} onChange={setColor} />
              </View>

              <View style={styles.hexRow}>
                {hexEditing ? (
                  <View style={[styles.hexPill, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
                    <Text style={[styles.hexHash, { color: colors.text }]}>#</Text>
                    <TextInput
                      style={[styles.hexInput, { color: colors.text }]}
                      value={hexDraft}
                      onChangeText={setHexDraft}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoFocus
                      maxLength={7}
                      onSubmitEditing={commitHex}
                      returnKeyType="done"
                      onBlur={commitHex}
                    />
                    <Pressable onPress={commitHex} hitSlop={8}>
                      <Ionicons name="checkmark" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.hexPill, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={startHexEdit}
                  >
                    <Ionicons name="pencil" size={13} color={colors.icon} />
                    <Text style={[styles.hexText, { color: colors.text }]}>{color.toUpperCase()}</Text>
                  </Pressable>
                )}
                <View style={[styles.hexSwatch, { backgroundColor: color, borderColor: colors.border }]} />
              </View>

              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Paleta seleccionada</Text>
                </View>
                <View style={styles.shadeRow}>
                  {SHADE_KEYS.map((key) => (
                    <Pressable key={key} onPress={() => setColor(palette[key])} hitSlop={6}>
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
                      onPress={() => setColor(preset.hex)}
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

              <PrimaryButton title="Guardar" onPress={handleSave} loading={saving} />
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={nameEditor !== null}
        transparent
        animationType="fade"
        onRequestClose={closeNameEditor}
      >
        <View style={styles.modalFill}>
          <Pressable style={styles.modalBackdrop} onPress={closeNameEditor} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalAnchor}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{nameEditorTitle}</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { color: colors.text, borderColor: nameError ? colors.error : colors.border },
                ]}
                value={nameDraft}
                onChangeText={(v) => {
                  setNameDraft(v);
                  setNameError(null);
                }}
                placeholder="Nombre"
                placeholderTextColor={colors.muted}
                autoFocus
                autoCapitalize="words"
                maxLength={150}
                onSubmitEditing={submitName}
                returnKeyType="done"
              />
              {nameError && <Text style={[styles.modalError, { color: colors.error }]}>{nameError}</Text>}
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, { borderColor: colors.border }]}
                  onPress={closeNameEditor}
                >
                  <Text style={[styles.modalButtonText, { color: colors.muted }]}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.modalButtonPrimary, { backgroundColor: colors.primary }]}
                  onPress={submitName}
                >
                  <Text style={[styles.modalButtonText, { color: colors.onPrimary }]}>Guardar</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
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
