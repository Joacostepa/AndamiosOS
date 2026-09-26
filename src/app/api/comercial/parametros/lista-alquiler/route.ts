import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { leerListas, leerPiezas } from "@/lib/parametros-cotizacion/servidor";
import { leerPrimeraHoja } from "@/lib/parametros-cotizacion/xlsx";
import { ajustarLista, interpretarListaAlquiler } from "@/lib/parametros-cotizacion/lista-alquiler";
import { db, errorResponse, invalido } from "../../_comun";

// GET   /api/comercial/parametros/lista-alquiler[?id=JUN26] — las listas y las piezas de una
//       (por defecto la vigente).
// POST  multipart (archivo .xlsx) — importar una lista nueva. Con vista=1 sólo la lee y
//       devuelve lo que entendió, para confirmarlo antes de guardar.
// POST  JSON { origen, porcentaje, … } — lista nueva = otra lista ajustada por un %.
// PATCH { id, motivo } — pasar una lista a vigente.
//
// Una lista no se edita: se crea otra. Así una cotización de julio se sigue explicando con
// los precios de JUN26 aunque hoy rija otra.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const cliente = await db();
    const listas = await leerListas(cliente);
    const id = req.nextUrl.searchParams.get("id") ?? listas.find((l) => l.vigente)?.id ?? listas[0]?.id ?? null;
    const piezas = id ? await leerPiezas(cliente, id) : [];
    return NextResponse.json({ listas, seleccionada: id, piezas });
  } catch (e) {
    return errorResponse(e);
  }
}

const idLista = z.string().trim().regex(/^[A-Za-z0-9_-]{2,20}$/, "El nombre corto tiene que ser como JUN26 (letras, números, - o _)");
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").nullable();

const ajusteSchema = z.object({
  origen: idLista,
  id: idLista,
  nombre: z.string().trim().min(3).max(120),
  porcentaje: z.number().finite().min(-50, "Un ajuste de más de −50 % parece un error").max(200, "Un ajuste de más de 200 % parece un error"),
  vigente_desde: fecha,
  activar: z.boolean(),
  motivo: z.string().trim().min(3, "Contá por qué se ajusta (por ejemplo: índice CAC de julio)").max(500),
});

export async function POST(req: NextRequest) {
  const tipo = req.headers.get("content-type") ?? "";
  try {
    const cliente = await db();

    if (tipo.includes("multipart/form-data")) {
      const form = await req.formData();
      const archivo = form.get("archivo");
      if (!(archivo instanceof File)) return invalido("Falta el archivo .xlsx");
      if (archivo.size > 5 * 1024 * 1024) return invalido("El archivo pesa más de 5 MB: no parece una lista de precios");

      let lectura;
      try {
        const { filas } = leerPrimeraHoja(Buffer.from(await archivo.arrayBuffer()));
        lectura = interpretarListaAlquiler(filas);
      } catch (e) {
        return invalido(e instanceof Error ? e.message : "No se pudo leer el archivo");
      }

      if (form.get("vista") === "1") return NextResponse.json({ vista: lectura });

      const datos = z.object({ id: idLista, nombre: z.string().trim().min(3).max(120), vigente_desde: fecha, activar: z.enum(["1", "0"]) })
        .safeParse({
          id: form.get("id"),
          nombre: form.get("nombre"),
          vigente_desde: (form.get("vigente_desde") as string | null) || lectura.vigencia,
          activar: form.get("activar") ?? "0",
        });
      if (!datos.success) return invalido(datos.error);

      const { data, error } = await cliente.rpc("lista_alquiler_crear", {
        p_id: datos.data.id,
        p_nombre: datos.data.nombre,
        p_vigente_desde: datos.data.vigente_desde,
        p_origen: `planilla: ${archivo.name}`,
        p_notas: `Importada desde ${archivo.name}`,
        p_piezas: lectura.piezas,
        p_activar: datos.data.activar === "1",
      });
      if (error) throw error;
      return NextResponse.json({ piezas: data, id: datos.data.id });
    }

    const parsed = ajusteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalido(parsed.error);
    const b = parsed.data;
    const base = await leerPiezas(cliente, b.origen);
    if (base.length === 0) return invalido(`La lista ${b.origen} no existe o no tiene piezas`);
    const piezas = ajustarLista(base, b.porcentaje);
    const signo = b.porcentaje >= 0 ? "+" : "";
    const { data, error } = await cliente.rpc("lista_alquiler_crear", {
      p_id: b.id,
      p_nombre: b.nombre,
      p_vigente_desde: b.vigente_desde,
      p_origen: `${b.origen} ${signo}${b.porcentaje} %`,
      p_notas: b.motivo,
      p_piezas: piezas,
      p_activar: b.activar,
    });
    if (error) throw error;
    return NextResponse.json({ piezas: data, id: b.id });
  } catch (e) {
    return errorResponse(e);
  }
}

const activarSchema = z.object({ id: idLista, motivo: z.string().trim().min(3, "Contá por qué cambia la lista vigente").max(500) });

export async function PATCH(req: NextRequest) {
  const parsed = activarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  try {
    const cliente = await db();
    const { error } = await cliente.rpc("lista_alquiler_activar", { p_id: parsed.data.id, p_motivo: parsed.data.motivo });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
