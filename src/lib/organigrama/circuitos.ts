// «Seguí el papel» (docs/organigrama/propuesta.md § 7): los circuitos documentales de ABA
// contados como un papel que viaja de puesto en puesto. Cada parada sale de las tareas que YA
// están en la estructura (quién emite, firma, recibe o usa cada documento): el test verifica que
// el puesto exista y que, si la parada dice «emite la SOL», el puesto tenga esa tarea.

import type { CodigoDoc, RolDoc } from "./tipos.ts";

export type Parada = {
  nodo: string;
  /** El papel que viaja en este tramo (cambia: la SOL se convierte en OPC, después en RS…). */
  papel: CodigoDoc | "FAC";
  /** Si la parada sale de una tarea con documento: qué hace el puesto con él. */
  rol?: RolDoc;
  texto: string;
};

export type Circuito = { id: string; titulo: string; resumen: string; paradas: Parada[] };

export const CIRCUITOS: Circuito[] = [
  {
    id: "salida",
    titulo: "Sale material a la obra",
    resumen: "De la Solicitud de Materiales al remito firmado en obra.",
    paradas: [
      { nodo: "oficina_tec", papel: "SOL", rol: "emite", texto: "Proyecta la obra, computa los materiales y emite la Solicitud de Materiales." },
      { nodo: "stock", papel: "SOL", rol: "usa", texto: "Verifica el stock disponible contra la SOL." },
      { nodo: "stock", papel: "OPC", rol: "emite", texto: "Si hay stock, emite la Orden de Preparación de Carga." },
      { nodo: "despacho", papel: "OPC", rol: "usa", texto: "Prepara la carga según la OPC y cuenta ítem por ítem antes de cargar." },
      { nodo: "stock", papel: "RS", rol: "emite", texto: "Emite el Remito de Salida. Sin remito, no sale nada del depósito." },
      { nodo: "logistica", papel: "RS", rol: "firma", texto: "El chofer firma el RS al cargar, viaja con el remito y lo hace firmar al entregar." },
      { nodo: "montajes", papel: "RS", rol: "firma", texto: "El capataz firma el RS al recibir el material en obra." },
      { nodo: "control", papel: "RS", rol: "usa", texto: "Registra el remito en el sistema: es la base de la conciliación de la obra." },
    ],
  },
  {
    id: "devolucion",
    titulo: "Vuelve material de la obra",
    resumen: "Sobrantes, devoluciones parciales y la devolución final al desarmar.",
    paradas: [
      { nodo: "montajes", papel: "FS", rol: "emite", texto: "Después del armado, el capataz emite el Formulario de Sobrante con lo que no se usó." },
      { nodo: "devoluciones", papel: "FS", rol: "recibe", texto: "Registra el sobrante y verifica el estado de cada ítem devuelto." },
      { nodo: "montajes", papel: "RDF", rol: "firma", texto: "Al desarmar, el capataz firma el Remito de Devolución Final." },
      { nodo: "devoluciones", papel: "RDF", rol: "recibe", texto: "Recibe la devolución con el RDF firmado. Lo que llega sin remito va a cuarentena." },
      { nodo: "stock", papel: "RDF", texto: "Clasifica el material devuelto: bueno, a reparar o de baja." },
      { nodo: "control", papel: "RDF", rol: "usa", texto: "Registra el RDF: con eso la obra queda lista para conciliar." },
    ],
  },
  {
    id: "cierre",
    titulo: "Cierre y cobro de la obra",
    resumen: "La conciliación de materiales, la factura y el cobro.",
    paradas: [
      { nodo: "control", papel: "ICO", rol: "emite", texto: "Concilia lo que salió (RS) contra lo que volvió (RDP y RDF) y emite el Informe de Conciliación de Obra." },
      { nodo: "fact", papel: "FAC", texto: "Con la obra conciliada, emite la factura en tiempo y forma." },
      { nodo: "cobr", papel: "FAC", texto: "Gestiona el cobro y controla la deuda y la mora del cliente." },
      { nodo: "teso", papel: "FAC", texto: "Ingresa el cobro al flujo de fondos y ordena los pagos a proveedores." },
      { nodo: "admin", papel: "ICO", texto: "Mide el margen por obra y el % de obras conciliadas al cierre (KPIs del área)." },
    ],
  },
];

export const NOMBRE_PAPEL: Record<Parada["papel"], string> = {
  SOL: "Solicitud de Materiales",
  OPC: "Orden de Preparación de Carga",
  RS: "Remito de Salida",
  FS: "Formulario de Sobrante",
  RDP: "Remito de Devolución Parcial",
  RDF: "Remito de Devolución Final",
  ICO: "Informe de Conciliación de Obra",
  FAC: "Factura",
};

export const VERBO_ROL: Record<RolDoc, string> = { emite: "emite", firma: "firma", recibe: "recibe", usa: "usa" };
