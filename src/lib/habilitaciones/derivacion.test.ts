// Lo que la bandeja y la ficha dicen con el día de hoy: qué falta y de quién es la pelota,
// la alerta y el veredicto. Los casos salen de la prueba del módulo del 09/10
// (docs/habilitaciones-errores.md): el "0 d", el "esperando a STEPANSKY" y el veredicto que
// le pedía permiso a un desarme.

import { test } from "node:test";
import assert from "node:assert/strict";
import { alertaDe, esperaDe, semaforoHoy, veredicto, type DatosEspera } from "./derivacion.ts";

const HOY = "2026-10-09";

const req = (
  nombre: string,
  estado: "pendiente" | "enviado" | "observado" | "aprobado",
  fecha_envio: string | null = null,
  fecha_resolucion: string | null = null,
) => ({ nombre, estado, fecha_envio, fecha_resolucion });

const base: DatosEspera = {
  triage: "aplica",
  habilitada: false,
  creadaEl: "2026-09-18",
  triadaEl: "2026-09-18",
  vueltaEl: null,
  fechaConsulta: null,
  requisitos: [],
};

test("sin triar: decidir si aplica, desde que entró, rojo a los 4 días", () => {
  const e = esperaDe({ ...base, triage: null, creadaEl: "2026-10-06" }, HOY);
  assert.deepEqual(e && { ...e }, {
    clave: "triar", pelota: "nuestra", texto: "decidir si aplica", desde: "2026-10-06", dias: 3, rojo: false,
  });
  assert.equal(esperaDe({ ...base, triage: null, creadaEl: "2026-10-05" }, HOY)?.rojo, true);
});

test("la nómina sin mandar es nuestra aunque Odoo diga que espera al cliente (Triunvirato)", () => {
  const e = esperaDe({ ...base, requisitos: [req("Nómina ART", "pendiente")] }, HOY);
  assert.equal(e?.pelota, "nuestra");
  assert.equal(e?.texto, "mandar Nómina ART");
  assert.equal(e?.dias, 21);
  assert.equal(e?.rojo, true);
});

test("lo nuestro arranca de nuevo cuando la obra vuelve de pospuesta", () => {
  const e = esperaDe({ ...base, vueltaEl: HOY, requisitos: [req("Nómina ART", "pendiente")] }, HOY);
  assert.equal(e?.dias, 0);
  assert.equal(e?.rojo, false);
});

test("lo nuestro se pone rojo al día siguiente (decisión de JS)", () => {
  const e = esperaDe({ ...base, triadaEl: "2026-10-08", requisitos: [req("Nómina ART", "pendiente")] }, HOY);
  assert.equal(e?.dias, 1);
  assert.equal(e?.rojo, true);
});

test("todo mandado: el cliente revisa, desde el papel más viejo sin respuesta (LAS FLORES 701)", () => {
  const e = esperaDe(
    {
      ...base,
      requisitos: [
        req("Nómina ART", "aprobado", "2026-09-24", "2026-09-25"),
        req("SVO", "enviado", "2026-09-24"),
        req("Capacitaciones", "enviado", "2026-09-30"),
        req("E.P.P", "enviado", "2026-10-02"),
      ],
    },
    HOY,
  );
  assert.equal(e?.pelota, "cliente");
  assert.equal(e?.texto, "el cliente revisa 3 de 4");
  assert.equal(e?.desde, "2026-09-24");
  assert.equal(e?.dias, 15);
  assert.equal(e?.rojo, true);
});

test("el cliente se pone rojo a la semana, no antes", () => {
  const e = (envio: string) =>
    esperaDe({ ...base, requisitos: [req("Nómina ART", "enviado", envio)] }, HOY);
  assert.equal(e("2026-10-02")?.rojo, false);
  assert.equal(e("2026-10-01")?.rojo, true);
});

test("si queda algo sin mandar, la pelota es nuestra aunque otros esperen al cliente", () => {
  const e = esperaDe(
    { ...base, requisitos: [req("Nómina ART", "enviado", "2026-10-01"), req("SVO", "pendiente"), req("E.P.P", "pendiente")] },
    HOY,
  );
  assert.equal(e?.pelota, "nuestra");
  assert.equal(e?.texto, "mandar 2 de 3");
});

