// Lluvia y viento por día, para el encabezado del tablero.
//
// QUÉ SE MUESTRA Y POR QUÉ NO ES UN ÍCONO DEL CLIMA. Un sol o una nube son decorativos:
// nadie replanifica porque el día esté parcialmente nublado. Lo que para una obra de
// andamios es la LLUVIA y sobre todo el VIENTO —armar en altura con viento es un tema de
// seguridad, no de comodidad—, así que el tablero muestra esos dos y nada más.
//
// FUENTE: MET Norway (api.met.no), el instituto meteorológico noruego, el mismo que está
// detrás de Yr. Se eligió por tres razones y la tercera es la que descartó a las otras:
//   · es un servicio meteorológico oficial, no un agregador que revende;
//   · los datos son CC BY 4.0 —hay que dar crédito, y se da en el tooltip del chip—;
//   · PERMITE USO COMERCIAL. Open-Meteo, que era la candidata obvia y encima da ráfagas y
//     16 días, prohíbe explícitamente el uso comercial en su API gratis ("integrating our
//     service into commercial products"). Esto es una herramienta interna de la empresa,
//     o sea uso comercial. Su plan pago lo habilita: si algún día se quiere ráfagas y más
//     horizonte, se cambia SÓLO este archivo.
//
// LO QUE ESTA FUENTE NO DA PARA ARGENTINA: ráfagas (`wind_speed_of_gust`) ni probabilidad
// de lluvia. Acá corre el modelo global, y sólo trae viento sostenido y milímetros.
// Verificado contra la respuesta real, no contra la documentación. Los milímetros son
// mejor dato que la probabilidad —"van a caer 12mm" decide, "60% de probabilidad" no— y el
// viento sostenido sirve de proxy de la ráfaga, pero conviene saber que es un proxy.
//
// HORIZONTE: nueve días. El tablero llega a ocho semanas para cada lado, así que la enorme
// mayoría de las columnas no va a tener dato. Por eso el chip aparece SÓLO cuando hay algo
// que avisar y la ausencia nunca significa "va a estar lindo": el encabezado pone la línea
// del clima en su tooltip cuando hay dato, y no la pone cuando no lo hay.

/** Un día con lo único que decide algo: cuánta agua y cuánto viento en horario de trabajo. */
export type ClimaDia = {
  fecha: string;
  /** Milímetros acumulados dentro de la ventana laboral. */
  mm: number;
  /** Viento sostenido máximo dentro de la ventana laboral, en km/h. */
  viento: number;
  nivel: "nada" | "aviso" | "fuerte";
};

// CABA. Cuatro decimales porque MET devuelve 403 con cinco o más: pedir el pronóstico con
// precisión de metros es pedirle al servidor que cachee un punto por usuario.
const LAT = -34.6037;
const LON = -58.3816;

/**
 * La jornada, no el día calendario. Que llueva a las 3 de la mañana no para a nadie; el
 * dato que sirve es el de las horas en que la cuadrilla está arriba del andamio.
 */
const HORA_DESDE = 6;
const HORA_HASTA = 19;

/** Argentina no tiene horario de verano desde 2009, así que el offset es fijo. */
const UTC_OFFSET_HS = -3;

// UMBRALES. Salen de qué frena una cuadrilla, no de qué es "mal tiempo":
//   · llovizna de menos de 2mm se trabaja; de 10mm para arriba no se arma nada;
//   · 30 km/h ya molesta en altura, 40 km/h es motivo para no subir.
// Están acá arriba y sueltos a propósito: son lo primero que se va a querer calibrar
// después de un par de semanas de mirarlos contra la realidad.
const LLUVIA_AVISO = 2;
const LLUVIA_FUERTE = 10;
const VIENTO_AVISO = 30;
const VIENTO_FUERTE = 40;

/**
 * MET exige identificarse con un User-Agent que diga quién sos y cómo contactarte, y
 * bloquea sin avisar al que no lo hace. Va el dominio de la empresa, no un mail personal.
 */
const AGENTE = "AndamiosOS/1.0 (andamiosbuenosaires.com.ar)";

const URL =
  `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${LAT}&lon=${LON}`;

type Punto = {
  time: string;
  data: {
    instant?: { details?: { wind_speed?: number } };
    next_1_hours?: { details?: { precipitation_amount?: number } };
    next_6_hours?: { details?: { precipitation_amount?: number } };
  };
};

