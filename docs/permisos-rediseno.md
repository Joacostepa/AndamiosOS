# Permisos de andamio: revisión y propuesta de rediseño

9 de octubre de 2026. Se revisaron la bandeja, Seguimiento, la ficha del trámite y la ficha del expediente, contra el código, la captura de JS y datos reales: SELECT de Supabase, lecturas de Odoo y 3 PDF del bucket. Hubo tres revisiones en paralelo: el flujo de trabajo, la ficha a fondo, y lo visual con los textos. Los errores de funcionamiento que aparecieron se corrigieron esa misma noche (§2).

Maqueta: https://claude.ai/artifact/1heoqTfpqPKBvfZy8M3enr. Tiene la lista, la ficha de Echeverría 2931, Corrientes 985 y Escalada 2138, los tres diálogos y el celular de la vendedora (Doblas 141).

> **Estado: implementado el 09/10** (ver `docs/handoff-gestoria-permisos.md` § "Rediseño implementado"). Todo § 4 a § 7 y los errores E2–E9. Quedan: los avisos por persona (§ 6, grande 6), la tarea `tad_subsanar` del robot, y E1 como dato (se corrige desde la ficha). Para que el endoso salga solo hay que prenderlo en Configuración.

---

## En dos minutos

- **Nada dice en qué está un trámite ni a quién le toca.** La bandeja y Seguimiento calculan las 7 etapas, quién lo tiene y desde cuándo (`etapasDe`), pero la ficha no usa ese cálculo y arriba dice "Trámite nuevo" siempre, también con el permiso emitido. Echeverría 2931 lleva 13 días trabada y la ficha lo esconde: el acta observada está al final de la lista.
- **"Esperan a ABA" no espera a ABA.** Las 4 filas de esa sección esperan al cliente. Tamara pide el endoso cuando el legajo está completo (17 de 22, dentro de las 2,5 h del último papel), pero la app lo marca como pendiente apenas el cliente carga el dueño. Lo que sí le toca hacer está en otras secciones: perseguir al cliente, subsanar, confirmar una venta.
- **El tramo más largo no tiene dueño.** Los 27 links fueron a la vendedora y la app no sabe si el cliente los abrió. Tampoco hay recordatorios. Doblas 141 lleva 14 días sin que el cliente entre, y Seguimiento estima que "se presenta mañana".
- **Subsanar no tiene camino.** Las 3 observaciones del Gobierno fueron por el acta y la nota que arma la app. La ficha del expediente muestra el motivo y sólo deja tocar la póliza; en la del trámite, esos dos papeles figuran "Lista".
- **Lo peligroso no tiene freno y lo inocuo es naranja.** "Armar la encomienda ahora" paga $50.000 sin confirmación. "Generar informe técnico y croquis" es el único botón primario fijo y se ve aun con el trámite presentado.
- **En tema claro, las fichas no se leen.** El chip "Lista" da contraste 1,18:1, cuando AA pide 4,5:1. Hay 42 colores pensados sólo para tema oscuro.
- **La propuesta:**
  - **un solo módulo.** Una lista de todos los permisos, con la línea de 7 etapas en cada fila y una sección **"Te toca"** con nombre de persona.
  - **una sola ficha por permiso**, que fusiona trámite y expediente. Arriba, una tarjeta que contesta "qué etapa, qué falta, quién y desde cuándo", con un único botón principal. Los papeles al centro, con los problemas primero.
  - **las acciones irreversibles**, sólo en esa tarjeta y con un diálogo que muestra qué sale, a quién y cuánto cuesta.

---

## 1. Diagnóstico

Ordenado por cuánto le cuesta a la oficina en el día a día.

### D1. La ficha no dice en qué etapa está, qué falta, quién lo mueve ni desde cuándo

- **El cálculo existe y la ficha no lo usa.** `etapasDe` y `resumirEtapas` (`seguimiento.ts:83-201`) ya calculan las 7 etapas, quién tiene cada una y desde cuándo. También existe la fecha estimada (`analizar`). La ficha del trámite no usa nada de eso.
- **El encabezado miente.** Dice "Trámite nuevo" siempre (`tramites/[id]/page.tsx:62`), también en S02437 (presentado) y en los 11 emitidos.
- **El orden esconde el problema** (captura de Echeverría 2931, S02672):
  1. el link del portal a todo lo ancho;
  2. "Pedir endoso a Segucom" en naranja;
  3. "Legajo · 6 de 7", cuando hay 5 aprobados: el contador cuenta el observado (`:165`);
  4. el acta observada al final, debajo del pliegue, porque los papeles van por orden de creación;
  5. otro botón naranja ("Generar informe…"), "Armar la encomienda ahora" (fallaría: no hay informe), los campos para subir el certificado y los 11 casilleros de TAD, que repiten los papeles.
- **Lo que no dice en ningún lado:** "13 días esperando al cliente" y "el endoso espera tu botón hace 13 días".
- **Lo que cuesta.** Tamara y las vendedoras leen de 7 a 11 bloques para deducir el estado. JS lo deduce mirando Seguimiento.

### D2. "Esperan a ABA" se llena con cosas del cliente y esconde las de ABA

- **La regla del código.**
  - La póliza queda en "Falta tocar «Pedir endoso»" apenas el cliente carga el dueño (`seguimiento.ts:107`).
  - Todo lo trabado va a "Esperan a ABA", aunque lo tenga el cliente (`bandeja.ts:64`).
  - Lo trabado tapa el botón pendiente (`seguimiento.ts:197`).
- **Lo que hace Tamara.**
  - 17 de 22 endosos salieron dentro de las 2,5 h del último papel del cliente.
  - Los 5 nunca pedidos son de legajos incompletos.
  - Paraná 631 muestra por qué conviene esperar: el cliente cargó como dueña a la constructora y al día siguiente la cambió por el consorcio.
- **Las 4 filas de hoy esperan al cliente:**

  | Obra | Hace | Qué falta |
  | --- | --- | --- |
  | Florida 868 (S01258) | 21 d | aviso de obra |
  | Pueyrredón 1774 (S02454) | 2 d | aviso de obra |
  | Echeverría 2931 (S02672) | 13 d | acta con mandato vencido el 31/08 y constancia de CUIT |
  | Paraná 631 (S02695) | hoy | acta con mandato vencido en 2011 |

- **Seguimiento clasifica distinto a los mismos cuatro:** dos en rojo ("Necesitan algo") y dos en gris ("Armando").
- **Lo que cuesta.** Una sección ámbar le muestra a Tamara, durante 21 días, algo que ella decidió esperar. Aprende a no mirarla.

### D3. El tramo del cliente es el más largo y nadie lo persigue

