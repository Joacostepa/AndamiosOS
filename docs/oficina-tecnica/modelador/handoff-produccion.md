# Modelador: handoff para subir a producción (15/10/2026)

Rama `feat/modelador`. Nada está aplicado ni subido: no hay push, deploy ni migraciones aplicadas.
Todo cálculo del modelador es **PREDIMENSIONADO** (criterios provisorios sin firma). No reemplaza la memoria de cálculo.

## 1. Qué hay

### Pantallas
- **`/oficina-tecnica/modelador`**: la lista de modelos. Se filtra por obra, sin obra o plantillas, y tiene búsqueda. «Nuevo modelo» arranca desde una plantilla de la galería, desde «Mis plantillas», vacío o desde la obra de ejemplo.
- **`/oficina-tecnica/modelador/[id]`**: el editor.
  - Galería con buscador, «Recientes» y grupos que se recuerdan.
  - Árbol de estructuras y volúmenes.
  - Lienzo 3D, con el alzado y la planta debajo.
  - Propiedades, lista de piezas y avisos.
  - Las columnas de los costados se pliegan.
- **`/oficina-tecnica/modelador/demo`**: abre la obra de ejemplo (Paraná 631) sin guardar.
- **Entrada desde la obra**: el botón «Diseñar andamio» en `/obras/[id]`.
- **Generar cómputo**: escribe el cómputo REAL (`computos` + `computo_items` con códigos de `catalogo_piezas`) y muestra antes la diferencia con lo que ya había. Lo editado a mano no se pisa sin preguntar.

### Tipologías
Todas salen del registro, en `src/lib/tecnica/modelo/tipologias/indice.ts`.
- **Fachadas**: con y sin pantalla, voladizo con ménsulas, bastidor.
- **Bandejas**: a 45° y a 90°, amplia con vigas de celosía, en voladizo, y con pórtico peatonal.
- **Pórticos**: peatonal y vehicular.
- **Torres**: escalera, acceso, plataforma, azotea y móvil (interior y exterior).
- **Colgantes**: bajo un puente y de una losa.
- **Envolventes**: cúpula, tanque y columna.
- **Patios internos**: entre medianeras y perimetral.
- **Escaleras**: estructura sobre escalera y plataforma en hueco de escalera.
- **Estructura libre**: un vano o desde medidas.
- **Medida libre**: catálogo + caño y grampa a la vista.
- **«Convertir a estructura libre»** para retocar a mano cualquier estructura.
- **Plantillas propias**: se guardan en `tec_modelos.es_plantilla` y aparecen en «Mis plantillas».
- **Agregar una tipología** se explica en `como-agregar-tipologia.md`.

### Qué cambió en este cierre (revisión de andamios, UX, código y seguridad)

**Cómputo de piezas**
- **Grampas**: cada caño lleva sus grampas. Dos caños en un nodo son 4 grampas; antes se perdían en la fusión, y en las envolventes, el voladizo, el hueco de escalera y la medida libre faltaban grampas en obra.

**Niveles y torres**
- **Niveles**: el primer nivel va a 2,00 del arranque (0,50 → 2,50 → 4,50…). Ya no aparece el anillo extra a 0,50 de la primera plataforma, que dejaba una banda sin diagonal.
  - ⚠ **Para decidir (JS)**: con H = 18, la última plataforma queda a 16,50 en vez de 17,00 (la baranda llega a 17,50). Si queda 1,00 por debajo, el último nivel sube; si queda 1,50, se suma un nivel.
  - Bandeja, torre móvil y libre respetan la cota pedida (`topeExacto`).
- **Torre escalera**: arranca en el primer anillo con un escalón de arranque. Cada zanca sube exactamente 2,00, de anillo a anillo, y hay un test que lo verifica. El resto se sube con escalera interna. Los presets vienen anclados a la fachada cada ≈ 4,00.
- **Trampilla**: toda plataforma a la que llega una escalera interior lleva trampilla, también la de arriba.
- **Reparto**: las bases sobre losa o tierra llevan tablón de reparto.

**Tipologías**
- **Envolventes**: nuevo trazado **ortogonal** por defecto, como en la foto 5. Es un anillo rectangular de vanos de catálogo, con las verticales de las esquinas compartidas y ménsulas hacia la curva.
  - La columna pasó de 24 bases y 120 caños a 16 bases y 0 caños.
  - El trazado poligonal sigue disponible.
- **Colgantes**:
  - doble grampa en cada caño que trabaja a tracción;
  - placa con bulón en losa, o grampa de viga en acero;
  - pasador en cada empalme de las verticales colgadas;
  - diagonal en planta en las puntas y cada ≤ 3 vanos, abajo y arriba.
- **Bandeja amplia**: la viga de celosía se toma de las dos verticales y se dibuja con su largo de catálogo. Si el vuelo pedido no entra, el aviso trae «Volar X».
- **Bandeja en voladizo**:
  - el vuelo sale del largo de catálogo de la viga;
  - diagonales en planta bajo la bandeja;
  - amarre abajo y **anclaje estructural** arriba, con código propio;
  - la tracción por anclaje sale como PREDIMENSIONADO, con la carga provisoria ⚠ en `CRITERIOS.cargaBandeja`.
