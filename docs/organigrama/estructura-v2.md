# Organigrama — Estructura v2 (propuesta, 12/10/2026)

Nueva estructura del organigrama de ABA, pensada para una pyme familiar de ~45 personas (~31 de campo, ~15 de oficina) y armada sobre el circuito **real** que muestran el sistema y la base, no sobre el organigrama viejo.

- **Estado:** propuesta. Se carga como **borrador** con `supabase/scripts/organigrama-estructura-v2.sql`. El dueño la revisa en el Lienzo y la publica, o la descarta, con el flujo normal.
- **Sin personas.** Todas las fichas vienen completas: misión, tareas, «qué NO hace», KPIs y nota de diseño. Son plantillas listas para ubicar a la gente.
- **Insumos:**
  - el relevamiento del circuito real (docs de módulos, más consultas agregadas a la base del 12/10);
  - el relevamiento del negocio y la normativa.
  - Las cifras citadas («hoy 0», «14 de 18») salen de ahí.

---

## 1. Diagnóstico de la estructura actual (v1)

La v1 tiene 24 nodos: 1 dirección, 5 áreas y 18 puestos. Es el contenido del organigrama viejo (`organigrama-aba`) y tiene buen formato de manual («qué NO hace», KPIs, notas). El problema es que describe una empresa que no es ABA.

1. **Es demasiado corporativa para el tamaño de ABA.** Tiene cinco «Direcciones» y 18 casillas para unas 15 personas de oficina. Hay áreas de una persona (Habilitaciones, que además ni figura) y áreas de ninguna (Sistemas, Depósito).
2. **Su circuito documental no existe.** SOL, OPC, RS, FS, RDP, RDF e ICO no aparecen en el código ni en los docs de módulo. En la base hay 0 remitos, 0 movimientos y 0 stock. Es una meta de control, no una práctica.
3. **Le faltan las funciones que más trabajan hoy:**
   - Coordinación y despacho (Tablero y Hoja del día);
   - Permisos de vía pública;
   - Habilitaciones;
   - Pañol;
   - Asistencia y legajos;
   - los externos (firmante, productor de seguros, contratistas).
4. **Pone cosas en el lugar equivocado:**
   - Seguridad e Higiene depende de Operaciones, es decir, de quien tiene apuro por armar.
   - Las habilitaciones están mezcladas con SyH.
   - Oficina Técnica figura como un equipo, pero en la realidad son los mismos vendedores y el dueño.
5. **Tiene KPIs que no se pueden medir:** «diferencia de stock <1%», «100% obras conciliadas», «uptime».

## 2. Principios de la v2

1. **Tres niveles como máximo:** Dirección → frente → función. No hay «Direcciones de» ni «Gerencias».
2. **Son funciones («sombreros»), no cargos.** Una persona puede usar varias. Por ejemplo, el coordinador es también encargado de pañol, y un chofer puede ser capataz. El organigrama lo muestra asignando a la misma persona en varias cajas; «Para revisar» marca la sobrecarga a partir de 3.
3. **Cada función tiene un solo dueño.** Además dice qué decide sin consultar, qué NO hace y 2 o 3 indicadores que hoy se pueden sacar del sistema (lo que todavía no se puede medir dice «a medir»).
4. **Usa el idioma de la casa:** capataz, cuadrilla, pañol, parte, Hoja del día, Tablero, habilitaciones, permiso, OT.
5. **Seguridad e Higiene depende de la Dirección y puede frenar un armado** sin pedirle permiso a nadie.
6. **Los externos se ven,** colgados de quien los coordina.
7. **Lo que no existe se dice.** Las prácticas que faltan se marcan «A crear». Las funciones futuras no se dibujan como vacantes.
8. **El dueño en el centro, pero no en todas las flechas.** Los «qué NO hace» de la Dirección son un plan de delegación. Lo de familia y socios va en una reunión aparte, no en el organigrama operativo.
9. **Cada ficha sugiere un suplente** (como función, no con nombre) y dice cuándo conviene separar la función en dos.

