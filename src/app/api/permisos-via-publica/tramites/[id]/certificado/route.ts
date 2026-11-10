import { NextRequest, NextResponse, after } from "next/server";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, registrarEvento } from "@/lib/permisos-via-publica/endosos";
import { siListoPresentar } from "@/lib/permisos-via-publica/presentacion";
import { retpGuardado, revisarCertificado } from "@/lib/permisos-via-publica/certificado-cpau.mjs";

// POST /api/permisos-via-publica/tramites/:id/certificado  (multipart: archivo, archivo?)
//
// "Subir certificado del CPAU": lo que va a TAD como "Certificado de Encomienda Profesional". Deja
// el documento `encomienda_cpau` del trámite y, si con eso está todo, pide la presentación (o
// avisa, en modo supervisado). El proxy exige "editar".
//
// DESDE NOVIEMBRE DE 2026 el CPAU manda SÓLO el certificado: 1 hoja, firmada digitalmente, sin el
// registro ni el comprobante (JS: que se cargue sólo el certificado, tal cual llega). Va un solo PDF
// y se guarda con los bytes tal cual (re-guardarlo rompe la firma). No trae el R.Nro: se controla
// que el inmueble sea el frente de la encomienda del robot y que su RETP no esté cargado en otro
// trámite. Si no coincide queda OBSERVADO (no se presenta) en vez de rechazarse: queda el archivo
// para que lo mire una persona, y lo peor que puede pasar es presentar el certificado de otro.
// Sigue aceptando el formato viejo (registro ×3 + certificación + comprobante, o esos dos PDF
// sueltos, que se unen en uno: primero la encomienda y después la certificación). Los formatos y
// los controles están en src/lib/permisos-via-publica/certificado-cpau.mjs. Como lo sube una persona
// que lo miró, si el inmueble coincide la matrícula y el RETP ilegibles quedan como aviso (el robot
// frena con eso y manda a subirlo acá).
//
// Si queda ok y la encomienda del robot está esperando el certificado («cargada», en la cola o
// frenada), se cierra la tarea con este PDF: si no, el robot lo seguiría buscando en el mail y, al
// vencer el plazo, frenaría con un aviso falso; y una tarea que quedara «cargada» para siempre
// frenaría por frente gemelo a toda encomienda nueva del mismo frente.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const archivos = (form?.getAll("archivo") ?? []).filter((a): a is File => a instanceof File);
  if (!archivos.length) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (archivos.length > 2) return NextResponse.json({ error: "Son dos PDF como mucho. Ahora va uno solo: el certificado que manda el CPAU" }, { status: 400 });
  if (archivos.some((a) => a.type !== "application/pdf" && !a.name.toLowerCase().endsWith(".pdf"))) {
    return NextResponse.json({ error: "Tienen que ser PDF" }, { status: 400 });
  }
  // Vercel corta el pedido en ~4,5 MB.
  if (archivos.reduce((t, a) => t + a.size, 0) > MAX_BYTES) return NextResponse.json({ error: "Los PDF pesan más de 4 MB entre los dos" }, { status: 400 });
  const archivo = { name: archivos.map((a) => a.name).join(" + ") };

  const { data: auth } = await (await createClient()).auth.getUser();
  const db = createAdminClient();
  const { data: t } = await db.from("pvp_tramites").select("id").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "El trámite no existe" }, { status: 404 });

  let bytes: Uint8Array;
  try {
    const partes = await Promise.all(archivos.map(async (a) => hastaElFinal(new Uint8Array(await a.arrayBuffer()))));
    bytes = partes.length === 1 ? partes[0] : await unir(partes);
  } catch (e) {
    return NextResponse.json({ error: `No se pudieron unir los PDF: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
  }
  let paginas: string[] = [];
  try {
    paginas = (await extractText(await getDocumentProxy(bytes.slice()), { mergePages: false })).text.map((x) => x.replace(/\s+/g, " "));
  } catch {
    // Un PDF que no se puede leer queda observado, pero se guarda.
  }
  const texto = paginas.join(" ");
  const esDelCpau = /Encomienda de Tarea Profesional|Consejo Profesional de Arquitectura|CPAU/i.test(texto);

  // La encomienda del robot de este trámite: de ahí salen el R.Nro y el frente para comparar.
  const { data: te } = await db.from("pvp_tareas")
    .select("id, estado, resultado, frente:payload->frente, registro:resultado->>registro, calle_cpau:resultado->>calle_cpau")
    .eq("tipo", "cpau_encomienda").eq("tramite_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const r = revisarCertificado(paginas, { registro: te?.registro ?? null, frente: (te?.frente ?? null) as { calle?: string; desde?: number; hasta?: number } | null, calle_cpau: te?.calle_cpau ?? null }, { aMano: true });

  // El mismo RETP en otro trámite: es el certificado de otra encomienda (o ya se cargó en otro lado).
  let retpEnOtro: string | null = null;
  if (r.retp) {
    const [{ data: tareas }, { data: docs }] = await Promise.all([
      db.from("pvp_tareas").select("id, tramite_id, certificado:resultado->cierre->certificado")
        .eq("tipo", "cpau_encomienda").neq("tramite_id", id).not("resultado->cierre->certificado", "is", null),
      db.from("pvp_documentos").select("tramite_id").eq("clave", "encomienda_cpau").neq("tramite_id", id).eq("revision->leido->>retp", r.retp).limit(1),
    ]);
    const otra = (tareas ?? []).find((x) => retpGuardado(x.certificado) === r.retp);
    const tramiteOtro = otra?.tramite_id ?? docs?.[0]?.tramite_id ?? null;
    if (tramiteOtro) {
      const { data: o } = await db.from("pvp_tramites").select("direccion").eq("id", tramiteOtro).maybeSingle();
      retpEnOtro = o?.direccion ?? tramiteOtro;
    }
  }

  const chequeos = [
    { clave: "lectura", ok: texto.trim().length > 50, bloquea: true, detalle: texto.trim().length > 50 ? "El PDF se lee." : "El PDF no tiene texto legible." },
    { clave: "cpau", ok: esDelCpau, bloquea: true, detalle: esDelCpau ? "Es del CPAU." : "No parece un documento del CPAU." },
    ...r.chequeos,
    ...(r.retp ? [{
      clave: "retp_unico", ok: !retpEnOtro, bloquea: true,
      detalle: retpEnOtro ? `El RETP ${r.retp} ya está cargado en el trámite de ${retpEnOtro}: este certificado no es de este trámite.` : `El RETP ${r.retp} no está cargado en otro trámite.`,
    }] : []),
  ];
  const fallas = chequeos.filter((c) => !c.ok && c.bloquea);
  const avisos = chequeos.filter((c) => !c.ok && !c.bloquea);

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
    revision: { modelo: null, leido: { subido_por: auth.user?.id ?? null, formato: r.formato, retp: r.retp, inmueble: r.inmueble, registro: te?.registro ?? null }, chequeos },
  };
  const { error: e2 } = previo
    ? await db.from("pvp_documentos").update(valores).eq("id", previo.id)
    : await db.from("pvp_documentos").insert({ ...valores, tramite_id: id, clave: "encomienda_cpau", origen: "aba" });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  await registrarEvento(
    db, id, "encomienda_cpau",
    fallas.length
      ? `Se subió el certificado del CPAU, pero no se puede presentar: ${fallas.map((c) => c.detalle).join(" ")}`
      : `Se subió el certificado del CPAU (${archivo.name}${r.retp ? `, RETP ${r.retp}` : ""}).${avisos.length ? ` A controlar: ${avisos.map((c) => c.detalle).join(" ")}` : ""}`,
    { path, por: auth.user?.id ?? null, formato: r.formato, retp: r.retp, inmueble: r.inmueble }, "persona",
  );
  if (!fallas.length && te) await cerrarEncomienda(db, id, te, { path, nombre: archivo.name, recibido_at: ahora, formato: r.formato, retp: r.retp, inmueble: r.inmueble });
  if (!fallas.length) after(() => siListoPresentar(db, id));
  return NextResponse.json({ ok: true, estado: valores.estado, observacion: valores.observacion ?? (avisos.length ? avisos.map((c) => c.detalle).join(" ") : null) });
}

/**
 * La tarea `cpau_encomienda` que espera el certificado (etapa «cargada», pendiente o frenada) queda
 * cerrada con el que se subió a mano. Sólo si no la tiene tomada el robot en este momento: en ese
 * caso, en la vuelta siguiente el robot ve el documento ok y la cierra él.
 */
async function cerrarEncomienda(
  db: ReturnType<typeof createAdminClient>,
  tramiteId: string,
  te: { id: string; estado: string; resultado: unknown },
  certificado: { path: string; nombre: string; recibido_at: string; formato: string | null; retp: string | null; inmueble: unknown },
): Promise<void> {
  const resultado = (te.resultado ?? {}) as { cierre?: Record<string, unknown> };
  if (resultado.cierre?.etapa !== "cargada" || !["pendiente", "error"].includes(te.estado)) return;
  const ahora = certificado.recibido_at;
  const { data, error } = await db.from("pvp_tareas")
    .update({
      estado: "ok", error: null, terminada_at: ahora, reintentar_desde: null,
      resultado: { ...resultado, cierre: { ...resultado.cierre, etapa: "certificado", certificado: { ...certificado, a_mano: true } } },
    })
    .eq("id", te.id).eq("estado", te.estado).select("id");
  if (error || !data?.length) return; // la tomó el robot mientras tanto: la cierra él en la vuelta siguiente
  await registrarEvento(db, tramiteId, "encomienda_cpau", "La encomienda del robot quedó cerrada con el certificado subido a mano: deja de buscar el mail.", { tarea_id: te.id }, "persona");
}

/**
 * El CPAU pega HTML después del PDF en algunas descargas (registro del RETP, 16/09): se corta en el
 * último %%EOF. Sólo si después hay algo más que espacios o saltos de línea: la firma digital del
 * certificado nuevo cubre hasta el último byte (el salto de línea después de %%EOF) y cortarlo la rompe.
 */
function hastaElFinal(bytes: Uint8Array): Uint8Array {
  const texto = Buffer.from(bytes).toString("latin1");
  const fin = texto.lastIndexOf("%%EOF");
  if (fin <= 0 || !texto.slice(fin + 5).trim()) return bytes;
  return bytes.slice(0, fin + 5);
}

async function unir(partes: Uint8Array[]): Promise<Uint8Array> {
  const salida = await PDFDocument.create();
  for (const parte of partes) {
    const doc = await PDFDocument.load(parte, { ignoreEncryption: true });
    for (const pagina of await salida.copyPages(doc, doc.getPageIndices())) salida.addPage(pagina);
  }
  return salida.save();
}
