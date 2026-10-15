/**
 * motor.js · Modelador ABA (maqueta) · núcleo paramétrico PURO (sin DOM, sin three).
 * ============================================================================
 * TODO CÁLCULO ES PREDIMENSIONADO. Pesos y stock son ILUSTRATIVOS. Reglas ⚠ provisorias
 * (propuesta-recomendada.md §2.7) hasta que las firme Hougassian.
 *
 * CONTRATO (todas las funciones son puras: no mutan sus argumentos, devuelven copias)
 * ---------------------------------------------------------------------------
 *   CATALOGO                      { piezas: {[codigo]: ItemCatalogo}, medidas, familias, supuestos, kits }
 *   PLANTILLAS                    Plantilla[]  (id, nombre, descripcion, icono, tipo, sistema, tecla, params)
 *   crearDiseno(plantillaId, overrides?)            → Diseno  (overrides = params parciales; además
 *                                                    acepta las claves nombre/sistema/origen/rumbo/obra)
 *   ejemploParana631()                              → Diseno  (fachada en L 14+8 × 18, estructura + pantalla)
 *   agregarEstructura(diseno, plantillaId, opciones?) → { diseno, estructuraId }
 *        opciones = { origen?:[x,z], rumbo?:deg, params?, nombre?, sistema?,
 *                     unirA?: { estructuraId, puerto, s?, modo?, puertoPropio? } }
 *   quitarEstructura(diseno, estructuraId)          → Diseno (borra también sus uniones y apoyos)
 *   construir(diseno)                               → Resultado (ver typedef)
 *   calcularBom(piezas, modo='kit'|'despiezado')    → LineaBom[]
 *   rellenarLargo(largo, sistema='multi', {ajuste:'final'|'centrado'}?) → Relleno
 *   cambiarSistema(estructura, 'multi'|'bastidor')  → { estructura, avisos: string[] }
 *   puertosDe(estructura, diseno?)                  → Puerto[] (mundo)
 *   buscarSnap(diseno, estructuraMovil, [x,z], {radio=2.5}?) → Snap|null
 *   unir(diseno, a:{estructuraId,puerto,s?}, b:{estructuraId,puerto?}, modo) → Diseno (mueve b)
 *   fusionarNodos(piezas)                           → { piezas, fusionadas, compartidas: {[parKey]: n} }
 *   setParam(diseno, estructuraId, ruta, valor)     → Diseno   (ruta tipo "params.frentes.1.largo")
 *   setOverride(diseno, estructuraId, celda "f:v:n", valor|null) → Diseno (merge; null borra)
 *   aplicarReparacion(diseno, accion)               → Diseno   (acciones de avisos y reglas)
 *   fmt(n, dec=2)                                   → "14,00"
 *
 * Coordenadas: metros, Y hacia arriba, planta en (x, z). rumbo en grados: dirección u = (cos r, sin r)
 * sobre (x, z). Normal exterior del frente n = (−sin r, cos r): el andamio crece hacia +n desde la
 * línea de verticales interiores (lado fachada) y el edificio queda del lado −n.
 * Ángulo de frente: +90 = quiebre convexo (el andamio envuelve la esquina del edificio), −90 = esquina
 * entrante, 0 = sigue derecho (partir frente).
 * Celdas: "f:v:n" = frente f, vano v, nivel n (todo base 0). La celda n es la banda entre el nivel
 * n−1 (o el arranque) y la cota del nivel n; su plataforma está en la cota del nivel n.
 *
 * VOLADIZO: no es un constructor aparte. Es la fachada multi con params.mensulas (por niveles/frentes) y el
 * pincel de celda {mensula:'afuera'|'fachada'|false}: así se combina con aberturas, lona y regeneración.
 * PÓRTICO "como base de la fachada": unir(d, {estructuraId: fachada, puerto:'f0:base', s}, {estructuraId: pórtico}, 'apoyo')
 * → la fachada queda con apoyaEn=[pórtico]; sus verticales sobre la huella arrancan en el tope del pórtico.
 * QUÉ ESTÁ SIMPLIFICADO (maqueta): ver SIMPLIFICACIONES más abajo; se exporta para mostrarlo en la UI.
 */

/**
 * @typedef {[number, number, number]} V3
 * @typedef {{codigo:string, descripcion:string, familia:string, sistema:'multi'|'bastidor'|'comun',
 *   largo:number|null, peso_kg:number|null, stock:number, unidad:string, rinde?:number,
 *   plausible?:boolean, enOdoo:boolean}} ItemCatalogo
 *   rinde: unidades de medida (m² o m) que cubre 1 unidad de compra (rollo, placa). plausible: código
 *   inventado con el estilo ABA (no está en Odoo).
 * @typedef {{id:string, nombre:string, descripcion:string, icono:string, tipo:'fachada'|'torre'|'portico',
 *   sistema:'multi'|'bastidor', tecla:string|null, params:object}} Plantilla
 * @typedef {{largo:number, angulo?:number, altura?:number, vanos?:number[]}} Frente
 * @typedef {{abertura?:boolean, viga?:boolean, sinPlataforma?:boolean, lona?:boolean,
 *   mensula?:'afuera'|'fachada'|false, anclaje?:boolean}} OverrideCelda
 * @typedef {{id:string, plantilla:string, tipo:'fachada'|'torre'|'portico', nombre:string,
 *   sistema:'multi'|'bastidor', origen:[number,number], rumbo:number, apoyaEn:string[],
 *   params:object, overrides:Object<string, OverrideCelda>}} Estructura
 * @typedef {{id:string, a:{estructuraId:string, puerto:string, s?:number},
 *   b:{estructuraId:string, puerto:string}, modo:'vertical_compartida'|'vano_giro'|'apoyo'}} Union
 * @typedef {{version:number, nombre:string, obra?:object, contexto:{terreno:string, enVereda:boolean,
 *   claseCarga:number}, estructuras:Estructura[], uniones:Union[], modoBom:'kit'|'despiezado'}} Diseno
 * @typedef {{id:string, codigo:string, tipo:string, a:V3, b:V3, peso_kg:number|null, estructuraId:string,
 *   celda?:string, nodo?:string, owner:string, kit?:{codigo:string, grupo:string}, medida?:number,
 *   primitivas?:{a:V3,b:V3}[]}} Pieza
 *   tipo ∈ vertical|horizontal|baranda|diagonal|plataforma|rodapie|base|collarin|anclaje|mensula|viga|
 *          escalera|zanca|bastidor|rienda|cruceta|cubierta|accesorio
 *   medida: m² (cubierta, fenólico) o m (concertina) para códigos con rinde.
 * @typedef {{etiqueta:string, accion:object}} Reparacion
 * @typedef {{id:string, nivel:'error'|'aviso'|'info', texto:string, estructuraId:string|null,
 *   celda?:string, reparaciones:Reparacion[]}} Aviso
 * @typedef {{id:string, texto:string, estructuraId:string|null, deshacer?:object}} Regla
 * @typedef {{id:string, estructuraId:string, tipo:'cara'|'extremo'|'base'|'tope', etiqueta:string,
 *   p0:V3, p1:V3, normal:V3, d:V3, largo:number, cols:number[], altura:number}} Puerto
 *   cols: posiciones (m desde p0 hacia p1) donde hay verticales. d: dirección p0→p1.
 * @typedef {{codigo:string, descripcion:string, familia:string, cantidad:number, unidad:string,
 *   peso_unit:number|null, peso_total:number|null, stock:number, falta:number, plausible:boolean,
 *   esKit:boolean}} LineaBom
 * @typedef {{vanos:number[], texto:string, desvio:number, total:number,
 *   alternativas:{id:string, etiqueta:string, vanos:number[], texto:string, desvio:number}[]}} Relleno
 * @typedef {{piezas:Pieza[], celdas:object[], estructuras:object[], puertos:Puerto[], uniones:object[],
 *   bom:LineaBom[], resumen:object, avisos:Aviso[], reglasAplicadas:Regla[], ms:number}} Resultado
 */

export const VERSION_MOTOR = '0.1.0-maqueta';
export const PREDIMENSIONADO = 'PREDIMENSIONADO';

export const SIMPLIFICACIONES = [
  'Pesos y stock ilustrativos. Algunos códigos van "sin peso" a propósito.',
  'Reglas ⚠ provisorias y fijas (diagonales cada ≤5 vanos, anclajes al tresbolillo 2×2, tablones por ancho).',
  'Niveles cada 2,00 m (paso de roseta 0,50). El arranque se regula entre 0,25 y 0,75 m.',
  'Bastidor: se asume 1,30 × 1,80 (Odoo), cuerpo STD 2,50 / JR 1,50. Kit = 1 bastidor + 2 riendas H + 2 riendas D; el último bastidor de cada tira y los tablones van sueltos.',
  'Zancas, vigas puente/celosía y ménsulas son representativas. Vigas de celosía de 5,00/6,00/7,50 y ménsulas de 0,73/1,09 son códigos plausibles (no están en Odoo).',
  'Voladizo = misma fachada multidireccional con el parámetro mensulas[{lado, brazo, desdeNivel, hastaNivel?, frentes?}] más el pincel de celda (mensula: afuera|fachada). La plantilla "Voladizo con ménsulas" es solo un preset (retiro 1,20 + ménsulas de 1,09 hacia la fachada desde el nivel 2).',
  'Esquinas solo a 90°. Esquina de bastidor con nudos giratorios (supuesto).',
  'Semáforo solo geométrico: H/B, gálibo, paso, diagonales y anclajes. No hay verificación M0x.',
];

// ───────────────────────────── utilidades ─────────────────────────────
const EPS = 1e-6;
const mm = (v) => Math.round(v * 1000);
const r3 = (v) => Math.round(v * 1000) / 1000;
const deg = (r) => (r * Math.PI) / 180;
const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const cod3 = (len) => String(Math.round(len * 100)).padStart(3, '0');
const mod = (a, b) => ((a % b) + b) % b;
const sum = (arr) => arr.reduce((s, x) => s + x, 0);
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const fmt = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const fmtKg = (v) => Math.round(v).toLocaleString('es-AR');

// ───────────────────────────── catálogo ─────────────────────────────
const F = {
  VERT: 'Verticales', HOR: 'Horizontales y barandas', DIAG: 'Diagonales', PLAT: 'Plataformas',
  RDPE: 'Rodapiés', BASE: 'Bases', ANC: 'Anclajes', MENS: 'Ménsulas', VIGA: 'Vigas', ACC: 'Accesos',
  BAST: 'Bastidores', KIT: 'Módulos (kit)', CUB: 'Cubiertas', VP: 'Vía pública', UNI: 'Uniones',
};
const ORDEN_FAMILIAS = [F.KIT, F.BAST, F.VERT, F.HOR, F.DIAG, F.PLAT, F.RDPE, F.MENS, F.VIGA, F.ACC, F.ANC, F.BASE, F.CUB, F.VP, F.UNI];

// [codigo, descripcion, familia, sistema, largo, peso_kg|null, stock, extra?]
const FILAS = [
  ['VERT-050-CE', 'VERTICAL 0.50m CON ESPIGA', F.VERT, 'multi', 0.5, 3.1, 420],
  ['VERT-100-CE', 'VERTICAL 1.00m CON ESPIGA', F.VERT, 'multi', 1.0, 5.6, 380],
  ['VERT-100-SE', 'VERTICAL 1.00m SIN ESPIGA', F.VERT, 'multi', 1.0, 5.3, 160],
  ['VERT-150-CE', 'VERTICAL 1.50m CON ESPIGA', F.VERT, 'multi', 1.5, 8.0, 300],
  ['VERT-200-CE', 'VERTICAL 2.00m CON ESPIGA', F.VERT, 'multi', 2.0, 10.5, 1400],
  ['VERT-300-CE', 'VERTICAL 3.00m CON ESPIGA', F.VERT, 'multi', 3.0, 15.4, 240],
  ['HOR-048-073', 'HORIZONTAL Ø48.3 x 0.73m', F.HOR, 'multi', 0.73, 3.2, 1800],
  ['HOR-048-109', 'HORIZONTAL Ø48.3 x 1.09m', F.HOR, 'multi', 1.09, 4.4, 900],
  ['HOR-048-125', 'HORIZONTAL Ø48.3 x 1.25m', F.HOR, 'multi', 1.25, 4.9, 700],
  ['HOR-048-150', 'HORIZONTAL Ø48.3 x 1.50m', F.HOR, 'multi', 1.5, 5.8, 600],
  ['HOR-048-200', 'HORIZONTAL Ø48.3 x 2.00m', F.HOR, 'multi', 2.0, 7.5, 500],
  ['HOR-048-250', 'HORIZONTAL Ø48.3 x 2.50m', F.HOR, 'multi', 2.5, 9.2, 2600],
  ['DIAG-200x073', 'DIAGONAL 2.00 X 0.73m (P/NEGRA)', F.DIAG, 'multi', 2.13, 7.0, 260],
  ['DIAG-200x109', 'DIAGONAL 2.00 X 1.09m (P/AZUL)', F.DIAG, 'multi', 2.28, 7.5, 220],
  ['DIAG-200x125', 'DIAGONAL 2.00 X 1.25m (P/VERDE)', F.DIAG, 'multi', 2.36, 7.8, 200],
  ['DIAG-200x150', 'DIAGONAL 2.00 X 1.50m (P/AMARILLA)', F.DIAG, 'multi', 2.5, 8.3, 140],
  ['DIAG-200x200', 'DIAGONAL 2.00 X 2.00m', F.DIAG, 'multi', 2.83, 9.3, 120],
  ['DIAG-200x250', 'DIAGONAL 2.00 X 2.50m', F.DIAG, 'multi', 3.2, null, 400],
  ['DIAG-150x250', 'DIAGONAL 1.50 X 2.50m (P/ROJA)', F.DIAG, 'multi', 2.92, 9.6, 80],
  ['DIAG-PL-250x250', 'DIAGONAL PLANTA 2.50 x 2.50m', F.DIAG, 'multi', 3.54, 11.5, 40],
  ['DIAG-PL-250x150', 'DIAGONAL PLANTA 2.50 x 1.50m', F.DIAG, 'multi', 2.92, null, 0, { plausible: true }],
  ['DIAG-PL-CEL', 'DIAGONAL EN PLANTA P/ VIGA CELOSÍA', F.DIAG, 'multi', null, null, 12, { plausible: true }],
  ['TAB-MET-073', 'TABLON METALICO 0.73m', F.PLAT, 'multi', 0.73, 5.3, 300],
  ['TAB-MET-109', 'TABLON METALICO 1.09m', F.PLAT, 'multi', 1.09, 7.8, 200],
  ['TAB-MET-125', 'TABLON METALICO 1.25m', F.PLAT, 'multi', 1.25, 8.9, 160],
  ['TAB-MET-150', 'TABLON METALICO 1.50m', F.PLAT, 'comun', 1.5, 10.6, 400],
  ['TAB-MET-200', 'TABLON METALICO 2.00m', F.PLAT, 'multi', 2.0, 14.0, 300],
  ['TAB-MET-250', 'TABLON METALICO 2.50m', F.PLAT, 'comun', 2.5, 17.4, 1500],
  ['TAB-ESC-250', 'TABLON ESCOTILLA 2.50m', F.ACC, 'comun', 2.5, 22.0, 6],
  ['PLACA-FEN-122x244', 'Placa Fenólico 1,22 x 2,44m', F.VP, 'comun', null, 32.0, 260, { unidad: 'placa', rinde: 2.9768 }],
  ['RDPE-073', 'RODAPIE 0,73m', F.RDPE, 'multi', 0.73, null, 400],
  ['RDPE-090', 'RODAPIE 0,90m', F.RDPE, 'bastidor', 0.9, 2.1, 120],
  ['RDPE-109', 'RODAPIE 1,09m', F.RDPE, 'multi', 1.09, 2.5, 200],
  ['RDPE-125', 'RODAPIE 1,25m', F.RDPE, 'multi', 1.25, 2.9, 160],
  ['RDPE-130', 'RODAPIE 1,30m', F.RDPE, 'bastidor', 1.3, 3.0, 160],
  ['RDPE-150', 'RODAPIE 1,50m', F.RDPE, 'comun', 1.5, 3.4, 40, { plausible: true }],
  ['RDPE-200', 'RODAPIE 2,00m', F.RDPE, 'multi', 2.0, 4.5, 30, { plausible: true }],
  ['RDPE-250', 'RODAPIE 2,50m', F.RDPE, 'comun', 2.5, 5.6, 60],
  ['TORN-600-FIJA', 'TORNILLON DE 600mm POR UNIDAD (BASE FIJA)', F.BASE, 'comun', 0.6, 4.2, 900],
  ['TORN-600-MOVIL', 'TORNILLON DE 600mm POR UNIDAD (BASE MOVIL)', F.BASE, 'comun', 0.6, 4.6, 80],
  ['COLL-CORTO', 'COLLARIN CORTO (0.33m)', F.BASE, 'multi', 0.33, null, 700],
  ['MAD-BASE-10x10', 'MADERA BASE 10X10cm', F.BASE, 'comun', null, 1.2, 600],
  ['ESC-INT-MULTI', 'ESCALERA INTERNA (PARA MULTIDIRECCIONAL)', F.ACC, 'multi', 2.6, null, 40],
  ['ESC-INT-BAST', 'ESCALERA INTERNA (PARA BASTIDOR)', F.ACC, 'bastidor', 2.2, 9.5, 30],
  ['BAR-ESC-MULTI', 'BARANDA DE ESCALERA INTERNA (PARA MULTIDIRECCIONAL)', F.ACC, 'multi', 2.9, 8.0, 30],
  ['BAR-ESC-BAST', 'BARANDA DE ESCALERA INTERNA (PARA BASTIDOR)', F.ACC, 'bastidor', 2.5, 7.0, 20],
  ['ZANCA-ESC-150x250', 'ZANCA (LIMON) ESCALERA DESCANSO 150X250', F.ACC, 'multi', 3.2, 28.0, 24],
  ['VIGA-PTE-150', 'VIGA PUENTE Ø1.50m', F.VIGA, 'multi', 1.5, 18.0, 16],
  ['VIGA-PTE-250', 'VIGA PUENTE Ø2.50m', F.VIGA, 'multi', 2.5, 27.0, 24],
  ['VIGA-CEL-073', 'VIGA CELOSIA 0.73m', F.VIGA, 'multi', 0.73, 9.0, 10],
  ['VIGA-CEL-109', 'VIGA CELOSIA 1.09m', F.VIGA, 'multi', 1.09, 12.0, 10],
  ['VIGA-CEL-250', 'VIGA CELOSIA 2.50m', F.VIGA, 'multi', 2.5, 26.0, 12],
  ['VIGA-CEL-500', 'VIGA CELOSIA 5.00m', F.VIGA, 'multi', 5.0, 48.0, 6, { plausible: true }],
  ['VIGA-CEL-600', 'VIGA CELOSIA 6.00m', F.VIGA, 'multi', 6.0, 57.0, 4, { plausible: true }],
  ['VIGA-CEL-750', 'VIGA CELOSIA 7.50m', F.VIGA, 'multi', 7.5, 70.0, 0, { plausible: true }],
  ['MENSULA-045', 'Ménsula 48.3x3.2mm 1 x 320mm W Tablón - 0.45M Q235 HDG', F.MENS, 'multi', 0.45, 4.6, 120],
  ['MENSULA-073', 'MÉNSULA 0.73m (2 TABLONES) Q235 HDG', F.MENS, 'multi', 0.73, 7.4, 60, { plausible: true }],
  ['MENSULA-109', 'MÉNSULA 1.09m (3 TABLONES) Q235 HDG', F.MENS, 'multi', 1.09, 10.2, 0, { plausible: true }],
  ['ANC-QUIM-M12', 'ANCLAJE QUÍMICO M12 + CAÑO DE AMARRE', F.ANC, 'comun', 0.6, 1.8, 24, { plausible: true }],
  ['ESFERA-SEG', 'ESFERA DE SEGURIDAD', F.VP, 'comun', null, 0.3, 300],
  ['DEFENSA-VEH', 'DEFENSA VEHICULAR P/ PATA DE PÓRTICO (NEW JERSEY / TOPE) + SEÑAL DE GÁLIBO', F.VP, 'comun', null, null, 8, { plausible: true }],
  ['RECUB-VERT-200', 'RECUBRIMIENTO BLANDO DE VERTICAL 2.00m', F.VP, 'comun', 2.0, 0.6, 200, { plausible: true }],
  ['ALAMB-CONC-45x10', 'ALAMBRE CONCERTINA DOBLE 45mm x 10m', F.VP, 'comun', 10, 3.5, 20, { unidad: 'rollo 10 m', rinde: 10 }],
  ['MEDIA-SOMBRA-5', 'MEDIA SOMBRA N°5 NEGRO (4m x 50m)', F.CUB, 'comun', null, 18.0, 30, { unidad: 'rollo 4×50 m', rinde: 200 }],
  ['LONA-PVC', 'LONA PVC MICROPERFORADA (m²)', F.CUB, 'comun', null, 0.6, 500, { unidad: 'm²', rinde: 1, plausible: true }],
  ['NUDO-GIR', 'NUDO GIRATORIO', F.UNI, 'comun', null, 1.2, 400],
  ['NUDO-FIJO', 'NUDO FIJO', F.UNI, 'comun', null, 1.1, 400],
  // caño y grampa (esquinas de bastidor) ⚠ códigos a confirmar en Odoo
  ['CANO-048-100', 'CAÑO Ø48.3 x 1.00m (TUBO Y GRAMPA)', F.UNI, 'comun', 1.0, 3.6, 200, { plausible: true }],
  ['CANO-048-150', 'CAÑO Ø48.3 x 1.50m (TUBO Y GRAMPA)', F.UNI, 'comun', 1.5, 5.4, 200, { plausible: true }],
  ['CANO-048-200', 'CAÑO Ø48.3 x 2.00m (TUBO Y GRAMPA)', F.UNI, 'comun', 2.0, 7.2, 200, { plausible: true }],
  ['CANO-048-300', 'CAÑO Ø48.3 x 3.00m (TUBO Y GRAMPA)', F.UNI, 'comun', 3.0, 10.8, 120, { plausible: true }],
  ['CANO-048-600', 'CAÑO Ø48.3 x 6.00m (TUBO Y GRAMPA)', F.UNI, 'comun', 6.0, 21.6, 80, { plausible: true }],
  ['MANG-EMP-048', 'MANGUITO DE EMPALME Ø48.3', F.UNI, 'comun', null, 1.0, 150, { plausible: true }],
  // Bastidor (supuesto Odoo 1,30 × 1,80)
  ['BAST-AND-130x180', 'BASTIDOR DE ANDAMIO - 1,30m x 1.80h', F.BAST, 'bastidor', 1.8, 19.5, 700],
  ['BAST-PAS-090x180', 'BASTIDOR DE ANDAMIO PASILLO - 0,90m x 1.80h', F.BAST, 'bastidor', 1.8, 16.0, 200],
  ['BAST-PEA-130x250', 'BASTIDOR PASO PEATONAL - 1,30m x 2.50h', F.BAST, 'bastidor', 2.5, 24.0, 90],
  ['BAST-PEA-090x250', 'BASTIDOR PASO PEATONAL PASILLO - 0,90m x 2.50h', F.BAST, 'bastidor', 2.5, 20.0, 30],
  ['BAST-BAR-130x100', 'BASTIDOR BARANDA - 1,30m x 1.00h', F.BAST, 'bastidor', 1.0, 9.0, 160],
  ['BAST-BAR-090x100', 'BASTIDOR BARANDA - 0,90m x 1.00h', F.BAST, 'bastidor', 1.0, 7.2, 60],
  ['RIEND-250-H', 'RIENDA ANDAMIO 2.50m - HORIZONTAL', F.BAST, 'bastidor', 2.5, 4.4, 1400],
  ['RIEND-250-D', 'RIENDA ANDAMIO 2.50m (2.77m) - DIAGONAL', F.BAST, 'bastidor', 2.77, 4.9, 1100],
  ['RIEND-150-H', 'RIENDA ANDAMIO JR 1.50m - HORIZONTAL', F.BAST, 'bastidor', 1.5, 2.8, 300],
  ['RIEND-150-D', 'RIENDA ANDAMIO JR 1.50m (1.65m) - DIAGONAL', F.BAST, 'bastidor', 1.65, 3.1, 260],
  ['MOD-AND-STD-130x250x180', 'MODULO DE ANDAMIO STD 1,30 X 2,50 X 1,80', F.KIT, 'bastidor', null, 38.1, 260],
  ['MOD-AND-JR-130x150x180', 'MODULO DE ANDAMIO JUNIOR 1,30 X 1,50 X 1,80', F.KIT, 'bastidor', null, 31.3, 80],
  ['MOD-AND-PAS-090x250x180', 'MODULO DE ANDAMIO PASILLO 0,90 X 2,50 X 1,80', F.KIT, 'bastidor', null, 34.6, 60],
  ['MOD-AND-PAS-JR-090x150x180', 'MODULO DE ANDAMIO PASILLO JUNIOR 0,90 X 1,50 X 1,80', F.KIT, 'bastidor', null, null, 30],
  ['MOD-PEA-STD-130x250x250', 'MODULO DE ANDAMIO PASO PEATONAL STD 1,30 X 2,50 X 2,50', F.KIT, 'bastidor', null, 42.6, 40],
  ['MOD-PEA-PAS-090x250x250', 'MODULO DE ANDAMIO PASO PEATONAL PASILLO 0,90 X 2,50 X 2,50', F.KIT, 'bastidor', null, 38.6, 12],
];

