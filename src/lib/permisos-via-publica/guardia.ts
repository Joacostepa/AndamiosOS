import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerGestores } from "./config";
import { quienSoy } from "./lista";

// Lo que no se deshace (armar la encomienda, que el robot paga; presentar en TAD, que es una
// declaración jurada y deja documentos oficiales; empezar de cero) lo hacen los administradores
// y los gestores que elija un administrador en la configuración. Sin gestores elegidos, cualquiera
// que edite el módulo, como antes. El proxy ya exigió "editar"; esto va además.
// Las pruebas no cuentan: nunca se finalizan ni se presentan.

export async function rechazoIrreversible(): Promise<NextResponse | null> {
  const admin = createAdminClient();
  const gestores = await leerGestores(admin);
  const yo = await quienSoy(await createClient(), admin, gestores);
  if (yo.puedeIrreversible) return null;
  return NextResponse.json(
    { error: "Esto no se deshace: lo hacen los gestores del módulo (se eligen en Configuración) o un administrador." },
    { status: 403 },
  );
}
