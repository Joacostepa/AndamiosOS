// «Copiar para Slack»: el texto con los datos, el servicio, los archivos y la charla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { alquilerVacio, fichaSofiaVacia, type FichaSofia } from "./herramientas.ts";
import { claseArchivo, fechaHora, textoParaSlack, type DatosSlack } from "./para-slack.ts";
import type { ItemHilo } from "./vista.ts";

let n = 0;
const item = (x: Partial<ItemHilo>): ItemHilo => ({
  id: `h${++n}`, direccion: "entrante", autor: "cliente", autorNombre: null, tipo: "text", texto: null, adjunto: null,
  transcripcion: null, estado: "recibido", errorCodigo: null, errorDetalle: null, momento: "2026-11-12T13:05:00Z", ...x,
});

function datos(ficha: Partial<FichaSofia>, items: ItemHilo[], links = new Map<string, string>()): DatosSlack {
  return {
    charla: { telefono: "5491155551234", nombre: "Oscar Gómez", estado: "humano", motivo: null, asistente: { id: "u1", nombre: "Débora" }, createdAt: "2026-11-12T13:00:00Z" },
    ficha: { ...fichaSofiaVacia(), ...ficha },
    pareja: { tecnico: "Martín", asistente: "Débora" },
    items,
    links,
    vencen: new Date("2026-12-12T13:00:00Z"),
  };
}

test("fechaHora: en hora de Buenos Aires, aunque el servidor esté en UTC", () => {
  assert.equal(fechaHora("2026-11-12T13:05:00Z"), "12/11 10:05");
});

test("claseArchivo: foto, PDF, video, audio y lo demás", () => {
  assert.equal(claseArchivo("image", "image/jpeg"), "Foto");
  assert.equal(claseArchivo("document", "application/pdf"), "PDF");
  assert.equal(claseArchivo("video", null), "Video");
  assert.equal(claseArchivo("audio", "audio/ogg"), "Audio");
  assert.equal(claseArchivo("document", "application/zip"), "Archivo");
});

test("textoParaSlack: datos del cliente, el servicio, la pareja, los archivos con link y la charla", () => {
  const foto = item({ tipo: "image", texto: "así está el patio", adjunto: { tipo: "archivo", mime: "image/jpeg", nombre: "a.jpg", url: "/api/x", pendiente: false, error: null }, momento: "2026-11-12T13:07:00Z" });
  const pdf = item({ tipo: "document", adjunto: { tipo: "archivo", mime: "application/pdf", nombre: "dni.pdf", url: null, pendiente: true, error: null }, momento: "2026-11-12T13:09:00Z" });
  const items = [
    item({ texto: "Hola, necesito un andamio" }),
    item({ direccion: "saliente", autor: "ia", texto: "¡Buen día Oscar! Acá Tomás.", estado: "leido", momento: "2026-11-12T13:06:00Z" }),
    foto,
    pdf,
    item({ tipo: "audio", adjunto: { tipo: "archivo", mime: "audio/ogg", nombre: "v.ogg", url: "/api/y", pendiente: false, error: null }, transcripcion: "son tres metros", momento: "2026-11-13T12:00:00Z" }),
    item({ direccion: "evento", autor: "persona", texto: "Débora tomó la charla.", momento: "2026-11-13T12:30:00Z" }),
    item({ direccion: "saliente", autor: "persona", autorNombre: "Débora", texto: "Te paso el presupuesto", estado: "error", momento: "2026-11-13T12:31:00Z" }),
  ];
  const ficha: Partial<FichaSofia> = {
    nombre: "Oscar Gómez", cuit: "20-12345678-9", tipoCliente: "particular", trabajo: "alquiler_simple", tarea: "pintar el patio",
    direccion: "Rosario 575", enCaba: true, banderas: ["descuento"],
    alquiler: {
      ...alquilerVacio(),
      pedido: {
        lugar: "afuera", alturaTrabajo: 4, trabajoEnTecho: false, alturaTecho: null, espacioDeSobra: true, anchoLibre: null, largoLibre: null, largoACubrir: null,
        torres: null, piso: "liso", piezas: null, piezasFueraDeCatalogo: [], montaje: false, anclar: false, paraHoy: false,
        fecha: "2026-11-24", franja: { tipo: "manana" }, dias: 7, aceptaPlataforma: null, retiraEnDeposito: null,
      },
      cotizacion: { numero: 1009, at: "2026-11-12T15:00:00Z", fecha: "2026-11-24", franja: { tipo: "manana" } },
    },
  };
  const t = textoParaSlack(datos(ficha, items, new Map([[foto.id, "https://x.supabase.co/firmado/a.jpg"], [items[4].id, "https://x.supabase.co/firmado/v.ogg"]])));

  assert.match(t, /^\*WhatsApp de clientes: Oscar Gómez\*/);
  assert.match(t, /• Teléfono: \+54 9 11 5555-1234/);
  assert.match(t, /• CUIT: 20-12345678-9/);
  assert.match(t, /• Es: Particular/);
  assert.match(t, /• Dirección: Rosario 575 \(CABA\)/);
  assert.match(t, /• Para qué: pintar el patio/);
  assert.match(t, /• Por cuántos días: 7 días \(precio de 30\)/);
  assert.match(t, /• Entrega: 24\/11\/2026, de 8 a 12/);
  assert.match(t, /• Presupuesto: N° 1009/);
  assert.match(t, /• Ojo: pide descuento o regatea/);
  assert.match(t, /• Técnico: Martín\n• Vendedora: Débora/);
  assert.match(t, /• La charla: La tiene Débora/);
  // Los archivos, numerados y con link; el que no bajó, avisado.
  assert.match(t, /1\. Foto de Oscar, 12\/11 10:07: https:\/\/x\.supabase\.co\/firmado\/a\.jpg/);
  assert.match(t, /2\. PDF de Oscar, 12\/11 10:09: \(todavía se está bajando\)/);
  assert.match(t, /3\. Audio de Oscar, 13\/11 09:00: https/);
  assert.match(t, /andan hasta el 12\/12/);
  // La charla: por día, con hora y quién.
  assert.match(t, /_jueves 12\/11_\n10:05 \*Oscar:\* Hola, necesito un andamio\n10:06 \*Tomás \(IA\):\* ¡Buen día Oscar!/);
  assert.match(t, /10:07 \*Oscar:\* \[Foto 1\] así está el patio/);
  assert.match(t, /_viernes 13\/11_\n09:00 \*Oscar:\* \[Audio 3\] \(dice: «son tres metros»\)/);
  assert.match(t, /09:30 · Débora tomó la charla\./);
  assert.match(t, /09:31 \*Débora \(ABA\):\* Te paso el presupuesto \(no le llegó\)/);
  // Lo vacío no aparece.
  assert.doesNotMatch(t, /Mail:|Visita:|Catastro:/);
});

test("textoParaSlack: sin ficha, con lo que hay (el perfil de WhatsApp) y sin secciones vacías", () => {
  const t = textoParaSlack(datos({}, [item({ texto: "hola" })]));
  assert.match(t, /• Nombre: Oscar Gómez \(perfil de WhatsApp\)/);
  assert.doesNotMatch(t, /\*El servicio\*/);
  assert.doesNotMatch(t, /\*Fotos y archivos\*/);
  assert.match(t, /\*La charla\*\n_jueves 12\/11_\n10:05 \*Oscar:\* hola/);
});
