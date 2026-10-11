// El escenario de la maqueta (docs/equipos-del-dia/modulo.md, "Guía para la maqueta"),
// armado como `DiaHoja` para los tests: martes 13/10/2026, con el lunes 12 como día
// anterior y la Cuadrilla 5 que trabajó por última vez el viernes 09/10.
//
// No es un test: lo importan estado.test.ts y mensajes.test.ts. Los ids son legibles
// ("kiska", "af669") a propósito: la lógica pura no sabe ni le importa que en la base sean uuid.

import type { Ausencia, DiaHoja, Envio, Hoja, ObraDia, Pedido, Persona, Viaje } from "./tipos.ts";
import { PARAMETROS_POR_DEFECTO } from "./tipos.ts";
import { planPrecarga, toMin, type PlanHoja, fotoDe } from "./estado.ts";

const pers = (id: string, nombre: string, extra: Partial<Persona> = {}): Persona => ({
  id, externa: false, nombre, nombreCompleto: nombre, puesto: "operario", celular: "11 5555-0000",
  puedeEstarACargo: false, esChofer: false, telegram: false, odooEmployeeId: null, activo: true, ...extra,
});

export const PERSONAS: Persona[] = [
  pers("sack", "Sack", { puedeEstarACargo: true }),
  pers("conte", "Conte", { puedeEstarACargo: true }),
  pers("ortega", "Ortega", { puedeEstarACargo: true, puesto: "chofer" }),
  pers("hepper", "Hepper", { puedeEstarACargo: true }),
  pers("mino", "Miño", { puedeEstarACargo: true, celular: null }),
  pers("perez", "Pérez", { puedeEstarACargo: true }),
  ...["arrieta:Arrieta", "godoy:Godoy", "sosa:Sosa", "coronel:Coronel", "benitez:Benítez", "ledesma:Ledesma", "rios:Ríos",
    "avila:Ávila", "cabrera:Cabrera", "acosta:Acosta", "villalba:Villalba", "romero:Romero", "molina:Molina",
    "valenzuela:Valenzuela", "aguirre:Aguirre", "medina:Medina", "paz:Paz", "ramirez:Ramírez"].map((x) => {
    const [id, n] = x.split(":");
    return pers(id, n);
  }),
  pers("kiska", "Kiska", { esChofer: true, puesto: "chofer", telegram: true }),
  pers("gomez", "Gómez", { esChofer: true, puesto: "chofer" }),
  pers("borda", "Borda", { esChofer: true, puesto: "chofer" }),
  pers("nunez", "Nuñez", { esChofer: true, puesto: "chofer" }),
];

/** Los contratistas (mano de obra tercerizada): Quintana con referente y Telegram, Benegas sin celular. */
export const CONTRATISTAS: DiaHoja["contratistas"] = [
  { id: "quintana", nombre: "Quintana", referente: "Tomás Quintana", celular: "11 4444-1234", telegram: true, valorJornada: 30000, nota: null, activo: true },
  { id: "benegas", nombre: "Benegas", referente: null, celular: null, telegram: false, valorJornada: null, nota: null, activo: true },
  { id: "viejo", nombre: "Ferraro", referente: null, celular: null, telegram: false, valorJornada: null, nota: null, activo: false },
];

const veh = (id: string, patente: string, marca: string, tipo: DiaHoja["vehiculos"][number]["tipo"], hab: string | null, extra: Partial<DiaHoja["vehiculos"][number]> = {}) =>
  ({ id, patente, marca, modelo: null, tipo, estado: "disponible" as const, choferHabitualId: hab, vencimientos: [], ...extra });

export const VEHICULOS: DiaHoja["vehiculos"] = [
  veh("af669", "AF 669 ZL", "Iveco", "camion", "kiska"),
  veh("ab497", "AB 497 YY", "Iveco", "camion", "gomez"),
  veh("ab831", "AB 831 LC", "Agrale", "hidrogrua", "borda"),
  veh("ab799", "AB 799 CA", "Iveco", "camion", "nunez"),
  veh("ah410", "AH 410 LD", "Iveco", "camion", null, { vencimientos: [{ tipo: "vtv", vence: "2026-10-02" }] }),
  veh("s10", "LNE 368", "Chevrolet", "camioneta", null, { modelo: "S10" }),
  veh("moto", "A091SWF", "Moto", "otro", null),
];

