# Cambio del lector a GPT-6 Luna

Fecha: 2026-11-26. Implementación solicitada por el usuario: usar `gpt-6-luna` y explicar el escaneo de listas de unos 50 productos en Lumis, Novaled App y Novaled web. Se reutiliza la clave de Novaled ya autorizada en esta conversación; no se crean ni copian claves al repositorio. Sin despliegue ni compilación móvil en esta tarea.

## Etapa autorizada

Actualizar los modelos predeterminados de los lectores existentes y adaptar únicamente los parámetros incompatibles. Mantener contratos, revisión, matching, aislamiento por empresa, cuotas, almacenamiento y proveedores alternativos existentes. Verificar 50 filas y controles de errores. No se solicita un rediseño del escaneo.

Fuente: https://developers.openai.com/api/docs/models/gpt-6-luna (consultada 2026-11-26): imágenes, Responses, Chat Completions, salidas estructuradas y esfuerzo `none` compatibles.

## Evaluación de capacidades

| Guía | Aplicabilidad / soporte | Decisión y evidencia |
| --- | --- | --- |
| Model selection | Sí / sí | `gpt-6-luna`, elección explícita del usuario. Conservar `OPENAI_MODEL` y `OPENAI_SCAN_MODEL`. |
| Instruction file naming | No se cambia la interfaz / sí | Conservar instrucciones; configuración Laravel Boost solicitada por AGENTS existente. |
| Chat Completions → Responses | Lectura web / sí | Conservar Chat Completions en web: cambio acotado del modelo solicitado, adaptando `max_completion_tokens` y `reasoning_effort`; ambas apps ya usan Responses. Una migración adicional del transporte no aporta a la compatibilidad solicitada. |
| Streaming | No / sí | Se necesita JSON/texto completo antes de comparar y revisar; HTTP completo existente. |
| WebSocket mode | No / sí | Una sola lectura por foto, sin conversación ni herramientas. |
| Zero Data Retention | No se cambian requisitos / parcial | Conservar `store:false`; no equivale a ZDR. No cambiar configuración del proyecto OpenAI ni logs. |
| Data residency | No se cambia / desconocido | Conservar endpoint/proyecto existente; sin nueva región ni traslado. |
| Processing tiers | Sin cambio / sí | Standard existente, escaneo interactivo; sin Batch/Flex/Priority/Reserved nuevos. |
| Prompt cache keys | No / sí | Ninguna clave nueva en GPT-6; no existe una clave anterior que conservar. |
| Earlier extended cache retention | No / no aplica | Modelo GPT-6 y sin ampliación de retención. |
| Explicit cache breakpoints | No beneficio material / desconocido | Prompts cortos y foto variable en petición única; no aumentar almacenamiento ni complejidad. |
| Cache diagnostics | No / sí | No hay cadena ni respuesta anterior que comparar; no añadir persistencia de IDs. |
| State management | Sí / sí | Lectura independiente; conservar idempotencia y resultados en las bases locales del servidor. |
| Instruction persistence | No hay turnos / sí | Instrucciones completas en cada foto. |
| Encrypted reasoning items | No / sí | No se reproducen conversaciones ni tool calls. |
| Reasoning effort | Sí / sí | `none` para GPT-6 Luna mantiene extracción rápida sin razonamiento del lector anterior. Omitir en overrides antiguos. |
| Reasoning preservation | No / sí | Una petición independiente, sin historial. |
| Reasoning summaries/preambles | No / sí | La UI requiere filas o transcripción; no añadir texto conversacional. |
| Verbosity | No en JSON ni transcripción literal / sí | Conservar esquema y texto literal, sin nueva preferencia de estilo. |
| Maximum output tokens | Sí / sí | Conservar límites existentes en apps; verificar presupuesto de transcripción web. |
| Assistant message phases | No / sí | No hay replay de mensajes del asistente. |
| Context compaction | No / sí | Una foto, sin crecimiento de historial. |
| Structured outputs | Sí / sí | Conservar JSON estricto de apps y validación; web conserva texto transcrito antes del parser. |
| Tool choice | No / sí | El modelo solo lee, no accede al catálogo ni ejecuta escrituras. |
| Tool search/additional tools | No / sí | No hay catálogo de herramientas. |
| Parallel tool calls | No / sí | Sin herramientas del modelo; matching existente no se altera. |
| Programmatic tool calling | No / sí | No aporta a una extracción por foto. |
| Model-aligned tool interfaces | No / sí | No es un agente de programación. |

