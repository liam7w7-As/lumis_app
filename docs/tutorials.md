# Guías de uso

Cada módulo muestra una bienvenida la primera vez que el usuario entra. El botón **?** permite retomar o repetir el recorrido; Configuración → Centro de ayuda reúne las once guías y su progreso. Cerrar una guía no bloquea el uso de la app.

Los pasos resaltan controles reales y desplazan la pantalla cuando hace falta. Algunos permiten tocar el control para continuar. Las demostraciones de swipe solo abren las acciones; nunca crean, borran, cobran ni guardan documentos. Los pasos exclusivos de administración se ocultan a vendedores, y las demostraciones de tarjetas se omiten en listas vacías. Se respeta la preferencia de movimiento reducido.

## Persistencia

La migración 020_user_tutorials crea el progreso por usuario, empresa, guía y versión. GET /api/tutorials y PUT /api/tutorials/:guide toman la identidad de la sesión autenticada. Dos vendedores de la misma empresa conservan avances independientes.

SecureStore mantiene una copia por cuenta y guía, con los cambios pendientes. Al volver a la app o pulsar sincronizar en Ayuda se consulta el servidor y se reintentan escrituras pendientes. Una respuesta antigua no reemplaza un paso que acaba de avanzar. La oferta automática espera una consulta inicial exitosa para evitar presentar como nueva una guía ya completada en otro dispositivo. La ayuda manual sigue disponible sin conexión.

La API local debe estar actualizada para probar la sincronización; la app no necesita dependencias nativas adicionales y funciona en Expo Go. Estos cambios no requieren generar una APK para las pruebas locales.

## Estructura

- apps/mobile/src/tutorials/catalog.ts: contenido, orden, permisos y destinos.
- TutorialProvider.tsx y progressStore.ts: sesión, reanudación y sincronización.
- TutorialElements.tsx y TutorialLayer.tsx: controles de ayuda, medidas, desplazamiento y presentación.
- apps/mobile/src/screens/HelpScreen.tsx: centro de ayuda.
- apps/api/src/routes/tutorials.ts: validación y persistencia autenticada.

Al cambiar identificadores de guías o versiones, mantener coordinadas las validaciones de la API y el catálogo móvil. Los pasos se guardan por identificador estable, no por posición numérica.

## Comprobaciones

Ejecutar npm run typecheck, npm run lint --workspace=apps/mobile y npm run test:mobile. Para la prueba de integración con MySQL local, establecer LUMIS_INTEGRATION_TEST=1 y ejecutar npm run test --workspace=apps/api; esta prueba crea y elimina únicamente su propia base temporal lumis_test_*.

En Expo Go comprobar la primera visita, cierre/reanudación desde ?, retorno desde formularios, ayuda desde Configuración, listas vacías, cuenta vendedora, ambos temas y movimiento reducido. La transparencia del logo conserva los píxeles del archivo original; quitar el contenedor blanco no elimina un fondo que ya venga incrustado en la imagen.
