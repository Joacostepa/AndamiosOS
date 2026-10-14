// Validación de CUIT/CUIL por dígito verificador.
//
// Criterio §5.20: los formularios de alta llegan con errores de dígito con frecuencia. Un CUIT
// que no valida NO se carga en Odoo: se marca y se pide confirmarlo contra la constancia.
//
// CUIT DE 10 DÍGITOS (traba 1 del handoff): casi siempre es un DNI de 7 cifras al que le falta
// el 0 de adelante (Ramírez: 20-8632598-6 → 20-08632598-6). Se propone el 0 agregado, con el
// verificador que corresponde, para que el vendedor lo confirme con el cliente: no se carga solo.

export type PropuestaCuit = {
  /** Con guiones: 20-08632598-6. */
  cuit: string;
  /** true si el verificador que trajo coincide con el 0 agregado; si no, va el calculado. */
  verificadorCoincide: boolean;
};

export type ResultadoCuit =
  | { valido: true; normalizado: string; digitos: string; tipo: "persona_juridica" | "persona_fisica" }
  | { valido: false; motivo: string; propuesta?: PropuestaCuit };

const PREFIJOS_FISICA = new Set(["20", "23", "24", "25", "26", "27"]);
const PREFIJOS_JURIDICA = new Set(["30", "33", "34"]);
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** El dígito verificador de los 10 primeros dígitos. */
export function verificadorCuit(diez: string): number {
  const suma = PESOS.reduce((a, p, i) => a + p * Number(diez[i]), 0);
  const resto = 11 - (suma % 11);
  return resto === 11 ? 0 : resto === 10 ? 9 : resto;
}

const conGuiones = (d: string) => `${d.slice(0, 2)}-${d.slice(2, 10)}-${d[10]}`;

/** Un CUIT de 10 dígitos con prefijo válido: el 0 que falta va después del prefijo. */
function proponerCero(digitos: string): PropuestaCuit | null {
  const prefijo = digitos.slice(0, 2);
  if (!PREFIJOS_FISICA.has(prefijo) && !PREFIJOS_JURIDICA.has(prefijo)) return null;
  const once = `${prefijo}0${digitos.slice(2)}`;
  const esperado = verificadorCuit(once);
  if (esperado === Number(once[10])) return { cuit: conGuiones(once), verificadorCoincide: true };
  return { cuit: conGuiones(`${once.slice(0, 10)}${esperado}`), verificadorCoincide: false };
}

export function validarCuit(entrada: string): ResultadoCuit {
  const digitos = (entrada ?? "").replace(/\D/g, "");
  if (digitos.length === 10) {
    const propuesta = proponerCero(digitos);
    if (propuesta) {
      return {
        valido: false,
        motivo: propuesta.verificadorCoincide
          ? `Tiene 10 dígitos: seguramente falta el 0 del DNI. Con el 0 queda ${propuesta.cuit}, que valida: confirmalo con el cliente antes de cargarlo.`
          : `Tiene 10 dígitos: puede faltar el 0 del DNI, pero con el 0 el verificador no coincide; el que correspondería es ${propuesta.cuit}. Pedí el CUIT de la constancia.`,
        propuesta,
      };
    }
  }
  if (digitos.length !== 11) return { valido: false, motivo: `Tiene ${digitos.length} dígitos: un CUIT tiene 11.` };
  const prefijo = digitos.slice(0, 2);
  const fisica = PREFIJOS_FISICA.has(prefijo);
  if (!fisica && !PREFIJOS_JURIDICA.has(prefijo)) return { valido: false, motivo: `El prefijo ${prefijo} no es de un CUIT (20, 23, 24, 27, 30, 33, 34…).` };
  const esperado = verificadorCuit(digitos);
  if (esperado !== Number(digitos[10])) {
    return { valido: false, motivo: `El dígito verificador no coincide (termina en ${digitos[10]}, debería terminar en ${esperado}): probablemente hay un número mal tipeado.` };
  }
  return {
    valido: true,
    digitos,
    normalizado: conGuiones(digitos),
    tipo: fisica ? "persona_fisica" : "persona_juridica",
  };
}