export const LUGARES: DiaHoja["lugares"] = [
  { id: "dep", nombre: "Depósito", corto: "Depósito", tipo: "deposito", direccion: "Pedro Lozano 4100", lat: -34.6005, lng: -58.5125, telefono: null, horario: null, cierra: null, nota: null, activo: true },
  { id: "sanz", nombre: "Galvanizados Sanz", corto: "Sanz", tipo: "proveedor", direccion: "Av. Gral. Mosconi 3150", lat: -34.5878, lng: -58.5052, telefono: "11 4572-8810", horario: "lun a vie 8 a 16", cierra: "16:00", nota: null, activo: true },
  { id: "vtv", nombre: "Planta de VTV", corto: "VTV", tipo: "vtv", direccion: null, lat: -34.6122, lng: -58.5251, telefono: null, horario: null, cierra: null, nota: null, activo: true },
];

const obra = (otId: number, c: number, orden: number, direccion: string, tipo: string, fraccion: number, lat: number, lng: number, extra: Partial<ObraDia> = {}): ObraDia => ({
  otId, asignacionId: otId * 10 + orden, cuadrillaOdooId: c, ordenDia: orden, fraccion, estadoAsignacion: "confirmada",
  direccion, corto: direccion, titulo: direccion, tipo, personalPorJornada: 5, lat, lng, detalleTecnico: null,
  observaciones: null, contactoObra: null, telObra: null, cantArchivos: 0, ventaId: null, dia: null, totalDias: null, parteId: null, ...extra,
});

export const OT = { lib: 2391, jur: 2405, cuba: 2398, cab: 2412, riv: 2377, gur: 2420, sj: 2364, mon: 2382, cdp: 2370, tha: 2386 };

export const OBRAS_MARTES: ObraDia[] = [
  obra(OT.lib, 1, 1, "Av. del Libertador 5980", "armado", 1, -34.5596, -58.4437, { dia: 3, totalDias: 5 }),
  obra(OT.jur, 2, 1, "Juramento 2145", "desarme", 0.25, -34.5626, -58.4561),
  obra(OT.cuba, 2, 2, "Cuba 1980", "mantenimiento", 0.25, -34.5604, -58.4519),
  obra(OT.cab, 2, 3, "Av. Cabildo 3260", "armado", 0.5, -34.5566, -58.4658, { dia: 2, totalDias: 2 }),
  obra(OT.riv, 3, 1, "Av. Rivadavia 6150", "desarme", 1, -34.6268, -58.4545, { dia: 2, totalDias: 3 }),
  obra(OT.gur, 4, 1, "Gurruchaga 1650", "armado", 1, -34.5891, -58.4283, { dia: 1, totalDias: 2 }),
  obra(OT.sj, 5, 1, "Av. San Juan 2840", "desarme", 1, -34.6232, -58.4058, { personalPorJornada: 4 }),
];

const OBRAS_LUNES: ObraDia[] = [
  obra(OT.mon, 1, 1, "Av. Monroe 2870", "armado", 1, -34.5627, -58.4628),
  obra(OT.cdp, 2, 1, "Ciudad de la Paz 2410", "desarme", 1, -34.5668, -58.4612),
  obra(OT.riv, 3, 1, "Av. Rivadavia 6150", "desarme", 1, -34.6268, -58.4545, { dia: 1, totalDias: 3 }),
  obra(OT.tha, 4, 1, "Thames 1820", "armado", 1, -34.5867, -58.4312),
];

let seq = 0;
export const hoja = (c: number, gente: string[], aCargo: string | null, o: Partial<Hoja> = {}, fecha = "2026-10-13"): Hoja => ({
  id: o.id ?? `h${fecha.slice(8)}-${c}`, fecha, cuadrillaOdooId: c, modo: "sin", choferId: null, vehiculoId: null, choferTocadoMin: null,
  encuentro: { lugar: "obra", texto: null, hora: "8:00" }, nota: null, recibeId: null, origen: "manual", version: 1,
  integrantes: gente.map((p, i) => ({ id: `i${++seq}`, personaId: p, aCargo: p === aCargo, nota: null, orden: i })),
  contratistas: [], aCargoContratistaId: null,
  ...o,
});

