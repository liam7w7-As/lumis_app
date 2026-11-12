# Panel de administración de Lumis

El panel React vive en `apps/admin`, dentro del mismo monorepo. Se publica en **https://admin-lumis.novaledbolivia.com**. La API y MySQL siguen en **https://lumis.novaledbolivia.com**. Novaled conserva su integración independiente.

El servidor del panel entrega React y reenvía solo `/api/platform/*` a la API. La sesión usa una cookie HttpOnly, Secure y SameSite=Strict en el subdominio del panel. No se guardan tokens en localStorage ni credenciales MySQL en React.

## 1. Desplegar primero la API

Sube los cambios a GitHub cuando estés listo y vuelve a desplegar la aplicación Node.js existente de Lumis. Sus ajustes siguen siendo:

| Campo | Valor |
| --- | --- |
| Directorio raíz | `apps/api` |
| Rama | `main` |
| Node | `22.x` |
| Gestor | `npm` |
| Compilación | `npm run build` |
| Salida | `dist` |
| Archivo de entrada | `dist/index.js` |

Conserva `JWT_SECRET`, `DB_*` y el `UPLOADS_DIR` persistente. Añade en **Variables de entorno de la API**:

```dotenv
NODE_ENV=production
ADMIN_ORIGIN=https://admin-lumis.novaledbolivia.com
ADMIN_BOOTSTRAP_USERNAME=tu_usuario_de_administracion
ADMIN_BOOTSTRAP_PASSWORD=tu_contrasena_privada_de_12_a_72_caracteres
ADMIN_BOOTSTRAP_NAME=Tu nombre
```

Elige tu contraseña privada; estos valores son indicaciones. No la envíes por chat ni la guardes en Git. Opcionalmente añade `LUMIS_SUPPORT_URL` con un enlace HTTPS real a tu contacto o WhatsApp comercial.

Al iniciar, la API aplica **021_platform_licenses** y crea el primer administrador si todavía no existe. Las cuentas de clientes de la app no dan acceso al panel. No se necesita otra base de datos.

**Efecto del despliegue:** las empresas existentes comienzan en Gratis. Sus documentos actuales cuentan para los cupos totales. No se borran documentos ni cuentas. Si ya consumieron cinco documentos de un tipo, necesitan un plan de pago para crear más de ese tipo. Los colores anteriores se conservan, pero cambiarlos requiere Pro o Plus.

Revisa `/health` y el mensaje `Administrador del panel creado` en los registros. Después del primer acceso, **retira las tres variables `ADMIN_BOOTSTRAP_*` de hPanel y reinicia**. Esto no elimina la cuenta. Si permanecen, no recrean ni cambian la contraseña existente.

## 2. Crear la aplicación del panel en Hostinger

1. Ve a **Sitios web → Crear sitio / Añadir sitio web → Web App / Aplicación Node.js**.
2. Usa **admin-lumis.novaledbolivia.com**. Si el formulario separa dominio y subdominio, introduce `admin-lumis` bajo `novaledbolivia.com`. Si tu DNS es externo, crea el registro que indique hPanel.
3. Selecciona **Importar repositorio Git** y el mismo repositorio **lumis_app**. No crees otra copia.
4. Configura:

| Campo | Valor |
| --- | --- |
| Preajuste | **Other** |
| Rama | `main` |
| Node | `22.x`, actualizado (al menos 22.12) |
| Directorio raíz | `apps/admin` |
| Gestor | `npm` |
| Compilación | `npm run build` |
| Directorio de salida | `dist` |
| Archivo de entrada | `dist/server.cjs` |

Aunque la interfaz usa React/Vite, **Other** permite ejecutar también el servidor Node con su proxy. Las rutas son relativas a `apps/admin`: no escribas `apps/admin/dist/server.cjs` en el archivo de entrada. Si no aparece `build`, verifica la raíz y que el commit contenga `apps/admin/package.json`.

