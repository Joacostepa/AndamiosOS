// El dataset de la MAQUETA del organigrama (docs/organigrama/propuesta.md § 6.4).
//
// OJO: son datos de ejemplo, 100 % locales. Los nodos (títulos, misiones de las áreas, tareas,
// "qué NO hace", KPIs y notas) son copia textual del seedData.js del organigrama original; las
// personas y los teléfonos son INVENTADOS (prefijo ficticio 11 5555-01xx). Nada de esto toca
// Supabase: el estado vive en memoria y se pierde al recargar.
//
// Las misiones de los 18 puestos quedan vacías a propósito, como en el original: ejercitan el
// estado «Falta la misión» y la herencia de "qué NO hace" y KPIs desde el área.

import type { Cuadrilla, Documento, Nodo, Ocupante, Persona, Version, VerComo } from "./tipos";

/** "Hoy" de la maqueta: fijo, para que los días de interino y las fechas no dependan del reloj. */
export const HOY = "2026-10-12";

export const DOCUMENTOS: Documento[] = [
  { codigo: "SOL", nombre: "Solicitud de Materiales" },
  { codigo: "OPC", nombre: "Orden de Preparación de Carga" },
  { codigo: "RS", nombre: "Remito de Salida" },
  { codigo: "FS", nombre: "Formulario de Sobrante" },
  { codigo: "RDP", nombre: "Remito de Devolución Parcial" },
  { codigo: "RDF", nombre: "Remito de Devolución Final" },
  { codigo: "ICO", nombre: "Informe de Conciliación de Obra" },
];

type Base = Omit<Nodo, "tareas" | "noHace" | "kpis"> & Partial<Pick<Nodo, "tareas" | "noHace" | "kpis">>;
const n = (b: Base): Nodo => ({ tareas: [], noHace: [], kpis: [], ...b });

