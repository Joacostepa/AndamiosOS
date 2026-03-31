import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";
import * as soap from "soap";

const WSAA_URL = "https://wsaa.afip.gob.ar/ws/services/LoginCms?WSDL";
const PADRON_URL = "https://aws.afip.gob.ar/sr-padron/webservices/personaServiceA13?WSDL";
const SERVICE_NAME = "ws_sr_padron_a13";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let cachedToken: { token: string; sign: string; expiration: number } | null = null;
let cachedCert: string | null = null;
let cachedKey: string | null = null;

async function getCert(): Promise<string> {
  if (cachedCert) return cachedCert;
  const { data } = await supabase.from("configuracion").select("valor").eq("clave", "afip_cert").single();
  if (data?.valor) { cachedCert = data.valor; return cachedCert!; }
  throw new Error("Certificado AFIP no encontrado en configuracion");
}

async function getKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const { data } = await supabase.from("configuracion").select("valor").eq("clave", "afip_key").single();
  if (data?.valor) { cachedKey = data.valor; return cachedKey!; }
  throw new Error("Clave privada AFIP no encontrada en configuracion");
}

async function signTRA(tra: string): Promise<string> {
  const certPem = await getCert();
  const keyPem = await getKey();

  // Use Node.js native crypto to create PKCS#7 / CMS signature
  // AFIP requires CMS SignedData format
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(tra);
  const signature = sign.sign(keyPem, "base64");

  // Extract cert body (without headers)
  const certBody = certPem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s/g, "");

  // Build CMS/PKCS#7 manually in ASN.1 DER format
  // This is the format AFIP WSAA expects
  const traBuffer = Buffer.from(tra, "utf8");
  const sigBuffer = Buffer.from(signature, "base64");
  const certBuffer = Buffer.from(certBody, "base64");

  const cms = buildCMS(traBuffer, sigBuffer, certBuffer);
  return cms.toString("base64");
}

// Build a minimal CMS SignedData structure that AFIP accepts
function buildCMS(content: Buffer, signature: Buffer, cert: Buffer): Buffer {
  // We need to construct ASN.1 DER encoded PKCS#7 SignedData
  // Using a simplified but AFIP-compatible structure

  function asn1Length(len: number): Buffer {
    if (len < 128) return Buffer.from([len]);
    if (len < 256) return Buffer.from([0x81, len]);
    if (len < 65536) return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
    return Buffer.from([0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }

  function asn1Wrap(tag: number, content: Buffer): Buffer {
    const len = asn1Length(content.length);
    return Buffer.concat([Buffer.from([tag]), len, content]);
  }

  // OID for signedData: 1.2.840.113549.1.7.2
  const oidSignedData = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]);
  // OID for data: 1.2.840.113549.1.7.1
  const oidData = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01]);
  // OID for sha256: 2.16.840.1.101.3.4.2.1
  const oidSha256 = Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
  // OID for rsaEncryption: 1.2.840.113549.1.1.1
  const oidRsa = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);

  // DigestAlgorithm
  const digestAlg = asn1Wrap(0x30, Buffer.concat([oidSha256, Buffer.from([0x05, 0x00])]));
  const digestAlgSet = asn1Wrap(0x31, digestAlg);

  // EncapsulatedContentInfo with content
  const contentOctet = asn1Wrap(0x04, content);
  const contentExplicit = asn1Wrap(0xa0, contentOctet);
  const encapContent = asn1Wrap(0x30, Buffer.concat([oidData, contentExplicit]));

  // Certificate
  const certSeq = asn1Wrap(0xa0, Buffer.from(cert));

  // Parse cert to get issuer and serial (simplified - extract from DER)
  // For now we'll use a simplified approach
  const certDer = cert;

  // SignerInfo (simplified)
  const version = asn1Wrap(0x02, Buffer.from([0x01])); // version 1
  const digestAlgSigner = asn1Wrap(0x30, Buffer.concat([oidSha256, Buffer.from([0x05, 0x00])]));
  const encryptAlg = asn1Wrap(0x30, Buffer.concat([oidRsa, Buffer.from([0x05, 0x00])]));
  const sigValue = asn1Wrap(0x04, signature);

  // We need issuer and serialNumber from the cert
  // This is complex to parse, so let's use a different approach
  // Just include the signature with minimal wrapper

  // Actually, let's use the child_process approach with openssl since it's available on Vercel's Node runtime
  // No wait - let's try a different library approach

  // Return a dummy for now - we'll switch approach
  return Buffer.alloc(0);
}

