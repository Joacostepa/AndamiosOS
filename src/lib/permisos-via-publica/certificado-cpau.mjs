// El certificado del CPAU que va a TAD como "Certificado de Encomienda Profesional": cómo se
// reconoce y de qué encomienda es. Lo usan el robot, que lo busca en el mail (robot/cpau-cierre.mjs),
// y la subida a mano de la ficha (api/permisos-via-publica/tramites/[id]/certificado). Es JS puro y
// sin dependencias porque el robot corre fuera de Next y no puede importar TS. Recibe el texto que
// saca unpdf, hoja por hoja.
//
// DOS FORMATOS:
//   - Viejo (hasta octubre de 2026): un PDF de 5 o 6 hojas. Trae el registro firmado y sellado ×3
//     ("Número de Registro <R.Nro sin ceros>"), la certificación ("… CERTIFICA QUE") y el
//     comprobante de pago. Se sabe de qué encomienda es por el R.Nro.
//   - Nuevo (noviembre de 2026; trabó las tareas 121 a 124): sólo la certificación, 1 hoja, firmada
//     digitalmente por el CPAU. NO trae el R.Nro. Se sabe de qué encomienda es por el inmueble
//     ("En el inmueble/predio sito en: TRES ARROYOS (2964 - 2964)"), que es el frente que cargó el
//     robot en el CPAU, más el comitente (ABA), la tarea (habilitación de estructura transitoria) y
//     la matrícula de Hougassian. Trae el número RETP ("RETP: 2902298"), que es único por encomienda:
//     se guarda para no asignarle el mismo certificado a dos trámites.
//
// Lo peor que puede pasar es cargarle a un trámite el certificado de OTRO: ante la duda, no coincide.

const MATRICULA = "12658"; // Hougassian

/** R.Nro sin ceros adelante, como lo imprime el registro ("Número de Registro 329522116"). */
export const registroCorto = (registro) => String(registro ?? "").replace(/\D/g, "").replace(/^0+/, "");

/** Mayúsculas, sin tildes, espacios simples. Conserva la puntuación. */
const mayus = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

const AVENIDA = new Set(["AV", "AVDA", "AVENIDA"]);

/**
 * Las palabras de un nombre de calle, sin "AV."/"AVENIDA" (el catastro escribe "OLLEROS AV." y en
 * otros lados va adelante). `abreviada` = estaba escrita con punto ("MANUEL R."): sólo esas pueden ser
 * el comienzo de otra palabra.
 */
function palabrasDeCalle(calle) {
  return mayus(calle)
    .split(/[\s,;]+/)
    .map((w) => ({ p: w.replace(/[^A-Z0-9]/g, ""), abreviada: /\.$/.test(w) }))
    .filter((w) => w.p && !AVENIDA.has(w.p));
}

/**
 * Las dos son la misma calle: las mismas palabras, en el mismo orden. Una palabra escrita con punto
 * puede ser el comienzo de la otra ("TRELLES, MANUEL R." = "TRELLES MANUEL RICARDO"); sin punto
 * tiene que ser igual ("VALLE" ≠ "VALLEJOS", "PAZ" ≠ "PAZ SOLDAN").
 */
export function mismaCalle(a, b) {
  const x = palabrasDeCalle(a);
  const y = palabrasDeCalle(b);
  if (!x.length || x.length !== y.length) return false;
  return x.every((w, i) => {
    const v = y[i];
    if (w.p === v.p) return true;
    if (w.abreviada && v.p.startsWith(w.p)) return true;
    return v.abreviada && w.p.startsWith(v.p);
  });
}

/** El frente de una encomienda: la calle (la del catálogo del CPAU o la del catastro) y la numeración. */
export function mismoFrente(a, b) {
  if (!a || !b) return false;
  if (Number(a.desde) !== Number(b.desde) || Number(a.hasta) !== Number(b.hasta)) return false;
  const callesA = [a.calle_cpau, a.calle].filter(Boolean);
  const callesB = [b.calle_cpau, b.calle].filter(Boolean);
  return callesA.some((x) => callesB.some((y) => mismaCalle(x, y)));
}