/** La versión vigente (v3): 1 dirección, 5 áreas y 18 puestos. */
export const NODOS_VIGENTES: Nodo[] = [
  n({
    clave: "dg",
    dependeDe: null,
    tipo: "direccion",
    titulo: "DIRECCIÓN GENERAL",
    rol: "Gerencia General",
    color: "gris",
    orden: 0,
    mision: "Coordina todas las áreas. Traduce estrategia en ejecución. Define prioridades. Lidera reuniones de gestión. Resuelve conflictos interáreas.",
    noHace: ["No opera directamente", "No puentea jefaturas", "No resuelve cada excepción personalmente"],
    kpis: ["Cumplimiento plan estratégico", "Coordinación interáreas", "Rentabilidad general"],
  }),

  // ── Técnico-Comercial ──────────────────────────────────────────────────────
  n({
    clave: "tec_com",
    dependeDe: "dg",
    tipo: "area",
    titulo: "Dirección Técnico-Comercial",
    rol: "Responsable Técnico-Comercial",
    color: "teal",
    orden: 0,
    mision:
      "Área unificada. El vendedor capta, atiende y envía al técnico a relevar. El técnico proyecta, computa y devuelve la cotización. El vendedor negocia y cierra. Trabajan como equipo con cola de trabajo priorizada.",
    noHace: [
      "El vendedor no promete fechas sin validar con el técnico",
      "El técnico no persigue clientes",
      "Ninguno altera alcances en obra sin bajar formalmente",
    ],
    kpis: ["Ventas cerradas", "Tasa de conversión", "Tiempo de respuesta de cotización", "Errores de cómputo", "Rentabilidad por negocio", "Clientes nuevos"],
    notaDiseno: "CLAVE: la cola de trabajo del técnico debe ser visible y priorizada.",
  }),
  n({
    clave: "ventas",
    dependeDe: "tec_com",
    tipo: "puesto",
    titulo: "Ventas",
    rol: "Ejecutivos Comerciales",
    orden: 0,
    tareas: [
      { texto: "Captación y desarrollo de clientes" },
      { texto: "Atención de consultas (teléfono, WhatsApp, mail)" },
      { texto: "Cotización y negociación de presupuestos" },
      { texto: "Seguimiento post-venta y satisfacción" },
      { texto: "Renovaciones y cartera activa" },
      { texto: "Campañas Google Ads y redes sociales" },
      { texto: "Estrategias SEO y contenido web" },
    ],
  }),
  n({
    clave: "oficina_tec",
    dependeDe: "tec_com",
    tipo: "puesto",
    titulo: "Oficina Técnica",
    rol: "Técnicos Proyectistas",
    orden: 1,
    tareas: [
      { texto: "Relevamientos y planos en campo" },
      { texto: "Renders y memorias de cálculo" },
      { texto: "Proyectos y cómputo de materiales" },
      { texto: "Documentación técnica de obra" },
      { texto: "Criterios de montaje y estandarización" },
      { texto: "Emitir Solicitud de Materiales (SOL)", docs: [{ codigo: "SOL", rol: "emite" }] },
    ],
  }),

  // ── Operaciones ────────────────────────────────────────────────────────────
  n({
    clave: "ops",
    dependeDe: "dg",
    tipo: "area",
    titulo: "Dirección de Operaciones",
    rol: "Responsable de Operaciones",
    color: "ambar",
    orden: 1,
    mision:
      "Ejecuta armados, desarmes y servicios. Planifica y programa obras. Coordina cuadrillas, supervisores y transporte. Separación clara entre Planificación (decide qué/cuándo) y Ejecución (hace).",
    noHace: ["No vende", "No define precios", "No saca materiales por fuera del circuito", "No entrega sin remito"],
    kpis: ["Cumplimiento de agenda", "Horas reales vs previstas", "Productividad cuadrillas", "Retrabajos", "% obras según programa", "Desvíos operativos"],
    notaDiseno: "Logística y transporte quedan acá porque son ejecución operativa. Depósito NO.",
  }),
  n({
    clave: "planif",
    dependeDe: "ops",
    tipo: "puesto",
    titulo: "Planificación y Programación",
    rol: "Coordinador",
    orden: 0,
    tareas: [
      { texto: "Programar qué obra va cuándo" },
      { texto: "Asignar cuadrillas y recursos" },
      { texto: "Definir prioridades y secuencias" },
      { texto: "Coordinar con Depósito fechas de despacho y retorno" },
    ],
  }),
  n({
    clave: "supervision",
    dependeDe: "ops",
    tipo: "puesto",
    titulo: "Supervisión de Obras",
    rol: "Supervisores",
    orden: 1,
    tareas: [
      { texto: "Control de ejecución en campo" },
      { texto: "Verificación de planos y diseños" },
      { texto: "Reportes de avances y problemas" },
      { texto: "Control de tiempos de ejecución" },
    ],
  }),
  n({
    clave: "montajes",
    dependeDe: "ops",
    tipo: "puesto",
    titulo: "Montajes y Desmontajes",
    rol: "Capataces / Cuadrillas",
    orden: 2,
    fuenteOcupantes: "cuadrillas",
    tareas: [
      { texto: "Coordinación de cuadrillas de montaje" },
      { texto: "Ejecución de montaje de andamios (todas las verticales)" },
      { texto: "Ejecución de desmontaje y devolución de materiales" },
      { texto: "Firma de Remitos de Salida (RS) al recibir", docs: [{ codigo: "RS", rol: "firma" }] },
      { texto: "Emisión de Formulario de Sobrante (FS) post-armado", docs: [{ codigo: "FS", rol: "emite" }] },
      { texto: "Firma de Remito de Devolución Final (RDF) al desarmar", docs: [{ codigo: "RDF", rol: "firma" }] },
    ],
  }),
  n({
    clave: "taller",
    dependeDe: "ops",
    tipo: "puesto",
    titulo: "Taller",
    rol: "Reparación y Fabricación",
    orden: 3,
    tareas: [
      { texto: "Reparación y fabricación de piezas" },
      { texto: "Control de calidad de materiales" },
      { texto: "Registro y mantenimiento de materiales" },
    ],
  }),
  n({
    clave: "logistica",
    dependeDe: "ops",
    tipo: "puesto",
    titulo: "Repartos y Logística",
    rol: "Coordinador Logístico / Choferes",
    orden: 4,
    tareas: [
      { texto: "Coordinación de entregas y retiros" },
      { texto: "Programación de viajes y vehículos" },
      { texto: "Monitoreo de flota en tiempo real" },
      { texto: "Transporte con remito correspondiente", docs: [{ codigo: "RS", rol: "usa" }] },
      { texto: "Firma de RS al cargar y entregar", docs: [{ codigo: "RS", rol: "firma" }] },
    ],
  }),
  n({
    clave: "seguridad",
    dependeDe: "ops",
    tipo: "puesto",
    titulo: "Seguridad y Formación",
    rol: "SyH / Capacitación",
    orden: 5,
    tareas: [
      { texto: "Auditorías e investigación de accidentes" },
      { texto: "EPP y documentación habilitante" },
      { texto: "Capacitación en montaje seguro" },
      { texto: "Habilitación personal de obra / seguros" },
    ],
  }),
  n({
    clave: "vehiculos",
    dependeDe: "ops",
    tipo: "puesto",
    titulo: "Mantenimiento de Vehículos",
    rol: "Flota",
    orden: 6,
    tareas: [
      { texto: "Inspección y mantenimiento preventivo" },
      { texto: "Gestión de repuestos e insumos" },
      { texto: "Registro de historial de reparaciones" },
    ],
  }),

  // ── Depósito ───────────────────────────────────────────────────────────────
  n({
    clave: "deposito",
    dependeDe: "dg",
    tipo: "area",
    titulo: "Depósito y Control de Materiales",
    rol: "Encargado de Depósito",
    color: "violeta",
    orden: 2,
    mision:
      "Custodio del inventario físico. Único habilitado para entregar o recibir material. Reporta directo a Dirección General para garantizar independencia de control frente a Operaciones.",
    noHace: ["No entrega material sin Solicitud aprobada", "No recibe sin remito", "No modifica stock sin respaldo", "No responde a pedidos informales"],
    kpis: [
      "Diferencia stock físico vs sistema (<1%)",
      "Material dado de baja por daño",
      "Tasa de diferencias al cierre (<10%)",
      "% faltante sin justificación (<0.5%)",
    ],
    notaDiseno: "SEPARADO DE OPERACIONES a propósito. Si reporta a Operaciones, pierde capacidad de decir 'no' cuando falta documentación.",
  }),
  n({
    clave: "stock",
    dependeDe: "deposito",
    tipo: "puesto",
    titulo: "Control de Stock",
    rol: "Stock e Inventario",
    orden: 0,
    tareas: [
      { texto: "Inventario de materiales actualizado" },
      { texto: "Verificar stock disponible vs SOL", docs: [{ codigo: "SOL", rol: "usa" }] },
      { texto: "Emitir Orden de Preparación de Carga (OPC)", docs: [{ codigo: "OPC", rol: "emite" }] },
      { texto: "Emitir Remitos de Salida (RS)", docs: [{ codigo: "RS", rol: "emite" }] },
      { texto: "Clasificar material devuelto (bueno/reparar/baja)" },
      { texto: "Auditoría mensual de stock físico vs sistema" },
    ],
  }),
  n({
    clave: "despacho",
    dependeDe: "deposito",
    tipo: "puesto",
    titulo: "Preparación y Despacho",
    rol: "Operarios de Depósito",
    orden: 1,
    tareas: [
      { texto: "Preparar cargas según OPC", docs: [{ codigo: "OPC", rol: "usa" }] },
      { texto: "Conteo final ítem por ítem antes de cargar" },
      { texto: "Etiquetar materiales por obra" },
      { texto: "Organización y orden de almacenamiento" },
      { texto: "Limpieza e identificación de defectuosos" },
    ],
  }),
  n({
    clave: "devoluciones",
    dependeDe: "deposito",
    tipo: "puesto",
    titulo: "Recepción y Devoluciones",
    rol: "Control de Ingresos",
    orden: 2,
    tareas: [
      {
        texto: "Recibir devoluciones con RDP/RDF firmado",
        docs: [
          { codigo: "RDP", rol: "recibe" },
          { codigo: "RDF", rol: "recibe" },
        ],
      },
      { texto: "Verificar estado de cada ítem devuelto" },
      {
        texto: "Registrar sobrantes (FS) y parciales (RDP)",
        docs: [
          { codigo: "FS", rol: "recibe" },
          { codigo: "RDP", rol: "recibe" },
        ],
      },
      { texto: "Área de cuarentena para material sin remito" },
      { texto: "Actualizar stock al momento del movimiento" },
    ],
  }),

  // ── Administración ─────────────────────────────────────────────────────────
  n({
    clave: "admin",
    dependeDe: "dg",
    tipo: "area",
    titulo: "Administración y Finanzas",
    rol: "Responsable Admin. y Finanzas",
    color: "verde",
    orden: 3,
    mision:
      "Área nueva a formalizar. Asegura orden documental, caja, facturación, cobranza y control económico. Es donde vive la conciliación de materiales por obra.",
    noHace: [
      "No persigue sola información que otras áreas deben entregar",
      "No se hace cargo de errores sin elevarlos",
      "No solo apaga incendios",
    ],
    kpis: ["Facturación emitida vs pendiente", "Días de cobro", "Mora", "Flujo de fondos", "Margen por obra", "% obras conciliadas al cierre (100%)"],
    notaDiseno: "NUEVA. Hoy está dispersa. Crítico formalizarla.",
  }),
  n({
    clave: "fact",
    dependeDe: "admin",
    tipo: "puesto",
    titulo: "Facturación",
    rol: "Facturación",
    orden: 0,
    tareas: [
      { texto: "Emitir facturas en tiempo y forma" },
      { texto: "Control documental de obra" },
      { texto: "Alinear con Comercial condiciones de facturación" },
    ],
  }),
  n({
    clave: "cobr",
    dependeDe: "admin",
    tipo: "puesto",
    titulo: "Cobranzas",
    rol: "Cobranzas",
    orden: 1,
    tareas: [{ texto: "Gestión de cobro" }, { texto: "Control de deuda y mora" }, { texto: "Cuentas corrientes de clientes" }],
    notaInterna: "Buscando perfil con experiencia en cuentas corrientes; entrevistas en noviembre",
  }),
  n({
    clave: "teso",
    dependeDe: "admin",
    tipo: "puesto",
    titulo: "Tesorería y Pagos",
    rol: "Tesorería",
    orden: 2,
    tareas: [{ texto: "Administrar flujo de fondos" }, { texto: "Ordenar pagos a proveedores" }, { texto: "Control de caja" }],
  }),
  n({
    clave: "control",
    dependeDe: "admin",
    tipo: "puesto",
    titulo: "Costos, Control y RRHH",
    rol: "Control de Gestión",
    orden: 3,
    tareas: [
      { texto: "Conciliación de materiales por obra (ICO)", docs: [{ codigo: "ICO", rol: "emite" }] },
      {
        texto: "Registro de todos los remitos en sistema",
        docs: [
          { codigo: "RS", rol: "usa" },
          { codigo: "RDP", rol: "usa" },
          { codigo: "RDF", rol: "usa" },
        ],
      },
      { texto: "Análisis de márgenes y desvíos" },
      { texto: "Reportes de KPIs operativos y financieros" },
      { texto: "Altas, bajas y legajos de personal" },
      { texto: "Compras operativas y relación proveedores" },
    ],
  }),

  // ── Sistemas ───────────────────────────────────────────────────────────────
  n({
    clave: "sistemas",
    dependeDe: "dg",
    tipo: "area",
    titulo: "Sistemas y Mantenimiento",
    rol: "IT / Infraestructura",
    color: "rosa",
    orden: 4,
    mision: "Función combinada y liviana. Resuelve IT, automatiza lo posible, mantiene infraestructura edilicia.",
    noHace: ["No decide prioridades de negocio", "No trabaja sin coordinación con otras áreas"],
    kpis: ["Uptime de sistemas", "Tiempo de resolución de incidentes", "Mantenimiento preventivo cumplido"],
    notaDiseno: "Función combinada. Si el volumen crece, se separan.",
  }),
  n({
    clave: "it",
    dependeDe: "sistemas",
    tipo: "puesto",
    titulo: "Soporte IT y Desarrollo",
    rol: "Sistemas",
    orden: 0,
    tareas: [
      { texto: "Hardware, redes y software" },
      { texto: "Desarrollo de software interno" },
      { texto: "Automatización de tareas repetitivas" },
      { texto: "Soluciones de gestión logística e inventarios" },
      { texto: "Evaluación de nuevas tecnologías" },
    ],
  }),
  n({
    clave: "mant",
    dependeDe: "sistemas",
    tipo: "puesto",
    titulo: "Mantenimiento Edilicio",
    rol: "Infraestructura",
    orden: 1,
    tareas: [
      { texto: "Mantenimiento preventivo (fumigación, desagües)" },
      { texto: "Mantenimiento correctivo (reparaciones, filtraciones)" },
      { texto: "Servicios externos (incendios, ascensor, matafuegos)" },
      { texto: "Limpieza de depósitos y oficinas" },
    ],
  }),
];

