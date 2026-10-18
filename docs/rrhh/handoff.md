# Handoff — Módulo RRHH (actualizado 18/10/2026)

Para retomar en una sesión nueva. Para arrancar: «Leé docs/rrhh/handoff.md y docs/rrhh/propuesta.md y seguimos con RRHH».

## Estado

**Propuesta y maqueta terminadas. Falta lo que decide JS; no hay nada de código.**

- El 17/10 JS pidió un módulo de RRHH para AndamiosOS, inspirado en [Humand](https://humand.co). Siempre hay que contemplar las dos realidades: la oficina (~15 personas) y la obra (~30).
- Un equipo de 13 agentes armó la propuesta: 4 investigadores, 3 expertos que propusieron y debatieron, un moderador, un auditor y un redactor.
- Otro equipo de 9 agentes de UX/UI armó la maqueta.
- Todo está en `docs/rrhh/`, commiteado en la rama **`feat/rrhh`** (sale de `main` del 18/10, sin mergear). En la Mac de JS esa rama vive en el worktree `.claude/worktrees/rrhh`.

## Archivos

| Archivo | Qué es |
|---|---|
| [propuesta.md](./propuesta.md) | **La propuesta final.** §10: las 15 preguntas para JS, cada una con recomendación. §11: las pantallas. |
| [investigacion.md](./investigacion.md) | Los 4 informes: Humand (comunicación y frontline), Humand (gestión y precios), lo que ya existe en AndamiosOS y la normativa argentina. |
| [debate.md](./debate.md) | Las 3 propuestas iniciales, las réplicas del debate y la auditoría completa. |
| [maqueta.html](./maqueta.html) | La maqueta navegable: 25 pantallas y 14 recorridos guiados. |
| [maqueta-especificacion-ux.md](./maqueta-especificacion-ux.md) | La especificación de UX: decisiones D-1 a D-12, pantalla por pantalla y reglas para obra. |
| [maqueta-contrato-ui.md](./maqueta-contrato-ui.md) | El contrato visual y técnico: tokens, componentes y la API `window.MAQ`. |

**Maqueta publicada:** https://claude.ai/artifact/5Qvk5eNvMpJDmDAR6Z6kzp (v2, corregida). Es privada; para que la vea alguien más, JS la comparte desde el menú Compartir.

## Qué dice la propuesta

1. **No se compra Humand entero.** Lo que más necesita ABA, Humand no lo tiene: vencimientos, apto de altura, control contra la Nómina ART, constancias de EPP y confirmación obligatoria de lectura. Además pide Android 10 o más, no anda sin señal y no se integra con WhatsApp ni con Odoo.
   - El precio no es público. El único dato, sin verificar, es US$ 4 por usuario por mes: unos US$ 2.150 por año para 45 personas, y entre US$ 3.200 y 5.400 con los módulos de RRHH.
2. **Recibos y vacaciones** (lo que Humand sí hace bien y es lo más caro de construir): se decide con tres cotizaciones por escrito antes de la etapa 2a. Las tres son el portal del sistema de sueldos del contador, Humand (sólo recibos y vacaciones) y un proveedor local, que todavía no identificamos.
3. **El canal de obra es un link con token por documento,** que la oficina manda a mano por WhatsApp (`wa.me`, como ya hace el pañol). No es un bot y nadie instala nada. Quien no tiene celular lo hace en el kiosco del pañol con PIN o QR.
   - El bot de Telegram de la Hoja del día **todavía no existe** (`docs/README.md:30`, `docs/equipos-del-dia/handoff.md:47` y `:452`), y estaba pensado sólo para capataces y choferes.
4. **Etapas** (entre 15 y 22 semanas de JS y Claude, de la 0 a la 3):
   - **0, la base, casi sin código:** nombrar quién de administración opera el módulo; relevar persona por persona qué celular tiene, si tiene datos y si usa WhatsApp; inventariar quién lee `personal`; consultar al contador, a la ART y a un abogado laboral; pedir las 3 cotizaciones; y ya, una constancia de aviso de vacaciones en PDF para esta temporada.
   - **1, papeles en orden:** A2 permisos y lectura registrada, A1 ficha única, B1 documentos con vencimiento y semáforo, B2 control contra la última Nómina ART (es lo único que pide el 82 % de las obras) y B3 habilitación para salir a obra, en modo advertencia.
   - **2a:** la pieza de firma (C0), el EPP en el kiosco (C2) y, si se decide construir, los recibos (C1).
   - **2b:** comunicados con «Entendido» (E1), «Mis papeles» (C3) y «Hoy no voy» (D1).
   - **3:** vacaciones con saldo (D2), novedades del mes para el contador (D3), alta y baja con corte de accesos (F1), carpeta por comitente (B4), contratistas (B5), aviso de cumpleaños (E2), pedidos (G1) y prender el bloqueo de B3.
   - **4, sólo si sobra:** «Qué hago si…» (G2), pulso semestral (G3) y tablero de JS (G4).
5. **Queda afuera:** muro, chat, evaluación 360, cursos online, puntos y canjes, fichada con selfie.
6. **Van por carriles aparte:** la asistencia que escribe `x_parte_diario` (la deciden Juan Pablo y JS) y un módulo de SyH (PTS, charla de 5 minutos, verificación del andamio y aviso de accidente).

## Lo que espera a JS

Las 15 preguntas están en [propuesta.md §10](./propuesta.md#10-preguntas-para-js). Las que destraban todo lo demás:

1. **¿Quién de administración opera RRHH?** Sin esa persona no se arranca la etapa 1.
2. **La oficina:** ¿se cambia la decisión del 10/10 de que los 15 administrativos no tengan legajo? Se recomienda una ficha propia de RRHH, aparte de `personal`.
3. **La habilitación para salir a obra:** apto de altura para todos los de obra; preocupacional y ARCA sólo para las altas nuevas; el planificador puede destrabar, con motivo y aviso a JS.
4. **El orden frente a Sistemas y el rediseño de partes.** Se recomienda hacer la etapa 0 ya.

En la maqueta, lo que queda por decidir aparece marcado «A decidir por JS». Además de las preguntas de §10, hay cuatro decisiones que tomó el equipo de UX y que JS tiene que confirmar:

- **D-6:** el preocupacional de un alta nueva no se destraba desde la Hoja del día.
- **D-7:** sin PIN, el operario puede ver y bajar el recibo igual.
- **D-8:** la oficina firma con su sesión de AndamiosOS.
- **Link:** el link del recibo abre directo el recibo, con «Ver todo lo mío» abajo.

## Urgente aparte, con o sin RRHH: la privacidad de `personal`

- **Qué pasa:** hoy cualquier usuario logueado puede leer el DNI, el CUIL, el domicilio, la fecha de nacimiento y el `telegram_chat_id` de todo el personal (`supabase/migrations/20260330000002_rls_policies.sql:161` y `:191`). Lo encontró la auditoría.
- **Por qué no se cierra de golpe:** varias pantallas leen `personal` desde el navegador, embebida en sus consultas. Si se restringe el SELECT, devuelven `personal: null` sin dar error. Son:
  - `src/hooks/use-cuadrillas.ts:24`
  - `src/hooks/use-vehiculos.ts:28`
  - `src/hooks/use-remitos.ts:46,62,83`
  - `src/hooks/use-solicitudes-extra.ts:35,52`
  - `src/hooks/use-fichadas.ts:22`
- **Plan:** inventariar todo lo que lee `personal`, `documentos` y `fichadas`; pasar los campos sensibles a tablas nuevas con su propia RLS, y dejar `personal` con lo básico abierto. Es la A2 de la propuesta (esfuerzo M).
- **Falta:** JS no lo decidió todavía.

## La maqueta

- **Cómo se recorre:**
  - **Oficina / Obra / Las dos**, arriba a la izquierda.
  - **Recorridos** (R1 a R12, más dos ramas): es lo mejor para mostrarla, porque «Siguiente» hace las acciones.
  - **Pantallas** (Alt+I) abre el índice.
  - **Ver como** muestra lo que ve cada usuario.
  - En **Opciones** están los interruptores de señal, de habilitación (advertencia o bloqueo), de recibos (construir o contratar) y del tema.
  - El PIN de ejemplo es **4821**.
- **Datos de ejemplo:** el elenco de §11 de la propuesta, con nombres, obras, comitentes y montos inventados. **No usar nombres reales de empleados ni de clientes.** En la versión del 17/10 aparecía el técnico real de SyH; se cambió por «HyS (técnico, ejemplo)». JS sí aparece como JS y como «Joaquín» en el audio del comunicado.
- **Fecha de la maqueta:** viernes 16/10/2026 a las 18:30. El 17/10 cae sábado, y la §11 de la propuesta dice «viernes 17/10» por error.
- **Cómo republicarla después de un cambio:**
  1. Editar `docs/rrhh/maqueta.html`.
  2. Revisar que siga sin nombres reales y correr `node --check` sobre los `<script>`.
  3. Publicar con la herramienta Artifact pasando `url: https://claude.ai/artifact/5Qvk5eNvMpJDmDAR6Z6kzp`, así no se crea otro link.

  La copia que se publicó estaba en el scratchpad de la sesión del 17/10 y no sobrevive a la sesión.
- **Dos detalles que quedaron así:**
  - Si se abre M5 desde el índice, el aviso de Mauro ya está mandado (es parte de los datos iniciales); el recorrido R4 lo muestra desde cero.
  - «Reiniciar maqueta» mantiene el modo «Las dos».

## Sueltos

- `docs/panol/modulo.md:230` cita la Disp. SRT GP 2/2021; la que se verificó es la **Disp. GP SRT 3/2022**. Falta corregirlo.
- El técnico de SyH que figura en el repo (`docs/equipos-del-dia/handoff.md:259`): falta confirmar si es el responsable de HyS o sólo un técnico, y si hay un servicio externo (pregunta 8).
- En el repo hay un archivo suelto, `src/components/tablero/tablero-board 2.tsx` (sin seguimiento, modificado el 17/10 a las 13:27, antes de esta sesión). Parece una copia duplicada de `tablero-board.tsx`. No se tocó; lo decide JS.
- Afirmaciones legales sin cerrar, a confirmar con el contador o un abogado:
  - la validez de la firma electrónica del recibo (Res. 346/19 y Ley 25.506), y quién carga con la prueba;
  - si la oficina está en el convenio de Comercio 130/75;
  - la periodicidad del apto de altura, que la fija la ART;
  - si a la ART le alcanza una exportación de las constancias de EPP a pedido;
  - la inscripción ante la AAIP.

## Reglas para cuando se construya

- **Nada sensible en el celular:** sólo el semáforo de «Mis papeles». Ni recibos ni certificados.
- **El capataz** ve «habilitado / no habilitado / vence» y «ausente con aviso». Nunca un motivo médico.
- **La salud** se guarda como constancia «apto / no apto», nunca el estudio. A un comitente sólo se le manda con el consentimiento de la persona.
- **Toda lectura de datos sensibles** queda registrada.
- **Nada se manda a la obra** después de las 21 h ni los domingos, salvo emergencia, y ningún audio se reproduce solo.
- **Las sanciones** se notifican por carta documento, nunca por WhatsApp; en el sistema queda sólo la constancia.
- **El segundo factor de la firma** es el PIN del pañol, entregado en persona. Nunca el DNI.
- **Las reglas laborales** (saldo de vacaciones, formato del recibo) van como parámetros con historial: la ley cambió dos veces en 2026.
- Pedir confirmación antes de push, merge, deploy o migraciones.
