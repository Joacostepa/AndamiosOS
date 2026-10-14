-- ============================================================================
-- Organigrama — carga la ESTRUCTURA v2 como BORRADOR (para revisar y publicar)
-- ============================================================================
-- Qué es y por qué: docs/organigrama/estructura-v2.md.
--
-- Qué hace:
--   1. Si ya hay un borrador del organigrama, ABORTA sin tocar nada (publicá o descartá el
--      borrador actual primero, desde Organigrama › Versiones).
--   2. Crea un borrador basado en la versión publicada y le escribe los 27 nodos de la v2
--      (1 Dirección, 5 frentes, 21 funciones; 7 de ellas son externos), SIN personas.
--   3. Nada más: la versión publicada, los ocupantes (org_ocupantes) y las notas internas no se
--      tocan. El dueño lo revisa en el Lienzo (aparece «Borrador») y lo publica con el flujo
--      normal (o lo descarta). Al publicar, los nodos de la v1 que no están en la v2 terminan a
--      sus ocupantes y liberan su clave solos (org_publicar → org_liberar_nodos).
--
-- Identidad: los nodos que en la v2 son «el mismo» que uno de la v1 reutilizan su clave (y por
-- lo tanto su id de org_nodos): las asignaciones y las URL (?puesto=montajes) sobreviven. Ver la
-- tabla de cambios en el doc. Montajes conserva fuente_ocupantes = 'cuadrillas'.
--
-- Cómo se corre (desde la raíz del repo principal, donde está el link de Supabase):
--   npx supabase db query --linked -f supabase/scripts/organigrama-estructura-v2.sql
--
-- Corre como postgres (sin auth.uid()), por eso no usa las RPC que exigen editor
-- (org_crear_borrador / org_guardar_borrador) sino la interna org_escribir_nodos, que es la
-- misma que usan ellas: respeta claves únicas, triggers (inmutabilidad, anti-ciclo diferido) y la
-- FK diferida al padre. Es idempotente en el sentido útil: una segunda corrida encuentra el
-- borrador que dejó la primera y aborta.
--
-- NO está en supabase/migrations/ a propósito: es contenido, no esquema, y se corre una vez.
-- ============================================================================

DO $script$
DECLARE
  v_vigente  UUID;
  v_borrador UUID;
  v_ajena    TEXT;
  v_filas    JSONB := $v2$
