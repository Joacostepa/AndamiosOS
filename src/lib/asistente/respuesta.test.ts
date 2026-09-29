// Mostrar una respuesta que buscó en internet (JS, 28/09): el texto partido por las fuentes,
// las páginas citadas y las búsquedas que fallaron.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fuentesDeRespuesta, resultadoWebConError, textoDeRespuesta } from "./respuesta.ts";

const texto = (text: string, citations?: unknown[]) => ({ type: "text", text, ...(citations ? { citations } : {}) });

test("el texto partido por las fuentes se pega sin cortar la oración", () => {
  const bloques = [
    { type: "thinking", thinking: "" },
    texto("El CAC de agosto de 2026 "),
    texto("subió 2,1 % en el mes", [{ type: "web_search_result_location", url: "https://www.camarco.org.ar/indicadores", title: "Indicadores CAMARCO" }]),
    texto(", según la CAMARCO."),
  ];
  assert.equal(textoDeRespuesta(bloques), "El CAC de agosto de 2026 subió 2,1 % en el mes, según la CAMARCO.");
});

test("lo que viene después de una búsqueda es otro párrafo", () => {
  const bloques = [
    texto("Busco el índice."),
    { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "CAC agosto 2026" } },
    { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
    texto("Encontré el dato."),
  ];
  assert.equal(textoDeRespuesta(bloques), "Busco el índice.\n\nEncontré el dato.");
});

test("una respuesta de siempre (texto y herramienta) queda igual", () => {
  assert.equal(textoDeRespuesta([texto("Miro la S01557."), { type: "tool_use", id: "t1", name: "ver_presupuesto", input: {} }]), "Miro la S01557.");
  assert.equal(textoDeRespuesta([{ type: "tool_use", id: "t1", name: "x", input: {} }]), "");
});

test("fuentes: una vez cada página, con el título o el sitio", () => {
  const bloques = [
    texto("a", [{ url: "https://www.indec.gob.ar/ipc", title: "IPC — INDEC" }, { url: "https://www.indec.gob.ar/ipc", title: "IPC — INDEC" }]),
    texto("b", [{ url: "https://www.camarco.org.ar/x", title: "  " }, { type: "char_location", document_title: "sin url" }]),
  ];
  assert.deepEqual(fuentesDeRespuesta(bloques), [
    { url: "https://www.indec.gob.ar/ipc", titulo: "IPC — INDEC" },
    { url: "https://www.camarco.org.ar/x", titulo: "camarco.org.ar" },
  ]);
  assert.deepEqual(fuentesDeRespuesta([texto("sin citas")]), []);
});

test("una búsqueda que falló se marca; una que anduvo, no", () => {
  assert.equal(resultadoWebConError({ type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "unavailable" } }), true);
  assert.equal(resultadoWebConError({ type: "web_fetch_tool_result", content: { type: "web_fetch_tool_error", error_code: "url_not_accessible" } }), true);
  assert.equal(resultadoWebConError({ type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://x" }] }), false);
  assert.equal(resultadoWebConError({ type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://x" } }), false);
});
