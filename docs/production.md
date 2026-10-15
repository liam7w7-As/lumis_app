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

Pendiente antes de usar datos reales públicamente: el registro de cuentas está abierto y las cuentas comparten el mismo negocio. Hay que restringir el alta de usuarios al personal autorizado; CORS no resuelve ese acceso.
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
