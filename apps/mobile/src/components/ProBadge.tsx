import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../theme/ThemeContext";
export function ProBadge() {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel="Requiere Pro o Plus"
      style={[
        styles.badge,
        {
          backgroundColor: colors.text + "0C",
          borderColor: colors.text + "25",
        },
      ]}
    >
      <Ionicons name="lock-closed-outline" size={12} color={colors.text} />
      <Text style={[styles.text, { color: colors.text }]}>Pro</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: "center",
  },
  text: { fontFamily: "Poppins-SemiBold", fontSize: 10 },
});