- **El link nunca va directo al cliente.** 27 de 27 fueron a la vendedora: `link_al_cliente = false` desde el 17/09.
- **No se registra si el cliente abrió el portal**, y no hay recordatorios al cliente. El diseño los pedía y no se construyeron.
- **Cuánto tarda el cliente en cargar el dueño.** La mediana es de 5 h, pero 7 de 27 tardaron 5 días o más, o nunca lo cargaron: Pueyrredón 1774 (20 d), Doblas 141 (nunca, 14 d), Honduras 4586 (12 d), Corrientes 4285 (8 d), Escalada 2138 (7,9 d), Acuña de Figueroa 1312 (6 d) y Tres Sargentos 436 (5,2 d).
- **Sin mail no hay corrección.** 9 de 27 clientes no tienen mail en Odoo, así que el pedido de corrección no sale. Florida 868 lo dice en el historial desde el 18/09.
- **Las estimaciones tapan lo trabado.**
  - Seguimiento dice "presentación aprox. sáb 10/10" para Doblas, Florida y Pueyrredón: la misma fecha para las tres. Sale de `max(mañana, abierto + 3,8 d)` (`seguimiento/page.tsx:65-67`).
  - Para dos trámites dice "permiso aprox. dom 11/10": un domingo.

### D4. Subsanar no tiene camino en la app

- **Las tres observaciones del Gobierno a trámites de la app fueron por papeles que arma la app** y el cliente firma en el portal:
  - Tres Sargentos 436: acta incompleta.
  - Santa Fe 3085: sin firma.
  - Corrientes 985 (S02711): "acta y nota con mal el DNI de la Sra. Leticia Aquino", pendiente desde el 06/10. Se firmaron con DNI 2757770, de 7 cifras, y el portal lo aceptó.
- **En la ficha del expediente** (adonde lleva "Necesitan acción") están el motivo y un bloque que sólo maneja la póliza. No hay link a la ficha del trámite.
- **En la ficha del trámite** el acta y la nota figuran "Lista", y no hay forma de pedirle al cliente que firme de nuevo. La tarea `tad_subsanar` está en el diseño y no en el código.
- **El historial está partido.** La observación vive en los 5 eventos del expediente; la firma con el DNI mal, en los 81 del trámite.

### D5. Una obra está en cuatro lugares y cada uno cuenta distinto

- **Al presentarse, el trámite cambia de ficha.** La bandeja manda a la del expediente, que no tiene papeles, portal ni encomienda. La ficha del trámite sólo se alcanza desde Seguimiento → expandir → "Abrir la ficha del trámite".
- **Seguimiento ve sólo los 27 trámites abiertos en la app.** No aparecen 26 de los 45 expedientes vigentes ni las ventas por iniciar. Los 591 históricos no tienen dirección.
- **Los números no cierran.** Seguimiento dice "En el GCBA 10 · Emitido 11"; la bandeja, "Esperando al Gobierno 13 · Permiso emitido 31". De 7 trámites que piden algo, 5 cambian de grupo o de color entre una pantalla y otra.
- **Hasta hoy, Acuña de Figueroa 1312 salía dos veces en la bandeja:** en "En curso" ("sin presentar") y en "Esperando al Gobierno". Se corrigió el vínculo (§2).
- **Los nombres no coinciden.**
  - "Tramitación" significa "salió el permiso" en la bandeja, y Seguimiento escribe "En tramitación" como si siguiera en curso.
  - La columna "Cliente" de Seguimiento muestra al dueño del lote.
  - Seguimiento muestra claves internas («Cierre en «pagada»»).
- **"Permiso emitido" mezclaba cosas.** De 31 filas, 6 no tenían permiso real: 2 falsos (§2) y 4 archivados sin permiso que se pintan de verde porque `tipos.ts:588-592` trata "archivado" como emitido.

### D6. Lo peligroso no tiene freno y lo más visible es inocuo

- **Encomienda.**
  - "Armar la encomienda ahora" finaliza en el CPAU a nombre de Hougassian, firma y paga $50.000. Es un botón con borde y no pide confirmación (`encomienda-cpau.tsx:90-94`).
  - Aparece aunque el legajo esté incompleto: el servidor sólo exige dueño e informe (`encomienda.ts:72-75`). Se usó 23 veces.
  - "Volver a armarla" tampoco confirma, ni siquiera cuando el error dice que falló después de tocar Finalizar (`:225, :244`).
- **Mails afuera con un clic.** Pedir endoso, Pedir corrección y Reenviar link no muestran a quién va ni qué sale. En modo supervisado, "Reenviar" va a la vendedora y el botón no lo dice.
- **Las confirmaciones que hay son `window.confirm`.** Son 6, y es el único módulo de la app que lo usa. El título lo pone el navegador ("andamios-os.vercel.app dice"), los botones dicen Aceptar o Cancelar sin verbo, el foco arranca en Aceptar y no hay estilo destructivo.
- **Sin confirmación:** "Descartar" la encomienda, "Volver a pedir" el endoso desde el expediente y "Borrar la prueba".
- **El naranja cae donde no corresponde.** El único botón primario fijo es "Generar informe técnico y croquis" (`generar-documentos.tsx:67`), que regenera documentos internos. "Presentar ahora" y "Armar la encomienda", que son justo el paso que falta, van con borde.
- **Cualquier vendedora puede pagar o presentar.** El rol Comercial tiene "editar" (`lib/auth/acceso.ts:145`).

### D7. Salir de una presentación frenada empuja al camino que no funciona

- **El botón principal es el que no anda.** Con un borrador pendiente, "Seguir desde el borrador" es el principal y "Empezar de cero" queda en gris.
- **Los números.** Seguir desde el borrador se pidió 11 veces. Funcionó 2 veces, las dos el 15/09; desde entonces, 0 de 8. Al reabrir, TAD muestra el paso 2 con sólo "Datos del Trámite", sin los casilleros.
- **El reintento dice "No hace falta tocar nada"** (`presentacion-tad.tsx:105-107`) y programa 16 intentos, aunque el error sea que el borrador no abre.
- **La salida real, el 09/10 con S02437:** "Dejar de reintentar" → "Empezar de cero" → "Volver a presentar". Fueron 3 botones, en 3 estados distintos, con 3 confirmaciones nativas, y hubo que repetirlo.
- **La confirmación de "Empezar de cero" exige algo que no se hace.** Pregunta "¿Ya borraste el borrador en TAD?", y nunca se borra antes: hay 3 borradores pendientes de borrar. La pantalla entrena a contestar "sí" a algo falso.
- **Los IF sueltos sólo constan en el handoff.** La API trae sólo la última tarea, así que la ficha no muestra los intentos anteriores.

### D8. En tema claro, las fichas no se leen

