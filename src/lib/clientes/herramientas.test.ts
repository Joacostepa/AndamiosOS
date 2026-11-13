// Las 11 herramientas de Tomás: lista cerrada, esquemas estrictos (ningún id de otro cliente) y
// resultados sin plata ni datos de otros (crm-propuesta.md §13). Las 4 del alquiler simple
// (alquiler-simple-propuesta.md, 12/11) al final.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOMBRES_HERRAMIENTAS, definicionesSofia, ejecutarHerramientaSofia, faltantesBandeja, fichaSofiaVacia, leerFicha, validarRetiro, type ContextoHerramienta, type FichaSofia,
} from "./herramientas.ts";
import { crearMundo, lotePrueba } from "./prueba-sofia.ts";
import { detectarPlata, revisarSalida } from "./filtro-salida.ts";

function contexto(ficha: Partial<FichaSofia> = {}, cambios: Partial<ContextoHerramienta["servicios"]> = {}): ContextoHerramienta & { mundo: ReturnType<typeof crearMundo> } {
  const mundo = crearMundo({ ficha });
  const deps = mundo.deps(async () => {
    throw new Error("no se llama al modelo");
  });
  return { ficha: mundo.charla.ficha, servicios: { ...deps.servicios(mundo.charla), ...cambios }, mundo };
}

const MARCELA: Partial<FichaSofia> = {
  trabajo: "bandeja", alturaBandeja: 3, necesitaAndamio: false, cubreTodoElFrente: true, nombre: "Marcela Ríos", direccion: "Los Aromos 1234",
  enCaba: true, lote: lotePrueba("Los Aromos 1234"), tipoCliente: "particular",
};

test("son exactamente las 7 de §13 más las 4 del alquiler simple, en orden", () => {
  assert.deepEqual(NOMBRES_HERRAMIENTAS, [
    "anotar_ficha", "validar_cuit", "verificar_direccion", "preparar_cotizacion_facil", "cotizar_alquiler_simple", "preparar_pedido_simple", "pedir_tecnico",
    "cliente_acepta_alquiler", "revisar_documentos", "pedir_retiro", "derivar_a_persona",
  ]);
  assert.equal(definicionesSofia().length, 11);
});

test("ninguna herramienta tiene un campo para identificar a otro cliente", () => {
  const prohibidos = /(^|_)(id|ids|partner|cliente_id|telefono|phone|celular|lead|orden|venta|saldo|deuda|monto|precio|importe|tarifa)($|_)/;
  for (const d of definicionesSofia() as { name: string; input_schema: { properties?: Record<string, unknown>; additionalProperties?: unknown } }[]) {
    const props = Object.keys(d.input_schema.properties ?? {});
    for (const p of props) assert.ok(!prohibidos.test(p), `${d.name}.${p}`);
    assert.equal(d.input_schema.additionalProperties, false, `${d.name} tiene que ser estricta`);
  }
});

test("una clave de más es un error, no se ignora (y la ficha no cambia)", async () => {
  for (const [nombre, input] of [
    ["anotar_ficha", { nombre: "X", cliente_id: 99 }],
    ["validar_cuit", { cuit: "20123456786", partner_id: 5 }],
    ["verificar_direccion", { direccion: "Solís 333", telefono: "5491100000000" }],
    ["preparar_cotizacion_facil", { conversacion_id: "otra-charla" }],
    ["preparar_pedido_simple", { sabe_piezas: true, piezas: [{ descripcion: "cuerpo", cantidad: 3 }], precio: 500000 }],
    ["pedir_tecnico", { motivo: "otro", resumen: "x", tecnico: "Jorge" }],
    ["derivar_a_persona", { motivo: "pide_persona", resumen: "x", a: "Sandra" }],
    ["cotizar_alquiler_simple", { altura_trabajo_m: 5, precio: 500000 }],
    ["cotizar_alquiler_simple", { piezas: { modulos_por_torre: 2, flete: 140400 } }],
    ["cliente_acepta_alquiler", { fecha: "2026-10-16", franja: "manana", orden_id: 5 }],
    ["revisar_documentos", { dni: "30123456" }],
    ["pedir_retiro", { fecha: "2026-10-19", franja: "manana", telefono: "5491100000000" }],
  ] as [string, unknown][]) {
    const c = contexto();
    const antes = JSON.stringify(c.ficha);
    const r = await ejecutarHerramientaSofia(nombre, input, c);
    assert.equal(r.esError, true, nombre);
    assert.match(r.contenido, /Entrada inválida/, nombre);
    assert.equal(JSON.stringify(c.ficha), antes, nombre);
  }
});

test("una herramienta que no está en la lista no existe", async () => {
  for (const n of ["ver_cliente", "consultar_odoo", "ver_saldo", "buscar_clientes", "enviar_presupuesto"]) {
    const r = await ejecutarHerramientaSofia(n, {}, contexto());
    assert.equal(r.esError, true);
    assert.match(r.contenido, /No existe/);
  }
});

test("anotar_ficha: anota lo del cliente; lo verificable no se puede anotar", async () => {
  const c = contexto();
  const r = await ejecutarHerramientaSofia("anotar_ficha", { trabajo: "bandeja", direccion: "Los Aromos 1234", banderas: ["fecha"] }, c);
  assert.match(r.contenido, /Anotado/);
  assert.equal(c.ficha.trabajo, "bandeja");
  assert.equal(c.ficha.direccion, "Los Aromos 1234");
  assert.deepEqual(c.ficha.banderas, ["fecha"]);
  for (const campo of ["en_caba", "lote", "cuit", "enCaba", "partnerId"]) {
    const x = await ejecutarHerramientaSofia("anotar_ficha", { [campo]: true }, c);
    assert.equal(x.esError, true, campo);
  }
  // Las banderas sólo se suman.
  await ejecutarHerramientaSofia("anotar_ficha", { banderas: ["enojo"] }, c);
  assert.deepEqual(c.ficha.banderas, ["fecha", "enojo"]);
});

test("anotar_ficha: otra dirección borra lo verificado de la anterior", async () => {
  const c = contexto(MARCELA);
  await ejecutarHerramientaSofia("anotar_ficha", { direccion: "Otra 999" }, c);
  assert.equal(c.ficha.enCaba, null);
  assert.equal(c.ficha.lote, null);
});

