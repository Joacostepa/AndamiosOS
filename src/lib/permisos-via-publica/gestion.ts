import type { SupabaseClient } from "@supabase/supabase-js";
import { read } from "@/lib/odoo/client";
import { crearAlertas } from "@/lib/alertas/servicio";
import { enviarMail } from "@/lib/mail";
import { urlBase } from "./endosos";

// Quién está detrás de cada trámite y cómo se le escribe (JS, 2026-09-15):
//   - VENDEDOR: el de la orden en Odoo (sale.order.user_id → res.users). Todas las respuestas
//     a los mails van a él.
//   - GESTOR: quien apretó "Iniciar trámite" en la app (pvp_tramites.creado_por).
// Todos los mails que salen van con copia a los dos.

export type Persona = { nombre: string; email: string };
export type Contactos = { vendedor: Persona | null; gestor: Persona | null };

const mailValido = (m: string | null | undefined): m is string => !!m && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m.trim());

/** El vendedor de una orden de Odoo, o null. */
export async function vendedorDeVenta(ventaId: number): Promise<Persona | null> {
  const [v] = await read<{ user_id: [number, string] | false }>("sale.order", [ventaId], ["user_id"]);
  if (!v?.user_id) return null;
  const [u] = await read<{ name: string; email: string | false; login: string | false }>("res.users", [v.user_id[0]], ["name", "email", "login"]);
  const email = mailValido(u?.email || null) ? (u!.email as string) : mailValido(u?.login || null) ? (u!.login as string) : null;
  return email ? { nombre: u!.name, email: email.trim() } : null;
}

/**
 * Vendedor y gestor del trámite. Si el trámite todavía no tiene el vendedor guardado (abierto
 * antes de esto) y tiene venta, lo busca en Odoo y lo guarda.
 */
export async function contactosDeTramite(db: SupabaseClient, tramiteId: string): Promise<Contactos> {
  const { data: t } = await db.from("pvp_tramites").select("odoo_venta_id, vendedor_nombre, vendedor_email, creado_por").eq("id", tramiteId).maybeSingle();
  if (!t) return { vendedor: null, gestor: null };

  let vendedor: Persona | null = t.vendedor_email ? { nombre: t.vendedor_nombre ?? t.vendedor_email, email: t.vendedor_email } : null;
  if (!vendedor && t.odoo_venta_id) {
    vendedor = await vendedorDeVenta(t.odoo_venta_id).catch(() => null);
    if (vendedor) await db.from("pvp_tramites").update({ vendedor_nombre: vendedor.nombre, vendedor_email: vendedor.email }).eq("id", tramiteId);
  }

  let gestor: Persona | null = null;
  if (t.creado_por) {
    const { data: u } = await db.from("user_profiles").select("email, nombre, apellido").eq("id", t.creado_por).maybeSingle();
    if (u && mailValido(u.email)) gestor = { nombre: `${u.nombre ?? ""} ${u.apellido ?? ""}`.trim() || u.email, email: u.email.trim() };
  }
  return { vendedor, gestor };
}

/** Copias de un mail: vendedor y gestor, sin repetir ni incluir al destinatario. */
export function copias(c: Contactos | Contactos[], para?: string | null): string[] {
  const lista = (Array.isArray(c) ? c : [c]).flatMap((x) => [x.vendedor?.email, x.gestor?.email]);
  const destino = para?.trim().toLowerCase();
  return [...new Set(lista.filter(mailValido).map((m) => m.trim().toLowerCase()))].filter((m) => m !== destino);
}

/** A quién van las respuestas: siempre al vendedor; si no hay, al gestor. */
export function responderA(c: Contactos | Contactos[]): string[] {
  const lista = Array.isArray(c) ? c : [c];
  const vendedores = lista.map((x) => x.vendedor?.email).filter(mailValido);
  const gestores = lista.map((x) => x.gestor?.email).filter(mailValido);
  return [...new Set((vendedores.length ? vendedores : gestores).map((m) => m.trim().toLowerCase()))];
}

export type PasoPendiente = "endoso" | "encomienda" | "presentacion";

const PASO: Record<PasoPendiente, { titulo: string; que: string }> = {
  endoso: { titulo: "Pedí el endoso a Segucom", que: "El cliente cargó el dueño del lote. Revisalo y tocá «Pedir endoso a Segucom» en la ficha." },
  encomienda: { titulo: "Armá la encomienda del CPAU", que: "El legajo del cliente quedó completo y se generaron el informe técnico y el croquis. Tocá «Armar la encomienda» en la ficha." },
  presentacion: { titulo: "Listo para presentar en TAD", que: "Están todos los documentos. Revisalos y tocá «Presentar ahora» en la ficha." },
};

/**
 * Modo supervisado: un paso quedó esperando a una persona. Aviso en la campanita (y #syh) y
 * mail a quien gestiona el trámite con copia al vendedor. Una sola vez por trámite y paso (la
 * clave de la alerta lo garantiza). En un trámite de prueba no hay alerta y el mail va a la
 * casilla de la app. Nunca tira.
 */
export async function avisarPasoPendiente(db: SupabaseClient, tramiteId: string, paso: PasoPendiente, origen?: string | null): Promise<void> {
  try {
    const { data: t } = await db.from("pvp_tramites").select("direccion, odoo_venta_nombre, cliente_nombre, es_prueba").eq("id", tramiteId).maybeSingle();
    if (!t) return;
    const enlace = `/permisos-via-publica/tramites/${tramiteId}`;
    const obra = `${t.direccion}${t.odoo_venta_nombre ? ` (${t.odoo_venta_nombre}${t.cliente_nombre ? ` · ${t.cliente_nombre}` : ""})` : ""}`;

    if (!t.es_prueba) {
      const creadas = await crearAlertas(db, [{
        tipo: "permiso_novedad", clave: `permiso_novedad:tramite:${tramiteId}:pendiente:${paso}`,
        titulo: `${PASO[paso].titulo} — ${t.direccion}`, descripcion: PASO[paso].que, prioridad: "alta", enlace,
      }]);
      if (!creadas) return; // ya se avisó
    }

    const c = await contactosDeTramite(db, tramiteId);
    const para = t.es_prueba ? process.env.PERMISOS_MAIL ?? null : c.gestor?.email ?? c.vendedor?.email ?? null;
    if (!para) return;
    const base = urlBase(origen);
    await enviarMail({
      para,
      cc: t.es_prueba ? [] : copias(c, para),
      responderA: responderA(c),
      asunto: `${t.es_prueba ? "[PRUEBA] " : ""}Permiso de andamio: ${PASO[paso].titulo.toLowerCase()} — ${obra}`,
      texto: [
        `${PASO[paso].que}`,
        "",
        `Obra: ${obra}`,
        base ? `Ficha: ${base}${enlace}` : "",
        "",
        "Este aviso sale porque la app está en modo supervisado: el paso no se hace solo hasta que alguien lo apruebe.",
      ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
    });
  } catch (e) {
    console.error("[gestion] no se pudo avisar el paso pendiente", tramiteId, paso, e instanceof Error ? e.message : e);
  }
}