- **Las fichas se escribieron para tema oscuro.** 42 clases `text-*-300/400` no tienen su par `dark:`, y el mapa de colores está duplicado (`tramites/[id]/page.tsx:28-35`, `documentos-tramite.tsx:20-27`).
- **Contraste medido en claro** (AA pide 4,5:1 para texto y 3:1 para íconos):

  | Qué | Claro | Oscuro |
  | --- | --- | --- |
  | Chip «Lista» | **1,18** | 11,8 |
  | Chip «Pedido» | **1,15** | 12,1 |
  | Chip «Revisando/Cargado» | **1,46** | 9,7 |
  | Chip «Observada» | **1,49** | 9,4 |
  | Texto verde (Presentado, Listo) | **1,34** | 14,4 |
  | Texto azul (robot trabajando) | **1,73** | 11,1 |
  | Texto rojo (errores) | **1,84** | 10,5 |
  | Texto naranja (avisos) | **2,28** | 8,5 |
  | Ícono de chequeo OK | **1,70** | 11,3 |

- **El color no significa lo mismo en todas las pantallas.**
  - "Lo tiene: ABA" va en rojo dentro de una sección ámbar.
  - El chip "Iniciación" (presentado, esperando al Gobierno) es ámbar, color de advertencia.
  - Las fichas usan naranja para avisos en 9 lugares, cuando quedó reservado para la acción principal.
- **Seguimiento.** El "!" blanco sobre rojo da 3,82, el ✓ blanco sobre verde 2,22 y el punto pendiente 1,35: el estado "pendiente" no se distingue del fondo.
- **En el celular.** Las acciones miden 28 px de alto, los links a PDF unos 16 px, y el título de la ficha del expediente queda en una palabra por renglón.

### D9. Los avisos no le llegan a quien tiene que actuar

- **Volumen y destino.** Desde el 14/09 hubo 324 avisos de permisos, unos 14 por día, todos al rol "operativo".
- **Quién los lee.** JS leyó 164 y Ezequiel 163, aunque Ezequiel no tiene el módulo. Tamara, Agustina, Sandra y Rocío no leyeron ninguno, de ningún tipo.
- **Casi todo es informativo.** Sólo 54 de 324 (17 %) piden algo: el resto es "póliza lista", "encomienda pagada" o "pasó a Guarda temporal".
- **Ejemplo.** "Pedí el endoso a Segucom — Echeverría 2931", del 26/09: nadie lo abrió.

### D10. "Ventas por iniciar" nunca baja

- **Hay 5:** Valle 510 (1 d), Arenales 1750 (2 d), Simbrón 3008 (17 d), La Plata 2552 (52 d) y Entre Ríos 149 (59 d).
- **Las dos de agosto no se pueden sacar.** Dicen "con expediente" y probablemente se tramitan por fuera. El "5 ventas por iniciar" del encabezado queda fijo.
- **No hay color de demora.** "Vendida hace 17 días" se ve igual que la de ayer.
- **Quién inicia.** Tamara inició 23 de 29, Rocío 3 y JS 3. Agustina tiene sólo "ver" y sus ventas las inicia otra persona.

---

## 2. Errores de funcionamiento

### Corregidos el 09/10 a la noche

| Error | Qué se hizo |
| --- | --- |
| **Dos permisos falsos en Odoo.** Triunvirato 4528 (S02563) y Corrientes 2810 (S02128) pasaron a Guarda temporal sin resolución. El robot guardó como permiso nuestra nota de solicitud (IF-2026-42727758 e IF-2026-41876699) y a las 17:38 escribió `emitido` en Odoo. Triunvirato está planificada para el 19/10 y se arma "con el permiso emitido". Causa: `bajarPermiso` buscaba "PERMISO", que está en el nombre del trámite | Odoo de las dos volvió a "presentado" sin fecha de permiso. Se sacó el permiso falso de los 2 expedientes y de un histórico con el mismo problema (EX-2026-31668214, una nota de prórroga). El robot ahora exige la notificación "NOTIFICACION PERMISO" con una resolución `RS-`; reinstalado en la Mac mini. Script: `scripts/_tmp-corregir-permisos-falsos.mjs` |
| **S02521 se podía presentar sola otra vez.** Presentado a mano el 02/10 (EX-2026-44242731), el trámite quedó sin `expediente_id`. Con la constancia de CUIT aprobada, el barrido lo mandaba a la cola | Trámite atado al expediente y en "presentado" |

**Pendiente de personas:**
- Avisarle a Agustina que Triunvirato no tiene permiso.
- Ver en TAD por qué el Gobierno archivó esos dos expedientes.
- "Confirmar venta" de EX-2026-44242731 en la bandeja, para que el robot escriba S02521 en Odoo: hoy dice `x_tramite_estado` vacío.

### Sin corregir

| # | Error | Dónde |
| --- | --- | --- |
| E1 | **El dueño del lote de Echeverría 2931 está roto:** `"CONSORCIO… ECHEVERRIA nú3 meros 2931/33/35…"`, con comillas y la codificación mal. Así iría a Segucom y al CPAU, y la ficha no permite corregirlo | dato del portal |
| E2 | `permiso_vence` vacío en 16 de 25 permisos, todos los emitidos desde el 18/09. Las resoluciones nuevas dicen "por el término de 6 meses" y el parser sólo entiende "hasta el día…". Nadie sabe qué vence ni cuándo renovar | `robot/permiso.mjs:27` |
| E3 | En un expediente sin trámite, "Pedir endoso" crea un trámite nuevo y pide otro endoso, aunque la venta ya tenga trámite con la póliza OK | `api/.../[id]/endoso/route.ts:55-66` |
| E4 | La alerta "Elegir el expediente — Vincularlo a mano" lleva a una ficha donde no se puede vincular | `worker-tad.mjs`, presentado_varios |
| E5 | Con un borrador que no abre, el robot programa 16 reintentos y dice "No hace falta tocar nada" | robot y `presentacion-tad.tsx:105-107` |
| E6 | El portal aceptó un DNI de 7 cifras al firmar: es el origen de la subsanación de S02711 | portal, firma |
| E7 | "Volver a armarla" se ofrece sin confirmación aunque la encomienda ya se haya finalizado | `encomienda-cpau.tsx:225, 244` |
| E8 | Tres expedientes viejos encabezan "Esperando al Gobierno" con "hace 25 días", porque se cuenta desde que el robot los vio y no desde la presentación: S00153 (presentado el 11/12/2025), Salcedo (08/04/2026) y S02259 (10/08). En Odoo siguen "presentado". Hay que decidir si están muertos | `page.tsx:465` |
| E9 | Confirmar el vínculo de un expediente presentado a mano no ata `pvp_tramites.expediente_id`: es lo que dejó suelto a S02521 | confirmación del vínculo |

---

## 3. Principios del rediseño