- **Pórtico con bandeja**: nuevo «Paso entre patas» (2,50, 5,00 o 7,50; el default es 5,00). Las vigas de celosía solo van donde saltan un vano. Las puntas quedan con patas y diagonales.
- **Hueco de escalera**: el fenólico va sobre correas de caño cada ≤ 0,50, y las placas se cuentan sobre toda la superficie (8,75 m² son 3 placas, no 6).
- **Medida libre**: el vano de ajuste nunca baja de 0,73. Por ejemplo, 13,37 → 5×2,50 + 0,87, y no 0,28 con columnas a 28 cm. El vano de ajuste tampoco es nunca el arriostrado.
- **Balcones**: aparece la reparación «Retirar y acercar con ménsulas» en los niveles libres entre balcones.
- **Presets**: ninguno abre con un aviso por cómo está configurado, y hay un test que lo controla. Los avisos de verificación obligatoria (colgar, volar, cargar una losa, defensas) quedan siempre.

**Editor**
- **Borrar**: ⌫ pide dos pulsaciones. Supr con celdas elegidas vuelve esas celdas a lo generado.
- **Atajos nuevos**:
  - Ctrl+K: paleta («torre 2,50×1,50 h 12», «pórtico 10», «fachada 16 9 h 15», «altura 21»);
  - Ctrl+D: duplicar alineado;
  - O: abertura;
  - L / H: largo y altura, tipeando el valor y Enter, con los kg en vivo.
- **Alzado**:
  - textos a tamaño fijo;
  - selección arrastrando;
  - N1… y V1… eligen un nivel o un vano entero;
  - zoom con la rueda y Alt+arrastrar para mover;
  - nombres legibles de celda;
  - 45 % de alto con una fachada elegida.
- **Campo «volumen»**: la escalera, la losa, el puente o la azotea se eligen de una lista o se crean con las medidas de la estructura. Al ubicar la plantilla se crean solos y quedan vinculados, sin tipear ids.
- **Accesos y ménsulas**: se editan con controles en lugar de JSON. Un JSON mal escrito dice por qué.
- **Pantalla**:
  - toasts abajo al centro, y las reglas se agrupan en uno solo;
  - contador de avisos además del de errores;
  - colores con los tokens del sistema (`--tb-*`) y `color-scheme` por tema;
  - estado «No tenés acceso al Modelador».

**Datos y seguridad**
- **Catálogo**: en producción nunca se usa el de prueba. Si la ruta falla, se reintenta y se muestra un error; los pesos inventados no llegan a la base.
- **Autoguardado**:
  - serializado, para que no haya un 409 contra uno mismo; tiene test;
  - no manda `obra_id`;
  - el editor no se reinicia al generar el cómputo.
- **RPC `tec_generar_computo`**: solo la ejecuta `service_role`, con el uid verificado, y tiene un candado por obra.
  - `tec_pieza_mapa` y `tec_kits` solo los edita un admin.
  - La autoría se fuerza al crear.
  - El `resumen` tiene esquema estricto y tope de tamaño.
  - Los 500 no muestran el texto de Postgres.
  - Una plantilla no se vincula a una obra (400).
- **Portada**: tope de 4 MB, leída por stream. Sale del mismo renderer, sin abrir otro contexto WebGL.
- **Escena 3D**: libera materiales, entorno y contexto al salir.

## 2. Cómo probarlo

```bash
npm test                 # 922 tests (205 del modelador)
npm run bench            # velocidad del motor (Paraná 631: ~2–3 ms), fuera de npm test
npx tsc --noEmit
npx eslint src/components/tecnica src/lib/tecnica src/app/api/tecnica "src/app/(dashboard)/oficina-tecnica/modelador"
npm run build            # con las variables de entorno de siempre
```

- **Sin base, en desarrollo**: entrá a `npm run dev` y abrí `/prueba/modelador`. En producción esa ruta da 404.
- **Con base** (después de aplicar las migraciones):
  1. Abrí `/oficina-tecnica/modelador`.
  2. Hacé «Nuevo modelo» → «Bandeja con visera a 45°».
  3. Generá el cómputo para una obra de prueba.
  4. Abrí el cómputo desde el toast.
- **Atajos**: «?» en el editor muestra todos.

## 3. Pasos para subir (JS)

1. **Backup** de la base (o un branch de Supabase) antes de tocar nada.
2. **Aplicar las migraciones en orden**. Son idempotentes y no se aplican solas:
   ```bash
   node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/20261015000001_modelador.sql
   node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/20261015000002_modelador_computos_rls.sql
   node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/20261015000003_modelador_storage.sql
   node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/20261015000004_modelador_endurecer.sql
   ```
   - La 000001 copia a «modelador» el nivel que cada persona tiene en Cómputos, y deja anotado a quién en `tec_backfill_permisos`.
   - La 000004 reemplaza la firma de la RPC. Si se aplica la 000002 sin la 000004, «Generar cómputo» falla, porque la ruta ya llama a la firma nueva.
