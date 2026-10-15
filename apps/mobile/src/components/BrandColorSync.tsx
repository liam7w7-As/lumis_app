import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { useTheme } from '../theme/ThemeContext';

/**
 * Sincroniza el color de marca del negocio con el tema al iniciar sesión,
 * para que toda la app use el color elegido en Configuración.
 */
export function BrandColorSync() {
  const { token } = useAuth();
  const { setBrandColor } = useTheme();

  useEffect(() => {
    if (!token) return;
    let active = true;
    api
      .business(token)
      .then(({ business }) => {
        if (active && business?.color_primario) {
          void setBrandColor(business.color_primario);
        }
      })
      .catch(() => {
        // Sin conexión: se conserva el último color guardado en el dispositivo.
      });
    return () => {
      active = false;
    };
  }, [token, setBrandColor]);

  return null;
}
