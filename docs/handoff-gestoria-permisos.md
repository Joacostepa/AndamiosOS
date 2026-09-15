# Handoff — Gestoría de permisos de andamio (2026-09-14)

Para retomar en una sesión nueva. El diseño completo y todo lo aprendido está en
`docs/modulo-gestoria-permisos.md`; esto es sólo el estado y lo que sigue.

## Dónde estamos

**Objetivo (JS):** automatizar de punta a punta el permiso de uso de andamio en vía pública
(GCBA/TAD + encomienda CPAU) que hoy hace Tamara a mano. Hougassian autorizó su firma; Jorge
Riveros Zanetta sabe que el robot usa su cuenta miBA.

**Hecho y en main (commit `86942d8`):**
- Menú **Gestorías → Permisos de andamio** (`/permisos-via-publica`), módulo
  `permisos-via-publica` en `src/lib/auth/acceso.ts`.
- Tablas `pvp_expedientes`, `pvp_eventos`, `pvp_tareas`, `pvp_robot` + bucket privado
  `permisos-via-publica`. Migraciones `20260914000001` y `…0002` **ya aplicadas** a mano.
- Robot `robot/worker-tad.mjs` (`npm run robot:tad`, `-- --una-vez` para una vuelta): lee la
  lista de TAD, motivos de subsanación, permisos emitidos, carátula (una vez por expediente)
  y vincula con Odoo por nº de expediente o dirección. Avisos `permiso_novedad` /
  `permiso_robot` → campanita + #syh.
- Pruebas de fase 0 en `robot/prueba-*.mjs` (sólo lectura). Credenciales en
  `robot/.env.robot` y capturas en `robot/capturas/` — ambos ignorados por git.

**Datos cargados:** 21 expedientes (16 en curso, 5 finalizados), 2 tareas de subsanación
(ambas por la póliza: cláusula de no repetición a favor del GCBA), 5 permisos PDF.

**Última acción de la sesión anterior:** una vuelta del robot leyendo las 21 carátulas
(~40 s c/u). Si se cortó a mitad, la próxima vuelta sigue con las que falten
(`caratula_leida_at` nulo). Log: `robot/capturas/vuelta-caratulas.log`.

## Lo primero al retomar (verificar)

1. Resultado de las carátulas:
   `select numero, direccion, barrio, odoo_venta_nombre, caratula_error from pvp_expedientes order by numero;`
   (con `npx supabase db query --db-url "$SUPABASE_DB_URL" "…"` tras `set -a; . ./.env.local; set +a`).
2. **Bug conocido:** una carátula devolvió `"Pellegrini, Carlos"` sin altura (TAD guarda
   algunas calles como "APELLIDO, NOMBRE"). La dirección queda sin número y el vínculo por
   dirección con Odoo no puede funcionar. Revisar `robot/caratula.mjs` y ver el texto crudo
   del PDF en el bucket (`caratula_path`).
3. Cuántos quedaron vinculados con Odoo y si los vínculos "por dirección" son correctos
   (evento `vinculado_odoo` dice por cuál se vinculó).

## Actualización 2026-09-14 (noche) — verificaciones y pasos 1 y 2 hechos

- Carátulas: 21/21. "Pellegrini, Carlos" no era un bug de lectura: la carátula de TAD viene
  sin altura ni datos catastrales (se escribió la calle sin el buscador). Idem "Salcedo" y
  "Parana". Parser arreglado y re-aplicado desde el bucket, sin volver a entrar a TAD.
- Vínculos: 16/21 por dirección, todos coherentes; ninguno por número (0 ventas con
  `x_expediente_nro`). Detalle en `docs/modulo-gestoria-permisos.md` § Fase 1c.
- **Paso 1 hecho:** LaunchAgent instalado (`robot/instalar-launchd.sh`).
- **Paso 2 hecho:** el robot escribe en la venta con vínculo confirmado. **Falta que JS
  confirme los 16 vínculos** en la ficha y vincule a mano los 3 sin altura: hasta entonces
  no se escribe nada en Odoo.

## Actualización 2026-09-15 — endoso automático y portal del cliente

- **Hecho y publicado (commit `2479e14`):** endoso de la póliza con portal para Segucom
  (`/endosos/[token]`), revisión con Claude al subir, mail desde js@, recordatorios.
