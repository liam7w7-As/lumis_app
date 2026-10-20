import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Pressable, ScrollView, StyleSheet, Text, useAnimatedValue,
  useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { contrastRatio } from '../lib/brandColors';
import { useReducedMotion } from '../context/MotionContext';
import { GUIDES, stepPosition, stepsFor } from './catalog';
import { useTutorial, type TargetRect } from './TutorialContext';

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export function TutorialLayer({ hidden }: { hidden: boolean }) {
  const tutorial = useTutorial();
  const { run, page, anchor, admin, close } = tutorial;
  const { colors } = useTheme();
  const accent = contrastRatio(colors.primary, colors.surface) >= 4.5 ? colors.primary : colors.text;
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const host = useRef<View>(null);
  const [highlight, setHighlight] = useState<{ key: string; rect: TargetRect | null } | null>(null);
  const [cardHeight, setCardHeight] = useState(290);
  const opacity = useAnimatedValue(1);
  const steps = run && page ? stepsFor(run.guide, { admin, hasItems: page.hasItems }) : [];
  const position = stepPosition(steps, run?.stepId);
  const step = steps[position];
  const key = run ? run.owner + '/' + run.phase + '/' + (step?.id ?? '') : '';
  const visible = !!run && !!page?.ready && page.owner === run.owner && !hidden;

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => subscription.remove();
  }, [visible, close]);
  useLayoutEffect(() => {
    if (!visible || run?.phase !== 'steps' || !step) return;
    let active = true;
    let current: ReturnType<typeof anchor>;
    void (async () => {
      for (let attempt = 0; attempt < 12 && active; attempt++) {
        current = anchor(run.owner + '/' + step.target);
        if (current) break;
        await pause(90);
      }
      if (!active) return;
      current?.enter?.();
      await current?.reveal();
      await pause(reduced ? 25 : 260);
      const measured = await current?.measure();
      if (!active) return;
      if (!measured || !host.current) { setHighlight({ key, rect: null }); return; }
      host.current.measureInWindow((hx, hy, hostWidth, hostHeight) => {
        if (!active) return;
        const x = Math.max(8, measured.x - hx - 6);
        const y = Math.max(insets.top + 4, measured.y - hy - 6);
        const width = Math.min(measured.width + 12, hostWidth - x - 8);
        const height = Math.min(measured.height + 12, hostHeight - y - insets.bottom - 8, hostHeight * 0.48);
        setHighlight({ key, rect: width > 0 && height > 0 ? { x, y, width, height } : null });
      });
    })();
    return () => { active = false; current?.leave?.(); };
  }, [visible, run?.owner, run?.phase, step, key, anchor, reduced, dimensions.width,
    dimensions.height, insets.top, insets.bottom]);
  useEffect(() => {
    if (!visible) return;
    opacity.stopAnimation();
    if (reduced) { opacity.setValue(1); return; }
    opacity.setValue(0);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true, isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [visible, key, reduced, opacity]);
  if (!visible || !run) return null;
  const guide = GUIDES[run.guide];
  const intro = run.phase === 'intro';
  const rect = highlight?.key === key ? highlight.rect : null;
  const pending = !intro && highlight?.key !== key;
  const saved = tutorial.progress.records[run.guide];
  const continuing = !!saved?.stepId && saved.status !== 'completed';
  const h = dimensions.height, w = dimensions.width;
  const topLimit = insets.top + 14;
  const bottomLimit = h - insets.bottom - 18;
  const below = rect ? rect.y + rect.height + 16 : 0;
  const above = rect ? rect.y - cardHeight - 16 : 0;
  const top = intro || !rect ? Math.max(topLimit, (h - cardHeight) / 2)
    : below + cardHeight <= bottomLimit ? below
    : above >= topLimit ? above : Math.max(topLimit, bottomLimit - cardHeight);
  const shade = (style: object, id: string) => <Pressable key={id} accessible={false} onPress={() => {}}
    style={[styles.shade, style]} />;
  return <View ref={host} collapsable={false} pointerEvents="box-none" style={styles.overlay}>
    {intro || !rect ? shade({ left: 0, right: 0, top: 0, bottom: 0 }, 'all') : <>
      {shade({ left: 0, right: 0, top: 0, height: rect.y }, 'top')}
      {shade({ left: 0, right: 0, top: rect.y + rect.height, bottom: 0 }, 'bottom')}
      {shade({ left: 0, top: rect.y, width: rect.x, height: rect.height }, 'left')}
      {shade({ left: rect.x + rect.width, right: 0, top: rect.y, height: rect.height }, 'right')}
      {!step?.event && <Pressable accessible={false} onPress={() => {}}
        style={{ position: 'absolute', ...rect }} />}
      <View pointerEvents="none" style={[styles.highlight, { left: rect.x, top: rect.y, width: rect.width,
        height: rect.height, borderColor: '#ffffff' }]} />
    </>}
    <Animated.View accessibilityViewIsModal accessibilityLabel={'Guía de ' + guide.title}
      onAccessibilityEscape={close} onLayout={(event) => {
        const height = Math.ceil(event.nativeEvent.layout.height);
        setCardHeight((previous) => Math.abs(previous - height) > 1 ? height : previous);
      }}
      style={[styles.card, { top, left: Math.max(16, (w - 410) / 2), width: Math.min(w - 32, 410),
        maxHeight: Math.min(h - insets.top - insets.bottom - 36, intro ? 470 : 350),
        backgroundColor: colors.surface, borderColor: colors.border, opacity }]}>
      <View style={styles.heading}>
        <View style={[styles.icon, { backgroundColor: colors.primary + '18' }]}>
          <Ionicons name={intro ? guide.icon : 'sparkles-outline'} size={23} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>{intro ? 'CONOCE LUMIS' : guide.title.toUpperCase()}</Text>
          <Text accessibilityLiveRegion="polite" style={[styles.counter, { color: colors.text }]}>
            {intro ? 'A tu ritmo' : 'Paso ' + (position + 1) + ' de ' + steps.length}
          </Text>
        </View>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Cerrar guía" hitSlop={8} style={styles.close}>
          <Ionicons name="close" size={23} color={colors.muted} />
        </Pressable>
      </View>
      {!intro && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length, now: position + 1 }}
        style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={{ height: 4, width: ((position + 1) / steps.length * 100) + '%' as '100%', backgroundColor: accent }} />
      </View>}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{intro ? guide.title : step?.title}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{intro
          ? (continuing ? 'Puedes continuar donde te quedaste o empezar otra vez. ' : '') + guide.description + ' Te mostraremos los controles de esta pantalla paso a paso.'
          : step?.body}</Text>
        {pending && <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />}
        <Text style={[styles.hint, { color: colors.muted }]}>{intro ? 'Siempre puedes volver con el botón ? de cada pantalla.'
          : step?.event ? 'Toca el control resaltado o pulsa Siguiente.' : 'Pulsa Siguiente para continuar.'}</Text>
      </ScrollView>
      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" onPress={intro || position === 0 ? close : tutorial.previous}
          style={[styles.secondary, { borderColor: colors.border }]}>
          <Text style={[styles.buttonLabel, { color: colors.text }]}>{intro ? 'Más tarde' : position === 0 ? 'Omitir' : 'Anterior'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => intro ? tutorial.begin() : tutorial.next()}
          style={[styles.primary, { backgroundColor: colors.primary }]}>
          <Text style={[styles.buttonLabel, { color: colors.onPrimary }]}>{intro
            ? continuing ? 'Continuar' : saved?.status === 'completed' ? 'Repetir guía' : 'Comenzar'
            : position === steps.length - 1 ? 'Terminar' : 'Siguiente'}</Text>
          <Ionicons name={intro || position < steps.length - 1 ? 'arrow-forward' : 'checkmark'} size={18} color={colors.onPrimary} />
        </Pressable>
      </View>
      {intro && continuing && <Pressable onPress={() => tutorial.begin(true)} accessibilityRole="button" style={styles.restart}>
        <Text style={[styles.hint, { color: accent, marginTop: 0 }]}>Empezar desde el principio</Text>
      </Pressable>}
      {!!tutorial.progress.error && <Text style={[styles.sync, { color: colors.muted }]}>Progreso pendiente de sincronizar</Text>}
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 1000, elevation: 30 },
  shade: { position: 'absolute', backgroundColor: 'rgba(4,6,18,0.76)' },
  highlight: { position: 'absolute', borderWidth: 2, borderRadius: 14 },
  card: { position: 'absolute', borderRadius: 24, borderWidth: 1, padding: 20, gap: 12, elevation: 16,
    boxShadow: '0 14px 36px rgba(0,0,0,0.25)' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: 'Poppins-SemiBold', fontSize: 10, letterSpacing: 1 },
  counter: { fontFamily: 'Poppins-Medium', fontSize: 12, marginTop: 2 },
  close: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  title: { fontFamily: 'Poppins-Bold', fontSize: 20, lineHeight: 28, marginBottom: 8 },
  body: { fontFamily: 'Poppins', fontSize: 13, lineHeight: 21 },
  hint: { fontFamily: 'Poppins', fontSize: 11, lineHeight: 17, marginTop: 10 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 2 },
  secondary: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 13, justifyContent: 'center' },
  primary: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    paddingVertical: 13, paddingHorizontal: 10, borderRadius: 13 },
  buttonLabel: { fontFamily: 'Poppins-SemiBold', fontSize: 12 },
  restart: { alignItems: 'center', paddingVertical: 2 },
  sync: { fontFamily: 'Poppins', fontSize: 10, textAlign: 'center' },
});
