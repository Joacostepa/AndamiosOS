// Empleados de Odoo (hr.employee) → Legajos (`personal`). LÓGICA PURA, sin red ni base.
//
// DECISIÓN DEL DUEÑO (10/10): cada vez que se da de alta, se modifica o se da de baja un
// empleado en Odoo, Legajos se actualiza solo. UN SOLO SENTIDO: Odoo es el dueño de los
// datos de la persona; la app suma lo suyo (puede_estar_a_cargo, Telegram, planteles,
// pañol) y eso no se toca nunca desde acá.
//
// La usan tres lugares, y por eso vive sola y sin imports (corre también desde un .mjs con
// --experimental-strip-types):
//   - el webhook de Odoo   src/app/api/odoo/webhooks/empleados (un empleado por vez)
//   - el control diario    src/app/api/cron/personal-odoo (todos, activos y archivados)
//   - la puesta al día     scripts/personal-sincronizar-odoo.mjs (simulacro por defecto)
//
// QUÉ DECIDE, por empleado:
//   1. Busca su legajo: por `odoo_employee_id`; si no, por DNI (identification_id, sólo
//      dígitos) entre los legajos SIN vínculo; si no, por nombre normalizado (apellido +
//      nombres, sin tildes ni mayúsculas, en cualquier orden) entre los legajos SIN vínculo.
//      Es la misma regla que scripts/hoja-dia-vincular-personal.mjs.
//   2. Si lo encuentra: vincula y actualiza `activo`, `odoo_tarea` y `telefono` (éste SÓLO
//      si el legajo no tiene: el que se cargó en la app manda).
//   3. Si no lo encuentra y es OPERARIO y está activo: crea el legajo.
//      Operario = x_regimen_liquidacion "operarios" o, si el régimen está vacío, que tenga
//      x_tarea (andamista / chofer / herrero). Los administrativos NO se crean: Legajos es
//      la gente de obra (el que hace falta para la Hoja del día y el pañol).
//   4. Lo dudoso no se toca y se avisa: dos legajos sin vínculo con el mismo nombre, un DNI
//      o un nombre que ya está en el legajo de OTRO empleado, un empleado sin régimen ni
//      tarea.
// Y aparte (sólo en la pasada completa): un legajo vinculado a un empleado que ya no existe
// en Odoo (borrado) se desactiva.
//
// NUNCA BORRA. NUNCA toca puede_estar_a_cargo, telegram_*, planteles ni user_id. Un legajo
// sin vínculo que no cruza queda como está (los dados de baja a mano, Capurro de SyH).

/** Lo que se lee de hr.employee. Odoo devuelve `false` en los campos vacíos. */
export type EmpleadoOdoo = {
  id: number;
  name: string;
  active: boolean;
  identification_id?: string | false | null;
  mobile_phone?: string | false | null;
  work_phone?: string | false | null;
  x_tarea?: string | false | null;
  x_regimen_liquidacion?: string | false | null;
};

/** Los campos de hr.employee que hacen falta (y los que disparan la regla de Odoo). */
export const CAMPOS_EMPLEADO = [
  "name",
  "active",
  "identification_id",
  "mobile_phone",
  "work_phone",
  "x_tarea",
  "x_regimen_liquidacion",
] as const;

/** Lo que se lee de `personal`. */
export type Legajo = {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
  telefono: string | null;
  activo: boolean;
  odoo_employee_id: number | null;
  odoo_tarea: string | null;
};

export const CAMPOS_LEGAJO = "id, nombre, apellido, dni, telefono, activo, odoo_employee_id, odoo_tarea";

/** Lo único que esta sincronización escribe en un legajo existente. */
export type CambiosLegajo = {
  odoo_employee_id?: number;
  telefono?: string;
  activo?: boolean;
  odoo_tarea?: string | null;
};

/** Un legajo nuevo. `user_id` queda null (la credencial se vincula desde la app). */
export type NuevoLegajo = {
  apellido: string;
  nombre: string;
  dni: string;
  telefono: string | null;
  puesto: "chofer" | "operario";
  activo: true;
  odoo_employee_id: number;
  odoo_tarea: string | null;
};

