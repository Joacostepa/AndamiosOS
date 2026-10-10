# Handoff — Habilitaciones (actualizado 2026-10-09, noche)

Para retomar en una sesión nueva: "Leé docs/habilitaciones/handoff.md y seguimos". El diseño
original es `docs/habilitaciones/modulo.md` (18/08, desactualizado: la verdad es el código). La
revisión del 09/10 está en cuatro documentos:

| Documento | Qué tiene |
| --- | --- |
| `docs/habilitaciones/rediseno.md` | Diagnóstico con datos y la propuesta por pantalla. Maqueta: https://claude.ai/artifact/5LdNNShsQpMyWnPdBr9fUe |
| `docs/habilitaciones/inventario.md` | Las 79 acciones del módulo: qué piden, qué mandan, qué escriben en Supabase y Odoo |
| `docs/habilitaciones/errores.md` | Lo que mostraba algo falso o se contradecía (casi todo arreglado, ver abajo) |
| `docs/habilitaciones/recorrido.md` | Diagnóstico del recorrido viejo y el borrador que se usó para el v2 |

Capturas del rediseño andando con los datos del 09/10: https://claude.ai/artifact/FHs9GTR9mrRnGrKR5GSNP1

---

## Estado al 09/10

**Publicado todo**, en tres commits y dos migraciones (aplicadas a mano, antes del código):

| Commit / migración | Qué |
| --- | --- |
| `6dcee74` | Los cuatro documentos de la revisión |
| `5a127aa` | Punto 1: lo que mostraba algo falso (días, "esperando a", urgencias, veredicto), modo oscuro, historial completo, permiso de sólo lectura, recorrido que no arrancaba |
| `20261009000001` | Tipos `requisitos` y `habilitacion` en `hab_gestiones`; `hab_mover_requisito` y `hab_mover_todos` dicen qué papel |
| `cf09851` | El rediseño: bandeja por de quién es la pelota, "Esperan el permiso", ficha con una sola tarjeta, panel como hoja, recorrido v2 |
| `20261009000002` | Deshacer una aprobación vuelve el papel a "enviado" y queda como "se deshizo" |

### Decisiones de JS del 09/10 (no se leen en el código)

- **Lo nuestro se pone rojo al día siguiente.** Lo del cliente, a la semana; "decidir si aplica",
  a los 4 días; "el cliente dice qué pide", a las dos semanas (`ROJO_DESDE` en `derivacion.ts`).
- **Los días, la urgencia y el semáforo vencido los calcula la app** (`alertaDe`, `semaforoHoy`,
  `esperaDe`), en la bandeja, la ficha, el tablero y la lista de órdenes. Los `x_hab_dias`,
  `x_hab_alerta` y el `vencida` de `x_hab_semaforo` de Odoo son `store=true` con `date.today()`
  y sin cron: se congelan. La app ya no los lee para decidir nada. **El tablero no muestra
  días en trámite**: necesitaría Supabase, y la planificación no depende de Supabase a propósito.
- **Revertir pide motivo**, que viaja en el aviso a Operaciones. **Volver a habilitar después de
  revertir avisa** (la clave del aviso lleva el número de reversiones, `contarReversiones`).
- **"Esperan el permiso" es sólo para `esperar_permiso`.** Con número de expediente o sin
  permiso, los papeles se mandan igual. Agustina posponía a mano sólo esas. Vuelve sola cuando
  la gestoría escribe "emitido" en Odoo, o 10 días antes de armar.
- **El permiso se corrige en Odoo.** En la ficha es de sólo lectura; se borró la ruta PATCH
  `/api/habilitaciones/[otId]/permiso` y `escribirPermiso`. No volver a agregar edición.
- **El panel de planificación no necesita estar fijo**: Agustina lo usa para ver cómo viene la
  agenda, no todo el día. Ahora es una hoja encima, desde "Próximas 2 semanas".

### Lo que pasa en la primera lectura de la bandeja en producción

- Las 12 pospuestas con motivo "LLEVA PERMISO" (o parecido) que entran en "Esperan el permiso"
  dejan de estar pospuestas, con la línea "Pasa a «Esperan el permiso»…" en su historial
  (`resolverPospuestas`). Desde ahí, cualquier posposición "por permiso" de una obra que califica
  pasa igual.
- Triunvirato 4528 (S02563) se arma el 19/10 y el permiso no salió: llega el aviso "Volvió a la
  bandeja — se arma el 19/10 y el permiso todavía no salió" (`avisarPermisos`, tipo
  `hab_pospuesta`, va a la campanita y a Slack).
- El recorrido v2 le aparece a cada usuario una vez (claves `hab:tour-*:v2`).

