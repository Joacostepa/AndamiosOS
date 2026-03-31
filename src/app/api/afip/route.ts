import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cuit = request.nextUrl.searchParams.get("cuit");

  if (!cuit) {
    return NextResponse.json({ error: "CUIT requerido" }, { status: 400 });
  }

  // Limpiar CUIT (solo numeros)
  const cuitClean = cuit.replace(/\D/g, "");

  if (cuitClean.length !== 11) {
    return NextResponse.json({ error: "CUIT debe tener 11 digitos" }, { status: 400 });
  }

  try {
    // API publica de AFIP (servicio de constancia de inscripcion)
    const res = await fetch(
      `https://afip.tangofactura.com/Rest/GetContribuyenteFull?cuit=${cuitClean}`,
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) {
      // Intentar API alternativa
      const res2 = await fetch(
        `https://soa.afip.gob.ar/sr-padron/v2/persona/${cuitClean}`,
        { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(10000) }
      );

      if (!res2.ok) {
        return NextResponse.json({ error: "No se encontro el CUIT" }, { status: 404 });
      }

      const data2 = await res2.json();
      const persona = data2.data;

      if (!persona) {
        return NextResponse.json({ error: "No se encontro el CUIT" }, { status: 404 });
      }

      return NextResponse.json({
        razon_social: persona.nombre || `${persona.apellido || ""} ${persona.nombre || ""}`.trim(),
        domicilio_fiscal: persona.domicilioFiscal
          ? `${persona.domicilioFiscal.direccion || ""}, ${persona.domicilioFiscal.localidad || ""}, ${persona.domicilioFiscal.descripcionProvincia || ""}`.trim()
          : null,
        condicion_iva: mapCondicionIVA(persona.idPersona, persona.tipoClave),
        cuit: formatCuit(cuitClean),
      });
    }

    const data = await res.json();

    if (!data || data.errorGetData) {
      return NextResponse.json({ error: "No se encontro el CUIT" }, { status: 404 });
    }

    return NextResponse.json({
      razon_social: data.Contribuyente?.nombre || data.razonSocial || null,
      domicilio_fiscal: data.Contribuyente?.domicilioFiscal || data.domicilioFiscal || null,
      condicion_iva: data.Contribuyente?.tipoPersona || data.condicionIVA || null,
      cuit: formatCuit(cuitClean),
    });
  } catch (error: any) {
    console.error("AFIP Error:", error);

    // Si las APIs externas fallan, intentar con la API SOA de AFIP directamente
    try {
      const res3 = await fetch(
        `https://soa.afip.gob.ar/sr-padron/v2/persona/${cuitClean}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (res3.ok) {
        const data3 = await res3.json();
        const p = data3.data;

        if (p) {
          const nombre = p.tipoClave === "JURIDICA"
            ? p.razonSocial
            : `${p.apellido || ""} ${p.nombre || ""}`.trim();

          const domicilio = p.domicilioFiscal
            ? `${p.domicilioFiscal.direccion || ""}${p.domicilioFiscal.localidad ? ", " + p.domicilioFiscal.localidad : ""}${p.domicilioFiscal.descripcionProvincia ? ", " + p.domicilioFiscal.descripcionProvincia : ""}`
            : null;

          return NextResponse.json({
            razon_social: nombre,
            domicilio_fiscal: domicilio,
            condicion_iva: getCondicionFromImpuestos(p.impuestos),
            cuit: formatCuit(cuitClean),
          });
        }
      }
    } catch {}

    return NextResponse.json({ error: "Error al consultar AFIP" }, { status: 500 });
  }
}

function formatCuit(cuit: string): string {
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

function mapCondicionIVA(id: any, tipo: string): string {
  if (tipo === "JURIDICA") return "Responsable Inscripto";
  return "Consumidor Final";
}

function getCondicionFromImpuestos(impuestos: any[]): string {
  if (!impuestos || !Array.isArray(impuestos)) return "Sin datos";
  const iva = impuestos.find((i: any) => i.idImpuesto === 30 || i.descripcionImpuesto?.includes("IVA"));
  if (iva) return "Responsable Inscripto";
  const monotributo = impuestos.find((i: any) => i.idImpuesto === 20 || i.descripcionImpuesto?.includes("MONOTRIBUTO"));
  if (monotributo) return "Monotributista";
  return "Sin datos";
}