export const viaje = (id: string, o: Partial<Viaje>): Viaje => ({
  id, fecha: "2026-10-13", vehiculoId: null, choferId: null, fleteExterno: null, tipo: "otro", hojaId: null, cuadrillaOdooId: null,
  hacia: { otId: null, lugarId: null, texto: null }, desde: null, orden: 0, hora: null, noAntesDe: null, duracionMin: null,
  vuelta: false, vueltaCarga: null, carga: null, cargaDeposito: null, okTodoElDia: false, estado: "planeado", hechoMin: null,
  hechoPor: null, noPudoMotivo: null, anuladoMotivo: null, foto: false, creadoMin: -400, version: 1, ...o,
});

export const pedido = (id: string, o: Partial<Pedido>): Pedido => ({
  id, fecha: "2026-10-13", fechaOriginal: "2026-10-13", que: "", tipo: "lleva_material", hacia: { otId: null, lugarId: null, texto: null },
  desde: null, urgencia: "hoy", horaLimite: null, horaFija: null, noAntesDe: null, duracionMin: null, cargaDeposito: null,
  necesita: "cualquiera", pidioId: null, pidioTexto: null, canal: "telefono", estado: "sin_camion", esperandoMotivo: null,
  esperandoHastaMin: null, viajeId: null, ordenManual: null, cajonPendienteId: null, sugeridoRegla: null, sugeridoOtId: null,
  ultimoNoPudo: null, noPudoVisto: true, intentos: 0, nota: null, creadoMin: 0, anuladoMotivo: null, ...o,
});

const HOJAS_LUNES: Hoja[] = [
  hoja(1, ["sack", "arrieta", "godoy", "sosa"], "sack", { modo: "todo_el_dia", choferId: "borda", vehiculoId: "ab831", encuentro: { lugar: "deposito", texto: null, hora: "7:00" } }, "2026-10-12"),
  hoja(2, ["conte", "coronel", "benitez", "ledesma", "rios"], "conte", { modo: "lleva_trae", choferId: "nunez", vehiculoId: "ab799", encuentro: { lugar: "deposito", texto: null, hora: "7:00" } }, "2026-10-12"),
  hoja(3, ["ortega", "avila", "cabrera", "acosta", "villalba"], "ortega", { modo: "lleva_trae", choferId: "kiska", vehiculoId: "af669", encuentro: { lugar: "deposito", texto: null, hora: "7:00" } }, "2026-10-12"),
  hoja(4, ["hepper", "perez", "romero", "molina", "medina"], "hepper", {}, "2026-10-12"),
];
const VIAJES_LUNES: Viaje[] = [
  viaje("l2-lleva", { fecha: "2026-10-12", tipo: "lleva", hojaId: "h12-2", cuadrillaOdooId: 2, vehiculoId: "ab799", choferId: "nunez", hora: "7:00", orden: 420 }),
  viaje("l2-busca", { fecha: "2026-10-12", tipo: "busca", hojaId: "h12-2", cuadrillaOdooId: 2, vehiculoId: "ab799", choferId: "nunez", hora: "17:00", orden: 1020 }),
  viaje("l3-lleva", { fecha: "2026-10-12", tipo: "lleva", hojaId: "h12-3", cuadrillaOdooId: 3, vehiculoId: "af669", choferId: "kiska", hora: "7:00", orden: 420 }),
  viaje("l3-busca", { fecha: "2026-10-12", tipo: "busca", hojaId: "h12-3", cuadrillaOdooId: 3, vehiculoId: "af669", choferId: "kiska", hora: "16:30", orden: 990 }),
];

export const MEDINA_ART: Ausencia = { id: null, personaId: "medina", desde: "2026-10-13", hasta: null, tipo: "art", horaDesde: null, horaHasta: null, nota: null, origen: "asistencia" };

