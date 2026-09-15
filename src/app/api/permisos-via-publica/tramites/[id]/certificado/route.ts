import { NextRequest, NextResponse, after } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, registrarEvento } from "@/lib/permisos-via-publica/endosos";
import { siListoPresentar } from "@/lib/permisos-via-publica/presentacion";

// POST /api/permisos-via-publica/tramites/:id/certificado  (multipart: archivo)
//
// "Subir certificado del CPAU": el PDF completo de la encomienda visada (registro + certificado
// + comprobante de pago), que hoy se baja a mano del Histórico de retp.cpau.org. Deja el
// documento `encomienda_cpau` del trámite listo y, si con eso está todo, pide la presentación
// (o avisa, en modo supervisado). No usa la revisión de la póliza: se controla que el PDF se
// lea y sea del CPAU. El proxy exige "editar".

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Tiene que ser un PDF" }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "El PDF pesa más de 4 MB" }, { status: 400 });

  const { data: auth } = await (await createClient()).auth.getUser();
  const db = createAdminClient();
  const { data: t } = await db.from("pvp_tramites").select("id").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "El trámite no existe" }, { status: 404 });

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let texto = "";
  try {
    texto = (await extractText(await getDocumentProxy(bytes.slice()), { mergePages: true })).text;
  } catch {
    // Un PDF que no se puede leer queda observado, pero se guarda.
  }
  const esDelCpau = /Encomienda de Tarea Profesional|Consejo Profesional de Arquitectura|CPAU/i.test(texto);
  const chequeos = [
    { clave: "lectura", ok: texto.trim().length > 50, bloquea: true, detalle: texto.trim().length > 50 ? "El PDF se lee." : "El PDF no tiene texto legible." },
    { clave: "cpau", ok: esDelCpau, bloquea: true, detalle: esDelCpau ? "Es un registro de encomienda del CPAU." : "No parece un registro de encomienda del CPAU." },
  ];
  const fallas = chequeos.filter((c) => !c.ok);

  const ahora = new Date().toISOString();
  const path = `tramites/${id}/encomienda_cpau-${Date.now()}.pdf`;
  const { error: e1 } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf" });
  if (e1) return NextResponse.json({ error: `No se pudo guardar: ${e1.message}` }, { status: 500 });

  const { data: previo } = await db.from("pvp_documentos").select("id, version").eq("tramite_id", id).eq("clave", "encomienda_cpau").maybeSingle();
  const valores = {
    estado: fallas.length ? "observado" : "ok",
    archivo_path: path, archivo_nombre: archivo.name, version: (previo?.version ?? 0) + 1,
    subido_por: "persona", subido_at: ahora, revisado_at: ahora, updated_at: ahora,
    observacion: fallas.length ? fallas.map((c) => c.detalle).join(" ") : null,
    revision: { modelo: null, leido: { subido_por: auth.user?.id ?? null }, chequeos },
  };
  const { error: e2 } = previo
    ? await db.from("pvp_documentos").update(valores).eq("id", previo.id)
    : await db.from("pvp_documentos").insert({ ...valores, tramite_id: id, clave: "encomienda_cpau", origen: "aba" });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  await registrarEvento(
    db, id, "encomienda_cpau",
    fallas.length ? `Se subió el certificado del CPAU, pero ${fallas.map((c) => c.detalle.toLowerCase()).join(" ")}` : `Se subió el certificado visado del CPAU (${archivo.name}).`,
    { path, por: auth.user?.id ?? null }, "persona",
  );
  if (!fallas.length) after(() => siListoPresentar(db, id));
  return NextResponse.json({ ok: true, estado: valores.estado, observacion: valores.observacion });
}