## 3. El árbol nuevo

27 nodos: 1 Dirección, 5 frentes y 21 funciones. De las funciones, 7 son externos y 2 dependen directo de la Dirección.

```
DIRECCIÓN  (dg · gris)                                  Dueño y socios
│
├── Sistemas y Andamios-OS  (it)                        función de la Dirección
├── Abogado (externo)  (abogado)
│
├── COMERCIAL Y TÉCNICA  (tec_com · teal)
│     ├── Ventas y cartera  (ventas)
│     ├── Técnico de obra  (oficina_tec)                relevamiento y cómputo
│     └── Firmante profesional (externo)  (firmante)
│
├── HABILITACIONES Y PERMISOS  (gestion · violeta)
│     ├── Permisos de vía pública  (permisos)           gestoría
│     ├── Habilitaciones  (habilitaciones)              documentación del personal
│     └── Productor de seguros (externo)  (seguros)
│
├── OPERACIONES  (ops · ámbar)
│     ├── Coordinación y despacho  (planif)             Tablero + Hoja del día
│     ├── Cuadrillas y capataces  (montajes)            ← en vivo desde Configuración › Cuadrillas
│     ├── Choferes y flota  (logistica)
│     ├── Depósito y pañol  (deposito)
│     ├── Taller de piezas  (taller)                    herrería
│     ├── Contratistas de mano de obra (externo)  (contratistas)
│     └── Taller mecánico y VTV (externo)  (taller_mecanico)
│
├── SEGURIDAD E HIGIENE  (seguridad · rosa)             puede frenar un armado
│     ├── Técnico de SyH  (syh)
│     └── Asesor SyH, ART y medicina laboral (externo)  (asesor_syh)
│
└── ADMINISTRACIÓN  (admin · verde)
      ├── Facturación y cobranza  (fact)
      ├── Pagos, caja y compras  (teso)
      ├── Personal y sueldos  (personal)                asistencia y legajos
      └── Contador / estudio (externo)  (contador)
```

**Colores.** Se usan cinco de la paleta del módulo (`--tb-*`; la base acepta azul, ámbar, verde, rosa, violeta, teal y gris):
- Comercial y Técnica conserva el teal, Operaciones el ámbar y Administración el verde, para que el cambio no desoriente.
- El violeta, que queda libre al irse Depósito como área, pasa a Habilitaciones y Permisos.
- El rosa, que queda libre al irse Sistemas, pasa a Seguridad e Higiene: es el más «de alerta» de la paleta.
- El azul queda libre para un frente futuro.

**Fichas.** Cada nodo tiene título, rol, misión de una línea, tareas, «qué NO hace», KPIs y nota de diseño. El texto completo está en el script (`supabase/scripts/organigrama-estructura-v2.sql`), que es la fuente. Reglas que siguen todas:
- Cada tarea nombra el módulo o documento real que usa: Odoo, Asistente comercial, Cómputos, Permisos de andamio, Habilitaciones, Tablero, Hoja del día, Lista de carga, Partes, Pañol, Vehículos, Legajos, Informe de obra, Incidentes, Inspecciones, Configuración › Cuadrillas, entre otros.
- Ninguna tarea lleva documento con sigla (`docs`). Las siglas del circuito viejo no se usan porque no existen.
- Las áreas también tienen tareas: son las del responsable del frente y empiezan con «Decide sin consultar: …».

## 4. Cambios contra la v1

### Se conservan, con su clave e identidad

Se conserva la misma fila de `org_nodos`: las asignaciones y las URL sobreviven.

