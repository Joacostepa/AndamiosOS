/**
 * Catálogo de la maqueta: SOLO para tests y modo demo (fuente: 'fixture').
 * Pesos y stock son ILUSTRATIVOS. En producción el catálogo sale de la base (catalogo_piezas + tec_pieza_mapa).
 * Los códigos marcados «plausible» no están en Odoo: en la base quedan «sin código».
 */
import type { Familia, Medidas, SistemaPieza } from '../tipos.ts';
import { type Catalogo, type EntradaMapa, type ItemCatalogo, medidasPorDefecto } from './catalogo.ts';

type Fila = [codigo: string, descripcion: string, familia: Familia, sistema: SistemaPieza, medidas: Medidas | null, peso: number | null, stock: number, extra?: { unidad?: string; rinde?: number; plausible?: boolean; tambien?: Familia[] }];

const FILAS: Fila[] = [
  ['VERT-050-CE', 'VERTICAL 0.50m CON ESPIGA', 'vertical', 'multi', { largo: 0.5, variante: 'CE' }, 3.1, 420],
  ['VERT-100-CE', 'VERTICAL 1.00m CON ESPIGA', 'vertical', 'multi', { largo: 1.0, variante: 'CE' }, 5.6, 380],
  ['VERT-100-SE', 'VERTICAL 1.00m SIN ESPIGA', 'vertical', 'multi', { largo: 1.0, variante: 'SE' }, 5.3, 160],
  ['VERT-150-CE', 'VERTICAL 1.50m CON ESPIGA', 'vertical', 'multi', { largo: 1.5, variante: 'CE' }, 8.0, 300],
  ['VERT-200-CE', 'VERTICAL 2.00m CON ESPIGA', 'vertical', 'multi', { largo: 2.0, variante: 'CE' }, 10.5, 1400],
  ['VERT-300-CE', 'VERTICAL 3.00m CON ESPIGA', 'vertical', 'multi', { largo: 3.0, variante: 'CE' }, 15.4, 240],
  ['HOR-048-073', 'HORIZONTAL Ø48.3 x 0.73m', 'horizontal', 'multi', { largo: 0.73 }, 3.2, 1800, { tambien: ['baranda'] }],
  ['HOR-048-109', 'HORIZONTAL Ø48.3 x 1.09m', 'horizontal', 'multi', { largo: 1.09 }, 4.4, 900, { tambien: ['baranda'] }],
  ['HOR-048-125', 'HORIZONTAL Ø48.3 x 1.25m', 'horizontal', 'multi', { largo: 1.25 }, 4.9, 700, { tambien: ['baranda'] }],
  ['HOR-048-150', 'HORIZONTAL Ø48.3 x 1.50m', 'horizontal', 'multi', { largo: 1.5 }, 5.8, 600, { tambien: ['baranda'] }],
  ['HOR-048-200', 'HORIZONTAL Ø48.3 x 2.00m', 'horizontal', 'multi', { largo: 2.0 }, 7.5, 500, { tambien: ['baranda'] }],
  ['HOR-048-250', 'HORIZONTAL Ø48.3 x 2.50m', 'horizontal', 'multi', { largo: 2.5 }, 9.2, 2600, { tambien: ['baranda'] }],
  ['DIAG-200x073', 'DIAGONAL 2.00 X 0.73m (P/NEGRA)', 'diagonal', 'multi', { alto: 2.0, largo: 0.73 }, 7.0, 260],
  ['DIAG-200x109', 'DIAGONAL 2.00 X 1.09m (P/AZUL)', 'diagonal', 'multi', { alto: 2.0, largo: 1.09 }, 7.5, 220],
  ['DIAG-200x125', 'DIAGONAL 2.00 X 1.25m (P/VERDE)', 'diagonal', 'multi', { alto: 2.0, largo: 1.25 }, 7.8, 200],
  ['DIAG-200x150', 'DIAGONAL 2.00 X 1.50m (P/AMARILLA)', 'diagonal', 'multi', { alto: 2.0, largo: 1.5 }, 8.3, 140],
  ['DIAG-200x200', 'DIAGONAL 2.00 X 2.00m', 'diagonal', 'multi', { alto: 2.0, largo: 2.0 }, 9.3, 120],
  ['DIAG-200x250', 'DIAGONAL 2.00 X 2.50m', 'diagonal', 'multi', { alto: 2.0, largo: 2.5 }, null, 400],
  ['DIAG-150x250', 'DIAGONAL 1.50 X 2.50m (P/ROJA)', 'diagonal', 'multi', { alto: 1.5, largo: 2.5 }, 9.6, 80],
  ['DIAG-PL-250x250', 'DIAGONAL PLANTA 2.50 x 2.50m', 'diagonal_planta', 'multi', { largo: 2.5, ancho: 2.5 }, 11.5, 40],
  ['DIAG-PL-250x150', 'DIAGONAL PLANTA 2.50 x 1.50m', 'diagonal_planta', 'multi', { largo: 2.5, ancho: 1.5 }, null, 0, { plausible: true }],
  ['DIAG-PL-CEL', 'DIAGONAL EN PLANTA P/ VIGA CELOSÍA', 'diagonal_planta', 'multi', { variante: 'celosia' }, null, 12, { plausible: true }],
  ['TAB-MET-073', 'TABLON METALICO 0.73m', 'tablon', 'multi', { largo: 0.73 }, 5.3, 300],
  ['TAB-MET-109', 'TABLON METALICO 1.09m', 'tablon', 'multi', { largo: 1.09 }, 7.8, 200],
  ['TAB-MET-125', 'TABLON METALICO 1.25m', 'tablon', 'multi', { largo: 1.25 }, 8.9, 160],
  ['TAB-MET-150', 'TABLON METALICO 1.50m', 'tablon', 'comun', { largo: 1.5 }, 10.6, 400],
  ['TAB-MET-200', 'TABLON METALICO 2.00m', 'tablon', 'multi', { largo: 2.0 }, 14.0, 300],
  ['TAB-MET-250', 'TABLON METALICO 2.50m', 'tablon', 'comun', { largo: 2.5 }, 17.4, 1500],
  ['TAB-ESC-250', 'TABLON ESCOTILLA 2.50m', 'tablon_escotilla', 'comun', { largo: 2.5 }, 22.0, 6],
  ['PLACA-FEN-122x244', 'Placa Fenólico 1,22 x 2,44m', 'fenolico', 'comun', {}, 32.0, 260, { unidad: 'placa', rinde: 2.9768 }],
  ['RDPE-073', 'RODAPIE 0,73m', 'rodapie', 'multi', { largo: 0.73 }, null, 400],
  ['RDPE-090', 'RODAPIE 0,90m', 'rodapie', 'bastidor', { largo: 0.9 }, 2.1, 120],
  ['RDPE-109', 'RODAPIE 1,09m', 'rodapie', 'multi', { largo: 1.09 }, 2.5, 200],
  ['RDPE-125', 'RODAPIE 1,25m', 'rodapie', 'multi', { largo: 1.25 }, 2.9, 160],
  ['RDPE-130', 'RODAPIE 1,30m', 'rodapie', 'bastidor', { largo: 1.3 }, 3.0, 160],
  ['RDPE-150', 'RODAPIE 1,50m', 'rodapie', 'comun', { largo: 1.5 }, 3.4, 40, { plausible: true }],
  ['RDPE-200', 'RODAPIE 2,00m', 'rodapie', 'multi', { largo: 2.0 }, 4.5, 30, { plausible: true }],
  ['RDPE-250', 'RODAPIE 2,50m', 'rodapie', 'comun', { largo: 2.5 }, 5.6, 60],
  ['TORN-600-FIJA', 'TORNILLON DE 600mm POR UNIDAD (BASE FIJA)', 'base_regulable', 'comun', {}, 4.2, 900],
  ['TORN-600-MOVIL', 'TORNILLON DE 600mm POR UNIDAD (BASE MOVIL)', 'base_regulable', 'comun', { variante: 'movil' }, 4.6, 80],
  ['TORN-300-FIJA', 'TORNILLON DE 300mm POR UNIDAD (BASE FIJA)', 'base_fija', 'comun', {}, null, 200],
  ['COLL-CORTO', 'COLLARIN CORTO (0.33m)', 'collarin', 'multi', {}, null, 700],
  ['MAD-BASE-10x10', 'MADERA BASE 10X10cm', 'accesorio', 'comun', { variante: 'madera_base' }, 1.2, 600],
  ['RUEDA-STD', 'RUEDA STANDARD', 'rueda', 'comun', {}, null, 40],
  ['RUEDA-STD-FRENO', 'RUEDA STANDARD CON FRENO', 'rueda_freno', 'comun', {}, null, 40],
  ['PASADOR-UNION', 'PASADOR / PERNO DE UNIÓN DE VERTICALES', 'accesorio', 'comun', { variante: 'pasador' }, null, 200, { plausible: true }],
  ['GRAMPA-VIGA', 'GRAMPA DE VIGA (BEAM CLAMP) P/ ALA DE ACERO', 'accesorio', 'comun', { variante: 'grampa_viga' }, null, 40, { plausible: true }],
  ['PLACA-ANC-COLG', 'PLACA DE ANCLAJE C/ BULÓN P/ COLGAR DE LOSA', 'accesorio', 'comun', { variante: 'placa_anclaje' }, null, 40, { plausible: true }],
  ['ANC-VOL-PLACA', 'ANCLAJE ESTRUCTURAL DE VOLADIZO (BULÓN/QUÍMICO C/ PLACA)', 'accesorio', 'comun', { variante: 'anclaje_voladizo' }, null, 40, { plausible: true }],
  ['ESC-ARR', 'ESCALÓN DE ARRANQUE (TORRE ESCALERA)', 'accesorio', 'comun', { variante: 'escalon_arranque' }, null, 20, { plausible: true }],
  ['ESC-INT-MULTI', 'ESCALERA INTERNA (PARA MULTIDIRECCIONAL)', 'escalera_interior', 'multi', {}, null, 40],
  ['ESC-INT-BAST', 'ESCALERA INTERNA (PARA BASTIDOR)', 'escalera_interior', 'bastidor', {}, 9.5, 30],
  ['BAR-ESC-MULTI', 'BARANDA DE ESCALERA INTERNA (PARA MULTIDIRECCIONAL)', 'baranda_escalera', 'multi', {}, 8.0, 30],
  ['BAR-ESC-BAST', 'BARANDA DE ESCALERA INTERNA (PARA BASTIDOR)', 'baranda_escalera', 'bastidor', {}, 7.0, 20],
  ['ZANCA-ESC-150x250', 'ZANCA (LIMON) ESCALERA DESCANSO 150X250', 'zanca', 'multi', { ancho: 1.5, largo: 2.5 }, 28.0, 24],
  ['VIGA-PTE-150', 'VIGA PUENTE Ø1.50m', 'viga_puente', 'multi', { largo: 1.5 }, 18.0, 16],
  ['VIGA-PTE-250', 'VIGA PUENTE Ø2.50m', 'viga_puente', 'multi', { largo: 2.5 }, 27.0, 24],
  ['VIGA-CEL-073', 'VIGA CELOSIA 0.73m', 'viga_celosia', 'multi', { largo: 0.73 }, 9.0, 10],
  ['VIGA-CEL-109', 'VIGA CELOSIA 1.09m', 'viga_celosia', 'multi', { largo: 1.09 }, 12.0, 10],
  ['VIGA-CEL-250', 'VIGA CELOSIA 2.50m', 'viga_celosia', 'multi', { largo: 2.5 }, 26.0, 12],
  ['VIGA-CEL-500', 'VIGA CELOSIA 5.00m', 'viga_celosia', 'multi', { largo: 5.0 }, 48.0, 6, { plausible: true }],
  ['VIGA-CEL-600', 'VIGA CELOSIA 6.00m', 'viga_celosia', 'multi', { largo: 6.0 }, 57.0, 4, { plausible: true }],
  ['VIGA-CEL-750', 'VIGA CELOSIA 7.50m', 'viga_celosia', 'multi', { largo: 7.5 }, 70.0, 0, { plausible: true }],
  ['MENSULA-045', 'Ménsula 48.3x3.2mm 1 x 320mm W Tablón - 0.45M Q235 HDG', 'mensula', 'multi', { largo: 0.45 }, 4.6, 120],
  ['MENSULA-073', 'MÉNSULA 0.73m (2 TABLONES) Q235 HDG', 'mensula', 'multi', { largo: 0.73 }, 7.4, 60, { plausible: true }],
  ['MENSULA-109', 'MÉNSULA 1.09m (3 TABLONES) Q235 HDG', 'mensula', 'multi', { largo: 1.09 }, 10.2, 0, { plausible: true }],
  ['ANC-QUIM-M12', 'ANCLAJE QUÍMICO M12 + CAÑO DE AMARRE', 'anclaje', 'comun', {}, 1.8, 24, { plausible: true }],
  ['ESFERA-SEG', 'ESFERA DE SEGURIDAD', 'esfera', 'comun', {}, 0.3, 300],
  ['DEFENSA-VEH', 'DEFENSA VEHICULAR P/ PATA DE PÓRTICO + SEÑAL DE GÁLIBO', 'defensa', 'comun', {}, null, 8, { plausible: true }],
  ['RECUB-VERT-200', 'RECUBRIMIENTO BLANDO DE VERTICAL 2.00m', 'recubrimiento', 'comun', { largo: 2.0 }, 0.6, 200, { plausible: true }],
  ['ALAMB-CONC-45x10', 'ALAMBRE CONCERTINA DOBLE 45mm x 10m', 'accesorio', 'comun', { variante: 'concertina' }, 3.5, 20, { unidad: 'rollo 10 m', rinde: 10 }],
  ['MEDIA-SOMBRA-5', 'MEDIA SOMBRA N°5 NEGRO (4m x 50m)', 'media_sombra', 'comun', {}, 18.0, 30, { unidad: 'rollo 4×50 m', rinde: 200 }],
  ['LONA-PVC', 'LONA PVC MICROPERFORADA (m²)', 'lona', 'comun', {}, 0.6, 500, { unidad: 'm²', rinde: 1, plausible: true }],
  ['NUDO-GIR', 'NUDO GIRATORIO', 'grampa_giratoria', 'comun', {}, 1.2, 400],
  ['NUDO-FIJO', 'NUDO FIJO', 'grampa_fija', 'comun', {}, 1.1, 400],
  ['MANG-EMP-048', 'MANGUITO DE EMPALME Ø48.3', 'manguito', 'comun', {}, 1.0, 150, { plausible: true }],
  ['BAST-AND-130x180', 'BASTIDOR DE ANDAMIO - 1,30m x 1.80h', 'bastidor', 'bastidor', { ancho: 1.3, alto: 1.8 }, 19.5, 700],
  ['BAST-PAS-090x180', 'BASTIDOR DE ANDAMIO PASILLO - 0,90m x 1.80h', 'bastidor', 'bastidor', { ancho: 0.9, alto: 1.8 }, 16.0, 200],
  ['BAST-PEA-130x250', 'BASTIDOR PASO PEATONAL - 1,30m x 2.50h', 'bastidor', 'bastidor', { ancho: 1.3, alto: 2.5 }, 24.0, 90],
  ['BAST-PEA-090x250', 'BASTIDOR PASO PEATONAL PASILLO - 0,90m x 2.50h', 'bastidor', 'bastidor', { ancho: 0.9, alto: 2.5 }, 20.0, 30],
  ['BAST-BAR-130x100', 'BASTIDOR BARANDA - 1,30m x 1.00h', 'bastidor_baranda', 'bastidor', { ancho: 1.3, alto: 1.0 }, 9.0, 160],
  ['BAST-BAR-090x100', 'BASTIDOR BARANDA - 0,90m x 1.00h', 'bastidor_baranda', 'bastidor', { ancho: 0.9, alto: 1.0 }, 7.2, 60],
  ['RIEND-250-H', 'RIENDA ANDAMIO 2.50m - HORIZONTAL', 'rienda_h', 'bastidor', { largo: 2.5 }, 4.4, 1400],
  ['RIEND-250-D', 'RIENDA ANDAMIO 2.50m (2.77m) - DIAGONAL', 'rienda_d', 'bastidor', { largo: 2.5 }, 4.9, 1100],
  ['RIEND-150-H', 'RIENDA ANDAMIO JR 1.50m - HORIZONTAL', 'rienda_h', 'bastidor', { largo: 1.5 }, 2.8, 300],
  ['RIEND-150-D', 'RIENDA ANDAMIO JR 1.50m (1.65m) - DIAGONAL', 'rienda_d', 'bastidor', { largo: 1.5 }, 3.1, 260],
  ['MOD-AND-STD-130x250x180', 'MODULO DE ANDAMIO STD 1,30 X 2,50 X 1,80', 'modulo_kit', 'bastidor', { ancho: 1.3, largo: 2.5, alto: 1.8 }, 38.1, 260],
  ['MOD-AND-JR-130x150x180', 'MODULO DE ANDAMIO JUNIOR 1,30 X 1,50 X 1,80', 'modulo_kit', 'bastidor', { ancho: 1.3, largo: 1.5, alto: 1.8 }, 31.3, 80],
  ['MOD-AND-PAS-090x250x180', 'MODULO DE ANDAMIO PASILLO 0,90 X 2,50 X 1,80', 'modulo_kit', 'bastidor', { ancho: 0.9, largo: 2.5, alto: 1.8 }, 34.6, 60],
  ['MOD-AND-PAS-JR-090x150x180', 'MODULO DE ANDAMIO PASILLO JUNIOR 0,90 X 1,50 X 1,80', 'modulo_kit', 'bastidor', { ancho: 0.9, largo: 1.5, alto: 1.8 }, null, 30],
  ['MOD-PEA-STD-130x250x250', 'MODULO DE ANDAMIO PASO PEATONAL STD 1,30 X 2,50 X 2,50', 'modulo_kit', 'bastidor', { ancho: 1.3, largo: 2.5, alto: 2.5 }, 42.6, 40],
  ['MOD-PEA-PAS-090x250x250', 'MODULO DE ANDAMIO PASO PEATONAL PASILLO 0,90 X 2,50 X 2,50', 'modulo_kit', 'bastidor', { ancho: 0.9, largo: 2.5, alto: 2.5 }, 38.6, 12],
];

