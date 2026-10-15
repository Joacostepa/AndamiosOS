import { NextRequest, NextResponse } from "next/server";
import { instanciarPlantilla, migrarDiseno } from "@/lib/tecnica/modelo";
import {
  aLista, conObra, ErrorModelador, filaNueva, firmarVarias, leerFilaModelo, leerModelo, leerObra, SELECT_LISTA, textoBusqueda, traducirErrorDb,
} from "@/lib/tecnica/persistencia/servidor";
import { crearSchema, listarSchema, validarDisenoEntrante } from "@/lib/tecnica/persistencia/validar";
import type { ModeloLista } from "@/lib/tecnica/persistencia/tipos";
import { fallo, guardia, invalido, leerJson, sesion, sinCache } from "./_comun";

// GET  /api/tecnica/modelador?obra=<uuid>&plantillas=1&sinObra=1&q=… — lista (sin el diseño)
// POST /api/tecnica/modelador — { nombre, obra_id?, cotizacion_ref?, diseno } o { desdePlantilla, obra_id? }

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await guardia("ver");
  if (g instanceof NextResponse) return g;
  const p = listarSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!p.success) return invalido(p.error);
  try {
    const db = await sesion();
    let q = db.from("tec_modelos").select(SELECT_LISTA).is("archivado_at", null)
      .eq("es_plantilla", p.data.plantillas === "1")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (p.data.obra) q = q.eq("obra_id", p.data.obra);
    else if (p.data.sinObra === "1") q = q.is("obra_id", null);
    const texto = p.data.q ? textoBusqueda(p.data.q) : "";
    if (texto) q = q.or(`nombre.ilike.%${texto}%,cotizacion_ref.ilike.%${texto}%`);
    const { data, error } = await q;
    if (error) throw traducirErrorDb(error, "No se pudo leer la lista de modelos.");
    const filas = (data ?? []) as unknown as Parameters<typeof aLista>[0][];
    const urls = await firmarVarias(db, filas.map((f) => f.imagen_path as string | null).filter((x): x is string => !!x));
    const modelos: ModeloLista[] = filas.map((f) => aLista(f, urls.get(f.imagen_path as string) ?? null));
    return NextResponse.json({ modelos }, { headers: sinCache });
  } catch (e) {
    return fallo(e);
  }
}

export async function POST(req: NextRequest) {
  const g = await guardia("editar");
  if (g instanceof NextResponse) return g;
  const p = crearSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);
  try {
    const db = await sesion();
    const obra = p.data.obra_id ? await leerObra(db, p.data.obra_id) : null;

    let fila: ReturnType<typeof filaNueva>;
    if ("desdePlantilla" in p.data) {
      const plantilla = await leerFilaModelo(db, p.data.desdePlantilla);
      if (plantilla.es_plantilla !== true) throw new ErrorModelador("Eso no es una plantilla.", 400);
      const diseno = conObra(instanciarPlantilla(migrarDiseno(plantilla.diseno), { obra: obra ?? null }), obra);
      fila = filaNueva(diseno, {
        nombre: p.data.nombre ?? (obra ? `${plantilla.nombre as string} · ${obra.codigo}` : (plantilla.nombre as string)),
        descripcion: (plantilla.descripcion as string | null) ?? null,
        obra_id: obra?.id ?? null,
        cotizacion_ref: p.data.cotizacion_ref ?? null,
        resumen: plantilla.resumen,
      });
    } else {
      const v = validarDisenoEntrante(p.data.diseno);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      fila = filaNueva(conObra(v.diseno, obra), {
        nombre: p.data.nombre,
        descripcion: p.data.descripcion ?? null,
        obra_id: obra?.id ?? null,
        cotizacion_ref: p.data.cotizacion_ref ?? null,
        resumen: p.data.resumen ?? null,
      });
    }

    const { data, error } = await db.from("tec_modelos").insert(fila).select("id").single();
    if (error) throw traducirErrorDb(error, "No se pudo crear el modelo.");
    const modelo = await leerModelo(db, (data as { id: string }).id);
    return NextResponse.json({ modelo }, { status: 201 });
  } catch (e) {
    return fallo(e);
  }
}
