import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Pressable, ScrollView, View, type ScrollViewProps, type ViewProps } from 'react-native';
import { useIsFocused } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../context/MotionContext';
import { TutorialPageContext, useTutorial, type TargetRect } from './TutorialContext';
import type { GuideKey } from './catalog';

const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));
const measure = (view: View | ScrollView | null): Promise<TargetRect | null> => new Promise((resolve) => {
  if (!view) { resolve(null); return; }
  let settled = false;
  const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, 300);
  const native = 'getNativeScrollRef' in view ? view.getNativeScrollRef() : view;
  native?.measureInWindow((x: number, y: number, width: number, height: number) => {
    if (settled) return;
    settled = true; clearTimeout(timer);
    resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
  });
});
const TutorialScrollContext = createContext<{ ref: { current: ScrollView | null }; offset: { current: number } } | null>(null);

export function TutorialPage({ guide, children }: { guide: GuideKey; children: ReactNode }) {
  const owner = useId();
  const focused = useIsFocused();
  const { activate, deactivate } = useTutorial();
  useLayoutEffect(() => {
    if (!focused) return;
    activate({ owner, guide, ready: false, hasItems: false });
    return () => deactivate(owner);
  }, [focused, owner, guide, activate, deactivate]);
  const value = useMemo(() => ({ owner, guide }), [owner, guide]);
  return <TutorialPageContext.Provider value={value}>{children}</TutorialPageContext.Provider>;
}
export function withTutorial<P extends object>(Component: ComponentType<P>, guide: GuideKey | ((props: P) => GuideKey)) {
  return function TutorialScreen(props: P) {
    return <TutorialPage guide={typeof guide === 'function' ? guide(props) : guide}><Component {...props} /></TutorialPage>;
  };
}
export function useTutorialAvailability({ ready, hasItems = false }: { ready: boolean; hasItems?: boolean }) {
  const page = useContext(TutorialPageContext);
  const focused = useIsFocused();
  const { updatePage } = useTutorial();
  useEffect(() => {
    if (page && focused) updatePage(page.owner, { ready, hasItems });
  }, [page, focused, ready, hasItems, updatePage]);
}
export const TutorialScrollView = forwardRef<ScrollView, ScrollViewProps>(function TutorialScrollView({ onScroll, ...props }, forwarded) {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  useImperativeHandle(forwarded, () => ref.current!, []);
  const value = useMemo(() => ({ ref, offset }), []);
  return <TutorialScrollContext.Provider value={value}>
    <ScrollView {...props} ref={ref} scrollEventThrottle={props.scrollEventThrottle ?? 16} onScroll={(event) => {
      offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event);
    }} />
  </TutorialScrollContext.Provider>;
});
export function TutorialTarget({ id, onShow, onHide, ...props }: ViewProps & {
  id: string; onShow?: () => void; onHide?: () => void;
}) {
  const page = useContext(TutorialPageContext);
  const { register } = useTutorial();
  const scroll = useContext(TutorialScrollContext);
  const reduced = useReducedMotion();
  const ref = useRef<View>(null);
  const callbacks = useRef({ onShow, onHide });
  useLayoutEffect(() => { callbacks.current = { onShow, onHide }; }, [onShow, onHide]);
  useLayoutEffect(() => {
    if (!page) return;
    return register(page.owner + '/' + id, {
      measure: () => measure(ref.current),
      enter: () => callbacks.current.onShow?.(), leave: () => callbacks.current.onHide?.(),
      reveal: async () => {
        if (!scroll) return;
        const [target, viewport] = await Promise.all([measure(ref.current), measure(scroll.ref.current)]);
        if (!target || !viewport) return;
        if (target.y < viewport.y + 24 || target.y + target.height > viewport.y + viewport.height - 32) {
          const next = Math.max(0, scroll.offset.current + target.y - viewport.y - 36);
          scroll.ref.current?.scrollTo({ y: next, animated: !reduced });
          await wait(reduced ? 50 : 350);
        }
      },
    });
  }, [page, id, register, scroll, reduced]);
  return <View {...props} ref={ref} collapsable={false} />;
}
export function TutorialHelpButton({ beforeStart }: { beforeStart?: () => void }) {
  const { colors } = useTheme();
  const { startCurrent } = useTutorial();
  const onPress = useCallback(() => { beforeStart?.(); startCurrent(); }, [beforeStart, startCurrent]);
  return <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ayuda de esta pantalla"
    style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
      backgroundColor: pressed ? colors.primary + '20' : colors.primary + '10' })}>
    <Ionicons name="help-circle-outline" size={25} color={colors.text} />
  </Pressable>;
}
