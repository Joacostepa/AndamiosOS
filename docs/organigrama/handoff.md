# Handoff — Organigrama

## Estado (12/10/2026)

Rama `feat/organigrama` (sale de la maqueta `maqueta/organigrama`). **El código está listo; la migración NO está aplicada**: la aprueba el dueño antes. Hasta que se aplique, `/organigrama` muestra el error «No pudimos cargar el organigrama» (la RPC `org_leer` no existe).

### Hecho

- Migración `supabase/migrations/20261012000003_organigrama.sql`: tablas `org_versiones`, `org_nodos`, `org_nodo_version`, `org_notas_internas`, `org_ocupantes`; RLS en todas (`org_puede_ver()` / `org_puede_editar()`); triggers anti-ciclo (diferido), de inmutabilidad de versiones publicadas y de protección de versiones; RPC atómicas (`org_leer`, `org_crear_borrador`, `org_guardar_borrador`, `org_publicar`, `org_descartar_borrador`, `org_guardar_ocupantes`, `org_sembrar`); siembra la **versión 1** con los 24 nodos reales, sin personas.
- La maqueta pasó a datos reales sin cambiar la experiencia: el proveedor mantiene la misma interfaz (`dispatch`, `datos`, `asignar`, `quitar`…), con updates optimistas y una cola que guarda por diferencias (ver [modulo.md § 5](./modulo.md#5-cómo-se-guarda-optimista)). Deshacer/rehacer del Lienzo persiste como la operación inversa.
- Personas reales: legajos (activos o todavía nombrados), usuarios activos (sin el kiosco del pañol), externos de cuadrillas tercerizadas y ocupantes de afuera con nombre libre (nuevo campo «¿Es de afuera?» en Asignar persona).
- Cuadrillas en vivo debajo de Montajes (capataz, plantel activo y externos).
- Fuera: personas inventadas, «Ver como», banner de maqueta y `?demo=`. Cargando / error / vacío salen de los datos reales (con «Reintentar» y «Empezar desde la estructura base»).
- «Ver legajo» en la ficha de persona lleva a `/personal/<id>` y solo aparece con permiso de Legajos.
- Tests (`node:test`): `datos.test.ts` (traducción base ↔ pantalla, diffs, `operacionesPara`, y que el JSON sembrado en la migración sea igual a `estructura-base.ts`), más los de `arbol`, `lienzo` y `layout` de la maqueta.
- La migración se probó en un Postgres local (PGlite, con `user_profiles`/`personal`/`cuadrillas` de mentira): corre dos veces seguidas, rechaza ciclos y deja pasar un intercambio de jefes en un solo guardado, protege las versiones publicadas, aplica la RLS (lector no ve el borrador ni escribe; sin permiso no lee; anon no ejecuta nada) y el ciclo completo crear → guardar → asignar → deshacer → publicar releído con `org_leer` da lo mismo que el estado local.

### Falta

1. **Aplicar la migración** (con la aprobación del dueño). Primero probarla contra la base real sin escribir nada:
   ```
   node --env-file=.env.local scripts/probar-migracion.mjs supabase/migrations/20261012000003_organigrama.sql "select numero, estado, nota from org_versiones"
   ```
   y después aplicarla:
   ```
   npx supabase db query --linked -f supabase/migrations/20261012000003_organigrama.sql
   ```
2. **Dar permisos** en Configuración › Usuarios: «ver» a todos los perfiles y «editar» a quien mantiene la estructura (el admin ya edita).
3. **Ubicar a la gente**: todo arranca vacante; el dueño arrastra a cada persona desde el banco del Lienzo.
4. Cargar las misiones de los 18 puestos (vacías a propósito, como en el original).

### Qué probar después de aplicar la migración

- Entrar como admin a `/organigrama/lienzo`: se ven los 24 nodos con sus colores, todo vacante, Montajes con las cuadrillas reales.
- Arrastrar una persona del banco a un puesto → recargar la página: sigue ahí. Deshacer (⌘Z) → recargar: no está.
- Crear un puesto con la caja de herramientas → aparece «Borrador» → recargar: el borrador sigue con el puesto. Publicar con nota → Versiones muestra v2 vigente.
- Mover un puesto debajo de un descendiente: el Lienzo no lo deja (y si llegara, la base lo rechaza).
- Descartar el borrador: vuelve la vigente; si alguien estaba asignado a un puesto que solo existía en el borrador, queda terminado («borrador descartado»).
- Un usuario con «organigrama: ver» no ve Para revisar, Versiones, notas internas ni el borrador; uno sin el módulo no entra (el proxy lo redirige).
- Dar de baja un legajo con puesto (o esperar al sync de Odoo) → aparece en «Para revisar › Bajas con puesto».
- Dos pestañas: un cambio en una entra en la otra al volver a ella (si no hay nada guardándose).

## Reglas que importan

- **Las personas no se copian.** Nada de nombres o teléfonos en tablas `org_*`, salvo `nombre_libre` para alguien de afuera.
- **La estructura solo cambia en el borrador**; lo publicado es inmutable (lo garantiza la base). Las asignaciones son inmediatas.
- **Toda escritura va por RPC** con su chequeo de permiso. Si se agrega una, sumarla al bloque de `GRANT EXECUTE` de la migración (y las internas, al de `REVOKE`).
- La clave de un nodo es su URL y su identidad mientras vive. Al publicar sin él (o descartar el borrador que lo creó) se libera (`clave~xxxxxxxx`) y sus ocupantes vigentes terminan.
- `estructura-base.ts` y el bloque `$base$…$base$` de la migración tienen que coincidir (lo verifica `datos.test.ts`; se regenera con `node --experimental-strip-types scripts/organigrama-estructura-sql.mts`). Cambiarlos después de aplicada la migración no cambia la base: la siembra corre solo si no hay ninguna versión.

## Riesgos y límites conocidos

- **Dos editores a la vez sobre el mismo borrador**: cada uno guarda diferencias contra lo que vio; no se pisan filas distintas, pero si los dos tocan el mismo puesto gana el último. Lo de los demás entra al volver a leer (no hay tiempo real).
- **Deshacer en el Lienzo después de que entró un cambio de otra persona** puede deshacer también ese cambio (el historial guarda fotos locales).
- Si una RPC falla, se pierde lo que estaba en la cola detrás de ella (se avisa y se vuelve a lo último guardado).
- **Kiosco**: se excluye de las personas al usuario cuyo único módulo es `panol-kiosco`. Cualquier otro usuario activo aparece (hoy hay una cuenta duplicada de Joaquin Stepansky que va a aparecer dos veces).
- «Seguí el papel» usa las claves de la estructura base (`stock`, `montajes`, `cobr`…). Si se elimina uno de esos puestos, el papel no viaja a esa parada (el texto del paso se sigue leyendo).
- `modalidad = 'compartido'` está permitida en la base pero la pantalla la lee como titular (compartir = dos titulares).
- El historial de deshacer vive mientras el Lienzo está abierto.

## Mantenimiento

- Para cambiar la estructura base que se ofrece en una base vacía: editar `estructura-base.ts` y regenerar el JSON de la migración (ver arriba).
- Para un permiso nuevo o un cambio de RLS: migración nueva con el mismo estilo (idempotente, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`).

## Lo que queda para más adelante (propuesta § 5, fases 2 y 3)

- Alerta `organigrama_baja` en la campanita desde el sync de Odoo.
- «Ver esta versión» y comparar versiones; fotos desde Odoo; vista Circuito documental; diferencias con Odoo; KPIs conectados.
- Tiempo real (Supabase Realtime) si se vuelve común que editen dos personas a la vez.
