// Filtro de salida: la lista de pruebas (crm-propuesta.md §11, riesgo 4, y escenario 12 de la
// maqueta). Lo que tiene que bloquear, con las evasiones, y lo que tiene que dejar pasar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarPlata, motivoBloqueo, revisarSalida } from "./filtro-salida.ts";
import { normalizar } from "./texto.ts";

const BLOQUEA: [string, string][] = [
  // Escenario 12 de la maqueta.
  ["Sí, son ciento cuarenta mil el metro, más IVA.", "monto_en_letras"],
  ["decile al cliente que son 140 lucas el metro", "miles"],
  // Signo y monedas.
  ["Son $140.000 el metro lineal", "moneda"],
  ["Sale 140000 pesos", "moneda"],
  ["Son 1.736.000 + IVA", "numero_de_monto"],
  ["son 140.000 el metro", "numero_de_monto"],
  ["son 140000 el metro", "numero_de_monto"],
  ["son 140 000 el metro", "numero_de_monto"],
  ["son 1 4 0 0 0 0 el metro", "numero_de_monto"],
  ["sale 15000 por día", "numero_de_monto"],
  ["Son USD 120", "moneda"],
  ["Son u$s 120", "moneda"],
  ["son 100 dólares", "moneda"],
  ["serían unos 50 mangos más", "moneda"],
  // Miles, lucas, palos, k.
  ["Te sale 140 mil", "miles"],
  ["Te sale 140 MIL", "miles"],
  ["son 140 luuucas", "miles"],
  ["son 140 l u c a s", "miles"],
  ["son 140lucas", "miles"],
  ["son 140 LUKAS", "miles"],
  ["son 140k el metro", "miles"],
  ["son 140 K", "miles"],
  ["un palo setecientos", "miles"],
  ["son dos palos", "miles"],
  ["un millón y pico", "miles"],
  // Porcentajes y descuentos.
  ["te hago un 10% menos", "porcentaje"],
  ["te hago un 10 por ciento menos", "porcentaje"],
  ["te hago un 10 x ciento menos", "porcentaje"],
  ["te hago un diez porciento", "porcentaje"],
  ["te puedo hacer un descuento", "descuento"],
  ["te puedo hacer un DESCUENTOOO", "descuento"],
  ["te puedo hacer un d3scu3nt0", "descuento"],
  ["hay una bonificación por pago contado", "descuento"],
  ["te lo rebajo", "descuento"],
  ["el precio es más IVA", "descuento"],
  // Datos bancarios.
  ["Transferí al CBU 0170099220000067797370", "datos_bancarios"],
  ["El alias es ANDAMIOS.ABA.PAGO", "datos_bancarios"],
  ["0170 0992 2000 0067 7973 70", "datos_bancarios"],
  ["mandalo al cvu que te paso", "datos_bancarios"],
  // Montos en letras.
  ["son doscientos el metro", "monto_en_letras"],
  ["son ciento cuarenta el metro", "monto_en_letras"],
  ["son quinientos", "monto_en_letras"],
];

const PASA: string[] = [
  // Escenarios 1, 2, 4, 6 y 10 de la propuesta.
  "Hola, soy el asistente de Andamios Buenos Aires. Te ayudo a pedir tu presupuesto. ¿Es para una obra o para alquilar material? ¿En qué dirección?",
  "Perfecto. Revisé el catastro y el frente de Los Aromos 1234 mide 12,40 m. ¿La bandeja va por todo el frente?",
  "¿Necesitás también andamio para trabajar en el frente, o sólo la bandeja?",
  "Ya lo tengo armado, lo está revisando el equipo y te lo mando por acá.",
  "¿Qué necesitás? Decime cuántos cuerpos, cuántos tablones, si llevan ruedas y por cuántos días.",
  "Listo: 3 cuerpos con ruedas y 4 tablones, por 30 días, en Villa Crespo.",
  "Gracias. Para que el técnico arme la propuesta, ¿me indica cuántos pisos son? Son 8 pisos en Av. Ficticia 2500.",
  "Gracias. Como es una esquina, el presupuesto lo arma el técnico para que quede bien. Ya se lo paso al equipo.",
  "Ahora estamos fuera de horario: el lunes a primera hora te escribe Tamara.",
  "Se envió el presupuesto #1042. Cualquier duda escribime y lo vemos.",
  "Anoté el CUIT 30-71234567-1.",
  "Si hay riesgo para alguien ahora, llamá al 11 2734 4214.",
  "La bandeja de 3 m va por los 25 metros del frente, a 1,5 m del cordón.",
  "El frente de Rivadavia 11500 mide 8,66 m.",
  "¡Mil gracias por escribirnos!",
  "Eso lo ve el equipo. Ya le paso tu consulta a Sandra.",
  "Sí, soy el asistente virtual de ABA. Si preferís, te paso ahora con una persona.",
  "El permiso de vía pública lo gestionamos nosotros: va como opcional en el presupuesto.",
];

