import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cotizaciones")
    .select("*, clientes(razon_social), cotizacion_items(*)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }

  // Fetch empresa data
  const { data: configs } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", [
      "empresa_nombre", "empresa_cuit", "empresa_direccion",
      "empresa_telefono", "empresa_email", "empresa_web", "empresa_logo_url",
    ]);

  const empresa: Record<string, string> = {};
  configs?.forEach((c) => {
    const key = c.clave.replace("empresa_", "");
    empresa[key] = c.valor;
  });

  return NextResponse.json({ ...data, empresa });
}