test("todo aprobado sin habilitar: habilitar es nuestro (Corrientes 4285)", () => {
  const e = esperaDe({ ...base, requisitos: [req("Nómina ART", "aprobado", "2026-09-28", "2026-09-28")] }, HOY);
  assert.equal(e?.pelota, "nuestra");
  assert.equal(e?.texto, "habilitar: está todo aprobado");
  assert.equal(e?.desde, "2026-09-28");
});

test("un observado manda sobre todo lo demás", () => {
  const e = esperaDe(
    {
      ...base,
      requisitos: [req("Nómina ART", "enviado", "2026-10-01"), req("Capacitaciones", "observado", "2026-10-01", "2026-10-07")],
    },
    HOY,
  );
  assert.equal(e?.texto, "corregir Capacitaciones");
  assert.equal(e?.desde, "2026-10-07");
});

test("consultado y sin nada mandado: el cliente dice qué pide, rojo a las dos semanas", () => {
  const e = esperaDe({ ...base, fechaConsulta: "2026-09-30", requisitos: [req("Nómina ART", "pendiente")] }, HOY);
  assert.equal(e?.pelota, "cliente");
  assert.equal(e?.texto, "el cliente dice qué pide");
  assert.equal(e?.rojo, false);
});

test("habilitada o no aplica: no hay espera", () => {
  assert.equal(esperaDe({ ...base, habilitada: true }, HOY), null);
  assert.equal(esperaDe({ ...base, triage: "no_aplica" }, HOY), null);
});

test("alerta: la fórmula de Odoo, con el día de hoy", () => {
  const a = (fechaProgramada: string | null, semaforo: "rojo" | "amarillo" | "verde" = "rojo", estadoOt = "pendiente") =>
    alertaDe({ semaforo, fechaProgramada, estadoOt, hoy: HOY });
  assert.equal(a("2026-10-12"), "critica");
  assert.equal(a("2026-10-13"), "proxima");
  assert.equal(a("2026-10-08", "amarillo"), "atrasada");
  assert.equal(a("2026-10-08", "verde"), "ok");
  assert.equal(a(null), "ok");
  assert.equal(a("2026-10-10", "rojo", "completada"), "ok");
});

test("semáforo: una habilitada pasa a vencida cuando llega el día, sin esperar un write", () => {
  const s = (vencimiento: string | null, semaforo: "verde" | "vencida" | "amarillo" = "verde") =>
    semaforoHoy({ semaforo, vencimiento, estadoOt: "pendiente", hoy: HOY });
  assert.equal(s("2026-10-08"), "vencida");
  assert.equal(s("2026-10-09"), "verde");
  assert.equal(s("2026-11-01", "vencida"), "verde");
  assert.equal(s("2026-10-01", "amarillo"), "amarillo");
});

const permiso = (modalidad: "sin_permiso" | "con_expediente" | "esperar_permiso" | null, tramite: "presentado" | "emitido" | null = null) => ({
  modalidad, tramite, expedienteNro: null, modalidadDefinida: null, tecnicoNombre: null,
});

test("veredicto: a un desarme el permiso no lo frena, igual que en el tablero (Azcuénaga 1013)", () => {
  const v = veredicto(permiso("esperar_permiso"), {
    tipoOt: "desarme", habilitada: false, listaParaHabilitar: false, fechaProgramada: null,
  }, HOY);
  assert.equal(v.tono, "aviso");
  assert.match(v.titulo, /^Se puede desarmar/);
  assert.doesNotMatch(v.detalle, /modalidad|permiso/);
});

test("veredicto: un armado que espera el permiso sin emitir no se puede armar", () => {
  const v = veredicto(permiso("esperar_permiso", "presentado"), {
    tipoOt: "armado", habilitada: true, listaParaHabilitar: true, fechaProgramada: null,
  }, HOY);
  assert.equal(v.tono, "bloqueo");
  assert.match(v.titulo, /^No se puede armar/);
});

