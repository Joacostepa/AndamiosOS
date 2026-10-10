import { HojaPublica } from "./hoja-publica";

// /h/<token>: la hoja del capataz o los viajes del chofer, sin usuario. La página no lee
// nada en el servidor a propósito: la vista la pide el teléfono (GET /api/public/hoja/<token>,
// que es lo que marca "Abierta"), así la vista previa del link en Telegram no la marca.

export default async function HojaLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <HojaPublica token={token} />;
}