- **Hecho y publicado después** (hasta `1fb18eb`): portal del cliente (`/permiso/[token]`)
  con revisión con IA de cada documento y "Completar y firmar" (acta de compromiso + nota);
  botón "Iniciar trámite" en la bandeja (**inicio manual**: el automatismo de Odoo id 52 está
  desactivado); modo prueba ("Probar el circuito"); medidas del permiso en la venta de Odoo;
  informe técnico y croquis generados solos con la plancheta del catastro. Ver
  `docs/modulo-gestoria-permisos.md`.
- `PERMISOS_MAIL` y `PERMISOS_MAIL_CLAVE` ya están en Vercel (clave de aplicación de js@;
  quedó escrita en el chat del 15/09: conviene rotarla).
- **Siguiente:** encomienda del CPAU. Mapear el resto del asistente con
  `robot/mapear-cpau-wizard.mjs` (con OK de JS: entra con la cuenta de Hougassian) y
  definir pago (tarjeta o transferencia).
- Decisiones: disparador `x_lleva_permiso = sí`; link al confirmar la venta; sólo ventas
  nuevas; el titular lo carga el cliente; ARCA cuando haya certificado.

## Próximos pasos acordados (en este orden)

### 1. ~~Robot corriendo solo en la Mac~~ (hecho)
Hoy sólo corre si alguien lo arranca. Instalar un LaunchAgent (`~/Library/LaunchAgents`) que:
lo arranque al iniciar sesión, lo reinicie si se cae (`KeepAlive`), use `caffeinate` para
que la Mac no duerma, y escriba log a un archivo. Confirmar con JS antes de instalar.

### 2. ~~Escribir en Odoo el estado del permiso~~ (hecho)
Hoy `sale.order.x_tramite_estado` (no_presentado/presentado/emitido), `x_expediente_nro`,
`x_expediente_fecha` y `x_permiso_fecha` se cargan a mano, y de ellos dependen el candado
del tablero y Habilitaciones (`src/lib/habilitaciones/derivacion.ts`, ruta
`src/app/api/habilitaciones/[otId]/permiso/route.ts`).
- El robot escribe esos campos cuando el vínculo está confirmado.
- **Vínculos por dirección: confirmación humana una vez** (botón en la ficha) antes de
  escribir en Odoo. Vínculos por número: se escriben directo.
- Mapeo: INICIACION/SUBSANACION → `presentado`; TRAMITACION o archivado con permiso →
  `emitido` + `x_permiso_fecha` (fecha de la notificación).
- Ojo: escribir en la venta dispara la cascada de calculados (~1 s por write, ver memoria
  "Cascada de calculados y webhooks").

### 3. Póliza (causa de las subsanaciones actuales)
- Generar el pedido de endoso a Gonzalo Costa con el texto exacto: coasegurado el titular del
  lote, GCBA asegurado adicional, cláusula de no repetición e indemnidad a favor del GCBA,
  cobertura > $1.000.000, vigencia ≥ fin del permiso, PDF no encriptado.
- Revisión con IA (Claude, visión sobre PDF) de la póliza que vuelve, antes de presentar.

### 4. Trámite desde la venta + portal del cliente
Ver fases 1–3 de `docs/modulo-gestoria-permisos.md`.

## Decisiones pendientes de JS
- ¿El sistema del andamio (multidireccional / bastidor / mixto) está en Odoo o se asume
  multidireccional? (define el modelo de informe técnico)
- ~~¿Cómo se pide el endoso?~~ → **siempre por mail a Gonzalo Costa, gcosta@segucom.com.ar**
  (JS, 2026-09-14).
- Rotar credenciales (Clave Ciudad, CPAU, miBA de Jorge) — "más adelante".
- Tarjeta para el CPAU (virtual con límite) o pago por transferencia (el CPAU lo acepta).

## Reglas que no se leen en el código
- **Nunca `supabase db push`** (historial remoto vacío). Migraciones con `db query`, sin
  comentarios `--`, en un bloque `DO $mig$`.
- **TAD:** navegar siempre con el menú (URL directa rebota); sólo filas `tr:visible`; abrir
  el detalle de un expediente **agrega una Constancia de Consulta** → no abrirlo en cada
  vuelta; el paso 2 de una subsanación ya muestra "Confirmar trámite" → no tocar.
- **Firewall de AGIP:** bloquea URLs inventadas y user agent headless. No probar URLs a ciegas.
- **SUBSANACIÓN ≠ hay que corregir:** manda la tarea pendiente.
- El robot NO presenta, subsana ni paga nada todavía (fase de mirar).
