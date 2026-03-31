import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cuit = request.nextUrl.searchParams.get("cuit");
  if (!cuit) return NextResponse.json({ error: "CUIT requerido" }, { status: 400 });

  const cuitClean = cuit.replace(/\D/g, "");
  if (cuitClean.length !== 11) return NextResponse.json({ error: "CUIT debe tener 11 digitos" }, { status: 400 });

  // Formatear CUIT correctamente
  const cuitFormatted = `${cuitClean.slice(0, 2)}-${cuitClean.slice(2, 10)}-${cuitClean.slice(10)}`;

  // Determinar tipo por prefijo
  const prefix = parseInt(cuitClean.slice(0, 2));
  let tipo = "Sin datos";
  if ([30, 33, 34].includes(prefix)) tipo = "Responsable Inscripto";
  else if ([20, 23, 24, 27].includes(prefix)) tipo = "Persona Fisica";

  return NextResponse.json({
    cuit: cuitFormatted,
    condicion_iva: tipo,
    razon_social: null,
    domicilio_fiscal: null,
    mensaje: "Consulta AFIP en desarrollo. El CUIT fue formateado correctamente. Completa los datos manualmente.",
  });
}