test("validar_cuit: sólo el dígito; no dice si es cliente ni de quién es", async () => {
  const c = contexto();
  const ok = await ejecutarHerramientaSofia("validar_cuit", { cuit: "20-12345678-6" }, c);
  assert.deepEqual(JSON.parse(ok.contenido), { valido: true, cuit: "20-12345678-6", tipo: "persona" });
  assert.equal(c.ficha.cuit, "20-12345678-6");
  const mal = await ejecutarHerramientaSofia("validar_cuit", { cuit: "20-12345678-0" }, c);
  assert.equal(JSON.parse(mal.contenido).valido, false);
});

test("verificar_direccion: CABA con frente; esquina; fuera de CABA; catastro caído", async () => {
  const c = contexto();
  const r = JSON.parse((await ejecutarHerramientaSofia("verificar_direccion", { direccion: "Los Aromos 1234" }, c)).contenido);
  assert.equal(r.resultado, "verificada");
  assert.equal(r.frente_m, "12,4");
  assert.equal(c.ficha.enCaba, true);
  assert.equal(c.ficha.lote?.direccionConsultada, "Los Aromos 1234");

  const fuera = contexto({}, { verificarDireccion: async () => ({ estado: "fuera_de_caba", direccion: "Av. Ficticia 2500, Vicente López" }) });
  assert.equal(JSON.parse((await ejecutarHerramientaSofia("verificar_direccion", { direccion: "Av. Ficticia 2500, Vicente López" }, fuera)).contenido).resultado, "fuera_de_caba");
  assert.equal(fuera.ficha.enCaba, false);

  const caido = contexto({}, { verificarDireccion: async () => { throw new Error("El catastro respondió 503"); } });
  const x = await ejecutarHerramientaSofia("verificar_direccion", { direccion: "Los Aromos 1234" }, caido);
  assert.equal(x.esError, undefined);
  assert.equal(JSON.parse(x.contenido).resultado, "sin_respuesta");
});

test("preparar_cotizacion_facil: primero pide lo que falta", async () => {
  const c = contexto({ trabajo: "bandeja" });
  const r = JSON.parse((await ejecutarHerramientaSofia("preparar_cotizacion_facil", {}, c)).contenido);
  assert.equal(r.estado, "faltan_datos");
  assert.ok(r.preguntar.some((p: string) => /dirección/.test(p)));
  assert.equal(c.mundo.pendientes.length, 0);
  assert.deepEqual(faltantesBandeja({ ...fichaSofiaVacia(), ...MARCELA }), []);
});

test("preparar_cotizacion_facil: pendiente con número; el monto queda sólo para la tarjeta; es idempotente", async () => {
  const c = contexto(MARCELA);
  const r1 = await ejecutarHerramientaSofia("preparar_cotizacion_facil", {}, c);
  const r2 = await ejecutarHerramientaSofia("preparar_cotizacion_facil", {}, c);
  assert.deepEqual(JSON.parse(r1.contenido).cotizacion, JSON.parse(r2.contenido).cotizacion);
  assert.equal(c.mundo.pendientes.length, 1);
  assert.equal(r1.efecto?.estado, "espera_ok");
  for (const t of [r1.contenido, r2.contenido]) {
    assert.equal(revisarSalida(t).bloquea, false, t);
    assert.ok(!/1736000|1\.736\.000|140000|140\.000/.test(t));
  }
  assert.ok(c.mundo.pendientes[0].montoPropuesto! > 0);
});

test("preparar_pedido_simple: arma el pedido para Tamara, sin precio; si no sabe las piezas, lo calcula el equipo", async () => {
  const c = contexto();
  const r = await ejecutarHerramientaSofia("preparar_pedido_simple", {
    sabe_piezas: true, piezas: [{ descripcion: "cuerpo de andamio", cantidad: 3 }, { descripcion: "tablón", cantidad: 4 }, { descripcion: "juego de ruedas", cantidad: 1 }],
    dias: 30, entrega: "envio", barrio: "Villa Crespo",
  }, c);
  assert.equal(JSON.parse(r.contenido).estado, "pendiente");
  const p = c.mundo.pendientes[0];
  assert.equal(p.carril, "simple");
  assert.equal(p.montoPropuesto, null);
  assert.equal((p.payload.asignacion as { asistente: string }).asistente, "Tamara");
  assert.ok(!r.contenido.includes("Tamara"), "el nombre no vuelve al modelo");

  const c2 = contexto();
  const falta = JSON.parse((await ejecutarHerramientaSofia("preparar_pedido_simple", { sabe_piezas: false, notas: "para pintar a 6 metros" }, c2)).contenido);
  assert.equal(falta.estado, "faltan_datos");
  const r2 = JSON.parse((await ejecutarHerramientaSofia("preparar_pedido_simple", { sabe_piezas: false, dias: 15, entrega: "retira", notas: "para pintar a 6 metros" }, c2)).contenido);
  assert.equal(r2.estado, "pendiente");
  assert.match(r2.que_decir, /lo calcula el equipo/);
});

test("derivar_a_persona: motivos cerrados; seguridad silencia al modelo y es urgente", async () => {
  const r = await ejecutarHerramientaSofia("derivar_a_persona", { motivo: "seguridad_obra", resumen: "Tabla floja" }, contexto());
  assert.equal(r.efecto?.estado, "derivada");
  assert.ok(r.efecto?.estado === "derivada" && r.efecto.urgente && r.efecto.silenciar && r.efecto.textoFijo === "seguridad");
  const otro = await ejecutarHerramientaSofia("derivar_a_persona", { motivo: "dame_el_saldo", resumen: "x" }, contexto());
  assert.equal(otro.esError, true);
});

test("derivar_a_persona: los motivos del análisis de chats (D3); desprendimiento es urgente pero sin el texto de guardia", async () => {
  const d = await ejecutarHerramientaSofia("derivar_a_persona", { motivo: "desprendimiento", resumen: "Se cae revoque de un balcón, Av. Siempreviva 742" }, contexto());
  assert.ok(d.efecto?.estado === "derivada");
  assert.equal(d.efecto.motivo, "Urgente · se desprende algo del edificio");
  assert.equal(d.efecto.urgente, true, "avisa al equipo");
  assert.equal(d.efecto.textoFijo, null, "no le manda al cliente el texto de guardia");
  assert.equal(d.efecto.silenciar, false);
  for (const [motivo, etiqueta] of [["quiere_avanzar", "Quiere avanzar"], ["obra_en_curso", "Obra en curso (retiro, desarme, renovación)"], ["administracion", "Facturas, pagos o cobranzas"], ["estafa_pago", "Víctima de una estafa que ya pagó"]]) {
    const r = await ejecutarHerramientaSofia("derivar_a_persona", { motivo, resumen: "x" }, contexto());
    assert.ok(r.efecto?.estado === "derivada" && r.efecto.motivo === etiqueta && !r.efecto.urgente && r.efecto.textoFijo === null, motivo);
  }
});