/**
 * Lo que dice el PDF, sin decidir nada todavía. `paginas` = el texto de cada hoja.
 *   registros: los "Número de Registro N" que trae (formato viejo), sin ceros adelante.
 *   inmueble:  { calle, desde, hasta } de "sito en: CALLE (desde - hasta)", o null.
 *   retp:      el número RETP, o null.
 */
export function leerCertificado(paginas) {
  const lista = Array.isArray(paginas) ? paginas : [String(paginas ?? "")];
  const texto = lista.map((t) => String(t ?? "").replace(/\s+/g, " ")).join(" ");
  const plano = mayus(texto);
  const registros = [...plano.matchAll(/NUMERO DE REGISTRO:?\s*(\d{6,11})/g)].map((m) => registroCorto(m[1]));
  const sitio = plano.match(/SITO EN:?\s*([^()]+?)\s*\(\s*(\d{1,6})\s*-\s*(\d{1,6})\s*\)/);
  return {
    hojas: lista.length,
    certifica: /CERTIFICA QUE/.test(plano),
    registros: [...new Set(registros)],
    estructuraTransitoria: /HABILITACION ESTRUCTURA TRANSITORIA/.test(plano),
    comitenteAba: /EMPRENDIMIENTOS Y ESTRUCTURAS/.test(plano),
    matricula: /HOUGASSIAN/.test(plano) && new RegExp(`\\b${MATRICULA}\\b`).test(plano),
    comprobante: /ENC N\S*:\s*\d+\/\d+/.test(plano) || /SISTEMA PAGO SEGURO/.test(plano),
    retp: plano.match(/RETP:?\s*(?:N(?:RO|°|º)?\.?\s*)?(\d{5,9})\b/)?.[1] ?? null,
    inmueble: sitio ? { calle: sitio[1].trim(), desde: Number(sitio[2]), hasta: Number(sitio[3]) } : null,
  };
}

const textoInmueble = (i) => (i ? `${i.calle} ${i.desde === i.hasta ? i.desde : `${i.desde}-${i.hasta}`}` : "sin dato");
const textoFrente = (f) => (f ? `${f.calle_cpau ?? f.calle} ${Number(f.desde) === Number(f.hasta) ? f.desde : `${f.desde}-${f.hasta}`}` : "sin dato");

/**
 * ¿Este PDF es el certificado de esta encomienda? `encomienda` = { registro (R.Nro), frente
 * ({ calle, desde, hasta } del payload), calle_cpau (resultado.calle_cpau, el nombre del catálogo
 * del CPAU) }; cualquiera puede faltar (subida a mano sin tarea del robot).
 *
 * `opciones.aMano`: lo subió una persona desde la ficha después de mirarlo. Si el inmueble coincide con
 * el frente, la matrícula y el RETP que no se leen pasan a ser avisos (no bloquean): el robot frena
 * con eso y manda a subirlo a mano, y si la ficha lo volviera a bloquear no habría cómo cargarlo.
 *
 * @param {string[] | string} paginas
 * @param {{ registro?: string | null, frente?: { calle?: string, desde?: number, hasta?: number, calle_cpau?: string | null } | null, calle_cpau?: string | null }} [encomienda]
 * @param {{ aMano?: boolean }} [opciones]
 *
 * Devuelve:
 *   formato:   "viejo" (trae "Número de Registro"), "nuevo" (sólo la certificación) o null.
 *   deLaTarea: el PDF es de esta encomienda (viejo: el R.Nro; nuevo: certificación + estructura
 *              transitoria + comitente ABA + el inmueble igual al frente). Sin R.Nro ni frente para
 *              comparar, false.
 *   retp, inmueble: lo que se leyó.
 *   chequeos:  [{ clave, ok, bloquea, detalle }] como los de la revisión de documentos. Con alguno
 *              que bloquea en falso, no se carga como ok.
 */