## Rutas y cobertura

| Ruta | Integración | Validación |
| --- | --- | --- |
| Lumis API `readQuoteImage` | Responses, JSON estricto, máximo 100 filas, 8 MB | 4 pruebas del lector: petición GPT-6, override 4o, 50 filas, fallos e incompletos. Integración real Express/MySQL aprobada con proveedor simulado; cupos, empresas, reintentos y confirmación. |
| Novaled App `leerCotizacion` | Responses, JSON estricto, máximo 100 filas, 8 MB | Parámetros de Luna/4o, 50 filas, matching e idempotencia: pruebas PHP afectadas aprobadas. |
| Novaled web `transcribir` y lector de precios compartido | Chat Completions; OpenAI predeterminado, configurable mediante VisionFactory; alternativa Gemini conservada | Parámetros compatibles, texto/JSON y errores: pruebas PHP afectadas aprobadas; no se rediseña parser web. |

## Resultado

Implementación del modelo terminada y validada en las rutas del escaneo. El usuario solicitó después añadir hojas y normalizar campos vacíos; esas mejoras están incluidas en la revisión. El 2026-11-26 autorizó commit, push y APK locales de ambas variantes, primero Lumis. La publicación de archivos Laravel en producción la realiza el usuario.

Comprobado:

- Lint y typecheck del monorepo aprobados; build de producción de la API aprobado.
- API: 11 pruebas unitarias aprobadas, 11 integraciones opcionales omitidas en la ejecución estándar; la integración del escaneo con base MySQL aislada se ejecutó por separado y aprobó.
- Móvil: 272 pruebas de la batería completa aprobadas antes de publicar; incluyen varias hojas, campos vacíos, sesiones, reintentos y precio cero. Las 4 pruebas unitarias del lector de la API también aprobaron.
- PHP afectado: 31 pruebas y 240 aserciones aprobadas; Pint aprobado.
- Suite completa Laravel ejecutada: 713 pruebas, 708 aprobadas, 4 fallos y 1 error, 8340 aserciones, 220.323 s. Los cinco casos ajenos al escaneo son `CompraTest::test_anular_abono_revierte_montos_y_pdf_ok`, `CompraTest::test_nota_compra_usa_plantilla_comercial_con_costos_y_saldos` (plantilla de PDF llama `getAttribute()` sobre `stdClass`) y tres pruebas de `InventarioUbicacionTest` (validación del depósito y cantidades de ubicaciones). Esos controladores/plantillas no se modificaron en esta tarea. No se afirma que la suite completa esté aprobada ni se amplía el alcance para corregir compras/inventario.
- Tres peticiones reales con la clave existente contra `gpt-6-luna`, usando una imagen sintética impresa de 50 productos (1500×2350): Lumis extrajo 50/50 en 10.615 s sin diferencias de código, cantidad, precio ni número de modelo; Novaled App extrajo 50/50 en 9.37 s sin diferencias de código, cantidad o precio; Novaled web transcribió los 50 códigos en 7.19 s. Esto no demuestra exactitud universal sobre fotos reales ni evalúa el parser web posterior.
- ZIP manual de Novaled preparado y hashes de sus 3 archivos runtime verificados. Sin migraciones nuevas; conservar claves y ajustar modelos/driver de producción si existen overrides.

## Mejoras posteriores autorizadas

- Añadir hojas conserva las ediciones y el identificador de lectura de cada foto; confirma todas juntas, con límite de 200 artículos en las apps. La sesión se conserva mientras la pantalla de cotización siga montada, sin prometer persistencia tras cerrar la app.
- Los datos ausentes, `null` y `undefined` se muestran vacíos. Valores detectados, decimales y precio cero explícito se conservan. Se mantiene la prioridad del catálogo para productos seleccionados.
- Novaled web: 11 pruebas enfocadas aprobadas y Vite build aprobado; su batería JS general registra un fallo ajeno al escaneo en reportes.
- Paquete Laravel/web más reciente: `Novaled-servidor-2026-11-26-escaneo-campos-vacios.zip`, con los 3 archivos runtime del modelo, componente, utilidad y todo `public/build/`. Sin claves ni migraciones nuevas.
