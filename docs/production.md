# Publicar Lumis: Hostinger y Android

Destino de la API: `https://lumis.novaledbolivia.com`.
Hostinger ejecuta `apps/api`; la app de `apps/mobile` se compila con EAS y se instala en Android.

## 1. Configuración de Hostinger

Con `apps/api` como directorio raíz, usa estas rutas relativas a ese paquete:

| Campo | Valor |
| --- | --- |
| Preajuste del marco | `Other` |
| Rama | `main`, con los cambios que quieras publicar |
| Versión de Node | `22.x` |
| Directorio raíz | `apps/api` |
| Comando de compilación | `npm run build` |
| Gestor de paquetes | `npm` |
| Directorio de salida | `dist` |
| Archivo de entrada | `dist/index.js` |

Los `package.json` de la raíz y de la API incluyen `build`, por lo que el comando está disponible aunque el selector consulte la raíz del repositorio.
La configuración de la tabla corresponde al directorio raíz `apps/api` confirmado en hPanel. No añadas ese prefijo otra vez a las rutas de salida y entrada.
El build compila la API e instala sus dependencias de producción dentro de `dist/node_modules`, usando el lockfile independiente `apps/api/package-lock.json`.
También copia las migraciones a `dist/migrations`. El resultado puede ejecutarse fuera del monorepo sin depender del `node_modules` de la raíz.
Cuando cambien las dependencias de la API, actualiza también su lockfile con `npm install --package-lock-only --prefix apps/api --workspaces=false --include=dev --ignore-scripts`, ejecutado desde la raíz del repositorio.
Para comprobar el paquete aislado: `npm run build` y `npm run test:deployment --workspace=apps/api`.
Hostinger permite indicar manualmente la salida y el archivo de entrada con el preajuste Other. [Documentación de Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/).

En **Variables de entorno → Añadir**, configura:

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `NPM_CONFIG_INCLUDE` | `dev` |
| `JWT_SECRET` | Un secreto nuevo y aleatorio; genera 32 bytes o más |
| `JWT_EXPIRES_IN` | `7d` |
| `DB_HOST` | El host MySQL indicado por Hostinger; normalmente `localhost` |
| `DB_PORT` | `3306`, salvo que Hostinger indique otro |
| `DB_NAME` | Nombre completo de la base creada, incluido el prefijo |
| `DB_USER` | Usuario completo asignado a esa base, incluido el prefijo |
| `DB_PASSWORD` | La contraseña de ese usuario MySQL |
| `CORS_ORIGIN` | `https://lumis.novaledbolivia.com` |

