import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

const MotionContext = createContext(true);

/** Una sola suscripción para que todas las transiciones respeten el teléfono. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      changed = true;
      if (active) setReducedMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active && !changed) setReducedMotion(value);
    }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);
  return <MotionContext.Provider value={reducedMotion}>{children}</MotionContext.Provider>;
}

export function useReducedMotion() {
  return useContext(MotionContext);
}
