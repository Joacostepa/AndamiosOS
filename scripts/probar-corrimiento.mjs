// Banco de pruebas de planearCorrimiento, contra casos armados a mano.
//
// POR QUÉ UN SCRIPT Y NO UN TEST: el repo no tiene runner. Y este cálculo es justo el que
// no se puede verificar mirando la pantalla — el resultado son treinta y pico de fechas, y
// un día de más en la cascada se ve igual que un día de menos.
//
// Carga el módulo TypeScript REAL con jiti (ya está en node_modules): no es una copia de la
// lógica, es la que corre en producción.
//
// Correr: node scripts/probar-corrimiento.mjs

import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { planearCorrimiento, invertirCorrimiento } = await jiti.import(
  "../src/lib/tablero/corrimiento.ts",
);

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const nombreDia = (f) => `${DIAS[new Date(`${f}T12:00:00`).getDay()]} ${f.slice(8)}`;

let proximoId = 1;

/** Una asignación mínima. `f` es la fracción y el resto son las banderas que importan. */
function asig(otId, fecha, cuadrillaId, extra = {}) {
  return {
    id: proximoId++,
    otId,
    fecha,
    cuadrillaId,
    fraccion: 1,
    estado: "tentativa",
    ordenDia: 0,
    notas: null,
    parteId: null,
    motivoFija: null,
    ...extra,
  };
}

function ot(id, titulo, extra = {}) {
  return { id, titulo, fechaDesde: null, fechaAntesDe: null, ...extra };
}

const CUADRILLAS = [
  { id: 2, nombre: "Cuadrilla 2", tercerizada: false },
  { id: 3, nombre: "Cuadrilla 3", tercerizada: false },
];

let fallaron = 0;

function correr(nombre, entrada, esperado) {
  const r = planearCorrimiento({ cuadrillas: CUADRILLAS, hastaCargado: "2026-12-31", ...entrada });
  const movidos = r.movimientos
    .map((m) => {
      const a = entrada.asignaciones.find((x) => x.id === m.id);
      return `${a.otId}: ${nombreDia(a.fecha)} → ${nombreDia(m.fecha)}`;
    })
    .sort();

  const ok =
    JSON.stringify(movidos) === JSON.stringify([...esperado.movidos].sort()) &&
    (esperado.fijas === undefined || r.fijas.length === esperado.fijas) &&
    (esperado.confirmadas === undefined || r.confirmadas.length === esperado.confirmadas) &&
    (esperado.rompenTecho === undefined || r.rompenTecho.length === esperado.rompenTecho) &&
    (esperado.sobrecargas === undefined || r.sobrecargas.length === esperado.sobrecargas) &&
    (esperado.solas === undefined || r.solas.length === esperado.solas);

  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallaron++;
    console.log("   esperaba:", esperado.movidos.sort());
    console.log("   obtuvo:  ", movidos);
    console.log(
      "   fijas:", r.fijas.length,
      "· confirmadas:", r.confirmadas.length,
      "· techo:", r.rompenTecho.length,
      "· sobrecargas:", r.sobrecargas.length,
      "· solas:", r.solas.length,
    );
  }
  return r;
}

// Semana de referencia. 2026-09-17 es jueves; el 20 es domingo.
const JUE = "2026-09-17";
const VIE = "2026-09-18";
const SAB = "2026-09-19";
const LUN = "2026-09-21";
const MAR = "2026-09-22";
const MIE = "2026-09-23";

console.log(`Semana: ${[JUE, VIE, SAB, LUN, MAR, MIE].map(nombreDia).join(" · ")}\n`);

