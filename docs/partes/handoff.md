# Handoff — Partes de obra (actualizado 2026-10-12)

Para retomar en una sesión nueva: "Leé docs/partes/handoff.md y seguimos con el rediseño de partes".
Acá va el estado, lo decidido y lo que falta. El código de hoy no cambió: todo lo de abajo es
diseño y maqueta.

| Documento | Qué es |
| --- | --- |
| [resumen.md](./resumen.md) | Una página para revisar el circuito nuevo con quien carga los partes. Publicado en https://claude.ai/artifact/LgEDNFwT2GbsqWURFeSFg6 |
| [rediseno.md](./rediseno.md) | Auditoría UX de `/partes` y propuesta completa (10/10): modelo, pantallas, datos, fases |
| [parte-capataz.md](./parte-capataz.md) | Qué más pedirle al capataz y cuándo: entrega, fotos, firma del cliente, desarme (11/10) |
| [maqueta.html](./maqueta.html) | Copia de la maqueta interactiva. Publicada en https://claude.ai/artifact/RzqxoYYA7Mapz2zaMYLK73 |

---

## Pendiente ahora

1. **Revisar la maqueta y el [resumen](./resumen.md) con la persona que carga los partes** (JS, 12/10).
   Lo que salga de esa charla ajusta la Fase 0 y los umbrales de las alertas.
2. **Decidir el arranque.** La recomendación es la **Fase 0** de [rediseno.md §11](./rediseno.md#11-plan-por-fases)
   (3–4 días sobre la pantalla actual), y dentro de ella el **0.1: usar `usePrecargaCierre` en
   `borradorDe()`**, que es lo que más rinde (1 día). Sirve para cualquiera de los caminos.
3. **Decisiones de la dirección** que traban etapas posteriores (no la Fase 0): ver
   [parte-capataz.md §D.4](./parte-capataz.md#d4-decisiones-del-dueño) y [rediseno.md §12](./rediseno.md#12-decisiones-que-tiene-que-tomar-el-dueño).
   Las que más pesan: el texto del acta de entrega y la cláusula de 48 h (abogado + HyS), si la
   entrega arranca el alquiler, y dónde se guardan las fotos.

---

## Decidido (JS, 10–11/10)

- **El parte lo completa el capataz y la oficina lo valida.** No existe la figura de supervisor de
  obra; se capacita al capataz. Transitoriamente la oficina carga **"en nombre de"** el capataz,
  con el mismo flujo y marcado con su origen. Ese modo nunca habilita la confirmación de un toque
  ni la firma del cliente. Se retira por capataz cuando declare más del 80 % de los días durante
  3 semanas (propuesta, falta confirmar).
- **El parte del capataz es por momentos**, no un formulario largo: núcleo diario de ~20 s
  (quién fue, hasta qué hora, si se hizo, «¿cuánto les falta?») + «Pedir algo» y «Pasó algo» a
  cualquier hora + bloques que aparecen sólo cuando corresponde (fotos del antes el primer día;
  entrega al terminar un armado; faltantes al terminar un desarme).
- **Fotos sin límite**: las guiadas son el mínimo, siempre se pueden sumar más, y hay un
  «Mandar fotos» suelto en cualquier momento del día.
- **Todo lo que se dicta también se puede escribir** (hay ruido en obra y el dictado falla con
  medidas y nombres), y lo dictado se puede corregir escribiendo.
- **Tres solapas en `/partes`**: «Partes del día» (la oficina valida, todos los días, por
  cuadrilla), «Cierres de obra» (una vez por obra: medidas, fotos de amarres, constancia, as-built)
  y «Parte del capataz» (lo que él ve en el celular; en la maqueta es una solapa para poder
  mostrarlo).

## Hallazgos de la auditoría que siguen vigentes en el código

Detalle y prioridad en [rediseno.md §2](./rediseno.md#2-auditoría-priorizada). Los más graves:

1. **Dos caminos crean partes.** `/partes` (el comentario de `page.tsx` dice que es el único) y
   «Cerrar jornada» de la Hoja del día (`cerrar-jornada.tsx` → `FormularioCierre`). La Hoja usa
   `usePrecargaCierre` y admite varias líneas de mano de obra; `/partes` no, y arranca con el
   capataz vacío.
2. **«Confirmar como planificado» nunca deja una fila lista**: el capataz es obligatorio y arranca vacío.
3. **La deuda no está en pantalla**: el badge cuenta las confirmadas sin parte de cualquier fecha;
   la pantalla sólo muestra el día elegido más las tentativas vencidas. El lunes abre en el domingo.
4. **Los borradores viven en memoria** (fotos en base64 incluidas), sin `beforeunload`.
5. **«Guardar» corta en el primer error** (`break` en `guardarTodo`).
6. **Puede duplicar partes**: si falla el paso que vincula el parte con la jornada, el próximo
   guardado crea otro. No hay clave de idempotencia.
7. **Módulos viejos de «Campo»** (Solicitudes extra, Incidentes, Inspecciones): están sobre la
   tabla vieja `obras` y no se conectan con las OT de Odoo. La recomendación es sacarlos del menú.

## Mapa del módulo hoy

- Pantalla: `src/app/(dashboard)/partes/page.tsx`; fila: `src/components/partes/fila-jornada.tsx`
  (+ `selector-capataz.tsx`, `como-quedo-armado.tsx`).
- Hooks: `src/hooks/use-jornadas.ts`, `src/hooks/use-parte.ts` (`use-partes.ts` está sin uso).
- API: `/api/planificacion/jornadas`, `/api/planificacion/partes`, `/api/planificacion/empleados`.
- Odoo: `src/lib/odoo/partes.ts`, `jornadas.ts`, `parte-existente.ts`.
- Tipos: `src/lib/tablero/tipos-jornada.ts`, `tipos-parte.ts`.
- Precarga desde la Hoja: `usePrecargaCierre` en `src/hooks/use-hoja-dia.ts` (la usan
  `cerrar-jornada.tsx` y `formulario-cierre.tsx`).
- Reutilizable para la firma del cliente: `FirmaPad`, `tintaDeFirma` y `documentos-firmados.ts`
  del módulo de Permisos.

## Sobre la maqueta

- Es un HTML autocontenido, sin backend: todo vive en un `state` en memoria y «Reiniciar» lo
  devuelve al inicio. Los datos son de ejemplo (semana del 12 al 18/10/2026, «hoy» = lunes 19).
- Para cambiarla: editar `docs/partes/maqueta.html` y volver a publicarla en el mismo link.
  El script está ordenado por secciones (vocabulario y umbrales, datos, modelo, render, flujo del
  capataz `pantallaCap`/`accionCap`, oficina, acciones, teclado).
- Es privada: para mostrarla hay que compartirla desde el menú «Share» de la página.
