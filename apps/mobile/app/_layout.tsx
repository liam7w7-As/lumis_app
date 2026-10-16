import { FeedbackDialogHost } from '../src/components/FeedbackDialog';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { BusinessProvider } from '../src/context/BusinessContext';
import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { MotionProvider, useReducedMotion } from '../src/context/MotionContext';
import { useStackMotion } from '../src/hooks/useStackMotion';

void SplashScreen.preventAutoHideAsync().catch(() => {
  // La vista de arranque puede haberse cerrado durante una recarga en desarrollo.
});

function ThemedNavigator() {
  const { dark, colors, ready } = useTheme();
  const screenOptions = useStackMotion();
  const reducedMotion = useReducedMotion();
  const [fontsLoaded, fontError] = useFonts({
    Poppins: require('../assets/fonts/Poppins-Regular.ttf'),
    'Poppins-Medium': require('../assets/fonts/Poppins-Medium.ttf'),
    'Poppins-SemiBold': require('../assets/fonts/Poppins-SemiBold.ttf'),
    'Poppins-Bold': require('../assets/fonts/Poppins-Bold.ttf'),
  });
  const navigationTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.error,
      },
    };
  }, [dark, colors]);

  useEffect(() => {
    if (!ready) return;
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {
      // El contenedor de React conserva el fondo si la vista nativa no está disponible.
    });
  }, [ready, colors.background]);

  // Evita mostrar el tema del sistema antes de recuperar la elección guardada.
  if (!ready || (!fontsLoaded && !fontError)) return null;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <View style={[styles.root, { backgroundColor: colors.background }]} onLayout={SplashScreen.hide}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <FeedbackDialogHost />
        <Stack screenOptions={screenOptions}>
          <Stack.Screen name="login" options={{ animation: reducedMotion ? 'none' : 'fade', animationDuration: 220 }} />
          <Stack.Screen name="dashboard" options={{ animation: reducedMotion ? 'none' : 'fade', animationDuration: 220 }} />
        </Stack>
      </View>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <MotionProvider>
        <AuthProvider>
          <BusinessProvider><ThemedNavigator /></BusinessProvider>
        </AuthProvider>
      </MotionProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
