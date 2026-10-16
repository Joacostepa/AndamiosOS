import { test } from "node:test";
import assert from "node:assert/strict";
import { esSoloSaludo, nombreParaSaludo, saludoDelMomento, saludoInicial, textoSeguridad } from "./saludo.ts";
import { detectarPlata } from "./filtro-salida.ts";

test("el saludo exacto que decidió JS, con y sin nombre", () => {
  const manana = new Date("2026-10-16T12:00:00Z"); // 9:00 en Buenos Aires
  assert.equal(saludoInicial("Carlos", manana), "¡Buen día Carlos! Acá Sofía, asistente digital de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
  assert.equal(saludoInicial(null, manana), "¡Buen día! Acá Sofía, asistente digital de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
  assert.equal(saludoInicial("Constructora Delta SRL", manana), "¡Buen día! Acá Sofía, asistente digital de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
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

test("el saludo nunca dice «virtual» y dice que es asistente digital (decisión 17)", () => {
  const s = saludoInicial("Carlos");
  assert.ok(!/virtual/i.test(s));
  assert.match(s, /asistente digital/);
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
  assert.equal(saludoInicial("Joaquin", ba("21:15")), "¡Buenas noches Joaquin! Acá Sofía, asistente digital de Andamios Buenos Aires. Contame en qué te puedo ayudar.");
});