---

## Lo primero en la sesión nueva

1. **Mirar el primer uso real** (lunes 12/10). Con SELECT, sin escribir:
   - que las pospuestas "por permiso" hayan pasado (`hab_gestiones` con detalle "Pasa a «Esperan
     el permiso»…");
   - que haya salido el aviso de Triunvirato;
   - qué botones de la fila usa Agustina (gestiones `envio` y `aprobacion` con detalle "N
     requisitos (…, en un solo gesto)" o con el nombre del papel).
2. **Preguntarle a Agustina** (JS) qué le resultó raro de la pantalla nueva, antes de seguir
   tocando.

## Pendientes

- **Los avisos de pospuestas y de permiso sólo se calculan cuando alguien abre la bandeja**
  (`resolverPospuestas` y `avisarPermisos` viven en el GET). Si nadie la abre, no avisa. Ofrecido
  desde el 13/09 pasarlo al barrido diario de alertas; JS no lo pidió todavía.
- **"Esperan el permiso" confía en el "emitido" de Odoo.** El 09/10 el robot de TAD había marcado
  "emitido" por error en S02128 y S02563 (guardó la nota de solicitud como permiso). La otra
  sesión lo corrigió (`0a801d8`, robot reinstalado a las 21:23). Si vuelve a pasar, la obra sale
  del grupo antes de tiempo y el aviso "Salió el permiso" miente.
- **Lo que el sistema no ve del permiso**: expedientes presentados a mano sin "Confirmar venta"
  (S02521 se ató a mano el 09/10) y ventas viejas fuera del circuito de gestoría (SARANDI 247,
  Olazabal 3255). Para esas queda la vuelta 10 días antes de armar.
- **Odoo sigue mostrando `x_hab_dias` y `x_hab_alerta` congelados** en sus vistas. Si alguien los
  mira desde Odoo, están mal. Arreglo posible: una acción programada diaria en Odoo (cuidado: cada
  write a la OT dispara la cascada de calculados y webhooks) o sacarlos de las vistas.
- **"Vencen en menos de 30 días" casi no se usa**: sólo una OT cargó vencimiento alguna vez.
- **Sin probar en teléfono** con datos reales: la fila apila en tres renglones debajo de 768 px.
- Menores:
  - el aviso de "Marcar enviado" diría "0 marcados" si otra persona los marcó un segundo antes;
  - el recorrido no tiene paso para los adjuntos (el clip), no hay ancla.

## Cómo probar sin tocar producción

**Abrir la bandeja o una ficha ESCRIBE**: siembra OTs nuevas, el requisito de SyH, mueve
pospuestas y manda avisos a la campanita y a Slack. Desde local con código sin publicar eso
es un error. Para probar:

1. Levantar el dev con `HAB_SOLO_LECTURA=1 npm run dev -- -p 3100`: la lectura calcula todo y no
   escribe ni avisa (`soloLectura()` en `servicio.ts`).
2. Entrar sin tocar la cuenta: `auth.admin.generateLink({ type: "magiclink" })` (no manda mail) +
   `verifyOtp` con un cliente de `@supabase/ssr` que escriba las cookies en un jar, y pasarlas a
   Playwright como `storageState`. Borrar ese archivo al terminar.
3. En Playwright, cortar con `page.route` todo request que no sea GET y contestarlo con un mock.
   Con eso se ven los diálogos y los avisos sin escribir nada.
4. Contar `hab_gestiones`, `hab_requisitos`, `hab_ots` y `alertas` antes y después.

Ojo: el build de producción no corre con `node_modules` enlazado (Turbopack lo rechaza). Si el
working tree tiene trabajo a medio hacer de otra sesión, verificar tipos, pruebas y lint en un
`git worktree` limpio con sólo los cambios propios.

## Reglas que no se leen en el código

- **Migraciones con `supabase db query`, nunca `db push`** (el historial remoto está vacío). Un
  comando por llamada, sin comentarios `--`. Aplicarlas ANTES de publicar el código que las usa.
- **La app escribe en Odoo sólo los inputs** (`x_hab_estado`, `x_hab_fecha_consulta`,
  `x_hab_fecha_envio`, `x_hab_fecha`, `x_hab_vencimiento`) y sólo por `escribirInputs()`. Los
  computados nunca.
- **El historial no se edita ni se borra** (RLS). Todo cambio —también deshacer, quitar un papel,
  borrar un archivo, cambiar de paquete— agrega una línea.
- **Otra sesión trabaja en permisos en la misma carpeta.** Commitear sólo los archivos propios,
  con la lista explícita (`git commit --pathspec-from-file`), y mirar antes qué hay preparado en el
  índice.