1. **Un permiso por venta y una sola pantalla para buscarlo.** No importa si se abrió en la app, se presentó a mano o es de antes.
2. **Cada permiso tiene una próxima acción, un responsable con nombre y un "desde cuándo".** "ABA" deja de ser un responsable: es Tamara, la vendedora, JS, o el cliente a través de la vendedora.
3. **La ficha contesta arriba las cuatro preguntas:** qué etapa, qué falta, quién lo mueve y desde cuándo. Tiene un único botón principal, y es lo que le toca a la oficina.
4. **Las tres pantallas cuentan lo mismo.** La lista, la fila y la ficha salen de un mismo cálculo (`etapasDe`) con las reglas corregidas (§6).
5. **Cada bloque aparece sólo cuando corresponde.** "Subir certificado" sólo mientras se espera el mail, "Generar" sólo si falta, el robot sólo cuando tiene algo que contar.
6. **Cuatro niveles de acción.** Lo irreversible (plata, IF oficiales, declaración jurada) va sólo en la tarjeta de estado, con un diálogo que muestra los datos exactos y un botón con verbo y consecuencia.
7. **La pantalla dice la verdad del robot.** Si un camino no viene funcionando, lo dice con el número y no lo ofrece como principal.
8. **Cada color significa una sola cosa** y se lee en claro y en oscuro.

---

## 4. Propuesta por pantalla

### 4.1 La lista "Permisos de andamio" (reemplaza bandeja y Seguimiento)

El menú "Gestorías" queda con una sola entrada. Seguimiento existía porque la bandeja no contestaba "¿en qué está?". Si cada fila trae la línea de etapas y la lista cubre todos los permisos, la segunda página sobra.

```
Permisos de andamio                         [Buscar dirección, S0… o EX-…]   Mías · Por vendedora · Todas   ⋯
Te toca: 4 · Esperando a otros: 14 · En el Gobierno: 13 · Robot: revisó TAD hace 6 min

TE TOCA (Tamara)
 ! Av. Corrientes 985 · S02711   El Gobierno pide subsanar el acta y la nota       hace 3 d   [Ver qué corregir]
 ○ Doblas 141 · S02685           El cliente no entró al portal (link a Agustina)  hace 14 d  [Recordar…]
 ○ Simbrón 3008 · S02665         Venta para iniciar                               hace 17 d  [Iniciar trámite]
 ○ Acuña de Figueroa 1312        Confirmar la venta del expediente presentado a mano hace 7 d [Es esta venta]

ESPERANDO A OTROS
 Cliente (4) · Segucom (1) · CPAU (0) · Robot (1: se presenta hoy a las 19) 
EN EL GOBIERNO (13)            con días desde la presentación y "permiso aprox." en días hábiles
EMITIDOS (25)                  con "vence dd/mm" y renovación a 30 días · archivados sin permiso aparte, en gris
HISTORIAL (591)                buscable por EX
```

- **"Te toca"** se filtra por la persona que entró; JS ve todo. Entran:
  - iniciar una venta;
  - pedir el endoso, con el legajo completo;
  - armar la encomienda;
  - subsanar;
  - confirmar la venta de un expediente;
  - un robot frenado;
  - decidir sobre un expediente viejo;
  - **perseguir al cliente** cuando pasa el umbral: 2 días sin cargar el dueño, o 3 días con algo observado o faltante.
- **"Esperando a otros"** se agrupa por quién. En el grupo del cliente se nombra a la vendedora y se dice si el cliente abrió o no el portal.
- **Emitidos:** sólo los que tienen resolución `RS-`. Los archivados sin permiso van aparte.
- **El modo supervisado y "Probar el circuito"** pasan a "⋯ Configuración": son ajustes, no trabajo del día.

### 4.2 La fila

```
Echeverría 2931 · S02672 · vendió Tamara           ✓──!──○──○──○──○──○    Lo tiene: Cliente · hace 13 d
Le falta: acta de asamblea vigente (mandato vencido el 31/08) y constancia de CUIT       [Recordar al cliente…]
```

- Dirección, venta y vendedora.
- La línea de 7 puntos (Inicio · Papeles · Póliza · Encomienda · Presentación · Gobierno · Permiso), con nombre en el lector de pantalla.
- "Próximo / Le falta", "Lo tiene: X · hace N d", con color de demora según los umbrales de `LIMITE`.
- Un botón como máximo, el de la próxima acción.

### 4.3 La ficha única

Fusiona la del trámite y la del expediente. La URL del expediente redirige a la del trámite cuando hay uno (21 de 45). Los expedientes sin trámite (24, de antes de la app o presentados a mano) usan el mismo esqueleto, sin papeles ni robot.

```
← Permisos de andamio                                                Venta S02672 ↗    ⋯
Echeverría 2931   [S02672] [Consorcio]
Consorcio de Propietarios … Echeverría 2931/33/35 · adm. Diana Eva Abasto · vendió Tamara · abierto el 24/09 (hace 15 d)

┌ ESTADO ──────────────────────────────────────────────────────────────────────────────┐
│ PAPELES DEL CLIENTE · FRENADO                              Lo tiene: Cliente · hace 13 d │
│ Le falta al cliente: acta de asamblea vigente y constancia de CUIT                       │
│ "El mandato venció el 31/08/2026." Se le pidió la corrección el 26/09 y no volvió a entrar.│
│ ┌ Te toca: Tamara ────────────────────────────────────────────────────────────────────┐ │
│ │ Recordarle a Diana Abasto que mande el acta vigente y la constancia de CUIT.         │ │
│ │                              [Recordar al cliente…]  [Copiar mensaje para WhatsApp]  │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ ✓ Inicio 24/09 ─ ! Papeles 5/7 ─ ○ Póliza ─ ○ Encomienda ─ ○ Presentación ─ ○ Gobierno ─ ○ Permiso │
└──────────────────────────────────────────────────────────────────────────────────────────┘
┌ PAPELES (2/3) ─────────────────────────────┐  ┌ DATOS (1/3) ───────────────────┐
│ Del cliente · Del seguro · De la oficina    │  │ Dueño del lote (con aviso)      │
│ [Ver por casillero de TAD]                  │  │ Cliente y portal                │
└─────────────────────────────────────────────┘  │ Venta y permiso pedido          │
┌ ROBOT (sólo si hay algo) ───────────────────┐  │ Expediente (si hay)             │
│ Encomienda del CPAU · Intentos en TAD        │  │ Para limpiar en TAD (si hay)    │
└─────────────────────────────────────────────┘  │ Robot: última señal             │
┌ HISTORIAL (unificado, plegado) ─────────────┐  └─────────────────────────────────┘
```

#### Tarjeta de estado: qué dice en cada situación

