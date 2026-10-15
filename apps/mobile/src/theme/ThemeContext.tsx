import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { contrastText, forBackground, forDarkBackground } from '../lib/brandColors';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  icon: string;
  primary: string;
  onPrimary: string;
  error: string;
  logoInk: string;
}

const lightColors: ThemeColors = {
  background: '#f6f7fc',
  surface: '#ffffff',
  text: '#14142b',
  muted: '#8a8fa3',
  border: '#c6ccda',
  icon: '#9aa1b5',
  primary: '#5b3df5',
  onPrimary: '#ffffff',
  error: '#c0392b',
  logoInk: '#111111',
};

const darkColors: ThemeColors = {
  background: '#12121a',
  surface: '#1d1d29',
  text: '#f2f3f7',
  muted: '#9aa0b5',
  border: '#3a3f55',
  icon: '#7c84a0',
  primary: '#7a5cff',
  onPrimary: '#ffffff',
  error: '#ff8585',
  logoInk: '#ffffff',
};

const MODE_KEY = 'lumis_theme_mode';
const BRAND_KEY = 'lumis_brand_color';

interface ThemeContextValue {
  mode: ThemeMode;
  dark: boolean;
  colors: ThemeColors;
  ready: boolean;
  /** Color de marca (#RRGGBB) elegido en Configuración; null = colores por defecto. */
  brandColor: string | null;
  setMode: (mode: ThemeMode) => Promise<void>;
  setBrandColor: (hex: string | null) => Promise<void>;
  toggle: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [brandColor, setBrandColorState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const modeWrite = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    (async () => {
      const [stored, storedBrand] = await Promise.all([
        SecureStore.getItemAsync(MODE_KEY).catch(() => null),
        SecureStore.getItemAsync(BRAND_KEY).catch(() => null),
      ]);
      if (!active) return;

      const next = stored === 'light' || stored === 'dark' ? stored : 'system';
      Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
      setModeState(next);
      if (storedBrand && /^#[0-9a-fA-F]{6}$/.test(storedBrand)) {
        setBrandColorState(storedBrand);
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    // Sincroniza también los diálogos y controles nativos. "Sistema" libera el override.
    Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
    setModeState(next);
    // Conserva el orden al cambiar varias veces rápidamente.
    modeWrite.current = modeWrite.current
      .then(() => SecureStore.setItemAsync(MODE_KEY, next))
      .catch(() => {
        // Sin almacenamiento: el cambio vive solo en memoria.
      });
    return modeWrite.current;
  }, []);

  const setBrandColor = useCallback(async (hex: string | null) => {
    setBrandColorState(hex);
    try {
      if (hex) {
        await SecureStore.setItemAsync(BRAND_KEY, hex);
      } else {
        await SecureStore.deleteItemAsync(BRAND_KEY);
      }
    } catch {
      // Sin almacenamiento: el cambio vive solo en memoria.
    }
  }, []);

  const dark = mode === 'dark' || (mode === 'system' && system === 'dark');

  const toggle = useCallback(() => {
    return setMode(dark ? 'light' : 'dark');
  }, [dark, setMode]);

  const colors = useMemo(() => {
    const base = dark ? darkColors : lightColors;
    if (!brandColor) return base;
    const primary = dark ? forDarkBackground(brandColor) : forBackground(brandColor);
    return { ...base, primary, onPrimary: contrastText(primary) };
  }, [dark, brandColor]);

  const value = useMemo(
    () => ({ mode, dark, colors, ready, brandColor, setMode, setBrandColor, toggle }),
    [mode, dark, colors, ready, brandColor, setMode, setBrandColor, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  }
  return ctx;
}
