// Compresión de fotos del parte, del lado del cliente.
//
// POR QUÉ: las fotos de celular pesan varios MB y se suben de a muchas. Mandarlas
// crudas a Odoo en base64 (que además infla ~33%) hace que el cierre tarde o falle.
// Redimensionar a 1600px y pasar a JPEG deja archivos de unos cientos de KB sin perder
// lectura de la obra.

const LADO_MAX = 1600;
const CALIDAD = 0.75;

export type FotoComprimida = {
  nombre: string;
  /** base64 sin el prefijo data:, que es lo que espera el campo binario de Odoo. */
  base64: string;
  /** Para previsualizar sin volver a leer el archivo. */
  dataUrl: string;
  bytes: number;
};

function medidas(ancho: number, alto: number): { ancho: number; alto: number } {
  const lado = Math.max(ancho, alto);
  if (lado <= LADO_MAX) return { ancho, alto };
  const escala = LADO_MAX / lado;
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

async function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`No se pudo leer ${archivo.name}`));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function comprimirFoto(archivo: File): Promise<FotoComprimida> {
  const img = await cargarImagen(archivo);
  const { ancho, alto } = medidas(img.naturalWidth, img.naturalHeight);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no pudo procesar la imagen");
  ctx.drawImage(img, 0, 0, ancho, alto);

  const dataUrl = canvas.toDataURL("image/jpeg", CALIDAD);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return {
    nombre: archivo.name,
    base64,
    dataUrl,
    // El base64 ocupa 4 caracteres por cada 3 bytes.
    bytes: Math.round((base64.length * 3) / 4),
  };
}

export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