| Clave | v1 | v2 | Qué cambia |
|---|---|---|---|
| `dg` | DIRECCIÓN GENERAL | DIRECCIÓN | Las responsabilidades del dueño; los «qué NO hace» pasan a ser un plan de delegación |
| `tec_com` | Dirección Técnico-Comercial | Comercial y Técnica | Sin «Dirección»; un solo frente porque son las mismas personas |
| `ventas` | Ventas | Ventas y cartera | Tareas reales (Asistente comercial, OT, portal de Permisos); se va el marketing que no se hace |
| `oficina_tec` | Oficina Técnica | Técnico de obra | Es una función de los vendedores y del dueño; se va la SOL |
| `ops` | Dirección de Operaciones | Operaciones | Absorbe el depósito; «A crear: supervisor de obra» |
| `planif` | Planificación y Programación | Coordinación y despacho | Absorbe la coordinación de «Repartos y Logística»: Tablero, Hoja del día y despacho en vivo |
| `montajes` | Montajes y Desmontajes | Cuadrillas y capataces | Sigue con `fuente_ocupantes = 'cuadrillas'`; el capataz rota; el parte lo declara el capataz; se van RS, FS y RDF |
| `logistica` | Repartos y Logística | Choferes y flota | Absorbe «Mantenimiento de Vehículos» |
| `deposito` | Depósito y Control de Materiales (**área**) | Depósito y pañol (**función** dentro de Operaciones) | Absorbe Control de Stock, Preparación y Despacho, y Recepción y Devoluciones; suma el Pañol |
| `taller` | Taller | Taller de piezas | «A crear: clasificar bueno / a reparar / baja» |
| `seguridad` | Seguridad y Formación (**puesto** en Operaciones) | Seguridad e Higiene (**frente** que depende de la Dirección) | Puede frenar un armado; las habilitaciones se van a su propio frente |
| `admin` | Administración y Finanzas | Administración | Absorbe Mantenimiento Edilicio y la parte de costos de Control; «A crear: conciliación de material» |
| `fact` | Facturación | Facturación y cobranza | Absorbe Cobranzas |
| `teso` | Tesorería y Pagos | Pagos, caja y compras | «A crear: compras» |
| `it` | Soporte IT y Desarrollo (en el área Sistemas) | Sistemas y Andamios-OS (directo de la Dirección) | Deja de ser un área: es una función del dueño |

### Se eliminan

Al publicar terminan sus ocupantes vigentes y liberan la clave (`clave~xxxxxxxx`). Hoy no tienen ocupantes.

| Clave | Va a parar a | Por qué |
|---|---|---|
| `supervision` | Tarea «A crear» en Operaciones | La figura no existe (decisión del 10/10: el parte lo completa el capataz y la oficina lo valida) |
| `vehiculos` | `logistica` | El mantenimiento lo hace un taller externo; adentro solo hace falta llevar la agenda |
| `stock`, `despacho`, `devoluciones` | `deposito` | Tres casillas para lo que hoy hace, como mucho, una persona de turno |
| `cobr` | `fact` | Hoy es una sola tarea en Odoo |
| `control` | Tareas de `admin` y la función nueva `personal` | El ICO no existe; el control real es el Informe de obra |
| `sistemas` | `it` | No es un área |
| `mant` | Tarea de `admin` (proveedores del edificio) | Es coordinar proveedores, no un puesto |

### Se agregan

| Clave | Qué es | Por qué |
|---|---|---|
| `gestion` | Frente Habilitaciones y Permisos | Es el cuello de botella real: 14 de 18 obras en Habilitaciones esperan permiso |
| `permisos` | Permisos de vía pública | Servicio que se cobra, con módulo y robot propios; no existía |
| `habilitaciones` | Habilitaciones | Puesto real de una persona; estaba diluido en SyH |
| `syh` | Técnico de SyH | Persona real y servicio vendido; separado de la documentación |
| `personal` | Personal y sueldos | La asistencia diaria y los legajos son la base de los sueldos y no figuraban |
| `firmante`, `seguros`, `contratistas`, `taller_mecanico`, `asesor_syh`, `contador`, `abogado` | Externos | Ver § 5 |

