import { useMemo } from 'react';
import { useReducedMotion } from '../context/MotionContext';
import { useTheme } from '../theme/ThemeContext';

/** La navegación anima en el hilo nativo; no se anima otra vez el contenido entero. */
export function useStackMotion() {
  const reducedMotion = useReducedMotion();
  const { colors } = useTheme();
  return useMemo(() => ({
    headerShown: false,
    animation: reducedMotion ? 'none' as const : 'fade_from_bottom' as const,
    animationDuration: 280,
    contentStyle: { backgroundColor: colors.background },
  }), [reducedMotion, colors.background]);
}
