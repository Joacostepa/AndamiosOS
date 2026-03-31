import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Afip from "@afipsdk/afip.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let afipInstance: any = null;

async function getAfip(): Promise<any> {
  if (afipInstance) return afipInstance;

  // Get cert and key from DB
  const [certResult, keyResult] = await Promise.all([
    supabase.from("configuracion").select("valor").eq("clave", "afip_cert").single(),
    supabase.from("configuracion").select("valor").eq("clave", "afip_key").single(),
  ]);

  const cert = certResult.data?.valor;
  const key = keyResult.data?.valor;

  if (!cert || !key) throw new Error("Certificados AFIP no configurados en la base de datos");

  const cuit = process.env.AFIP_CUIT || "30711116504";

  afipInstance = new (Afip as any)({
    CUIT: parseInt(cuit),
    cert: cert,
    key: key,
    production: true,
  });

  return afipInstance;
}

export async function GET(request: NextRequest) {
  const cuit = request.nextUrl.searchParams.get("cuit");
  if (!cuit) return NextResponse.json({ error: "CUIT requerido" }, { status: 400 });

  const cuitClean = cuit.replace(/\D/g, "");
  if (cuitClean.length !== 11) return NextResponse.json({ error: "CUIT debe tener 11 digitos" }, { status: 400 });

  try {
    const afip = await getAfip();
    const persona = await afip.RegisterScopeThirteen.getTaxpayerDetails(parseInt(cuitClean));

    if (!persona) {
      return NextResponse.json({ error: "No se encontro el CUIT en AFIP" }, { status: 404 });
    }

    const datos = persona.datosGenerales;
    const esJuridica = datos?.tipoPersona === "JURIDICA";
    const nombre = esJuridica
      ? datos?.razonSocial
      : `${datos?.apellido || ""} ${datos?.nombre || ""}`.trim();

    const domicilio = datos?.domicilioFiscal
      ? [datos.domicilioFiscal.direccion, datos.domicilioFiscal.localidad, datos.domicilioFiscal.descripcionProvincia].filter(Boolean).join(", ")
      : null;

    let condicionIVA = "Sin datos";
    const impuestos = datos?.impuestos?.impuesto;
    if (impuestos) {
      const imp = Array.isArray(impuestos) ? impuestos : [impuestos];
      if (imp.some((i: any) => String(i.idImpuesto) === "30")) condicionIVA = "Responsable Inscripto";
      else if (imp.some((i: any) => String(i.idImpuesto) === "20")) condicionIVA = "Monotributista";
      else if (imp.some((i: any) => String(i.idImpuesto) === "32")) condicionIVA = "IVA Exento";
    }

    return NextResponse.json({
      razon_social: nombre,
      domicilio_fiscal: domicilio,
      condicion_iva: condicionIVA,
      cuit: formatCuit(cuitClean),
      tipo_persona: datos?.tipoPersona,
    });
  } catch (error: any) {
    console.error("AFIP Error:", error.message || error);
    return NextResponse.json(
      { error: `Error consultando AFIP: ${(error.message || String(error)).slice(0, 200)}` },
      { status: 500 }
    );
  }
}

function formatCuit(cuit: string): string {
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}