export type Cruce = "vinculo" | "dni" | "nombre";

export type MotivoDudoso =
  | "nombre_repetido" // dos o más legajos sin vínculo con ese nombre
  | "dni_repetido" // dos o más legajos sin vínculo con ese DNI
  | "dni_de_otro" // el DNI está en un legajo vinculado a otro empleado
  | "nombre_de_otro" // no cruza y su nombre ya es el de un legajo vinculado a otro empleado
  | "sin_regimen"; // ni régimen ni tarea: no se sabe si es de obra

export type Decision =
  | { tipo: "actualizar"; empleado: EmpleadoOdoo; legajo: Legajo; como: Cruce; cambios: CambiosLegajo }
  | { tipo: "sin_cambios"; empleado: EmpleadoOdoo; legajo: Legajo }
  | { tipo: "crear"; empleado: EmpleadoOdoo; fila: NuevoLegajo }
  | { tipo: "ignorar"; empleado: EmpleadoOdoo; motivo: "administrativo" | "archivado_sin_legajo" }
  | { tipo: "dudoso"; empleado: EmpleadoOdoo; motivo: MotivoDudoso; detalle: string; legajos: Legajo[] };

// ── Normalización ────────────────────────────────────────────────────────────────

/** Odoo devuelve `false` en lo vacío; acá todo vacío es null. */
export function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/** Sin tildes, minúsculas, sólo letras, palabras ordenadas: el orden apellido/nombre no importa. */
export function normNombre(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Sólo dígitos; los `TMP-…` quedan en null. */
export function soloDigitos(s: string | null | undefined | false): string | null {
  const d = String(s || "").replace(/\D/g, "");
  return d || null;
}

/** "DELLA CORTE, Fabian Horacio" → { apellido: "DELLA CORTE", nombre: "FABIAN HORACIO" }. */
export function partirNombre(name: string): { apellido: string; nombre: string } {
  const limpio = name.replace(/\s+/g, " ").trim();
  const coma = limpio.indexOf(",");
  // En mayúsculas, como el resto de Legajos (los cargó así la importación original).
  const may = (s: string) => s.trim().toLocaleUpperCase("es-AR");
  if (coma >= 0) {
    const apellido = may(limpio.slice(0, coma));
    const nombre = may(limpio.slice(coma + 1));
    if (apellido && nombre) return { apellido, nombre };
    return { apellido: apellido || nombre, nombre: nombre || apellido };
  }
  // Sin coma no hay forma segura de saber dónde termina el apellido: la primera palabra.
  const [primera, ...resto] = limpio.split(" ");
  return { apellido: may(primera ?? ""), nombre: may(resto.join(" ") || primera || "") };
}

/** El DNI provisorio del resto de Legajos: TMP-NOMBRES-APELLIDO, sin tildes. */
export function dniProvisorio(apellido: string, nombre: string): string {
  const slug = `${nombre} ${apellido}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `TMP-${slug}`;
}

export function celularDe(e: EmpleadoOdoo): string | null {
  return texto(e.mobile_phone) ?? texto(e.work_phone);
}

/** Operario de obra (se le crea legajo) o administrativo (no). null = no se sabe. */
export function esOperario(e: EmpleadoOdoo): boolean | null {
  const regimen = texto(e.x_regimen_liquidacion);
  if (regimen === "operarios") return true;
  if (regimen === "administrativos") return false;
  return texto(e.x_tarea) ? true : null;
}

// ── La decisión ──────────────────────────────────────────────────────────────────

function cambiosPara(e: EmpleadoOdoo, l: Legajo): CambiosLegajo {
  const c: CambiosLegajo = {};
  if (Number(l.odoo_employee_id) !== e.id) c.odoo_employee_id = e.id;
  const cel = celularDe(e);
  if (cel && !texto(l.telefono)) c.telefono = cel;
  if (l.activo !== !!e.active) c.activo = !!e.active;
  const tarea = texto(e.x_tarea);
  if ((l.odoo_tarea ?? null) !== tarea) c.odoo_tarea = tarea;
  return c;
}

function vinculado(e: EmpleadoOdoo, l: Legajo, como: Cruce): Decision {
  const cambios = cambiosPara(e, l);
  return Object.keys(cambios).length
    ? { tipo: "actualizar", empleado: e, legajo: l, como, cambios }
    : { tipo: "sin_cambios", empleado: e, legajo: l };
}

const nombreLegajo = (l: Legajo) => `${l.apellido}, ${l.nombre}`;

/**
 * Qué hacer con UN empleado de Odoo, mirando los legajos tal como están.
 *
 * `dnisUsados` es para no chocar con el UNIQUE de `personal.dni` al crear (por defecto, los
 * DNI de `legajos`).
 */
export function decidir(e: EmpleadoOdoo, legajos: readonly Legajo[], dnisUsados?: ReadonlySet<string>): Decision {
  const d = decidirSinFiltro(e, legajos, dnisUsados);
  // Un archivado que no cruza limpio no tiene nada que arreglar: no hay legajo que bajar ni
  // alta que hacer. Avisarlo sería ruido en la campanita.
  if (d.tipo === "dudoso" && !e.active) return { tipo: "ignorar", empleado: e, motivo: "archivado_sin_legajo" };
  return d;
}

function decidirSinFiltro(e: EmpleadoOdoo, legajos: readonly Legajo[], dnisUsados?: ReadonlySet<string>): Decision {
  // 1. Ya vinculado.
  const propio = legajos.find((l) => Number(l.odoo_employee_id) === e.id);
  if (propio) return vinculado(e, propio, "vinculo");

  const sinVinculo = legajos.filter((l) => l.odoo_employee_id == null);
  const deOtro = legajos.filter((l) => l.odoo_employee_id != null);

  // 2. Por DNI.
  const dni = soloDigitos(e.identification_id);
  if (dni) {
    const mismos = sinVinculo.filter((l) => soloDigitos(l.dni) === dni);
    if (mismos.length === 1) return vinculado(e, mismos[0], "dni");
    if (mismos.length > 1) {
      return { tipo: "dudoso", empleado: e, motivo: "dni_repetido", legajos: mismos, detalle: `${mismos.length} legajos sin vincular tienen el DNI ${dni}` };
    }
    const otro = deOtro.find((l) => soloDigitos(l.dni) === dni);
    if (otro) {
      return { tipo: "dudoso", empleado: e, motivo: "dni_de_otro", legajos: [otro], detalle: `El DNI ${dni} es del legajo ${nombreLegajo(otro)}, vinculado a otro empleado de Odoo (#${otro.odoo_employee_id})` };
    }
  }

  // 3. Por nombre.
  const n = normNombre(e.name.replace(",", " "));
  const mismos = n ? sinVinculo.filter((l) => normNombre(`${l.apellido} ${l.nombre}`) === n) : [];
  if (mismos.length === 1) return vinculado(e, mismos[0], "nombre");
  if (mismos.length > 1) {
    return { tipo: "dudoso", empleado: e, motivo: "nombre_repetido", legajos: mismos, detalle: `${mismos.length} legajos sin vincular se llaman igual: no se sabe cuál es` };
  }

  // 4. No tiene legajo.
  if (!e.active) return { tipo: "ignorar", empleado: e, motivo: "archivado_sin_legajo" };
  const operario = esOperario(e);
  if (operario === false) return { tipo: "ignorar", empleado: e, motivo: "administrativo" };
  if (operario === null) {
    return { tipo: "dudoso", empleado: e, motivo: "sin_regimen", legajos: [], detalle: "No tiene régimen de liquidación ni tarea en Odoo: no se sabe si es de obra" };
  }
  const homonimo = n ? deOtro.find((l) => normNombre(`${l.apellido} ${l.nombre}`) === n) : undefined;
  if (homonimo) {
    return { tipo: "dudoso", empleado: e, motivo: "nombre_de_otro", legajos: [homonimo], detalle: `Ya hay un legajo ${nombreLegajo(homonimo)} vinculado a otro empleado de Odoo (#${homonimo.odoo_employee_id}): ¿es la misma persona cargada dos veces?` };
  }

  const { apellido, nombre } = partirNombre(e.name);
  const usados = dnisUsados ?? new Set(legajos.map((l) => l.dni ?? "").filter(Boolean));
  let dniNuevo = dni ?? dniProvisorio(apellido, nombre);
  if (usados.has(dniNuevo)) dniNuevo = `${dniProvisorio(apellido, nombre)}-ODOO${e.id}`;
  const tarea = texto(e.x_tarea);
  return {
    tipo: "crear",
    empleado: e,
    fila: {
      apellido,
      nombre,
      dni: dniNuevo,
      telefono: celularDe(e),
      puesto: tarea === "chofer" ? "chofer" : "operario",
      activo: true,
      odoo_employee_id: e.id,
      odoo_tarea: tarea,
    },
  };
}