test("ningún resultado, en ningún caso, trae plata", async () => {
  const resultados: string[] = [];
  const correr = async (n: string, i: unknown, c = contexto(MARCELA)) => resultados.push((await ejecutarHerramientaSofia(n, i, c)).contenido);
  await correr("anotar_ficha", { nombre: "Marcela" });
  await correr("validar_cuit", { cuit: "30-71234567-1" });
  await correr("verificar_direccion", { direccion: "Los Aromos 1234" });
  await correr("preparar_cotizacion_facil", {});
  await correr("preparar_cotizacion_facil", {}, contexto({ ...MARCELA, lote: lotePrueba("Los Aromos 1234", { frenteCatastro: 40, caras: [40] }) }));
  await correr("preparar_pedido_simple", { sabe_piezas: true, piezas: [{ descripcion: "tablón", cantidad: 4 }], dias: 30, entrega: "retira" });
  await correr("pedir_tecnico", { motivo: "trabajo_no_facil", resumen: "Fachada de 8 pisos" });
  await correr("derivar_a_persona", { motivo: "regateo_o_pago", resumen: "Pide descuento" });
  for (const t of resultados) assert.equal(detectarPlata(t).bloquea, false, t);
});

test("leerFicha: lo guardado vacío o viejo se completa", () => {
  const f = leerFicha({}, "5491100001234");
  assert.deepEqual(f.mensajesCliente, []);
  assert.equal(f.telefono, "5491100001234");
  assert.equal(f.alquiler, null);
  const vieja = leerFicha({ nombre: "Hugo", banderas: "x" }, null);
  assert.equal(vieja.nombre, "Hugo");
  assert.deepEqual(vieja.banderas, []);
});

// ── La tarea y la gama alta (JS, 16/10) ─────────────────────────────────────────────────

test("anotar_ficha: anota la tarea del cliente; la gama alta no la puede tocar el modelo", async () => {
  const c = contexto();
  const r = await ejecutarHerramientaSofia("anotar_ficha", { tarea: "pintar la fachada" }, c);
  assert.equal(r.esError, undefined);
  assert.equal(c.ficha.tarea, "pintar la fachada");
  const intento = await ejecutarHerramientaSofia("anotar_ficha", { segmento: "gama_alta" }, c);
  assert.equal(intento.esError, true);
  assert.equal(c.ficha.segmento, null);
  assert.equal(leerFicha({ segmento: "cualquiera" }, null).segmento, null);
  assert.equal(leerFicha({ segmento: "gama_alta", tarea: "demolición" }, null).segmento, "gama_alta");
  assert.equal(leerFicha({}, null).tarea, null);
});

test("gama alta: preparar_cotizacion_facil nunca deja una cotización, y la derivación lo dice", async () => {
  const c = contexto({ ...MARCELA, segmento: "gama_alta" });
  const r = await ejecutarHerramientaSofia("preparar_cotizacion_facil", {}, c);
  assert.equal(r.efecto, undefined);
  assert.match(r.contenido, /no_es_facil/);
  assert.match(r.contenido, /gama alta/);
  assert.equal(c.mundo.pendientes.length, 0);

  const propio = await ejecutarHerramientaSofia("derivar_a_persona", { motivo: "gama_alta", resumen: "Multidireccional para 8 pisos, 30 m de frente." }, c);
  assert.equal(propio.efecto?.estado, "derivada");
  assert.equal(propio.efecto?.estado === "derivada" && propio.efecto.motivo, "Gama alta");
  const otro = await ejecutarHerramientaSofia("derivar_a_persona", { motivo: "pide_persona", resumen: "Quiere hablar con alguien." }, c);
  assert.equal(otro.efecto?.estado === "derivada" && otro.efecto.motivo, "Gama alta · Pide hablar con una persona");
  const seguridad = await ejecutarHerramientaSofia("derivar_a_persona", { motivo: "seguridad_obra", resumen: "Tabla floja." }, c);
  assert.equal(seguridad.efecto?.estado === "derivada" && seguridad.efecto.motivo, "Seguridad en obra · urgente");
});

test("pedir_tecnico: la tarjeta del equipo trae por qué la bandeja no salió fácil (JS, 16/10)", async () => {
  const c = contexto({ ...MARCELA, mensajesCliente: ["Quiero hablar con Jorge"] });
  await ejecutarHerramientaSofia("pedir_tecnico", { motivo: "trabajo_no_facil", resumen: "Bandeja en Los Aromos 1234" }, c);
  const p = c.mundo.pendientes.at(-1)!;
  const porQue = (p.payload as { porQueNoFacil: string[] | null }).porQueNoFacil;
  assert.ok(porQue?.some((m) => /Pide hablar con una persona/.test(m)), JSON.stringify(porQue));
  // Un trabajo que no es bandeja: no hay renglones de «fácil».
  const f = contexto({ trabajo: "fachada" as FichaSofia["trabajo"] });
  await ejecutarHerramientaSofia("pedir_tecnico", { motivo: "trabajo_no_facil", resumen: "Fachada" }, f);
  assert.equal((f.mundo.pendientes.at(-1)!.payload as { porQueNoFacil: unknown }).porQueNoFacil, null);
});

// ── El alquiler simple (alquiler-simple-propuesta.md, cerrada con JS el 12/11) ─────────

/** El ejemplo de la §5: pintar una pared de patio hasta 5 m en Palermo, piso liso, espacio de sobra. */
const PALERMO = {
  lugar: "afuera", altura_trabajo_m: 5, espacio_de_sobra: true, piso: "liso", direccion: "Gorriti 4500", fecha: "2026-10-16", franja: "manana", dias: 7,
} as const;

