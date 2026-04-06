import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", "minimo_hogareno")
    .single();

  return NextResponse.json({
    minimo_hogareno: data?.valor ? Number(data.valor) : 0,
  });
}
