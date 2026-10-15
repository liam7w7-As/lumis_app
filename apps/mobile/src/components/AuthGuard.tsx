import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';

function Loading() {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function useAuthState() {
  const { user, loading } = useAuth();
  const { ready } = useTheme();
  return { user, pending: !ready || loading };
}

/** Solo para usuarios con sesión (dashboard, quotes, pos, settings). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, pending } = useAuthState();
  if (pending) return <Loading />;
  if (!user) return <Redirect href="/login" />;
  return <>{children}</>;
}

/** Solo para usuarios sin sesión (login). */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, pending } = useAuthState();
  if (pending) return <Loading />;
  if (user) return <Redirect href="/dashboard" />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
