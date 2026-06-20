// Espejo de clientes: lectura de res.partner desde Odoo, mapeo a la tabla `clientes`
// y reconciliación contra los clientes ya existentes en la app.
//
// REGLA DE NEGOCIO: Odoo es la fuente de verdad. La reconciliación matchea por CUIT
// (campo `vat` en Odoo), NUNCA por nombre (los nombres varían). El CUIT se normaliza
// a solo dígitos porque en Odoo puede venir con guiones, espacios o prefijo de país.

import { searchRead } from "./client";

export type OdooPartner = {
  id: number;
  name: string;
  vat: string | false;
  email: string | false;
  phone: string | false;
  street: string | false;
  city: string | false;
  active: boolean;
  is_company: boolean;
  customer_rank: number;
};

// Campos seguros (presentes en Odoo 19). El mapeo fiscal (condicion_iva vía l10n_ar)
// se agrega en una iteración posterior, tras confirmar el nombre del campo.
// Nota: `mobile` se removió de res.partner en Odoo 19 (consolidado en `phone`).
const PARTNER_FIELDS = [
  "id", "name", "vat", "email", "phone",
  "street", "city", "active", "is_company", "customer_rank",
];

/** Normaliza un CUIT a solo dígitos. Devuelve null si queda vacío. */
export function normalizeCuit(v: string | false | null | undefined): string | null {
  if (!v) return null;
  const digits = String(v).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function str(v: string | false | null | undefined): string | null {
  return v ? String(v) : null;
}

/** Trae los partners de Odoo que son clientes (customer_rank > 0). */
export function fetchOdooCustomers(): Promise<OdooPartner[]> {
  return searchRead<OdooPartner>(
    "res.partner",
    [["customer_rank", ">", 0]],
    PARTNER_FIELDS,
    { limit: 10000, order: "name" },
  );
}

/** Trae un partner puntual por id (para el webhook). Null si no existe. */
export async function fetchPartnerById(id: number): Promise<OdooPartner | null> {
  const rows = await searchRead<OdooPartner>("res.partner", [["id", "=", id]], PARTNER_FIELDS, { limit: 1 });
  return rows[0] ?? null;
}

/** Mapea un partner de Odoo a las columnas de la tabla `clientes`. */
export function mapPartnerToCliente(p: OdooPartner) {
  const telefono = str(p.phone);
  // Odoo puede devolver false en campos vacíos; razon_social es NOT NULL, así que hay fallback.
  const nombre = (typeof p.name === "string" ? p.name.trim() : "") || `Odoo #${p.id}`;
  return {
    razon_social: nombre,
    cuit: normalizeCuit(p.vat),
    domicilio_fiscal: [str(p.street), str(p.city)].filter(Boolean).join(", ") || null,
    telefono,
    email: str(p.email),
    estado: p.active ? ("activo" as const) : ("inactivo" as const),
    odoo_partner_id: p.id,
  };
}

// ── Reconciliación ────────────────────────────────────────────────────────────

export type ClienteRow = {
  id: string;
  razon_social: string;
  cuit: string | null;
  odoo_partner_id?: number | null;
};

export type ReconcileReport = {
  odoo_customers: number;
  app_clientes: number;
  ya_vinculados: number;     // app cliente ya tiene odoo_partner_id == partner.id
  match_por_cuit: number;    // se vincularían (mismo CUIT, sin vincular aún)
  nuevos: number;            // se insertarían (tienen CUIT, sin match en la app)
  odoo_sin_cuit: number;     // se insertarían pero sin CUIT para deduplicar (revisar)
  cuit_ambiguos: number;     // un CUIT de Odoo matchea >1 cliente local
  huerfanos_app: number;     // clientes en la app sin match en los customers de Odoo
  app_sin_cuit: number;      // clientes en la app sin CUIT cargado
  samples: {
    match_por_cuit: Array<{ cuit: string; app: string; odoo: string }>;
    nuevos: Array<{ cuit: string | null; odoo: string }>;
    huerfanos_app: Array<{ cuit: string | null; app: string }>;
    cuit_ambiguos: Array<{ cuit: string; apps: string[] }>;
  };
};

const SAMPLE = 8;

/**
 * Reconcilia los customers de Odoo contra los clientes locales. Función PURA:
 * no escribe nada, solo clasifica para el reporte dry-run.
 */
export function reconcile(odoo: OdooPartner[], app: ClienteRow[]): ReconcileReport {
  const appByCuit = new Map<string, ClienteRow[]>();
  const appLinked = new Set<number>();
  let appSinCuit = 0;

  for (const c of app) {
    if (c.odoo_partner_id) appLinked.add(c.odoo_partner_id);
    const cuit = normalizeCuit(c.cuit);
    if (!cuit) { appSinCuit++; continue; }
    const arr = appByCuit.get(cuit) ?? [];
    arr.push(c);
    appByCuit.set(cuit, arr);
  }

  const odooCuits = new Set<string>();
  const r: ReconcileReport = {
    odoo_customers: odoo.length,
    app_clientes: app.length,
    ya_vinculados: 0, match_por_cuit: 0, nuevos: 0, odoo_sin_cuit: 0,
    cuit_ambiguos: 0, huerfanos_app: 0, app_sin_cuit: appSinCuit,
    samples: { match_por_cuit: [], nuevos: [], huerfanos_app: [], cuit_ambiguos: [] },
  };

  for (const p of odoo) {
    const cuit = normalizeCuit(p.vat);
    if (cuit) odooCuits.add(cuit);

    if (appLinked.has(p.id)) { r.ya_vinculados++; continue; }

    if (!cuit) {
      r.odoo_sin_cuit++;
      continue;
    }

    const matches = appByCuit.get(cuit);
    if (!matches || matches.length === 0) {
      r.nuevos++;
      if (r.samples.nuevos.length < SAMPLE) r.samples.nuevos.push({ cuit, odoo: p.name });
    } else if (matches.length === 1) {
      r.match_por_cuit++;
      if (r.samples.match_por_cuit.length < SAMPLE)
        r.samples.match_por_cuit.push({ cuit, app: matches[0].razon_social, odoo: p.name });
    } else {
      r.cuit_ambiguos++;
      if (r.samples.cuit_ambiguos.length < SAMPLE)
        r.samples.cuit_ambiguos.push({ cuit, apps: matches.map((m) => m.razon_social) });
    }
  }

  for (const c of app) {
    if (c.odoo_partner_id) continue;
    const cuit = normalizeCuit(c.cuit);
    if (cuit && odooCuits.has(cuit)) continue; // tiene match en Odoo
    r.huerfanos_app++;
    if (r.samples.huerfanos_app.length < SAMPLE)
      r.samples.huerfanos_app.push({ cuit, app: c.razon_social });
  }

  return r;
}

// ── Plan de aplicación (modo apply) ─────────────────────────────────────────────

export type ClienteValues = ReturnType<typeof mapPartnerToCliente>;

export type SyncPlan = {
  toInsert: ClienteValues[];                              // clientes a insertar
  toUpdate: Array<{ id: string; values: ClienteValues }>; // vincular por CUIT / refrescar ya vinculados
  sin_cuit_insertados: number;                            // incluidos en toInsert, sin CUIT (dedup solo por odoo_partner_id)
  ambiguos_omitidos: number;                              // CUIT que matchea >1 cliente local → omitidos, revisión manual
};

/**
 * Calcula las operaciones de escritura del sync. La clave estable del espejo es
 * `odoo_partner_id` (siempre presente), por eso los re-runs son idempotentes:
 * - ya vinculado por odoo_partner_id → refresca (toUpdate)
 * - match 1:1 por CUIT contra un cliente local existente → vincula + refresca (toUpdate)
 * - sin match → inserta (toInsert), tenga o no CUIT
 * - CUIT que matchea >1 cliente local → se OMITE (ambiguo, revisión manual)
 */
export function planSync(odoo: OdooPartner[], app: ClienteRow[]): SyncPlan {
  const appByCuit = new Map<string, ClienteRow[]>();
  const appByOdooId = new Map<number, ClienteRow>();
  for (const c of app) {
    if (c.odoo_partner_id) appByOdooId.set(c.odoo_partner_id, c);
    const cuit = normalizeCuit(c.cuit);
    if (!cuit) continue;
    const arr = appByCuit.get(cuit) ?? [];
    arr.push(c);
    appByCuit.set(cuit, arr);
  }

  const plan: SyncPlan = { toInsert: [], toUpdate: [], sin_cuit_insertados: 0, ambiguos_omitidos: 0 };
  for (const p of odoo) {
    const values = mapPartnerToCliente(p);
    const linked = appByOdooId.get(p.id);
    if (linked) { plan.toUpdate.push({ id: linked.id, values }); continue; }
    const cuit = normalizeCuit(p.vat);
    if (!cuit) { plan.toInsert.push(values); plan.sin_cuit_insertados++; continue; }
    const matches = appByCuit.get(cuit);
    if (!matches || matches.length === 0) plan.toInsert.push(values);
    else if (matches.length === 1) plan.toUpdate.push({ id: matches[0].id, values });
    else plan.ambiguos_omitidos++;
  }
  return plan;
}
