// La cuenta de en qué está un permiso (estado.ts), con los casos reales de la revisión del 09/10.

import { test } from "node:test";
import assert from "node:assert/strict";
import { etapasDeExpediente, etapasDeTramite, resumir, type Contexto, type DocParaEstado, type ExpParaEstado, type TareaParaEstado, type TramiteParaEstado } from "./estado.ts";
import { nombreSospechoso, tienePermiso } from "./tipos.ts";

const AHORA = Date.parse("2026-10-09T23:00:00Z");
const CTX: Contexto = {
  ahora: AHORA,
  supervision: { linkAlCliente: false, endosoAutomatico: false, encomiendaAutomatica: false, presentacionAutomatica: true },
  tipico: { aPresentar: 3.8, gcba: 13 },
  nombres: { vendedora: "Agustina", gestor: "Tamara" },
};

function tramite(extra: Partial<TramiteParaEstado> = {}): TramiteParaEstado {
  return {
    id: "t", created_at: "2026-09-24T14:46:00Z", estado: "abierto", es_prueba: false, titular_nombre: "CONSORCIO DE PROPIETARIOS SALGUERO 359",
    titular_cargado_at: "2026-09-26T10:20:00Z", link_enviado_at: "2026-09-24T14:46:00Z", link_enviado_a: "tam@andamiosbuenosaires.com.ar",
    link_error: null, vendedor_email: "tam@andamiosbuenosaires.com.ar", ...extra,
  };
}
const doc = (clave: string, estado: string, extra: Partial<DocParaEstado> = {}): DocParaEstado => ({
  clave, origen: "cliente", estado, observacion: null, updated_at: "2026-09-26T10:30:00Z", revisado_at: "2026-09-26T10:31:00Z", pedido_at: null, ...extra,
});
const legajoOk = () => ["aviso_obra", "acta_asamblea", "reglamento", "dni_administrador", "constancia_cuit", "nota_solicitud", "acta_compromiso"].map((c) => doc(c, "ok"));
const exp = (extra: Partial<ExpParaEstado> = {}): ExpParaEstado => ({
  id: "e", numero: "2026-44628989", estado_tad: "INICIACION", solapa: "en_curso", tarea_pendiente: false, creado_tad: "2026-10-05",
  estado_desde: "2026-10-05T20:00:00Z", motivo_subsanacion: null, permiso_emitido_el: null, permiso_vence: null, permiso_notificacion: null,
  odoo_venta_id: 2711, odoo_vinculo_por: "numero", odoo_vinculo_confirmado_at: null, ...extra,
});

test("nombreSospechoso: el nombre de Echeverría 2931 no sale así a Segucom", () => {
  assert.equal(nombreSospechoso('"CONSORCIO DE COPROPIETARIOS EDIFICIO CALLE ECHEVERRIA nú3 meros 2931/33/35, CAPITAL FEDERAL"'), "tiene comillas");
  assert.equal(nombreSospechoso("CONSORCIO ECHEVERRIA nú3 meros 2931/33/35"), "tiene un número pegado a una letra");
  assert.equal(nombreSospechoso("CONSORCIO DE PROPIETARIOS PJE LA FRONDA 1681"), null);
  assert.equal(nombreSospechoso("CONSORCIO CALLE ECHEVERRIA 2931/33/35"), null);
  assert.equal(nombreSospechoso("EDIFICIO NÃºMERO 5"), "tiene caracteres mal codificados");
  assert.equal(nombreSospechoso(null), null);
});

test("tienePermiso: Guarda temporal sin resolución no es permiso", () => {
  assert.equal(tienePermiso({ estado_tad: "GUARDA TEMPORAL", permiso_notificacion: null }), false);
  assert.equal(tienePermiso({ estado_tad: "GUARDA TEMPORAL", permiso_notificacion: "IF-2026-42727758-GCABA-SSGOU" }), false);
  assert.equal(tienePermiso({ estado_tad: "GUARDA TEMPORAL", permiso_notificacion: "RS-2026-12345-GCABA-SSGOU" }), true);
  assert.equal(tienePermiso({ estado_tad: "TRAMITACION", permiso_notificacion: null }), true);
});

test("Echeverría 2931: papeles frenados del cliente, endoso frenado por el nombre y perseguir al cliente", () => {
  const t = tramite({ titular_nombre: '"CONSORCIO ... ECHEVERRIA nú3 meros 2931/33/35"' });
  const docs = [...legajoOk().filter((d) => d.clave !== "acta_asamblea" && d.clave !== "constancia_cuit"),
    doc("acta_asamblea", "observado", { observacion: "El mandato venció el 31/08/2026." }), doc("constancia_cuit", "falta")];
  const s = resumir(etapasDeTramite(t, docs, [], undefined, CTX), CTX, { abierto: t.created_at });
  assert.equal(s.grupo, "te_toca");
  assert.equal(s.actual, "papeles");
  assert.equal(s.loTiene, "Cliente");
  assert.equal(s.titulo, "Le falta al cliente: acta de asamblea y constancia de CUIT");
  assert.equal(s.motivo, "El mandato venció el 31/08/2026.");
  assert.deepEqual(s.acciones.map((a) => a.clave), ["revisar_dueno", "perseguir_cliente"]);
  assert.equal(s.acciones.find((a) => a.clave === "perseguir_cliente")?.para, "vendedora");
  assert.equal(s.etapas.find((x) => x.clave === "poliza")?.estado, "te_toca");
  assert.equal(s.estimado, "Frenado: depende del cliente");
});