test("veredicto: con todo aprobado no dice que falta la documentación", () => {
  const v = veredicto(permiso("esperar_permiso", "emitido"), {
    tipoOt: "armado", habilitada: false, listaParaHabilitar: true, fechaProgramada: null,
  }, HOY);
  assert.equal(v.tono, "aviso");
  assert.match(v.detalle, /falta habilitarla/);
  assert.doesNotMatch(v.detalle, /documentación del cliente/);
});

test("veredicto: una venta vieja sin modalidad no pide modalidad", () => {
  const v = veredicto(permiso(null), {
    tipoOt: "armado", habilitada: true, listaParaHabilitar: false, fechaProgramada: null,
  }, HOY);
  assert.equal(v.tono, "ok");
});

// ─── Grupos de la bandeja (rediseño del 09/10) ──────────────────────────────

import { esperaElPermiso, grupoDe, vueltaPorPermiso, type DatosGrupo } from "./derivacion.ts";

const obra = (extra: Partial<DatosGrupo> = {}): DatosGrupo => ({
  triage: "aplica",
  habilitadaEl: null,
  alerta: "proxima",
  espera: esperaDe({ ...base, requisitos: [req("Nómina ART", "pendiente")] }, HOY),
  vencimiento: null,
  modalidad: "sin_permiso",
  tramite: null,
  tipo: "armado",
  primeraJornada: null,
  fechaProgramada: "2026-11-02",
  ...extra,
});

test("grupos: urgente le gana a todo, incluso a una nueva", () => {
  assert.equal(grupoDe(obra({ triage: null, alerta: "critica" }), HOY), "urgentes");
  assert.equal(grupoDe(obra({ alerta: "atrasada" }), HOY), "urgentes");
  assert.equal(grupoDe(obra({ triage: null }), HOY), "nuevas");
});

test("grupos: la pelota decide entre para hacer y esperando al cliente", () => {
  assert.equal(grupoDe(obra(), HOY), "para_hacer");
  const cliente = esperaDe({ ...base, requisitos: [req("Nómina ART", "enviado", "2026-10-05")] }, HOY);
  assert.equal(grupoDe(obra({ espera: cliente }), HOY), "cliente");
});

test("esperan el permiso: sólo esperar_permiso, sin emitir, armado, a más de 10 días", () => {
  const espera = obra({ modalidad: "esperar_permiso", tramite: "presentado" });
  assert.equal(grupoDe(espera, HOY), "permiso");
  assert.equal(esperaElPermiso({ ...espera, fechaProgramada: null }, HOY), true, "sin fecha espera");
  // Salió el permiso: vuelve a la cola.
  assert.equal(grupoDe({ ...espera, tramite: "emitido" }, HOY), "para_hacer");
  // A 10 días o menos: vuelve aunque no haya salido.
  assert.equal(grupoDe({ ...espera, fechaProgramada: "2026-10-19" }, HOY), "para_hacer");
  assert.equal(grupoDe({ ...espera, fechaProgramada: "2026-10-20" }, HOY), "permiso");
  // Con expediente o sin permiso, los papeles se mandan igual.
  assert.equal(grupoDe({ ...espera, modalidad: "con_expediente" }, HOY), "para_hacer");
  // A un desarme el permiso no lo frena.
  assert.equal(grupoDe({ ...espera, tipo: "desarme" }, HOY), "para_hacer");
  // La planificación manda sobre la fecha programada.
  assert.equal(grupoDe({ ...espera, primeraJornada: "2026-10-15" }, HOY), "para_hacer");
});

test("vuelta por permiso: 10 días antes de armar", () => {
  assert.equal(vueltaPorPermiso({ primeraJornada: null, fechaProgramada: "2026-11-02" }), "2026-10-23");
  assert.equal(vueltaPorPermiso({ primeraJornada: null, fechaProgramada: null }), null);
});

test("grupos: habilitada sale de la cola, salvo que venza en 30 días", () => {
  assert.equal(grupoDe(obra({ habilitadaEl: "2026-09-01" }), HOY), null);
  assert.equal(grupoDe(obra({ habilitadaEl: "2026-09-01", vencimiento: "2026-10-30" }), HOY), "por_vencer");
  assert.equal(grupoDe(obra({ triage: "no_aplica" }), HOY), null);
});
