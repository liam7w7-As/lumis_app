import { feedback } from '../lib/feedback';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useAnimatedValue,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../context/MotionContext';
import { BRAND } from '../config';
import { AnimatedInput } from '../components/AnimatedInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { Logo } from '../components/Logo';

export function AuthScreen() {
  const { login, register } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const progress = useAnimatedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) { progress.setValue(1); return; }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 440,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);

  const animFor = (index: number) => {
    const start = index * 0.07;
    const end = start + 0.45;
    return {
      opacity: progress.interpolate({
        inputRange: [start, end],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [start, end],
            outputRange: [12, 0],
            extrapolate: 'clamp',
          }),
        },
      ],
    };
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password, remember);
      } else {
        await register(username.trim(), name.trim(), password);
      }
      router.replace('/dashboard');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Inténtalo de nuevo en unos momentos.';
      setError(message);
      feedback.error(mode === 'login' ? 'No se pudo iniciar sesión' : 'No se pudo crear la cuenta', message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Animated.View style={animFor(0)}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>
                {mode === 'login' ? 'Bienvenido!' : 'Crear cuenta'}
              </Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                {mode === 'login' ? 'Inicia sesión para continuar' : 'Regístrate para continuar'}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Ionicons name="lock-closed-outline" size={24} color={colors.onPrimary} />
            </View>
          </View>
        </Animated.View>

        <Animated.View style={animFor(1)}>
          <AnimatedInput
            icon="person-outline"
            placeholder="Usuario"
            value={username}
            onChangeText={setUsername}
          />
        </Animated.View>

        {mode === 'register' && (
          <Animated.View style={animFor(2)}>
            <AnimatedInput
              icon="person-outline"
              placeholder="Nombre"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </Animated.View>
        )}

        <Animated.View style={animFor(3)}>
          <AnimatedInput
            icon="lock-closed-outline"
            placeholder="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            right={
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={colors.icon}
                />
              </Pressable>
            }
          />
        </Animated.View>

        {mode === 'login' && (
          <Animated.View style={animFor(4)}>
            <Pressable style={styles.remember} onPress={() => setRemember(!remember)}>
              <View
                style={[
                  styles.checkbox,
                  { borderColor: colors.muted },
                  remember && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                {remember && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
              </View>
              <Text style={[styles.rememberText, { color: colors.muted }]}>
                Recordar contraseña
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

        <Animated.View style={animFor(5)}>
          <View style={styles.buttonWrap}>
            <PrimaryButton
              title={mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              onPress={submit}
              loading={busy}
            />
          </View>
        </Animated.View>

        <Animated.View style={animFor(6)}>
          <Pressable onPress={switchMode}>
            <Text style={[styles.switch, { color: colors.primary }]}>
              {mode === 'login'
                ? '¿No tienes cuenta? Regístrate'
                : '¿Ya tienes cuenta? Inicia sesión'}
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      <Animated.View style={[styles.logoFloat, { bottom: 28 + insets.bottom }, animFor(7)]}>
        <Logo />
      </Animated.View>
      <Text style={[styles.version, { color: colors.muted, bottom: 10 + insets.bottom }]}>
        v{BRAND.version}
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 130,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Poppins',
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '500',
    marginTop: 4,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberText: {
    fontSize: 14,
    fontFamily: 'Poppins',
  },
  error: {
    textAlign: 'center',
    marginBottom: 12,
  },
  buttonWrap: {
    marginTop: 20,
  },
  switch: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
    fontFamily: 'Poppins',
  },
  logoFloat: {
    position: 'absolute',
    alignSelf: 'center',
  },
  version: {
    position: 'absolute',
    left: 16,
    fontSize: 12,
    fontFamily: 'Poppins',
  },
});