const KITS: Record<string, Record<string, number>> = {
  'MOD-AND-STD-130x250x180': { 'BAST-AND-130x180': 1, 'RIEND-250-H': 2, 'RIEND-250-D': 2 },
  'MOD-AND-JR-130x150x180': { 'BAST-AND-130x180': 1, 'RIEND-150-H': 2, 'RIEND-150-D': 2 },
  'MOD-AND-PAS-090x250x180': { 'BAST-PAS-090x180': 1, 'RIEND-250-H': 2, 'RIEND-250-D': 2 },
  'MOD-AND-PAS-JR-090x150x180': { 'BAST-PAS-090x180': 1, 'RIEND-150-H': 2, 'RIEND-150-D': 2 },
  'MOD-PEA-STD-130x250x250': { 'BAST-PEA-130x250': 1, 'RIEND-250-H': 2, 'RIEND-250-D': 2 },
  'MOD-PEA-PAS-090x250x250': { 'BAST-PEA-090x250': 1, 'RIEND-250-H': 2, 'RIEND-250-D': 2 },
};

/** Códigos del fixture que no existen en Odoo (en la base quedan «sin código»). */
export const CODIGOS_PLAUSIBLES: string[] = FILAS.filter((f) => f[7]?.plausible).map((f) => f[0]);

