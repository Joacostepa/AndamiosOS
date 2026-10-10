// El martes 13/10 de la maqueta visto desde los celulares (vista.test.ts y las pruebas de
// la pantalla /h/[token]): Ortega con el cambio de las 6:43 (no va Ávila, va Ramírez), Conte
// con tres obras y su pedido de las 10:21 entregado a las 10:52, Kiska con siete viajes (uno
// nuevo a las 11:06) y Borda todo el día con la Cuadrilla 1.
//
// No es un test: lo importan vista.test.ts y los scripts de prueba de la pantalla.

import type { DiaHoja, Envio, ObraDia } from "./tipos.ts";
import { diferencias, fotoDe } from "./estado.ts";
import type { ArchivoPublico, LinkVista } from "./vista.ts";
import { OT, enviarATodos, martesArmado, pedido, viaje } from "./escenario.test-fixture.ts";

/** Lunes 18:42 (se mandó todo) y lunes 20:16 (Ortega tocó Recibido). */
export const LUN_1842 = -318;
export const LUN_2016 = -224;
export const MAR_0643 = 403;
export const MAR_1106 = 666;
export const MAR_1110 = 670;

const DESTINATARIOS = ["sack", "conte", "ortega", "hepper", "mino", "kiska", "gomez", "borda", "nunez"];

const RIVADAVIA: Partial<ObraDia> = {
  detalleTecnico: "DESARMAR ANDAMIO FRENTE 6 PISOS + PANTALLA PB",
  observaciones: "El portero abre a las 8. No usar el ascensor: subir el material por la escalera de servicio. La vereda se ocupa sólo hasta las 12; después hay que dejar paso libre para la feria del barrio. Avisar al encargado antes de bajar los tablones del 6.º piso.",
  contactoObra: "Carlos Ferrari (encargado)",
  telObra: "11 4632-1180",
  cantArchivos: 9,
};

function conEnvio(dia: DiaHoja, pid: string, f: (e: Envio) => Partial<Envio>): DiaHoja {
  return { ...dia, envios: dia.envios.map((e) => (e.personaId === pid ? { ...e, ...f(e) } : e)) };
}

