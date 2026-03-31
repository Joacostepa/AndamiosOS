import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cuit = request.nextUrl.searchParams.get("cuit");

  if (!cuit) {
    return NextResponse.json({ error: "CUIT requerido" }, { status: 400 });
  }

  const cuitClean = cuit.replace(/\D/g, "");

  if (cuitClean.length !== 11) {
    return NextResponse.json({ error: "CUIT debe tener 11 digitos" }, { status: 400 });
  }

  // Intentar multiples fuentes
  const apis = [
    () => fetchFromCuitAR(cuitClean),
    () => fetchFromAfipSOA(cuitClean),
  ];

  for (const apiFn of apis) {
    try {
      const result = await apiFn();
      if (result) {
        return NextResponse.json({ ...result, cuit: formatCuit(cuitClean) });
      }
    } catch (e) {
      console.error("AFIP API attempt failed:", e);
      continue;
    }
  }

  return NextResponse.json({ error: "No se encontro el CUIT. Las APIs de AFIP pueden estar temporalmente no disponibles." }, { status: 404 });
}

// Fuente 1: cuit.ar API
async function fetchFromCuitAR(cuit: string) {
  const res = await fetch(`https://cuit.ar/api/v1/contribuyentes/${cuit}`, {
    headers: { "User-Agent": "AndamiosOS/1.0", "Accept": "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.nombre) return null;
  return {
    razon_social: data.nombre || data.razonSocial,
    domicilio_fiscal: data.domicilio || null,
    condicion_iva: data.condicionIVA || data.tipoContribuyente || null,
  };
}

// Fuente 2: AFIP SOA (padron)
async function fetchFromAfipSOA(cuit: string) {
  const res = await fetch(`https://soa.afip.gob.ar/sr-padron/v2/persona/${cuit}`, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const p = json?.data;
  if (!p) return null;

  const nombre = p.tipoClave === "JURIDICA"
    ? p.razonSocial
    : `${p.apellido || ""} ${p.nombre || ""}`.trim();

  const domicilio = p.domicilioFiscal
    ? [p.domicilioFiscal.direccion, p.domicilioFiscal.localidad, p.domicilioFiscal.descripcionProvincia]
        .filter(Boolean).join(", ")
    : null;

  let condicion = "Sin datos";
  if (p.impuestos && Array.isArray(p.impuestos)) {
    if (p.impuestos.some((i: any) => i.idImpuesto === 30)) condicion = "Responsable Inscripto";
    else if (p.impuestos.some((i: any) => i.idImpuesto === 20)) condicion = "Monotributista";
  }

  return { razon_social: nombre, domicilio_fiscal: domicilio, condicion_iva: condicion };
}

function formatCuit(cuit: string): string {
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}