Las herramientas necesarias para compilar están incluidas en las dependencias de producción para admitir instalaciones con `NODE_ENV=production`. La salida `dist` ejecuta su servidor solo con módulos integrados de Node.

5. En **Variables de entorno DEL PANEL**, añade:

```dotenv
NODE_ENV=production
LUMIS_API_URL=https://lumis.novaledbolivia.com
PUBLIC_ORIGIN=https://admin-lumis.novaledbolivia.com
```

El panel no necesita `DB_*`, `JWT_SECRET`, `UPLOADS_DIR` ni `ADMIN_BOOTSTRAP_*`. Hostinger asigna `PORT`; no fijes un puerto manualmente en producción.

6. Despliega, espera a que HTTPS esté activo y abre **https://admin-lumis.novaledbolivia.com**. Inicia sesión con el administrador del paso 1.
7. En **Empresas → Administrar → Gestionar licencia**, selecciona plan, estado, vencimiento y motivo. Cada cambio queda registrado en **Actividad**. El vencimiento incluye todo el día elegido en Bolivia.

## 3. Comprobar el despliegue

- El panel debe mostrar las empresas y usuarios reales de la API.
- `/health` del panel comprueba el servidor web. Iniciar sesión comprueba también API, sesión y MySQL.
- Una empresa vencida o suspendida conserva consulta y exportación, pero la API impide crear o modificar datos.
- La nueva app muestra **Mi plan Lumis** en Configuración y revisa la licencia al abrir, al volver al primer plano y cada 30 segundos. Las APK anteriores también quedan sujetas a los límites de la API. Para ver la pantalla nueva habrá que actualizar la APK de Lumis; este trabajo no la genera automáticamente.
- Los usuarios deshabilitados no pueden iniciar sesión. No se permite deshabilitar al último administrador de la empresa.

Si una empresa tiene más cuentas que su plan, se conservan todas: los cupos de escritura priorizan administradores y luego el orden de registro. Las cuentas habilitadas que excedan el cupo quedan en consulta. Puedes deshabilitar las sobrantes o ampliar el plan.

## Reglas de planes

| Plan | Precio mensual | Documentos | Escaneos | Usuarios | Editar guardados / paleta |
| --- | ---: | --- | --- | --- | --- |
| Gratis | Bs. 0 | 5 cotizaciones + 5 ventas + 5 entregas, totales | 5 totales | 2 | No / No |
| Pro | Bs. 95 | Sin límite | 50 al mes | 6 | Sí / Sí |
| Plus | Bs. 170 | Sin límite | 200 al mes | Sin límite | Sí / Sí |

Borrar o cambiar de plan no devuelve cupos. Duplicar documentos y convertir una cotización en venta consume el cupo de un documento nuevo. Una entrega consume cupo solo la primera vez. En Gratis se permiten cobros, entregas dentro de cupo y opciones de exportación mientras la licencia esté activa. Modificar el contenido de documentos guardados requiere Pro o Plus.

Los meses del escáner son meses calendario de Bolivia. El escáner aún no está implementado: se indica como no disponible y no se inventa consumo.

La activación y renovación son manuales. El valor mensual representa los precios de las licencias activas; **no representa dinero cobrado**. Este alcance no incluye pasarela de pagos ni facturación automática.

## Desarrollo y pruebas

API: `npm run dev:api`. Panel: `npm run dev:admin`, en `http://127.0.0.1:5173`. La API local necesita `ADMIN_ORIGIN=http://127.0.0.1:5173`. Configura la cuenta inicial local con variables privadas.

```powershell
npm run typecheck
npm run lint
npm run test:mobile
npm run build:admin
npm run test --workspace=apps/admin
# Solo MySQL local: las pruebas crean y eliminan bases temporales.
$env:LUMIS_INTEGRATION_TEST='1'
npm run test --workspace=apps/api
npm run build --workspace=apps/api
npm run test:deployment --workspace=apps/api
```

Referencia verificada: [Desplegar Node.js en Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/).