/** El martes a las 11:10, con todo lo que pasó desde el lunes a la noche. */
export function martesEnCelular(): DiaHoja {
  let d = martesArmado();
  // Lo que tienen las obras (Odoo) y las instrucciones del coordinador.
  d = {
    ...d,
    obras: d.obras.map((o) => (o.otId === OT.riv ? { ...o, ...RIVADAVIA } : o.otId === OT.cab ? { ...o, detalleTecnico: "ARMAR ANDAMIO FRENTE 4 PISOS", contactoObra: "Sra. Paula Ríos (administradora)", telObra: "11 4788-2201", cantArchivos: 3 } : o)),
    instrucciones: [
      { otId: OT.riv, cuadrillaOdooId: 3, horaInicio: "8:30", hoy: "Bajar hasta el 2.º piso; la pantalla de PB queda armada.", chips: ["Llevar arnés y cabo de vida", "Llamar al encargado al llegar"] },
      { otId: OT.jur, cuadrillaOdooId: 2, horaInicio: null, hoy: "Terminar de bajar y dejar la vereda limpia.", chips: [] },
    ],
    hojas: d.hojas.map((h) => (h.cuadrillaOdooId === 2 ? { ...h, nota: "Los tablones para Cabildo van en el camión de las 7:00." } : h)),
  };
  // Kiska lleva y busca también a la 2 (como en la maqueta) y hace la compra en Sanz.
  d = { ...d, viajes: d.viajes.map((v) => (v.id === "c2-lleva" || v.id === "c2-busca" ? { ...v, vehiculoId: "af669", choferId: "kiska", hora: v.id === "c2-lleva" ? "7:00" : "17:00" } : v)) };
  d = { ...d, viajes: [...d.viajes, viaje("v-sj-borda", { tipo: "trae_material", vehiculoId: "ab831", choferId: "borda", hacia: { otId: OT.sj, lugarId: null, texto: null }, carga: "Lo desarmado", hora: "16:00", vuelta: true, orden: 960 })] };

  // Lunes 18:42: se manda a todos. Ortega toca Recibido a las 20:16, Conte a las 20:30, Kiska a las 21:05.
  d = enviarATodos(d, LUN_1842, DESTINATARIOS);
  for (const [pid, min] of [["ortega", LUN_2016], ["conte", -210], ["kiska", -175], ["borda", -150]] as const) {
    d = conEnvio(d, pid, (e) => ({ abiertaMin: min - 2, recibidaMin: min, snapRecibido: e.snap, versionRecibida: 1 }));
  }

  // Martes 6:43: no va Ávila (enfermedad), va Ramírez. Se le avisa a Ortega.
  d = { ...d, hojas: d.hojas.map((h) => (h.cuadrillaOdooId === 3 ? { ...h, integrantes: [...h.integrantes.filter((i) => i.personaId !== "avila"), { id: "i-ramirez", personaId: "ramirez", aCargo: false, nota: null, orden: 9 }] } : h)) };
  d = conEnvio(d, "ortega", (e) => ({ cambioMin: MAR_0643, cambioDiffs: diferencias(d, e.snap, fotoDe(d, "ortega")), snap: fotoDe(d, "ortega"), version: 2 }));

  // La mañana de Kiska: llevó a la 2 (7:35) y a la 3 (8:25); en Sanz no estaba listo (10:12).
  d = { ...d, viajes: d.viajes.map((v) =>
    v.id === "c2-lleva" ? { ...v, estado: "hecho" as const, hechoMin: 455, hechoPor: "chofer" as const }
    : v.id === "c3-lleva" ? { ...v, estado: "hecho" as const, hechoMin: 505, hechoPor: "chofer" as const }
    : v.id === "v-sanz" ? { ...v, estado: "no_pudo" as const, hechoMin: 612, noPudoMotivo: "No estaba listo" }
    : v.id === "v-gur" ? { ...v, estado: "hecho" as const, hechoMin: 520, hechoPor: "chofer" as const }
    : v.id === "v-jur" ? { ...v, estado: "hecho" as const, hechoMin: 640, hechoPor: "chofer" as const }
    : v) };
  // Conte pidió a las 10:21 tablones para Cabildo: los llevó Gómez, entregado 10:52.
  d = {
    ...d,
    viajes: [...d.viajes, viaje("v-cab", { tipo: "lleva_material", vehiculoId: "ab497", choferId: "gomez", hacia: { otId: OT.cab, lugarId: null, texto: null }, carga: "6 tablones y 2 bases", orden: 630, estado: "hecho", hechoMin: 652, hechoPor: "chofer", creadoMin: 622 })],
    pedidos: [...d.pedidos, pedido("p-cab", { que: "6 tablones y 2 bases", hacia: { otId: OT.cab, lugarId: null, texto: null }, viajeId: "v-cab", estado: "hecho", pidioId: "conte", canal: "telefono", creadoMin: 621 })],
  };
  // 11:06: viaje nuevo para Kiska, lo pidió Hepper para antes de las 13.
  const antes = fotoDe(d, "kiska");
  d = {
    ...d,
    viajes: [...d.viajes, viaje("v-gur2", { tipo: "lleva_material", vehiculoId: "af669", choferId: "kiska", hacia: { otId: OT.gur, lugarId: null, texto: null }, carga: "1 escalera y 10 caños de 3 m", orden: 650, creadoMin: MAR_1106 })],
    pedidos: [...d.pedidos, pedido("p-gur2", { que: "1 escalera y 10 caños de 3 m", hacia: { otId: OT.gur, lugarId: null, texto: null }, viajeId: "v-gur2", estado: "en_camion", pidioId: "hepper", horaLimite: "13:00", creadoMin: 660 })],
  };
  d = conEnvio(d, "kiska", () => ({ cambioMin: MAR_1106, cambioDiffs: diferencias(d, antes, fotoDe(d, "kiska")), snap: fotoDe(d, "kiska"), version: 2 }));
  return { ...d, generadoAt: "2026-10-13T14:10:00.000Z" };
}

export const LINKS: Record<string, LinkVista> = {
  ortega: { rol: "a_cargo", personaId: "ortega", cuadrillaOdooId: 3, anulado: false, anuladoPorRol: false, version: 2 },
  conte: { rol: "a_cargo", personaId: "conte", cuadrillaOdooId: 2, anulado: false, anuladoPorRol: false, version: 1 },
  kiska: { rol: "chofer", personaId: "kiska", cuadrillaOdooId: null, anulado: false, anuladoPorRol: false, version: 2 },
  borda: { rol: "chofer", personaId: "borda", cuadrillaOdooId: null, anulado: false, anuladoPorRol: false, version: 1 },
  gomez: { rol: "chofer", personaId: "gomez", cuadrillaOdooId: null, anulado: false, anuladoPorRol: false, version: 1 },
};

/** Planos y fotos de mentira: 8 imágenes y un PDF por obra. */
export function archivosDe(token: string) {
  return (otId: number): ArchivoPublico[] => {
    const n = otId === OT.riv ? 9 : 3;
    return Array.from({ length: n }, (_, i) => {
      const id = otId * 100 + i + 1;
      const pdf = i === n - 1;
      return { id, nombre: pdf ? "Memoria de cálculo.pdf" : i % 2 ? `Foto ${i + 1}.jpg` : `Plano ${i + 1}.png`, mimetype: pdf ? "application/pdf" : "image/svg+xml", url: `/api/public/hoja/${token}/archivo/${id}` };
    });
  };
}