/** El martes vacío, el lunes 12 a las 17:30 (−390 minutos del martes). */
export function martesVacio(): DiaHoja {
  return {
    fecha: "2026-10-13",
    generadoAt: "2026-10-12T20:30:00.000Z",
    cuadrillas: [1, 2, 3, 4, 5].map((n) => ({
      odooId: n, nombre: `Cuadrilla ${n}`, numero: n, tercerizada: false,
      plantel: n <= 4 ? { responsableId: ["sack", "conte", "ortega", "hepper"][n - 1], personaIds: HOJAS_LUNES[n - 1].integrantes.map((i) => i.personaId) } : null,
    })),
    obras: OBRAS_MARTES.map((o) => ({ ...o })),
    suspendidas: {},
    hojas: [],
    personas: PERSONAS,
    contratistas: CONTRATISTAS,
    vehiculos: VEHICULOS,
    camiones: VEHICULOS.map((v) => ({ vehiculoId: v.id, choferId: v.choferHabitualId, nota: null })),
    lugares: LUGARES,
    viajes: [],
    pedidos: [],
    instrucciones: [],
    ausencias: [MEDINA_ART],
    envios: [],
    operariosAvisados: [],
    parametros: PARAMETROS_POR_DEFECTO,
    anterior: { fecha: "2026-10-12", obras: OBRAS_LUNES, hojas: HOJAS_LUNES, viajes: VIAJES_LUNES, camiones: [] },
    ultimasHojas: [{ fecha: "2026-10-09", hoja: hoja(5, ["mino", "valenzuela", "aguirre"], "mino", { modo: "todo_el_dia", choferId: "nunez", vehiculoId: "ab799", encuentro: { lugar: "deposito", texto: null, hora: "7:00" } }, "2026-10-09") }],
    cajon: [],
    telegram: { configurado: true, bot: "aba_hoja_bot" },
  };
}

/** Escribe un plan de precarga sobre el día, como lo haría servicio.ts. */
export function aplicarPlan(dia: DiaHoja, hojas: PlanHoja[]): DiaHoja {
  const nuevas: Hoja[] = hojas.map((p) => hoja(p.cuadrillaOdooId, p.gente, p.aCargoId, { modo: p.modo, choferId: p.choferId, vehiculoId: p.vehiculoId, encuentro: p.encuentro, origen: p.origen }));
  const viajes: Viaje[] = [];
  for (const p of hojas) {
    if (p.modo !== "lleva_trae") continue;
    const hid = `h13-${p.cuadrillaOdooId}`;
    viajes.push(viaje(`c${p.cuadrillaOdooId}-lleva`, { tipo: "lleva", hojaId: hid, cuadrillaOdooId: p.cuadrillaOdooId, vehiculoId: p.vehiculoId, choferId: p.choferId, hora: p.lleva, orden: toMin(p.lleva) ?? 420 }));
    if (p.busca) viajes.push(viaje(`c${p.cuadrillaOdooId}-busca`, { tipo: "busca", hojaId: hid, cuadrillaOdooId: p.cuadrillaOdooId, vehiculoId: p.vehiculoId, choferId: p.choferId, hora: p.busca, orden: toMin(p.busca) ?? 1020 }));
  }
  return { ...dia, hojas: [...dia.hojas, ...nuevas], viajes: [...dia.viajes, ...viajes] };
}

/** El martes recién precargado "como hoy" (lunes 18:30). */
export function martesPrecargado(): DiaHoja {
  const d = martesVacio();
  return aplicarPlan(d, planPrecarga(d, "hoy").hojas);
}

/**
 * El martes armado y listo, como queda el lunes a las 18:41 en la maqueta: Paz en la 4, Miño
 * a cargo de la 5, el lleva de la 3 a las 7:45, los viajes de Kiska y de Gómez.
 */