const piezasCatalogo = {};
for (const [codigo, descripcion, familia, sistema, largo, peso_kg, stock, extra = {}] of FILAS) {
  piezasCatalogo[codigo] = {
    codigo, descripcion, familia, sistema, largo, peso_kg, stock,
    unidad: extra.unidad || 'u', rinde: extra.rinde, plausible: !!extra.plausible, enOdoo: !extra.plausible,
  };
}

/** Composición supuesta de cada kit (por cuerpo = vano × nivel). */
const KITS = {
  'MOD-AND-STD-130x250x180': { 'BAST-AND-130x180': 1, 'RIEND-250-H': 2, 'RIEND-250-D': 2 },
  'MOD-AND-JR-130x150x180': { 'BAST-AND-130x180': 1, 'RIEND-150-H': 2, 'RIEND-150-D': 2 },
  'MOD-AND-PAS-090x250x180': { 'BAST-PAS-090x180': 1, 'RIEND-250-H': 2, 'RIEND-250-D': 2 },
  'MOD-AND-PAS-JR-090x150x180': { 'BAST-PAS-090x180': 1, 'RIEND-150-H': 2, 'RIEND-150-D': 2 },
  'MOD-PEA-STD-130x250x250': { 'BAST-PEA-130x250': 1, 'RIEND-250-H': 2, 'RIEND-250-D': 2 },
  'MOD-PEA-PAS-090x250x250': { 'BAST-PEA-090x250': 1, 'RIEND-250-H': 2, 'RIEND-250-D': 2 },
};

export const CATALOGO = Object.freeze({
  piezas: piezasCatalogo,
  familias: ORDEN_FAMILIAS,
  kits: KITS,
  pesosIlustrativos: true,
  stockIlustrativo: true,
  medidas: {
    multi: {
      vanos: [2.5, 2.0, 1.5, 1.25, 1.09, 0.73], vanoDefault: 2.5,
      profundidades: [0.73, 1.09, 1.25], pasoRoseta: 0.5, pasoNivel: 2.0,
      mensulas: [0.45, 0.73, 1.09], vigasCelosia: [2.5, 5.0, 6.0, 7.5], vigasPuente: [1.5, 2.5],
    },
    bastidor: {
      cuerpos: [{ id: 'STD', largo: 2.5 }, { id: 'JR', largo: 1.5 }], vanos: [2.5, 1.5],
      anchos: [1.3, 0.9], alturaCuerpo: 1.8, alturaPaso: 2.5, alturaBaranda: 1.0,
    },
  },
  supuestos: [
    'Multidireccional ABA = roseta Coronet (no Layher): vanos 2,50/2,00/1,50/1,25/1,09/0,73 y profundidades 0,73/1,09/1,25. Confirmado por JS.',
    'Bastidor 1,30 × 1,80 como en Odoo (no confirmado). Cómputo por kit por defecto.',
    'Kit MOD-AND-* = 1 bastidor + 2 riendas H + 2 riendas D. Tablones y el bastidor de cierre de cada tira van sueltos.',
    'Tablones por ancho: 0,73 → 2, 1,09 → 3, 1,25/1,30 → 4, 0,90 → 3 ⚠.',
    'Pesos y stock ilustrativos. Códigos marcados "plausible" no están en Odoo.',
  ],
});

const info = (codigo) => piezasCatalogo[codigo];
const MULTI = CATALOGO.medidas.multi;
const BAST = CATALOGO.medidas.bastidor;

// ───────────────────────────── criterios (⚠ provisorios) ─────────────────────────────
export const CRITERIOS = Object.freeze({
  diagonalCadaVanos: 5,
  anclajeDx: 2, anclajeDn: 2, // tresbolillo cada 2 vanos × 2 niveles
  anclajeMinimo: 5,
  retiroLibre: 0.30, // lado fachada sin baranda si el retiro es ≤ 0,30
  galiboPeatonal: 2.5, pasoPeatonal: 1.2, galiboVehicular: 4.5,
  libreVerticalMax: 2.0, // longitud libre máxima de vertical entre horizontales
  libreBajoTravesano: 2.0,
  arranqueMax: 0.6,
  retiroAmarreCorto: 0.45, // hasta acá alcanza el caño de amarre del anclaje químico // por encima, el tornillón queda extendido de más ⚠ // con vía pública, travesaños de PB solo por encima de esta cota
  hbMax: 3,
  accesoCadaMl: 25,
  toleranciaRelleno: 0.10,
  anchoTablon: 0.32,
});

// ───────────────────────────── plantillas ─────────────────────────────
const P_FACHADA_BASE = {
  frentes: [{ largo: 14 }], altura: 12, profundidad: 0.73, retiro: 0.2, niveles: 'arriba',
  modoPlataforma: 'cada_2m', bandejaPB: false, cubierta: 'nada', viaPublica: false, concertina: false,
  anclada: true, accesos: 'auto', esquinas: [], mensulas: [], brazoMensula: 0.73, ajuste: 'final',
  cuerpo: 'STD', terreno: 'cemento', pataDeGallo: false,
};

export const PLANTILLAS = [
  {
    id: 'pantalla', nombre: 'Pantalla peatonal', icono: 'pantalla', tipo: 'fachada', sistema: 'multi', tecla: null,
    descripcion: 'Bandeja de fenólico sobre la vereda con esferas y recubrimiento. 3, 6 u 8 m.',
    params: { ...P_FACHADA_BASE, frentes: [{ largo: 12.5 }], altura: 3, profundidad: 1.25, niveles: 'pantalla', modoPlataforma: 'ninguna', bandejaPB: true, viaPublica: true, accesos: [] },
  },
  {
    id: 'estructura_pantalla', nombre: 'Estructura + pantalla', icono: 'fachada', tipo: 'fachada', sistema: 'multi', tecla: 'F',
    descripcion: 'Fachada completa con bandeja en PB, niveles cada 2 m y media sombra.',
    params: { ...P_FACHADA_BASE, frentes: [{ largo: 14 }, { largo: 8, angulo: 90 }], altura: 18, bandejaPB: true, viaPublica: true, cubierta: 'media_sombra', esquinas: ['vertical_compartida'] },
  },
  {
    id: 'estructura', nombre: 'Estructura sin pantalla', icono: 'fachada', tipo: 'fachada', sistema: 'multi', tecla: null,
    descripcion: 'Patio, medianera o contrafrente. Igual que la fachada, sin bandeja.',
    params: { ...P_FACHADA_BASE },
  },
  {
    id: 'fachada_bastidor', nombre: 'Fachada de bastidores', icono: 'bastidor', tipo: 'fachada', sistema: 'bastidor', tecla: null,
    descripcion: 'Cuerpos de 1,30 × 2,50 × 1,80 con riendas y bastidor baranda.',
    params: { ...P_FACHADA_BASE, frentes: [{ largo: 15 }], altura: 10.25, profundidad: 1.3 },
  },
  {
    id: 'voladizo', nombre: 'Voladizo con ménsulas', icono: 'voladizo', tipo: 'fachada', sistema: 'multi', tecla: null,
    descripcion: 'Andamio retirado (marquesina o retiro) que se acerca a la fachada con ménsulas.',
    params: {
      ...P_FACHADA_BASE, frentes: [{ largo: 12.5 }], altura: 15, retiro: 1.2, bandejaPB: true, viaPublica: true,
      mensulas: [{ lado: 'fachada', brazo: 1.09, desdeNivel: 1 }], brazoMensula: 1.09,
    },
  },
  {
    id: 'torre_escalera', nombre: 'Torre escalera', icono: 'escalera', tipo: 'torre', sistema: 'multi', tecla: 'T',
    descripcion: 'Torre de 2,50 × 1,50 con zancas y descansos. Desembarca en cada nivel.',
    params: { largo: 2.5, ancho: 1.5, altura: 18, acceso: 'escalera', desembarco: 'cada_nivel', anclada: false, pataDeGallo: false, terreno: 'cemento' },
  },
  {
    id: 'torre_acceso', nombre: 'Torre de acceso', icono: 'torre', tipo: 'torre', sistema: 'multi', tecla: null,
    descripcion: 'Torre con escalera interna y escotilla en cada nivel.',
    params: { largo: 2.5, ancho: 1.09, altura: 10, acceso: 'interna', desembarco: 'cada_nivel', anclada: false, pataDeGallo: false, terreno: 'cemento' },
  },
  {
    id: 'portico_peatonal', nombre: 'Pórtico peatonal', icono: 'portico', tipo: 'portico', sistema: 'bastidor', tecla: 'P',
    descripcion: 'Paso cubierto sobre la vereda: 2,50 libres, paso ≥ 1,20, bandeja de fenólico.',
    params: { clase: 'peatonal', largo: 10, alturaLibre: 2.5, ancho: 1.3, estructuraArriba: false, anclado: true, ajuste: 'final', terreno: 'cemento' },
  },
  {
    id: 'portico_vehicular', nombre: 'Pórtico vehicular', icono: 'camion', tipo: 'portico', sistema: 'multi', tecla: null,
    descripcion: 'Vigas de celosía sobre dos torres. Gálibo 4,50 y luces de 5 a 7,50 m.',
    params: { clase: 'vehicular', luz: 6, galibo: 4.5, profundidad: 1.09, anchoTorre: 1.09, estructuraArriba: false, anclado: true, terreno: 'cemento' },
  },
];
const plantilla = (id) => {
  const p = PLANTILLAS.find((x) => x.id === id);
  if (!p) throw new Error(`Plantilla desconocida: ${id}`);
  return p;
};

// ───────────────────────────── relleno de largo ─────────────────────────────
function textoVanos(vanos) {
  if (!vanos.length) return '—';
  const grupos = [];
  for (const v of vanos) {
    const g = grupos[grupos.length - 1];
    if (g && Math.abs(g.v - v) < EPS) g.n++;
    else grupos.push({ v, n: 1 });
  }
  return grupos.map((g) => (g.n > 1 ? `${g.n}×${fmt(g.v)}` : fmt(g.v))).join(' + ');
}
function pesoAproxVanos(vanos, sistema) {
  // métrica relativa por nivel (verticales por columna + horizontales + tablones). Ilustrativa.
  if (sistema === 'bastidor') return sum(vanos.map((v) => (v > 2 ? 38 : 31))) + 20;
  const pv = (v) => (info(`HOR-048-${cod3(v)}`)?.peso_kg || 0) * 2 + (info(`TAB-MET-${cod3(v)}`)?.peso_kg || 0) * 2;
  return (vanos.length + 1) * 2 * 10.5 + sum(vanos.map(pv));
}

/** @returns {Relleno} */
export function rellenarLargo(largo, sistema = 'multi', opciones = {}) {
  const ajuste = opciones.ajuste || 'final';
  const L = Math.max(0, +largo || 0);
  const opciones_ = [];
  if (sistema === 'bastidor') {
    for (let a = 0; a <= Math.ceil(L / 2.5) + 1; a++) {
      for (let b = 0; b <= 3; b++) {
        if (a + b === 0) continue;
        const vanos = [...Array(a).fill(2.5), ...Array(b).fill(1.5)];
        opciones_.push(vanos);
      }
    }
  } else {
    const n = Math.floor(L / 2.5 + EPS);
    for (const k of [n - 1, n, n + 1]) {
      if (k < 0) continue;
      opciones_.push(Array(k).fill(2.5));
      for (const a of MULTI.vanos.slice(1)) opciones_.push([...Array(k).fill(2.5), a]);
      for (const a of MULTI.vanos.slice(1)) for (const b of MULTI.vanos.slice(1)) if (b <= a) opciones_.push([...Array(k).fill(2.5), a, b]);
    }
  }
  const val = (vanos) => sum(vanos) - L;
  const score = (vanos) => {
    const d = val(vanos);
    // faltar es peor que sobrar; cada pieza extra pesa un poco
    return Math.abs(d) * (d < 0 ? 1.4 : 1) + vanos.length * 0.002 + vanos.filter((v) => v !== 2.5).length * 0.01;
  };
  const validas = opciones_.filter((v) => v.length > 0);
  validas.sort((x, y) => score(x) - score(y));
  let vanos = validas[0] || [MULTI.vanoDefault];
  vanos = ordenarAjuste(vanos, ajuste);
  const res = { vanos, total: r3(sum(vanos)), desvio: r3(val(vanos)) };
  res.texto = `${fmt(L)} → ${textoVanos(vanos)}`;

  const alternativas = [];
  const push = (id, etiqueta, vs) => {
    if (!vs || !vs.length) return;
    const t = textoVanos(vs);
    if (t === textoVanos(vanos) || alternativas.some((a) => a.texto === t)) return;
    alternativas.push({ id, etiqueta, vanos: vs, texto: t, desvio: r3(val(vs)) });
  };
  // menos piezas: la opción con menos vanos dentro de tolerancia (o la más cercana por exceso)
  const dentro = validas.filter((v) => Math.abs(val(v)) <= CRITERIOS.toleranciaRelleno + EPS);
  const menosPiezas = [...(dentro.length ? dentro : validas.filter((v) => val(v) >= 0))].sort((x, y) => x.length - y.length || Math.abs(val(x)) - Math.abs(val(y)))[0];
  push('menos_piezas', 'Menos piezas', menosPiezas && ordenarAjuste(menosPiezas, ajuste));
  // vanos iguales
  const lista = sistema === 'bastidor' ? BAST.vanos : MULTI.vanos;
  let iguales = null;
  for (const v of lista) {
    const k = Math.max(1, Math.round(L / v));
    const cand = Array(k).fill(v);
    if (!iguales || Math.abs(val(cand)) < Math.abs(val(iguales)) - EPS) iguales = cand;
  }
  push('vanos_iguales', 'Vanos iguales', iguales);
  // menos peso
  const pool = dentro.length ? dentro : validas.slice(0, 12);
  const liviano = [...pool].sort((x, y) => pesoAproxVanos(x, sistema) - pesoAproxVanos(y, sistema))[0];
  push('menos_peso', 'Menos peso', liviano && ordenarAjuste(liviano, ajuste));
  if (sistema !== 'bastidor') push('centrado', ajuste === 'centrado' ? 'Ajuste al final' : 'Ajuste centrado', ordenarAjuste(vanos, ajuste === 'centrado' ? 'final' : 'centrado'));
  res.alternativas = alternativas;
  return res;
}
function ordenarAjuste(vanos, ajuste) {
  const std = vanos.filter((v) => v === 2.5);
  const otros = vanos.filter((v) => v !== 2.5).sort((a, b) => b - a);
  if (ajuste === 'centrado' && std.length >= 2 && otros.length) {
    const izq = Math.floor(std.length / 2);
    return [...std.slice(0, izq), ...otros, ...std.slice(izq)];
  }
  return [...std, ...otros];
}

// ───────────────────────────── diseño: creación y edición ─────────────────────────────
const CLAVES_TOP = ['nombre', 'sistema', 'origen', 'rumbo', 'obra'];
function nuevaEstructura(plantillaId, id, opciones = {}) {
  const pl = plantilla(plantillaId);
  const params = { ...clone(pl.params), ...clone(opciones.params || {}) };
  return {
    id, plantilla: pl.id, tipo: pl.tipo, nombre: opciones.nombre || pl.nombre,
    sistema: opciones.sistema || pl.sistema,
    origen: opciones.origen ? [...opciones.origen] : [0, 0],
    rumbo: opciones.rumbo || 0, apoyaEn: [], params, overrides: {},
  };
}
function proximoId(diseno) {
  let n = 0;
  for (const e of diseno.estructuras) n = Math.max(n, +String(e.id).replace(/\D/g, '') || 0);
  return `E${n + 1}`;
}

/** @returns {Diseno} */
export function crearDiseno(plantillaId = 'estructura_pantalla', overrides = {}) {
  const top = {};
  const params = {};
  for (const [k, v] of Object.entries(overrides || {})) (CLAVES_TOP.includes(k) ? top : params)[k] = v;
  const est = nuevaEstructura(plantillaId, 'E1', { ...top, nombre: undefined, params });
  return {
    version: 1,
    nombre: top.nombre ? String(top.nombre) : 'Diseño sin nombre',
    obra: top.obra || null,
    contexto: { terreno: 'cemento', enVereda: true, claseCarga: 3 },
    estructuras: [est],
    uniones: [],
    modoBom: 'kit',
  };
}

export function ejemploParana631() {
  const d = crearDiseno('estructura_pantalla', {
    frentes: [{ largo: 14 }, { largo: 8, angulo: 90 }], altura: 18,
    obra: { nombre: 'Obra de ejemplo · Paraná 631', direccion: 'Paraná 631, CABA', estimado: true, ilustrativo: true, mlEstimados: 22 },
  });
  d.nombre = 'Obra de ejemplo · Paraná 631 (datos ilustrativos)';
  d.estructuras[0].nombre = 'Fachada L';
  return d;
}

export function agregarEstructura(diseno, plantillaId, opciones = {}) {
  const d = clone(diseno);
  const id = proximoId(d);
  const est = nuevaEstructura(plantillaId, id, opciones);
  d.estructuras.push(est);
  if (opciones.unirA) {
    const u = opciones.unirA;
    const modo = u.modo || (est.tipo === 'portico' ? 'apoyo' : 'vertical_compartida');
    return { diseno: unir(d, { estructuraId: u.estructuraId, puerto: u.puerto, s: u.s }, { estructuraId: id, puerto: u.puertoPropio }, modo), estructuraId: id };
  }
  return { diseno: d, estructuraId: id };
}

export function quitarEstructura(diseno, estructuraId) {
  const d = clone(diseno);
  d.estructuras = d.estructuras.filter((e) => e.id !== estructuraId);
  for (const e of d.estructuras) e.apoyaEn = (e.apoyaEn || []).filter((x) => x !== estructuraId);
  d.uniones = d.uniones.filter((u) => u.a.estructuraId !== estructuraId && u.b.estructuraId !== estructuraId);
  return d;
}

function setRuta(obj, ruta, valor) {
  const partes = String(ruta).split('.');
  let o = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    const k = partes[i];
    if (o[k] === undefined || o[k] === null) o[k] = /^\d+$/.test(partes[i + 1]) ? [] : {};
    o = o[k];
  }
  const ult = partes[partes.length - 1];
  if (valor === undefined) delete o[ult];
  else o[ult] = valor;
}
export function setParam(diseno, estructuraId, ruta, valor) {
  const d = clone(diseno);
  const e = d.estructuras.find((x) => x.id === estructuraId);
  if (!e) return d;
  setRuta(e, ruta.startsWith('params.') || CLAVES_TOP.includes(ruta.split('.')[0]) || ruta.startsWith('overrides') ? ruta : `params.${ruta}`, clone(valor));
  // si cambia un largo, se descarta el relleno elegido a mano para ese frente
  const m = /^params\.frentes\.(\d+)\.largo$/.exec(ruta);
  if (m && e.params.frentes[+m[1]]) delete e.params.frentes[+m[1]].vanos;
  return d;
}
export function setOverride(diseno, estructuraId, celda, valor) {
  const d = clone(diseno);
  const e = d.estructuras.find((x) => x.id === estructuraId);
  if (!e) return d;
  e.overrides = e.overrides || {};
  if (valor === null || valor === undefined) { delete e.overrides[celda]; return d; }
  const nuevo = { ...(e.overrides[celda] || {}) };
  for (const [k, v] of Object.entries(valor)) {
    if (v === null || v === undefined) delete nuevo[k];
    else nuevo[k] = v;
  }
  if (Object.keys(nuevo).length) e.overrides[celda] = nuevo;
  else delete e.overrides[celda];
  return d;
}

export function aplicarReparacion(diseno, accion) {
  if (!accion) return diseno;
  switch (accion.tipo) {
    case 'param': return setParam(diseno, accion.estructuraId, accion.ruta, accion.valor);
    case 'override': return setOverride(diseno, accion.estructuraId, accion.celda, accion.valor);
    case 'overrides': {
      let d = diseno;
      for (const c of accion.celdas) d = setOverride(d, accion.estructuraId, c, accion.valor);
      return d;
    }
    case 'vanos': return setParam(diseno, accion.estructuraId, `params.frentes.${accion.frente}.vanos`, accion.vanos);
    case 'sistema': {
      const d = clone(diseno);
      const i = d.estructuras.findIndex((e) => e.id === accion.estructuraId);
      if (i >= 0) d.estructuras[i] = cambiarSistema(d.estructuras[i], accion.sistema).estructura;
      return d;
    }
    case 'esquina': return setParam(diseno, accion.estructuraId, `params.esquinas.${accion.indice}`, accion.modo);
    case 'modoUnion': {
      const d = clone(diseno);
      const u = d.uniones.find((x) => x.id === accion.unionId);
      if (u) return unir(quitarUnion(d, u.id), u.a, u.b, accion.modo);
      return d;
    }
    case 'quitarUnion': return quitarUnion(diseno, accion.unionId);
    case 'modoBom': { const d = clone(diseno); d.modoBom = accion.modo; return d; }
    default: return diseno;
  }
}
function quitarUnion(diseno, unionId) {
  const d = clone(diseno);
  const u = d.uniones.find((x) => x.id === unionId);
  d.uniones = d.uniones.filter((x) => x.id !== unionId);
  if (u && u.modo === 'apoyo') {
    for (const e of d.estructuras) e.apoyaEn = (e.apoyaEn || []).filter((x) => x !== u.a.estructuraId && x !== u.b.estructuraId);
  }
  return d;
}