[
  {
    "clave": "dg", "depende_de": null, "tipo": "direccion", "orden": 0, "color": "gris",
    "titulo": "DIRECCIÓN", "rol": "Dueño y socios",
    "mision": "Decidir lo que solo puede decidir el dueño (precios, inversión en stock, bancos, clientes grandes y personas clave) y dejar el resto en manos de cada responsable.",
    "tareas": [
      {"texto": "Fija tarifas (lista de alquiler, Parámetros de cotización) y la banda de descuento que Ventas da sin consultar"},
      {"texto": "Aprueba compras de equipo (stock Layher) y gastos grandes"},
      {"texto": "Bancos, financiación y flujo de fondos, con Administración"},
      {"texto": "Clientes grandes, licitaciones y reclamos que escalan"},
      {"texto": "Decisiones legales con el abogado: acta de entrega, cobro de faltantes, adicionales"},
      {"texto": "A crear: reunión operativa semanal con los responsables de cada frente (hoy se decide en caliente)"},
      {"texto": "Nombra titular y suplente de cada función de este organigrama"}
    ],
    "no_hace": [
      "No arma la Hoja del día ni despacha: es de Coordinación y despacho (hoy lo hace cuando falta el coordinador; la meta es que no haga falta)",
      "No le da órdenes directas a una cuadrilla salteando a Coordinación",
      "No mezcla temas de familia o de socios con la reunión operativa"
    ],
    "kpis": [
      "Margen por obra del mes (Informe de obra)",
      "Obras desarmadas con OT incompleta o sin facturar (Informe de obra)",
      "Decisiones operativas que tuvo que tomar la Dirección en la semana (a medir: hoy no se registran)"
    ],
    "nota_diseno": "Es la caja del dueño y de los socios que trabajan en la empresa. Lo patrimonial (socios, dividendos, sucesión) va en una reunión de socios aparte, no acá: ser de la familia no da una función; se ocupa con las mismas reglas que el resto. Los «qué NO hace» son un plan de delegación, no una foto de hoy. Suplente sugerido: el responsable de Comercial y Técnica para clientes y precios; el de Administración para pagos."
  },

  {
    "clave": "tec_com", "depende_de": "dg", "tipo": "area", "orden": 0, "color": "teal",
    "titulo": "Comercial y Técnica", "rol": "Responsable comercial",
    "mision": "Convertir cada consulta en una obra bien cotizada, bien relevada y con la OT lista para planificar.",
    "tareas": [
      {"texto": "Decide sin consultar: descuentos dentro de la banda que fijó la Dirección"},
      {"texto": "Reparte las visitas técnicas entre los vendedores-técnicos"},
      {"texto": "Controla que cada venta confirmada en Odoo tenga su OT con duración estimada y modalidad de permiso"},
      {"texto": "Lee el Informe de obra de lo que cerró y corrige la próxima cotización"}
    ],
    "no_hace": [
      "No promete fecha de armado sin mirar el Tablero o preguntarle a Coordinación",
      "No habilita una obra ni decide armar sin permiso",
      "No cambia el alcance en obra sin una OT nueva en Odoo"
    ],
    "kpis": [
      "Cotizaciones confirmadas sobre emitidas en el mes (Odoo, ventas)",
      "OT nuevas con duración estimada cargada (Órdenes de trabajo; hoy casi ninguna)",
      "Margen por obra (Informe de obra)"
    ],
    "nota_diseno": "Ventas y Técnica son las mismas personas (el dueño y los vendedores): por eso es un solo frente con dos funciones y no dos equipos. Suplente sugerido: otro vendedor-técnico. Se separa una oficina técnica propia cuando haya alguien que solo releve y compute."
  },
  {
    "clave": "ventas", "depende_de": "tec_com", "tipo": "puesto", "orden": 0,
    "titulo": "Ventas y cartera", "rol": "Vendedores",
    "mision": "Atender cada consulta en el día, cotizar, cerrar y que el cliente vuelva a llamar a ABA.",
    "tareas": [
      {"texto": "Atiende consultas (WhatsApp, 0810, web, mail) y da de alta al cliente en Odoo"},
      {"texto": "Cotiza con el Asistente comercial (deja el borrador en Odoo) o a mano con la lista de alquiler"},
      {"texto": "Al cotizar carga la modalidad de permiso, si va técnico de SyH y la duración estimada de la OT"},
      {"texto": "Confirma la venta en Odoo: de ahí nacen las OT de armado y desarme"},
      {"texto": "Le manda al cliente el link del portal de Permisos de andamio"},
      {"texto": "Emite la OT de desarme, ampliación o desmonte parcial cuando el cliente la pide"},
      {"texto": "Prórrogas y renovaciones del alquiler"},
      {"texto": "A crear: seguimiento de cartera y postventa (no hay módulo)"}
    ],
    "no_hace": [
      "No define tarifas: usa la lista y la banda de descuento",
      "No persigue el cobro: es de Facturación y cobranza (sí avisa si el cliente anuncia un atraso)",
      "No arma la agenda de obras"
    ],
    "kpis": [
      "Cotizaciones emitidas y confirmadas por vendedor (Odoo)",
      "Borradores del Asistente comercial sin confirmar ni descartar",
      "Tiempo de respuesta a una consulta (a medir)"
    ],
    "nota_diseno": "Función que hoy usan el dueño, los vendedores y la gestora de permisos. Suplente sugerido: cualquier otro vendedor. Google Ads, SEO y la web no se hacen hoy: si se contrata una agencia, entra como externo acá."
  },
  {
    "clave": "oficina_tec", "depende_de": "tec_com", "tipo": "puesto", "orden": 1,
    "titulo": "Técnico de obra", "rol": "Relevamiento y cómputo",
    "mision": "Que lo que se cotiza se pueda armar: relevar, definir el sistema, computar y dejarle el criterio de montaje a la cuadrilla.",
    "tareas": [
      {"texto": "Visita técnica y relevamiento (en CABA, el frente del lote contra el catastro)"},
      {"texto": "Define el sistema (multidireccional, tubular, bandeja, torre) y cotiza por m², metro lineal o piezas"},
      {"texto": "Cómputo de materiales en Cómputos (hoy casi no se usa: hay que crear el hábito)"},
      {"texto": "Cálculos en la app de oficina técnica (M01–M11) y planos en AutoCAD"},
      {"texto": "Prepara la memoria de cálculo de los andamios de más de 6 m y la pasa a firmar"},
      {"texto": "Valida el as-built que manda la cuadrilla (fotos y medidas) antes del desarme"},
      {"texto": "Responde dudas técnicas de la cuadrilla en obra"}
    ],
    "no_hace": [
      "No firma memorias ni informes sin matrícula: firma el profesional",
      "No negocia el precio con el cliente",
      "No decide el día de armado"
    ],
    "kpis": [
      "Obras con cómputo cargado en Cómputos sobre obras vendidas (hoy 1)",
      "Desvío de horas reales contra estimadas (Informe de obra)",
      "Obras de más de 6 m con memoria firmada (a medir)"
    ],
    "nota_diseno": "Es una función de los vendedores y del dueño, no un equipo aparte (en la OT figuran «vendedor» y «técnico», a veces la misma persona). Suplente sugerido: otro vendedor-técnico. Pasa a puesto propio cuando haya más visitas de las que pueden hacer los vendedores. [confirmar] quién firma las memorias de cálculo."
  },
  {
    "clave": "firmante", "depende_de": "tec_com", "tipo": "puesto", "orden": 2,
    "titulo": "Firmante profesional (externo)", "rol": "Externo · lo coordina Técnico de obra",
    "mision": "Poner la firma y la matrícula que exige la normativa: informes técnicos y encomiendas de los permisos, memorias de cálculo.",
    "tareas": [
      {"texto": "Firma el informe técnico y la encomienda en el CPAU de cada permiso de vía pública"},
      {"texto": "Firma memorias de cálculo y certificados de armado y desarme [confirmar]"},
      {"texto": "Revisa los casos fuera de lo común antes de firmar"}
    ],
    "no_hace": [
      "No releva ni computa: recibe el trabajo hecho",
      "No hace el trámite en TAD: es de Permisos de vía pública"
    ],
    "kpis": [
      "Encomiendas por mes (Permisos de andamio; hoy 25–30)",
      "Días entre el pedido y la firma (a medir)"
    ],
    "nota_diseno": "Externo: se carga en «Asignar persona» con «¿Es de afuera?» y el nombre del profesional. Vacío quiere decir que no se cargó quién es, no que haya que buscar a alguien. Cuelga de Técnica porque la firma es técnica, aunque Permisos lo usa todos los días. [confirmar] si el mismo profesional firma las memorias de cálculo o es otro."
  },

  {
    "clave": "gestion", "depende_de": "dg", "tipo": "area", "orden": 1, "color": "violeta",
    "titulo": "Habilitaciones y Permisos", "rol": "Responsable de habilitaciones y permisos",
    "mision": "Que ninguna obra espere por un papel: permiso de la Ciudad y documentación ante el cliente y la ART al día, sin depender de una sola cabeza.",
    "tareas": [
      {"texto": "Decide sin consultar: si una obra queda habilitada o no (con su checklist)"},
      {"texto": "Cada mañana mira las obras trabadas en Habilitaciones y en Permisos de andamio y persigue a quien falta (cliente, firmante, seguro)"},
      {"texto": "Organiza que Permisos y Habilitaciones se cubran entre sí en licencias y vacaciones"}
    ],
    "no_hace": [
      "No decide armar sin permiso: el candado del Tablero sale de la modalidad que se cargó en la venta",
      "No vende (aunque la gestora también venda: son funciones distintas)",
      "No hace la seguridad en obra: es de Seguridad e Higiene"
    ],
    "kpis": [
      "Obras abiertas en Habilitaciones que esperan el permiso (hoy 14 de 18)",
      "Días entre el triage y la habilitación (Habilitaciones)",
      "Días del tramo del cliente en Permisos de andamio"
    ],
    "nota_diseno": "Frente nuevo: en la estructura vieja no existía (estaba mezclado en «Seguridad y Formación», dentro de Operaciones). Es el cuello de botella real del circuito y lo llevan dos personas que pueden suplirse entre sí. Si la responsable es una de ellas, igual queda escrito quién decide."
  },
  {
    "clave": "permisos", "depende_de": "gestion", "tipo": "puesto", "orden": 0,
    "titulo": "Permisos de vía pública", "rol": "Gestoría",
    "mision": "Sacar y renovar a tiempo el permiso de uso de vía pública de cada andamio en CABA, que es un servicio que se cobra.",
    "tareas": [
      {"texto": "Abre el trámite en Permisos de andamio y le manda al cliente el link del portal"},
      {"texto": "Persigue al cliente por lo que le falta (es el tramo más largo)"},
      {"texto": "Lanza el robot: encomienda en el CPAU y presentación en TAD"},
      {"texto": "Pide el endoso del seguro de RC al productor de seguros"},
      {"texto": "Subsana las observaciones del expediente"},
      {"texto": "A crear: renovación 30 días antes del vencimiento"}
    ],
    "no_hace": [
      "No firma: firma el profesional",
      "No decide si se arma sin permiso",
      "No arma la documentación del personal: es de Habilitaciones"
    ],
    "kpis": [
      "Días desde que se abre el trámite hasta el permiso (Permisos de andamio)",
      "Clientes que tardan 5 días o más en mandar lo suyo (hoy 7 de 27)",
      "Permisos vencidos sin renovar (a medir)"
    ],
    "nota_diseno": "Suplente sugerido: Habilitaciones (y al revés). El robot corre en una Mac de la oficina con la identidad miBA de un vendedor: si la Mac está apagada no sale nada (lo cuida Sistemas). Pasa a dos personas si los trámites superan los ~30 por mes."
  },
  {
    "clave": "habilitaciones", "depende_de": "gestion", "tipo": "puesto", "orden": 1,
    "titulo": "Habilitaciones", "rol": "Documentación del personal",
    "mision": "Que cada cuadrilla entre a la obra con lo que pide el cliente: nómina ART, no repetición, seguros, EPP y capacitaciones.",
    "tareas": [
      {"texto": "Triage de cada OT nueva: aplica o no aplica, y qué paquete pide el cliente (Habilitaciones)"},
      {"texto": "Pide a la ART la nómina y la cláusula de no repetición y se las manda al cliente"},
      {"texto": "Arma el aviso de obra y el programa de seguridad (319/99) con Seguridad e Higiene cuando corresponde"},
      {"texto": "Carga el vencimiento de cada documento"},
      {"texto": "Habilita la obra: avisa a Operaciones (campanita y #syh)"},
      {"texto": "A crear: alta documental de los contratistas de mano de obra (ART o accidentes personales)"}
    ],
    "no_hace": [
      "No manda gente a obra: avisa y Coordinación planifica",
      "No inspecciona en obra: es de Seguridad e Higiene",
      "No negocia la póliza con la ART: es del productor de seguros"
    ],
    "kpis": [
      "Obras habilitadas antes de la fecha planificada (Habilitaciones contra Tablero)",
      "Documentos con vencimiento cargado (Habilitaciones)",
      "Contratistas en obra sin ART registrada (a medir)"
    ],
    "nota_diseno": "Una sola persona hoy, y lo que sabe vive en su mail: el módulo es el que tiene que recordar. Suplente sugerido: Permisos de vía pública. Ojo: hoy la documentación no frena el Tablero (solo el permiso)."
  },
  {
    "clave": "seguros", "depende_de": "gestion", "tipo": "puesto", "orden": 2,
    "titulo": "Productor de seguros (externo)", "rol": "Externo · lo coordina Habilitaciones y Permisos",
    "mision": "Pólizas de ART, responsabilidad civil y flota al día, y endosos en el día cuando una obra o un permiso los pide.",
    "tareas": [
      {"texto": "Endoso de RC con el GCBA como coasegurado para cada permiso"},
      {"texto": "Certificados de cobertura y cláusulas de no repetición por cliente"},
      {"texto": "Seguro de la flota y denuncia de siniestros"},
      {"texto": "Renovación anual de las pólizas"}
    ],
    "no_hace": [
      "No arma la documentación de la obra: se la entrega a Habilitaciones",
      "No decide coberturas: propone y decide la Dirección"
    ],
    "kpis": [
      "Días entre el pedido y el endoso (a medir)",
      "Pólizas vencidas (a medir)"
    ],
    "nota_diseno": "Externo, con nombre libre. Lo usan Permisos (endosos), Habilitaciones (no repetición) y Choferes y flota (seguro de los camiones)."
  },

  {
    "clave": "ops", "depende_de": "dg", "tipo": "area", "orden": 2, "color": "ambar",
    "titulo": "Operaciones", "rol": "Responsable de operaciones",
    "mision": "Armar y desarmar lo que se vendió el día prometido, con la gente, los camiones y el material justos, y que quede registrado.",
    "tareas": [
      {"texto": "Decide sin consultar: prioridad de la agenda, qué cuadrilla va a qué obra, suspender por lluvia"},
      {"texto": "Valida los partes que declaran los capataces"},
      {"texto": "Coordina con Habilitaciones las obras trabadas y con Comercial las fechas"},
      {"texto": "A crear: supervisor de obra — recorre obras, controla calidad y as-built (hoy lo absorben el capataz y el técnico de obra)"}
    ],
    "no_hace": [
      "No vende ni cambia precios",
      "No arma sin habilitación ni con el candado del permiso puesto",
      "No saca material ni herramientas por fuera de la Lista de carga y el Pañol"
    ],
    "kpis": [
      "Horas reales contra estimadas por obra (Informe de obra)",
      "Obras pendientes de armado en el Tablero",
      "Partes con 0 horas-hombre o con las horas copiadas del armado (Partes)"
    ],
    "nota_diseno": "El depósito queda adentro de Operaciones, no aparte como en la estructura vieja: sin dotación propia ni remitos, separarlo era una caja vacía. El control se logra con reglas (Lista de carga, conteo al descargar) y con Administración mirando el desvío. Supervisor de obra: se crea cuando haya más obras en curso de las que Coordinación puede seguir o crezcan los retrabajos [umbral a definir con el dueño]."
  },
  {
    "clave": "planif", "depende_de": "ops", "tipo": "puesto", "orden": 0,
    "titulo": "Coordinación y despacho", "rol": "Coordinador de la operación",
    "mision": "Que cada día salgan las cuadrillas y los camiones correctos a la obra correcta, y que el plan de la semana se cumpla o se corrija a tiempo.",
    "tareas": [
      {"texto": "Arma la semana en el Tablero de planificación (cuadrillas por jornada, cajón de pendientes)"},
      {"texto": "Arma la Hoja del día la tarde anterior: capataz del día, viajes y chofer de cada uno"},
      {"texto": "Le avisa al depósito qué cargar (Lista de carga, «Avisar al depósito»)"},
      {"texto": "Despacha en vivo de 7 a 17: pedidos de las obras por teléfono o WhatsApp y cambios de último momento"},
      {"texto": "Carga las ausencias previstas"},
      {"texto": "Mientras el capataz no declara el parte, lo carga la oficina (transitorio, decisión del 10/10)"},
      {"texto": "Pide gente a los contratistas cuando falta"}
    ],
    "no_hace": [
      "No arma una obra sin habilitación",
      "No le promete fechas al cliente: se las pasa a Comercial",
      "No es el pañolero aunque hoy también lo sea: son funciones distintas"
    ],
    "kpis": [
      "Jornadas planificadas contra ejecutadas (Tablero contra Partes)",
      "Hojas del día armadas antes de las 18 del día anterior (Hoja del día)",
      "Partes que carga la oficina en vez del capataz (Partes; la meta es que baje)"
    ],
    "nota_diseno": "Es el puesto central de la operación y hoy depende de una sola persona. Suplente sugerido: el otro encargado de pañol, que ya edita la Hoja del día. Junta lo que la estructura vieja partía en «Planificación» y «Repartos y Logística». Se separa planificación (la semana) de despacho (el día) cuando haya dos personas que lo hagan bien."
  },
  {
    "clave": "montajes", "depende_de": "ops", "tipo": "puesto", "orden": 1, "fuente_ocupantes": "cuadrillas",
    "titulo": "Cuadrillas y capataces", "rol": "Capataz del día y montadores",
    "mision": "Armar y desarmar seguro y según el criterio de montaje, y declarar el parte del día.",
    "tareas": [
      {"texto": "El capataz del día (rota; lo elige Coordinación en la Hoja del día) dirige la cuadrilla en obra"},
      {"texto": "Montaje y desmontaje de andamios, bandejas y torres"},
      {"texto": "Recibe el material en obra y avisa los faltantes antes de empezar"},
      {"texto": "Declara el parte del día: horas, avance, adicionales y esperas (Partes de obra, Odoo)"},
      {"texto": "Manda fotos y medidas finales del as-built (grupo de Telegram; el bot está a crear)"},
      {"texto": "Usa el EPP y respeta la orden de Seguridad e Higiene de frenar"},
      {"texto": "Retira y devuelve herramientas en el kiosco del Pañol"}
    ],
    "no_hace": [
      "No acepta trabajos extra del cliente sin avisar a Coordinación (es plata que se regala)",
      "No sigue armando si Seguridad e Higiene lo frena",
      "No carga ausencias"
    ],
    "kpis": [
      "Partes declarados por el capataz el mismo día (Partes)",
      "Horas reales contra estimadas (Informe de obra)",
      "Vales del Pañol sin devolver (Pañol, cuando tenga artículos cargados)"
    ],
    "nota_diseno": "Los ocupantes salen solos de Configuración › Cuadrillas (capataz, plantel y externos): no se asignan a mano. Capataz no es un puesto fijo: es una función que rota entre los operarios marcados «puede estar a cargo». Suplente sugerido: cualquier otro operario habilitado para estar a cargo."
  },
  {
    "clave": "logistica", "depende_de": "ops", "tipo": "puesto", "orden": 2,
    "titulo": "Choferes y flota", "rol": "Choferes",
    "mision": "Que el material llegue y vuelva en el viaje previsto, y que los camiones estén en condiciones y con los papeles al día.",
    "tareas": [
      {"texto": "Hace los viajes de la Hoja del día: lleva, busca, mueve, trae"},
      {"texto": "Controla la carga contra la Lista de carga antes de salir"},
      {"texto": "Busca las compras a proveedores cuando la Hoja del día lo pide"},
      {"texto": "Lleva los camiones al taller o a la VTV (viaje «Taller / VTV»)"},
      {"texto": "Carga mantenimientos y vencimientos en Vehículos"},
      {"texto": "Coordina fletes de afuera cuando no alcanzan los camiones propios"}
    ],
    "no_hace": [
      "No cambia el destino de un viaje sin avisar a Coordinación",
      "No sale con un vehículo con VTV o seguro vencido",
      "No deja material sin que el capataz confirme lo que bajó (hoy sin papel; a crear: constancia de entrega)"
    ],
    "kpis": [
      "Vehículos con VTV o seguro vencido (Vehículos)",
      "Mantenimientos cargados en Vehículos (hoy 0)",
      "Viajes de la Hoja del día que no se hicieron (a medir)"
    ],
    "nota_diseno": "Junta «Repartos y Logística» con «Mantenimiento de Vehículos»: el mantenimiento lo hace un taller externo y adentro solo hace falta alguien que lleve la agenda de la flota. Varios choferes también arman o son capataces: se ve como dos funciones de la misma persona. Suplente sugerido para la agenda de flota: Coordinación y despacho."
  },
  {
    "clave": "deposito", "depende_de": "ops", "tipo": "puesto", "orden": 3,
    "titulo": "Depósito y pañol", "rol": "Encargado de depósito y pañol",
    "mision": "Que salga lo que pide la Lista de carga, que se cuente lo que vuelve y que cada herramienta del pañol tenga a alguien a cargo.",
    "tareas": [
      {"texto": "Prepara la carga según la Lista de carga de la Hoja del día"},
      {"texto": "Cuenta el material al descargar (el conteo que vale es el del depósito)"},
      {"texto": "Separa el material dañado y se lo pasa al Taller de piezas"},
      {"texto": "Pañol: carga los artículos, atiende el kiosco (vales con QR o PIN) y reclama lo que no volvió"},
      {"texto": "Orden y limpieza del depósito"},
      {"texto": "A crear: constancia de entrega y de devolución por obra (los Remitos del sistema no se usan)"},
      {"texto": "A crear: stock de andamio por obra"}
    ],
    "no_hace": [
      "No entrega material por un pedido de WhatsApp que no esté en la Hoja del día",
      "No da por buena una devolución sin contarla",
      "No repara piezas: es del Taller de piezas"
    ],
    "kpis": [
      "Artículos cargados en el Pañol (hoy 0)",
      "Vales abiertos hace más de 7 días (Pañol)",
      "Diferencias de material por obra (a medir: requiere la constancia de devolución)"
    ],
    "nota_diseno": "Hoy no tiene gente propia: lo cubren los encargados de pañol (que también coordinan) y el encargado de turno. Por eso es una función dentro de Operaciones y no un área aparte. Vuelve a ser un frente con control propio cuando existan la constancia de entrega y devolución y alguien dedicado al depósito. Suplente sugerido: Coordinación y despacho."
  },
  {
    "clave": "taller", "depende_de": "ops", "tipo": "puesto", "orden": 4,
    "titulo": "Taller de piezas", "rol": "Herrería",
    "mision": "Devolver al stock las piezas que se pueden reparar y separar las que hay que dar de baja.",
    "tareas": [
      {"texto": "Repara y endereza piezas de andamio"},
      {"texto": "Fabrica piezas especiales a pedido de Técnico de obra"},
      {"texto": "A crear: clasificar lo devuelto en bueno, a reparar y baja, y registrarlo"}
    ],
    "no_hace": [
      "No usa material del stock para fabricar sin avisar",
      "No da de baja equipo caro sin la Dirección"
    ],
    "kpis": [
      "Piezas reparadas por mes (a medir)",
      "Piezas dadas de baja por mes (a medir)"
    ],
    "nota_diseno": "Hoy es una persona (el herrero). Suplente: ninguno; si falta, las piezas esperan. Crece si la clasificación de lo devuelto muestra más reparaciones de las que da abasto."
  },
  {
    "clave": "contratistas", "depende_de": "ops", "tipo": "puesto", "orden": 5,
    "titulo": "Contratistas de mano de obra (externo)", "rol": "Externo · lo coordina Coordinación y despacho",
    "mision": "Sumar montadores en los picos de trabajo, pagados por persona y por jornada.",
    "tareas": [
      {"texto": "Aportan gente que se suma a una cuadrilla («+N» en la Hoja del día)"},
      {"texto": "A crear: presentar ART o seguro de accidentes personales y no repetición antes de entrar"}
    ],
    "no_hace": [
      "No arman sin un capataz de ABA a cargo",
      "No entran a una obra que pide documentación sin estar habilitados"
    ],
    "kpis": [
      "Jornadas de contratistas por mes (Hoja del día)",
      "Contratistas con la documentación cargada (a medir)"
    ],
    "nota_diseno": "Externo: acá va el nombre de cada empresa contratista, con nombre libre. Si forman una cuadrilla tercerizada en Configuración › Cuadrillas, su gente aparece sola en «Cuadrillas y capataces»."
  },
  {
    "clave": "taller_mecanico", "depende_de": "ops", "tipo": "puesto", "orden": 6,
    "titulo": "Taller mecánico y VTV (externo)", "rol": "Externo · lo coordina Choferes y flota",
    "mision": "Service, reparaciones y VTV de los camiones, la hidrogrúa y los autoelevadores.",
    "tareas": [
      {"texto": "Service preventivo y reparaciones"},
      {"texto": "VTV / RTO"}
    ],
    "no_hace": [
      "No hace reparaciones grandes sin presupuesto aprobado por Administración"
    ],
    "kpis": [
      "Días de vehículo parado en el taller (a medir)"
    ],
    "nota_diseno": "Externo, con nombre libre (puede haber más de uno)."
  },

  {
    "clave": "seguridad", "depende_de": "dg", "tipo": "area", "orden": 3, "color": "rosa",
    "titulo": "Seguridad e Higiene", "rol": "Responsable de SyH",
    "mision": "Que nadie se accidente armando o desarmando, con autoridad para frenar un armado inseguro sin pedirle permiso a nadie.",
    "tareas": [
      {"texto": "Decide sin consultar: frenar un armado o un desarme inseguro (avisa en el momento a Coordinación y a la Dirección)"},
      {"texto": "Define el EPP y el criterio de uso"},
      {"texto": "Revisa con el asesor externo el programa de seguridad y los accidentes"}
    ],
    "no_hace": [
      "No depende de Operaciones: quien controla no responde a quien tiene apuro por armar",
      "No arma la documentación ante el cliente: es de Habilitaciones",
      "No planifica cuadrillas"
    ],
    "kpis": [
      "Incidentes y accidentes registrados (Incidentes; hoy 0 cargados)",
      "Armados frenados por SyH (a medir)",
      "Inspecciones hechas (Inspecciones; hoy 0)"
    ],
    "nota_diseno": "Depende de la Dirección a propósito (en la estructura vieja estaba dentro de Operaciones). Es chico —un técnico interno y el asesor externo—, pero el poder de frenar tiene que estar escrito. El capataz del día y el responsable de Operaciones también pueden frenar; nadie puede obligar a seguir."
  },
  {
    "clave": "syh", "depende_de": "seguridad", "tipo": "puesto", "orden": 0,
    "titulo": "Técnico de SyH", "rol": "Seguridad en obra",
    "mision": "Estar en las obras que lo necesitan, capacitar a las cuadrillas y registrar lo que pasa.",
    "tareas": [
      {"texto": "Va a obra cuando la venta incluye técnico de SyH (servicio que se cobra por jornada)"},
      {"texto": "Inducción y capacitación en montaje seguro"},
      {"texto": "Entrega de EPP con constancia"},
      {"texto": "Arma con Habilitaciones el programa de seguridad y el aviso de obra"},
      {"texto": "Investiga los accidentes y los carga en Incidentes"},
      {"texto": "A crear: inspección periódica de los andamios armados (Inspecciones)"}
    ],
    "no_hace": [
      "No arma ni desarma",
      "No negocia el servicio con el cliente: lo cotiza Ventas"
    ],
    "kpis": [
      "Jornadas de SyH vendidas y hechas (Odoo, OT)",
      "Operarios con la capacitación al día (a medir)",
      "EPP entregado con constancia (a medir)"
    ],
    "nota_diseno": "Una persona. Suplente: el asesor externo para lo que requiere firma; para la obra, ninguno hoy. Crece si las obras con SyH incluido superan lo que una persona puede visitar."
  },
  {
    "clave": "asesor_syh", "depende_de": "seguridad", "tipo": "puesto", "orden": 1,
    "titulo": "Asesor SyH, ART y medicina laboral (externo)", "rol": "Externo · lo coordina Seguridad e Higiene",
    "mision": "Firmar y auditar lo que la ley le pide a un profesional de SyH, y cubrir los exámenes médicos del personal.",
    "tareas": [
      {"texto": "Firma programas de seguridad y legajos técnicos [verificar alcance]"},
      {"texto": "Audita obras y el depósito"},
      {"texto": "Exámenes preocupacionales y periódicos (medicina laboral)"},
      {"texto": "Interlocutor con la ART ante un accidente"}
    ],
    "no_hace": [
      "No está en la obra todos los días: eso es el Técnico de SyH"
    ],
    "kpis": [
      "Visitas de auditoría por mes (a medir)"
    ],
    "nota_diseno": "Externo con nombre libre; pueden ser varios proveedores (SyH, ART, medicina laboral). [confirmar] si hoy hay un asesor externo contratado."
  },

  {
    "clave": "admin", "depende_de": "dg", "tipo": "area", "orden": 4, "color": "verde",
    "titulo": "Administración", "rol": "Responsable de administración",
    "mision": "Que lo que se armó se facture, lo facturado se cobre, se pague a tiempo y cada obra cierre con números claros.",
    "tareas": [
      {"texto": "Decide sin consultar: el orden de los pagos dentro del presupuesto del mes y el reclamo de deuda vencida"},
      {"texto": "Revisa el Informe de obra de cada obra desarmada y marca las que no cierran"},
      {"texto": "Coordina al contador (impuestos, balances y sueldos)"},
      {"texto": "Proveedores del edificio: matafuegos, fumigación, ascensor, mantenimiento"},
      {"texto": "A crear: conciliación de material por obra (lo que salió contra lo que volvió), cuando exista la constancia de devolución"}
    ],
    "no_hace": [
      "No persigue sola la información: cada frente entrega la suya",
      "No define precios ni descuentos",
      "No saca material del depósito"
    ],
    "kpis": [
      "Obras desarmadas con OT incompleta o sin facturar (Informe de obra)",
      "Días de cobro (Odoo: facturas y cobros)",
      "Margen por obra (Informe de obra)"
    ],
    "nota_diseno": "Un responsable con una o dos personas y las funciones de abajo: la estructura vieja la partía en cuatro casillas que nadie ocupa. Primero hay que formalizarla (hoy no está escrito quién factura ni quién cobra) y después separar. El mantenimiento edilicio vive acá como coordinación de proveedores. Conciliación de material: se crea como tarea fija cuando exista la constancia de devolución; antes no hay con qué conciliar."
  },
  {
    "clave": "fact", "depende_de": "admin", "tipo": "puesto", "orden": 0,
    "titulo": "Facturación y cobranza", "rol": "Facturación",
    "mision": "Facturar a tiempo cada obra y cada período de alquiler, y cobrarlo.",
    "tareas": [
      {"texto": "Emite las facturas electrónicas en Odoo: armado, alquiler, prórrogas, flete, gestoría y adicionales"},
      {"texto": "Factura los períodos de alquiler y las prórrogas (a crear en el sistema: hoy ningún módulo usa los períodos)"},
      {"texto": "Registra cobros y e-cheq en Odoo"},
      {"texto": "Reclama la deuda vencida y lleva las cuentas corrientes"},
      {"texto": "Le avisa a Ventas cuando un cliente atrasado pide una obra nueva"}
    ],
    "no_hace": [
      "No negocia condiciones comerciales: las fija Ventas",
      "No factura una obra sin OT o con datos incompletos: la devuelve a Comercial"
    ],
    "kpis": [
      "Días de cobro promedio (Odoo)",
      "Deuda vencida a más de 30 días (Odoo)",
      "Obras desarmadas sin facturar (Informe de obra)"
    ],
    "nota_diseno": "Junta Facturación y Cobranzas (dos casillas de la estructura vieja): hoy es una sola tarea en Odoo. Suplente sugerido: Pagos, caja y compras. Se separa la cobranza si la mora (consorcios) pasa a necesitar a alguien todo el día."
  },
  {
    "clave": "teso", "depende_de": "admin", "tipo": "puesto", "orden": 1,
    "titulo": "Pagos, caja y compras", "rol": "Tesorería",
    "mision": "Pagar lo que corresponde cuando corresponde, cuidar la caja y comprar lo que la operación necesita.",
    "tareas": [
      {"texto": "Paga a proveedores y a contratistas por jornada (con la Hoja del día como respaldo)"},
      {"texto": "Caja chica y bancos, con la Dirección"},
      {"texto": "Compras de insumos y piezas a proveedores habituales (hoy las retira un camión)"},
      {"texto": "A crear: compras como función propia (pedido, presupuesto, orden): hoy no hay módulo ni responsable"}
    ],
    "no_hace": [
      "No aprueba compras de equipo: es de la Dirección",
      "No paga sin comprobante"
    ],
    "kpis": [
      "Pagos a proveedores vencidos (Odoo)",
      "Compras hechas sin pedido previo (a medir)"
    ],
    "nota_diseno": "Suplente sugerido: Facturación y cobranza. Compras se separa como función propia cuando el volumen de compras o los faltantes de insumos lo justifiquen [disparador a definir con el dueño]."
  },
  {
    "clave": "personal", "depende_de": "admin", "tipo": "puesto", "orden": 2,
    "titulo": "Personal y sueldos", "rol": "Asistencia y legajos",
    "mision": "Que la asistencia y las novedades de cada persona lleguen completas y a tiempo para liquidar los sueldos.",
    "tareas": [
      {"texto": "Carga la asistencia diaria en Odoo (es la base de la liquidación)"},
      {"texto": "Le pasa las novedades al contador: altas, bajas, ausencias, horas extra"},
      {"texto": "Altas y bajas en Odoo (Legajos se sincroniza solo)"},
      {"texto": "Completa los legajos que tienen DNI provisorio («TMP-»)"},
      {"texto": "Régimen de liquidación del personal de obra: UOCRA/IERIC o comercio [confirmar]"}
    ],
    "no_hace": [
      "No liquida sueldos: los liquida el contador [confirmar]",
      "No decide altas ni sueldos: es de la Dirección",
      "No carga las ausencias del día: las refleja Coordinación"
    ],
    "kpis": [
      "Días con la asistencia cargada a tiempo (Odoo)",
      "Legajos con DNI provisorio (Legajos)",
      "Novedades entregadas al contador antes del cierre (a medir)"
    ],
    "nota_diseno": "En la estructura vieja era una línea de «Costos, Control y RRHH». Suplente sugerido: Habilitaciones (ya maneja nómina y ART). [confirmar] si el personal de obra encuadra en UOCRA (libreta IERIC, fondo de cese)."
  },
  {
    "clave": "contador", "depende_de": "admin", "tipo": "puesto", "orden": 3,
    "titulo": "Contador / estudio (externo)", "rol": "Externo · lo coordina Administración",
    "mision": "Impuestos, balances y liquidación de sueldos.",
    "tareas": [
      {"texto": "Liquidación de impuestos (ARCA, IIBB)"},
      {"texto": "Balances (también los que piden las licitaciones)"},
      {"texto": "Liquidación de sueldos con las novedades de Personal y sueldos [confirmar]"}
    ],
    "no_hace": [
      "No carga asistencia ni novedades: las recibe",
      "No decide pagos"
    ],
    "kpis": [
      "Vencimientos impositivos cumplidos (a medir)"
    ],
    "nota_diseno": "Externo, con nombre libre."
  },

  {
    "clave": "it", "depende_de": "dg", "tipo": "puesto", "orden": 5,
    "titulo": "Sistemas y Andamios-OS", "rol": "Función de la Dirección",
    "mision": "Que Andamios-OS, Odoo y las herramientas de la oficina funcionen y que cada módulo nuevo resuelva un problema real del circuito.",
    "tareas": [
      {"texto": "Prioriza y construye los módulos de Andamios-OS"},
      {"texto": "Da los permisos por módulo a cada usuario (Configuración › Usuarios)"},
      {"texto": "Cuida el robot de Permisos: la Mac de la oficina y las credenciales de TAD y CPAU"},
      {"texto": "Integración con Odoo (OT, partes, asignaciones, legajos)"},
      {"texto": "Coordina el soporte externo de hardware y redes cuando hace falta"}
    ],
    "no_hace": [
      "No fija prioridades de negocio por su cuenta: las fija la Dirección",
      "No carga datos por otros frentes"
    ],
    "kpis": [
      "Usuarios con permiso en los módulos que usan (Configuración › Usuarios)",
      "Avisos leídos por quien tiene que actuar (Alertas)",
      "Días con el robot de Permisos caído (a medir)"
    ],
    "nota_diseno": "No es un área: es una función de la Dirección con soporte externo (en la estructura vieja era el área «Sistemas y Mantenimiento»; el mantenimiento edilicio pasó a Administración). Suplente: ninguno interno hoy; como mínimo, dejar escritas las credenciales y cómo arrancar el robot. Pasa a puesto propio si mantener los módulos se come el tiempo del dueño."
  },
  {
    "clave": "abogado", "depende_de": "dg", "tipo": "puesto", "orden": 6,
    "titulo": "Abogado (externo)", "rol": "Externo · lo coordina la Dirección",
    "mision": "Respaldo legal en lo laboral y lo comercial: contratos, actas, accidentes y cobranza judicial.",
    "tareas": [
      {"texto": "Redacta el acta de entrega y aceptación y la cláusula de faltantes (pendiente)"},
      {"texto": "Juicios laborales y por accidentes, junto con la ART"},
      {"texto": "Cartas documento y cobranza judicial a pedido de Administración"}
    ],
    "no_hace": [
      "No negocia con clientes por su cuenta",
      "No decide si se cobra un faltante: asesora a la Dirección"
    ],
    "kpis": [
      "Temas legales abiertos (a medir)"
    ],
    "nota_diseno": "Externo, con nombre libre. Vacío quiere decir que no se cargó quién es, no que haya que buscar a alguien."
  }
]
$v2$;
BEGIN
  -- Mismo candado que usan org_crear_borrador / org_publicar / org_descartar_borrador.
  PERFORM pg_advisory_xact_lock(hashtext('org_versiones'));

  IF EXISTS (SELECT 1 FROM org_versiones WHERE estado = 'borrador') THEN
    RAISE EXCEPTION 'Ya hay un borrador del organigrama: publicá o descartá el borrador actual primero (Organigrama › Versiones) y volvé a correr este script. No se cambió nada.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_vigente FROM org_versiones WHERE estado = 'publicada';
  IF v_vigente IS NULL THEN
    RAISE EXCEPTION 'No hay una versión publicada del organigrama: este script arma la v2 como cambio sobre la vigente. No se cambió nada.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Una clave nueva de la v2 no puede caer sobre un nodo vivo que no está en la vigente (no
  -- debería pasar: al publicar o descartar, los nodos huérfanos liberan su clave).
  SELECT string_agg(n.clave, ', ') INTO v_ajena
    FROM org_nodos n
   WHERE n.clave IN (SELECT f->>'clave' FROM jsonb_array_elements(v_filas) f)
     AND NOT EXISTS (SELECT 1 FROM org_nodo_version nv WHERE nv.version_id = v_vigente AND nv.nodo_id = n.id);
  IF v_ajena IS NOT NULL THEN
    RAISE EXCEPTION 'Estas claves ya existen fuera de la versión vigente: %. Revisalas antes de cargar la v2. No se cambió nada.', v_ajena
      USING ERRCODE = 'unique_violation';
  END IF;

  -- El borrador nace basado en la vigente (como org_crear_borrador), pero vacío: la v2 se
  -- escribe entera. Lo que no está en la v2 queda fuera del borrador (= eliminado al publicar).
  INSERT INTO org_versiones (estado, basada_en) VALUES ('borrador', v_vigente) RETURNING id INTO v_borrador;
  PERFORM org_escribir_nodos(v_borrador, v_filas);

  RAISE NOTICE 'Listo: borrador % con % nodos. Revisalo en /organigrama/lienzo y publicalo (o descartalo) desde Versiones.',
    v_borrador, (SELECT count(*) FROM org_nodo_version WHERE version_id = v_borrador);
END;
$script$;
