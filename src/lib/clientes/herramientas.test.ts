// Las 7 herramientas de Sofía: lista cerrada, esquemas estrictos (ningún id de otro cliente) y
// resultados sin plata ni datos de otros (crm-propuesta.md §13).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOMBRES_HERRAMIENTAS, definicionesSofia, ejecutarHerramientaSofia, faltantesBandeja, fichaSofiaVacia, leerFicha, type ContextoHerramienta, type FichaSofia,
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

test("son exactamente las 7 de §13, en orden", () => {
  assert.deepEqual(NOMBRES_HERRAMIENTAS, [
    "anotar_ficha", "validar_cuit", "verificar_direccion", "preparar_cotizacion_facil", "preparar_pedido_simple", "pedir_tecnico", "derivar_a_persona",
  ]);
  assert.equal(definicionesSofia().length, 7);
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
  assert.equal(propio.efecto?.estado === "derivada" && propio.efecto.motivo, "Gama alta (multidireccional)");
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