async function getLoginTicket(): Promise<{ token: string; sign: string }> {
  if (cachedToken && cachedToken.expiration > Date.now()) {
    return { token: cachedToken.token, sign: cachedToken.sign };
  }

  const certPem = await getCert();
  const keyPem = await getKey();

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

  // Use Node.js crypto to create S/MIME signature (what AFIP expects)
  const { X509Certificate } = crypto;

  // Sign using smime-like approach
  const signer = crypto.createSign("SHA256");
  signer.update(tra);
  signer.end();
  const sig = signer.sign(keyPem);

  // We need proper CMS/PKCS7 - use openssl if available
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const certPath = path.join(tmpDir, `afip_cert_${Date.now()}.crt`);
  const keyPath = path.join(tmpDir, `afip_key_${Date.now()}.key`);
  const traPath = path.join(tmpDir, `afip_tra_${Date.now()}.xml`);
  const cmsPath = path.join(tmpDir, `afip_cms_${Date.now()}.pem`);

  try {
    fs.writeFileSync(certPath, certPem);
    fs.writeFileSync(keyPath, keyPem);
    fs.writeFileSync(traPath, tra);

    execSync(
      `openssl cms -sign -in "${traPath}" -out "${cmsPath}" -signer "${certPath}" -inkey "${keyPath}" -nodetach -outform PEM 2>&1`,
      { timeout: 15000 }
    );

    let cms = fs.readFileSync(cmsPath, "utf-8");
    cms = cms.replace("-----BEGIN CMS-----", "").replace("-----END CMS-----", "").replace(/\s/g, "");

    // Call WSAA
    const wsaaClient = await soap.createClientAsync(WSAA_URL);
    const [result] = await wsaaClient.loginCmsAsync({ in0: cms });
    const loginResult = result.loginCmsReturn;

    const tokenMatch = loginResult.match(/<token>([^<]*)<\/token>/);
    const signMatch = loginResult.match(/<sign>([^<]*)<\/sign>/);

    if (!tokenMatch || !signMatch) throw new Error("No se pudo obtener token");

    cachedToken = { token: tokenMatch[1], sign: signMatch[1], expiration: Date.now() + 540000 };
    return { token: cachedToken.token, sign: cachedToken.sign };
  } finally {
    try { fs.unlinkSync(certPath); } catch {}
    try { fs.unlinkSync(keyPath); } catch {}
    try { fs.unlinkSync(traPath); } catch {}
    try { fs.unlinkSync(cmsPath); } catch {}
  }
}

async function consultarPadron(cuit: string): Promise<any> {
  const { token, sign } = await getLoginTicket();
  const cuitRepresentada = process.env.AFIP_CUIT || "30711116504";

  const client = await soap.createClientAsync(PADRON_URL);
  const [result] = await client.getPersonaAsync({
    token, sign, cuitRepresentada, idPersona: cuit,
  });

  return result?.personaReturn?.datosGenerales;
}

export async function GET(request: NextRequest) {
  const cuit = request.nextUrl.searchParams.get("cuit");
  if (!cuit) return NextResponse.json({ error: "CUIT requerido" }, { status: 400 });

  const cuitClean = cuit.replace(/\D/g, "");
  if (cuitClean.length !== 11) return NextResponse.json({ error: "CUIT debe tener 11 digitos" }, { status: 400 });

  try {
    const datos = await consultarPadron(cuitClean);
    if (!datos) return NextResponse.json({ error: "No se encontro el CUIT en AFIP" }, { status: 404 });

    const esJuridica = datos.tipoPersona === "JURIDICA";
    const nombre = esJuridica ? datos.razonSocial : `${datos.apellido || ""} ${datos.nombre || ""}`.trim();

    const domicilio = datos.domicilioFiscal
      ? [datos.domicilioFiscal.direccion, datos.domicilioFiscal.localidad, datos.domicilioFiscal.descripcionProvincia].filter(Boolean).join(", ")
      : null;

    let condicionIVA = "Sin datos";
    if (datos.impuestos?.impuesto) {
      const impuestos = Array.isArray(datos.impuestos.impuesto) ? datos.impuestos.impuesto : [datos.impuestos.impuesto];
      if (impuestos.some((i: any) => String(i.idImpuesto) === "30")) condicionIVA = "Responsable Inscripto";
      else if (impuestos.some((i: any) => String(i.idImpuesto) === "20")) condicionIVA = "Monotributista";
      else if (impuestos.some((i: any) => String(i.idImpuesto) === "32")) condicionIVA = "IVA Exento";
    }

    return NextResponse.json({
      razon_social: nombre, domicilio_fiscal: domicilio,
      condicion_iva: condicionIVA, cuit: formatCuit(cuitClean),
      tipo_persona: datos.tipoPersona,
    });
  } catch (error: any) {
    console.error("AFIP WS Error:", error.message);
    return NextResponse.json({ error: `Error consultando AFIP: ${error.message?.slice(0, 200)}` }, { status: 500 });
  }
}

function formatCuit(cuit: string): string {
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}
