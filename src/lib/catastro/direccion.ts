// La dirección de la obra como la entiende el catastro: calle y altura, nada más.
//
// Medido en las charlas (auditoría 12/10): 16 de los 33 errores de herramienta fueron la
// dirección cargada con texto de más («Ayacucho 665 - Colegio La Salle», «Av. Callao 5 (CABA)»).
// USIG no la reconoce y el modelo reintenta a ciegas. Se prueban variantes cada vez más limpias.

const BARRIOS = [
  "Agronomía", "Almagro", "Balvanera", "Barracas", "Belgrano", "Boedo", "Caballito", "Chacarita", "Coghlan", "Colegiales",
  "Constitución", "Flores", "Floresta", "La Boca", "La Paternal", "Liniers", "Mataderos", "Monte Castro", "Montserrat",
  "Monserrat", "Nueva Pompeya", "Núñez", "Palermo", "Parque Avellaneda", "Parque Chacabuco", "Parque Chas", "Parque Patricios",
  "Puerto Madero", "Recoleta", "Retiro", "Saavedra", "San Cristóbal", "San Nicolás", "San Telmo", "Vélez Sarsfield", "Versalles",
  "Villa Crespo", "Villa del Parque", "Villa Devoto", "Villa General Mitre", "Villa Lugano", "Villa Luro", "Villa Ortúzar",
  "Villa Pueyrredón", "Villa Real", "Villa Riachuelo", "Villa Santa Rita", "Villa Soldati", "Villa Urquiza", "Microcentro",
];

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Ciudad y barrio al final («…, CABA», «… Recoleta»): sobran para el catastro. */
const COLA = new RegExp(
  `[\\s,]+(${["C\\.?\\s?A\\.?\\s?B\\.?\\s?A\\.?", "Capital Federal", "Ciudad Aut[oó]noma de Buenos Aires", "Buenos Aires", ...BARRIOS.map((b) => escapar(sinAcentos(b)))].join("|")})\\s*$`,
  "i",
);

/** Abreviaturas que USIG a veces no toma: «Av.», «Avda.», «Dr.», «Gral.», «Pte.», «Cnel.», «Ing.». */
const TITULOS = /\b(av(da)?|avenida|dr|doctor|gral|pte|cnel|ing)\.?\s+/gi;

function sacarCola(s: string): string {
  const nfc = s.normalize("NFC");
  // Sin acentos tiene el mismo largo que en NFC: el índice sirve para cortar el original.
  const m = COLA.exec(sinAcentos(nfc));
  return m ? nfc.slice(0, m.index).trim() : nfc;
}

/** Corta en « - », «(», «,» o « / »: lo que sigue es el nombre del edificio, el barrio o una nota. */
export function calleYAltura(direccion: string): string {
  let s = direccion.replace(/\s+/g, " ").trim().split(/\s[-–—]\s|\(|,|\s\/\s/)[0].trim();
  for (let antes = ""; antes !== s; ) {
    antes = s;
    s = sacarCola(s);
  }
  return s;
}

/**
 * Las variantes a probar contra el catastro, de la más fiel a la más limpia y sin repetir: tal
 * cual, sólo calle y altura, y sin «Av.»/«Dr.» y parecidos.
 */
export function variantesDireccion(direccion: string): string[] {
  const tal = direccion.replace(/\s+/g, " ").trim();
  const limpia = calleYAltura(tal);
  const sinTitulos = limpia.replace(TITULOS, "").replace(/\s+/g, " ").trim();
  return [...new Set([tal, limpia, sinTitulos].filter((x) => /\d/.test(x) && x.length > 2))];
}