test("Doblas 141: el cliente nunca entró; a los 2 días le toca a la vendedora", () => {
  const t = tramite({ titular_cargado_at: null, titular_nombre: null, created_at: "2026-09-25T12:00:00Z", link_enviado_at: "2026-09-25T12:00:00Z", link_enviado_a: "am@andamiosbuenosaires.com.ar", vendedor_email: "am@andamiosbuenosaires.com.ar" });
  const s = resumir(etapasDeTramite(t, [], [], undefined, CTX), CTX, { abierto: t.created_at });
  assert.equal(s.titulo, "Esperando que el cliente entre al portal");
  assert.match(s.bajada ?? "", /se le mandó a Agustina el 25\/09/);
  assert.deepEqual(s.acciones.map((a) => [a.clave, a.para]), [["perseguir_cliente", "vendedora"]]);
  assert.equal(s.demora, "muy");
});

test("un recordatorio reciente al cliente saca el perseguir hasta el próximo umbral", () => {
  const t = tramite({ titular_cargado_at: null, titular_nombre: null, created_at: "2026-09-25T12:00:00Z", link_enviado_at: "2026-09-25T12:00:00Z" });
  const s = resumir(etapasDeTramite(t, [], [], undefined, { ...CTX, ultimoContactoCliente: "2026-10-09T13:00:00Z" }), CTX);
  assert.equal(s.acciones.length, 0);
  assert.equal(s.grupo, "esperando");
});

test("endoso manual: con el dueño cargado y nombre bien, le toca a la oficina pedirlo", () => {
  const s = resumir(etapasDeTramite(tramite({ titular_cargado_at: "2026-10-09T20:00:00Z" }), [doc("aviso_obra", "falta")], [], undefined, CTX), CTX);
  assert.deepEqual(s.acciones.map((a) => a.clave), ["pedir_endoso"]);
  assert.equal(s.actual, "poliza");
});

test("endoso pedido: lo tiene Segucom y no le toca nada a la oficina", () => {
  const docs = [doc("aviso_obra", "falta", { updated_at: "2026-10-09T20:00:00Z" }), { ...doc("poliza_rc", "pedido", { pedido_at: "2026-10-09T20:00:00Z" }), origen: "productor" }];
  const s = resumir(etapasDeTramite(tramite({ titular_cargado_at: "2026-10-09T20:00:00Z" }), docs, [], undefined, CTX), CTX);
  assert.equal(s.acciones.length, 0);
  assert.equal(s.etapas.find((x) => x.clave === "poliza")?.quien, "Segucom");
});

test("C.R Escalada 2138 (tarea 92): el borrador no abre → empezar de cero, no esperar 16 reintentos", () => {
  const docs = [...legajoOk(), { ...doc("poliza_rc", "ok"), origen: "productor" }, { ...doc("encomienda_cpau", "ok"), origen: "aba" }, { ...doc("informe_tecnico", "ok"), origen: "aba" }];
  const tareas: TareaParaEstado[] = [{
    tipo: "tad_presentar", estado: "pendiente", error: "TAD no terminó de cargar los documentos del borrador en 3 minutos", created_at: "2026-10-09T22:40:24Z",
    terminada_at: "2026-10-09T22:55:11Z", reintentar_desde: "2026-10-09T23:25:10Z", payload: { continuar_borrador: 13232997 },
    resultado: { borrador: 13232997, reintento: 1, reintentos_max: 16, adjuntados: 0, confirmado: false, tad_caido: false },
  }];
  const s = resumir(etapasDeTramite(tramite(), docs, tareas, undefined, CTX), CTX);
  assert.equal(s.actual, "presentacion");
  assert.equal(s.titulo, "TAD no abre el borrador 13232997");
  assert.deepEqual(s.acciones.map((a) => a.clave), ["empezar_de_cero"]);
});

test("una presentación que se frenó con adjuntos en el borrador ofrece empezar de cero", () => {
  const docs = [...legajoOk(), { ...doc("poliza_rc", "ok"), origen: "productor" }, { ...doc("encomienda_cpau", "ok"), origen: "aba" }];
  const tareas: TareaParaEstado[] = [{ tipo: "tad_presentar", estado: "error", error: "El formulario no se pudo guardar", created_at: "2026-10-07T22:00:00Z", terminada_at: "2026-10-07T22:10:00Z", resultado: { borrador: 13232997, adjuntados: 11 } }];
  const s = resumir(etapasDeTramite(tramite(), docs, tareas, undefined, CTX), CTX);
  assert.deepEqual(s.acciones.map((a) => a.clave), ["empezar_de_cero"]);
  assert.match(s.bajada ?? "", /Quedaron 11 documentos oficiales/);
});