## 5. Cómo se representan los externos y lo que está «a crear»

### Externos

Se usa el modelo actual, sin tocar el esquema:
- **Son nodos `puesto`** colgados del frente que los contrata, o de la Dirección en el caso del abogado.
- **El título termina en «(externo)»** y el rol dice quién los coordina: «Externo · lo coordina Técnico de obra». Así se distinguen en el Lienzo, en el Mapa y en el buscador.
- **Se ocupan con nombre libre:** «Asignar persona» › «¿Es de afuera?», con el nombre del estudio, la empresa o el profesional. El ocupante queda `x:` y la tarjeta lo marca como externo. Puede haber varios en la misma caja, por ejemplo dos contratistas o dos talleres.
- **Mientras no se cargue el proveedor, la caja figura vacante.** La nota de diseño de cada uno lo aclara: «vacío quiere decir que no se cargó quién es, no que haya que buscar a alguien». Es una alerta útil: un externo sin nombre es un riesgo (¿quién firma?, ¿quién endosa?).
- **Las cuadrillas tercerizadas** se siguen viendo solas dentro de «Cuadrillas y capataces», porque salen de Configuración › Cuadrillas. La caja de Contratistas es para el nombre de cada empresa contratista.

### Funciones «a crear»

Hoy, en este modelo, **cualquier puesto sin titular es una vacante**: suma en «Para revisar» y la tarjeta muestra el borde de vacante. Por eso las funciones futuras **no se dibujan como nodos**. Van como:
- **una tarea que empieza con «A crear:»** en el frente o la función que hoy absorbe ese trabajo;
- **el disparador** para crearla, en la nota de diseño.

| Función futura | Dónde está | Disparador |
|---|---|---|
| Supervisor de obra | Tarea de Operaciones (`ops`) | Más obras en curso de las que Coordinación puede seguir, o retrabajos en aumento [umbral a definir] |
| Compras | Tarea de Pagos, caja y compras (`teso`) | Volumen de compras o faltantes de insumos [disparador a definir] |
| Conciliación de material por obra | Tarea de Administración (`admin`) | Que exista la constancia de devolución (sin ella no hay con qué conciliar) |

Con el mismo prefijo se marcan las **prácticas** que no existen:
- constancia de entrega y de devolución;
- stock por obra;
- clasificación de lo devuelto;
- renovación de permisos;
- alta documental de contratistas;
- inspección periódica;
- bot de Telegram;
- facturación de períodos de alquiler;
- seguimiento de cartera;
- reunión operativa semanal.

Cuando una función «a crear» se cree de verdad, se agrega el nodo en un borrador y se borra la tarea.

*Mejora futura posible, sin hacer:* una marca `futura` en `org_nodo_version` que la pantalla dibuje punteada y que «Para revisar» no cuente. No se hizo para no tocar el esquema por esto.

### Puntos sin confirmar

Aparecen como **[confirmar]** en las notas y en las tareas.

## 6. Preguntas abiertas para el dueño

1. **¿Quién firma las memorias de cálculo y los certificados de armado y desarme?** ¿El mismo firmante profesional de los permisos, otro profesional, o alguien de la familia con matrícula? Aparece como [confirmar] en `firmante` y en `oficina_tec`.
2. **¿Cómo se liquidan los sueldos de obra?** ¿Se encuadran en UOCRA (libreta IERIC, fondo de cese) o en comercio? ¿Liquida el estudio contable? Aparece como [confirmar] en `personal` y en `contador`.
3. **¿Hay un asesor de SyH externo o un servicio de medicina laboral contratado?** Aparece como [confirmar] en `asesor_syh`.
4. **¿Quién es responsable de cada frente?** Sobre todo Administración, donde hoy no está escrito quién factura ni quién cobra, y Habilitaciones y Permisos. ¿Operaciones la lleva el coordinador o el dueño?
5. **¿Cuál es la banda de descuento** que Ventas puede dar sin consultar?
6. **¿Acepta que Seguridad e Higiene frene un armado sin consultarle?** La v2 lo deja escrito.
7. **¿Cuáles son los disparadores de lo «a crear»?** ¿Con cuántas obras en curso se suma un supervisor de obra? ¿Cuándo se separa Compras?
8. **¿Hay un abogado de iguala?** Si no lo hay, ¿la caja «Abogado (externo)» queda o se saca?
9. **¿Hay un encargado de depósito fijo,** o siempre es «el de turno»?
10. **¿Quiere una lámina aparte de familia y socios** (quién es socio, quién trabaja y en qué función), separada del organigrama operativo?