// ───────────────────────────── cambio de sistema ─────────────────────────────
const masCercano = (lista, v) => lista.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), lista[0]);
export function cambiarSistema(estructura, sistema) {
  const e = clone(estructura);
  const avisos = [];
  if (e.sistema === sistema) return { estructura: e, avisos };
  if (e.tipo === 'portico' && e.params.clase === 'vehicular' && sistema === 'bastidor') {
    return { estructura: e, avisos: ['El pórtico vehicular solo se arma en multidireccional (vigas de celosía).'] };
  }
  const antes = e.sistema;
  e.sistema = sistema;
  const p = e.params;
  if (e.tipo === 'fachada') {
    const profAntes = p.profundidad;
    p.profundidad = sistema === 'bastidor' ? masCercano(BAST.anchos, profAntes) : masCercano(MULTI.profundidades, profAntes);
    if (p.profundidad !== profAntes) avisos.push(`Profundidad ${fmt(profAntes)} → ${fmt(p.profundidad)} (${sistema === 'bastidor' ? (p.profundidad < 1 ? 'bastidor pasillo' : 'bastidor de andamio') : 'multidireccional'}).`);
    (p.frentes || []).forEach((fr, i) => {
      delete fr.vanos;
      const r = rellenarLargo(fr.largo, sistema, { ajuste: p.ajuste });
      const d = r.desvio;
      const txt = Math.abs(d) < 0.005 ? 'exacto' : d > 0 ? `sobran ${fmt(d)} m` : `faltan ${fmt(-d)} m`;
      avisos.push(`Frente ${LETRAS[i]}: ${r.texto} (${txt}).`);
    });
    const hAntes = alturaRealFachadaAprox(antes, p);
    const hDesp = alturaRealFachadaAprox(sistema, p);
    if (Math.abs(hAntes - hDesp) > 0.05) avisos.push(`Altura real ${fmt(hAntes)} → ${fmt(hDesp)} m (${sistema === 'bastidor' ? 'cuerpos de 1,80' : 'niveles cada 2,00'}).`);
    if (sistema === 'bastidor' && (p.mensulas || []).length) avisos.push('Las ménsulas son de multidireccional: quedan guardadas pero no se arman en bastidor.');
    const ov = Object.keys(e.overrides || {}).length;
    if (ov) avisos.push(`${ov} override${ov > 1 ? 's' : ''} se conservan; los que caen fuera de la nueva grilla no se aplican.`);
  } else if (e.tipo === 'torre') {
    if (sistema === 'bastidor') { p.largo = 2.5; p.ancho = 1.3; avisos.push('Torre en bastidor: cuerpo 1,30 × 2,50 × 1,80 con escalera interna.'); }
    else { p.ancho = masCercano([1.09, 1.25, 1.5], p.ancho); avisos.push(`Torre en multidireccional: ${fmt(p.largo)} × ${fmt(p.ancho)}.`); }
  } else if (e.tipo === 'portico') {
    if (sistema === 'bastidor') { p.ancho = masCercano(BAST.anchos, p.ancho); if (p.alturaLibre > 2.5 + EPS) avisos.push(`El bastidor de paso da 2,50 libres (pedías ${fmt(p.alturaLibre)}).`); p.alturaLibre = 2.5; }
    else { p.ancho = masCercano([1.25, 1.5, 2.5], p.ancho); avisos.push(`Pórtico en multidireccional: paso de ${fmt(p.ancho)} con ${p.ancho > 1.25 ? 'viga puente' : 'horizontales'}.`); }
    const r = rellenarLargo(p.largo, sistema);
    if (Math.abs(r.desvio) > 0.005) avisos.push(`Largo: ${r.texto} (${r.desvio > 0 ? 'sobran' : 'faltan'} ${fmt(Math.abs(r.desvio))} m).`);
  }
  return { estructura: e, avisos };
}
function alturaRealFachadaAprox(sistema, p) {
  if (sistema === 'bastidor') return nivelesBastidor(p.altura, !!p.bandejaPB).alturaReal;
  if (p.niveles === 'pantalla') return nivelesPantalla(p.altura).alturaReal;
  return nivelesMulti(p.altura, arrDesde(p.altura - 1), p).alturaReal;
}

// ───────────────────────────── niveles ─────────────────────────────
const arrDesde = (objetivo) => r3(0.25 + mod(objetivo - 0.25, 0.5));
function nivelesMulti(H, ARR, p = {}) {
  const yN = r3(ARR + 0.5 * Math.floor((H - 1 - ARR) / 0.5 + EPS));
  const minimo = p.viaPublica ? Math.max(ARR + 1.5, CRITERIOS.galiboPeatonal) : ARR + 1.5;
  const cotas = [];
  for (let c = yN; c >= minimo - EPS; c = r3(c - MULTI.pasoNivel)) cotas.unshift(c);
  if (!cotas.length) cotas.push(Math.max(yN, r3(ARR + 0.5)));
  const N = cotas.length;
  const niveles = cotas.map((cota, n) => ({ n, cota, plataforma: false, bandeja: false }));
  const modo = p.modoPlataforma || 'cada_2m';
  let ultimaPlat = Infinity;
  for (let n = N - 1; n >= 0; n--) {
    const lv = niveles[n];
    if (modo === 'cada_nivel') lv.plataforma = true;
    else if (modo === 'cada_2m') { if (ultimaPlat - lv.cota >= 2 - EPS) { lv.plataforma = true; ultimaPlat = lv.cota; } }
    else if (modo === 'solo_trabajo') lv.plataforma = n === N - 1;
  }
  if (p.bandejaPB) { niveles[0].plataforma = true; niveles[0].bandeja = true; }
  const top = niveles[N - 1];
  const yTopCol = r3(top.plataforma ? top.cota + 1 : top.cota);
  return { ARR, niveles, yTopCol, alturaReal: yTopCol };
}
function nivelesPantalla(H) {
  const ARR = arrDesde(H);
  const bandeja = r3(ARR + 0.5 * Math.ceil((CRITERIOS.galiboPeatonal - ARR) / 0.5 - EPS));
  const cotas = [bandeja];
  for (let c = r3(bandeja + 2); c < H - 0.25 + EPS; c = r3(c + 2)) cotas.push(c);
  if (H - cotas[cotas.length - 1] >= 0.5 - EPS) cotas.push(r3(ARR + 0.5 * Math.floor((H - ARR) / 0.5 + EPS)));
  const niveles = cotas.map((cota, n) => ({ n, cota, plataforma: n === 0, bandeja: n === 0, faldon: n === 0 }));
  const yTopCol = r3(Math.max(cotas[cotas.length - 1], bandeja + 0.5));
  return { ARR, niveles, yTopCol, alturaReal: yTopCol };
}
function nivelesBastidor(H, pea) {
  const ARR = 0.25;
  const primero = pea ? BAST.alturaPaso : BAST.alturaCuerpo;
  const N = Math.max(1, 1 + Math.round((H - BAST.alturaBaranda - ARR - primero) / BAST.alturaCuerpo));
  const niveles = [];
  let c = ARR;
  for (let n = 0; n < N; n++) {
    const h = n === 0 ? primero : BAST.alturaCuerpo;
    c = r3(c + h);
    niveles.push({ n, cota: c, alto: h, plataforma: true, bandeja: n === 0 && pea, paso: n === 0 && pea });
  }
  const yTopCol = r3(c + BAST.alturaBaranda);
  return { ARR, niveles, yTopCol, alturaReal: yTopCol };
}

// ───────────────────────────── geometría de planta ─────────────────────────────
const dirDe = (rumbo) => [Math.cos(deg(rumbo)), Math.sin(deg(rumbo))];
const normalDe = (rumbo) => [-Math.sin(deg(rumbo)), Math.cos(deg(rumbo))];
const rot2 = ([x, z], r) => [x * Math.cos(deg(r)) - z * Math.sin(deg(r)), x * Math.sin(deg(r)) + z * Math.cos(deg(r))];
const angulo2 = ([x, z]) => (Math.atan2(z, x) * 180) / Math.PI;
/** Marco local (s a lo largo, t hacia afuera, y arriba) → mundo. */
function marco(O, rumbo) {
  const u = dirDe(rumbo);
  const n = normalDe(rumbo);
  const W = (s, y, t) => [r3(O[0] + u[0] * s + n[0] * t), r3(y), r3(O[1] + u[1] * s + n[1] * t)];
  return { O, u, n, rumbo, W };
}

// ───────────────────────────── resolución (sin piezas) ─────────────────────────────
/**
 * Resuelve medidas de una estructura: frentes con vanos y niveles, huella, cotas y puertos.
 * ctx.soportes: Map id → {huellas, yTope} para apoyo.
 */
function resolver(est, ctx = {}) {
  if (est.tipo === 'fachada') return resolverFachada(est, ctx);
  if (est.tipo === 'torre') return resolverTorre(est, ctx);
  return resolverPortico(est, ctx);
}

function resolverFachada(est, ctx) {
  const p = est.params;
  const bast = est.sistema === 'bastidor';
  const prof = bast ? masCercano(BAST.anchos, p.profundidad) : masCercano(MULTI.profundidades, p.profundidad);
  // ARR (fase de la grilla de rosetas). Con apoyo, se alinea con el tope del soporte.
  let ARR;
  let nivGen;
  const soporteTop = (est.apoyaEn || []).map((id) => ctx.soportes?.get(id)?.yTope).find((y) => y != null);
  if (bast) nivGen = (H) => nivelesBastidor(H, !!p.bandejaPB && !soporteTop);
  else if (p.niveles === 'pantalla') { ARR = nivelesPantalla(p.altura).ARR; nivGen = (H) => nivelesPantalla(H); }
  else {
    ARR = soporteTop != null ? arrDesde(soporteTop) : arrDesde(p.altura - 1);
    nivGen = (H) => nivelesMulti(H, ARR, { ...p, bandejaPB: p.bandejaPB && soporteTop == null, viaPublica: p.viaPublica && soporteTop == null });
  }
  const frentes = [];
  let P = [...est.origen];
  let rumbo = est.rumbo;
  const nF = (p.frentes || []).length;
  for (let f = 0; f < nF; f++) {
    const fr = p.frentes[f];
    const ang = f === 0 ? 0 : (fr.angulo ?? 90);
    if (f > 0) rumbo -= ang;
    const modoEsq = f > 0 ? (p.esquinas?.[f - 1] || 'vertical_compartida') : null;
    let sIni = 0;
    // Esquina convexa multi con vertical compartida: B arranca en la vertical EXTERIOR del final de A
    // (s = −prof) y su primer vano es el cuadro de esquina prof × prof; desde s = 0 sigue el relleno.
    // Así B comparte las 2 verticales del final de A y ninguna horizontal pasa por una columna.
    if (f > 0 && ang > 0 && !bast && modoEsq === 'vertical_compartida') sIni = -prof;
    // Esquina convexa de bastidor: B arranca separado (su propio par de pies, nunca el pie de A) y el
    // cuadro de esquina se arma con caño y grampas (ver construirFachadaBastidor).
    if (f > 0 && ang > 0 && bast) sIni = sepEsquinaBastidor(prof);
    if (f > 0 && ang < 0) sIni = prof;
    const largo = Math.max(0.5, +fr.largo || 0);
    const largoEf = r3(largo - sIni);
    const vanoEsq = sIni < 0 ? r3(-sIni) : 0; // cuadro de esquina (no entra en el relleno)
    // esquina entrante (multi) al final: el último vano es el cuadro prof × prof, así el frente siguiente
    // (que arranca en s = prof) apoya sus dos primeras verticales en columnas de este frente
    const vanoFin = !bast && f < nF - 1 && (p.frentes[f + 1].angulo ?? 90) < 0 ? prof : 0;
    const largoRell = r3(largoEf - vanoEsq - vanoFin);
    let vanosUsr = fr.vanos && fr.vanos.length ? [...fr.vanos] : null;
    // vanos que vienen de F.vanos (p. ej. al cortar un frente) ya traen los cuadros de esquina
    if (vanosUsr && (vanoEsq || vanoFin) && Math.abs(sum(vanosUsr) - largoEf) < 0.3) {
      if (vanoEsq && Math.abs(vanosUsr[0] - vanoEsq) < EPS) vanosUsr = vanosUsr.slice(1);
      if (vanoFin && Math.abs(vanosUsr[vanosUsr.length - 1] - vanoFin) < EPS) vanosUsr = vanosUsr.slice(0, -1);
    }
    let relleno;
    if (vanosUsr && vanosUsr.length && Math.abs(sum(vanosUsr) - largoRell) < 0.3) {
      relleno = { ...rellenarLargo(largoRell, est.sistema, { ajuste: p.ajuste }), vanos: vanosUsr };
      relleno.desvio = r3(sum(vanosUsr) - largoRell);
      relleno.texto = `${fmt(largoRell)} → ${textoVanos(vanosUsr)}`;
      relleno.elegido = true;
    } else relleno = rellenarLargo(largoRell, est.sistema, { ajuste: p.ajuste });
    const vanos = [...(vanoEsq ? [vanoEsq] : []), ...relleno.vanos, ...(vanoFin ? [vanoFin] : [])];
    const S = [sIni];
    for (const v of vanos) S.push(r3(S[S.length - 1] + v));
    const H = fr.altura ?? p.altura;
    const nv = nivGen(H);
    const mk = marco(P, rumbo);
    frentes.push({
      f, etiqueta: `Frente ${LETRAS[f]}`, largo, largoEf, sIni, vanos, S, relleno,
      texto: relleno.texto + (sIni < 0 ? ` + cuadro de esquina ${fmt(-sIni)}` : sIni > 0 ? ` (descuenta ${fmt(sIni)} de esquina)` : '') + (vanoFin ? ` + cuadro de esquina entrante ${fmt(vanoFin)}` : ''),
      vanoEsquina: vanoEsq, // > 0: el vano 0 es el cuadro de esquina compartido con el frente anterior
      vanoEsquinaFin: vanoFin, // > 0: el último vano es el cuadro de una esquina entrante (paso al frente siguiente)
      angulo: ang, modoEsquina: modoEsq, rumbo, origen: [...P], u: mk.u, n: mk.n,
      altura: H, ARR: nv.ARR, niveles: nv.niveles, yTopCol: nv.yTopCol, alturaReal: nv.alturaReal,
    });
    // el próximo frente arranca en la última vertical interior real (así las esquinas comparten nodos)
    const fin = mk.W(S[S.length - 1], 0, 0);
    P = [fin[0], fin[2]];
  }
  const alturaReal = Math.max(...frentes.map((x) => x.alturaReal));
  const r = { id: est.id, tipo: 'fachada', sistema: est.sistema, prof, frentes, alturaReal, ARR: frentes[0]?.ARR ?? 0.25, soporteTop };
  r.puertos = puertosFachada(est, r);
  r.huellas = frentes.map((F) => {
    const mk = marco(F.origen, F.rumbo);
    const s0 = F.S[0], s1 = F.S[F.S.length - 1];
    return [mk.W(s0, 0, 0), mk.W(s1, 0, 0), mk.W(s1, 0, prof), mk.W(s0, 0, prof)].map((q) => [q[0], q[2]]);
  });
  r.m2 = sum(frentes.map((F) => sum(F.vanos) * F.alturaReal));
  r.ml = sum(frentes.map((F) => sum(F.vanos)));
  return r;
}

function resolverTorre(est, ctx) {
  const p = est.params;
  const bast = est.sistema === 'bastidor';
  const L = bast ? 2.5 : p.largo;
  const B = bast ? masCercano(BAST.anchos, p.ancho) : p.ancho;
  const H = ctx.alturaHeredada?.get(est.id) ?? p.altura;
  const nv = bast ? nivelesBastidor(H, false) : nivelesMulti(H, ctx.arrHeredado?.get(est.id) ?? arrDesde(H - 1), { modoPlataforma: 'cada_nivel' });
  const F = { f: 0, etiqueta: 'Torre', largo: L, largoEf: L, sIni: 0, vanos: [L], S: [0, L], rumbo: est.rumbo, origen: [...est.origen], ...dirsDe(est.rumbo), altura: H, ARR: nv.ARR, niveles: nv.niveles, yTopCol: nv.yTopCol, alturaReal: nv.alturaReal, texto: `${fmt(L)} × ${fmt(B)}` };
  const r = { id: est.id, tipo: 'torre', sistema: est.sistema, prof: B, frentes: [F], alturaReal: nv.alturaReal, ARR: nv.ARR };
  r.puertos = puertosCaja(est, r, L, B, nv.yTopCol);
  const mk = marco(F.origen, F.rumbo);
  r.huellas = [[mk.W(0, 0, 0), mk.W(L, 0, 0), mk.W(L, 0, B), mk.W(0, 0, B)].map((q) => [q[0], q[2]])];
  r.m2 = 0;
  r.ml = 0;
  return r;
}
const dirsDe = (rumbo) => ({ u: dirDe(rumbo), n: normalDe(rumbo) });

function resolverPortico(est, ctx) {
  const p = est.params;
  const veh = p.clase === 'vehicular';
  const bast = est.sistema === 'bastidor' && !veh;
  const tieneArriba = !!p.estructuraArriba || !!ctx.apoyados?.has(est.id);
  let vanos, S, prof, yTope, ARR = 0.25, relleno, L, niveles, galibo = null, viga = null;
  if (veh) {
    prof = p.profundidad;
    const wT = p.anchoTorre;
    const luzViga = elegirViga(p.luz);
    vanos = [wT, luzViga.luz, wT];
    S = [0, wT, r3(wT + luzViga.luz), r3(2 * wT + luzViga.luz)];
    const yG = r3(ARR + 0.5 * Math.ceil((p.galibo - ARR) / 0.5 - EPS)); // cordón inferior de la viga ≥ gálibo
    yTope = r3(yG + 0.5); // cordón superior = piso del pórtico
    galibo = yG;
    viga = luzViga;
    niveles = [];
    for (let c = r3(yG - 2); c >= ARR + 1.5 - EPS; c = r3(c - 2)) niveles.unshift({ n: 0, cota: c, plataforma: false });
    niveles.push({ n: 0, cota: yG, plataforma: false });
    niveles.push({ n: 0, cota: yTope, plataforma: true, tope: true });
    niveles.forEach((x, i) => { x.n = i; });
    relleno = { texto: `luz ${fmt(p.luz)} → viga ${luzViga.codigo}`, vanos, desvio: r3(luzViga.luz - p.luz) };
    L = S[3];
  } else {
    prof = bast ? masCercano(BAST.anchos, p.ancho) : masCercano([0.73, 1.09, 1.25, 1.5, 2.5], p.ancho);
    relleno = rellenarLargo(p.largo, bast ? 'bastidor' : 'multi', { ajuste: p.ajuste });
    vanos = relleno.vanos;
    S = [0];
    for (const v of vanos) S.push(r3(S[S.length - 1] + v));
    L = S[S.length - 1];
    yTope = bast ? r3(ARR + BAST.alturaPaso) : r3(ARR + 0.5 * Math.ceil((Math.max(p.alturaLibre, 0) + 0.05 - ARR) / 0.5 - EPS));
    niveles = [{ n: 0, cota: yTope, plataforma: true, bandeja: true, tope: true }];
  }
  const yTopCol = r3(tieneArriba ? yTope : yTope + 1);
  const F = { f: 0, etiqueta: veh ? 'Pórtico vehicular' : 'Pórtico', largo: veh ? L : p.largo, largoEf: L, sIni: 0, vanos, S, relleno, texto: relleno.texto, rumbo: est.rumbo, origen: [...est.origen], ...dirsDe(est.rumbo), altura: yTopCol, ARR, niveles, yTopCol, alturaReal: yTopCol };
  const r = { id: est.id, tipo: 'portico', clase: p.clase, sistema: bast ? 'bastidor' : 'multi', prof, frentes: [F], alturaReal: yTopCol, ARR, yTope, galibo: galibo ?? yTope, viga, tieneArriba };
  r.puertos = puertosCaja(est, r, L, prof, yTope);
  const mk = marco(F.origen, F.rumbo);
  r.huellas = [[mk.W(0, 0, 0), mk.W(L, 0, 0), mk.W(L, 0, prof), mk.W(0, 0, prof)].map((q) => [q[0], q[2]])];
  r.m2 = 0;
  r.ml = L;
  return r;
}
function elegirViga(luz) {
  const lista = MULTI.vigasCelosia;
  const l = lista.find((x) => x >= luz - 0.05) ?? lista[lista.length - 1];
  return { luz: l, codigo: `VIGA-CEL-${cod3(l)}`, excede: luz > lista[lista.length - 1] + 0.05 };
}

// ───────────────────────────── puertos ─────────────────────────────
function puerto(est, id, tipo, etiqueta, p0, p1, normal, cols, altura) {
  const dx = p1[0] - p0[0], dz = p1[2] - p0[2];
  const largo = r3(Math.hypot(dx, dz));
  const d = largo > EPS ? [r3(dx / largo), 0, r3(dz / largo)] : [1, 0, 0];
  return { id, estructuraId: est.id, tipo, etiqueta, p0, p1, normal: normal.map(r3), d, largo, cols: cols.map(r3), altura: r3(altura) };
}
function puertosFachada(est, r) {
  const out = [];
  const prof = r.prof;
  const nF = r.frentes.length;
  r.frentes.forEach((F, i) => {
    const mk = marco(F.origen, F.rumbo);
    const s0 = F.S[0], s1 = F.S[F.S.length - 1];
    const colsRel = F.S.map((s) => s - s0);
    out.push(puerto(est, `f${F.f}:ext`, 'cara', `${F.etiqueta} · cara exterior`, mk.W(s0, 0, prof), mk.W(s1, 0, prof), [F.n[0], 0, F.n[1]], colsRel, F.alturaReal));
    out.push(puerto(est, `f${F.f}:base`, 'base', `${F.etiqueta} · base`, mk.W(s0, 0, 0), mk.W(s1, 0, 0), [0, 1, 0], colsRel, 0));
    if (i === 0) out.push(puerto(est, `f${F.f}:ini`, 'extremo', `${F.etiqueta} · extremo inicial`, mk.W(s0, 0, prof), mk.W(s0, 0, 0), [-F.u[0], 0, -F.u[1]], [0, prof], F.alturaReal));
    if (i === nF - 1) out.push(puerto(est, `f${F.f}:fin`, 'extremo', `${F.etiqueta} · extremo final`, mk.W(s1, 0, 0), mk.W(s1, 0, prof), [F.u[0], 0, F.u[1]], [0, prof], F.alturaReal));
  });
  return out;
}
function puertosCaja(est, r, L, B, yTope) {
  const F = r.frentes[0];
  const mk = marco(F.origen, F.rumbo);
  const u = [F.u[0], 0, F.u[1]], n = [F.n[0], 0, F.n[1]];
  const neg = (v) => v.map((x) => -x);
  const H = r.alturaReal;
  const colsS = F.S.map((s) => s);
  return [
    // cada cara ordenada para que d = rot90(normal): p0→p1 deja la estructura a la izquierda mirando hacia afuera
    puerto(est, 'frente', 'cara', `${F.etiqueta} · frente`, mk.W(L, 0, 0), mk.W(0, 0, 0), neg(n), colsS.map((s) => L - s).reverse(), H),
    puerto(est, 'fondo', 'cara', `${F.etiqueta} · fondo`, mk.W(0, 0, B), mk.W(L, 0, B), n, colsS, H),
    puerto(est, 'izq', 'cara', `${F.etiqueta} · lateral izq.`, mk.W(0, 0, 0), mk.W(0, 0, B), neg(u), [0, B], H),
    puerto(est, 'der', 'cara', `${F.etiqueta} · lateral der.`, mk.W(L, 0, B), mk.W(L, 0, 0), u, [0, B], H),
    puerto(est, 'tope', 'tope', `${F.etiqueta} · tope`, mk.W(0, yTope, 0), mk.W(L, yTope, 0), [0, 1, 0], colsS, yTope),
    puerto(est, 'base', 'base', `${F.etiqueta} · base`, mk.W(0, 0, 0), mk.W(L, 0, 0), [0, 1, 0], colsS, 0),
  ];
}

/** Puertos de una estructura en coordenadas de mundo. */
export function puertosDe(estructura, diseno = null) {
  const ctx = diseno ? contextoResolucion(diseno) : {};
  return resolver(estructura, ctx).puertos;
}

// Para que las caras se enfrenten, d = rot90(normal) en planta: d = (−n.z, n.x)
function ordenarCara(pt) {
  if (pt.tipo !== 'cara' && pt.tipo !== 'extremo') return pt;
  const dEsp = [-pt.normal[2], 0, pt.normal[0]];
  if (dEsp[0] * pt.d[0] + dEsp[2] * pt.d[2] >= 0) return pt;
  return { ...pt, p0: pt.p1, p1: pt.p0, d: pt.d.map((x) => -x), cols: pt.cols.map((c) => r3(pt.largo - c)).reverse() };
}

// ───────────────────────────── unir / snap ─────────────────────────────
function puertoPorDefecto(est, modo) {
  if (modo === 'apoyo') return est.tipo === 'portico' ? 'tope' : 'f0:base';
  if (est.tipo === 'fachada') return 'f0:ini';
  return 'frente';
}
function snapS(ptA, s, largoB) {
  const max = Math.max(0, ptA.largo - largoB);
  const cands = ptA.cols.filter((c) => c <= max + EPS);
  if (!cands.length) return Math.min(Math.max(0, s), max);
  return cands.reduce((b, c) => (Math.abs(c - s) < Math.abs(b - s) ? c : b), cands[0]);
}
/**
 * Mueve b para que su puerto encastre en el puerto a. Devuelve un diseño nuevo con la unión.
 * modo: 'vertical_compartida' (caras pegadas, verticales coincidentes), 'vano_giro' (separadas 0,73 con
 * horizontales de conexión) o 'apoyo' (b se apoya sobre a o a sobre b, el que sea pórtico es el soporte).
 */