| Situación | Lo tiene | Título | Botón principal |
| --- | --- | --- | --- |
| El cliente no entró al portal (Doblas 141) | Cliente · 14 d | Esperando que el cliente entre al portal | Copiar link para WhatsApp |
| Papeles con algo observado (Echeverría) | Cliente · 13 d | Le falta al cliente: acta vigente y constancia de CUIT | Recordar al cliente… |
| El cliente cargó el dueño: el endoso sale solo | Segucom | Se le pidió el endoso a Segucom | — |
| El endoso no salió solo (dueño con caracteres raros) | Tamara | Revisá el dueño del lote antes de mandar el endoso | Mandar el endoso a Segucom… |
| Endoso pedido | Segucom · N d | Esperando el endoso de Segucom | — (secundario: Subir el PDF que mandó) |
| Listo para la encomienda | Tamara | Listo para armar la encomienda del CPAU | Armar la encomienda… (el robot hace todo, también el pago) |
| Robot cerrando la encomienda | Robot | El robot está cerrando la encomienda: va por «pagada» | — |
| Esperando el certificado | CPAU · N h | Enviada al CPAU: falta el certificado | — (secundario: Subir el certificado…) |
| Error después de Finalizar | Tamara | Revisá el Histórico del CPAU antes de volver a armarla | ninguno |
| Presentación programada | Robot | Se presenta hoy a las 19:00 | — (secundario: Presentar ya…) |
| TAD caído, reintenta | Robot | TAD no responde: reintenta a las 21:30 (2 de 16) | — |
| Borrador que no abre (S02437, tarea 92) | Tamara | TAD no abre el borrador 13232997 · reabrir funcionó 0 de 8 veces desde el 15/09 | Empezar de cero… |
| Frenada con borrador (S02437, tarea 87) | Tamara | La presentación se frenó: TAD no guardó la vigencia del seguro | Empezar de cero… |
| Presentado a mano (Acuña, hasta el 09/10) | Tamara | Se presentó a mano el 02/10: EX-2026-44242731 | Es este expediente |
| En el Gobierno | Gobierno · 3 d | Presentado el 06/10 · el Gobierno todavía no lo revisó · permiso aprox. 23/10 | — |
| Subsanación (Corrientes 985) | Tamara · 3 d | El Gobierno pide corregir el acta y la nota de solicitud (cita) | Reabrir acta y nota en el portal… (nuevo; mientras tanto, Copiar link) |
| Corregido, esperando | Gobierno | Corregido: espera que el Gobierno lo revise | — |
| Permiso emitido | — | Permiso emitido el 07/10 · vence el 07/04/2027 | Descargar permiso |

- **Si hay algo trabado y a la vez un botón pendiente, se muestran los dos.** Lo trabado va en el título y el botón en el recuadro "Te toca". Hoy lo trabado tapa el botón.

#### Papeles

```
DEL CLIENTE · 5 de 7 OK · 1 a corregir · 1 falta
 ! Acta de asamblea (designación)   A corregir   acta.pdf ↗   26/09
     No está vigente: el mandato venció el 31/08/2026.               [Recordar al cliente…]
 ○ Constancia de CUIT               Falta
 ✓ Acta de compromiso    Firmada en el portal por Diana Abasto (DNI 22.048.405) · 26/09   PDF ↗
 ✓ Nota de solicitud     Firmada en el portal por Diana Abasto (DNI 22.048.405) · 26/09   PDF ↗
 ✓ Reglamento de copropiedad   reglamento.pdf ↗   3 controles OK ▸
 ✓ DNI del administrador       dni diana.pdf ↗    3 controles OK ▸
 ✓ Aviso de obra               IF-2026-41068696….pdf ↗   2 controles OK ▸
DEL SEGURO
 ○ Póliza (endoso)   Sin pedir · se pide desde el estado de arriba
DE LA OFICINA
 ○ Informe técnico y croquis   Se generan solos con los papeles completos
 ○ Certificado de encomienda   Se arma con los papeles completos
```

- **Orden:** a corregir, falta, en revisión y OK. El conteo cuenta sólo los OK.
- **Los controles de la revisión automática** se pliegan cuando están todos OK.
- **Firmados en el portal:** se ve el DNI con puntos. Si tiene menos de 8 cifras, avisa: "DNI de 7 cifras: revisalo" (S02711).
- **En una subsanación:** los papeles que nombra el Gobierno llevan "Observado por el Gobierno el 06/10".
- **"Ver por casillero de TAD"** muestra los 11 casilleros con sus documentos. Hoy es un bloque fijo que repite los papeles.

#### Robot (aparece sólo si hay al menos una tarea)

- **Encomienda:** una línea de 5 pasos con hora (Finalizada · Firmada · Pagada · Enviada al CPAU · Certificado), el n.º de registro, la operación y el certificado.
- **Intentos en TAD:** una fila por tarea. La API tiene que traer todas, no sólo la última. Ejemplo con S02437:

  | # | Cuándo | Resultado | Borrador | IF |
  | --- | --- | --- | --- | --- |
  | 96 | 09/10 20:37 | Presentado · EX-2026-45490918 | 13259366 | 11 |
  | 94 | 09/10 20:13 | Frenó: el Informe Técnico no quedó en el casillero | 13259218 · descartado | 2 sueltos |
  | 92 | 09/10 19:40 | Seguir desde el borrador: TAD no mostró los documentos | 13232997 | 0 |
  | 87 | 07/10 19:00 | Frenó: TAD no guardó la vigencia del seguro | 13232997 · descartado | 11 sueltos |

#### Datos (columna derecha)

- **Dueño del lote:** titular, CUIT, tipo e inquilino. Si el nombre trae comillas, caracteres raros o un dígito pegado a letras, avisa en ámbar: "Así va a Segucom y al CPAU: revisalo [Corregir]".
- **Cliente y portal:**
  - link truncado con [Copiar];
  - "Enviado a Tamara el 24/09 para que se lo pase al cliente";
  - "El cliente abrió el portal el 26/09" (nuevo);
  - [Reenviar a Tamara…], con el destinatario real en el botón.
- **Expediente:** EX, fecha de presentación, SMP, estado en TAD, carátula ↓, permiso ↓ (sólo `RS-`), vencimiento y el vínculo con la venta.
- **Para limpiar en TAD:** los borradores descartados que siguen en TAD, con [Ya los borré].
- **Robot:** "La Mac mini dio señales hace 12 min" (de `pvp_robot`). En rojo si se pasa del margen.

#### Historial

- Une los eventos del trámite y del expediente.
- Va por día, con etiqueta y actor: Cliente · Revisión automática · Robot · Persona · Segucom · Gobierno.
- Los pares "subido → revisado" van en una línea.
- Muestra las últimas 10, con "Ver todo (81)" y filtros.

### 4.4 Acciones y diálogos