function armarFixture(): Catalogo {
  const piezas: Record<string, ItemCatalogo> = {};
  const mapa: EntradaMapa[] = [];
  const push = (familia: Familia, sistema: SistemaPieza, m: Medidas, codigo: string) =>
    mapa.push({ familia, sistema, largo: m.largo ?? null, alto: m.alto ?? null, ancho: m.ancho ?? null, variante: m.variante ?? null, codigo, prioridad: 100 });
  for (const [codigo, descripcion, familia, sistema, medidas, peso, stock, extra] of FILAS) {
    piezas[codigo] = {
      codigo, piezaId: `fx-${codigo}`, descripcion, familia, sistema,
      unidad: extra?.unidad || 'u', rinde: extra?.rinde, peso_kg: peso,
      stock: { enDeposito: stock, comprometido: 0 }, activo: true,
    };
    if (medidas) {
      push(familia, sistema, medidas, codigo);
      for (const f2 of extra?.tambien || []) push(f2, sistema, medidas, codigo);
    }
  }
  // Caños de tubo y grampa: CAÑO-010 … CAÑO-640 (existen en catalogo_piezas, pasos de 0,10).
  for (let n = 1; n <= 64; n++) {
    const largo = Math.round(n * 10) / 100;
    const codigo = `CAÑO-${String(n * 10).padStart(3, '0')}`;
    piezas[codigo] = {
      codigo, piezaId: `fx-${codigo}`, descripcion: `CAÑO - ${largo.toFixed(2)}m`, familia: 'cano', sistema: 'comun',
      unidad: 'u', peso_kg: Math.round(largo * 3.56 * 100) / 100, stock: { enDeposito: 120, comprometido: 0 }, activo: true,
    };
    push('cano', 'comun', { largo }, codigo);
  }
  return { fuente: 'fixture', piezas, mapa, kits: KITS, medidas: medidasPorDefecto() };
}

export const CATALOGO_FIXTURE: Catalogo = armarFixture();