export function martesArmado(): DiaHoja {
  const d = martesPrecargado();
  const hojas = d.hojas.map((h) => {
    if (h.cuadrillaOdooId === 4) return { ...h, integrantes: [...h.integrantes, { id: "i-paz", personaId: "paz", aCargo: false, nota: null, orden: 9 }] };
    if (h.cuadrillaOdooId === 5) return { ...h, integrantes: h.integrantes.map((i) => ({ ...i, aCargo: i.personaId === "mino" })) };
    // Cambiar el "lleva" de una cuadrilla que se encuentra en el depósito mueve el encuentro.
    if (h.cuadrillaOdooId === 3) return { ...h, encuentro: { ...h.encuentro, hora: "7:45" } };
    return h;
  });
  const viajes = d.viajes.map((v) => (v.id === "c3-lleva" ? { ...v, hora: "7:45", orden: 465 } : v.id === "c2-lleva" ? { ...v, carga: "20 tablones y 2 escaleras para Cabildo" } : v));
  viajes.push(
    viaje("v-sanz", { tipo: "compra", vehiculoId: "af669", choferId: "kiska", hacia: { otId: null, lugarId: "sanz", texto: null }, carga: "100 tablones", noAntesDe: "10:00", duracionMin: 80, orden: 600 }),
    viaje("v-vtv", { tipo: "taller", vehiculoId: "af669", choferId: "kiska", hacia: { otId: null, lugarId: "vtv", texto: null }, carga: "VTV", hora: "14:00", orden: 840 }),
    viaje("v-gur", { tipo: "lleva_material", vehiculoId: "ab497", choferId: "gomez", hacia: { otId: OT.gur, lugarId: null, texto: null }, carga: "Material del armado de Gurruchaga 1650 (según cómputo)", hora: "8:00", cargaDeposito: "7:30", orden: 480 }),
    viaje("v-jur", { tipo: "trae_material", vehiculoId: "ab497", choferId: "gomez", hacia: { otId: OT.jur, lugarId: null, texto: null }, carga: "Lo desarmado", noAntesDe: "10:15", vuelta: true, orden: 615 }),
    viaje("v-riv", { tipo: "trae_material", vehiculoId: "ab497", choferId: "gomez", hacia: { otId: OT.riv, lugarId: null, texto: null }, carga: "Lo bajado de los pisos 6 a 3", hora: "15:00", vuelta: true, orden: 900 }),
    viaje("v-sj", { tipo: "trae_material", vehiculoId: "ab799", choferId: "nunez", hacia: { otId: OT.sj, lugarId: null, texto: null }, carga: "Lo desarmado", noAntesDe: "16:00", vuelta: true, orden: 960 }),
  );
  const pedidos = [
    pedido("p-gur", { que: "Material del armado", hacia: { otId: OT.gur, lugarId: null, texto: null }, viajeId: "v-gur", estado: "en_camion", sugeridoRegla: "arranca", sugeridoOtId: OT.gur, canal: "sugerido", creadoMin: -385 }),
    pedido("p-jur", { que: "Lo desarmado", tipo: "trae_material", hacia: { otId: OT.jur, lugarId: null, texto: null }, viajeId: "v-jur", estado: "en_camion", sugeridoRegla: "termina", sugeridoOtId: OT.jur, canal: "sugerido", creadoMin: -385 }),
    pedido("p-sj", { que: "Lo desarmado", tipo: "trae_material", hacia: { otId: OT.sj, lugarId: null, texto: null }, viajeId: "v-sj", estado: "en_camion", sugeridoRegla: "termina", sugeridoOtId: OT.sj, canal: "sugerido", creadoMin: -385 }),
    pedido("p-sanz", { que: "100 tablones", tipo: "compra", hacia: { otId: null, lugarId: "sanz", texto: null }, viajeId: "v-sanz", estado: "en_camion", canal: "cajon", creadoMin: -390 }),
  ];
  return { ...d, hojas, viajes, pedidos };
}

/** Marca enviado a todos los destinatarios (con la foto de ese momento). */
export function enviarATodos(d: DiaHoja, min: number, pids: string[]): DiaHoja {
  const envios: Envio[] = pids.map((pid, i) => {
    const snap = fotoDe(d, pid);
    return {
      id: `e-${pid}`, token: "X".repeat(32), fecha: d.fecha, personaId: pid, rol: snap?.tipo === "chofer" ? "chofer" : "a_cargo",
      cuadrillaOdooId: snap?.tipo === "hoja" ? snap.c : null, anulado: false, enviadaMin: min + i, enviadaCanal: "telegram",
      reenviadaMin: null, abiertaMin: null, ultimaVistaMin: null, recibidaMin: null, cambioMin: null, cambioDiffs: null,
      snap, snapPrimero: snap, snapRecibido: null, snapOk: null, okMin: null, version: 1, versionVista: 0, versionRecibida: 0,
    };
  });
  return { ...d, envios };
}