| Nivel | Acciones | Dónde | Freno |
| --- | --- | --- | --- |
| 0 · inocuas | Copiar link, ver PDF, capturas, carátula, permiso | Enlaces y botones grises | Ninguno |
| 1 · internas y reversibles | Generar informe, Dejar de reintentar, Descartar encomienda sin finalizar, Borrar prueba | Secundarias o `⋯` | Toast con Deshacer; Borrar prueba con diálogo |
| 2 · mandan algo afuera | Pedir endoso, Recordar al cliente, Reenviar link, Confirmar venta (escribe Odoo) | Tarjeta de estado o `⋯` | Diálogo con destinatario y contenido |
| 3 · irreversibles | Armar la encomienda, Volver a armarla, Reanudar el cierre, Presentar en TAD, Empezar de cero | **Sólo en la tarjeta de estado y sólo en su estado** | Diálogo destructivo con los datos exactos; foco inicial en Cancelar |

- Siempre `ConfirmDialog`, que ya existe y ya usa la bandeja. Nunca `window.confirm`.
- **Pedir endoso:** el diálogo muestra lo que sale a Segucom (coasegurado, CUIT, administrador, "hasta") con [Corregir]. Con esto se habría visto el nombre roto de Echeverría.
- **Armar la encomienda:** es un solo botón y nadie paga a mano: el robot hace todo solo. El diálogo lo cuenta: "El robot la carga y la finaliza en el CPAU a nombre de Hougassian, firma el registro, la paga con la tarjeta ($50.000) y la envía. Finalizada no se deshace, y armarla de nuevo es otro pago." Muestra propietario, frente, m² y descripción. Botón: `Armar la encomienda`. Con los papeles incompletos no aparece.
- **Mandar el endoso a Segucom:** el endoso sale solo apenas el cliente carga el dueño del lote. El diálogo aparece sólo cuando no salió solo (el dueño tiene caracteres raros) o al pedirlo otra vez. Muestra lo que sale a Segucom (coasegurado, CUIT, administrador, "hasta") con [Corregir].
- **Presentar en TAD:** "Es una declaración jurada. El robot llena el formulario y adjunta 11 casilleros: cada adjunto queda como un documento oficial, aunque la presentación no termine." Fuera de horario, el botón es `Programar para las 19:00`, con un enlace secundario para presentar ya.
- **Empezar de cero:** un solo paso, en lugar de los tres de hoy (deja de reintentar, descarta y pide). Dice cuántos IF quedan sueltos y que el borrador pasa a "Para limpiar en TAD". No pide haber borrado nada.

### 4.5 Sistema visual

- **Paleta:** cada color significa una sola cosa. Son pares de Tailwind con su contraste medido sobre la card, en claro · oscuro:

  | Tono | Significa | Texto | Fondo | Contraste |
  | --- | --- | --- | --- | --- |
  | Bloqueo (rojo) | Frenado: hay que corregir | `text-red-700 dark:text-red-300` | `bg-red-500/10 dark:bg-red-500/15` | 5,56 · 8,24 |
  | Aviso (ámbar) | Ojo: demora, dato raro | `text-amber-800 dark:text-amber-300` | `bg-amber-500/10` | 6,60 · 9,63 |
  | En marcha (azul) | Lo tiene otro | `text-blue-700 dark:text-blue-300` | `bg-blue-500/10` | 6,06 · 8,44 |
  | Listo (verde) | Hecho o salió | `text-emerald-800 dark:text-emerald-300` | `bg-emerald-500/10` | 6,89 · 9,48 |
  | Neutro (gris) | Todavía no, o es un dato | `text-muted-foreground` | `bg-muted` | 5,34 · 5,55 |
  | Prueba (violeta) | Trámite de prueba | `text-violet-700 dark:text-violet-300` | `bg-violet-500/10` | 6,41 · 8,88 |

- **"Te toca" no lleva color:** es un chip lleno neutro (`bg-foreground text-background`). Es la señal más fuerte sin gastar el rojo.
- **Coral, sólo para la próxima acción:** un único botón por pantalla. El blanco sobre `--primary` da 3,89. Se propone `oklch(0.56 0.16 41)` (4,99) para el relleno de botones.
- **Chips:** un solo componente `<Chip tono>`, `rounded-full h-5 px-2 text-[12px]`, con ícono por tono para que no dependa del color. Como máximo dos por fila: estado y quién.
- **Botones:** primario coral (uno), secundario con borde, terciario `ghost` y peligroso `destructive` con diálogo. En el celular, `max-sm:h-10`.
- **Ficha:** `max-w-4xl`, secciones `rounded-md border bg-card`, título `text-2xl sm:text-3xl`, encabezado de sección de 14 px semibold como h2.
- **Fechas, con una sola función:** "hace 3 h" o "ayer 14:20" hasta 7 días; después "24/9 11:46"; el año sólo si no es el actual. Hoy hay 5 formatos.
- **El chequeo de contraste** está en el scratchpad de la sesión (`contraste-permisos.mjs`). Conviene llevarlo a `scripts/`, al lado de `contraste-tablero.mjs`.

### 4.6 Glosario (igual en la lista, la fila y la ficha)

| Concepto | Hoy | Propuesto |
| --- | --- | --- |
| Etapas | Abierto · Legajo del cliente · Póliza · Encomienda CPAU · Presentado en TAD · GCBA · Permiso | **Inicio · Papeles · Póliza · Encomienda · Presentación · Gobierno · Permiso** |
| Estado de una etapa | sin nombre visible | **Listo** ✓ · **En marcha** · **Frenado** ! · **Te toca** · **Todavía no** |
| Quién lo tiene | Cliente, Segucom, CPAU, Robot, GCBA, **ABA** | Cliente, Segucom, CPAU, Robot, **Gobierno**, **{nombre}** |
| Estado del expediente | Subsanación · tarea pendiente / Iniciación / Tramitación | **Hay que corregir** / **Presentado** / **Permiso emitido** / **Archivado sin permiso**, y debajo el estado literal de TAD |
| Documento | Falta · Pedido · Cargado · Revisando · **Lista** · **Observada** | Falta · Pedido · **Subido** · **En revisión** · **OK** · **A corregir** |
| Corregir | subsanar / subsanación / observado | **corregir**, con "(subsanación)" para la oficina |
| Vendedora | vendedor: / vendedora: / Vendedora | **Vendió: Tamara** |
| Dueño | Dueño del lote / Titular del lote / Propietario / «Cliente» en Seguimiento | **Dueño del lote**. «Cliente» es quien compró |
| Jerga del robot | IF, R.Nro, RETP, Plataforma, casillero | «documento oficial de TAD (IF)», «n.º de registro del CPAU», «enviada al CPAU», dentro de «Detalle del robot» |
| Modo supervisado | «Modo supervisado» | **«Qué sale solo»**, y en cada paso **Sale solo / Con botón** |

La tabla completa de textos, actual → propuesto con su archivo y línea, está en el Anexo A.

---

## 5. Qué se saca