const sinNumero = (t: string) => t.replace(/#\d+/g, "#N");

test("cotizar_alquiler_simple: el ejemplo de Palermo queda pendiente en el carril «alquiler», con el contrato de la tarjeta y sin plata para el modelo", async () => {
  const c = contexto({ nombre: "Marcela Ríos" });
  const r = await ejecutarHerramientaSofia("cotizar_alquiler_simple", PALERMO, c);
  const o = JSON.parse(r.contenido);
  assert.equal(o.estado, "pendiente", r.contenido);
  assert.match(o.presupuesto, /^#\d+$/);
  assert.equal(r.efecto?.estado, "espera_ok");
  assert.match(r.efecto!.motivo, /^presupuesto de alquiler #\d+$/);
  assert.match(o.que_decir, /No prometas minutos/);
  assert.match(o.condiciones, /choferes no pueden entrar/);
  assert.equal(detectarPlata(r.contenido).bloquea, false, r.contenido);
  assert.ok(!/500000|500\.000|140400|140\.400|197600/.test(r.contenido));

  const p = c.mundo.pendientes[0];
  assert.equal(p.tipo, "precio");
  assert.equal(p.carril, "alquiler");
  assert.equal(p.montoPropuesto, 500_000, "el total neto va para la tarjeta");
  assert.match(p.resumen, /^Alquiler simple · 1 torre de 2 módulos 1,30 × 2,50 · Palermo · viernes 16 de octubre, de 8 a 12$/);
  const alq = p.payload.alquiler as { pedido: { alturaTrabajo: number }; resultado: { precio: { total: number }; facil: boolean }; flete: unknown; entrega: unknown };
  assert.equal(alq.pedido.alturaTrabajo, 5);
  assert.equal(alq.resultado.precio.total, 500_000);
  assert.equal(alq.resultado.facil, true);
  assert.deepEqual(alq.flete, { id: 400, nombre: "Palermo", precio: 140_400 });
  assert.deepEqual(alq.entrega, { fecha: "2026-10-16", franja: { tipo: "manana" } });
  assert.ok("alertas" in p.payload && "asignacion" in p.payload);
  assert.equal(p.payload.direccion, "Gorriti 4500");

  assert.equal(c.ficha.trabajo, "alquiler_simple");
  assert.equal(c.ficha.alquiler?.cotizacion?.numero, p.numero);
  assert.equal(c.ficha.alquiler?.ubicacion?.fleteId, 400);
  assert.ok(!JSON.stringify(c.ficha).includes("140400"), "el precio del flete no queda en la ficha");
});

test("cotizar_alquiler_simple: se suma de a poco; pide lo que falta, en el orden de la §3, y al final el nombre", async () => {
  const c = contexto();
  const r1 = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { lugar: "afuera", altura_trabajo_m: 5 }, c)).contenido);
  assert.equal(r1.estado, "faltan_datos");
  assert.ok(r1.preguntar.some((x: string) => /espacio libre/.test(x)), JSON.stringify(r1));
  assert.ok(r1.preguntar.some((x: string) => /piso/.test(x)));
  assert.ok(r1.preguntar.some((x: string) => /Dónde es/.test(x)));
  assert.equal(r1.preguntar.at(-1), "¿A nombre de quién va el presupuesto?");
  assert.equal(c.mundo.pendientes.length, 0);

  await ejecutarHerramientaSofia("cotizar_alquiler_simple", { espacio_de_sobra: true, piso: "liso" }, c);
  assert.equal(c.ficha.alquiler?.pedido?.alturaTrabajo, 5, "lo anterior no se pierde");
  const r3 = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { direccion: "Gorriti 4500", fecha: "2026-10-16", franja: "tarde", dias: 7 }, c)).contenido);
  assert.deepEqual(r3.preguntar, ["¿A nombre de quién va el presupuesto?"]);
  await ejecutarHerramientaSofia("anotar_ficha", { nombre: "Marcela" }, c);
  const r4 = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", {}, c)).contenido);
  assert.equal(r4.estado, "pendiente");
});

test("cotizar_alquiler_simple: con deuda el modelo recibe exactamente lo mismo; la tarjeta lo sabe", async () => {
  const correr = async (deuda: boolean | null) => {
    const c = contexto({ nombre: "Marcela" });
    c.mundo.deudaVencida = deuda;
    const r = await ejecutarHerramientaSofia("cotizar_alquiler_simple", PALERMO, c);
    return { t: sinNumero(r.contenido), c };
  };
  const nuevo = await correr(false);
  const deudor = await correr(true);
  const sinSaber = await correr(null);
  assert.equal(deudor.t, nuevo.t);
  assert.equal(sinSaber.t, nuevo.t);
  assert.ok(!/deuda/i.test(deudor.t));
  const res = deudor.c.mundo.pendientes[0].payload.alquiler as { resultado: { facil: boolean; trabajoFacil: boolean } };
  assert.equal(res.resultado.facil, false, "la tarjeta ve que no sale solo");
  assert.equal(res.resultado.trabajoFacil, true);
});

test("cotizar_alquiler_simple: para hoy pasa sola a un vendedor, sin pendiente", async () => {
  const c = contexto({ nombre: "Hugo" });
  const r = await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...PALERMO, fecha: undefined, para_hoy: true }, c);
  assert.equal(JSON.parse(r.contenido).estado, "derivada");
  assert.ok(r.efecto?.estado === "derivada" && r.efecto.motivo === "Alquiler simple para el mismo día" && !r.efecto.urgente);
  assert.equal(c.mundo.pendientes.length, 0);
  // La fecha de hoy también cuenta como «para hoy».
  const c2 = contexto({ nombre: "Hugo" });
  const r2 = await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...PALERMO, fecha: "2026-10-15" }, c2);
  assert.equal(r2.efecto?.estado, "derivada");
});

test("cotizar_alquiler_simple: lo que no entra en las reglas dice qué hacer (técnico, vendedor o persona)", async () => {
  const montaje = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...PALERMO, montaje: true }, contexto({ nombre: "A" }))).contenido);
  assert.equal(montaje.estado, "no_es_facil");
  assert.match(montaje.que_hacer, /pedir_tecnico/);

  // Un barrio de CABA que no está en la lista de fletes: lo cotiza un vendedor.
  const lejos = contexto({ nombre: "A" });
  lejos.mundo.fleteAlquiler = async () => ({ estado: "ok", enCaba: true, lugar: "Villa Desconocida", partido: null, normalizada: "X", flete: null });
  const r = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", PALERMO, lejos)).contenido);
  assert.equal(r.estado, "no_es_facil");
  assert.match(r.que_hacer, /preparar_pedido_simple/);
  assert.match(r.detalle, /lista de fletes/);
  assert.ok(lejos.ficha.alquiler!.porQueNo.some((x) => /Villa Desconocida/.test(x)), "la tarjeta sabe por qué");
  // preparar_pedido_simple aprovecha lo que juntó: 30 días y envío, sin volver a preguntar.
  const p = JSON.parse((await ejecutarHerramientaSofia("preparar_pedido_simple", { sabe_piezas: false, notas: "pintar pared de patio a 5 m" }, lejos)).contenido);
  assert.equal(p.estado, "pendiente");
  const pend = lejos.mundo.pendientes[0];
  assert.equal(pend.carril, "simple");
  const a = pend.payload.alquiler as { dias: number; entrega: string; barrio: string; pedido: { alturaTrabajo: number } };
  assert.equal(a.dias, 30);
  assert.equal(a.entrega, "envio");
  assert.equal(a.barrio, "Villa Desconocida");
  assert.equal(a.pedido.alturaTrabajo, 5);

  const escalera = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...PALERMO, piezas_fuera_de_catalogo: ["escalera"] }, contexto({ nombre: "A" }))).contenido);
  assert.match(escalera.que_hacer, /No ofrezcas escaleras/);

  const persona = contexto({ nombre: "A", mensajesCliente: ["Quiero hablar con una persona"] });
  const rp = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", PALERMO, persona)).contenido);
  assert.equal(rp.estado, "no_es_facil");
  assert.match(rp.que_hacer, /derivar_a_persona/);

  const gama = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", PALERMO, contexto({ nombre: "A", segmento: "gama_alta" }))).contenido);
  assert.match(gama.que_hacer, /gama_alta/);
});

