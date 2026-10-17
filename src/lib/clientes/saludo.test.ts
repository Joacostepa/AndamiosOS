import { test } from "node:test";
import assert from "node:assert/strict";
import { audioDiceElGuion, claveSaludoVoz, esContestadorAutomatico, esSoloSaludo, guionSaludoVoz, nombreParaSaludo, saludoDelMomento, saludoInicial, textoSeguridad } from "./saludo.ts";
import { detectarPlata } from "./filtro-salida.ts";

test("el saludo exacto que decidió JS, con y sin nombre", () => {
  const manana = new Date("2026-10-16T12:00:00Z"); // 9:00 en Buenos Aires
  assert.equal(saludoInicial("Carlos", manana), "¡Buen día Carlos! Acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
  assert.equal(saludoInicial(null, manana), "¡Buen día! Acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
  assert.equal(saludoInicial("Constructora Delta SRL", manana), "¡Buen día! Acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
});

const CON_NOMBRE: [string, string][] = [
  ["Carlos", "Carlos"],
  ["Carlos Gómez", "Carlos"],
  ["carlos gomez", "Carlos"],
  ["CARLOS GÓMEZ", "Carlos"],
  ["  María José  ", "María"],
  ["maría", "María"],
  ["Joaquin (Andamios Buenos Aires)", "Joaquin"],
  ["Joaquin (Andamios", "Joaquin"],
  ["Marcela Ríos (obra Los Aromos)", "Marcela"],
  ["Ing. Pablo Ferreyra", "Pablo"],
  ["Arq Lucía Sosa", "Lucía"],
  ["Dra. Marta", "Marta"],
  ["Don Hugo", "Hugo"],
  ["Ñato Pérez", "Ñato"],
  ["Iñaki", "Iñaki"],
  ["Jean-Pierre Dupont", "Jean-Pierre"],
  ["O'Higgins", "O'Higgins"],
  ["Ana", "Ana"],
  ["Luz Martínez", "Luz"],
  ["Sandra | ABA", "Sandra"],
  ["Rocío - Ventas", "Rocío"],
  ["Hugo / plomero", "Hugo"],
  ["Renata.", "Renata"],
];

for (const [perfil, esperado] of CON_NOMBRE) {
  test(`con nombre: «${perfil}» → ${esperado}`, () => assert.equal(nombreParaSaludo(perfil), esperado));
}

const SIN_NOMBRE: string[] = [
  "",
  "   ",
  "Constructora Delta SRL",
  "Construcciones Delta",
  "Delta S.A.",
  "Delta SA",
  "Kir Construcciones SRL",
  "Consorcio Las Lilas 400",
  "Administración Pérez",
  "Andamios Buenos Aires",
  "Andamios Gómez",
  "Inmobiliaria Norte",
  "Estudio Gómez Arquitectura",
  "Pinturería Rex",
  "Ferretería El Tornillo",
  "Grupo Sur",
  "Servicios Integrales",
  "Taller Mecánico",
  "Mamá",
  "mama",
  "Mamá Juana",
  "Papá",
  "Jefe",
  "La Jefa",
  "Abuela",
  "Mi amor",
  "Gordo",
  "Vecino",
  "Juan 🔨",
  "🔨 Juan",
  "❤️",
  "Juan2",
  "Carlos 1980",
  "11 5555-1234",
  "+54 9 11 5555 1234",
  "J",
  "J.",
  "JM",
  "J. Pérez",
  "Xkdj",
  "~",
  "...",
  "carlos.gomez",
  "Cliente",
  "WhatsApp Business",
  "Ventas",
  "Info",
];

for (const perfil of SIN_NOMBRE) {
  test(`sin nombre: «${perfil}»`, () => assert.equal(nombreParaSaludo(perfil), null));
}

test("null y undefined", () => {
  assert.equal(nombreParaSaludo(null), null);
  assert.equal(nombreParaSaludo(undefined), null);
});



test("esSoloSaludo: los saludos solos sí, cualquier pedido no", () => {
  for (const t of ["Hola", "hola!!", "Buenas", "Buenas tardes", "buen día", "Hola, buenas", "Hola buenas tardes", "Holaaa", "que tal", "Hola, ¿cómo estás?", "buenas buenas"]) {
    assert.equal(esSoloSaludo(t), true, t);
  }
  for (const t of ["Hola, necesito una bandeja", "Buenas, cuánto sale?", "hola quiero hablar con alguien", "", "👍", "Los Aromos 1234"]) {
    assert.equal(esSoloSaludo(t), false, t);
  }
});

test("los textos fijos no hablan de plata (salen sin filtro, pero igual)", () => {
  for (const t of [saludoInicial("Carlos"), saludoInicial(null), textoSeguridad(null)]) assert.equal(detectarPlata(t).bloquea, false, t);
});

test("seguridad: con el teléfono de guardia, o el 911 si todavía no se cargó", () => {
  assert.match(textoSeguridad("11 2734 4214"), /llamá al 11 2734 4214\.$/);
  assert.match(textoSeguridad(""), /911/);
});

test("buen día, buenas tardes o buenas noches según la hora de Buenos Aires", () => {
  const ba = (hhmm: string) => new Date(`2026-10-16T${hhmm}:00-03:00`);
  assert.equal(saludoDelMomento(ba("05:00")), "Buen día");
  assert.equal(saludoDelMomento(ba("12:59")), "Buen día");
  assert.equal(saludoDelMomento(ba("13:00")), "Buenas tardes");
  assert.equal(saludoDelMomento(ba("19:59")), "Buenas tardes");
  assert.equal(saludoDelMomento(ba("20:00")), "Buenas noches");
  assert.equal(saludoDelMomento(ba("02:30")), "Buenas noches");
  assert.equal(saludoInicial("Joaquin", ba("21:15")), "¡Buenas noches Joaquin! Acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
});

test("esContestadorAutomatico: las respuestas automáticas de otros números (análisis de chats, D5)", () => {
  for (const t of [
    "Gracias por comunicarte con Administración Pérez. En breve te respondemos.",
    "¡Hola! Gracias por contactarnos. Nuestro horario de atención es de lunes a viernes de 9 a 18 hs.",
    "En este momento no estamos disponibles. Te responderemos a la brevedad.",
    "Este es un mensaje automático, por favor no responda.",
  ]) assert.equal(esContestadorAutomatico(t), true, t);
  for (const t of ["Hola, necesito una bandeja", "gracias!", "Gracias por la info, lo hablo con el consorcio", "en este momento estoy en la obra"]) {
    assert.equal(esContestadorAutomatico(t), false, t);
  }
});

test("el guion del audio (el texto del audio de JS, 17/10): con el nombre o sin nombre, a cualquier hora", () => {
  assert.equal(guionSaludoVoz("Jorge Pérez"), "Hola, Jorge, acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
  assert.equal(guionSaludoVoz("maría josé"), "Hola, María, acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
  assert.equal(guionSaludoVoz("Constructora Delta SRL"), "Hola, acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
  assert.equal(guionSaludoVoz(null), "Hola, acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
});

test("cada audio se guarda por nombre", () => {
  assert.equal(claveSaludoVoz("Jorge Pérez"), "jorge");
  assert.equal(claveSaludoVoz("JORGE"), "jorge");
  assert.equal(claveSaludoVoz("Rocío"), "rocio");
  assert.equal(claveSaludoVoz("Iñaki"), "inaki");
  assert.equal(claveSaludoVoz("Jean-Pierre"), "jean-piere", "las letras dobles se juntan (normalizar): suena igual");
  assert.equal(claveSaludoVoz("Constructora Delta SRL"), "sin-nombre");
});

test("audioDiceElGuion: tolera puntuación y una palabra de relleno, nunca los nombres", () => {
  const g = "Hola, Jorge, acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar.";
  assert.ok(audioDiceElGuion(g, "Hola, Jorge. Acá Tomás, de Andamios Buenos Aires. Contame en qué te puedo ayudar", "Jorge"));
  assert.ok(audioDiceElGuion(g, "hola jorge aca tomas de andamios buenos aires contame que te puedo ayudar", "Jorge"), "falta «en»");
  assert.ok(!audioDiceElGuion(g, "Hola, José. Acá Tomás, de Andamios Buenos Aires. Contame, ¿qué tipo de obra?", "Jorge"), "a 3 metros entendía «José»");
  assert.ok(!audioDiceElGuion(g, "Hola, Jorge, acá Tomás de Andami Buenos Aires. Contame en qué te puedo ayudar", "Jorge"), "se comió una sílaba");
  assert.ok(!audioDiceElGuion(g, "Hola, acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar", "Jorge"), "sin el nombre del cliente");
  assert.ok(!audioDiceElGuion(g, "Hola, Jorge, acá de Andamios Buenos Aires. Contame en qué te puedo ayudar", "Jorge"), "sin Tomás");
  assert.ok(!audioDiceElGuion(g, "", "Jorge"));
  assert.ok(!audioDiceElGuion(g, null, "Jorge"));
});