`NPM_CONFIG_INCLUDE=dev` mantiene disponibles los tipos que necesita TypeScript durante la compilación, incluso con `NODE_ENV=production`. [Configuración de npm](https://docs.npmjs.com/cli/v11/using-npm/config/#include).
La app nativa no está sometida a CORS del navegador. Si se publica una versión web en otro dominio, habrá que ajustar los orígenes permitidos.
Conserva el `PORT` asignado por Hostinger: la API ya lo lee del entorno.
Introduce las credenciales directamente en Hostinger, sin guardarlas en GitHub.
Los valores de MySQL se obtienen en **Sitios web → Administrar → Bases de datos → Administración**. [Conexión MySQL de Hostinger](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/).

Para generar el secreto JWT en tu terminal local:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Con los valores completos, continúa el despliegue y revisa el registro de compilación y arranque.
El servidor aplica automáticamente las migraciones SQL al arrancar. Si la base ya tiene información, respáldala antes de desplegar.
Conserva la carpeta `dist` completa, incluidos `node_modules`, `migrations`, `package.json` y `package-lock.json`.
No ejecutes el script `seed` en producción: introduce datos de ejemplo.

## 2. Archivos persistentes y acceso

Antes de guardar comprobantes, logos o sellos reales, establece `UPLOADS_DIR` con una ruta absoluta persistente y escribible, fuera de `hbuilds` y `public_html`.
La ubicación concreta depende del usuario y de los permisos de tu hosting; compruébala en hPanel antes de asignarla.
El valor por defecto guarda archivos dentro del directorio de ejecución. Hostinger reemplaza los directorios de despliegue y puede borrar esas subidas en una actualización. [Estructura de despliegues](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/).
Comprueba la persistencia subiendo un archivo de prueba y verificándolo después de volver a desplegar. Incluye esa carpeta en las copias de seguridad.

El registro público crea una empresa independiente con su administrador. Los vendedores de una empresa se crean desde Configuración por su administrador; la API verifica empresa y permisos también en archivos y operaciones por ID.
También queda revisar las alertas de dependencias detectadas en la revisión, con versiones compatibles con Expo SDK 57.

## 3. Comprobar la API

Abre [el endpoint de salud](https://lumis.novaledbolivia.com/health). Debe responder JSON con `ok: true` y `service: "lumis-api"`.
La raíz `/` no tiene una página configurada y puede responder `Cannot GET /` aunque la API esté funcionando.
`/health` confirma que el servidor atiende; no hace una consulta nueva a MySQL. Comprueba además el inicio de sesión y, con una sesión válida, `GET /api/dashboard?period=semana`.

Si falla el despliegue:

- `Missing script: build` o el comando no aparece: comprueba que el commit de GitHub incluye el script `build` en el `package.json` de la raíz y vuelve a cargar la selección del repositorio.
- Errores de tipos o `tsc`: revisa que se instalaron las dependencias de desarrollo antes de compilar.
- `Access denied`: revisa usuario, contraseña y asignación de la base MySQL.
- `Cannot find module 'cors'` u otra dependencia: verifica que el despliegue use el build actualizado y que incluya `dist/node_modules`; vuelve a desplegar el último commit.
- `ENOENT ... migrations`: falta la carpeta `dist/migrations` que genera el build.
- `Cannot find module ... index.js`: revisa la ruta del archivo de entrada y la salida real del build en el registro.
- Error al crear la carpeta de subidas: revisa la ruta y los permisos de `UPLOADS_DIR`.

## 4. Primera APK Android

Ejecuta estos comandos desde `apps/mobile`. El proyecto usa Expo SDK 57 y npm; conserva el `eas.json` existente.
Revisa primero `android.package` en `app.json`: actualmente es `com.lumis.app`. Decide el identificador definitivo antes de crear la ficha de Google Play.

```powershell
Set-Location C:\Users\UnseR\Desktop\lumi\Lumis\apps\mobile
npx eas-cli@latest login
npx eas-cli@latest init
```

Selecciona tu cuenta o equipo Expo y vincula el proyecto correcto. `init` escribe el identificador del proyecto en la configuración; guarda ese cambio en el repositorio. [Preparar EAS Build](https://docs.expo.dev/build/setup/).

Cuando la API responda correctamente, configura la URL en ambos entornos de EAS:

```powershell
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://lumis.novaledbolivia.com --environment preview --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://lumis.novaledbolivia.com --environment production --visibility plaintext
npx eas-cli@latest env:list --environment preview
npx eas-cli@latest env:list --environment production
```

La URL no lleva `/api` ni una barra final: el cliente agrega las rutas. Es una variable pública incorporada a la app; las claves JWT y MySQL pertenecen únicamente al servidor. [Variables de EAS](https://docs.expo.dev/eas/environment-variables/manage/).

```powershell
npx eas-cli@latest build --platform android --profile preview
```

El perfil `preview` genera una APK instalable. Sigue el flujo de firma de EAS y conserva acceso a las credenciales del proyecto. [APK con EAS](https://docs.expo.dev/build-reference/apk/).
Instala la APK en un teléfono y comprueba: inicio de sesión, temas claro/oscuro/sistema y reinicio, estadísticas por período, guardar una cotización, abrir su vista previa, exportar/compartir PDF y registrar una venta.
Esta prueba debe funcionar con el servidor de desarrollo de la computadora apagado.

## 5. Google Play

Después de validar la APK:

```powershell
npx eas-cli@latest build --platform android --profile production
```

Ese perfil genera el AAB para Google Play. Crea la app en Play Console, completa la ficha y los requisitos que muestre tu cuenta y realiza la primera carga manual, preferentemente en pruebas internas.
Las cargas posteriores pueden automatizarse con EAS Submit tras configurar la cuenta de servicio de Google. La carga y la publicación al público son pasos distintos. [Publicación Android con EAS](https://docs.expo.dev/submit/android/).

## Validación local realizada

API compilada; lint y typecheck de la app y typecheck desde la raíz aprobados; seis pruebas del dashboard aprobadas; endpoint comprobado contra MySQL local con autenticación y validación de períodos; bundles Android e iOS exportados correctamente.
El dashboard usa agregados reales de la base y períodos en horario de Bolivia. Una base nueva mostrará ceros hasta registrar operaciones.
La APK/AAB nativa, la validación en un teléfono y el despliegue remoto quedan por ejecutar con la cuenta y configuración de producción.
Los cambios locales de esta revisión deben llegar a la rama conectada de GitHub para que Hostinger los incluya.

## Actualización 1.1: empresas, vendedores y sincronización

1. En hPanel, exporta una copia de la base MySQL y respalda los archivos actuales antes de desplegar esta actualización.
2. Comprueba que `UPLOADS_DIR` apunta a una carpeta absoluta persistente fuera de `hbuilds` y de `public_html`. Si antes se usó la carpeta predeterminada, copia sus archivos a esa ubicación conservando los nombres.
3. Despliega el nuevo commit de `main` con la configuración de la sección 1. Al arrancar, la API aplica `019_business_tenants` una vez.
4. Todas las cuentas y datos anteriores permanecen en la empresa original. La cuenta más antigua (menor ID) queda como administradora; las demás como vendedores. No se borran cotizaciones, ventas, catálogo ni configuración.
5. Instala el APK 1.1 en ambos dispositivos e inicia sesión. Los archivos ahora requieren autenticación; los APK anteriores deben actualizarse para mostrar los logos y comprobantes protegidos.
6. Desde Configuración → Usuarios de la empresa → Agregar vendedor, el administrador registra nombre, usuario y contraseña. Ese vendedor entra a la misma empresa. El registro de la pantalla de login crea una empresa independiente con su propio administrador.

El administrador edita los datos, logo, sello, color, sucursales y agentes de la empresa. Los vendedores comparten catálogo, clientes, ventas y cotizaciones, y pueden cambiar la apariencia de su propia cuenta. La API filtra todos esos recursos por empresa y verifica permisos también para archivos y operaciones por ID.

Los campos de Configuración se editan directamente y se guardan al salir del input; el teclado mantiene visible el campo. Logo y sello se guardan al subirlos. Nombre, color, moneda y logo se actualizan al iniciar sesión, al volver a la app y cada 30 segundos mientras está activa. Para refrescar el formulario de Configuración, vuelve a abrirlo. La preferencia claro/oscuro/sistema se comparte entre dispositivos de la misma cuenta.

El navbar y los PDF usan la marca de la empresa. El login recuerda en ese dispositivo el nombre y logo de la última empresa; antes del primer inicio de sesión muestra Lumis. El icono instalado y el splash pertenecen a la aplicación y no cambian con el logo de cada empresa.

Los PDF solo usan el logo y sello subidos por la empresa; se retiraron los respaldos de firma y sello de la plantilla anterior para no mostrar la marca de otra empresa. Si usabas ese sello, súbelo desde Configuración.

Los PNG nuevos se conservan sin convertirlos a JPEG; los soportes de logo son blancos para mantenerlos legibles en oscuro. Si un archivo anterior ya quedó negro al convertirlo, vuelve a subir el PNG original.

En el detalle de cotizaciones en borrador y ventas activas, desliza un producto para Editar, Eliminar, Duplicar o Mover. Mover abre una lista con flechas para elegir el orden; «Guardar orden» lo conserva en el servidor y en el PDF. En las listas, el swipe permite abrir la vista previa de cotización o nota de venta sin marcar una entrega.

### Comprobaciones de esta versión

- `npm run typecheck` y `npm run lint --workspace=apps/mobile`.
- `npm run test --workspace=apps/api`.
- La prueba de integración de empresas está desactivada por defecto. Para ejecutarla con MySQL **local**, establece `LUMIS_INTEGRATION_TEST=1`. Crea y elimina únicamente una base temporal `lumis_test_...`; rechaza hosts remotos.
- `npm run build` y `npm run test:deployment --workspace=apps/api`.
- `npx expo export --platform android` y `npx expo-doctor` desde `apps/mobile`.

El perfil preview conserva las cuatro arquitecturas para teléfonos y emuladores. Se activaron compresión de bibliotecas nativas, R8 y eliminación de recursos sin uso mediante expo-build-properties. La compresión reduce la descarga del APK; el espacio instalado es una medición diferente. El perfil production sigue generando AAB para Google Play. [Opciones oficiales de Expo 57](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/).


## APK reducido para celulares

El perfil `apk` genera una APK de producción para procesadores ARM de 32 y 64 bits.
Conserva compatibilidad con teléfonos antiguos de 32 bits y modernos de 64 bits; excluye las
copias Intel x86/x86_64 del binario. El emulador usado en las pruebas declara soporte ARM,
aunque para emuladores que solo admiten Intel se debe usar `preview`.

Desde `apps/mobile`:

```powershell
npx eas-cli@latest build --platform android --profile apk
```

La URL pública queda fijada a `https://lumis.novaledbolivia.com` en ese perfil para evitar
incorporar la dirección de desarrollo de la computadora. La firma y el identificador
`com.lumis.app` permanecen iguales, y EAS incrementa `versionCode` automáticamente.

- `apk`: APK reducida, ARM de 32/64 bits, entorno production.
- `preview`: APK universal con cuatro arquitecturas para pruebas en teléfonos y emuladores.
- `production`: AAB para Google Play; Google entrega a cada dispositivo su arquitectura.

Siguen activados R8, eliminación de recursos sin uso y compresión de bibliotecas nativas.
El bundle de Hermes permanece sin compresión adicional para conservar el arranque rápido.
Los logos están redimensionados y PDF.js incluye únicamente motor, worker y visor local,
sin mapas de código ni conexión a un CDN.

La auditoría de los APK anteriores encontró 109.933.802 bytes en la primera APK y
44.618.135 bytes tras activar las optimizaciones de release. En esta última, las
bibliotecas Intel ocupaban 15.402.748 bytes comprimidos. Esa cantidad permite estimar
el ahorro de quitarlas; el peso final debe medirse después de compilar, porque esta
versión también incorpora el visor PDF.js y los cambios recientes.

El contenido de `apps/api` no forma parte de la aplicación Android. Las mejoras de la API
deben desplegarse también en Hostinger antes de probar en producción el guardado de fechas
y el nuevo manejo de archivos.

La versión 1.2 usa importaciones directas de Ionicons para no empaquetar las otras 18 familias de iconos que no utiliza. El export Android pasó de 60 a 42 recursos. El visor PDF muestra y comparte exactamente el mismo archivo generado; las fechas de cotizaciones y ventas se editan desde un calendario y se guardan en la API.