- La página Seguimiento, que se funde en la lista.
- La ficha del expediente como página aparte: redirige a la del trámite.
- Las secciones "Esperan a ABA" y "Necesitan acción": las reemplaza "Te toca".
- "Trámite nuevo" fijo en el encabezado.
- "Generar informe técnico y croquis" como primario siempre visible.
- "Subir certificado" siempre visible.
- "Seguir desde el borrador" como botón principal.
- El link completo en un input.
- Los 11 casilleros de TAD como bloque fijo: pasan a vista alternativa de Papeles.
- La lista aparte "Documentos de ABA y del seguro": se suma a Papeles.
- Los `window.confirm`.
- El panel del modo supervisado en la pantalla de trabajo.
- Los avisos informativos en la campanita: quedan en el historial.

---

## 6. Plan

### Reglas que cambian (antes que la pantalla)

- **El endoso sale solo apenas el cliente carga el dueño del lote** (decidido por JS el 09/10). Es lo que ya hace el código con `endoso_automatico` prendido (`portal.ts:350`). Antes de prenderlo hay que frenarlo cuando el nombre del dueño tiene caracteres raros (E1), para que no le llegue roto a Segucom. Ojo: si el cliente cambia el dueño, como pasó en Paraná 631, sale un segundo pedido a Segucom.
- **Lo trabado por el cliente es del cliente.** La oficina aparece sólo al pasar el umbral, como "perseguir".
- **La edad en el Gobierno se cuenta desde `creado_tad`**, no desde `estado_desde`.
- **Emitido es sólo con resolución `RS-`.** "Archivado sin permiso" es otro estado.
- **Las estimaciones van en días hábiles.** Si el trámite está trabado, en vez de fecha dice "Frenado: depende del cliente".
- **Los avisos van a la persona responsable** (`alertas.destinatario_id` existe y no se usa) y sólo avisan lo que pide algo.

### Chicos (horas): se pueden hacer ya, cada uno por separado

1. Pares claro/oscuro en las dos fichas: es un único mapa `TONO` y saca los 42 colores sólo oscuros.
2. Contador "N de M" que cuente sólo los OK, y papeles ordenados con los problemas primero.
3. Encabezado de la ficha con la etapa real en lugar de "Trámite nuevo".
4. `ConfirmDialog` en las 6 confirmaciones nativas y en las 3 acciones que hoy no confirman ("Armar la encomienda", "Volver a armarla", "Descartar").
5. "Empezar de cero" como principal cuando el borrador no abre, y en un solo paso.
6. "Generar" y "Subir certificado" sólo cuando corresponden.
7. Link entre las dos fichas, en los dos sentidos.
8. Aviso en el dueño del lote con caracteres raros, y edición desde la ficha (E1).
9. Parser de vencimiento "por el término de 6 meses", y releer los 16 permisos del bucket (E2).
10. Confirmar un vínculo de expediente ata también el trámite (E9).
11. Endoso automático al cargar el dueño: frenarlo si el nombre del dueño tiene caracteres raros y prender `endoso_automatico`. Va después del punto 8.

### Grandes (días)

1. **La tarjeta de estado de la ficha**, con `etapasDe` y la tabla de situaciones de §4.3.
2. **Lista única con "Te toca"**: fusión de bandeja y Seguimiento, con filtros por persona.
3. **Ficha única:** redirección del expediente, historial unificado y API con todas las tareas.
4. **Perseguir al cliente:** `portal_visto_at`, recordatorios y "Le avisé por WhatsApp" con fecha.
5. **Subsanar:** reabrir acta y nota en el portal con el motivo del Gobierno y, más adelante, la tarea `tad_subsanar` del robot.
6. **Avisos por persona.**

---

## 7. Decisiones

**Decidido por JS el 09/10:**
- **Encomienda:** un solo botón, "Armar la encomienda", y el robot hace todo solo, también el pago con la tarjeta. Ninguna persona paga.
- **Endoso:** sale solo apenas el cliente carga el dueño del lote (ver §6).
- **El resto del rediseño, aprobado como está propuesto.** Eso incluye:
  - las acciones de nivel 3 (armar la encomienda, presentar y empezar de cero), sólo para administrador y gestor; las vendedoras ven "Lo hace Tamara o JS";
  - "Seguir desde el borrador" pasa a `⋯` con el número de 0 de 8, y el robot deja de reintentar cuando el borrador no abre;
  - con los papeles incompletos, el botón de la encomienda no aparece;
  - "Reabrir acta y nota en el portal" para subsanar;
  - la lista "Para limpiar en TAD" con [Ya los borré];
  - "No se tramita acá" en las ventas para iniciar.

**Queda abierto:**
- **Los tres expedientes viejos** (S00153, Salcedo y S02259): ¿se archivan?
- **Por qué el Gobierno archivó sin resolución** Triunvirato 4528 y Corrientes 2810: hay que mirarlo en TAD.

---

## Anexo A: textos, actual → propuesto

