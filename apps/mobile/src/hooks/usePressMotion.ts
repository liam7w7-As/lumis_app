import { useCallback, useEffect } from 'react';
import { Animated, useAnimatedValue } from 'react-native';
import { useReducedMotion } from '../context/MotionContext';

/** Respuesta breve y amortiguada, sin rebote ni bloqueo del render de las listas. */
export function usePressMotion(disabled = false) {
  const reducedMotion = useReducedMotion();
  const scale = useAnimatedValue(1);
  useEffect(() => {
    if (reducedMotion || disabled) { scale.stopAnimation(); scale.setValue(1); }
    return () => scale.stopAnimation();
  }, [reducedMotion, disabled, scale]);
  const animate = useCallback((to: number) => {
    scale.stopAnimation();
    if (reducedMotion || disabled) { scale.setValue(1); return; }
    Animated.spring(scale, {
      toValue: to, stiffness: 360, damping: 30, mass: 0.7,
      overshootClamping: true, useNativeDriver: true, isInteraction: false,
    }).start();
  }, [reducedMotion, disabled, scale]);
  return {
    scale,
    onPressIn: useCallback(() => animate(0.98), [animate]),
    onPressOut: useCallback(() => animate(1), [animate]),
  };
}