test("todo listo y presentación con botón: le toca presentar", () => {
  const docs = [...legajoOk(), { ...doc("poliza_rc", "ok"), origen: "productor" }, { ...doc("encomienda_cpau", "ok"), origen: "aba" }];
  const ctx = { ...CTX, supervision: { ...CTX.supervision, presentacionAutomatica: false } };
  const s = resumir(etapasDeTramite(tramite(), docs, [], undefined, ctx), ctx);
  assert.deepEqual(s.acciones.map((a) => a.clave), ["presentar"]);
});

test("Av. Corrientes 985: el Gobierno pide corregir → subsanar, con el motivo literal", () => {
  const docs = [...legajoOk(), { ...doc("poliza_rc", "ok"), origen: "productor" }, { ...doc("encomienda_cpau", "ok"), origen: "aba" }];
  const e = exp({ estado_tad: "SUBSANACION", tarea_pendiente: true, estado_desde: "2026-10-06T22:21:00Z", motivo_subsanacion: "DEBERAN SUBSANAR ACTA Y NOTA DE SOLICITUD" });
  const s = resumir(etapasDeTramite(tramite({ estado: "presentado" }), docs, [], e, CTX), CTX);
  assert.equal(s.actual, "gobierno");
  assert.equal(s.titulo, "El Gobierno pide corregir");
  assert.equal(s.motivo, "DEBERAN SUBSANAR ACTA Y NOTA DE SOLICITUD");
  assert.deepEqual(s.acciones.map((a) => a.clave), ["subsanar"]);
});

test("en el Gobierno: estimado con la mediana, corrido a día hábil", () => {
  const docs = [...legajoOk(), { ...doc("poliza_rc", "ok"), origen: "productor" }, { ...doc("encomienda_cpau", "ok"), origen: "aba" }];
  const e = exp({ creado_tad: "2026-10-09", numero: "2026-45490918" });
  const s = resumir(etapasDeTramite(tramite({ estado: "presentado" }), docs, [], e, CTX), CTX);
  assert.equal(s.grupo, "gobierno");
  assert.equal(s.loTiene, "Gobierno");
  assert.equal(s.estimado, "Permiso aprox. jue 22/10");
});

test("Triunvirato 4528: archivado sin resolución es de la oficina, no un permiso", () => {
  const e = exp({ estado_tad: "GUARDA TEMPORAL", solapa: "finalizado", estado_desde: "2026-10-09T20:36:37Z", permiso_notificacion: null });
  const s = resumir(etapasDeExpediente(e, CTX), CTX);
  assert.equal(s.titulo, "El Gobierno lo archivó sin resolución");
  assert.deepEqual(s.acciones.map((a) => a.clave), ["ver_archivado"]);
  const visto = resumir(etapasDeExpediente(e, { ...CTX, descartado: true }), { ...CTX, descartado: true });
  assert.equal(visto.grupo, "archivado");
});

test("permiso emitido con resolución RS-: listo, con vencimiento", () => {
  const e = exp({ estado_tad: "GUARDA TEMPORAL", solapa: "finalizado", permiso_notificacion: "RS-2026-1-GCABA-SSGOU", permiso_emitido_el: "2026-10-07", permiso_vence: "2027-04-07" });
  const s = resumir(etapasDeExpediente(e, CTX), CTX);
  assert.equal(s.grupo, "emitido");
  assert.equal(s.titulo, "Permiso emitido el 07/10");
  assert.equal(s.loTiene, null);
});

test("Acuña de Figueroa 1312: presentado a mano con la venta propuesta → confirmar, sin perseguir al cliente", () => {
  const docs = [...legajoOk().filter((d) => d.clave !== "constancia_cuit"), doc("constancia_cuit", "observado", { observacion: "Es una factura." })];
  const e = exp({ numero: "2026-44242731", creado_tad: "2026-10-02", odoo_vinculo_por: "direccion", estado_tad: "SUBSANACION", estado_desde: "2026-10-03T12:00:00Z" });
  const s = resumir(etapasDeTramite(tramite(), docs, [], e, CTX), CTX);
  assert.deepEqual(s.acciones.map((a) => a.clave), ["confirmar_venta"]);
  assert.equal(s.etapas.find((x) => x.clave === "papeles")?.detalle, "Se presentó a mano");
});

test("un expediente viejo sin novedades pide decidir; dejado de seguir va a archivados", () => {
  const e = exp({ numero: "2025-53452435", creado_tad: "2025-12-11", estado_desde: "2026-09-14T00:00:00Z" });
  const s = resumir(etapasDeExpediente(e, CTX), CTX);
  assert.deepEqual(s.acciones.map((a) => a.clave), ["decidir_expediente"]);
  const ctx = { ...CTX, descartado: true };
  assert.equal(resumir(etapasDeExpediente(e, ctx), ctx).grupo, "archivado");
});

test("prueba: nunca le toca nada a nadie en la lista", () => {
  const s = resumir(etapasDeTramite(tramite({ es_prueba: true, titular_cargado_at: null, titular_nombre: null }), [], [], undefined, CTX), CTX, { esPrueba: true });
  assert.equal(s.grupo, "prueba");
});