export type Pasada = {
  decisiones: Decision[];
  /** Legajos vinculados a un empleado que ya no existe en Odoo: se desactivan. */
  huerfanos: { legajo: Legajo; cambios: CambiosLegajo }[];
};

/**
 * La pasada completa (control diario y puesta al día): todos los empleados, activos y
 * archivados. Va en orden y va aplicando en memoria lo que decide, así un legajo no lo
 * reclaman dos empleados y dos altas no comparten DNI.
 *
 * `completa` = la lista de empleados es TODO Odoo (activos y archivados). Sólo entonces
 * un vínculo a un id que no aparece quiere decir "lo borraron".
 */
export function pasada(empleados: readonly EmpleadoOdoo[], legajos: readonly Legajo[], { completa = true } = {}): Pasada {
  const vivos = legajos.map((l) => ({ ...l }));
  const dnis = new Set(vivos.map((l) => l.dni ?? "").filter(Boolean));
  const decisiones: Decision[] = [];
  // Los ya vinculados primero: si no, un empleado nuevo con el nombre de uno vinculado más
  // abajo en la lista podría reclamar su legajo antes que él.
  const orden = [...empleados].sort((a, b) => {
    const va = vivos.some((l) => Number(l.odoo_employee_id) === a.id) ? 0 : 1;
    const vb = vivos.some((l) => Number(l.odoo_employee_id) === b.id) ? 0 : 1;
    return va - vb || a.id - b.id;
  });
  for (const e of orden) {
    const d = decidir(e, vivos, dnis);
    decisiones.push(d);
    if (d.tipo === "actualizar") Object.assign(vivos.find((l) => l.id === d.legajo.id)!, d.cambios);
    if (d.tipo === "crear") {
      vivos.push({ id: `nuevo:${e.id}`, ...d.fila });
      dnis.add(d.fila.dni);
    }
  }
  const ids = new Set(empleados.map((e) => e.id));
  const huerfanos = completa
    ? legajos
        .filter((l) => l.odoo_employee_id != null && !ids.has(Number(l.odoo_employee_id)) && l.activo)
        .map((legajo) => ({ legajo, cambios: { activo: false } as CambiosLegajo }))
    : [];
  return { decisiones, huerfanos };
}

/** Una línea legible por decisión (log del webhook, salida del script). */
export function describir(d: Decision): string {
  const e = `${d.empleado.name} (#${d.empleado.id})`;
  switch (d.tipo) {
    case "actualizar":
      return `${e} → ${nombreLegajo(d.legajo)} (por ${d.como}): ${Object.entries(d.cambios)
        .map(([k, v]) => `${k} ${String((d.legajo as Record<string, unknown>)[k] ?? "—")} → ${String(v ?? "—")}`)
        .join(", ")}`;
    case "sin_cambios":
      return `${e} → ${nombreLegajo(d.legajo)}: al día`;
    case "crear":
      return `${e} → legajo NUEVO ${d.fila.apellido}, ${d.fila.nombre} · puesto ${d.fila.puesto} · DNI ${d.fila.dni} · tel ${d.fila.telefono ?? "—"} · tarea ${d.fila.odoo_tarea ?? "—"}`;
    case "ignorar":
      return `${e}: ${d.motivo === "administrativo" ? "administrativo, no lleva legajo" : "archivado y sin legajo"}`;
    case "dudoso":
      return `${e}: DUDOSO (${d.motivo}) — ${d.detalle}`;
  }
}
