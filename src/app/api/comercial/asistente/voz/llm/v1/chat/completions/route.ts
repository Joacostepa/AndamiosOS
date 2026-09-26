// Mismo endpoint con /v1 en el medio: según cómo se cargue la URL del LLM propio en ElevenLabs
// (con o sin /v1), el pedido llega a una u otra ruta. Las dos hacen lo mismo.
//
// La configuración de la ruta (dynamic, maxDuration) tiene que estar escrita acá: Next la lee
// del archivo al compilar y no acepta que se re-exporte.

export { POST } from "../../../chat/completions/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