// ── 1. El caso del diálogo ───────────────────────────────────────────────────
// C2 ocupada jue/vie/sáb, el lunes libre, mar/mié ocupados. La cascada tiene que
// absorberse en el lunes y NO tocar el martes ni el miércoles.
{
  const asignaciones = [
    asig(101, JUE, 2), // Callao, día 1
    asig(101, VIE, 2), // Callao, día 2
    asig(102, SAB, 2), // Beiró
    asig(103, MAR, 2), // Lima, día 1
    asig(103, MIE, 2), // Lima, día 2
  ];
  correr(
    "cascada: se frena en el primer día libre y no toca lo de después",
    {
      asignaciones,
      ots: new Map([[101, ot(101, "Callao")], [102, ot(102, "Beiró")], [103, ot(103, "Lima")]]),
      dia: JUE,
      cuadrillaIds: [2],
      modo: "cascada",
    },
    {
      movidos: [
        `101: ${nombreDia(JUE)} → ${nombreDia(VIE)}`,
        `101: ${nombreDia(VIE)} → ${nombreDia(SAB)}`,
        `102: ${nombreDia(SAB)} → ${nombreDia(LUN)}`,
      ],
      sobrecargas: 0,
    },
  );

  // ── 2. Modo "sólo ese día" sobre el mismo tablero ──────────────────────────
  // El viernes queda con las dos jornadas de Callao encimadas: 2,00.
  correr(
    "sólo ese día: mueve el jueves y deja el viernes sobreasignado",
    {
      asignaciones,
      ots: new Map([[101, ot(101, "Callao")], [102, ot(102, "Beiró")], [103, ot(103, "Lima")]]),
      dia: JUE,
      cuadrillaIds: [2],
      modo: "dia",
    },
    { movidos: [`101: ${nombreDia(JUE)} → ${nombreDia(VIE)}`], sobrecargas: 1 },
  );
}

// ── 3. Una obra fija frena la cadena y se queda ──────────────────────────────
{
  const asignaciones = [
    asig(101, JUE, 2),
    asig(102, VIE, 2, { motivoFija: "Grúa alquilada" }),
    asig(103, SAB, 2),
  ];
  correr(
    "la fija se queda, frena la cascada y el sábado no se entera",
    {
      asignaciones,
      ots: new Map([[101, ot(101, "Callao")], [102, ot(102, "Beiró")], [103, ot(103, "Lima")]]),
      dia: JUE,
      cuadrillaIds: [2],
      modo: "cascada",
    },
    {
      movidos: [`101: ${nombreDia(JUE)} → ${nombreDia(VIE)}`],
      // La fija del viernes ya no está en la cadena (la cadena terminó en el jueves),
      // así que no aparece listada: lo que queda en su día es lo del día suspendido.
      fijas: 0,
      sobrecargas: 1,
    },
  );
}

// ── 4. Fija EN el día suspendido: se reporta, y la cuadrilla queda sola ──────
{
  const asignaciones = [
    asig(101, JUE, 2, { motivoFija: "Grúa alquilada, viene 8 hs", fraccion: 0.25 }),
    asig(102, JUE, 2),
  ];
  correr(
    "fija en el día suspendido: se lista y avisa que la cuadrilla queda con ¼",
    {
      asignaciones,
      ots: new Map([[101, ot(101, "Callao")], [102, ot(102, "Beiró")]]),
      dia: JUE,
      cuadrillaIds: [2],
      modo: "cascada",
    },
    { movidos: [`102: ${nombreDia(JUE)} → ${nombreDia(VIE)}`], fijas: 1, solas: 1 },
  );
}

// ── 5. El domingo se saltea ──────────────────────────────────────────────────
{
  const asignaciones = [asig(101, SAB, 2)];
  correr(
    "correr un sábado manda al lunes, no al domingo",
    {
      asignaciones,
      ots: new Map([[101, ot(101, "Callao")]]),
      dia: SAB,
      cuadrillaIds: [2],
      modo: "cascada",
    },
    { movidos: [`101: ${nombreDia(SAB)} → ${nombreDia(LUN)}`] },
  );
}

// ── 6. Jornada con parte cargado: no se mueve ────────────────────────────────
{
  const asignaciones = [asig(101, JUE, 2, { parteId: 900 }), asig(102, JUE, 2)];
  correr(
    "la jornada con parte cargado se queda donde está",
    {
      asignaciones,
      ots: new Map([[101, ot(101, "Callao")], [102, ot(102, "Beiró")]]),
      dia: JUE,
      cuadrillaIds: [2],
      modo: "cascada",
    },
    { movidos: [`102: ${nombreDia(JUE)} → ${nombreDia(VIE)}`], fijas: 0 },
  );
}

// ── 7. Una tarea de operaciones no se corre y frena la cascada ───────────────
{
  const asignaciones = [
    asig(101, JUE, 2),
    asig(0, VIE, 2, {
      origen: "tarea",
      tarea: { grupoId: 7, titulo: "Depósito", tipo: "deposito", hecha: false },
    }),
    asig(103, SAB, 2),
  ];
  correr(
    "la tarea de depósito se queda y corta la cadena en el viernes",
    {
      asignaciones,
      ots: new Map([[101, ot(101, "Callao")], [103, ot(103, "Lima")]]),
      dia: JUE,
      cuadrillaIds: [2],
      modo: "cascada",
    },
    { movidos: [`101: ${nombreDia(JUE)} → ${nombreDia(VIE)}`], sobrecargas: 1 },
  );
}