test("cotizar_alquiler_simple: la dirección ambigua o no encontrada se pregunta; USIG caído no rompe", async () => {
  const c = contexto({ nombre: "A" });
  c.mundo.fleteAlquiler = async () => ({ estado: "ambigua", opciones: ["DORREGO 3307, CABA", "DORREGO 3307, Monte Grande"] });
  const r = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", PALERMO, c)).contenido);
  assert.equal(r.estado, "faltan_datos");
  assert.ok(r.preguntar.some((x: string) => /Monte Grande/.test(x)), JSON.stringify(r));
  c.mundo.fleteAlquiler = async () => { throw new Error("USIG 503"); };
  const caido = await ejecutarHerramientaSofia("cotizar_alquiler_simple", {}, c);
  assert.equal(caido.esError, undefined);
  assert.match(JSON.parse(caido.contenido).preguntar.join(" "), /No pude ubicar/);
});

test("cotizar_alquiler_simple: la franja de una hora pide la hora; con recargo, el modelo sabe que hay recargo pero no cuánto", async () => {
  const c = contexto({ nombre: "A" });
  const sinHora = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...PALERMO, franja: "hora_particular" }, c)).contenido);
  assert.equal(sinHora.estado, "faltan_datos");
  assert.match(sinHora.preguntar[0], /a qué hora/);
  const r = await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...PALERMO, franja: "hora_particular", hora_desde: "10" }, c);
  assert.equal(JSON.parse(r.contenido).estado, "pendiente");
  assert.match(r.contenido, /recargo por los costos operativos/);
  assert.ok(!/20|%|por ciento/.test(JSON.parse(r.contenido).detalle));
  assert.equal(detectarPlata(r.contenido).bloquea, false);
  assert.equal(c.mundo.pendientes[0].montoPropuesto, 600_000, "el 20 % sobre el total del servicio (fila 15)");
  assert.deepEqual(c.ficha.alquiler?.pedido?.franja, { tipo: "hora", desde: 10 });
});

test("cotizar_alquiler_simple: el techo bajo propone el peldaño y espera la respuesta (acepta_plataforma)", async () => {
  const c = contexto({ nombre: "A" });
  const r = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", {
    lugar: "adentro", trabajo_en_techo: true, altura_techo_m: 3, espacio_de_sobra: true, piso: "liso", direccion: "Gorriti 4500", fecha: "2026-10-16", franja: "manana", dias: 7,
  }, c)).contenido);
  assert.equal(r.estado, "confirmar");
  assert.match(r.detalle, /un solo tablón de 30 cm/);
  assert.equal(c.mundo.pendientes.length, 0);
  const ok = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { acepta_plataforma: true }, c)).contenido);
  assert.equal(ok.estado, "pendiente");
  const no = contexto({ nombre: "A" });
  await ejecutarHerramientaSofia("cotizar_alquiler_simple", { lugar: "adentro", trabajo_en_techo: true, altura_techo_m: 3, espacio_de_sobra: true, piso: "liso", direccion: "Gorriti 4500", fecha: "2026-10-16", franja: "manana", dias: 7, acepta_plataforma: false }, no);
  assert.equal(no.mundo.pendientes.length, 0);
});

test("cotizar_alquiler_simple: si cambia el techo, la plataforma aceptada ya no vale y se vuelve a confirmar", async () => {
  const c = contexto({ nombre: "A" });
  const base = { lugar: "adentro", trabajo_en_techo: true, espacio_de_sobra: true, piso: "liso", direccion: "Gorriti 4500", fecha: "2026-10-16", franja: "manana", dias: 7 } as const;
  await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...base, altura_techo_m: 3, acepta_plataforma: true }, c);
  assert.equal(c.ficha.alquiler?.pedido?.aceptaPlataforma, true);
  // Era 5 m, no 3: el peldaño del segundo módulo, que no llega cómodo al techo. Hay que volver a preguntar.
  const r = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { altura_techo_m: 5 }, c)).contenido);
  assert.equal(r.estado, "confirmar");
  assert.equal(c.ficha.alquiler?.pedido?.aceptaPlataforma, null);
  assert.match(r.detalle, /peldaño de 0,80 m del segundo módulo/);
  assert.match(r.detalle, /acepta_plataforma/);
  // Lo que no es de la altura (la fecha) no la borra.
  await ejecutarHerramientaSofia("cotizar_alquiler_simple", { acepta_plataforma: true }, c);
  await ejecutarHerramientaSofia("cotizar_alquiler_simple", { fecha: "2026-10-19" }, c);
  assert.equal(c.ficha.alquiler?.pedido?.aceptaPlataforma, true);
});

// ── Provincia y el depósito (JS, 12/11, filas 16 y 17) ─────────────────────────────────

