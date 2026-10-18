# Sistemas: handoff

**En producción desde el 17/10/2026**: commit `7ed38d6`. Se desplegó con `vercel --prod` desde el worktree `.claude/worktrees/sistemas`, porque el push a `main` no disparó un despliegue.

## Qué hay

- **Botón «Reportar»** en el header, en el menú del avatar y en ⌘K.
  - Saca la captura con `@zumer/snapdom` 3.3.4 y después abre el panel.
  - El editor de marcas tiene lápiz, recuadro y tapar.
  - Se elige Error, Corrección o Mejora; si es Error, aparece «¿Te frena el trabajo?».
- **Mis reportes** en `/sistemas/mis-reportes`, para todos.
- **Bandeja de revisión** en `/sistemas/revision`.
  - Es solo para quien tenga el módulo `sistemas` en «editar», con `exigeExplicito`. Hoy son js@ y jpm@; los dio la migración `20261022000001`.
  - Tiene el botón «Copiar para Claude Code».
- **Avisos**:
  - en la campanita;
  - en Slack #sistemas, solo para los errores que frenan el trabajo (`SLACK_WEBHOOK_SISTEMAS`, cargada en Vercel Production el 17/10).
- **Recorrido obligatorio** `sistemas-reportar` v1, para todos al cargar el dashboard.
  - Son 5 pasos sin reporte de práctica.
  - Queda registrado en `recorridos_vistos`.
  - Se posterga en `/p/`, `/fichadas/escanear` y `/organigrama/imprimir`, y no le sale a la cuenta del kiosco.

