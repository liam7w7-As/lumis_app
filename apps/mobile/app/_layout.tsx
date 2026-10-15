import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BrandColorSync } from '../src/components/BrandColorSync';
import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrandColorSync />
        <ThemedStatusBar />
        <Stack
          screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}