// ── 8. Sólo se corren las cuadrillas tildadas ────────────────────────────────
{
  const asignaciones = [asig(101, JUE, 2), asig(102, JUE, 3)];
  correr(
    "la cuadrilla destildada no se toca",
    {
      asignaciones,
      ots: new Map([[101, ot(101, "Callao")], [102, ot(102, "Beiró")]]),
      dia: JUE,
      cuadrillaIds: [2],
      modo: "cascada",
    },
    { movidos: [`101: ${nombreDia(JUE)} → ${nombreDia(VIE)}`] },
  );
}

// ── 9. Confirmada y techo del cliente ────────────────────────────────────────
{
  const asignaciones = [
    asig(101, JUE, 2, { estado: "confirmada" }),
    // Ya se pasaba del techo antes del corrimiento: no se reporta, porque no es
    // consecuencia de este gesto.
    asig(102, JUE, 3, { estado: "confirmada" }),
  ];
  correr(
    "confirmada se mueve y se lista; el techo sólo si lo rompe este corrimiento",
    {
      asignaciones,
      ots: new Map([
        [101, ot(101, "Callao", { fechaAntesDe: JUE })], // rompe al moverse
        [102, ot(102, "Beiró", { fechaAntesDe: "2026-09-01" })], // ya estaba roto
      ]),
      dia: JUE,
      cuadrillaIds: [2, 3],
      modo: "cascada",
    },
    {
      movidos: [
        `101: ${nombreDia(JUE)} → ${nombreDia(VIE)}`,
        `102: ${nombreDia(JUE)} → ${nombreDia(VIE)}`,
      ],
      confirmadas: 2,
      rompenTecho: 1,
    },
  );
}

// ── 10. El borde de lo cargado no es un día libre ────────────────────────────
// Si el tablero llega hasta el viernes, el hueco del sábado no existe: no se sabe.
{
  const asignaciones = [asig(101, JUE, 2), asig(102, VIE, 2)];
  const r = planearCorrimiento({
    asignaciones,
    ots: new Map([[101, ot(101, "Callao")], [102, ot(102, "Beiró")]]),
    cuadrillas: CUADRILLAS,
    dia: JUE,
    cuadrillaIds: [2],
    modo: "cascada",
    hastaCargado: VIE,
  });
  const ok = r.alBorde === true && r.movimientos.length === 2;
  console.log(`${ok ? "✓" : "✗"} avisa cuando la cascada llega al borde de lo cargado`);
  if (!ok) {
    fallaron++;
    console.log("   alBorde:", r.alBorde, "· movimientos:", r.movimientos.length);
  }
}

// ── 11. Deshacer devuelve cada jornada a su día ──────────────────────────────
{
  const asignaciones = [asig(101, JUE, 2), asig(101, VIE, 2), asig(102, SAB, 2)];
  const r = planearCorrimiento({
    asignaciones,
    ots: new Map([[101, ot(101, "Callao")], [102, ot(102, "Beiró")]]),
    cuadrillas: CUADRILLAS,
    dia: JUE,
    cuadrillaIds: [2],
    modo: "cascada",
    hastaCargado: "2026-12-31",
  });
  const vuelta = invertirCorrimiento(r.registros);
  const ida = new Map(r.movimientos.map((m) => [m.id, m.fecha]));
  const origen = new Map(asignaciones.map((a) => [a.id, a.fecha]));
  const ok =
    vuelta.movimientos.length === r.movimientos.length &&
    vuelta.movimientos.every((m) => origen.get(m.id) === m.fecha && ida.get(m.id) !== m.fecha);
  console.log(`${ok ? "✓" : "✗"} deshacer devuelve cada jornada al día del que salió`);
  if (!ok) {
    fallaron++;
    console.log("   ida:  ", [...ida]);
    console.log("   vuelta:", vuelta.movimientos);
  }
}

console.log(fallaron === 0 ? "\n✅ Todo bien." : `\n❌ ${fallaron} caso(s) mal.`);
process.exit(fallaron === 0 ? 0 : 1);