test("cotizar_alquiler_simple: en provincia no hay flete (aunque la localidad esté en la lista) y se ofrece el depósito", async () => {
  const c = contexto({ nombre: "A" });
  const olivos = { carrierId: 405, nombre: "OLIVOS", precio: 225_600 };
  c.mundo.fleteAlquiler = async () => ({ estado: "ok", enCaba: false, lugar: "Olivos", partido: "Vicente López", normalizada: "MAIPU 2000, OLIVOS", flete: olivos });
  const r = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...PALERMO, direccion: "Maipú 2000, Olivos" }, c)).contenido);
  assert.equal(r.estado, "confirmar");
  assert.match(r.confirmar[0], /La obra está en Olivos \(provincia\): no entregamos ni retiramos fuera de CABA\. Ofrecele retirarlo en nuestro depósito/);
  assert.equal(c.ficha.alquiler?.ubicacion?.fleteId, null, "el método del conurbano no se usa");
  assert.equal(c.ficha.enCaba, false);
  assert.equal(c.mundo.pendientes.length, 0);
  // No puede retirarlo: no es un alquiler simple, y no se le ofrecen escaleras.
  const no = contexto({ nombre: "A" });
  no.mundo.fleteAlquiler = c.mundo.fleteAlquiler;
  const rn = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...PALERMO, direccion: "Maipú 2000, Olivos", retira_en_deposito: false }, no)).contenido);
  assert.equal(rn.estado, "no_es_facil");
  // Fila 23: se lo dice directo y con amabilidad, sin derivar ni dejar nada pendiente.
  assert.match(rn.que_hacer, /no llegamos con entregas a provincia/);
  assert.ok(!/derivar_a_persona|preparar_pedido_simple|pedir_tecnico/.test(rn.que_hacer));
  assert.match(rn.detalle, /No lo pases a nadie del equipo/);
  assert.equal(no.mundo.pendientes.length, 0);
  // Lo retira: queda pendiente sin flete, con la franja del depósito.
  // El viernes de 10 a 12 no llega a las 24 h (es jueves 10:30): se ofrece la tarde.
  const pronto = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { retira_en_deposito: true }, c)).contenido);
  assert.equal(pronto.estado, "confirmar");
  assert.match(pronto.confirmar.join(" "), /24 h de anticipación.*La próxima posible: el viernes 16 de octubre, de 13 a 16/);
  const si = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { fecha: "2026-10-19" }, c)).contenido);
  assert.equal(si.estado, "pendiente");
  const p = c.mundo.pendientes[0];
  assert.equal(p.montoPropuesto, 500_000, "material + mínimo, sin flete");
  assert.match(p.resumen, /· retira en el depósito · lunes 19 de octubre, de 10 a 12$/);
  const alq = p.payload.alquiler as { flete: unknown; entrega: unknown; pedido: { retiraEnDeposito: boolean } };
  assert.equal(alq.flete, null);
  assert.deepEqual(alq.entrega, { fecha: "2026-10-19", franja: { tipo: "deposito_manana" } });
  assert.equal(alq.pedido.retiraEnDeposito, true);
  assert.match(si.condiciones, /No hay chofer ni camión/);
  assert.ok(!/choferes no pueden entrar/.test(si.condiciones));
  assert.equal(detectarPlata(JSON.stringify(si)).bloquea, false);
});

test("cotizar_alquiler_simple: un cliente de Capital que retira en el depósito no necesita dirección", async () => {
  const c = contexto({ nombre: "A" });
  const { direccion: _d, ...sinDireccion } = PALERMO;
  void _d;
  const r = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...sinDireccion, retira_en_deposito: true, franja: "tarde" }, c)).contenido);
  assert.equal(r.estado, "pendiente", JSON.stringify(r));
  const alq = c.mundo.pendientes[0].payload.alquiler as { entrega: unknown };
  assert.deepEqual(alq.entrega, { fecha: "2026-10-16", franja: { tipo: "deposito_tarde" } });
  // Una franja de una hora en el depósito: se vuelve a preguntar, con las del depósito.
  const h = contexto({ nombre: "A" });
  const rh = JSON.parse((await ejecutarHerramientaSofia("cotizar_alquiler_simple", { ...sinDireccion, retira_en_deposito: true, franja: "hora_particular", hora_desde: "10" }, h)).contenido);
  assert.equal(rh.estado, "faltan_datos");
  assert.deepEqual(rh.preguntar, ["¿Pasás de 10 a 12 o de 13 a 16?"]);
});

