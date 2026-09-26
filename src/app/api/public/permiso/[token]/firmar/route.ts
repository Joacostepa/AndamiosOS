import { createHash } from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/permisos-via-publica/endosos";
import { guardarDocumentoFirmado, siLegajoCompletoGenerar, tramiteDeToken } from "@/lib/permisos-via-publica/portal";
import { generarActaCompromiso, generarNotaAutorizacion, tintaDeFirma } from "@/lib/permisos-via-publica/documentos-firmados";
import { MINIMO_TINTA_FIRMA, clavesFirmables, type TipoDueno } from "@/lib/permisos-via-publica/tipos";

// POST /api/public/permiso/:token/firmar — el cliente completa y firma en el portal el acta
// de compromiso del GCBA y la nota de ABA, en un solo paso y con una sola firma.
//
// FIRMA ELECTRÓNICA, NO "FIRMA DIGITAL" CERTIFICADA: es la firma dibujada en la pantalla
// más la constancia de quién firmó (nombre, DNI), cuándo, desde qué conexión y dispositivo,
// y el hash de cada PDF. En papel se ve igual que la nota escaneada que se subía antes.
//
// El domicilio electrónico del acta es el de ABA (PERMISOS_MAIL): es donde llegan las
// notificaciones legales del trámite (docs/modulo-gestoria-permisos.md § 5).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  firmante: z.string().trim().min(3).max(120),
  dni: z.string().transform((s) => s.replace(/\D/g, "")).pipe(z.string().regex(/^\d{7,8}$/)),
  caracter: z.string().trim().min(2).max(60),
  domicilio: z.string().trim().min(5).max(200),
  trabajos: z.string().trim().min(3).max(200),
  firma: z.string().max(1_500_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
});

function seisMesesDesdeHoy(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Revisá los datos: nombre, DNI (7 u 8 números), carácter, domicilio, trabajos y la firma." }, { status: 400 });
  }

  const db = createAdminClient();
  const t = await tramiteDeToken(db, token);
  if (!t) return NextResponse.json({ error: "El link no es válido" }, { status: 404 });
  if (!t.titular_cargado_at || !t.tipo_dueno) {
    return NextResponse.json({ error: "Primero cargá quién es el dueño del lote." }, { status: 400 });
  }

  const datos = parsed.data;
  const firmadoAt = new Date();
  const contexto = {
    tipoDueno: t.tipo_dueno as TipoDueno,
    titularNombre: t.titular_nombre as string,
    titularCuit: t.titular_cuit as string,
    // En hora de Argentina, como la fecha del encabezado del acta: con toISOString, después
    // de las 21 h el acta decía "de la fecha 14/09" y "desde el 15/09".
    desde: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(firmadoAt),
    hasta: (t.permiso_hasta as string | null) ?? seisMesesDesdeHoy(),
    domicilioElectronico: process.env.PERMISOS_MAIL ?? "js@andamiosbuenosaires.com.ar",
    firmadoAt,
  };
  const firmaPng = Buffer.from(datos.firma.split(",")[1], "base64");
  // El recuadro tiene que tener algo dibujado. SANTA FE AV. 3085 (S02599, 24/09) se presentó en
  // TAD con el acta y la nota SIN FIRMA porque llegó un PNG transparente entero y nadie lo miró:
  // el Gobierno observó el expediente. Se controla acá y no sólo en el navegador, que es el que
  // arma el PNG y el que se puede saltear.
  const tinta = tintaDeFirma(firmaPng);
  if (tinta === null || tinta < MINIMO_TINTA_FIRMA) {
    return NextResponse.json({
      error: tinta === null
        ? "No se pudo leer la firma. Borrala y firmá de nuevo, o probá desde otro navegador."
        : "El recuadro quedó vacío o la firma es muy chica: firmá de nuevo ocupando buena parte del recuadro.",
    }, { status: 400 });
  }
  const [claveActa, claveNota] = clavesFirmables(contexto.tipoDueno);
  // El logo del membrete vive en el bucket público "empresa". Sin logo la nota sale igual,
  // con el nombre en texto.
  const logo = await db.storage.from("empresa").download("logo.png")
    .then(async (r) => (r.data ? Buffer.from(await r.data.arrayBuffer()) : null))
    .catch(() => null);

  try {
    const piezas = [
      { clave: claveActa, nombre: "Acta de compromiso firmada.pdf", pdf: await generarActaCompromiso(datos, firmaPng, contexto) },
      { clave: claveNota, nombre: `${claveNota === "nota_solicitud" ? "Nota de solicitud" : "Nota de autorización"} firmada.pdf`, pdf: await generarNotaAutorizacion(datos, firmaPng, contexto, logo) },
    ];
    const constanciaBase = {
      firmante: datos.firmante,
      dni: datos.dni,
      caracter: datos.caracter,
      domicilio: datos.domicilio,
      trabajos: datos.trabajos,
      firmado_at: firmadoAt.toISOString(),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      dispositivo: req.headers.get("user-agent"),
      // Qué parte del recuadro quedó dibujada: queda en el historial como prueba de que la
      // firma tenía trazo, que es lo que faltó en S02599.
      tinta_firma: Number(tinta.toFixed(4)),
    };

    for (const p of piezas) {
      const path = `tramites/${t.id}/${p.clave}-${firmadoAt.getTime()}.pdf`;
      const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(p.pdf), { contentType: "application/pdf" });
      if (error) throw new Error(`No se pudo guardar el PDF: ${error.message}`);
      await guardarDocumentoFirmado(db, t.id, p.clave, { path, nombre: p.nombre }, {
        ...constanciaBase,
        sha256: createHash("sha256").update(p.pdf).digest("hex"),
      });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  // Si con la firma quedó completo el legajo, se generan informe técnico y croquis (~1 min).
  after(() => siLegajoCompletoGenerar(db, t.id));
  return NextResponse.json({ ok: true });
}