export function unir(diseno, a, b, modo = 'vertical_compartida') {
  const d = clone(diseno);
  const estA = d.estructuras.find((e) => e.id === a.estructuraId);
  const estB = d.estructuras.find((e) => e.id === b.estructuraId);
  if (!estA || !estB || estA.id === estB.id) return d;
  const ctx = contextoResolucion(d);
  const resA = resolver(estA, ctx);
  const ptA0 = resA.puertos.find((x) => x.id === a.puerto);
  if (!ptA0) return d;
  const idB = b.puerto || puertoPorDefecto(estB, modo === 'apoyo' ? 'apoyo' : modo);
  // puerto de b en coordenadas locales (origen 0, rumbo 0)
  const estB0 = { ...clone(estB), origen: [0, 0], rumbo: 0, apoyaEn: [] };
  const resB0 = resolver(estB0, ctx);
  const ptB0 = resB0.puertos.find((x) => x.id === idB);
  if (!ptB0) return d;
  let ptA = ptA0, ptB = ptB0;
  let s = a.s ?? Math.max(0, (ptA.largo - ptB.largo) / 2);
  let destinoD, destinoP0, sGuardado;
  if (modo === 'apoyo') {
    s = snapS(ptA, s, ptB.largo);
    sGuardado = s;
    destinoD = ptA.d;
    destinoP0 = [ptA.p0[0] + ptA.d[0] * s, ptA.p0[2] + ptA.d[2] * s];
  } else {
    ptA = ordenarCara(ptA0);
    ptB = ordenarCara(ptB0);
    // s viene en el sentido original del puerto a (p0→p1); se pasa al sentido ordenado y vuelve
    const invertido = ptA.p0 !== ptA0.p0;
    const aOrd = (x) => (invertido ? ptA.largo - x - ptB.largo : x);
    s = snapS(ptA, aOrd(s), ptB.largo);
    sGuardado = aOrd(s);
    const gap = modo === 'vano_giro' ? 0.73 : 0;
    // las caras se enfrentan: d_b = −d_a; p1_b ↔ a(s), p0_b ↔ a(s + largo_b)
    destinoD = ptA.d.map((x) => -x);
    const sp0 = s + ptB.largo;
    destinoP0 = [ptA.p0[0] + ptA.d[0] * sp0 + ptA.normal[0] * gap, ptA.p0[2] + ptA.d[2] * sp0 + ptA.normal[2] * gap];
  }
  const rumboNuevo = angulo2([destinoD[0], destinoD[2]]) - angulo2([ptB.d[0], ptB.d[2]]);
  const p0Rot = rot2([ptB.p0[0], ptB.p0[2]], rumboNuevo);
  estB.rumbo = r3(mod(rumboNuevo + 180, 360) - 180);
  estB.origen = [r3(destinoP0[0] - p0Rot[0]), r3(destinoP0[1] - p0Rot[1])];
  if (modo === 'apoyo') {
    const soporte = estA.tipo === 'portico' ? estA : estB;
    const apoyado = soporte === estA ? estB : estA;
    apoyado.apoyaEn = Array.from(new Set([...(apoyado.apoyaEn || []), soporte.id]));
  }
  if (estB.tipo === 'torre' && estA.tipo === 'fachada' && modo !== 'apoyo' && estB.params.alturaHeredada !== false) {
    estB.params.altura = resA.alturaReal;
  }
  d.uniones = d.uniones.filter((u) => !((u.a.estructuraId === estA.id && u.b.estructuraId === estB.id) || (u.a.estructuraId === estB.id && u.b.estructuraId === estA.id)));
  const nid = `U${d.uniones.reduce((m, u) => Math.max(m, +u.id.replace(/\D/g, '') || 0), 0) + 1}`;
  d.uniones.push({ id: nid, a: { estructuraId: estA.id, puerto: ptA0.id, s: r3(sGuardado) }, b: { estructuraId: estB.id, puerto: idB }, modo });
  return d;
}

/**
 * Busca el mejor encastre para una estructura que se está arrastrando (fantasma).
 * @returns {{a:{estructuraId,puerto,s}, b:{puerto}, modo, distancia, origen, rumbo, etiqueta}|null}
 */
export function buscarSnap(diseno, estructuraMovil, punto, opciones = {}) {
  const radio = opciones.radio ?? 2.5;
  const ctx = contextoResolucion(diseno);
  let mejor = null;
  const movil = { ...clone(estructuraMovil), id: estructuraMovil.id || '__movil' };
  for (const est of diseno.estructuras) {
    if (est.id === movil.id) continue;
    const res = resolver(est, ctx);
    for (const pt of res.puertos) {
      let modo = null;
      if (movil.tipo === 'torre' && (pt.tipo === 'cara' || pt.tipo === 'extremo') && est.tipo === 'fachada') modo = opciones.modo || 'vertical_compartida';
      else if (movil.tipo === 'portico' && pt.tipo === 'base' && est.tipo === 'fachada') modo = 'apoyo';
      else if (movil.tipo === 'fachada' && pt.tipo === 'tope' && est.tipo === 'portico') modo = 'apoyo';
      else if (movil.tipo === 'torre' && pt.tipo === 'cara' && est.tipo !== 'fachada') modo = opciones.modo || 'vertical_compartida';
      if (!modo) continue;
      const ax = pt.p0[0], az = pt.p0[2];
      const t = Math.max(0, Math.min(pt.largo, (punto[0] - ax) * pt.d[0] + (punto[1] - az) * pt.d[2]));
      const qx = ax + pt.d[0] * t, qz = az + pt.d[2] * t;
      const dist = Math.hypot(punto[0] - qx, punto[1] - qz);
      if (dist > radio || (mejor && dist >= mejor.distancia)) continue;
      const tmp = { ...clone(diseno), estructuras: [...diseno.estructuras.filter((e) => e.id !== movil.id), movil] };
      const idB = puertoPorDefecto(movil, modo);
      const largoB = (resolver({ ...movil, origen: [0, 0], rumbo: 0 }, ctx).puertos.find((x) => x.id === idB) || { largo: 0 }).largo;
      const s0 = t - largoB / 2;
      const unido = unir(tmp, { estructuraId: est.id, puerto: pt.id, s: s0 }, { estructuraId: movil.id, puerto: idB }, modo);
      const em = unido.estructuras.find((e) => e.id === movil.id);
      const u = unido.uniones[unido.uniones.length - 1];
      mejor = { a: { estructuraId: est.id, puerto: pt.id, s: u?.a.s ?? s0 }, b: { puerto: idB }, modo, distancia: r3(dist), origen: em.origen, rumbo: em.rumbo, etiqueta: `${est.nombre} · ${pt.etiqueta}` };
    }
  }
  return mejor;
}

function contextoResolucion(diseno) {
  const ctx = { soportes: new Map(), apoyados: new Set(), alturaHeredada: new Map(), arrHeredado: new Map() };
  for (const e of diseno.estructuras) for (const s of e.apoyaEn || []) ctx.apoyados.add(s);
  // soportes (pórticos) primero
  for (const e of diseno.estructuras) {
    if (e.tipo !== 'portico') continue;
    const r = resolverPortico(e, ctx);
    ctx.soportes.set(e.id, { huellas: r.huellas, yTope: r.yTope });
  }
  // torres unidas a fachadas: heredan altura y fase de rosetas
  for (const u of diseno.uniones || []) {
    if (u.modo === 'apoyo') continue;
    const a = diseno.estructuras.find((e) => e.id === u.a.estructuraId);
    const b = diseno.estructuras.find((e) => e.id === u.b.estructuraId);
    if (!a || !b) continue;
    const [fach, torre] = a.tipo === 'fachada' && b.tipo === 'torre' ? [a, b] : b.tipo === 'fachada' && a.tipo === 'torre' ? [b, a] : [null, null];
    if (!fach || torre.sistema !== fach.sistema || torre.params.alturaHeredada === false) continue;
    const rf = resolverFachada(fach, ctx);
    ctx.alturaHeredada.set(torre.id, rf.alturaReal);
    ctx.arrHeredado.set(torre.id, rf.ARR);
  }
  return ctx;
}
const dentroPoligono = (x, z, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) c = !c;
  }
  return c;
};
function enBorde(x, z, poly) {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, z1] = poly[j], [x2, z2] = poly[i];
    const L = Math.hypot(x2 - x1, z2 - z1) || 1;
    const t = ((x - x1) * (x2 - x1) + (z - z1) * (z2 - z1)) / (L * L);
    if (t < -0.001 || t > 1.001) continue;
    if (Math.hypot(x - (x1 + t * (x2 - x1)), z - (z1 + t * (z2 - z1))) < 0.02) return true;
  }
  return false;
}

// ───────────────────────────── constructor de piezas ─────────────────────────────
class Obra {
  constructor() {
    this.piezas = [];
    this.avisos = [];
    this.reglas = [];
    this.celdas = [];
    this._ids = new Set();
  }
  add(est, owner, spec) {
    const it = info(spec.codigo);
    if (!it) throw new Error(`Código fuera de catálogo: ${spec.codigo}`);
    let id = `${owner}:${spec.id}`;
    if (this._ids.has(id)) { let k = 2; while (this._ids.has(`${id}~${k}`)) k++; id = `${id}~${k}`; }
    this._ids.add(id);
    const p = { id, codigo: spec.codigo, tipo: spec.tipo, a: spec.a, b: spec.b, peso_kg: it.peso_kg, estructuraId: est.id, owner };
    if (spec.celda) p.celda = spec.celda;
    if (spec.nodo) p.nodo = spec.nodo;
    if (spec.kit) p.kit = spec.kit;
    if (spec.medida != null) p.medida = r3(spec.medida);
    if (spec.ancho != null) p.ancho = r3(spec.ancho);
    if (spec.primitivas) p.primitivas = spec.primitivas;
    this.piezas.push(p);
    return p;
  }
  aviso(nivel, texto, estructuraId, extra = {}) {
    const id = `A${this.avisos.length + 1}`;
    this.avisos.push({ id, nivel, texto, estructuraId, reparaciones: [], ...extra });
  }
  regla(texto, estructuraId, deshacer) {
    this.reglas.push({ id: `R${this.reglas.length + 1}`, texto, estructuraId, ...(deshacer ? { deshacer } : {}) });
  }
}
const nodoKey = (q) => `${mm(q[0])}|${mm(q[2])}`;

function pilaVerticales(L, paridad, escalonar = false) {
  const seg = [];
  let resto = r3(L);
  if (escalonar) {
    // opcional: escalona empalmes (columnas impares arrancan con 1,00) ⚠
    if (paridad % 2 === 1 && resto >= 3 - EPS) { seg.push(1); resto = r3(resto - 1); }
    while (resto >= 2 - EPS) { seg.push(2); resto = r3(resto - 2); }
  } else {
    // por defecto (con espiga no hace falta escalonar): verticales de 2,00, una de 3,00 al pie si sobra ≥ 1,00
    while (resto >= 2 - EPS) { seg.push(2); resto = r3(resto - 2); }
    if (seg.length && resto >= 1 - EPS) { seg[0] = 3; resto = r3(resto - 1); }
  }
  // el suplemento (≤ 1,50) va arriba
  if (resto > 0.25) seg.push(Math.min(1.5, Math.round(resto * 2) / 2) || 0.5);
  return seg;
}
const vertCodigo = (l) => `VERT-${cod3(l)}-CE`;

function columna(ob, est, owner, W, s, t, y0, y1, o = {}) {
  const pie = W(s, 0, t);
  const nodo = nodoKey(pie);
  const tag = `c${mm(s)}_${mm(t)}`;
  if (o.base !== false) {
    ob.add(est, owner, { id: `${tag}:base`, codigo: o.movil ? 'TORN-600-MOVIL' : 'TORN-600-FIJA', tipo: 'base', a: W(s, 0, t), b: W(s, y0, t), nodo });
    if (!o.sinCollarin) ob.add(est, owner, { id: `${tag}:coll`, codigo: 'COLL-CORTO', tipo: 'collarin', a: W(s, y0, t), b: W(s, y0 + 0.33, t), nodo });
    if (o.terreno === 'tierra') ob.add(est, owner, { id: `${tag}:mad`, codigo: 'MAD-BASE-10x10', tipo: 'base', a: W(s, -0.1, t), b: W(s, 0, t), nodo });
  }
  let y = y0;
  const segs = pilaVerticales(y1 - y0, o.paridad || 0, !!est.params?.escalonarEmpalmes);
  segs.forEach((l, k) => {
    ob.add(est, owner, { id: `${tag}:v${k}`, codigo: vertCodigo(l), tipo: 'vertical', a: W(s, y, t), b: W(s, y + l, t), nodo });
    y = r3(y + l);
  });
  if (o.viaPublica && o.base !== false) {
    ob.add(est, owner, { id: `${tag}:recub`, codigo: 'RECUB-VERT-200', tipo: 'accesorio', a: W(s, y0, t), b: W(s, Math.min(2, y1), t), nodo });
    if (o.esfera) ob.add(est, owner, { id: `${tag}:esf`, codigo: 'ESFERA-SEG', tipo: 'accesorio', a: W(s, 1.0, t), b: W(s, 1.0, t), nodo });
  }
}
const horCodigo = (l) => `HOR-048-${cod3(l)}`;
const tabCodigo = (l) => `TAB-MET-${cod3(l)}`;
const rdpeCodigo = (l) => `RDPE-${cod3(l)}`;
const nTablones = (ancho) => Math.max(1, Math.round(ancho / CRITERIOS.anchoTablon));
function primViga(a, b, alto) {
  // cordones + celosía (representativa)
  const prims = [{ a, b }, { a: [a[0], a[1] - alto, a[2]], b: [b[0], b[1] - alto, b[2]] }];
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const n = Math.max(2, Math.round(L / 0.5));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const P = (t, dy) => [r3(a[0] + (b[0] - a[0]) * t), r3(a[1] + dy), r3(a[2] + (b[2] - a[2]) * t)];
    prims.push(i % 2 ? { a: P(t0, 0), b: P(t1, -alto) } : { a: P(t0, -alto), b: P(t1, 0) });
  }
  return prims;
}

