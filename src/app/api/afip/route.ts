import { NextRequest, NextResponse } from "next/server";
import * as soap from "soap";

const WSAA_URL = "https://wsaa.afip.gob.ar/ws/services/LoginCms?WSDL";
const PADRON_URL = "https://aws.afip.gob.ar/sr-padron/webservices/personaServiceA13?WSDL";
const SERVICE_NAME = "ws_sr_padron_a13";

let cachedToken: { token: string; sign: string; expiration: number } | null = null;

function getCert(): string {
  const b64 = process.env.AFIP_CERT_B64;
  if (!b64) throw new Error("AFIP_CERT_B64 no configurado");
  return Buffer.from(b64, "base64").toString("utf-8");
}

function getKey(): string {
  const b64 = process.env.AFIP_KEY_B64;
  if (!b64) throw new Error("AFIP_KEY_B64 no configurado");
  return Buffer.from(b64, "base64").toString("utf-8");
}

async function getLoginTicket(): Promise<{ token: string; sign: string }> {
  // Check cache
  if (cachedToken && cachedToken.expiration > Date.now()) {
    return { token: cachedToken.token, sign: cachedToken.sign };
  }

  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const certPath = path.join(tmpDir, "afip_cert.crt");
  const keyPath = path.join(tmpDir, "afip_key.key");
  const traPath = path.join(tmpDir, "afip_tra.xml");
  const cmsPath = path.join(tmpDir, "afip_cms.xml");

  // Write cert and key to temp files
  fs.writeFileSync(certPath, getCert());
  fs.writeFileSync(keyPath, getKey());

  // Create TRA (Ticket de Requerimiento de Acceso)
  const now = new Date();
  const generationTime = new Date(now.getTime() - 600000).toISOString();
  const expirationTime = new Date(now.getTime() + 600000).toISOString();

  const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>${SERVICE_NAME}</service>
</loginTicketRequest>`;

  fs.writeFileSync(traPath, tra);

  // Sign TRA with CMS
  try {
    execSync(
      `openssl cms -sign -in "${traPath}" -out "${cmsPath}" -signer "${certPath}" -inkey "${keyPath}" -nodetach -outform PEM`,
      { timeout: 10000 }
    );
  } catch (e: any) {
    throw new Error("Error firmando TRA: " + e.message);
  }

  // Read CMS and clean it
  let cms = fs.readFileSync(cmsPath, "utf-8");
  cms = cms.replace("-----BEGIN CMS-----", "").replace("-----END CMS-----", "").replace(/\s/g, "");

  // Call WSAA
  const wsaaClient = await soap.createClientAsync(WSAA_URL);
  const [result] = await wsaaClient.loginCmsAsync({ in0: cms });

  const loginResult = result.loginCmsReturn;

  // Parse XML response
  const tokenMatch = loginResult.match(/<token>([^<]*)<\/token>/);
  const signMatch = loginResult.match(/<sign>([^<]*)<\/sign>/);

  if (!tokenMatch || !signMatch) {
    throw new Error("No se pudo obtener token de AFIP");
  }

  cachedToken = {
    token: tokenMatch[1],
    sign: signMatch[1],
    expiration: Date.now() + 540000, // 9 minutos
  };

  // Cleanup
  try {
    fs.unlinkSync(certPath);
    fs.unlinkSync(keyPath);
    fs.unlinkSync(traPath);
    fs.unlinkSync(cmsPath);
  } catch {}

  return { token: cachedToken.token, sign: cachedToken.sign };
}

async function consultarPadron(cuit: string): Promise<any> {
  const { token, sign } = await getLoginTicket();
  const cuitRepresentada = process.env.AFIP_CUIT || "30711116504";

  const client = await soap.createClientAsync(PADRON_URL);

  const [result] = await client.getPersonaAsync({
    token,
    sign,
    cuitRepresentada: cuitRepresentada,
    idPersona: cuit,
  });

  return result?.personaReturn?.datosGenerales;
}

export async function GET(request: NextRequest) {
  const cuit = request.nextUrl.searchParams.get("cuit");

  if (!cuit) {
    return NextResponse.json({ error: "CUIT requerido" }, { status: 400 });
  }

  const cuitClean = cuit.replace(/\D/g, "");
  if (cuitClean.length !== 11) {
    return NextResponse.json({ error: "CUIT debe tener 11 digitos" }, { status: 400 });
  }

  try {
    const datos = await consultarPadron(cuitClean);

    if (!datos) {
      return NextResponse.json({ error: "No se encontro el CUIT en AFIP" }, { status: 404 });
    }

    const esJuridica = datos.tipoPersona === "JURIDICA";
    const nombre = esJuridica
      ? datos.razonSocial
      : `${datos.apellido || ""} ${datos.nombre || ""}`.trim();

    const domicilio = datos.domicilioFiscal
      ? [datos.domicilioFiscal.direccion, datos.domicilioFiscal.localidad, datos.domicilioFiscal.descripcionProvincia]
          .filter(Boolean).join(", ")
      : null;

    // Determinar condicion IVA
    let condicionIVA = "Sin datos";
    if (datos.impuestos?.impuesto) {
      const impuestos = Array.isArray(datos.impuestos.impuesto) ? datos.impuestos.impuesto : [datos.impuestos.impuesto];
      if (impuestos.some((i: any) => i.idImpuesto == 30 || i.idImpuesto == "30")) condicionIVA = "Responsable Inscripto";
      else if (impuestos.some((i: any) => i.idImpuesto == 20 || i.idImpuesto == "20")) condicionIVA = "Monotributista";
      else if (impuestos.some((i: any) => i.idImpuesto == 32 || i.idImpuesto == "32")) condicionIVA = "IVA Exento";
    }

    return NextResponse.json({
      razon_social: nombre,
      domicilio_fiscal: domicilio,
      condicion_iva: condicionIVA,
      cuit: formatCuit(cuitClean),
      tipo_persona: datos.tipoPersona,
    });
  } catch (error: any) {
    console.error("AFIP WS Error:", error.message);

    // Fallback: al menos formatear el CUIT
    return NextResponse.json(
      { error: `Error consultando AFIP: ${error.message?.slice(0, 100)}` },
      { status: 500 }
    );
  }
}

function formatCuit(cuit: string): string {
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}
