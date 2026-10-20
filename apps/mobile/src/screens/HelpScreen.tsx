import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { contrastRatio } from '../lib/brandColors';
import { useTutorial } from '../tutorials/TutorialContext';
import { GUIDE_KEYS, GUIDES, type GuideKey } from '../tutorials/catalog';

export function HelpScreen() {
  const { colors } = useTheme();
  const accent = contrastRatio(colors.primary, colors.surface) >= 4.5 ? colors.primary : colors.text;
  const insets = useSafeAreaInsets();
  const { progress, launch, sync } = useTutorial();
  const [opening, setOpening] = useState<GuideKey | null>(null);
  const completed = Object.values(progress.records).filter((record) => record?.status === 'completed').length;
  const open = async (guide: GuideKey, restart = false) => {
    if (opening) return;
    setOpening(guide);
    try { await launch(guide, restart); } finally { setOpening(null); }
  };
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={10}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={[styles.heading, { color: colors.text }]}>Centro de ayuda</Text>
      <View style={{ width: 24 }} />
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
      <View style={[styles.intro, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.primary + '18' }]}>
          <Ionicons name="sparkles-outline" size={28} color={accent} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Aprende haciendo</Text>
        <Text style={[styles.description, { color: colors.muted }]}>Guías cortas sobre los controles reales de Lumis. Continúa donde te quedaste o repite cualquier recorrido.</Text>
        <Text style={[styles.counter, { color: accent }]}>{completed} de {GUIDE_KEYS.length} guías completadas</Text>
        <Text style={[styles.note, { color: colors.muted }]}>Tu avance es personal y se sincroniza con tu cuenta.</Text>
      </View>
      {!!progress.error && <View style={[styles.sync, { borderColor: colors.border }]}>
        <Ionicons name="cloud-offline-outline" size={23} color={colors.text} />
        <Text style={[styles.note, { flex: 1, color: colors.muted }]}>{progress.error}</Text>
        <Pressable onPress={() => { void sync(); }} accessibilityRole="button" accessibilityLabel="Sincronizar avance">
          {progress.syncing ? <ActivityIndicator color={accent} /> : <Ionicons name="refresh" size={23} color={accent} />}
        </Pressable>
      </View>}
      {GUIDE_KEYS.map((key) => {
        const guide = GUIDES[key], record = progress.records[key];
        const done = record?.status === 'completed';
        const resume = !!record?.stepId && !done;
        return <View key={key} style={[styles.guide, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <Ionicons name={guide.icon} size={24} color={accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.guideTitle, { color: colors.text }]}>{guide.title}</Text>
              <Text style={[styles.note, { color: colors.muted }]}>{guide.description}</Text>
            </View>
            {done && <Ionicons name="checkmark-circle" size={22} color={accent} accessibilityLabel="Guía completada" />}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => { void open(key); }} disabled={opening !== null}
              accessibilityRole="button" accessibilityLabel={(done ? 'Repetir ' : resume ? 'Continuar ' : 'Ver guía de ') + guide.title}
              style={[styles.primary, { backgroundColor: colors.primary }]}>
              {opening === key ? <ActivityIndicator color={colors.onPrimary} size="small" /> :
                <Text style={[styles.button, { color: colors.onPrimary }]}>{done ? 'Repetir guía' : resume ? 'Continuar' : 'Ver guía'}</Text>}
            </Pressable>
            {resume && <Pressable onPress={() => { void open(key, true); }} disabled={opening !== null} accessibilityRole="button" style={styles.restart}>
              <Text style={[styles.button, { color: accent }]}>Desde el principio</Text>
            </Pressable>}
          </View>
        </View>;
      })}
      <Text style={[styles.note, { color: colors.muted }]}>Las guías de detalle y PDF abren un documento existente. Si aún no tienes uno, empezaremos con la guía para crearlo.</Text>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  heading: { fontFamily: 'Poppins-SemiBold', fontSize: 20 },
  content: { paddingHorizontal: 18, gap: 14 },
  intro: { padding: 22, borderRadius: 24, borderWidth: 1, gap: 10 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Poppins-Bold', fontSize: 24 },
  description: { fontFamily: 'Poppins', fontSize: 13, lineHeight: 21 },
  counter: { fontFamily: 'Poppins-SemiBold', fontSize: 14, marginTop: 2 },
  note: { fontFamily: 'Poppins', fontSize: 11, lineHeight: 18 },
  guide: { padding: 18, borderRadius: 20, borderWidth: 1, gap: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  guideTitle: { fontFamily: 'Poppins-SemiBold', fontSize: 15, marginBottom: 3 },
  sync: { padding: 14, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  primary: { paddingHorizontal: 18, minHeight: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 13 },
  button: { fontFamily: 'Poppins-SemiBold', fontSize: 12 },
  restart: { flex: 1, paddingVertical: 10 },
});