export function revisarCertificado(paginas, encomienda = {}, opciones = {}) {
  const l = leerCertificado(paginas);
  const corto = registroCorto(encomienda.registro);
  const frente = encomienda.frente ? { ...encomienda.frente, calle_cpau: encomienda.calle_cpau ?? encomienda.frente.calle_cpau ?? null } : null;
  const certificacion = {
    clave: "certificacion", ok: l.certifica, bloquea: true,
    detalle: l.certifica ? "Trae la certificación del CPAU." : "No trae la certificación del CPAU («… CERTIFICA QUE»).",
  };
  const base = { retp: l.retp, inmueble: l.inmueble, hojas: l.hojas };

  if (l.registros.length) {
    const propio = corto ? l.registros.includes(corto) : false;
    const registro = corto
      ? { clave: "registro", ok: propio, bloquea: true, detalle: propio ? `Trae el registro ${corto}.` : `Trae el registro ${l.registros.join(", ")} y la encomienda es la ${corto}: es de otra encomienda.` }
      : { clave: "registro", ok: true, bloquea: false, detalle: `Trae el registro ${l.registros.join(", ")} (no hay R.Nro del robot para compararlo).` };
    return {
      ...base, formato: "viejo", deLaTarea: propio,
      chequeos: [
        registro,
        certificacion,
        { clave: "comprobante", ok: l.comprobante, bloquea: false, detalle: l.comprobante ? "Trae el comprobante de pago." : "No trae el comprobante de pago." },
        { clave: "hojas", ok: l.hojas >= 4, bloquea: true, detalle: l.hojas >= 4 ? `${l.hojas} hojas.` : `Tiene ${l.hojas} hojas y el formato con registro trae al menos 4 (registro ×3 y certificación).` },
      ],
    };
  }

  if (!l.certifica) return { ...base, formato: null, deLaTarea: false, chequeos: [certificacion] };

  const coincide = !!l.inmueble && !!frente && mismoFrente(l.inmueble, frente);
  const inmueble = !l.inmueble
    ? { clave: "inmueble", ok: false, bloquea: true, detalle: "No se pudo leer el inmueble («sito en: CALLE (desde - hasta)»): no se sabe de qué encomienda es." }
    : !frente
      ? { clave: "inmueble", ok: false, bloquea: false, detalle: `Es del inmueble ${textoInmueble(l.inmueble)}: no hay encomienda del robot para compararlo, controlá que sea el de este trámite.` }
      : coincide
        ? { clave: "inmueble", ok: true, bloquea: true, detalle: `Es del inmueble ${textoInmueble(l.inmueble)}, el frente de la encomienda.` }
        : { clave: "inmueble", ok: false, bloquea: true, detalle: `Es del inmueble ${textoInmueble(l.inmueble)} y la encomienda se cargó con ${textoFrente(frente)}: es de otra encomienda.` };
  // A mano y con el inmueble del frente: lo que no se pudo leer bien lo controló la persona.
  const revisado = !!opciones.aMano && coincide;
  const aControlar = (c) => (revisado && !c.ok ? { ...c, bloquea: false, detalle: `${c.detalle} Se carga igual porque lo subió una persona y el inmueble coincide: controlalo en el PDF.` } : c);
  return {
    ...base, formato: "nuevo",
    deLaTarea: l.certifica && l.estructuraTransitoria && l.comitenteAba && coincide,
    chequeos: [
      certificacion,
      { clave: "tarea", ok: l.estructuraTransitoria, bloquea: true, detalle: l.estructuraTransitoria ? "Es de habilitación de estructura transitoria." : "No dice «HABILITACIÓN ESTRUCTURA TRANSITORIA»: no es una encomienda de andamio." },
      { clave: "comitente", ok: l.comitenteAba, bloquea: true, detalle: l.comitenteAba ? "El comitente es Emprendimientos y Estructuras." : "El comitente no es Emprendimientos y Estructuras." },
      aControlar({ clave: "matricula", ok: l.matricula, bloquea: true, detalle: l.matricula ? `El profesional es Hougassian (matrícula ${MATRICULA}).` : `No figura Hougassian con la matrícula ${MATRICULA}.` }),
      inmueble,
      aControlar({ clave: "retp", ok: !!l.retp, bloquea: true, detalle: l.retp ? `RETP ${l.retp}.` : "No se pudo leer el número RETP: sin eso no se puede controlar que no esté cargado en otro trámite." }),
    ],
  };
}

/**
 * El RETP de un certificado ya cargado: el que se guardó o, en los de formato viejo, el del nombre
 * del archivo que manda el CPAU ("2897802.pdf").
 */
export function retpGuardado(certificado) {
  if (!certificado) return null;
  if (certificado.retp) return String(certificado.retp);
  return String(certificado.nombre ?? "").match(/^(\d{5,9})\.pdf$/i)?.[1] ?? null;
}
