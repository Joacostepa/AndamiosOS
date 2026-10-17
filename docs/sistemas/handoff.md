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