/**
 * El borrador que trae la maqueta (Natalia, 10/10): un puesto nuevo debajo de Logística y una
 * tarea más en Control de Stock. Así el modo borrador se ve poblado de entrada y se ejercitan
 * los sub-puestos indentados dentro de una columna.
 */
export const NODOS_BORRADOR: Nodo[] = [
  ...NODOS_VIGENTES.map((x) =>
    x.clave === "stock" ? { ...x, tareas: [...x.tareas, { texto: "Controlar vencimiento de certificaciones de materiales" }] } : x,
  ),
  n({
    clave: "coord_logistico",
    dependeDe: "logistica",
    tipo: "puesto",
    titulo: "Coordinador Logístico",
    rol: "Coordinación de viajes",
    orden: 0,
    tareas: [{ texto: "Coordinación de entregas y retiros" }, { texto: "Programación de viajes y vehículos" }],
  }),
];

const tel = (sufijo: string) => `11 5555-01${sufijo}`;
const mail = (usuario: string) => `${usuario}@aba.ejemplo`;

export const PERSONAS: Persona[] = [
  { id: "p-rfb", nombre: "Ricardo", apellido: "Fernández Bustos", origen: "usuario", activo: true, telefono: tel("01"), email: mail("rfernandez") },
  { id: "p-mig", nombre: "Martín", apellido: "Iglesias", origen: "usuario", activo: true, telefono: tel("02"), email: mail("miglesias") },
  { id: "p-lbe", nombre: "Lucía", apellido: "Benítez", origen: "usuario", activo: true, telefono: tel("03"), email: mail("lbenitez") },
  { id: "p-fso", nombre: "Federico", apellido: "Sosa", origen: "usuario", activo: true, telefono: tel("04"), email: mail("fsosa") },
  { id: "p-ipa", nombre: "Ignacio", apellido: "Paredes", origen: "legajo", activo: true, telefono: tel("05") },
  { id: "p-gro", nombre: "Gustavo", apellido: "Romero", origen: "usuario", activo: true, telefono: tel("06"), email: mail("gromero") },
  { id: "p-cme", nombre: "Carolina", apellido: "Medina", origen: "usuario", activo: true, telefono: tel("07"), email: mail("cmedina") },
  { id: "p-wac", nombre: "Walter", apellido: "Acosta", origen: "legajo", activo: true, telefono: tel("08") },
  { id: "p-rgi", nombre: "Ramón", apellido: "Giménez", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("09") },
  { id: "p-hvi", nombre: "Héctor", apellido: "Villalba", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("10") },
  { id: "p-dle", nombre: "Diego", apellido: "Ledesma", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("11") },
  { id: "p-alu", nombre: "Alan", apellido: "Luna", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("12") },
  { id: "p-efe", nombre: "Ezequiel", apellido: "Ferreyra", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("13") },
  { id: "p-jpe", nombre: "Jonathan", apellido: "Pereyra", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("14") },
  { id: "p-msa", nombre: "Maximiliano", apellido: "Sánchez", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("15") },
  { id: "p-cva", nombre: "Cristian", apellido: "Vera", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("16") },
  { id: "p-dmo", nombre: "Damián", apellido: "Molina", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("17") },
  { id: "p-lca", nombre: "Lucas", apellido: "Cabrera", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("18") },
  { id: "p-rbr", nombre: "Rodrigo", apellido: "Brizuela", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("19") },
  { id: "p-gna", nombre: "Gonzalo", apellido: "Navarro", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("20") },
  { id: "p-fro", nombre: "Franco", apellido: "Rojas", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("21") },
  { id: "p-sti", nombre: "Santiago", apellido: "Toledo", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("22") },
  { id: "p-mgo", nombre: "Marcelo", apellido: "Godoy", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("23") },
  { id: "p-ext1", nombre: "Hugo", apellido: "Báez", origen: "externo", activo: true, tarea: "andamista", empresa: "Montajes del Oeste", telefono: tel("24") },
  { id: "p-ope", nombre: "Osvaldo", apellido: "Peralta", origen: "legajo", activo: true, tarea: "herrero", telefono: tel("25") },
  { id: "p-joj", nombre: "Javier", apellido: "Ojeda", origen: "legajo", activo: true, tarea: "chofer", telefono: tel("26") },
  { id: "p-cru", nombre: "Cristian", apellido: "Ruiz", origen: "legajo", activo: true, tarea: "chofer", telefono: tel("27") },
  { id: "p-sdo", nombre: "Sergio", apellido: "Domínguez", origen: "usuario", activo: true, telefono: tel("28"), email: mail("sdominguez") },
  { id: "p-mco", nombre: "Matías", apellido: "Correa", origen: "legajo", activo: true, telefono: tel("29") },
  { id: "p-bag", nombre: "Brian", apellido: "Aguirre", origen: "legajo", activo: true, telefono: tel("30") },
  { id: "p-nhe", nombre: "Nicolás", apellido: "Herrera", origen: "legajo", activo: false, bajaEl: "2026-10-05", telefono: tel("31") },
  { id: "p-nqu", nombre: "Natalia", apellido: "Quiroga", origen: "usuario", activo: true, telefono: tel("42"), email: mail("nquiroga") },
  { id: "p-smo", nombre: "Silvia", apellido: "Moreno", origen: "usuario", activo: true, telefono: tel("33"), email: mail("smoreno") },
  { id: "p-tvi", nombre: "Tomás", apellido: "Vidal", origen: "usuario", activo: true, telefono: tel("34"), email: mail("tvidal") },
  { id: "p-ext2", nombre: "Servicios Edilicios Sur", apellido: "", origen: "externo", activo: true, telefono: tel("35") },
  { id: "p-lfu", nombre: "Leandro", apellido: "Funes", origen: "legajo", activo: true, tarea: "andamista", telefono: tel("36") },
  { id: "p-lpa", nombre: "Laura", apellido: "Paz", origen: "usuario", activo: false, bajaEl: "2026-07-15", email: mail("lpaz") },
];