// ── fachada multidireccional ──
function construirFachadaMulti(ob, est, res, ctx) {
  const p = est.params;
  const prof = res.prof;
  const ov = est.overrides || {};
  const nF = res.frentes.length;
  const cubierta = p.cubierta || 'nada';
  const accesoPorTorre = ctx.accesoPorTorre.has(est.id);
  const retiro = Math.max(0, p.retiro ?? 0.2);
  const soportes = (est.apoyaEn || []).map((id) => ctx.soportes.get(id)).filter(Boolean);
  const supTop = (q) => {
    for (const sp of soportes) for (const h of sp.huellas) if (dentroPoligono(q[0], q[2], h) || enBorde(q[0], q[2], h)) return sp.yTope;
    return null;
  };
  // accesos
  const totalMl = sum(res.frentes.map((F) => sum(F.vanos)));
  let accesos = [];
  if (Array.isArray(p.accesos)) accesos = p.accesos.map((a) => ({ f: a.f, v: a.v }));
  else if (!accesoPorTorre) {
    const cant = typeof p.accesos === 'number' ? p.accesos : Math.max(1, Math.round(totalMl / CRITERIOS.accesoCadaMl));
    const globales = [];
    res.frentes.forEach((F) => F.vanos.forEach((v, i) => { if (v === 2.5) globales.push({ f: F.f, v: i }); }));
    for (let k = 0; k < cant && globales.length; k++) {
      const idx = cant === 1 ? Math.min(1, globales.length - 1) : Math.round(((k + 0.5) * globales.length) / cant - 0.5);
      const g = globales[Math.min(globales.length - 1, Math.max(0, idx))];
      if (!accesos.some((a) => a.f === g.f && a.v === g.v)) accesos.push(g);
    }
    if (!globales.length && cant) ob.aviso('aviso', 'No hay vanos de 2,50 para la escotilla de acceso.', est.id, { reparaciones: [] });
  }
  if (accesoPorTorre && p.accesos === 'auto') ob.regla(`${est.nombre}: el acceso es por la torre, no agregué escaleras internas.`, est.id);

  let anclBase = 0, anclDens = 0, anclMens = 0, anclTot = 0;
  const anclKeys = new Set();
  const anclKeysBase = new Set(); // para contar el tresbolillo base con el mismo criterio (sin repetidos ni columnas sin muro)
  const anclCandidatos = [];
  const mensKeys = new Set();
  let diagTxt = [];
  let barandasLados = 0;

  for (const F of res.frentes) {
    const f = F.f;
    const mk = marco(F.origen, F.rumbo);
    const W = mk.W;
    const S = F.S, m = F.vanos.length, N = F.niveles.length;
    const ARR = F.ARR;
    const cot = (n) => F.niveles[n].cota;
    const ringCota = (r) => (r === 0 ? ARR : cot(r - 1));
    const owner = `${est.id}/f${f}`;
    const primero = f === 0, ultimo = f === nF - 1;
    const iniAbierto = primero || (F.angulo > 0 && F.modoEsquina === 'vertical_compartida');
    const finAbierto = ultimo;
    const O = (v, n) => ov[`${f}:${v}:${n}`] || {};
    // cuadro de esquina (vano 0 de un frente con vertical compartida): su lado interior es el paso desde el frente anterior
    const esqV0 = F.vanoEsquina > 0;
    // el plano final de este frente es el paso al cuadro de esquina / vano de giro del frente siguiente
    const finEsPaso = !ultimo && res.frentes[f + 1].angulo > 0;
    // esquina entrante: el último vano es un cuadro cuyo lado exterior es el paso al frente siguiente
    const esqFin = F.vanoEsquinaFin > 0;
    const ladoPaso = (v, t) => (esqV0 && v === 0 && t === 0) || (esqFin && v === m - 1 && Math.abs(t - prof) < EPS);

    // celdas con abertura → huecos (bbox de componentes conexas)
    const ab = new Set();
    for (let v = 0; v < m; v++) for (let n = 0; n < N; n++) if (O(v, n).abertura) ab.add(`${v}:${n}`);
    const huecos = [];
    const visto = new Set();
    for (const k of ab) {
      if (visto.has(k)) continue;
      const pila = [k];
      let v0 = Infinity, v1 = -1, n0 = Infinity, n1 = -1;
      visto.add(k);
      while (pila.length) {
        const [v, n] = pila.pop().split(':').map(Number);
        v0 = Math.min(v0, v); v1 = Math.max(v1, v); n0 = Math.min(n0, n); n1 = Math.max(n1, n);
        for (const [dv, dn] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const kk = `${v + dv}:${n + dn}`;
          if (ab.has(kk) && !visto.has(kk)) { visto.add(kk); pila.push(kk); }
        }
      }
      const viga = O(v0, n0).viga !== false;
      huecos.push({ v0, v1, n0, n1, viga });
    }
    const enHueco = (v, n) => huecos.find((h) => v >= h.v0 && v <= h.v1 && n >= h.n0 && n <= h.n1);
    const colInterior = (i) => huecos.find((h) => h.v1 > h.v0 && i > h.v0 && i <= h.v1);
    const platQuitada = (v, n) => huecos.some((h) => v >= h.v0 && v <= h.v1 && n >= h.n0 && n <= h.n1 - 1);
    const ringQuitado = (v, r) => huecos.some((h) => v >= h.v0 && v <= h.v1 && ((h.n0 === 0 && r === 0) || (r >= h.n0 + 1 && r <= h.n1)));

    // arranque de cada columna
    const colIni = []; // [i][side] = {y, base}
    for (let i = 0; i <= m; i++) {
      colIni[i] = [0, prof].map((t) => {
        const h = colInterior(i);
        if (h) return { y: cot(h.n1), base: false, hueco: h };
        const st = supTop(W(S[i], 0, t));
        if (st != null) return { y: st, base: false, apoyo: true };
        return { y: ARR, base: true };
      });
    }
    const colY = (i) => Math.max(colIni[i][0].y, colIni[i][1].y);
    const bajoApoyo = (v, n) => {
      const top = Math.max(...[v, v + 1].flatMap((i) => colIni[i].filter((c) => c.apoyo).map((c) => c.y)), -Infinity);
      return top > -Infinity && cot(n) <= top + EPS;
    };
    const supEnFrente = colIni.some((c) => c.some((x) => x.apoyo));

    // verticales
    for (let i = 0; i <= m; i++) {
      [0, prof].forEach((t, side) => {
        const ci = colIni[i][side];
        const esfera = p.viaPublica && side === 1 && ci.base;
        columna(ob, est, owner, W, S[i], t, ci.y, F.yTopCol, { base: ci.base, paridad: i + f, viaPublica: p.viaPublica, esfera, terreno: p.terreno });
      });
    }

    // horizontales (anillos)
    for (let r = 0; r <= N; r++) {
      const c = ringCota(r);
      for (let v = 0; v < m; v++) {
        if (ringQuitado(v, r)) continue;
        if (c < colY(v) - EPS || c < colY(v + 1) - EPS) continue;
        const celda = r === 0 ? `${f}:${v}:0` : `${f}:${v}:${r - 1}`;
        for (const [t, lado] of [[0, 'i'], [prof, 'e']]) {
          // el lado interior del cuadro de esquina es el travesaño final del frente anterior: mismo criterio de paso
          if (ladoPaso(v, t) && p.viaPublica && c < CRITERIOS.galiboPeatonal - EPS) continue;
          ob.add(est, owner, { id: `h${v}_${r}${lado}`, codigo: horCodigo(F.vanos[v]), tipo: 'horizontal', a: W(S[v], c, t), b: W(S[v + 1], c, t), celda });
        }
      }
      for (let i = 0; i <= m; i++) {
        if (c < colY(i) - EPS) continue;
        if (p.viaPublica && c < CRITERIOS.galiboPeatonal - EPS) continue; // paso peatonal libre
        if (ringQuitado(Math.min(i, m - 1), r) && ringQuitado(Math.max(0, i - 1), r) && i > 0 && i < m) continue;
        ob.add(est, owner, { id: `t${i}_${r}`, codigo: horCodigo(prof), tipo: 'horizontal', a: W(S[i], c, 0), b: W(S[i], c, prof) });
      }
      // anillos intermedios: ninguna vertical queda más de 2,00 sin horizontales (típicamente el tramo de PB).
      // Se ubican lo más alto posible en la grilla de rosetas para dejar paso; el travesaño solo si queda ≥ 2,00
      // sobre el piso cuando hay vía pública.
      if (r < N) {
        const cSup = ringCota(r + 1);
        const intermedios = [];
        for (let c0 = c; cSup - c0 > CRITERIOS.libreVerticalMax + EPS;) {
          const ci = r3(c0 + Math.floor((CRITERIOS.libreVerticalMax + EPS) / MULTI.pasoRoseta) * MULTI.pasoRoseta);
          intermedios.push(ci);
          c0 = ci;
        }
        intermedios.forEach((ci, j) => {
          for (let v = 0; v < m; v++) {
            if (enHueco(v, r) || ci < colY(v) - EPS || ci < colY(v + 1) - EPS) continue;
            for (const [t, lado] of [[0, 'i'], [prof, 'e']]) {
              if (ladoPaso(v, t) && p.viaPublica && ci < CRITERIOS.libreBajoTravesano - EPS) continue;
              ob.add(est, owner, { id: `hm${v}_${r}_${j}${lado}`, codigo: horCodigo(F.vanos[v]), tipo: 'horizontal', a: W(S[v], ci, t), b: W(S[v + 1], ci, t), celda: `${f}:${v}:${r}` });
            }
          }
          if (p.viaPublica && ci < CRITERIOS.libreBajoTravesano - EPS) return;
          for (let i = 0; i <= m; i++) {
            if (ci < colY(i) - EPS) continue;
            if (enHueco(Math.min(i, m - 1), r) && enHueco(Math.max(0, i - 1), r) && i > 0 && i < m) continue;
            ob.add(est, owner, { id: `tm${i}_${r}_${j}`, codigo: horCodigo(prof), tipo: 'horizontal', a: W(S[i], ci, 0), b: W(S[i], ci, prof) });
          }
        });
      }
    }

    // plataformas, barandas, ménsulas, escaleras
    const accF = accesos.filter((a) => a.f === f).map((a) => a.v);
    const mensDe = (v, n) => {
      const o = O(v, n).mensula;
      if (o === false) return null;
      if (o === 'afuera' || o === 'fachada') {
        const spec = (p.mensulas || []).find((x) => x.lado === o);
        return { lado: o, brazo: spec?.brazo || p.brazoMensula || 0.73, override: true };
      }
      for (const spec of p.mensulas || []) {
        if (spec.frentes && !spec.frentes.includes(f)) continue;
        if (n < (spec.desdeNivel ?? 0) || n > (spec.hastaNivel ?? Infinity)) continue;
        return { lado: spec.lado, brazo: spec.brazo || p.brazoMensula || 0.73 };
      }
      return null;
    };
    for (let n = 0; n < N; n++) {
      const lv = F.niveles[n];
      const c = lv.cota;
      for (let v = 0; v < m; v++) {
        const celda = `${f}:${v}:${n}`;
        const o = O(v, n);
        if (bajoApoyo(v, n)) continue;
        const esAcceso = accF.includes(v);
        const conPlat = (lv.plataforma || esAcceso) && !platQuitada(v, n) && !o.sinPlataforma && !(enHueco(v, n) && n < enHueco(v, n).n1);
        const vano = F.vanos[v];
        const mens = mensDe(v, n);
        if (conPlat) {
          const nt = nTablones(prof);
          for (let j = 0; j < nt; j++) {
            const t = r3(((j + 0.5) * prof) / nt);
            const esc = esAcceso && j === 0 && vano === 2.5 && n < N - 1;
            ob.add(est, owner, { id: `tab${v}_${n}_${j}`, codigo: esc ? 'TAB-ESC-250' : tabCodigo(vano), tipo: 'plataforma', a: W(S[v], c, t), b: W(S[v + 1], c, t), celda });
          }
          if (lv.bandeja) ob.add(est, owner, { id: `fen${v}_${n}`, codigo: 'PLACA-FEN-122x244', tipo: 'plataforma', a: W(S[v], c + 0.04, 0), b: W(S[v + 1], c + 0.04, prof), celda, medida: vano * prof, ancho: prof });
        }
        // ménsulas (aunque el nivel no tenga plataforma propia, la ménsula lleva sus tablones)
        let extAfuera = 0, intFachada = 0;
        if (mens && !enHueco(v, n)) {
          const tBase = mens.lado === 'afuera' ? prof : 0;
          const sg = mens.lado === 'afuera' ? 1 : -1;
          const tTip = tBase + sg * mens.brazo;
          const codM = `MENSULA-${cod3(mens.brazo)}`;
          for (const i of [v, v + 1]) {
            const key = `${f}:${i}:${n}:${mens.lado}`;
            if (mensKeys.has(key)) continue;
            mensKeys.add(key);
            const drop = Math.min(0.5, mens.brazo * 0.7);
            ob.add(est, owner, { id: `men${i}_${n}${mens.lado[0]}`, codigo: codM, tipo: 'mensula', a: W(S[i], c, tBase), b: W(S[i], c, tTip), celda, primitivas: [{ a: W(S[i], c, tBase), b: W(S[i], c, tTip) }, { a: W(S[i], c - drop, tBase), b: W(S[i], c, tTip) }] });
          }
          const ntm = nTablones(mens.brazo);
          for (let j = 0; j < ntm; j++) {
            const t = r3(tBase + sg * ((j + 0.5) * mens.brazo) / ntm);
            ob.add(est, owner, { id: `tabm${v}_${n}_${j}`, codigo: tabCodigo(vano), tipo: 'plataforma', a: W(S[v], c, t), b: W(S[v + 1], c, t), celda });
          }
          if (mens.lado === 'afuera') extAfuera = tTip; else intFachada = tTip;
        }
        const tienePiso = conPlat || (mens && !enHueco(v, n));
        if (!tienePiso) continue;
        const alturas = lv.faldon ? [0.5] : [0.5, 1.0];
        const barandaEn = (t, lado, conPostes) => {
          alturas.forEach((dy, k) => ob.add(est, owner, { id: `bar${v}_${n}${lado}${k}`, codigo: horCodigo(vano), tipo: 'baranda', a: W(S[v], c + dy, t), b: W(S[v + 1], c + dy, t), celda }));
          ob.add(est, owner, { id: `rod${v}_${n}${lado}`, codigo: rdpeCodigo(vano), tipo: 'rodapie', a: W(S[v], c + 0.08, t), b: W(S[v + 1], c + 0.08, t), celda });
          if (conPostes) for (const i of [v, v + 1]) {
            const key = `post:${f}:${i}:${n}:${lado}`;
            if (mensKeys.has(key)) continue;
            mensKeys.add(key);
            ob.add(est, owner, { id: `post${i}_${n}${lado}`, codigo: 'VERT-100-SE', tipo: 'vertical', a: W(S[i], c, t), b: W(S[i], c + 1, t), celda });
          }
          barandasLados++;
        };
        if (extAfuera) barandaEn(extAfuera, 'm', true);
        else if (!ladoPaso(v, prof)) barandaEn(prof, 'e', false);
        const gap = intFachada ? retiro + intFachada : retiro; // intFachada es negativo
        if (gap > CRITERIOS.retiroLibre + EPS && !(esqV0 && v === 0)) barandaEn(intFachada || 0, intFachada ? 'n' : 'i', !!intFachada);
        const lats = [];
        if (v === 0 && iniAbierto) lats.push([S[0], 'L0']);
        if (v === m - 1 && finAbierto) lats.push([S[m], 'L1']);
        for (const [s, lado] of lats) {
          // lateral del cuerpo y, si hay ménsula en el extremo, también hasta su punta
          const tramos = [[0, prof, '']];
          if (mens && !enHueco(v, n)) tramos.push(mens.lado === 'afuera' ? [prof, extAfuera, 'm'] : [intFachada, 0, 'm']);
          for (const [t0, t1, suf] of tramos) {
            const len = r3(Math.abs(t1 - t0));
            const codH = info(horCodigo(len)) ? horCodigo(len) : canoCodigo(canoPara(len));
            const codR = info(rdpeCodigo(len)) ? rdpeCodigo(len) : rdpeCodigo(0.73);
            alturas.forEach((dy, k) => ob.add(est, owner, { id: `lat${lado}${suf}_${n}_${k}`, codigo: codH, tipo: 'baranda', a: W(s, c + dy, t0), b: W(s, c + dy, t1), celda }));
            ob.add(est, owner, { id: `latr${lado}${suf}_${n}`, codigo: codR, tipo: 'rodapie', a: W(s, c + 0.08, t0), b: W(s, c + 0.08, t1), celda });
          }
        }
      }
    }
    // escaleras internas en vanos de acceso (desde el piso hasta el último nivel)
    for (const v of accF) {
      if (v >= m) continue;
      let yb = colY(v) > ARR + EPS ? colY(v) : 0;
      for (let n = 0; n < N - 0; n++) {
        const c = cot(n);
        if (bajoApoyo(v, n) || enHueco(v, n)) { yb = c; continue; }
        if (n === N - 1 && F.niveles[n].plataforma) { /* llega al último nivel */ }
        ob.add(est, owner, { id: `esc${v}_${n}`, codigo: 'ESC-INT-MULTI', tipo: 'escalera', a: W(S[v] + 0.25, yb, prof * 0.5), b: W(S[v] + 1.05, c, prof * 0.5), celda: `${f}:${v}:${n}` });
        yb = c;
      }
      ob.regla(`Escotilla y escalera de acceso en ${F.etiqueta}, vano ${v + 1} (todos los niveles).`, est.id, { tipo: 'param', estructuraId: est.id, ruta: 'params.accesos', valor: [] });
    }

    // diagonales: extremos y cada ≤5 vanos, alternando
    const set = new Set([0, m - 1]);
    for (let v = 0; v < m; v += CRITERIOS.diagonalCadaVanos) set.add(v);
    // la cara exterior del cuadro entrante es paso: la diagonal va en el vano anterior
    if (esqFin && m > 1) { set.delete(m - 1); set.add(m - 2); }
    const diag = [...set].filter((v) => v >= 0).sort((a, b) => a - b);
    diagTxt.push(`${F.etiqueta}: vanos ${diag.map((v) => v + 1).join(', ')}`);
    const bandas = [];
    for (let n = N - 1; n >= 0; n--) {
      const top = cot(n);
      const yb = top - 2 >= ARR - EPS ? r3(top - 2) : ARR;
      bandas.push({ n, yb, yt: r3(yb + 2) });
    }
    bandas.forEach(({ n, yb, yt }) => {
      diag.forEach((v, k) => {
        if (enHueco(v, n) || bajoApoyo(v, n)) return;
        if (yb < colY(v) - EPS || yb < colY(v + 1) - EPS) return;
        const sube = (n + k) % 2 === 0;
        ob.add(est, owner, { id: `dg${v}_${n}`, codigo: `DIAG-200x${cod3(F.vanos[v])}`, tipo: 'diagonal', a: W(sube ? S[v] : S[v + 1], yb, prof), b: W(sube ? S[v + 1] : S[v], yt, prof), celda: `${f}:${v}:${n}` });
      });
      const extremos = [];
      if (primero || esqV0) extremos.push(0); // en el cuadro de esquina, S[0] es su lado exterior
      if (!finEsPaso) extremos.push(m); // no cruzar una diagonal en el paso hacia la esquina
      for (const i of extremos) {
        if (p.viaPublica && yb < CRITERIOS.galiboPeatonal - EPS) continue;
        if (yb < colY(i) - EPS) continue;
        const sube = n % 2 === 0;
        ob.add(est, owner, { id: `dgt${i}_${n}`, codigo: `DIAG-200x${cod3(prof)}`, tipo: 'diagonal', a: W(S[i], yb, sube ? 0 : prof), b: W(S[i], yt, sube ? prof : 0) });
      }
    });

    // anclajes al tresbolillo (lado fachada)
    if (p.anclada !== false) {
      const filas = (dn) => F.niveles.map((_, n) => n).filter((n) => (N - 1 - n) % dn === 0);
      const grilla = (dx, dn) => {
        const out = new Set();
        filas(dn).forEach((n) => {
          const fila = (N - 1 - n) / dn;
          for (let i = 0; i <= m; i++) if ((i + fila) % dx === 0 || i === 0 || i === m) out.add(`${i}:${n}`);
        });
        return out;
      };
      const base = grilla(CRITERIOS.anclajeDx, CRITERIOS.anclajeDn);
      let usado = base;
      if (cubierta === 'media_sombra') usado = grilla(2, 1);
      if (cubierta === 'lona') usado = grilla(1, 1);
      if (p.densificarAnclajes === false) usado = base;
      usado = new Set(usado);
      for (let v = 0; v < m; v++) for (let n = 0; n < N; n++) {
        if (O(v, n).lona && cubierta !== 'lona') usado.add(`${v}:${n}`);
        const mens = mensDe(v, n);
        if (mens) { const k = [`${v}:${n}`, `${v + 1}:${n}`].find((x) => +x.split(':')[0] % 2 === 0); if (k && !usado.has(k)) { usado.add(k); anclMens++; } }
      }
      for (const [k, val] of Object.entries(ov)) {
        const [ff, v, n] = k.split(':').map(Number);
        if (ff !== f || val.anclaje === undefined) continue;
        if (val.anclaje) usado.add(`${v}:${n}`); else usado.delete(`${v}:${n}`);
      }
      const tieneMuro = (i) => S[i] >= -EPS; // las columnas del cuadro de esquina (s < 0) no tienen pared detrás
      const keyAnc = (k) => {
        const [i, n] = k.split(':').map(Number);
        if (i > m || n >= N || !tieneMuro(i) || cot(n) < colY(i) - EPS) return null;
        return `${nodoKey(W(S[i], cot(n), 0))}|${mm(cot(n))}`;
      };
      for (const k of base) { const kk = keyAnc(k); if (kk && !anclKeysBase.has(kk)) { anclKeysBase.add(kk); anclBase++; } }
      const antesF = anclTot;
      for (let i = 0; i <= m; i++) if (tieneMuro(i) && !usado.has(`${i}:${N - 1}`)) anclCandidatos.push({ owner, W, s: S[i], c: cot(N - 1), i, n: N - 1, f, m, ok: cot(N - 1) >= colY(i) - EPS });
      for (const k of [...usado].sort()) {
        const [i, n] = k.split(':').map(Number);
        if (i > m || n >= N || !tieneMuro(i)) continue;
        const c = cot(n);
        if (c < colY(i) - EPS) continue;
        const q = W(S[i], c, 0);
        const key = `${nodoKey(q)}|${mm(c)}`;
        if (anclKeys.has(key)) continue;
        anclKeys.add(key);
        ob.add(est, owner, { id: `anc${i}_${n}`, codigo: 'ANC-QUIM-M12', tipo: 'anclaje', a: q, b: W(S[i], c, -Math.max(0.15, retiro)), celda: `${f}:${Math.min(i, m - 1)}:${n}` });
        amarreLargo(ob, est, owner, `anc${i}_${n}`, q, W(S[i], c, -retiro), retiro);
        anclTot++;
      }
      anclDens += anclTot - antesF;
    }

    // cubierta (media sombra / lona)
    let areaCub = 0;
    for (let v = 0; v < m; v++) for (let n = 0; n < N; n++) {
      const o = O(v, n);
      const tipoCub = o.lona ? 'lona' : cubierta;
      if (tipoCub === 'nada' || enHueco(v, n) || bajoApoyo(v, n) || ladoPaso(v, prof)) continue;
      if (F.niveles[n].bandeja && n === 0 && p.niveles !== 'pantalla') continue; // PB libre bajo la bandeja
      if (p.niveles === 'pantalla' && n === 0) continue;
      const y0 = n === 0 ? ARR : cot(n - 1);
      const y1 = n === N - 1 ? F.yTopCol : cot(n);
      const area = F.vanos[v] * (y1 - y0);
      areaCub += area;
      ob.add(est, owner, { id: `cub${v}_${n}`, codigo: tipoCub === 'lona' ? 'LONA-PVC' : 'MEDIA-SOMBRA-5', tipo: 'cubierta', a: W(S[v], y0, prof + 0.04), b: W(S[v + 1], y1, prof + 0.04), celda: `${f}:${v}:${n}`, medida: area });
      // el cuadro de esquina tiene una segunda cara exterior (la que continúa la cara del frente anterior)
      if (esqV0 && v === 0) {
        ob.add(est, owner, { id: `cubesq_${n}`, codigo: tipoCub === 'lona' ? 'LONA-PVC' : 'MEDIA-SOMBRA-5', tipo: 'cubierta', a: W(S[0] - 0.04, y0, 0), b: W(S[0] - 0.04, y1, prof + 0.04), celda: `${f}:0:${n}`, medida: r3(prof * (y1 - y0)) });
        areaCub += prof * (y1 - y0);
      }
    }
    if (p.concertina) ob.add(est, owner, { id: 'conc', codigo: 'ALAMB-CONC-45x10', tipo: 'accesorio', a: W(S[0], cot(0) + 0.3, prof), b: W(S[m], cot(0) + 0.3, prof), medida: S[m] - S[0] });

    // vigas de huecos
    for (const h of huecos) {
      const luz = r3(S[h.v1 + 1] - S[h.v0]);
      const celda0 = `${f}:${h.v0}:${h.n0}`;
      const txtH = `abertura N${h.n0 + 1}${h.n1 > h.n0 ? `–N${h.n1 + 1}` : ''} V${h.v0 + 1}${h.v1 > h.v0 ? `–V${h.v1 + 1}` : ''}`;
      if (h.n1 >= N - 1) {
        ob.aviso('error', `${F.etiqueta}: la ${txtH} llega al último nivel; no queda dónde apoyar la viga.`, est.id, { celda: celda0, reparaciones: [{ etiqueta: 'Quitar abertura', accion: { tipo: 'overrides', estructuraId: est.id, celdas: celdasRect(f, h), valor: { abertura: null, viga: null } } }] });
        continue;
      }
      if (h.v1 === h.v0) { ob.regla(`${F.etiqueta}: ${txtH} de un vano, no hace falta viga (las verticales quedan).`, est.id); continue; }
      const yv = cot(h.n1);
      if (h.viga) {
        const vg = luz <= 2.5 + EPS ? { codigo: `VIGA-PTE-${luz <= 1.5 + EPS ? '150' : '250'}`, luz } : elegirViga(luz);
        if (vg.excede) {
          ob.aviso('error', `${F.etiqueta}: la ${txtH} mide ${fmt(luz)} m y la viga más larga es de 7,50.`, est.id, { celda: celda0, reparaciones: [{ etiqueta: 'Achicar la abertura', accion: { tipo: 'overrides', estructuraId: est.id, celdas: celdasRect(f, h), valor: { abertura: null, viga: null } } }] });
          continue;
        }
        for (const [t, lado] of [[0, 'i'], [prof, 'e']]) {
          const a = W(S[h.v0], yv, t), b = W(S[h.v1 + 1], yv, t);
          ob.add(est, owner, { id: `viga${h.v0}_${h.n1}${lado}`, codigo: vg.codigo, tipo: 'viga', a, b, celda: celda0, primitivas: primViga(a, b, 0.5) });
        }
        if (Math.abs(vg.luz - luz) > 0.05) ob.aviso('aviso', `${F.etiqueta}: la ${txtH} mide ${fmt(luz)}; la viga ${vg.codigo} no coincide con los vanos.`, est.id, { celda: celda0 });
        ob.regla(`Propuse viga ${vg.codigo} sobre la ${txtH} de ${F.etiqueta} (2 vigas, luz ${fmt(luz)}).`, est.id, { tipo: 'override', estructuraId: est.id, celda: celda0, valor: { viga: false } });
      } else {
        const colgadas = (h.v1 - h.v0) * 2;
        ob.aviso('error', `${F.etiqueta}: ${txtH} sin viga puente: ${colgadas} verticales quedan sin apoyo.`, est.id, { celda: celda0, reparaciones: [{ etiqueta: 'Agregar viga puente', accion: { tipo: 'override', estructuraId: est.id, celda: celda0, valor: { viga: null } } }] });
      }
    }

    // celdas
    for (let v = 0; v < m; v++) for (let n = 0; n < N; n++) {
      const o = O(v, n);
      const y0 = n === 0 ? ARR : cot(n - 1);
      const y1 = cot(n);
      const h = enHueco(v, n);
      ob.celdas.push({
        id: `${est.id}:${f}:${v}:${n}`, celda: `${f}:${v}:${n}`, estructuraId: est.id, f, v, n,
        s0: S[v], s1: S[v + 1], y0, y1, vano: F.vanos[v],
        estado: {
          plataforma: !!((F.niveles[n].plataforma || accF.includes(v)) && !platQuitada(v, n) && !o.sinPlataforma && !bajoApoyo(v, n)),
          abertura: !!h, lona: !!o.lona, mensula: mensDe(v, n)?.lado || null, anclaje: o.anclaje ?? null,
          bajoApoyo: bajoApoyo(v, n), acceso: accF.includes(v), bandeja: !!F.niveles[n].bandeja,
          cubierta: o.lona ? 'lona' : cubierta,
        },
        override: Object.keys(o).length > 0,
        esquinas: [W(S[v], y0, prof), W(S[v + 1], y0, prof), W(S[v + 1], y1, prof), W(S[v], y1, prof)],
      });
    }

    // relleno y altura
    if (Math.abs(F.relleno.desvio) > CRITERIOS.toleranciaRelleno + EPS) {
      ob.aviso('aviso', `${F.etiqueta}: ${F.relleno.texto} (${F.relleno.desvio > 0 ? 'sobran' : 'faltan'} ${fmt(Math.abs(F.relleno.desvio))} m).`, est.id, {
        reparaciones: F.relleno.alternativas.slice(0, 2).map((a) => ({ etiqueta: `${a.etiqueta}: ${a.texto}`, accion: { tipo: 'vanos', estructuraId: est.id, frente: f, vanos: a.vanos } })),
      });
    }
    if (Math.abs(F.alturaReal - F.altura) > 0.25 + EPS) ob.aviso('info', `${F.etiqueta}: altura real ${fmt(F.alturaReal)} m (pediste ${fmt(F.altura)}).`, est.id);
    if (p.bandejaPB && !supEnFrente && cot(0) < CRITERIOS.galiboPeatonal - EPS) {
      ob.aviso('error', `${F.etiqueta}: la bandeja queda a ${fmt(cot(0))} m; el paso peatonal pide ≥ 2,50.`, est.id, { reparaciones: [{ etiqueta: 'Subir la altura', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.altura', valor: r3(p.altura + 0.5) } }] });
    }
  }

  // esquinas: unión interna + vano de giro
  for (let k = 1; k < nF; k++) {
    const A = res.frentes[k - 1], B = res.frentes[k];
    const modo = B.angulo > 0 ? B.modoEsquina : B.angulo < 0 ? 'entrante' : 'continuo';
    if (modo === 'vano_giro') construirVanoGiro(ob, est, A, B, prof, p);
    ctx.uniones.push({
      id: `${est.id}:esq${k}`, tipo: 'esquina', estructuraId: est.id, modo,
      a: { estructuraId: est.id, frente: A.f }, b: { estructuraId: est.id, frente: B.f },
      etiqueta: `${A.etiqueta} ↔ ${B.etiqueta} · ${modo === 'vertical_compartida' ? 'vertical compartida' : modo === 'vano_giro' ? `vano de giro ${fmt(prof)}` : modo === 'entrante' ? 'esquina entrante' : 'continuo'}`,
      parKey: `${est.id}/f${A.f}|${est.id}/f${B.f}`, editable: B.angulo > 0,
      alternar: B.angulo > 0 ? { tipo: 'esquina', estructuraId: est.id, indice: k - 1, modo: modo === 'vano_giro' ? 'vertical_compartida' : 'vano_giro' } : null,
    });
    if (B.angulo !== 0) ob.regla(`Esquina ${A.etiqueta} ↔ ${B.etiqueta}: ${modo === 'vano_giro' ? `vano de giro de ${fmt(prof)}` : 'vertical compartida'}.`, est.id, B.angulo > 0 ? { tipo: 'esquina', estructuraId: est.id, indice: k - 1, modo: modo === 'vano_giro' ? 'vertical_compartida' : 'vano_giro' } : undefined);
  }

  if (p.anclada !== false && anclTot < CRITERIOS.anclajeMinimo) {
    let agregados = 0;
    for (const c of anclCandidatos) {
      if (anclTot >= CRITERIOS.anclajeMinimo) break;
      if (!c.ok) continue;
      const q = c.W(c.s, c.c, 0);
      const key = `${nodoKey(q)}|${mm(c.c)}`;
      if (anclKeys.has(key)) continue;
      anclKeys.add(key);
      ob.add(est, c.owner, { id: `ancmin${c.i}`, codigo: 'ANC-QUIM-M12', tipo: 'anclaje', a: q, b: c.W(c.s, c.c, -Math.max(0.15, retiro)), celda: `${c.f}:${Math.min(c.i, c.m - 1)}:${c.n}` });
      amarreLargo(ob, est, c.owner, `ancmin${c.i}`, q, c.W(c.s, c.c, -retiro), retiro);
      anclTot++; agregados++;
    }
    if (agregados) ob.regla(`Completé el mínimo de ${CRITERIOS.anclajeMinimo} anclajes en el último nivel.`, est.id);
  }
  if (diagTxt.length) ob.regla(`Diagonales en extremos y cada ≤${CRITERIOS.diagonalCadaVanos} vanos, alternando (${diagTxt.join(' · ')}).`, est.id);
  if (barandasLados) ob.regla(`Barandas dobles y rodapiés en los lados abiertos${retiro > CRITERIOS.retiroLibre ? ' (también del lado fachada: retiro ' + fmt(retiro) + ')' : ''}.`, est.id);
  if (p.anclada !== false) {
    const extra = anclDens - anclBase;
    if (extra > 0 && cubierta !== 'nada') ob.regla(`Agregué ${extra} anclajes por la ${cubierta === 'lona' ? 'lona' : 'media sombra'}.`, est.id, { tipo: 'param', estructuraId: est.id, ruta: 'params.densificarAnclajes', valor: false });
    if (anclMens) ob.regla(`Agregué ${anclMens} anclajes por las ménsulas (M09 pendiente).`, est.id);
    if (anclTot < CRITERIOS.anclajeMinimo && !soportes.length) ob.aviso('aviso', `${est.nombre}: ${anclTot} anclajes, el mínimo es ${CRITERIOS.anclajeMinimo}.`, est.id);
  } else {
    const Hm = res.alturaReal;
    const Bm = prof + (p.pataDeGallo ? 3 : 0);
    if (Hm / Bm > CRITERIOS.hbMax) avisoEsbeltez(ob, est, Hm, Bm, prof);
  }
  if (p.bandejaPB && !soportes.length) ob.regla('Bandeja de fenólico en PB, esferas y recubrimiento de verticales hasta 2 m.', est.id);
  avisoPasoBajoBandeja(ob, est, prof, 1.25, !soportes.length);
  if (!soportes.length && res.ARR > CRITERIOS.arranqueMax + EPS) ob.aviso('aviso', `${est.nombre}: arranque a ${fmt(res.ARR)} m; el tornillón queda muy extendido (útil ≈ ${fmt(CRITERIOS.arranqueMax)}). Sumá un VERT-050 de suplemento abajo o revisá la altura ⚠.`, est.id, { reparaciones: [{ etiqueta: `Altura ${fmt(r3(p.altura - res.ARR + 0.25))}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.altura', valor: r3(p.altura - res.ARR + 0.25) } }] });
  if ((p.mensulas || []).length || Object.values(ov).some((o) => o.mensula)) validarMensulas(ob, est, res, retiro);
}
/** Con retiro > 0,45 el caño de amarre del anclaje no llega: caño de la medida + 2 grampas ⚠. */
function amarreLargo(ob, est, owner, id, q, muro, retiro) {
  if (retiro <= CRITERIOS.retiroAmarreCorto + EPS) return;
  ob.add(est, owner, { id: `${id}:cano`, codigo: canoCodigo(canoPara(retiro)), tipo: 'accesorio', a: q, b: q });
  ob.add(est, owner, { id: `${id}:g0`, codigo: 'NUDO-FIJO', tipo: 'accesorio', a: q, b: q });
  ob.add(est, owner, { id: `${id}:g1`, codigo: 'NUDO-FIJO', tipo: 'accesorio', a: muro, b: muro });
}
function celdasRect(f, h) {
  const out = [];
  for (let v = h.v0; v <= h.v1; v++) for (let n = h.n0; n <= h.n1; n++) out.push(`${f}:${v}:${n}`);
  return out;
}
function validarMensulas(ob, est, res, retiro) {
  const p = est.params;
  const specs = [...(p.mensulas || [])];
  for (const o of Object.values(est.overrides || {})) if (o.mensula) specs.push({ lado: o.mensula, brazo: specs.find((s) => s.lado === o.mensula)?.brazo || p.brazoMensula || 0.73 });
  for (const sp of specs) {
    if (sp.lado === 'fachada' && sp.brazo > retiro - 0.05 + EPS) {
      const cabe = [...MULTI.mensulas].reverse().find((b) => b <= retiro - 0.05 + EPS);
      const rep = [];
      if (cabe) rep.push({ etiqueta: `Usar ménsula de ${fmt(cabe)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.mensulas', valor: p.mensulas.map((x) => (x.lado === 'fachada' ? { ...x, brazo: cabe } : x)) } });
      rep.push({ etiqueta: `Retirar a ${fmt(sp.brazo + 0.1)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.retiro', valor: r3(sp.brazo + 0.1) } });
      ob.aviso('error', `La ménsula de ${fmt(sp.brazo)} hacia la fachada choca: el retiro es ${fmt(retiro)}.`, est.id, { reparaciones: rep });
      break;
    }
  }
  if (specs.some((s) => s.lado === 'afuera' && s.brazo >= 0.73 - EPS)) ob.aviso('aviso', `Ménsula hacia afuera de ${fmt(Math.max(...specs.filter((s) => s.lado === 'afuera').map((s) => s.brazo)))}: verificar M09 y contrapeso. ${PREDIMENSIONADO}.`, est.id);
  if (specs.length) ob.regla(`Ménsulas ${[...new Set(specs.map((s) => (s.lado === 'fachada' ? 'hacia la fachada' : 'hacia afuera')))].join(' y ')} con sus tablones y barandas en el borde.`, est.id);
}
function avisoEsbeltez(ob, est, H, B, prof, extra = {}) {
  const reps = [
    { etiqueta: 'Anclar', accion: { tipo: 'param', estructuraId: est.id, ruta: est.tipo === 'portico' ? 'params.anclado' : 'params.anclada', valor: true } },
  ];
  if (!est.params.pataDeGallo) reps.push({ etiqueta: 'Pata de gallo', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.pataDeGallo', valor: true } });
  if (extra.ensanchar) reps.push(extra.ensanchar);
  ob.aviso('aviso', `${est.nombre}: H/B = ${fmt(H / B, 1)} > ${CRITERIOS.hbMax} sin anclar (H ${fmt(H)}, B ${fmt(B)}). ${PREDIMENSIONADO}.`, est.id, { reparaciones: reps });
}
function construirVanoGiro(ob, est, A, B, prof, p) {
  const owner = `${est.id}/c${B.f}`;
  const mkA = marco(A.origen, A.rumbo);
  const sA = A.S[A.S.length - 1];
  // 4 columnas: fin de A (interior y exterior), inicio exterior de B y la de esquina
  const q = (s, t) => mkA.W(s, 0, t);
  const esquina = [sA + prof, prof];
  const W = mkA.W;
  const ARR = A.ARR;
  const yTop = Math.min(A.yTopCol, B.yTopCol);
  columna(ob, est, owner, W, esquina[0], esquina[1], ARR, yTop, { paridad: 1, viaPublica: p.viaPublica, esfera: p.viaPublica, terreno: p.terreno });
  const rings = [ARR, ...A.niveles.map((x) => x.cota)].filter((c) => c <= yTop + EPS);
  const ptsBorde = [[sA, prof], [sA + prof, prof], [sA + prof, 0]];
  rings.forEach((c, r) => {
    for (let k = 0; k < 2; k++) {
      const [s1, t1] = ptsBorde[k], [s2, t2] = ptsBorde[k + 1];
      ob.add(est, owner, { id: `gh${k}_${r}`, codigo: horCodigo(prof), tipo: 'horizontal', a: W(s1, c, t1), b: W(s2, c, t2) });
    }
  });
  A.niveles.forEach((lv, n) => {
    if (!lv.plataforma || lv.cota > yTop) return;
    const nt = nTablones(prof);
    for (let j = 0; j < nt; j++) {
      const t = r3(((j + 0.5) * prof) / nt);
      ob.add(est, owner, { id: `gtab${n}_${j}`, codigo: tabCodigo(prof), tipo: 'plataforma', a: W(sA, lv.cota, t), b: W(sA + prof, lv.cota, t) });
    }
    const alt = lv.faldon ? [0.5] : [0.5, 1];
    for (let k = 0; k < 2; k++) {
      const [s1, t1] = ptsBorde[k], [s2, t2] = ptsBorde[k + 1];
      alt.forEach((dy, z) => ob.add(est, owner, { id: `gbar${n}_${k}_${z}`, codigo: horCodigo(prof), tipo: 'baranda', a: W(s1, lv.cota + dy, t1), b: W(s2, lv.cota + dy, t2) }));
      ob.add(est, owner, { id: `grod${n}_${k}`, codigo: rdpeCodigo(prof), tipo: 'rodapie', a: W(s1, lv.cota + 0.08, t1), b: W(s2, lv.cota + 0.08, t2) });
    }
  });
  void q;
}

// ── fachada de bastidores ──
const LARGOS_CANO = [1.0, 1.5, 2.0, 3.0, 6.0];
const canoCodigo = (l) => `CANO-048-${cod3(l)}`;
/** Caño más corto que cubre la luz + 0,15 de vuelo por grampa en cada punta. */
const canoPara = (luz) => LARGOS_CANO.find((l) => l >= luz + 0.3 - EPS) ?? 6.0;
/**
 * Separación del primer bastidor del frente B en una esquina convexa: B arranca con su propio par de pies
 * a `sep` del final de A (nunca en el mismo pie) y el cuadro de esquina se cubre con tablones de largo w + sep.
 * Se elige el tablón más corto con al menos 0,18 entre pies (placa base 0,15).
 */
function sepEsquinaBastidor(w) {
  const L = [0.73, 1.09, 1.25, 1.5, 2.0, 2.5].find((x) => x - w >= 0.18 - EPS) ?? w + 0.2;
  return r3(L - w);
}
/** Interseca dos rectas en planta (p + λ·u). */
function cruceRectas(p, u, q, v) {
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) < 1e-9) return null;
  const l = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den;
  return [r3(p[0] + u[0] * l), r3(p[1] + u[1] * l)];
}
/**
 * Esquina convexa de bastidor, como se arma en obra: A termina en su bastidor, B arranca separado con su propio
 * par de pies, y el cuadro de esquina se cierra con caño y grampas: un parante de esquina (caño con tornillón),
 * travesaños de caño en los dos lados exteriores, tablones de w + sep, baranda doble y rodapié en los dos lados
 * exteriores y un caño de vinculación entre los pies interiores de A y B en cada nivel.
 */
function construirEsquinaBastidor(ob, est, k, A, B, w, p) {
  const owner = `${est.id}/c${k}`;
  const mkA = marco(A.origen, A.rumbo), mkB = marco(B.origen, B.rumbo);
  const sA = A.S[A.S.length - 1], sB = B.S[0];
  const xz = (q) => [q[0], q[2]];
  const extA = xz(mkA.W(sA, 0, w)), extB = xz(mkB.W(sB, 0, w));
  const intA = xz(mkA.W(sA, 0, 0)), intB = xz(mkB.W(sB, 0, 0));
  const esq = cruceRectas(extA, mkA.u, extB, mkB.u);
  if (!esq) return null;
  const P3 = (q, y) => [q[0], r3(y), q[1]];
  const ARR = A.ARR;
  const yTop = Math.min(A.yTopCol, B.yTopCol);
  const nodo = nodoKey(P3(esq, 0));
  // parante de esquina
  ob.add(est, owner, { id: 'pbase', codigo: p.movil ? 'TORN-600-MOVIL' : 'TORN-600-FIJA', tipo: 'base', a: P3(esq, 0), b: P3(esq, ARR), nodo });
  if (p.terreno === 'tierra') ob.add(est, owner, { id: 'pmad', codigo: 'MAD-BASE-10x10', tipo: 'base', a: P3(esq, -0.1), b: P3(esq, 0), nodo });
  let y = ARR, kk = 0;
  while (yTop - y > 0.05) {
    const resto = r3(yTop - y);
    const l = resto > 6 + EPS ? 6 : LARGOS_CANO.find((x) => x >= resto - EPS) ?? 6;
    if (kk > 0) ob.add(est, owner, { id: `pemp${kk}`, codigo: 'MANG-EMP-048', tipo: 'accesorio', a: P3(esq, y), b: P3(esq, y), nodo });
    ob.add(est, owner, { id: `pv${kk}`, codigo: canoCodigo(l), tipo: 'vertical', a: P3(esq, y), b: P3(esq, Math.min(yTop, y + l)), nodo });
    y = r3(y + l); kk++;
  }
  if (p.viaPublica) {
    ob.add(est, owner, { id: 'precub', codigo: 'RECUB-VERT-200', tipo: 'accesorio', a: P3(esq, ARR), b: P3(esq, 2), nodo });
    ob.add(est, owner, { id: 'pesf', codigo: 'ESFERA-SEG', tipo: 'accesorio', a: P3(esq, 1), b: P3(esq, 1), nodo });
  }
  const dist = (a, b) => r3(Math.hypot(b[0] - a[0], b[1] - a[1]));
  const lados = [[extA, esq, 'a'], [extB, esq, 'b']];
  const largoTab = r3(dist(extB, esq)); // tablones de B (pie exterior) a la línea exterior de A
  const nt = nTablones(w);
  // caño con una grampa (nudo fijo) en cada punta; la grampa se dibuja a 5 cm de la punta
  const tubo = (id, tipo, q0, q1, y) => {
    const L = dist(q0, q1) || 1, d = Math.min(0.05, L / 4);
    const en = (a, b) => [r3(a[0] + ((b[0] - a[0]) * d) / L), r3(y), r3(a[1] + ((b[1] - a[1]) * d) / L)];
    ob.add(est, owner, { id, codigo: canoCodigo(canoPara(dist(q0, q1))), tipo, a: P3(q0, y), b: P3(q1, y) });
    ob.add(est, owner, { id: `${id}:g0`, codigo: 'NUDO-FIJO', tipo: 'accesorio', a: en(q0, q1), b: en(q0, q1) });
    ob.add(est, owner, { id: `${id}:g1`, codigo: 'NUDO-FIJO', tipo: 'accesorio', a: en(q1, q0), b: en(q1, q0) });
  };
  A.niveles.forEach((lv, n) => {
    const c = lv.cota;
    if (c > yTop + EPS) return;
    // travesaños de caño en los 2 lados exteriores (de pie a parante) + vinculación de pies interiores
    for (const [q0, q1, l] of lados) tubo(`tr${l}_${n}`, 'horizontal', q0, q1, c);
    tubo(`vin${n}`, 'horizontal', intA, intB, c - 0.3);
    // tablones del cuadro: apoyan en el travesaño del primer bastidor de B y en el caño de la línea exterior de A
    for (let j = 0; j < nt; j++) {
      const t = r3(((j + 0.5) * w) / nt);
      ob.add(est, owner, { id: `tab${n}_${j}`, codigo: tabCodigo(largoTab), tipo: 'plataforma', a: mkB.W(sB, c, t), b: mkB.W(sB - largoTab, c, t) });
    }
    if (lv.bandeja) ob.add(est, owner, { id: `fen${n}`, codigo: 'PLACA-FEN-122x244', tipo: 'plataforma', a: mkB.W(sB, c + 0.04, 0), b: mkB.W(sB - largoTab, c + 0.04, w), medida: r3(w * largoTab), ancho: w });
    // baranda doble y rodapié en los 2 lados exteriores
    for (const [q0, q1, l] of lados) {
      for (const dy of [0.5, 1.0]) tubo(`bar${l}_${n}_${dy * 10}`, 'baranda', q0, q1, c + dy);
      ob.add(est, owner, { id: `rod${l}_${n}`, codigo: rdpeCodigo(dist(q0, q1) < 1 ? 0.9 : dist(q0, q1) < 1.2 ? 1.09 : dist(q0, q1) < 1.4 ? 1.3 : 1.5), tipo: 'rodapie', a: P3(q0, c + 0.08), b: P3(q1, c + 0.08) });
    }
    // cubierta en las 2 caras exteriores del cuadro
    if (p.cubierta && p.cubierta !== 'nada' && !lv.paso) {
      const y0 = n === 0 ? ARR : A.niveles[n - 1].cota;
      for (const [q0, q1, l] of lados) ob.add(est, owner, { id: `cub${l}_${n}`, codigo: p.cubierta === 'lona' ? 'LONA-PVC' : 'MEDIA-SOMBRA-5', tipo: 'cubierta', a: P3(q0, y0), b: P3(q1, c), medida: r3(dist(q0, q1) * (c - y0)) });
    }
  });
  return { esq, sep: sB, largoTab };
}
function codBast(ancho, paso) {
  const w = ancho < 1 ? '090' : '130';
  if (paso) return `BAST-PEA-${w}x250`;
  return ancho < 1 ? 'BAST-PAS-090x180' : 'BAST-AND-130x180';
}
function codKit(ancho, vano, paso) {
  const jr = vano < 2;
  if (paso) return jr ? null : ancho < 1 ? 'MOD-PEA-PAS-090x250x250' : 'MOD-PEA-STD-130x250x250';
  if (ancho < 1) return jr ? 'MOD-AND-PAS-JR-090x150x180' : 'MOD-AND-PAS-090x250x180';
  return jr ? 'MOD-AND-JR-130x150x180' : 'MOD-AND-STD-130x250x180';
}
function primBastidor(W, s, y0, y1, w) {
  return [
    { a: W(s, y0, 0), b: W(s, y1, 0) }, { a: W(s, y0, w), b: W(s, y1, w) },
    { a: W(s, y1 - 0.05, 0), b: W(s, y1 - 0.05, w) }, { a: W(s, y0 + 0.35, 0), b: W(s, y0 + 0.35, w) },
    { a: W(s, y1 - 0.4, 0), b: W(s, y1 - 0.05, w * 0.3) }, { a: W(s, y1 - 0.4, w), b: W(s, y1 - 0.05, w * 0.7) },
  ];
}
function tramoBastidor(ob, est, owner, W, S, vanos, w, niveles, ARR, yTopCol, o) {
  const m = vanos.length, N = niveles.length;
  const ov = o.overrides || {};
  const f = o.f ?? 0;
  const O = (v, n) => ov[`${f}:${v}:${n}`] || {};
  for (let i = 0; i <= m; i++) {
    for (const t of [0, w]) {
      const q = W(S[i], 0, t);
      const nodo = nodoKey(q);
      if (o.base !== false) {
        ob.add(est, owner, { id: `b${i}_${mm(t)}`, codigo: o.movil ? 'TORN-600-MOVIL' : 'TORN-600-FIJA', tipo: 'base', a: q, b: W(S[i], ARR, t), nodo });
        if (o.viaPublica) {
          ob.add(est, owner, { id: `rc${i}_${mm(t)}`, codigo: 'RECUB-VERT-200', tipo: 'accesorio', a: W(S[i], ARR, t), b: W(S[i], 2, t), nodo });
          if (t === w) ob.add(est, owner, { id: `es${i}`, codigo: 'ESFERA-SEG', tipo: 'accesorio', a: W(S[i], 1, t), b: W(S[i], 1, t), nodo });
        }
      }
    }
    niveles.forEach((lv, n) => {
      const y0 = n === 0 ? ARR : niveles[n - 1].cota;
      const cod = codBast(w, lv.paso);
      const kc = i < m ? codKit(w, vanos[i], lv.paso) : null;
      const kitOk = kc && !O(i, n).abertura;
      ob.add(est, owner, { id: `bas${i}_${n}`, codigo: cod, tipo: 'bastidor', a: W(S[i], y0, 0), b: W(S[i], lv.cota, w), primitivas: primBastidor(W, S[i], y0, lv.cota, w), ...(kitOk ? { kit: { codigo: kc, grupo: `${owner}:${i}:${n}` } } : {}), celda: i < m ? `${f}:${i}:${n}` : undefined });
    });
    if (o.barandaTope !== false) ob.add(est, owner, { id: `bbar${i}`, codigo: w < 1 ? 'BAST-BAR-090x100' : 'BAST-BAR-130x100', tipo: 'bastidor', a: W(S[i], niveles[N - 1].cota, 0), b: W(S[i], yTopCol, w), primitivas: primBastidor(W, S[i], niveles[N - 1].cota, yTopCol, w).slice(0, 3) });
  }
  for (let v = 0; v < m; v++) {
    const vano = vanos[v];
    const rH = `RIEND-${vano < 2 ? '150' : '250'}-H`, rD = `RIEND-${vano < 2 ? '150' : '250'}-D`;
    niveles.forEach((lv, n) => {
      const celda = `${f}:${v}:${n}`;
      const o2 = O(v, n);
      const y0 = n === 0 ? ARR : niveles[n - 1].cota;
      const kc = codKit(w, vano, lv.paso);
      const kit = kc && !o2.abertura ? { codigo: kc, grupo: `${owner}:${v}:${n}` } : undefined;
      if (!o2.abertura || lv.paso) {
        for (const [t, lado] of [[0, 'i'], [w, 'e']]) ob.add(est, owner, { id: `rh${v}_${n}${lado}`, codigo: rH, tipo: 'rienda', a: W(S[v], lv.cota - 0.2, t), b: W(S[v + 1], lv.cota - 0.2, t), celda, kit });
        ob.add(est, owner, { id: `rd${v}_${n}a`, codigo: rD, tipo: 'cruceta', a: W(S[v], y0 + 0.2, w), b: W(S[v + 1], lv.cota - 0.2, w), celda, kit });
        ob.add(est, owner, { id: `rd${v}_${n}b`, codigo: rD, tipo: 'cruceta', a: W(S[v + 1], y0 + 0.2, w), b: W(S[v], lv.cota - 0.2, w), celda, kit });
      }
      const esAcceso = (o.accesos || []).includes(v);
      const conPlat = (lv.plataforma || esAcceso) && !o2.abertura && !o2.sinPlataforma;
      if (conPlat) {
        const nt = nTablones(w);
        for (let j = 0; j < nt; j++) {
          const t = r3(((j + 0.5) * w) / nt);
          const esc = esAcceso && j === 0 && vano === 2.5 && n < N - 1;
          ob.add(est, owner, { id: `tab${v}_${n}_${j}`, codigo: esc ? 'TAB-ESC-250' : tabCodigo(vano), tipo: 'plataforma', a: W(S[v], lv.cota, t), b: W(S[v + 1], lv.cota, t), celda });
        }
        if (lv.bandeja) ob.add(est, owner, { id: `fen${v}_${n}`, codigo: 'PLACA-FEN-122x244', tipo: 'plataforma', a: W(S[v], lv.cota + 0.04, 0), b: W(S[v + 1], lv.cota + 0.04, w), celda, medida: vano * w, ancho: w });
        // barandas: exterior con riendas H y rodapié
        const lados = o.barandas === false ? [] : [[w, 'e']];
        if (o.barandas !== false && (o.retiro ?? 0.2) > CRITERIOS.retiroLibre + EPS) lados.push([0, 'i']);
        for (const [t, lado] of lados) {
          for (const dy of [0.5, 1.0]) ob.add(est, owner, { id: `bar${v}_${n}${lado}${dy * 10}`, codigo: rH, tipo: 'baranda', a: W(S[v], lv.cota + dy, t), b: W(S[v + 1], lv.cota + dy, t), celda });
          ob.add(est, owner, { id: `rod${v}_${n}${lado}`, codigo: rdpeCodigo(vano), tipo: 'rodapie', a: W(S[v], lv.cota + 0.08, t), b: W(S[v + 1], lv.cota + 0.08, t), celda });
        }
      }
      // extremos libres de la tira: baranda doble (caño y grampa) y rodapié a lo ancho; en el último nivel la baranda
      // la da el bastidor baranda, solo falta el rodapié
      if (conPlat && o.barandas !== false) for (const [lado, s0, activo] of [['L0', S[0], v === 0 && o.laterales?.[0]], ['L1', S[m], v === m - 1 && o.laterales?.[1]]]) {
        if (!activo) continue;
        if (n < N - 1 || o.barandaTope === false) for (const dy of [0.5, 1.0]) {
          const a = W(s0, lv.cota + dy, 0), b = W(s0, lv.cota + dy, w);
          ob.add(est, owner, { id: `lat${lado}_${n}_${dy * 10}`, codigo: canoCodigo(canoPara(w)), tipo: 'baranda', a, b, celda });
          for (const [q, g] of [[a, 0], [b, 1]]) ob.add(est, owner, { id: `lat${lado}_${n}_${dy * 10}:g${g}`, codigo: 'NUDO-FIJO', tipo: 'accesorio', a: q, b: q });
        }
        ob.add(est, owner, { id: `latr${lado}_${n}`, codigo: rdpeCodigo(w), tipo: 'rodapie', a: W(s0, lv.cota + 0.08, 0), b: W(s0, lv.cota + 0.08, w), celda });
      }
      if (esAcceso) ob.add(est, owner, { id: `esc${v}_${n}`, codigo: 'ESC-INT-BAST', tipo: 'escalera', a: W(S[v] + 0.25, y0, w * 0.5), b: W(S[v] + 1.0, lv.cota, w * 0.5), celda });
      if (o.celdas) ob.celdas.push({ id: `${est.id}:${f}:${v}:${n}`, celda, estructuraId: est.id, f, v, n, s0: S[v], s1: S[v + 1], y0, y1: lv.cota, vano, estado: { plataforma: conPlat, abertura: !!o2.abertura, lona: !!o2.lona, mensula: null, anclaje: o2.anclaje ?? null, bajoApoyo: false, acceso: esAcceso, bandeja: !!lv.bandeja, cubierta: o2.lona ? 'lona' : o.cubierta || 'nada' }, override: Object.keys(o2).length > 0, esquinas: [W(S[v], y0, w), W(S[v + 1], y0, w), W(S[v + 1], lv.cota, w), W(S[v], lv.cota, w)] });
    });
  }
}
function construirFachadaBastidor(ob, est, res, ctx) {
  const p = est.params;
  const w = res.prof;
  let anclTot = 0;
  for (const F of res.frentes) {
    const owner = `${est.id}/f${F.f}`;
    const mk = marco(F.origen, F.rumbo);
    const accesos = ctx.accesoPorTorre.has(est.id) ? [] : Array.isArray(p.accesos) ? p.accesos.filter((a) => a.f === F.f).map((a) => a.v) : F.f === 0 ? [Math.min(1, F.vanos.length - 1)].filter((v) => F.vanos[v] === 2.5) : [];
    tramoBastidor(ob, est, owner, mk.W, F.S, F.vanos, w, F.niveles, F.ARR, F.yTopCol, { f: F.f, overrides: est.overrides, accesos, viaPublica: p.viaPublica, retiro: p.retiro, celdas: true, cubierta: p.cubierta, laterales: [F.f === 0, F.f === res.frentes.length - 1] });
    const N = F.niveles.length;
    // anclajes (mismo tresbolillo, en montantes del lado fachada)
    if (p.anclada !== false) {
      const m = F.vanos.length;
      const dn = p.cubierta && p.cubierta !== 'nada' ? 1 : 2;
      F.niveles.forEach((lv, n) => {
        if ((N - 1 - n) % dn) return;
        const fila = (N - 1 - n) / dn;
        for (let i = 0; i <= m; i++) {
          if ((i + fila) % 2 && i !== 0 && i !== m) continue;
          ob.add(est, owner, { id: `anc${i}_${n}`, codigo: 'ANC-QUIM-M12', tipo: 'anclaje', a: mk.W(F.S[i], lv.cota - 0.3, 0), b: mk.W(F.S[i], lv.cota - 0.3, -Math.max(0.15, p.retiro ?? 0.2)), celda: `${F.f}:${Math.min(i, m - 1)}:${n}` });
          anclTot++;
        }
      });
    }
    // cubierta
    if (p.cubierta && p.cubierta !== 'nada') F.vanos.forEach((vano, v) => F.niveles.forEach((lv, n) => {
      if (lv.paso) return;
      const y0 = n === 0 ? F.ARR : F.niveles[n - 1].cota;
      ob.add(est, owner, { id: `cub${v}_${n}`, codigo: p.cubierta === 'lona' ? 'LONA-PVC' : 'MEDIA-SOMBRA-5', tipo: 'cubierta', a: mk.W(F.S[v], y0, w + 0.04), b: mk.W(F.S[v + 1], lv.cota, w + 0.04), celda: `${F.f}:${v}:${n}`, medida: vano * (lv.cota - y0) });
    }));
    if (Math.abs(F.relleno.desvio) > 0.005) {
      const d = F.relleno.desvio;
      ob.aviso(Math.abs(d) > CRITERIOS.toleranciaRelleno ? 'aviso' : 'info', `${F.etiqueta}: ${F.relleno.texto} (${d > 0 ? 'sobran' : 'faltan'} ${fmt(Math.abs(d))} m; el bastidor no tiene vano de ajuste).`, est.id, {
        reparaciones: F.relleno.alternativas.slice(0, 2).map((a) => ({ etiqueta: `${a.etiqueta}: ${a.texto}`, accion: { tipo: 'vanos', estructuraId: est.id, frente: F.f, vanos: a.vanos } })),
      });
    }
    if (Math.abs(F.alturaReal - F.altura) > 0.25 + EPS) ob.aviso('info', `${F.etiqueta}: altura real ${fmt(F.alturaReal)} m con cuerpos de 1,80 (pediste ${fmt(F.altura)}).`, est.id);
  }
  // esquinas de bastidor: B con su propio par de pies + cuadro de esquina en caño y grampas
  for (let k = 1; k < res.frentes.length; k++) {
    const A = res.frentes[k - 1], B = res.frentes[k];
    const e = B.angulo > 0 ? construirEsquinaBastidor(ob, est, k, A, B, w, p) : null;
    // modo 'nudos_giratorios' se mantiene por compatibilidad con la interfaz
    ctx.uniones.push({ id: `${est.id}:esq${k}`, tipo: 'esquina', estructuraId: est.id, modo: 'nudos_giratorios', a: { estructuraId: est.id, frente: A.f }, b: { estructuraId: est.id, frente: B.f }, etiqueta: `${A.etiqueta} ↔ ${B.etiqueta} · ${e ? 'caño y grampas' : 'nudos giratorios'}`, parKey: null, editable: false, alternar: null });
    if (e) ob.regla(`Esquina ${A.etiqueta} ↔ ${B.etiqueta} de bastidor: ${B.etiqueta} arranca a ${fmt(e.sep)} con su propio par de pies; el cuadro de esquina va en caño y grampas (parante de esquina, tablones de ${fmt(e.largoTab)}, baranda doble y rodapié) (supuesto ⚠).`, est.id);
    else ob.regla(`Esquina ${A.etiqueta} ↔ ${B.etiqueta} de bastidor (supuesto ⚠).`, est.id);
  }
  if ((p.mensulas || []).length) ob.aviso('info', 'Las ménsulas son de multidireccional: en bastidor no se arman.', est.id, { reparaciones: [{ etiqueta: 'Pasar a multidireccional', accion: { tipo: 'sistema', estructuraId: est.id, sistema: 'multi' } }] });
  ob.regla(`Bastidor 1,30 × 1,80 (supuesto Odoo), ${est.params.cuerpo === 'JR' ? 'JR' : 'STD'} 2,50. Cómputo por kit.`, est.id);
  if (anclTot < CRITERIOS.anclajeMinimo && p.anclada !== false) ob.aviso('aviso', `${est.nombre}: ${anclTot} anclajes, el mínimo es ${CRITERIOS.anclajeMinimo}.`, est.id);
  avisoPasoBajoBandeja(ob, est, w, 1.3, true);
}
/** Fachada con bandeja en PB sobre vía pública: el paso entre verticales tiene que cumplir el mismo ≥ 1,20 que el pórtico. */
function avisoPasoBajoBandeja(ob, est, prof, profSugerida, aplica) {
  const p = est.params;
  if (!aplica || !p.bandejaPB || !p.viaPublica) return;
  const paso = r3(prof - 0.05);
  if (paso >= CRITERIOS.pasoPeatonal - EPS) return;
  ob.aviso('aviso', `${est.nombre}: el paso peatonal bajo la bandeja queda en ${fmt(paso)} m entre verticales; se pide ≥ ${fmt(CRITERIOS.pasoPeatonal)} (pantalla de ${fmt(profSugerida)} ⚠ a confirmar).`, est.id, { reparaciones: [{ etiqueta: `Profundidad ${fmt(profSugerida)}`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.profundidad', valor: profSugerida } }] });
}

// ── torre (escalera o acceso) ──
function construirTorre(ob, est, res, ctx) {
  const p = est.params;
  const F = res.frentes[0];
  const owner = `${est.id}/t`;
  const mk = marco(F.origen, F.rumbo);
  const W = mk.W;
  const L = F.S[1], B = res.prof;
  const N = F.niveles.length;
  const unida = ctx.unidas.get(est.id);
  const desembarco = (n) => !!unida && (p.desembarco === 'cada_nivel' || (p.desembarco === 'ultimo' && n === N - 1) || (Array.isArray(p.desembarco) && p.desembarco.includes(n)));
  if (est.sistema === 'bastidor') {
    tramoBastidor(ob, est, owner, W, F.S, F.vanos, B, F.niveles, F.ARR, F.yTopCol, { f: 0, accesos: [0], celdas: true });
  } else {
    const ARR = F.ARR;
    const cols = [[0, 0], [L, 0], [L, B], [0, B]];
    cols.forEach(([s, t], i) => columna(ob, est, owner, W, s, t, ARR, F.yTopCol, { paridad: i, terreno: p.terreno }));
    const rings = [ARR, ...F.niveles.map((x) => x.cota)];
    const lados = [[[0, 0], [L, 0], 'frente', L], [[L, 0], [L, B], 'der', B], [[L, B], [0, B], 'fondo', L], [[0, B], [0, 0], 'izq', B]];
    rings.forEach((c, r) => lados.forEach(([[s1, t1], [s2, t2], nom, len]) => ob.add(est, owner, { id: `h${nom}_${r}`, codigo: horCodigo(len), tipo: 'horizontal', a: W(s1, c, t1), b: W(s2, c, t2) })));
    // diagonales en todas las caras, alternando
    F.niveles.forEach((lv, n) => {
      const yb = lv.cota - 2 >= ARR - EPS ? r3(lv.cota - 2) : ARR;
      lados.forEach(([[s1, t1], [s2, t2], nom, len], k) => {
        const sube = (n + k) % 2 === 0;
        const [pa, pb] = sube ? [[s1, t1], [s2, t2]] : [[s2, t2], [s1, t1]];
        ob.add(est, owner, { id: `dg${nom}_${n}`, codigo: len === 2.5 ? 'DIAG-200x250' : `DIAG-200x${cod3(len)}`, tipo: 'diagonal', a: W(pa[0], yb, pa[1]), b: W(pb[0], yb + 2, pb[1]), celda: `0:0:${n}` });
      });
    });
    if (L === 2.5 && (B === 2.5 || B === 1.5)) ob.add(est, owner, { id: 'dpl', codigo: B === 2.5 ? 'DIAG-PL-250x250' : 'DIAG-PL-250x150', tipo: 'diagonal', a: W(0, ARR, 0), b: W(L, ARR, B) });
    // escalera / acceso
    F.niveles.forEach((lv, n) => {
      const y0 = n === 0 ? 0 : F.niveles[n - 1].cota;
      const c = lv.cota;
      if (p.acceso === 'escalera') {
        const ida = n % 2 === 0;
        ob.add(est, owner, { id: `zan${n}`, codigo: 'ZANCA-ESC-150x250', tipo: 'zanca', a: W(ida ? 0.55 : L - 0.55, y0, B / 2), b: W(ida ? L - 0.55 : 0.55, c, B / 2), celda: `0:0:${n}`, primitivas: [{ a: W(ida ? 0.55 : L - 0.55, y0, 0.08), b: W(ida ? L - 0.55 : 0.55, c, 0.08) }, { a: W(ida ? 0.55 : L - 0.55, y0, B - 0.08), b: W(ida ? L - 0.55 : 0.55, c, B - 0.08) }] });
        ob.add(est, owner, { id: `bze${n}`, codigo: 'BAR-ESC-MULTI', tipo: 'baranda', a: W(ida ? 0.55 : L - 0.55, y0 + 1, B - 0.05), b: W(ida ? L - 0.55 : 0.55, c + 1, B - 0.05), celda: `0:0:${n}` });
        for (const [s0, s1, k] of [[0, 0.55, 'a'], [L - 0.55, L, 'b']]) {
          for (let j = 0; j < 2; j++) ob.add(est, owner, { id: `des${n}${k}${j}`, codigo: tabCodigo(B), tipo: 'plataforma', a: W(s0 + (j + 0.5) * (s1 - s0) / 2, c, 0), b: W(s0 + (j + 0.5) * (s1 - s0) / 2, c, B), celda: `0:0:${n}` });
        }
      } else {
        ob.add(est, owner, { id: `esc${n}`, codigo: 'ESC-INT-MULTI', tipo: 'escalera', a: W(0.25, y0, B / 2), b: W(1.05, c, B / 2), celda: `0:0:${n}` });
        const nt = nTablones(B);
        for (let j = 0; j < nt; j++) ob.add(est, owner, { id: `tab${n}_${j}`, codigo: j === 0 && n < N - 1 && L === 2.5 ? 'TAB-ESC-250' : tabCodigo(L), tipo: 'plataforma', a: W(0, c, (j + 0.5) * B / nt), b: W(L, c, (j + 0.5) * B / nt), celda: `0:0:${n}` });
      }
      // barandas en las caras abiertas
      lados.forEach(([[s1, t1], [s2, t2], nom, len]) => {
        if (nom === 'frente' && desembarco(n)) return;
        for (const dy of [0.5, 1.0]) ob.add(est, owner, { id: `bar${nom}_${n}_${dy * 10}`, codigo: horCodigo(len), tipo: 'baranda', a: W(s1, c + dy, t1), b: W(s2, c + dy, t2), celda: `0:0:${n}` });
        ob.add(est, owner, { id: `rod${nom}_${n}`, codigo: rdpeCodigo(len), tipo: 'rodapie', a: W(s1, c + 0.08, t1), b: W(s2, c + 0.08, t2), celda: `0:0:${n}` });
      });
      ob.celdas.push({ id: `${est.id}:0:0:${n}`, celda: `0:0:${n}`, estructuraId: est.id, f: 0, v: 0, n, s0: 0, s1: L, y0: n === 0 ? ARR : F.niveles[n - 1].cota, y1: c, vano: L, estado: { plataforma: true, abertura: false, lona: false, mensula: null, anclaje: null, bajoApoyo: false, acceso: true, bandeja: false, desembarco: desembarco(n), cubierta: 'nada' }, override: false, esquinas: [W(0, n === 0 ? ARR : F.niveles[n - 1].cota, B), W(L, n === 0 ? ARR : F.niveles[n - 1].cota, B), W(L, c, B), W(0, c, B)] });
    });
    if (p.pataDeGallo) pataDeGallo(ob, est, owner, W, L, B, ARR);
  }
  if (unida) ob.regla(`${est.nombre}: desembarco ${p.desembarco === 'cada_nivel' ? 'en cada nivel de la fachada' : p.desembarco === 'ultimo' ? 'solo en el último nivel' : 'en los niveles elegidos'}.`, est.id);
  if (!unida && !p.anclada) {
    const Bef = Math.min(L, B) + (p.pataDeGallo ? 3 : 0);
    if (res.alturaReal / Bef > CRITERIOS.hbMax) avisoEsbeltez(ob, est, res.alturaReal, Bef, B, { ensanchar: B < 2.5 ? { etiqueta: 'Ensanchar a 2,50', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.ancho', valor: 2.5 } } : null });
  }
}
function pataDeGallo(ob, est, owner, W, L, B, ARR) {
  // estabilizadores en los 4 lados: horizontal 1,50 + diagonal 1,50 × 2,50 + base
  const sal = 1.5;
  const puntos = [[0, 0, 0, -1], [L, 0, 0, -1], [0, B, 0, 1], [L, B, 0, 1], [0, 0, -1, 0], [0, B, -1, 0], [L, 0, 1, 0], [L, B, 1, 0]];
  puntos.forEach(([s, t, ds, dt], k) => {
    const s2 = s + ds * sal, t2 = t + dt * sal;
    ob.add(est, owner, { id: `pg${k}h`, codigo: 'HOR-048-150', tipo: 'horizontal', a: W(s, ARR, t), b: W(s2, ARR, t2) });
    ob.add(est, owner, { id: `pg${k}d`, codigo: 'DIAG-150x250', tipo: 'diagonal', a: W(s2, ARR, t2), b: W(s, ARR + 2.5, t) });
    ob.add(est, owner, { id: `pg${k}b`, codigo: 'TORN-600-FIJA', tipo: 'base', a: W(s2, 0, t2), b: W(s2, ARR, t2), nodo: nodoKey(W(s2, 0, t2)) });
  });
  ob.regla(`${est.nombre}: pata de gallo en los 4 lados (+1,50 por lado).`, est.id, { tipo: 'param', estructuraId: est.id, ruta: 'params.pataDeGallo', valor: false });
}

// ── pórticos ──
function construirPortico(ob, est, res, ctx) {
  const p = est.params;
  const F = res.frentes[0];
  const owner = `${est.id}/p`;
  const mk = marco(F.origen, F.rumbo);
  const W = mk.W;
  const ARR = F.ARR;
  const prof = res.prof;
  const S = F.S;
  const m = F.vanos.length;
  const yT = res.yTope;
  const arriba = res.tieneArriba;
  if (p.clase === 'vehicular') {
    const viga = res.viga;
    const yG = res.galibo;
    // dos torres de apoyo
    for (const [i0, i1, lado] of [[0, 1, 'I'], [2, 3, 'D']]) {
      const sA = S[i0], sB = S[i1];
      const cols = [[sA, 0], [sB, 0], [sB, prof], [sA, prof]];
      cols.forEach(([s, t], k) => columna(ob, est, `${owner}${lado}`, W, s, t, ARR, F.yTopCol, { paridad: k, terreno: p.terreno, viaPublica: true, esfera: t === 0 }));
      const rings = [ARR, ...F.niveles.map((x) => x.cota)];
      const caras = [[[sA, 0], [sB, 0], 'f', sB - sA], [[sB, 0], [sB, prof], 'd', prof], [[sB, prof], [sA, prof], 'o', sB - sA], [[sA, prof], [sA, 0], 'i', prof]];
      rings.forEach((c, r) => caras.forEach(([[s1, t1], [s2, t2], nom, len]) => ob.add(est, `${owner}${lado}`, { id: `h${nom}${r}`, codigo: horCodigo(len), tipo: 'horizontal', a: W(s1, c, t1), b: W(s2, c, t2) })));
      F.niveles.forEach((lv, n) => {
        const yb = lv.cota - 2 >= ARR - EPS ? r3(lv.cota - 2) : ARR;
        caras.forEach(([[s1, t1], [s2, t2], nom, len], k) => {
          const sube = (n + k) % 2 === 0;
          const [pa, pb] = sube ? [[s1, t1], [s2, t2]] : [[s2, t2], [s1, t1]];
          ob.add(est, `${owner}${lado}`, { id: `dg${nom}${n}`, codigo: `DIAG-200x${cod3(len)}`, tipo: 'diagonal', a: W(pa[0], yb, pa[1]), b: W(pb[0], yb + 2, pb[1]) });
        });
      });
      ob.add(est, `${owner}${lado}`, { id: 'dpl', codigo: 'DIAG-PL-CEL', tipo: 'diagonal', a: W(sA, ARR, 0), b: W(sB, ARR, prof) });
    }
    // vigas de celosía (cordón inferior en el gálibo, superior en el tope)
    const yv = yT;
    for (const [t, lado] of [[0, 'i'], [prof, 'e']]) {
      const a = W(S[1], yv, t), b = W(S[2], yv, t);
      ob.add(est, owner, { id: `viga${lado}`, codigo: viga.codigo, tipo: 'viga', a, b, primitivas: primViga(a, b, 0.5) });
    }
    // travesaños sobre las vigas en módulos de catálogo (≤ 2,50): tablones entre travesaños y fenólico encima
    const segs = rellenarLargo(viga.luz).vanos;
    const Sx = [S[1]];
    for (const v of segs) Sx.push(r3(Math.min(S[2], Sx[Sx.length - 1] + v)));
    Sx[Sx.length - 1] = S[2];
    const ntv = nTablones(prof);
    Sx.forEach((s, k) => {
      ob.add(est, owner, { id: `trv${k}`, codigo: horCodigo(prof), tipo: 'horizontal', a: W(s, yv, 0), b: W(s, yv, prof) });
      if (k === Sx.length - 1) return;
      const s2 = Sx[k + 1];
      ob.add(est, owner, { id: `dplv${k}`, codigo: 'DIAG-PL-CEL', tipo: 'diagonal', a: W(s, yv, k % 2 ? prof : 0), b: W(s2, yv, k % 2 ? 0 : prof) });
      for (let j = 0; j < ntv; j++) ob.add(est, owner, { id: `tabv${k}_${j}`, codigo: tabCodigo(segs[k]), tipo: 'plataforma', a: W(s, yv, r3(((j + 0.5) * prof) / ntv)), b: W(s2, yv, r3(((j + 0.5) * prof) / ntv)) });
    });
    ob.add(est, owner, { id: 'fen', codigo: 'PLACA-FEN-122x244', tipo: 'plataforma', a: W(S[1], yv + 0.04, 0), b: W(S[2], yv + 0.04, prof), medida: viga.luz * prof, ancho: prof });
    if (!arriba) {
      // baranda superior por tramos: montantes en cada travesaño intermedio (los extremos son las verticales de las torres)
      for (const [t, lado] of [[0, 'i'], [prof, 'e']]) {
        Sx.forEach((s, k) => {
          if (k > 0 && k < Sx.length - 1) ob.add(est, owner, { id: `mv${lado}${k}`, codigo: 'VERT-100-SE', tipo: 'vertical', a: W(s, yv, t), b: W(s, yv + 1, t) });
          if (k === Sx.length - 1) return;
          for (const dy of [0.5, 1]) ob.add(est, owner, { id: `bv${lado}${k}_${dy * 10}`, codigo: horCodigo(segs[k]), tipo: 'baranda', a: W(s, yv + dy, t), b: W(Sx[k + 1], yv + dy, t) });
          ob.add(est, owner, { id: `rv${lado}${k}`, codigo: rdpeCodigo(segs[k]), tipo: 'rodapie', a: W(s, yv + 0.08, t), b: W(Sx[k + 1], yv + 0.08, t) });
        });
      }
      // las puntas del tablero dan al vacío sobre las torres
      for (const [s, lado] of [[S[1], 'I'], [S[2], 'D']]) {
        for (const dy of [0.5, 1]) ob.add(est, owner, { id: `bl${lado}${dy * 10}`, codigo: horCodigo(prof), tipo: 'baranda', a: W(s, yv + dy, 0), b: W(s, yv + dy, prof) });
        ob.add(est, owner, { id: `rl${lado}`, codigo: rdpeCodigo(prof), tipo: 'rodapie', a: W(s, yv + 0.08, 0), b: W(s, yv + 0.08, prof) });
      }
    }
    // defensas contra impacto en las patas que dan a la calzada (lado exterior de cada torre)
    for (const [s, lado] of [[S[1], 'I'], [S[2], 'D']]) ob.add(est, owner, { id: `def${lado}`, codigo: 'DEFENSA-VEH', tipo: 'accesorio', a: W(s, 0, prof / 2), b: W(s, 0.8, prof / 2) });
    ob.aviso('aviso', 'Pórtico vehicular: defensas contra impacto (New Jersey o topes) en las patas del lado de la calzada y señal de gálibo ⚠.', est.id);
    if (p.anclado) {
      // anclajes en las verticales interiores de las torres, cada 2 niveles desde el tope
      let nAnc = 0;
      const cotasAnc = F.niveles.map((x) => x.cota).filter((_, i, arr) => (arr.length - 1 - i) % 2 === 0);
      for (const [s, lado] of [[S[0], 'I0'], [S[1], 'I1'], [S[2], 'D0'], [S[3], 'D1']]) cotasAnc.forEach((c, k) => {
        ob.add(est, `${owner}${lado[0]}`, { id: `anc${lado}_${k}`, codigo: 'ANC-QUIM-M12', tipo: 'anclaje', a: W(s, c, 0), b: W(s, c, -0.2) });
        nAnc++;
      });
      ob.regla(`Pórtico vehicular anclado: ${nAnc} anclajes en las verticales interiores de las torres.`, est.id, { tipo: 'param', estructuraId: est.id, ruta: 'params.anclado', valor: false });
    }
    ob.celdas.push({ id: `${est.id}:0:1:0`, celda: '0:1:0', estructuraId: est.id, f: 0, v: 1, n: 0, s0: S[1], s1: S[2], y0: 0, y1: yT, vano: viga.luz, estado: { plataforma: true, abertura: true, lona: false, mensula: null, anclaje: null, bajoApoyo: false, acceso: false, bandeja: true, galibo: yG, cubierta: 'nada' }, override: false, esquinas: [W(S[1], 0, prof), W(S[2], 0, prof), W(S[2], yG, prof), W(S[1], yG, prof)] });
    if (viga.excede) ob.aviso('error', `Luz ${fmt(p.luz)} m: la viga de celosía más larga es de 7,50.`, est.id, { reparaciones: [{ etiqueta: 'Luz 7,50', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.luz', valor: 7.5 } }] });
    else if (Math.abs(viga.luz - p.luz) > 0.05) ob.aviso('info', `Luz ${fmt(p.luz)} → viga ${viga.codigo} (${fmt(viga.luz)} entre torres).`, est.id);
    if (p.galibo < CRITERIOS.galiboVehicular - EPS) ob.aviso('aviso', `Gálibo ${fmt(p.galibo)} m: para camiones se pide ≥ 4,50.`, est.id, { reparaciones: [{ etiqueta: 'Subir a 4,50', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.galibo', valor: 4.5 } }] });
    ob.regla(`Pórtico vehicular: gálibo libre ${fmt(yG)} m, 2 vigas ${viga.codigo}, diagonal en planta y torres de apoyo de ${fmt(S[1])} × ${fmt(prof)}.`, est.id);
    if (!p.anclado && !ctx.unidas.get(est.id)) {
      const Bef = Math.min(S[1], prof) + (p.pataDeGallo ? 3 : 0);
      if (F.yTopCol / Bef > CRITERIOS.hbMax) avisoEsbeltez(ob, est, F.yTopCol, Bef, prof, { ensanchar: { etiqueta: 'Torres de 2,50', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.anchoTorre', valor: 2.5 } } });
    }
    if (p.pataDeGallo) ob.regla('Pata de gallo: no aplica en la maqueta para pórticos (sumá anclaje).', est.id);
    return;
  }
  // peatonal
  const N = 1;
  const nivelesB = [{ n: 0, cota: yT, alto: yT - ARR, plataforma: true, bandeja: true, paso: true }];
  if (res.sistema === 'bastidor') {
    tramoBastidor(ob, est, owner, W, S, F.vanos, prof, nivelesB, ARR, F.yTopCol, { f: 0, viaPublica: true, barandaTope: !arriba, barandas: !arriba, celdas: true, retiro: 0, laterales: [true, true] });
  } else {
    for (let i = 0; i <= m; i++) for (const t of [0, prof]) columna(ob, est, owner, W, S[i], t, ARR, F.yTopCol, { paridad: i, viaPublica: true, esfera: t === prof, terreno: p.terreno });
    for (let v = 0; v < m; v++) {
      for (const [t, lado] of [[0, 'i'], [prof, 'e']]) {
        ob.add(est, owner, { id: `ha${v}${lado}`, codigo: horCodigo(F.vanos[v]), tipo: 'horizontal', a: W(S[v], ARR, t), b: W(S[v + 1], ARR, t) });
        ob.add(est, owner, { id: `ht${v}${lado}`, codigo: horCodigo(F.vanos[v]), tipo: 'horizontal', a: W(S[v], yT, t), b: W(S[v + 1], yT, t) });
      }
      const nt = nTablones(prof);
      for (let j = 0; j < nt; j++) ob.add(est, owner, { id: `tab${v}_${j}`, codigo: tabCodigo(F.vanos[v]), tipo: 'plataforma', a: W(S[v], yT, (j + 0.5) * prof / nt), b: W(S[v + 1], yT, (j + 0.5) * prof / nt), celda: `0:${v}:0` });
      ob.add(est, owner, { id: `fen${v}`, codigo: 'PLACA-FEN-122x244', tipo: 'plataforma', a: W(S[v], yT + 0.04, 0), b: W(S[v + 1], yT + 0.04, prof), celda: `0:${v}:0`, medida: F.vanos[v] * prof, ancho: prof });
      if (!arriba) {
        for (const dy of [0.5, 1]) ob.add(est, owner, { id: `bar${v}_${dy * 10}`, codigo: horCodigo(F.vanos[v]), tipo: 'baranda', a: W(S[v], yT + dy, prof), b: W(S[v + 1], yT + dy, prof), celda: `0:${v}:0` });
        ob.add(est, owner, { id: `rod${v}`, codigo: rdpeCodigo(F.vanos[v]), tipo: 'rodapie', a: W(S[v], yT + 0.08, prof), b: W(S[v + 1], yT + 0.08, prof), celda: `0:${v}:0` });
      }
    }
    if (!arriba) for (const [s, lado, v] of [[S[0], 'L0', 0], [S[m], 'L1', m - 1]]) {
      for (const dy of [0.5, 1]) ob.add(est, owner, { id: `lat${lado}_${dy * 10}`, codigo: horCodigo(prof), tipo: 'baranda', a: W(s, yT + dy, 0), b: W(s, yT + dy, prof), celda: `0:${v}:0` });
      ob.add(est, owner, { id: `latr${lado}`, codigo: rdpeCodigo(prof), tipo: 'rodapie', a: W(s, yT + 0.08, 0), b: W(s, yT + 0.08, prof), celda: `0:${v}:0` });
    }
    const transv = prof <= 1.25 + EPS ? { codigo: horCodigo(prof), tipo: 'horizontal' } : { codigo: `VIGA-PTE-${prof <= 1.5 + EPS ? '150' : '250'}`, tipo: 'viga' };
    for (let i = 0; i <= m; i++) {
      const a = W(S[i], yT, 0), b = W(S[i], yT, prof);
      ob.add(est, owner, { id: `tr${i}`, codigo: transv.codigo, tipo: transv.tipo, a, b, ...(transv.tipo === 'viga' ? { primitivas: primViga(a, b, 0.3) } : {}) });
    }
    const set = new Set([0, m - 1]);
    for (let v = 0; v < m; v += CRITERIOS.diagonalCadaVanos) set.add(v);
    for (const v of set) for (const [t, lado] of [[0, 'i'], [prof, 'e']]) ob.add(est, owner, { id: `dg${v}${lado}`, codigo: `DIAG-200x${cod3(F.vanos[v])}`, tipo: 'diagonal', a: W(S[v], ARR, t), b: W(S[v + 1], ARR + 2, t), celda: `0:${v}:0` });
    for (let v = 0; v < m; v++) ob.celdas.push({ id: `${est.id}:0:${v}:0`, celda: `0:${v}:0`, estructuraId: est.id, f: 0, v, n: 0, s0: S[v], s1: S[v + 1], y0: ARR, y1: yT, vano: F.vanos[v], estado: { plataforma: true, abertura: false, lona: false, mensula: null, anclaje: null, bajoApoyo: false, acceso: false, bandeja: true, cubierta: 'nada' }, override: false, esquinas: [W(S[v], ARR, prof), W(S[v + 1], ARR, prof), W(S[v + 1], yT, prof), W(S[v], yT, prof)] });
  }
  void N;
  const libre = res.sistema === 'bastidor' ? BAST.alturaPaso : r3(yT - 0.05);
  const paso = r3(prof - 0.05);
  if (p.alturaLibre < CRITERIOS.galiboPeatonal - EPS || libre < CRITERIOS.galiboPeatonal - 0.06) ob.aviso('error', `Altura libre ${fmt(Math.min(p.alturaLibre, libre))} m: el paso peatonal pide ≥ 2,50.`, est.id, { reparaciones: [{ etiqueta: 'Subir a 2,50', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.alturaLibre', valor: 2.5 } }] });
  if (paso < CRITERIOS.pasoPeatonal - EPS) ob.aviso('error', `Paso libre ${fmt(paso)} m: se pide ≥ 1,20.`, est.id, { reparaciones: [{ etiqueta: res.sistema === 'bastidor' ? 'Bastidor de 1,30' : 'Ancho 1,25', accion: { tipo: 'param', estructuraId: est.id, ruta: 'params.ancho', valor: res.sistema === 'bastidor' ? 1.3 : 1.25 } }] });
  if (Math.abs(F.relleno.desvio) > CRITERIOS.toleranciaRelleno + EPS) ob.aviso('aviso', `Pórtico: ${F.relleno.texto} (${F.relleno.desvio > 0 ? 'sobran' : 'faltan'} ${fmt(Math.abs(F.relleno.desvio))} m).`, est.id);
  ob.regla(`Pórtico peatonal: ${fmt(libre)} libres, paso ${fmt(paso)}, bandeja de fenólico, esferas y recubrimiento hasta 2 m.`, est.id);
}

// ───────────────────────────── uniones entre estructuras ─────────────────────────────
function construirUniones(ob, diseno, resueltas, ctx) {
  const out = [];
  for (const u of diseno.uniones || []) {
    const ra = resueltas.get(u.a.estructuraId), rb = resueltas.get(u.b.estructuraId);
    if (!ra || !rb) continue;
    const ea = diseno.estructuras.find((e) => e.id === u.a.estructuraId);
    const eb = diseno.estructuras.find((e) => e.id === u.b.estructuraId);
    const pa = ra.puertos.find((x) => x.id === u.a.puerto);
    const pb = rb.puertos.find((x) => x.id === u.b.puerto);
    const nombreA = pa ? `${ea.nombre} · ${pa.etiqueta.split(' · ')[0]}` : ea.nombre;
    if (u.modo === 'vano_giro' && pb) {
      // horizontales de conexión 0,73 en cada vertical de la cara de b y tablones en los niveles con plataforma
      const Fb = rb.frentes[0];
      const rings = [Fb.ARR, ...Fb.niveles.map((x) => x.cota)];
      const n = [pb.normal[0], pb.normal[2]];
      pb.cols.forEach((c, k) => {
        const x = pb.p0[0] + pb.d[0] * c, z = pb.p0[2] + pb.d[2] * c;
        rings.forEach((y, r) => ob.add(eb, `${u.id}`, { id: `con${k}_${r}`, codigo: 'HOR-048-073', tipo: 'horizontal', a: [r3(x), r3(y), r3(z)], b: [r3(x + n[0] * 0.73), r3(y), r3(z + n[1] * 0.73)] }));
      });
      Fb.niveles.forEach((lv, i) => {
        const nt = nTablones(pb.largo);
        for (let j = 0; j < nt; j++) {
          const c = ((j + 0.5) * pb.largo) / nt;
          const x = pb.p0[0] + pb.d[0] * c, z = pb.p0[2] + pb.d[2] * c;
          ob.add(eb, `${u.id}`, { id: `ctab${i}_${j}`, codigo: 'TAB-MET-073', tipo: 'plataforma', a: [r3(x), lv.cota, r3(z)], b: [r3(x + n[0] * 0.73), lv.cota, r3(z + n[1] * 0.73)] });
        }
        // los dos extremos del puente de 0,73 quedan abiertos: baranda doble y rodapié
        for (const [c, k] of [[0, 'a'], [pb.largo, 'b']]) {
          const x = pb.p0[0] + pb.d[0] * c, z = pb.p0[2] + pb.d[2] * c;
          const seg = (dy) => [[r3(x), r3(lv.cota + dy), r3(z)], [r3(x + n[0] * 0.73), r3(lv.cota + dy), r3(z + n[1] * 0.73)]];
          for (const dy of [0.5, 1.0]) { const [a, b] = seg(dy); ob.add(eb, `${u.id}`, { id: `cbar${i}${k}${dy * 10}`, codigo: 'HOR-048-073', tipo: 'baranda', a, b }); }
          const [a, b] = seg(0.08);
          ob.add(eb, `${u.id}`, { id: `crod${i}${k}`, codigo: 'RDPE-073', tipo: 'rodapie', a, b });
        }
      });
    }
    // torre con desembarco a la fachada: se saca la baranda exterior y el rodapié de la fachada frente a la torre
    if (eb.tipo === 'torre' && ea.tipo === 'fachada' && pb && u.b.puerto === 'frente' && u.modo !== 'apoyo') {
      const cotas = ob.celdas.filter((c) => c.estructuraId === eb.id && c.estado.desembarco).map((c) => c.y1);
      const gap = u.modo === 'vano_giro' ? 0.73 : 0;
      const loc = (q) => { const dx = q[0] - pb.p0[0], dz = q[2] - pb.p0[2]; return [dx * pb.d[0] + dz * pb.d[2], dx * pb.normal[0] + dz * pb.normal[2]]; };
      const quitar = new Set();
      for (const pz of ob.piezas) {
        if (pz.estructuraId !== ea.id || (pz.tipo !== 'baranda' && pz.tipo !== 'rodapie')) continue;
        const [sa, ta] = loc(pz.a), [sb, tb] = loc(pz.b);
        if (Math.abs(ta - gap) > 0.02 || Math.abs(tb - gap) > 0.02) continue;
        if (Math.min(sa, sb) < -0.02 || Math.max(sa, sb) > pb.largo + 0.02) continue; // solo vanos enteros frente a la torre
        if (!cotas.some((c) => pz.a[1] > c + EPS && pz.a[1] <= c + 1 + EPS)) continue;
        quitar.add(pz.id);
      }
      if (quitar.size) {
        ob.piezas = ob.piezas.filter((pz) => !quitar.has(pz.id));
        ob.regla(`${ea.nombre}: saqué ${quitar.size} barandas y rodapiés exteriores frente al desembarco de ${eb.nombre}.`, ea.id);
      }
    }
    let parKey = null;
    if (u.modo !== 'apoyo') {
      const fA = /^f(\d+)/.exec(u.a.puerto);
      const ownerA = ea.tipo === 'fachada' ? `${ea.id}/f${fA ? fA[1] : 0}` : ea.tipo === 'torre' ? `${ea.id}/t` : `${ea.id}/p`;
      const ownerB = eb.tipo === 'fachada' ? `${eb.id}/f0` : eb.tipo === 'torre' ? `${eb.id}/t` : `${eb.id}/p`;
      parKey = `${ownerA}|${ownerB}`;
    }
    out.push({
      id: u.id, tipo: 'estructura', modo: u.modo, a: u.a, b: u.b, parKey, editable: true,
      etiqueta: `${eb.nombre} ↔ ${nombreA} · ${u.modo === 'vertical_compartida' ? 'vertical compartida' : u.modo === 'vano_giro' ? 'vano de conexión 0,73' : 'apoyo'}`,
      alternar: u.modo === 'apoyo' ? null : { tipo: 'modoUnion', unionId: u.id, modo: u.modo === 'vano_giro' ? 'vertical_compartida' : 'vano_giro' },
      nombreA, nombreB: eb.nombre,
      ...(u.modo === 'apoyo' ? (() => {
        const bSobreA = (eb.apoyaEn || []).includes(ea.id);
        return { apoyado: bSobreA ? eb.nombre : nombreA, soporte: bSobreA ? nombreA : eb.nombre };
      })() : {}),
    });
  }
  void ctx;
  return out;
}

// ───────────────────────────── fusión de nodos ─────────────────────────────
const TIPOS_COLUMNA = new Set(['vertical', 'base', 'collarin', 'accesorio']);
export function fusionarNodos(piezas) {
  const porNodo = new Map();
  const resto = [];
  for (const p of piezas) {
    if (p.nodo && TIPOS_COLUMNA.has(p.tipo)) {
      let g = porNodo.get(p.nodo);
      if (!g) porNodo.set(p.nodo, (g = []));
      g.push(p);
    } else resto.push(p);
  }
  const quitar = new Set();
  const compartidas = {};
  for (const [nodo, grupo] of porNodo) {
    const owners = [...new Set(grupo.map((p) => p.owner))];
    if (owners.length < 2) continue;
    const kept = grupo.filter((p) => p.owner === owners[0]);
    for (const ow of owners.slice(1)) {
      let solapa = false;
      for (const p of grupo.filter((x) => x.owner === ow)) {
        if (p.tipo === 'vertical') {
          const y0 = Math.min(p.a[1], p.b[1]), y1 = Math.max(p.a[1], p.b[1]);
          let cubierto = 0;
          for (const k of kept) if (k.tipo === 'vertical') cubierto += Math.max(0, Math.min(y1, Math.max(k.a[1], k.b[1])) - Math.max(y0, Math.min(k.a[1], k.b[1])));
          if (y1 - y0 - cubierto <= 0.25 + EPS) { quitar.add(p.id); solapa = true; }
          else kept.push(p);
        } else {
          const dup = kept.find((k) => k.codigo === p.codigo && Math.abs(k.a[1] - p.a[1]) < 0.05);
          if (dup) quitar.add(p.id); else kept.push(p);
        }
      }
      if (solapa) {
        const key = `${owners[0]}|${ow}`;
        compartidas[key] = (compartidas[key] || 0) + 1;
      }
    }
    void nodo;
  }
  const vistos = new Set();
  for (const p of resto) {
    if (p.tipo === 'cubierta' || p.tipo === 'anclaje') continue;
    const ka = `${mm(p.a[0])},${mm(p.a[1])},${mm(p.a[2])}`, kb = `${mm(p.b[0])},${mm(p.b[1])},${mm(p.b[2])}`;
    const key = `${p.codigo}|${ka < kb ? ka + '|' + kb : kb + '|' + ka}`;
    if (vistos.has(key)) quitar.add(p.id); else vistos.add(key);
  }
  return { piezas: piezas.filter((p) => !quitar.has(p.id)), fusionadas: quitar.size, compartidas };
}

// ───────────────────────────── BOM ─────────────────────────────
export function calcularBom(piezas, modo = 'kit') {
  const lineas = new Map();
  const medidas = new Map();
  const kitsVistos = new Set();
  const sumar = (codigo, n) => lineas.set(codigo, (lineas.get(codigo) || 0) + n);
  const despiece = new Map(); // codigo → Map(ancho → ml) para placas que se cortan en tiras
  const porArea = new Map(); // codigo → m² de lo que se computa por rinde
  for (const p of piezas) {
    if (modo === 'kit' && p.kit) {
      if (!kitsVistos.has(p.kit.grupo)) { kitsVistos.add(p.kit.grupo); sumar(p.kit.codigo, 1); }
      continue;
    }
    const it = info(p.codigo);
    if (it.rinde) {
      medidas.set(p.codigo, (medidas.get(p.codigo) || 0) + (p.medida || 0));
      if (p.codigo === 'PLACA-FEN-122x244' && p.ancho > 0) {
        if (!despiece.has(p.codigo)) despiece.set(p.codigo, new Map());
        const g = despiece.get(p.codigo);
        g.set(p.ancho, (g.get(p.ancho) || 0) + (p.medida || 0) / p.ancho);
      } else porArea.set(p.codigo, (porArea.get(p.codigo) || 0) + (p.medida || 0));
      continue;
    }
    sumar(p.codigo, 1);
  }
  for (const [codigo] of medidas) {
    let n = 0;
    // fenólico por despiece (placa 1,22 × 2,44), la mejor de dos orientaciones:
    //  · tiras de 1,22 de largo × ancho, cortadas del lado de 2,44 (0,73 → 3 por placa);
    //  · placas a lo largo (2,44) si el ancho entra en 1,22 (+ 8 cm sobre tablones).
    for (const [ancho, ml] of despiece.get(codigo) || []) {
      const atravesadas = Math.max(1, Math.ceil(ancho / 2.44 - 1e-9));
      const porPlaca = atravesadas > 1 ? 1 : Math.max(1, Math.floor(2.44 / ancho + 1e-9));
      let placas = Math.ceil(Math.ceil(ml / 1.22 - 1e-9) / porPlaca) * atravesadas;
      if (ancho <= 1.30 + 1e-9) placas = Math.min(placas, Math.ceil(Math.ceil(ml / 2.44 - 1e-9) / Math.max(1, Math.floor(1.30 / ancho + 1e-9))));
      n += placas;
    }
    const resto = porArea.get(codigo) || 0;
    if (resto > 0) n += Math.ceil(resto / info(codigo).rinde - 1e-9);
    sumar(codigo, Math.max(1, n));
  }
  const out = [];
  for (const [codigo, cantidad] of lineas) {
    const it = info(codigo);
    const falta = Math.max(0, cantidad - it.stock);
    out.push({
      codigo, descripcion: it.descripcion, familia: it.familia, cantidad, unidad: it.unidad,
      peso_unit: it.peso_kg, peso_total: it.peso_kg == null ? null : r3(it.peso_kg * cantidad),
      stock: it.stock, falta, plausible: it.plausible, esKit: !!KITS[codigo],
      medida: medidas.has(codigo) ? r3(medidas.get(codigo)) : undefined,
      semaforo: falta > 0 ? 'falta' : cantidad > it.stock * 0.8 ? 'justo' : 'ok',
    });
  }
  out.sort((a, b) => ORDEN_FAMILIAS.indexOf(a.familia) - ORDEN_FAMILIAS.indexOf(b.familia) || a.codigo.localeCompare(b.codigo));
  return out;
}

// ───────────────────────────── construir ─────────────────────────────
export function construir(diseno) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ob = new Obra();
  const ctx0 = contextoResolucion(diseno);
  const ctx = { ...ctx0, uniones: [], accesoPorTorre: new Set(), unidas: new Map() };
  for (const u of diseno.uniones || []) {
    const a = diseno.estructuras.find((e) => e.id === u.a.estructuraId);
    const b = diseno.estructuras.find((e) => e.id === u.b.estructuraId);
    if (!a || !b || u.modo === 'apoyo') continue;
    for (const [x, y] of [[a, b], [b, a]]) {
      if (x.tipo === 'torre') ctx.unidas.set(x.id, y.id);
      if (x.tipo === 'fachada' && y.tipo === 'torre') ctx.accesoPorTorre.add(x.id);
    }
  }
  const orden = [...diseno.estructuras].sort((x, y) => (x.tipo === 'portico' ? 0 : 1) - (y.tipo === 'portico' ? 0 : 1));
  const resueltas = new Map();
  for (const est of orden) {
    const res = resolver(est, ctx);
    resueltas.set(est.id, res);
    if (est.tipo === 'fachada') (est.sistema === 'bastidor' ? construirFachadaBastidor : construirFachadaMulti)(ob, est, res, ctx);
    else if (est.tipo === 'torre') construirTorre(ob, est, res, ctx);
    else construirPortico(ob, est, res, ctx);
  }
  const unionesExt = construirUniones(ob, diseno, resueltas, ctx);
  const fus = fusionarNodos(ob.piezas);
  const piezas = fus.piezas;
  // uniones con conteo de verticales compartidas
  const uniones = [...ctx.uniones, ...unionesExt].map((u) => {
    let comp = 0;
    if (u.parKey) {
      const [x, y] = u.parKey.split('|');
      for (const [k, n] of Object.entries(fus.compartidas)) {
        const [a, b] = k.split('|');
        if ((a === x && b === y) || (a === y && b === x)) comp += n;
      }
    }
    return { ...u, compartidas: comp };
  });
  for (const u of uniones) {
    if (u.tipo === 'estructura' && u.modo === 'vertical_compartida') ob.regla(`${u.nombreB} comparte ${u.compartidas} vertical${u.compartidas === 1 ? '' : 'es'} con ${u.nombreA}.`, u.b.estructuraId, { tipo: 'modoUnion', unionId: u.id, modo: 'vano_giro' });
    if (u.tipo === 'estructura' && u.modo === 'apoyo') ob.regla(`${u.apoyado} se apoya sobre ${u.soporte}: las verticales de arriba arrancan en el tope.`, u.b.estructuraId, { tipo: 'quitarUnion', unionId: u.id });
    if (u.tipo === 'estructura' && u.modo === 'vertical_compartida' && u.compartidas === 0) ob.aviso('aviso', `${u.etiqueta}: no coincide ninguna vertical. Revisá la posición.`, u.b.estructuraId, { reparaciones: [{ etiqueta: 'Unir con vano de conexión', accion: { tipo: 'modoUnion', unionId: u.id, modo: 'vano_giro' } }] });
  }
  if (fus.fusionadas) ob.regla(`Fusioné ${fus.fusionadas} piezas compartidas (verticales, bases y horizontales que coinciden).`, null);

  const modo = diseno.modoBom || 'kit';
  const bom = calcularBom(piezas, modo);
  const estructuras = [...resueltas.values()].map((r) => {
    const est = diseno.estructuras.find((e) => e.id === r.id);
    return { ...r, nombre: est.nombre, plantilla: est.plantilla, apoyaEn: est.apoyaEn || [] };
  });
  const orderIds = diseno.estructuras.map((e) => e.id);
  estructuras.sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id));
  const puertos = estructuras.flatMap((r) => r.puertos);
  const sinPeso = bom.filter((l) => l.peso_unit == null).map((l) => l.codigo);
  const resumen = {
    m2: r3(sum(estructuras.map((r) => r.m2 || 0))),
    ml: r3(sum(estructuras.map((r) => r.ml || 0))),
    pesoKg: Math.round(sum(bom.map((l) => l.peso_total || 0))),
    pesoParcial: sinPeso.length > 0,
    codigosSinPeso: sinPeso,
    piezas: sum(bom.map((l) => l.cantidad)),
    piezasModelo: piezas.length,
    anclajes: piezas.filter((p) => p.tipo === 'anclaje').length,
    faltantesStock: bom.filter((l) => l.falta > 0).map((l) => ({ codigo: l.codigo, descripcion: l.descripcion, necesita: l.cantidad, stock: l.stock, falta: l.falta })),
    alturaMax: r3(Math.max(0, ...estructuras.map((r) => r.alturaReal || 0))),
    estructuras: estructuras.length,
    modoBom: modo,
    etiqueta: PREDIMENSIONADO,
    pesosIlustrativos: true,
  };
  resumen.texto = `${fmt(resumen.m2, 0)} m² · ${fmt(resumen.pesoKg / 1000, 1)} t${resumen.pesoParcial ? '*' : ''} · ${resumen.piezas.toLocaleString('es-AR')} pzs · ${resumen.anclajes} anclajes · ${resumen.faltantesStock.length ? `${resumen.faltantesStock.length} faltan en stock` : 'stock ok'} · ${PREDIMENSIONADO}`;
  if (resumen.faltantesStock.length) ob.aviso('info', `Faltan en stock: ${resumen.faltantesStock.map((f) => `${f.codigo} (${f.falta})`).join(', ')}. Stock ilustrativo.`, null);
  if (sinPeso.length) ob.aviso('info', `Peso parcial: ${sinPeso.length} código${sinPeso.length > 1 ? 's' : ''} sin peso (${sinPeso.join(', ')}). ${fmtKg(resumen.pesoKg)} kg es un mínimo.`, null);
  ob.aviso('info', `${PREDIMENSIONADO}: reglas provisorias (⚠) sin firma. No reemplaza la memoria de cálculo.`, null);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { piezas, celdas: ob.celdas, estructuras, puertos, uniones, bom, resumen, avisos: ob.avisos, reglasAplicadas: ob.reglas, ms: r3(t1 - t0) };
}
