// La ESTRUCTURA BASE del organigrama de ABA: 1 dirección, 5 áreas y 18 puestos.
//
// Es el contenido real del organigrama original (seedData.js de «organigrama-aba»): títulos,
// misiones de las áreas, tareas con los documentos que tocan, «qué NO hace», KPIs y notas de
// diseño. Sin personas: las personas salen de Legajos y de los usuarios, y el dueño las ubica
// en el Lienzo.
//
// La migración 20261012000003_organigrama.sql la carga como VERSIÓN 1 publicada (el JSON de
// adentro se genera desde este archivo con scripts/organigrama-estructura-sql.mts, y
// datos.test.ts verifica que no se desincronicen). Las misiones de los 18 puestos quedan
// vacías a propósito, como en el original: la ficha muestra «Falta la misión» y hereda
// «qué NO hace» y KPIs del área.

import type { Documento, Nodo } from "./tipos.ts";

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

/** La estructura base: lo que se publica como versión 1. */
export const ESTRUCTURA_BASE: Nodo[] = [
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