const o = (id: string, nodo: string, persona: string, desde: string, extra: Partial<Ocupante> = {}): Ocupante => ({
  id,
  nodo,
  persona,
  modalidad: "titular",
  desde,
  ...extra,
});

export const OCUPANTES: Ocupante[] = [
  o("o-dg", "dg", "p-rfb", "2019-03-01"),
  o("o-tec", "tec_com", "p-mig", "2021-02-15"),
  o("o-ven1", "ventas", "p-lbe", "2022-05-02"),
  o("o-ven2", "ventas", "p-fso", "2024-03-11"),
  o("o-ot1", "oficina_tec", "p-ipa", "2020-08-03"),
  o("o-ot2", "oficina_tec", "p-mig", "2019-06-10"),
  o("o-ops", "ops", "p-gro", "2019-03-01"),
  o("o-pla", "planif", "p-cme", "2023-04-17"),
  o("o-sup", "supervision", "p-wac", "2020-01-13"),
  o("o-tal", "taller", "p-ope", "2019-09-02"),
  o("o-log1", "logistica", "p-joj", "2021-07-05"),
  o("o-log2", "logistica", "p-cru", "2025-02-03"),
  o("o-seg", "seguridad", "p-wac", "2026-08-01", { modalidad: "interino" }),
  o("o-dep", "deposito", "p-sdo", "2021-03-01"),
  o("o-sto", "stock", "p-sdo", "2021-03-01"),
  o("o-des1", "despacho", "p-mco", "2022-09-12"),
  o("o-des2", "despacho", "p-bag", "2025-06-02"),
  o("o-dev", "devoluciones", "p-nhe", "2023-11-06"),
  o("o-adm", "admin", "p-nqu", "2020-02-03"),
  o("o-fac", "fact", "p-nqu", "2020-02-03"),
  // Histórico: Laura dejó Cobranzas el 15/07. Sirve para mostrar «vacante desde 15/07».
  o("o-cob", "cobr", "p-lpa", "2022-04-04", { hasta: "2026-07-15" }),
  o("o-tes", "teso", "p-smo", "2021-10-18"),
  o("o-con", "control", "p-nqu", "2024-01-08"),
  o("o-sis", "sistemas", "p-tvi", "2022-01-10"),
  o("o-it", "it", "p-tvi", "2022-01-10"),
  o("o-man", "mant", "p-ext2", "2023-05-15"),
];