Diseño y decisiones: `propuesta.md` (§5 es lo que decidió JS). Endpoints, tipos y reparto de archivos: `contrato.md`. Maqueta: `maqueta.html` (https://claude.ai/artifact/TnCcT8Kchr8hVynzNAGMGK).

## Dónde está cada cosa

| Qué | Archivos |
|---|---|
| Tipos, textos y constantes compartidas (estados, motivos, textos del recorrido) | `src/lib/sistemas/tipos.ts` |
| Botón, panel y editor de marcas | `src/components/sistemas/{boton-reportar,reportar-sistemas,editor-marcas,visor-imagenes,comun,disparar}.tsx` y `src/components/layout/header.tsx` |
| Captura de pantalla y foto de los mapas y el 3D | `src/lib/sistemas/{captura-pantalla,lienzos-webgl,imagen}.ts`, más el registro en `mini-mapa.tsx`, `ciudad-armada-mapa.tsx` y `escena.ts` |
| Errores, pedidos fallidos y pantallas visitadas | `src/instrumentation-client.ts`, `src/lib/sistemas/{captura-cliente,contexto-cliente}.ts` |
| Mis reportes y bandeja | `src/app/(dashboard)/sistemas/**`, `src/components/sistemas/mis-reportes.tsx`, `src/components/sistemas/revision/{bandeja,detalle,modales}.tsx`, `src/hooks/use-sistemas.ts` |
| API | `src/app/api/sistemas/**`, `src/lib/sistemas/{servidor,validar,contexto,rutas,prompt-claude}.ts` |
| Permisos y menú | `src/lib/auth/acceso.ts` (módulo `sistemas`, `RUTAS_EXACTAS_DE_TODOS`), `src/lib/constants/navigation.ts` |
| Avisos y Slack | `src/lib/alertas/{servicio,slack}.ts`, `src/components/alertas/presentacion.tsx` |
| Recorrido obligatorio | `src/lib/recorridos/{registro,reglas,servidor,driver}.ts`, `src/components/recorridos/recorrido-obligatorio.tsx`, `src/hooks/use-recorrido-obligatorio.ts`, `src/app/(dashboard)/layout.tsx` |

`contrato.md` tiene el detalle de cada endpoint (entrada y respuesta), las RPC y el canal de eventos entre el recorrido y el panel.

## Tareas habituales

- **Darle la bandeja a otra persona:** desde Configuración → Usuarios, el módulo «Sistemas · Revisión» en «editar». No viene incluido en el rol admin (`exigeExplicito`) y el cambio queda registrado en la auditoría como `permiso_sistemas`.
- **Volver a mostrarle el recorrido a todos:** subir `version` en `RECORRIDO` de `tipos.ts`. Los textos de los pasos están en `PASOS_RECORRIDO`, en el mismo archivo.
- **Volver a mostrárselo a una sola persona:** borrar su fila en `recorridos_vistos` (clave `sistemas-reportar`).
- **Sumar otro recorrido obligatorio** (por ejemplo, una novedad): agregarlo a `RECORRIDOS` en `src/lib/recorridos/registro.ts` con su clave, versión y regla `para`. Sale uno por carga, en el orden del registro.
- **Cambiar el canal de Slack:** reemplazar `SLACK_WEBHOOK_SISTEMAS` en Vercel y volver a desplegar. Sin la variable no se manda nada a Slack; no hay canal de reserva.
- **Ver quién no hizo el recorrido:** `select nombre, apellido from user_profiles p where activo and not exists (select 1 from recorridos_vistos v where v.usuario_id = p.id and v.clave = 'sistemas-reportar' and v.version = 1)`.

## Cosas a tener en cuenta

- **Privacidad.** Quien reporta solo ve sus propios reportes. Los mensajes de los revisores se firman «Sistemas», y `autor_id` no se puede leer con la sesión del usuario. Las alertas llevan títulos genéricos, porque cualquier admin ve todas las alertas.
- **Toda escritura pasa por RPC** `SECURITY DEFINER` con estos topes:
  - 20 reportes por día;
  - 120 subidas cada 24 h;
  - 30 mensajes por hora del lado del usuario.

  La RPC valida que las imágenes sean del propio usuario y que la ruta y los SHA tengan un formato sano.
- **Duplicados:** apuntan al original. Al resolver el original, sus creadores reciben aviso.
- **Abrir un reporte nuevo en la bandeja lo pasa a «Visto»** sin avisarle a quien reportó (con `?abrir=1`, solo la primera vez).
- **Si las migraciones faltaran**, la API responde 503 con un mensaje claro y el recorrido no sale. Nunca bloquea a nadie.
- **El envoltorio de `fetch`** no lee ni clona el cuerpo de las respuestas (el streaming del asistente sigue igual) e ignora `/api/sistemas/*`.

## Migraciones (aplicadas el 17/10)

- `20261022000001_sistemas.sql`: tablas `sis_*`, RLS, RPCs y el módulo para js@ y jpm@.
- `20261022000002_sistemas_storage.sql`: bucket privado `sistemas`, de 5 MB.
- `20261022000003_recorridos.sql`: tabla `recorridos_vistos`.

**Cómo ensayarlas.** `scripts/probar-migracion.mjs` necesita `pg`, que no está instalado, y `SUPABASE_DB_URL`. Se ensayaron con una copia del script en un directorio aparte, armando la URL con `SUPABASE_DB_PASSWORD` y `supabase/.temp/pooler-url`. **Cómo aplicarlas:** `npx supabase db query --linked --workdir <repo principal> -f <archivo>`.

## Pendiente

- [ ] **Probar con sesión en producción:**
  - que salga el recorrido;
  - mandar un reporte con captura y marcas;
  - verlo en la bandeja;
  - responder, resolver y «Copiar para Claude Code»;
  - que llegue a Slack un error que frena.

  Sólo se probó sin sesión: las páginas redirigen al login y las APIs dan 401.
- [ ] **Probar la captura en un iPhone y un Android reales.** snapdom se probó en Chromium y en WebKit de escritorio.
- [ ] **Etapa 2:**
  - nota de voz;
  - sugerencia de duplicados;
  - captura exacta con `getDisplayMedia`;
  - lista de Novedades;
  - quién falta hacer el recorrido;
  - limpieza de capturas huérfanas.