## 7. «Seguí el papel» con el flujo real (propuesta, sin implementar)

Los circuitos actuales (`src/lib/organigrama/circuitos.ts`) cuentan el viaje de SOL → OPC → RS → … → ICO, que no existe.

**Ojo al publicar la v2.** Esos circuitos tienen paradas en `stock`, `despacho`, `devoluciones`, `control` y `cobr`, que desaparecen. Las paradas siguen leyéndose, pero el papel no viaja a esas cajas (handoff, «Riesgos»). Conviene reemplazar los circuitos en el mismo momento en que se publica la v2.

Los «papeles» de abajo son documentos y datos que ya existen. El tipo `Parada["papel"]` habría que ampliarlo con estos códigos (no son siglas nuevas, son ids internos): `venta`, `ot`, `permiso`, `habilitacion`, `tablero`, `hoja`, `lista_carga`, `parte`, `informe`, `factura`. El test de `circuitos` tendría que validar las claves contra la v2.

### A. «De la consulta a la obra armada»
`ventas` → `oficina_tec` → `ventas` → `habilitaciones` → `planif` → `deposito` → `logistica` → `montajes` → `planif`

1. `ventas` (papel `venta`): cotiza con el Asistente comercial y carga la modalidad de permiso.
2. `oficina_tec` (papel `venta`): releva y define el sistema; si supera los 6 m, prepara la memoria.
3. `ventas` (papel `ot`): confirma la venta en Odoo y nacen las OT.
4. `habilitaciones` (papel `habilitacion`): hace el triage y habilita la obra (avisa por campanita y #syh).
5. `planif` (papel `tablero`): ubica la obra en el Tablero; si hay candado, espera el permiso (circuito B).
6. `planif` (papel `hoja`): arma la Hoja del día: capataz, viaje y chofer.
7. `deposito` (papel `lista_carga`): prepara la carga según la Lista de carga.
8. `logistica` (papel `lista_carga`): viaje «lleva»; controla la carga antes de salir. *A crear: constancia de entrega.*
9. `montajes` (papel `parte`): arma y el capataz declara el parte.
10. `planif` (papel `parte`): valida el parte (transitorio: lo carga la oficina).

### B. «El permiso de vía pública»
`ventas` → `permisos` → `firmante` → `seguros` → `permisos` → `gestion` → `planif`

1. `ventas` (`venta`): carga la modalidad de permiso y le manda el link del portal al cliente.
2. `permisos` (`permiso`): abre el trámite y persigue al cliente por lo que falta.
3. `firmante` (`permiso`): firma el informe técnico y la encomienda en el CPAU.
4. `seguros` (`permiso`): endoso de RC con el GCBA como coasegurado.
5. `permisos` (`permiso`): el robot presenta en TAD; se subsanan las observaciones.
6. `gestion` (`permiso`): sale el permiso y se levanta el candado.
7. `planif` (`tablero`): la obra pasa a planificable. *A crear: renovación 30 días antes del vencimiento.*

### C. «El parte del día»
`planif` → `montajes` → `planif` → `oficina_tec` → `personal` → `admin`

1. `planif` (`hoja`): define en la Hoja del día quién está a cargo.
2. `montajes` (`parte`): el capataz declara horas, avance, adicionales y esperas, y manda las fotos del as-built.
3. `planif` (`parte`): la oficina valida el parte (hoy lo reconstruye).
4. `oficina_tec` (`parte`): valida el as-built antes del desarme.
5. `personal` (`parte`): la asistencia del día queda cargada para los sueldos.
6. `admin` (`informe`): horas reales contra estimadas en el Informe de obra.

### D. «Desarme y cierre de la obra»
`ventas` → `habilitaciones` → `planif` → `montajes` → `logistica` → `deposito` → `taller` → `admin` → `fact`

1. `ventas` (`ot`): emite la OT de desarme en Odoo.
2. `habilitaciones` (`habilitacion`): hace el triage de nuevo.
3. `planif` (`hoja`): planifica el desarme.
4. `montajes` (`parte`): desarma y declara el parte (con sus horas, no las del armado).
5. `logistica` (`lista_carga`): viaje «trae».
6. `deposito` (`lista_carga`): cuenta al descargar; el conteo que vale es el del depósito. *A crear: constancia de devolución.*
7. `taller` (`lista_carga`): repara lo dañado. *A crear: clasificar bueno / a reparar / baja.*
8. `admin` (`informe`): el Informe de obra se genera al pasar a «Desarmado»; Administración marca lo que no cierra. *A crear: conciliación de material.*
9. `fact` (`factura`): factura y cobra en Odoo.

El circuito viejo de remitos (SOL…ICO) puede quedar como **meta de control**: una quinta opción «Cómo debería viajar el material (a crear)», con todas sus paradas en `deposito`, `logistica`, `montajes` y `admin`, presentada como objetivo y no como práctica. Lo mismo vale para `DOCUMENTOS` en `estructura-base.ts` y para el buscador de documentos (modulo.md § 1): hoy presentan esas siglas como si existieran.

## 8. Cómo cargarla

Desde la raíz del repo principal, donde está el link de Supabase:

```bash
npx supabase db query --linked -f supabase/scripts/organigrama-estructura-v2.sql
```

Qué hace y qué no:
- **Si ya hay un borrador, aborta sin tocar nada** («publicá o descartá el borrador actual primero»).
- **Si no hay borrador:**
  - crea uno basado en la versión vigente;
  - escribe los 27 nodos con la función interna `org_escribir_nodos`, que es la misma que usan las RPC.
- **No toca** la versión publicada, `org_ocupantes` ni las notas internas.

Después:
1. Abrir `/organigrama/lienzo`: aparece «Borrador» con la v2.
2. Revisar y ajustar lo que haga falta.
3. Publicar desde Versiones con una nota, o descartar.
4. Al publicar, los 9 nodos eliminados liberan su clave solos.
5. Ubicar a la gente arrastrando desde el banco, y a los externos con «¿Es de afuera?».

**Prueba en seco (12/10)**, contra la base real y dentro de `BEGIN … ROLLBACK`:
- **Camino feliz:**
  - 1 borrador con 27 nodos (1, 7 y 19 por nivel);
  - 15 claves reutilizadas y 12 nuevas;
  - `montajes` con fuente `cuadrillas`;
  - 0 ocupantes;
  - la vigente sigue con 24 nodos.
- **Segunda corrida en la misma transacción:** aborta con el mensaje del borrador.
- **Publicación simulada:** queda la v2 con 27 nodos, la v1 pasa a archivada y se liberan las 9 claves que salen (`cobr`, `control`, `despacho`, `devoluciones`, `mant`, `sistemas`, `stock`, `supervision`, `vehiculos`).
- **Después de las pruebas:** la base sigue con 1 versión, 0 borradores, 24 nodos y 0 ocupantes.

`estructura-base.ts`, la siembra de la migración (base vacía), sigue siendo la v1. Si la v2 se publica y se confirma, conviene actualizarla también: regenerar el JSON de la migración y `datos.test.ts`. Así una base nueva arranca con la v2.