| Actual | Propuesto | Dónde |
| --- | --- | --- |
| «N espera(n) a ABA» / «Nada espera a ABA» | «Te toca: N» (por persona) | `page.tsx:150, 163` |
| «El robot no revisa TAD desde nunca.» | «El robot todavía no revisó TAD.» / «El robot no revisa TAD hace 5 horas.» | `page.tsx:215` |
| «Necesitan acción» · «El Gobierno observó algo…» | «Hay que corregir» · «El Gobierno pidió cambios: corregí y volvé a presentar en TAD.» | `page.tsx:248-250` |
| «Presentados o ya subsanados, todavía sin revisar.» | «Presentados o ya corregidos. El Gobierno todavía no los revisó.» | `page.tsx:310` |
| «vendedora: Tamara» | «Vendió: Tamara» | `page.tsx:393`, `ventas-para-iniciar.tsx:100` |
| «Motivo:» / «Motivo (ya subsanado):» | «Lo que pidió el Gobierno:» / «Ya corregido:» | `page.tsx:477` |
| «Subsanación · tarea pendiente» | «Hay que corregir» | `chip-estado.tsx:25-26` |
| «Modo supervisado · 2 de 4 pasos manuales» | «Qué sale solo · 2 de 4 esperan un botón» | `modo-supervisado.tsx:48-50` |
| «Trámite nuevo · S02672 · … · vendedor: X» | «S02672 · {cliente} · Vendió: X» | `tramites/[id]:62` |
| «· link enviado a tam@… el 24/9/2026 11:46» | «Link enviado a Tamara el 24/9 11:46 para que se lo pase al cliente» | `tramites/[id]:110` |
| link_error en naranja | «El link no salió: {motivo}. Copialo y mandalo por WhatsApp.» (aviso ámbar) | `tramites/[id]:116` |
| «Copiar» | «Copiar link» | `tramites/[id]:125` |
| «Legajo del cliente · 6 de 7» | «Papeles del cliente · 5 de 7 OK» | `tramites/[id]:165` |
| «Documentos de ABA y del seguro» | «Documentos de la oficina y de Segucom» | `tramites/[id]:169` |
| «Póliza: sin pedir» / «Pedir endoso a Segucom» | «Endoso: sin pedir» / «Pedir el endoso a Segucom» | `tramites/[id]:199, 215` |
| confirm «El endoso ya se pidió. ¿Mandar el pedido a Segucom otra vez?» | **¿Pedirle el endoso a Segucom otra vez?** «Ya se pidió el 24/9. Le llega un mail nuevo con el mismo dueño del lote.» [Cancelar] [Pedir otra vez] | `tramites/[id]:207`; agregarlo en `documentos-tramite.tsx:165` |
| «Pedir corrección» | «Pedir corrección al cliente» | `tramites/[id]:252` |
| (historial vacío) | «Todavía no hay movimientos.» | `tramites/[id]:175` |
| «Titular del lote» / «Cambiar titular» | «Dueño del lote» / «Cambiar dueño del lote» | `documentos-tramite.tsx:44, 91, 168` |
| «El CUIT no es válido.» (naranja) | «Ese CUIT no es válido: revisá los números.» (rojo) | `documentos-tramite.tsx:106` |
| «Documentos generados, pero sin plancheta…» | «Se generaron, pero sin el plano de la manzana: no está en el catastro. Revisá la dirección.» | `generar-documentos.tsx:33` |
| «Con el botón, el robot hace todo sin frenar: la carga y finaliza en el RETP…» | «El robot arma la encomienda en el CPAU, la firma, la paga ($50.000) y espera el certificado por mail. La Mac de la oficina tiene que estar prendida.» | `encomienda-cpau.tsx:114` |
| «Armar la encomienda ahora» | «Armar la encomienda…» (el diálogo dice que el robot la paga) | `encomienda-cpau.tsx:116` |
| «Finalizada en el RETP · Registro firmado · Pagada · Cargada en la Plataforma · Certificado recibido» | «Finalizada · Firmada · Pagada · Enviada al CPAU · Certificado recibido» | `encomienda-cpau.tsx:70-74` |
| «R.Nro 12345.» | «N.º de registro 12345» | `encomienda-cpau.tsx:145, 212` |
| confirm «¿Finalizar la encomienda de X en el CPAU? No se puede deshacer.» | **¿Finalizar la encomienda de Echeverría 2931?** «Queda registrada en el CPAU a nombre de Hougassian. No se puede deshacer.» [Cancelar] [Finalizar en el CPAU] | `encomienda-cpau.tsx:195` |
| «Descartar» (sin confirmación) | **¿Descartar esta encomienda?** «La app deja de seguirla. Si hace falta otra, la armás de nuevo.» | `encomienda-cpau.tsx:203` |
| «Subir» | «Subir certificado» | `encomienda-cpau.tsx:62` |
| «No se pudo» | «No se pudo pedir. Probá de nuevo en un rato.» | `encomienda-cpau.tsx:86`, `presentacion-tad.tsx:59` |
| «Se presenta sola apenas están todos los documentos…» (fijo) | Con botón: «Cuando estén todos los documentos, tocá «Presentar en TAD».» Sola: «Se presenta sola cuando están todos los documentos, de 19 a 7.» | `presentacion-tad.tsx:73` |
| «Presentar ya» / «Presentar ahora» / «Probar ahora» | «Presentar en TAD» (un solo nombre) | `presentacion-tad.tsx:134, 217` |
| confirm «A la tarde TAD falla seguido…» | **¿Presentar ahora, fuera de horario?** «De día TAD falla seguido y, si se corta a mitad de camino, el borrador puede quedar inservible. Programada, sale sola a las 19.» [Esperar a las 19] [Presentar ahora] | `presentacion-tad.tsx:129` |
| «Dejar de reintentar» / «No presentar» + «¿Seguro?» | «Frenar la presentación» · **¿Frenar la presentación?** «Queda frenada hasta que alguien toque «Presentar en TAD».» | `presentacion-tad.tsx:145-150` |
| «Quedaron N adjuntos en el borrador X (cada uno es un IF oficial).» | «Quedaron N archivos en el borrador X. Cada uno ya es un documento oficial de TAD y no se puede borrar.» | `presentacion-tad.tsx:190` |
| confirm «¿Ya borraste el borrador X en TAD…?» | **¿Empezar la presentación de cero?** «El borrador X no se pudo reabrir. Se vuelve a cargar todo y se generan documentos oficiales nuevos; el borrador queda en «Para limpiar en TAD».» [Empezar de cero y presentar] | `presentacion-tad.tsx:235` |
| «Venta propuesta» / «Escrito en Odoo» / «Error del robot» / «Aviso a Segucom» | «El robot propuso una venta» / «Odoo actualizado» / «El robot se frenó» / «Mail a Segucom» | `[id]/page.tsx:33-44` |
| «Robot: Al día con TAD desde el…» (es `odoo_escrito_at`) | «Odoo actualizado: 9/10 14:32» | `[id]/page.tsx:244-245` |
| «Pasó la fecha típica (dd/mm)» | «Ya tendría que haber salido (lo normal: dd/mm)» | `seguimiento/page.tsx:64` |
| «Cliente» (muestra al dueño) | «Dueño del lote» | `seguimiento/page.tsx:136, 198` |
| actor crudo («ia», «sistema», «productor») | Revisión automática · App · Segucom | `seguimiento/page.tsx:214` |
| «Cierre en «pagada»» | «Encomienda pagada, el robot sigue» | `seguimiento.ts:125` |
| «En tramitación» / «En iniciación» | «Presentado, en revisión del Gobierno» | `seguimiento.ts:167` |
| «Observado: DNI, …» / «Póliza observada» | «A corregir: DNI, …» / «Póliza a corregir» | `seguimiento.ts:96, 110` |

## Anexo B: datos usados (9/10/2026, sólo lectura)

- **Supabase:** `pvp_tramites` (29), `pvp_documentos` (299), `pvp_tareas` (83: 21 presentaciones OK y 25 con error), `pvp_eventos` (1973), `pvp_expedientes` (45 vigentes y 591 históricos), `alertas`, `alertas_lecturas` y `user_profiles`.
- **Odoo:** `sale.order` (`x_tramite_estado`, `x_permiso_fecha`, modalidad).
- **Bucket:** 3 PDF guardados como permiso (los tres eran notas nuestras).
- **Supervisión actual:** link, endoso y encomienda con botón; presentación automática.
- **Usos por personas:** 23 "Armar la encomienda", 24 "Pedir endoso", 11 "Seguir desde el borrador", 10 "Empezar de cero", 3 certificados subidos a mano y 1 "Pedir corrección".
- **No medido:** los mails que reciben gestor y vendedora, el uso real de cada pantalla (no hay analítica) y por qué el Gobierno archivó los dos expedientes de §2.
