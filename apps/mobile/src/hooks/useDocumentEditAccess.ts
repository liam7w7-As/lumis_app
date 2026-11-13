import { router } from "expo-router";
import { useLicense } from "../context/LicenseContext";
import { documentEditAccess } from "../lib/documentAccess";
import { IS_NOVALED } from "../lib/backend";
import { feedback } from "../lib/feedback";

export function useDocumentEditAccess() {
  const { license, refresh } = useLicense();
  const access = documentEditAccess(license, IS_NOVALED);
  const requestEdit = () => {
    if (access === "allowed") return true;
    if (access === "checking") {
      feedback.info(
        "Comprobando tu plan",
        "Necesitamos comprobar tu licencia para editar este documento.",
        [
          { text: "Cerrar", style: "cancel" },
          { text: "Reintentar", onPress: refresh },
        ],
      );
    } else {
      feedback.info(
        access === "pro"
          ? "Edición con Pro y Plus"
          : "Documento en modo consulta",
        access === "pro"
          ? "Modificar documentos guardados está incluido en Pro y Plus. Puedes seguir viendo y compartiendo este PDF."
          : "Puedes consultar y exportar tus documentos. Revisa tu licencia o el cupo de tu usuario para volver a editar.",
        [
          { text: "Ahora no", style: "cancel" },
          {
            text: access === "pro" ? "Ver planes" : "Ver mi licencia",
            onPress: () => router.push("/license"),
          },
        ],
      );
    }
    return false;
  };
  return {
    access,
    canEdit: access === "allowed",
    proLocked: access === "pro",
    requestEdit,
  };
}
