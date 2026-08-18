// El x_name de la OT viene armado desde Odoo con un formato estable:
//
//   "Armado · S02246 · Pablo Riedel — Av. Directorio 2461"
//   "Desarme · S00719 · Av. Callao 1810 (FACHADA CALLAO)"   ← sin cliente
//   "Armado · S01933 · Granz SRL"                            ← sin dirección
//
// Partirlo permite darle a la dirección la línea que merece: es lo que Operaciones
// usa para identificar la obra. Si el formato no coincide, se devuelve el título
// entero como principal y no se pierde información.

export type PartesTitulo = {
  tipo: string | null;
  numero: string | null;
  cliente: string | null;
  /** Lo que identifica la obra en pantalla: la dirección si la hay, si no el cliente. */
  principal: string;
};

const SEPARADOR_CAMPOS = " · ";
const SEPARADOR_CLIENTE = " — ";

export function partesTitulo(titulo: string): PartesTitulo {
  const campos = titulo.split(SEPARADOR_CAMPOS).map((c) => c.trim());

  if (campos.length < 3) {
    return { tipo: null, numero: null, cliente: null, principal: titulo.trim() };
  }

  const [tipo, numero, ...resto] = campos;
  const cola = resto.join(SEPARADOR_CAMPOS);
  const corte = cola.indexOf(SEPARADOR_CLIENTE);

  if (corte === -1) {
    return { tipo, numero, cliente: null, principal: cola };
  }
  return {
    tipo,
    numero,
    cliente: cola.slice(0, corte).trim(),
    principal: cola.slice(corte + SEPARADOR_CLIENTE.length).trim(),
  };
}

/** Normaliza para buscar sin depender de tildes ni mayúsculas. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