/** Alimentan `montajes` (fuenteOcupantes = "cuadrillas"): en la app real, Configuración › Cuadrillas. */
export const CUADRILLAS: Cuadrilla[] = [
  { id: "c1", nombre: "Cuadrilla 1", capataz: "p-rgi", plantel: ["p-alu", "p-efe", "p-jpe", "p-msa", "p-cva"] },
  { id: "c2", nombre: "Cuadrilla 2", capataz: "p-hvi", plantel: ["p-dmo", "p-lca", "p-rbr", "p-gna"] },
  { id: "c3", nombre: "Cuadrilla 3", capataz: "p-dle", plantel: ["p-fro", "p-sti", "p-mgo", "p-ext1"] },
];

/** Versiones publicadas (la última `publicada` es la vigente). */
export const VERSIONES: Version[] = [
  {
    id: "v3",
    numero: 3,
    estado: "publicada",
    fecha: "2026-09-01",
    autor: "Ricardo Fernández Bustos",
    nota: "Se formaliza Seguridad y Formación dentro de Operaciones",
    cambios: [{ tipo: "nuevo", nodo: "seguridad", detalle: "Puesto nuevo con 4 tareas" }],
  },
  {
    id: "v2",
    numero: 2,
    estado: "archivada",
    fecha: "2026-06-02",
    autor: "Ricardo Fernández Bustos",
    nota: "Depósito pasa a reportar a Dirección General",
    cambios: [{ tipo: "movido", nodo: "deposito", detalle: "De Dirección de Operaciones a Dirección General" }],
  },
  { id: "v1", numero: 1, estado: "archivada", fecha: "2026-03-15", autor: "Ricardo Fernández Bustos", nota: "Estructura inicial", cambios: [] },
];

/** Quién armó el borrador que trae la maqueta. Sus cambios se calculan con diffVersiones. */
export const BORRADOR_META = { fecha: "2026-10-10", autor: "Natalia Quiroga" };

/** Los cambios que se esperan del borrador inicial (los usa el test de diffVersiones). */
export const CAMBIOS_BORRADOR: Version["cambios"] = [
  { tipo: "nuevo", nodo: "coord_logistico", detalle: "Coordinador Logístico, debajo de Repartos y Logística" },
  { tipo: "modificado", nodo: "stock", detalle: "+1 tarea: Controlar vencimiento de certificaciones de materiales" },
];

export const OPCIONES_VER_COMO: { id: VerComo; titulo: string; persona: string; editor: boolean }[] = [
  { id: "direccion", titulo: "Dirección (editor)", persona: "p-rfb", editor: true },
  { id: "administracion", titulo: "Administración (editor)", persona: "p-nqu", editor: true },
  { id: "encargado", titulo: "Encargado (lector)", persona: "p-sdo", editor: false },
  { id: "capataz", titulo: "Capataz (lector)", persona: "p-rgi", editor: false },
];