3. **Variables en Vercel**: confirmá que exista `SUPABASE_SERVICE_ROLE_KEY`, porque la ruta del cómputo ahora la usa. No hay variables nuevas.
4. **Permisos a asignar** (Configuración → usuarios):
   - **Modelador «editar»**: Oficina Técnica.
   - **Modelador «ver»**: quien solo mira.
   - Para «Generar cómputo» hace falta además **Cómputos «editar»**.
   - El mapa de piezas y los kits solo los edita un admin.
5. **Mapear en `tec_pieza_mapa` los códigos que en el fixture son «plausibles»**. Hasta que se mapeen, quedan «sin código»: no entran al cómputo y se avisan.
   - Vienen de antes: `VIGA-CEL-500`, `VIGA-CEL-600`, `VIGA-CEL-750`, `DIAG-PL-*`, `RDPE-150`, etc.
   - Nuevos de este cierre:
     - `ESC-ARR`: escalón de arranque de la torre;
     - `PASADOR-UNION`: pasador de las verticales colgadas;
     - `GRAMPA-VIGA`;
     - `PLACA-ANC-COLG`: placa con bulón para colgar de una losa;
     - `ANC-VOL-PLACA`: anclaje estructural de voladizo.
   - El estabilizador de la torre móvil sale como familia `estabilizador`, también sin código hasta mapearlo.
   - Los pesos que no estén en `catalogo_piezas` salen «sin peso». Nunca se inventan.
6. **Merge**: `git checkout main && git merge --no-ff feat/modelador`. Después, push y deploy como siempre (JS).
7. **Si hay que volver atrás**: correr a mano `supabase/scripts/modelador_down.sql`. Restaura la RLS original de cómputos y quita el permiso solo a quien lo recibió por el backfill. ⚠ Borra los modelos.

Las carpetas `docs/oficina-tecnica/modelador/{fotos,maqueta,investigacion-*,propuesta-*}` siguen sin commitear (son material de referencia, con fotos de obras de clientes). Decidí si van al repo.

## 4. Qué falta (y por qué)

| Pendiente | Por qué quedó |
|---|---|
| **Manijas L/H arrastrables en el 3D** | Hoy L/H abren un campo con Enter y los kg en vivo. Arrastrar en el lienzo requiere portar ~60 referencias de `vista3d.js` a `escena.ts`; queda para una iteración. |
| **K (partir frente), M (pincel ménsula), Shift+P (pórtico vehicular), chip «ml estimado» de la obra** | No entraron en el alcance de este cierre. Todo se puede hacer desde la paleta o los paneles. |
| **Recorrido guiado** (tour.js de la maqueta) | Afuera de este cierre, a propósito. |
| **«Mis plantillas» en la mano** (ubicarlas con encastre) | La escena solo sabe arrastrar presets. Hoy la plantilla se suma 3 m a la derecha y se mueve después. |
| **Pórtico con bandeja: lista de huecos sobre accesos** | Por ahora hay paso fijo entre patas (2,50, 5,00 o 7,50). |
| **Envolvente de columna en ≤ 12 bases** | Con el hueco de 1,09 y la profundidad de 0,73, el anillo cerrado da 16 (4 × 4 nodos). El trazado poligonal mantiene los cuadros de esquina. La planta no se angosta con la altura (cúpula). |
| **Medida libre: cerrar el sobrante con ménsula o caño volado sin columna nueva** | Hoy se reacomodan los vanos para que el ajuste sea ≥ 0,73. En «solo catálogo», el patio entre medianeras redondea para abajo; la fachada solo avisa «se pasa X: si termina contra una medianera, choca». |
| **Cómputos: control optimista** en la pantalla de Cómputos (`use-computos.ts`) | Toca otra pantalla. Hasta tenerlo, no conviene tener el cómputo abierto en otra pestaña mientras se genera. |
| **RPC: consolidar ítems duplicados** (manual + modelo de la misma pieza) | El candado por obra ya evita los cómputos dobles. La consolidación necesita una decisión sobre qué cantidad manda. |
| **Tests e2e**: RPC SQL contra `planGeneracion`, rutas API (401/403/409/422/423) y volúmenes en el formato viejo | Necesitan Supabase local o pgTAP. Hoy el espejo TS/SQL solo se prueba del lado TS. Sí hay test del autoguardado concurrente. |
| **«Detrás de la selección» en fachadas de varios frentes** (`volumenes/geometria.ts`) | Bug conocido: en la L ubica la caja en el segundo frente. Se mueve a mano. |
| **Tooltips de `components/ui/tooltip`** en lugar de `title=` | Se resolvió el contraste de los selects nativos con `color-scheme`. La migración a Tooltip queda para cuando se toque cada panel. |
| **Lint general del repo** | Hay 21 errores en archivos que no son del modelador (configuración, obras, `use-chatter`…), y ya estaban en `main`. El código del modelador pasa limpio. |
