// Datos de PRUEBA del organigrama: solo los usan los tests (arbol, lienzo y layout).
//
// La estructura es la real (estructura-base.ts); las personas, los teléfonos, las ocupaciones,
// las cuadrillas y las versiones son INVENTADOS (prefijo ficticio 11 5555-01xx) para ejercitar
// vacantes, bajas, interinos, sobrecarga y el diff del borrador. La app NO los usa: las
// personas salen de Legajos y de los usuarios (docs/organigrama/modulo.md).

import { DOCUMENTOS, ESTRUCTURA_BASE } from "./estructura-base.ts";
import type { Cuadrilla, Nodo, Ocupante, Persona, Version } from "./tipos.ts";

export { DOCUMENTOS };

/** "Hoy" de las pruebas: fijo, para que los días de interino y las fechas no dependan del reloj. */
export const HOY = "2026-10-12";

type Base = Omit<Nodo, "tareas" | "noHace" | "kpis"> & Partial<Pick<Nodo, "tareas" | "noHace" | "kpis">>;
const n = (b: Base): Nodo => ({ tareas: [], noHace: [], kpis: [], ...b });

/** La estructura base con una nota interna de ejemplo en Cobranzas. */
export const NODOS_VIGENTES: Nodo[] = ESTRUCTURA_BASE.map((x) =>
  x.clave === "cobr" ? { ...x, notaInterna: "Buscando perfil con experiencia en cuentas corrientes; entrevistas en noviembre" } : x,
);

/**
 * Un borrador de prueba (Natalia, 10/10): un puesto nuevo debajo de Logística y una
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

/** Los cambios que se esperan del borrador inicial (los usa el test de diffVersiones). */
export const CAMBIOS_BORRADOR: Version["cambios"] = [
  { tipo: "nuevo", nodo: "coord_logistico", detalle: "Coordinador Logístico, debajo de Repartos y Logística" },
  { tipo: "modificado", nodo: "stock", detalle: "+1 tarea: Controlar vencimiento de certificaciones de materiales" },
];
