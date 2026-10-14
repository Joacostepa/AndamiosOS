// Validación de CUIT/CUIL por dígito verificador.
//
// Criterio §5.20: los formularios de alta llegan con errores de dígito con frecuencia. Un CUIT
// que no valida NO se carga en Odoo: se marca y se pide confirmarlo contra la constancia.

export type ResultadoCuit =
  | { valido: true; normalizado: string; digitos: string; tipo: "persona_juridica" | "persona_fisica" }
  | { valido: false; motivo: string };

const PREFIJOS_FISICA = new Set(["20", "23", "24", "25", "26", "27"]);
const PREFIJOS_JURIDICA = new Set(["30", "33", "34"]);
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function validarCuit(entrada: string): ResultadoCuit {
  const digitos = (entrada ?? "").replace(/\D/g, "");
  if (digitos.length !== 11) return { valido: false, motivo: `Tiene ${digitos.length} dígitos: un CUIT tiene 11.` };
  const prefijo = digitos.slice(0, 2);
  const fisica = PREFIJOS_FISICA.has(prefijo);
  if (!fisica && !PREFIJOS_JURIDICA.has(prefijo)) return { valido: false, motivo: `El prefijo ${prefijo} no es de un CUIT (20, 23, 24, 27, 30, 33, 34…).` };
  const suma = PESOS.reduce((a, p, i) => a + p * Number(digitos[i]), 0);
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  if (esperado !== Number(digitos[10])) {
    return { valido: false, motivo: `El dígito verificador no coincide (termina en ${digitos[10]}, debería terminar en ${esperado}): probablemente hay un número mal tipeado.` };
  }
  return {
    valido: true,
    digitos,
    normalizado: `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos[10]}`,
    tipo: fisica ? "persona_fisica" : "persona_juridica",
  };
}
