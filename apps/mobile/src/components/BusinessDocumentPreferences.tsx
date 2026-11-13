import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";
import { useLicense } from "../context/LicenseContext";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../lib/api";
import { IS_NOVALED } from "../lib/backend";
import { feedback } from "../lib/feedback";
type Preference = "pdf_mostrar_marca" | "pdf_mostrar_procedencia";
export function BusinessDocumentPreferences() {
  const { token, user } = useAuth();
  const { business, applyBusiness } = useBusiness();
  const { license } = useLicense();
  const { colors } = useTheme();
  const [busy, setBusy] = useState<Preference | null>(null);
  if (IS_NOVALED) return null;
  const canChange = user?.role === "admin" && !!license && !license.readOnly;
  const change = async (key: Preference) => {
    if (!token || !business || !canChange || busy) return;
    setBusy(key);
    try {
      const result = await api.updateBusiness(
        { [key]: !(business[key] ?? true) },
        token,
      );
      await applyBusiness(result.business);
    } catch (error) {
      feedback.error(
        "No se pudo guardar la preferencia",
        error instanceof Error ? error.message : "Inténtalo de nuevo.",
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Documentos PDF</Text>
      <Text style={[styles.hint, { color: colors.muted }]}>
        Estas preferencias se guardan para toda la empresa y se aplican a
        cotizaciones, ventas y entregas.
      </Text>
      {(
        [
          { key: "pdf_mostrar_marca", label: "Mostrar marca" },
          { key: "pdf_mostrar_procedencia", label: "Mostrar procedencia" },
        ] as const
      ).map((option) => {
        const checked = business?.[option.key] ?? true;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="switch"
            accessibilityLabel={option.label}
            accessibilityState={{
              checked,
              disabled: !canChange || busy !== null,
            }}
            disabled={!canChange || busy !== null}
            onPress={() => {
              void change(option.key);
            }}
            style={styles.row}
          >
            <Text style={[styles.label, { color: colors.text }]}>
              {option.label}
            </Text>
            {busy === option.key ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Ionicons
                name={checked ? "checkbox" : "square-outline"}
                size={25}
                color={colors.text}
              />
            )}
          </Pressable>
        );
      })}
      <Text style={[styles.hint, { color: colors.muted }]}>
        {user?.role !== "admin"
          ? "El administrador de tu empresa puede cambiar estas preferencias."
          : license?.readOnly
            ? "Tu empresa está en modo consulta."
            : "Los cambios se guardan automáticamente. Las columnas sin datos se ocultan."}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginBottom: 20,
  },
  title: { fontFamily: "Poppins-SemiBold", fontSize: 16 },
  hint: { fontFamily: "Poppins", fontSize: 12, lineHeight: 20 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    minHeight: 45,
  },
  label: { fontFamily: "Poppins", fontSize: 14 },
});