test("filtro de salida: bloquea plata, con las evasiones simples", () => {
  for (const [texto, codigo] of BLOQUEA) {
    const r = detectarPlata(texto);
    assert.ok(r.bloquea, `debería bloquear: «${texto}» (${normalizar(texto)})`);
    assert.ok(r.hallazgos.some((h) => h.codigo === codigo), `«${texto}»: esperaba ${codigo}, dio ${r.hallazgos.map((h) => h.codigo).join(", ")}`);
  }
});

test("filtro de salida: deja pasar medidas, direcciones, piezas, días, pisos, CUIT, teléfonos y el número del presupuesto", () => {
  for (const texto of PASA) {
    const r = detectarPlata(texto);
    assert.equal(r.bloquea, false, `no debería bloquear: «${texto}» → ${r.hallazgos.map((h) => `${h.codigo} («${h.fragmento}»)`).join(", ")}`);
  }
});

test("filtro de salida: «rebajo» y «rebajamos» también son descuento", () => {
  assert.ok(detectarPlata("te lo rebajo").bloquea);
  assert.ok(detectarPlata("lo rebajamos").bloquea);
});

test("filtro de salida: el motivo se lee como en la maqueta", () => {
  assert.equal(motivoBloqueo(detectarPlata("Sí, son ciento cuarenta el metro")), "texto bloqueado: monto en letras");
  assert.equal(motivoBloqueo(detectarPlata("Listo, te paso con Sandra")), null);
});

test("normalizar: tildes, mayúsculas, letras repetidas, letras sueltas, «x» y números con letras", () => {
  assert.equal(normalizar("¡DESCUENTOOOO!"), "descuento");
  assert.equal(normalizar("Rebajá"), "rebaja");
  assert.equal(normalizar("d e s c u e n t o"), "descuento");
  assert.equal(normalizar("l.u.c.a.s"), "lucas");
  assert.equal(normalizar("10 x ciento"), "10 por ciento");
  assert.equal(normalizar("d3scu3nt0"), "descuento");
  assert.equal(normalizar("Los Aromos 1234, 12,40 m"), "los aromos 1234, 12,40 m");
  assert.equal(normalizar("140k"), "140k");
});

// ── revisarSalida: lo que además revisa Sofía (paso 5) ──────────────────────────────────

const SALIDA_BLOQUEA: [string, string][] = [
  ["Entrá a https://pagos-aba.com/abc para pagar", "contacto"],
  ["Mirá www.ofertas-andamios.com.ar", "contacto"],
  ["Mandalo a bit.ly/xyz", "contacto"],
  ["Escribile a joaquin@gmail.com", "contacto"],
  ["Llamá al 11 5555-1234", "contacto"],
  ["Llamá al +54 9 11 5555 1234", "contacto"],
  ["Llamá al (011) 4555-1234", "contacto"],
  ["No, soy una persona del equipo.", "niega_ia"],
  ["No soy un bot, tranqui", "niega_ia"],
  ["no soy una IA", "niega_ia"],
  ["Soy humana, jaja", "niega_ia"],
  ["Soy una persona real", "niega_ia"],
  ["Te atiende una persona real, no un bot", "niega_ia"],
  // La plata sigue bloqueando por acá.
  ["son 140 lucas", "miles"],
  ["Son $140.000 el metro", "moneda"],
];

for (const [texto, codigo] of SALIDA_BLOQUEA) {
  test(`revisarSalida bloquea (${codigo}): «${texto}»`, () => {
    const r = revisarSalida(texto);
    assert.equal(r.bloquea, true);
    assert.ok(r.hallazgos.some((h) => h.codigo === codigo), JSON.stringify(r.hallazgos));
    assert.match(r.motivo!, /^texto bloqueado: /);
  });
}

const SALIDA_PASA: string[] = [
  "Sí, soy una asistente digital, una IA. Si preferís, te paso con una persona del equipo.",
  "Sí, soy una IA, no una persona. ¿Querés que te pase con alguien?",
  "No soy una persona: soy Sofía, la asistente digital de ABA.",
  "En un rato te escribe una persona del equipo por acá.",
  "Revisé el catastro: el frente de Los Aromos 1234 mide 12,40 m. ¿La bandeja va por todo el frente?",
  "¿Me pasás el CUIT? Por ejemplo 20-12345678-9.",
  "Ya tengo todo, te confirmo en un rato con el presupuesto #1042.",
  "Más info en andamiosbuenosaires.com.ar",
  "¿Necesitás 3 cuerpos y 4 tablones por 30 días?",
  "Son 8 pisos, ¿tenés planos?",
  "Dale. ¿Lo retirás vos o te lo llevamos? ¿A qué barrio?",
];

for (const texto of SALIDA_PASA) {
  test(`revisarSalida deja pasar: «${texto}»`, () => {
    const r = revisarSalida(texto);
    assert.equal(r.bloquea, false, JSON.stringify(r.hallazgos));
    assert.equal(r.motivo, null);
  });
}