test("cliente_acepta_alquiler y pedir_retiro: con el depósito, sus franjas y sus condiciones", async () => {
  const c = contexto();
  c.mundo.presupuestoAlquiler = { ...PRESUPUESTO, entrega: { fecha: "2026-10-16", franja: { tipo: "deposito_manana" } } };
  // El sábado el depósito no abre.
  const sab = JSON.parse((await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-17", franja: "manana" }, c)).contenido);
  assert.equal(sab.estado, "fecha_no_va");
  assert.match(sab.motivo, /el depósito abre de lunes a viernes/);
  assert.equal(sab.proxima, "lunes 19 de octubre, de 10 a 12");
  const r = JSON.parse((await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-19", franja: "manana" }, c)).contenido);
  assert.equal(r.estado, "aceptado");
  assert.equal(r.entrega, "retira en el depósito el lunes 19 de octubre, de 10 a 12");
  assert.match(r.que_decir, /pasa a retirarlo por el depósito \(Cucha Cucha 2345, CABA\), y que venga con su vehículo y gente para cargarlo/);
  assert.match(r.que_decir, /DNI de frente y de dorso/);
  assert.ok(!/camioneta/.test(r.que_decir));
  assert.deepEqual(c.ficha.alquiler?.aceptado?.franja, { tipo: "deposito_manana" });
  assert.match(c.mundo.avisos.at(-1)!.texto, /retira en el depósito \(Cucha Cucha 2345, CABA\) el lunes 19 de octubre, de 10 a 12/);
  // La devolución: en el depósito, con 24 h, sin dirección de la obra.
  // Volver a aceptar para mañana a las 10 (jueves 10:30): no llega a las 24 h; la tarde sí.
  const pronto = JSON.parse((await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-16", franja: "manana" }, c)).contenido);
  assert.equal(pronto.estado, "fecha_no_va");
  assert.match(pronto.motivo, /24 h de anticipación/);
  assert.equal(pronto.proxima, "viernes 16 de octubre, de 13 a 16");
  assert.match(pronto.que_decir, /24 h de anticipación/);
  const dev = await ejecutarHerramientaSofia("pedir_retiro", { fecha: "2026-10-20", franja: "tarde" }, c);
  const o = JSON.parse(dev.contenido);
  assert.equal(o.estado, "anotado");
  assert.equal(o.devolucion, "martes 20 de octubre, de 13 a 16");
  assert.match(o.que_decir, /traiga desarmado al depósito/);
  assert.ok(!/camión|choferes/.test(o.que_decir));
  assert.match(c.mundo.avisos.at(-1)!.texto, /devuelve el andamio del alquiler simple #1042 en el depósito/);
  assert.equal(c.mundo.avisos.at(-1)!.titulo, "WhatsApp de clientes · devuelve en el depósito");
  assert.equal(detectarPlata(dev.contenido).bloquea, false);
});

test("leerFicha: el alquiler del formato viejo (17/10) se completa sin perder nada", () => {
  const f = leerFicha({ trabajo: "alquiler_simple", alquiler: { sabePiezas: true, piezas: [{ descripcion: "tablón", cantidad: 4 }], dias: 30, entrega: "envio", barrio: "Caballito", notas: null } }, null);
  assert.equal(f.alquiler?.barrio, "Caballito");
  assert.deepEqual(f.alquiler?.piezas, [{ descripcion: "tablón", cantidad: 4 }]);
  assert.equal(f.alquiler?.pedido, null);
  assert.equal(f.alquiler?.documentos, null);
  assert.deepEqual(f.alquiler?.porQueNo, []);
  assert.equal(f.alquiler?.aceptado, null);
  // Un pedido guardado a medias se completa con los valores vacíos.
  const g = leerFicha({ alquiler: { pedido: { alturaTrabajo: 4 } } }, null);
  assert.equal(g.alquiler?.pedido?.alturaTrabajo, 4);
  assert.deepEqual(g.alquiler?.pedido?.piezasFueraDeCatalogo, []);
  assert.equal(g.alquiler?.pedido?.lugar, null);
  assert.equal(g.alquiler?.pedido?.retiraEnDeposito, null);
  // Un pedido de antes del 12/11 a la tarde: `aceptaPeldano` pasa a aceptaPlataforma.
  const v = leerFicha({ alquiler: { pedido: { alturaTecho: 3, aceptaPeldano: true } } }, null);
  assert.equal(v.alquiler?.pedido?.aceptaPlataforma, true);
  assert.ok(!("aceptaPeldano" in (v.alquiler?.pedido ?? {})));
});

// ── La aceptación, los documentos y el retiro ──────────────────────────────────────────

const PRESUPUESTO = { numero: 1042, estado: "aprobada", entrega: { fecha: "2026-10-16", franja: { tipo: "manana" as const } }, ordenAlquiler: { id: 777, nombre: "S03100" } };

test("cliente_acepta_alquiler: sólo con el presupuesto ya enviado; primero el precio, después los requisitos", async () => {
  const sin = JSON.parse((await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-16", franja: "manana" }, contexto())).contenido);
  assert.equal(sin.estado, "sin_presupuesto");

  const c = contexto();
  c.mundo.presupuestoAlquiler = { ...PRESUPUESTO, estado: "pendiente" };
  const espera = JSON.parse((await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-16", franja: "manana" }, c)).contenido);
  assert.equal(espera.estado, "presupuesto_en_camino");
  assert.equal(c.ficha.alquiler, null, "no se anota la aceptación ni se piden documentos");

  // Aprobado pero sin mandar (la ventana estaba cerrada): el precio no le llegó, no se aceptan ni se piden documentos.
  c.mundo.presupuestoAlquiler = { ...PRESUPUESTO, estado: "falta_plantilla" };
  const sinMandar = JSON.parse((await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-19", franja: "manana" }, c)).contenido);
  assert.equal(sinMandar.estado, "presupuesto_en_camino");
  assert.doesNotMatch(sinMandar.que_decir, /pedile los documentos/i);
  assert.equal(c.ficha.alquiler, null);
  assert.equal(c.mundo.avisos.length, 1);
  assert.match(c.mundo.avisos[0].texto, /no le llegó \(faltaba la plantilla\).*mandalo desde la tarjeta/);

  c.mundo.presupuestoAlquiler = { ...PRESUPUESTO, estado: "rechazada" };
  assert.equal(JSON.parse((await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-16", franja: "manana" }, c)).contenido).estado, "presupuesto_no_salio");
});

test("cliente_acepta_alquiler: anota el día, avisa al equipo una vez y pide los documentos", async () => {
  const c = contexto();
  c.mundo.presupuestoAlquiler = PRESUPUESTO;
  const r = await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-19", franja: "manana" }, c);
  const o = JSON.parse(r.contenido);
  assert.equal(o.estado, "aceptado");
  assert.equal(o.entrega, "lunes 19 de octubre, de 8 a 12");
  assert.match(o.que_decir, /DNI de frente y de dorso/);
  assert.match(o.que_decir, /sin los documentos no se entrega/);
  assert.match(o.documentos, /falta la foto del DNI de frente/);
  assert.equal(detectarPlata(r.contenido).bloquea, false);
  assert.deepEqual(c.ficha.alquiler?.aceptado, { at: "2026-10-15T13:30:00.000Z", presupuesto: 1042, fecha: "2026-10-19", franja: { tipo: "manana" } });
  assert.ok(c.ficha.alquiler?.documentos);
  assert.equal(c.mundo.avisos.length, 1);
  assert.match(c.mundo.avisos[0].texto, /aceptó el alquiler simple #1042 \(S03100\): entrega el lunes 19 de octubre, de 8 a 12\. El presupuesto decía el viernes 16 de octubre, de 8 a 12: cambiala en la orden S03100/);
  await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-19", franja: "manana" }, c);
  assert.equal(c.mundo.avisos.length, 1, "la misma aceptación no avisa dos veces");
});

test("cliente_acepta_alquiler: domingo, feriado o una franja que cambia el precio no se anotan", async () => {
  const c = contexto();
  c.mundo.presupuestoAlquiler = PRESUPUESTO;
  const dom = JSON.parse((await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-18", franja: "manana" }, c)).contenido);
  assert.equal(dom.estado, "fecha_no_va");
  assert.match(dom.motivo, /domingo/);
  assert.equal(dom.proxima, "lunes 19 de octubre, de 8 a 12");
  c.mundo.feriados = ["2026-10-19"];
  assert.match(JSON.parse((await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-19", franja: "tarde" }, c)).contenido).motivo, /feriado/);
  const hora = JSON.parse((await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-20", franja: "hora_particular", hora_desde: "10" }, c)).contenido);
  assert.equal(hora.estado, "cambia_el_presupuesto");
  assert.match(hora.que_hacer, /cotizar_alquiler_simple/);
  assert.equal(c.ficha.alquiler, null);
});

test("revisar_documentos: sólo después de aceptar; uno solo servicio si no tiene dos", async () => {
  assert.equal(JSON.parse((await ejecutarHerramientaSofia("revisar_documentos", {}, contexto())).contenido).estado, "no_corresponde");
  const c = contexto();
  c.mundo.presupuestoAlquiler = PRESUPUESTO;
  await ejecutarHerramientaSofia("cliente_acepta_alquiler", { fecha: "2026-10-19", franja: "manana" }, c);
  const docs = c.ficha.alquiler!.documentos!;
  const doc = (hiloId: string, tipo: "dni_frente" | "dni_dorso" | "servicio", servicio: string | null = null) => ({
    hiloId, path: `p/${hiloId}`, mime: "image/jpeg", nombre: "f.jpg", tipo, legible: true, titular: "Marcela Ríos", servicio, direccion: tipo === "servicio" ? "Gorriti 4500" : null, leidoAt: "x", error: null,
  });
  docs.recibidos.push(doc("a", "dni_frente"), doc("b", "dni_dorso"), doc("c", "servicio", "luz"));
  const r1 = JSON.parse((await ejecutarHerramientaSofia("revisar_documentos", {}, c)).contenido);
  assert.equal(r1.estado, "faltan");
  assert.match(r1.faltan[0], /otro servicio/);
  assert.ok(!r1.detalle.includes("Gorriti") && !r1.detalle.includes("Marcela"), "Tomás no ve los datos");
  const r2 = JSON.parse((await ejecutarHerramientaSofia("revisar_documentos", { solo_tiene_un_servicio: true }, c)).contenido);
  assert.equal(r2.estado, "completos");
  assert.equal(docs.unSoloServicio, true);
});

test("validarRetiro: 24 h hasta el comienzo de la franja, nunca el mismo día, ni domingos ni feriados, sábados de 8 a 12", () => {
  const ahora = new Date("2026-10-15T13:30:00Z"); // jueves 10:30 en Buenos Aires
  const hoy = "2026-10-15";
  assert.equal(validarRetiro(hoy, { tipo: "tarde" }, ahora, hoy, []).motivo, "hoy");
  const manana = validarRetiro("2026-10-16", { tipo: "manana" }, ahora, hoy, []);
  assert.equal(manana.motivo, "anticipacion");
  assert.deepEqual(manana.proxima, { fecha: "2026-10-16", franja: { tipo: "tarde" } });
  assert.equal(validarRetiro("2026-10-16", { tipo: "tarde" }, ahora, hoy, []).ok, true);
  const sabado = validarRetiro("2026-10-17", { tipo: "tarde" }, ahora, hoy, []);
  assert.equal(sabado.motivo, "sabado_tarde");
  assert.deepEqual(sabado.proxima, { fecha: "2026-10-17", franja: { tipo: "manana" } });
  assert.equal(validarRetiro("2026-10-18", { tipo: "manana" }, ahora, hoy, []).motivo, "domingo");
  assert.equal(validarRetiro("2026-10-19", { tipo: "manana" }, ahora, hoy, ["2026-10-19"]).motivo, "feriado");
  // Una hora particular: las 24 h se miden hasta esa hora.
  assert.equal(validarRetiro("2026-10-16", { tipo: "hora", desde: 10 }, ahora, hoy, []).motivo, "anticipacion");
  assert.equal(validarRetiro("2026-10-16", { tipo: "hora", desde: 11 }, ahora, hoy, []).ok, true);
  // La devolución en el depósito: 24 h hasta las 10 o las 13, y nunca los sábados.
  const dep = validarRetiro("2026-10-16", { tipo: "deposito_manana" }, ahora, hoy, []);
  assert.equal(dep.motivo, "anticipacion");
  assert.match(dep.texto, /^La devolución en el depósito se coordina con 24 h/);
  assert.deepEqual(dep.proxima, { fecha: "2026-10-16", franja: { tipo: "deposito_tarde" } });
  assert.equal(validarRetiro("2026-10-17", { tipo: "deposito_manana" }, ahora, hoy, []).motivo, "sabado_deposito");
});

test("pedir_retiro: anota, avisa al equipo y le recuerda las condiciones", async () => {
  const c = contexto({ direccion: "Gorriti 4500" });
  const no = JSON.parse((await ejecutarHerramientaSofia("pedir_retiro", { fecha: "2026-10-16", franja: "manana" }, c)).contenido);
  assert.equal(no.estado, "fecha_no_va");
  assert.match(no.motivo, /24 h/);
  assert.equal(no.proxima, "viernes 16 de octubre, de 13 a 16");
  assert.equal(c.mundo.avisos.length, 0);

  const r = await ejecutarHerramientaSofia("pedir_retiro", { fecha: "2026-10-16", franja: "tarde" }, c);
  const o = JSON.parse(r.contenido);
  assert.equal(o.estado, "anotado");
  assert.match(o.que_decir, /desarmado/);
  assert.match(o.que_decir, /gente para subirlo/);
  assert.match(o.que_decir, /sigue corriendo/);
  assert.equal(detectarPlata(r.contenido).bloquea, false);
  assert.equal(c.ficha.alquiler?.retiro?.fecha, "2026-10-16");
  assert.equal(c.mundo.avisos.length, 1);
  assert.match(c.mundo.avisos[0].texto, /pide el retiro.*viernes 16 de octubre, de 13 a 16.*Gorriti 4500/);
  assert.equal(r.efecto, undefined, "la charla sigue con Tomás");

  const sinDir = JSON.parse((await ejecutarHerramientaSofia("pedir_retiro", { fecha: "2026-10-19", franja: "manana" }, contexto())).contenido);
  assert.equal(sinDir.estado, "faltan_datos");
});

test("ningún resultado del alquiler simple, en ningún caso, trae plata", async () => {
  const resultados: string[] = [];
  const correr = async (n: string, i: unknown, c = contexto({ nombre: "A" })) => resultados.push((await ejecutarHerramientaSofia(n, i, c)).contenido);
  await correr("cotizar_alquiler_simple", PALERMO);
  await correr("cotizar_alquiler_simple", { ...PALERMO, franja: "hora_particular", hora_desde: "9:30" });
  await correr("cotizar_alquiler_simple", { ...PALERMO, altura_trabajo_m: 2, torres: 1 });
  await correr("cotizar_alquiler_simple", { ...PALERMO, altura_trabajo_m: 9 });
  await correr("cotizar_alquiler_simple", { ...PALERMO, piezas: { modulos_por_torre: 1, con_baranda: false, tablones_por_torre: 2 } });
  await correr("cotizar_alquiler_simple", { ...PALERMO, ancho_libre_m: 0.5, espacio_de_sobra: false, largo_libre_m: 3 });
  const c = contexto();
  c.mundo.presupuestoAlquiler = PRESUPUESTO;
  await correr("cliente_acepta_alquiler", { fecha: "2026-10-19", franja: "manana" }, c);
  await correr("revisar_documentos", {}, c);
  await correr("pedir_retiro", { fecha: "2026-10-20", franja: "manana" }, c);
  for (const t of resultados) {
    assert.equal(detectarPlata(t).bloquea, false, t);
    assert.ok(!/\$|\d{2,3}\.\d{3}/.test(t), t);
  }
});