/** La hora y el día LOCALES de un instante UTC. */
function local(iso: string): { dia: string; hora: number } {
  const d = new Date(new Date(iso).getTime() + UTC_OFFSET_HS * 3_600_000);
  return { dia: d.toISOString().slice(0, 10), hora: d.getUTCHours() };
}

function nivelDe(mm: number, viento: number): ClimaDia["nivel"] {
  if (mm >= LLUVIA_FUERTE || viento >= VIENTO_FUERTE) return "fuerte";
  if (mm >= LLUVIA_AVISO || viento >= VIENTO_AVISO) return "aviso";
  return "nada";
}

/**
 * El pronóstico crudo, agregado por día.
 *
 * La serie viene HORA A HORA los primeros dos días y cada SEIS de ahí en adelante, así que
 * la lluvia no se puede sumar punto por punto: hay que llevar hasta dónde se cubrió para no
 * contar dos veces el mismo bloque de seis horas. El viento sí sale del instante, y en los
 * días lejanos queda medido con dos muestras — subestima, y es lo que hay.
 */
function agregar(serie: Punto[]): Map<string, ClimaDia> {
  const dias = new Map<string, ClimaDia>();
  const tomar = (dia: string) => {
    const actual = dias.get(dia);
    if (actual) return actual;
    const nuevo: ClimaDia = { fecha: dia, mm: 0, viento: 0, nivel: "nada" };
    dias.set(dia, nuevo);
    return nuevo;
  };

  let cubiertoHasta = 0;
  for (const p of serie) {
    const t = new Date(p.time).getTime();
    if (Number.isNaN(t)) continue;

    const porHora = p.data.next_1_hours;
    const porSeis = p.data.next_6_hours;
    const bloque = porHora ?? porSeis;
    if (bloque && t >= cubiertoHasta) {
      const horas = porHora ? 1 : 6;
      const mm = bloque.details?.precipitation_amount ?? 0;
      // El bloque se reparte entre las horas que cubre y sólo suman las laborales: un
      // frente de 12mm que pasa de madrugada no tiene por qué teñir el día.
      for (let h = 0; h < horas; h++) {
        const { dia, hora } = local(new Date(t + h * 3_600_000).toISOString());
        if (hora >= HORA_DESDE && hora < HORA_HASTA) tomar(dia).mm += mm / horas;
      }
      cubiertoHasta = t + horas * 3_600_000;
    }

    const v = p.data.instant?.details?.wind_speed;
    const { dia, hora } = local(p.time);
    if (typeof v === "number" && hora >= HORA_DESDE && hora < HORA_HASTA) {
      const d = tomar(dia);
      d.viento = Math.max(d.viento, v * 3.6);
    }
  }

  for (const d of dias.values()) {
    d.mm = Math.round(d.mm * 10) / 10;
    d.viento = Math.round(d.viento);
    d.nivel = nivelDe(d.mm, d.viento);
  }
  return dias;
}

/**
 * Los días del rango que caen dentro del horizonte del pronóstico.
 *
 * Devuelve `[]` si el servicio no contesta: el clima es un adorno útil del encabezado, y
 * que falte no puede impedir que el tablero cargue. A diferencia de los feriados no hay
 * respaldo local posible — un pronóstico viejo es peor que ninguno.
 */
export async function climaDelRango(desde: string, hasta: string): Promise<ClimaDia[]> {
  try {
    const res = await fetch(URL, {
      headers: { "User-Agent": AGENTE, Accept: "application/json" },
      // MET actualiza el modelo cada hora y pide no machacar. Una hora de cache deja el
      // dato fresco y saca la llamada externa del camino de cada apertura del tablero:
      // son ~24 requests por día para toda la empresa, no uno por usuario.
      next: { revalidate: 3_600 },
    });
    if (!res.ok) return [];

    const crudo: unknown = await res.json();
    const serie = (crudo as { properties?: { timeseries?: unknown } })?.properties?.timeseries;
    if (!Array.isArray(serie)) return [];

    return [...agregar(serie as Punto[]).values()]
      .filter((d) => d.fecha >= desde && d.fecha <= hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  } catch {
    return [];
  }
}
