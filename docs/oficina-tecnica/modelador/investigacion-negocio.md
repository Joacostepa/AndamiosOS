# Modelador de andamios: dominio y lo que arma ABA

## 0. Hallazgos que cambian el diseño

1. **El multidireccional de ABA no está modulado como Layher.** Odoo, a través de `catalogo_piezas`, trae horizontales y tablones de **0,73 / 1,09 / 1,25 / 1,50 / 2,00 / 2,50 m**. También trae verticales de **0,5 / 1 / 1,5 / 2 / 3 m** con y sin espiga, y diagonales **"2,00 × vano"** (0,73, 1,09, 1,25, 1,50, 2,00 y 2,50) con un color de pintura por largo. Están en `supabase/migrations/20260331000010_import_productos_odoo.sql`. Las piezas son "Q235 HDG" y "roseta Coronet", y la memoria dice "producido en planta propia" (skill `andamios-memoria-calculo/references/sistemas_andamios.md`). Hay tres lugares que hoy suponen Layher puro y habría que corregir:
   - `STD` del cálculo de oficina-tecnica-aba: 1,57 / 2,07 / 2,57 / 3,07 (`src/lib/calc/catalog/medidas.ts`).
   - El render de `mapa-obras`, con vanos de 2,57 (`src/lib/mapa-obras/geometria.ts:128`).
   - El handoff anterior. **El catálogo del modelador sale de Odoo, no de Layher.**
2. **El vano estándar real es 2,50 × 2,00 m.** El informe técnico del permiso usa "módulos en planta = ml ÷ 2,50" y "módulos en altura = alto ÷ 2" (`docs/permisos/modulo.md` §3).
3. **Bastidores.** Los de Odoo son **1,30 × 1,80** (andamio), **0,90 × 1,80** (pasillo), **1,30 × 2,50** y **0,90 × 2,50** (paso peatonal), y **0,90 / 1,30 × 1,00** (baranda). Los cuerpos son de **2,50** o **1,50** de largo (STD y Junior). Las "riendas" 2,50 H / 2,77 D y 1,50 H / 1,65 D son largueros y crucetas del bastidor. En Odoo están mal clasificadas como `anclaje`. La skill de memoria dice "pre-armado 1,50 × 2,00": **eso contradice a Odoo** y hay que confirmarlo. El cuerpo 1,30 × 2,50 × 1,80 coincide con el estándar de plaza que usa la UNL, armado con dos bastidores, dos largueros, dos diagonales y tablón de 2,5 × 0,30 ([UNL PETP](https://www.unl.edu.ar/institucional/wp-content/uploads/sites/5/2019/02/2-PETP-LPri-04-22.pdf)).
4. **No hay pesos reales.** Los `peso_kg` del seed (`20260330000003_seed_data.sql`) son de piezas inventadas (MF-…, DG-…). En las piezas reales que vienen de Odoo el peso está vacío.
5. **Tipos de trabajo que ya existen en la venta** (`src/lib/tablero/tipos.ts`, `x_trabajo_obra`): pantalla_proteccion, estructura_pantalla, estructura_sin_pantalla, torre, plataforma, sercha, apuntalamiento_vertical. Eventos: tribuna y escenario. El modelador debería usar **esta misma taxonomía** como primer selector.

## 1. Modelo de dominio

Hay una sola grilla paramétrica de la que se derivan las piezas. El usuario trabaja con estructuras y elementos funcionales, nunca con piezas sueltas, salvo que quiera.

```
Diseño (1 por obra/venta: venta Odoo S0xxxx, versión, autor)
 ├─ Contexto: terreno (cesped…cemento), en_vereda_CABA, ancho_vereda, clase_carga (1–4, default 3),
 │            viento (zona CABA), cubierta_global (nada | media sombra | lona)
 └─ Estructura[] (tipo: fachada | pantalla | torre | portico | plataforma | bastidor_fachada | libre)
     ├─ sistema: multidireccional | bastidor
     ├─ origen + rotación (en planta, para combinar varias estructuras)
     ├─ Eje[]           tramos en planta: largo, ángulo (0/90/libre), lado_fachada
     │   └─ Vano[]      largo ∈ catálogo (2,50 default; relleno con 2,00/1,50/1,25/1,09/0,73)
     ├─ profundidad      ∈ {0,73, 1,09, 1,25 (pantalla), 1,30/0,90 (bastidor)}
     ├─ Nivel[]          cota de roseta/bastidor (paso 0,50 multi; 1,80 o 2,50 bastidor)
     │   └─ rol: trabajo | paso (sin tablón) | bandeja | cubierta
     ├─ Celda (vano × nivel): unidad editable por clic
     │   ├─ Plataforma   tablón (ancho 0,30/0,20) | escotilla | fenólico 18 mm
     │   ├─ Protección   baranda doble + rodapié (lados abiertos, automático)
     │   ├─ Arriostre    diagonal vertical (sentido) | diagonal en planta
     │   ├─ Acceso       escalera interna + baranda | escotilla | zanca de descanso 1,50×2,50
     │   └─ Cerramiento  media sombra / lona (cambia el viento)
     ├─ Ménsula[]        lado (fachada/afuera), brazo (0,45 hoy en catálogo; 0,73/1,09 en M09)
     ├─ Pórtico[]        luz libre, altura libre, viga (puente 1,50/2,50 | celosía 0,73/1,09/2,50)
     ├─ Anclaje[]        nudo (vano, nivel), tipo (químico M12 / caño y nudo / base de fijación)
     ├─ Apoyo[]          por vertical: tornillón 300/600 fija | 600 móvil + rueda | collarín
     │                   corto/largo | madera 10×10 | placa fenólico 15/30
     └─ Contrapeso / pata de gallo (torres libres, voladizos: M02/M04)

construir(Diseño) → Pieza[] {id, ref_catalogo, tipo, posición, largo, peso_kg, estructura_id, celda}
   → 3D (instancias por ref) · BOM → computos/computo_items · entradas M01–M11 · imagen
```

Parámetros que siempre tienen default y solo se editan si hace falta: largo del vano, profundidad, altura de nivel, tipo de base, clase de carga.

## 2. Reglas de armado que aplica el software

Todos los valores tienen que estar en una tabla editable de "criterios ABA" que valide Hougassian, no fijos en el código. Lo marcado con ⚠ hay que confirmarlo.

**Geometría y modulación**
- **Relleno del largo:** el largo pedido se completa con vanos de 2,50 y un vano de ajuste del catálogo, al final o centrado, a elección. Si sobra o falta más de unos 10 cm, aviso.
- **Altura multidireccional:** el último nivel de trabajo queda a H − 1,00 para que la baranda remate a H. Las verticales se combinan para que los empalmes no caigan todos en la misma cota (escalonado 0,5/1) ⚠.
- **Primer nivel y tornillón:** el primer nivel es una horizontal de arranque a unos 0,20–0,40 m sobre el tornillón, con collarín en multidireccional. La regulación del tornillón absorbe la pendiente del terreno (dato: desnivel por eje).
- **Altura bastidor:** se apilan cuerpos de 1,80. El remate es un bastidor baranda de 1,00 y no hay vano de ajuste: el largo se redondea a múltiplos de 2,50 o 1,50.
- **Esquinas:** en multidireccional se comparte la vertical o se agrega un vano de 0,73 de giro. En bastidor se ponen dos cuerpos con nudos giratorios ⚠.

**Protección colectiva**
- **Barandas:** en cada nivel de trabajo, por cada lado abierto, doble baranda (≈1,00 y 0,50) más rodapié. El lado de fachada queda libre si la distancia a fachada es de 0,30 m o menos ⚠. Laterales de cierre siempre.
- **Plataformas:** se llenan con tablones (2 × 0,30 + 1 × 0,20 en 0,73 ⚠). La escotilla va en el vano de acceso. Hay que elegir entre "1 fila completa" y "niveles cada 2 m": es la misma opción que el precio por m² (`andamios-propuesta/references/estructura_propuesta.md`).
- **Acceso:** escalera interna con escotilla cada 2 m de altura en el vano de acceso elegido. Por defecto, un acceso cada ~20–30 m de frente ⚠.

**Estabilidad**
- **Diagonales verticales en el plano de fachada:** una cada 5 vanos como mínimo y siempre en los vanos extremos, en todos los niveles, alternando el sentido ⚠ (M06 usa los modos "cada 4 cuerpos" o "cada cuerpo"; `MODULOS.md` l.57). En el plano transversal van en las caras extremas.
- **Diagonal en planta:** en el nivel de arranque y donde haya pórtico o voladizo.
- **Anclajes:** 1 cada 12 m² (4 m en horizontal × 3 m en vertical), mínimo 5, químico M12 (`calculos_tipo.md` §8.5). Hay que pasar a una grilla en nudos, por ejemplo cada 2 vanos y cada 2 niveles, al tresbolillo. Con media sombra o lona se densifica, porque el viento sube: con Cf más alto y ~126 kg/m² fuera de servicio, según el handoff §3. Además, siempre en el último nivel y en los extremos.
- **Esbeltez de estructuras libres** (torre o pantalla sin anclar): si H/B supera 3 a la intemperie (`seguridad.ts`), se propone ensanche, pata de gallo, contrapeso o anclaje. Lo verifican M03 y M04.
- **Bases:** una por vertical. La placa la elige M11 según el terreno. Con rueda: freno y límite de altura ⚠.

**Vía pública**
- **Pantalla o bandeja:** fenólico 18 mm, altura estándar 3,00, ancho 1,25–1,30, esferas de seguridad y concertina opcional (`docs/permisos/modulo.md` §3–4; `src/lib/odoo/trabajo.ts`).
- **Recubrimiento de verticales:** antecedente de la Ley 3104 (hoy figura no vigente): recubrimiento blando en las verticales hasta 2 m, y paso libre de 2,50 m o más en veredas de 1,50 m o menos ([BO CABA](https://boletinoficial.buenosaires.gob.ar/normativaba/norma/130180)).
- **Pasillo peatonal:** circulación de 1,20 m o más (Res. MEPHUGC 88/22, [anexo](https://documentosboletinoficial.buenosaires.gob.ar/publico/PE-RES-MEPHUGC-MEPHUGC-88-22-ANX-5.pdf)).
- **Reglamento vigente:** RT-040505-020109-06 del Código de Edificación ([anexo](https://documentosboletinoficial.buenosaires.gob.ar/publico/PE-RES-MJGGC-SSGU-205-22-ANX-16.pdf)). **No lo pude leer: hay que bajar sus números.**
- **Validaciones:** el modelador valida la altura libre del pórtico y el ancho de paso.

**Secciones del informe técnico:** se derivan solas por tipo, con la tabla de `permisos/modulo.md` §3. Por ejemplo, pantalla: apoyo, protección peatonal y esferas.

## 3. Tipologías y plantillas

Cada plantilla se arma con 3 a 6 datos; el resto se edita en el 3D.

| # | Plantilla (x_trabajo_obra) | Sistema | Entradas mínimas | Qué genera solo |
|---|---|---|---|---|
| 1 | **Pantalla de protección peatonal** (pantalla_proteccion) | multi | ml, altura (3 / 6 / 8), ancho (1,25), concertina s/n | vanos 2,50, bandeja de fenólico arriba, esferas, bases, diagonales, anclaje a fachada o autoportante |
| 2 | **Estructura + pantalla** (fachada completa) | multi | frentes[] (L o U con ángulos), altura, profundidad 0,73/1,09, "1 fila" o "cada 2 m", cubierta | pantalla en PB, niveles, escotilla, media sombra, anclajes, BOM |
| 3 | **Estructura sin pantalla** (interior, patio, medianera) | multi | frentes[], altura, profundidad, niveles | igual que la 2, sin bandeja |
| 4 | **Fachada de bastidores** | bastidor | ml, altura, ancho 1,30/0,90, cuerpo STD/JR | cuerpos de 1,80, riendas H/D, tablones 2,50, bastidor baranda, escalera interna para bastidor |
| 5 | **Torre de acceso / escalera** | multi o bastidor | planta (2,50 × 1,50 descanso), altura, nivel de desembarco, anclada s/n | zancas de descanso, barandas de escalera, diagonales en todas las caras |
| 6 | **Torre de trabajo fija** | multi | planta (vano × prof.), altura, plataforma superior | esbeltez (M03), ensanche o pata de gallo (M04) |
| 7 | **Torre móvil / módulo hogareño** (alquiler puro) | bastidor | cuerpo STD/JR/pasillo, n.º de cuerpos, ruedas | ruedas con freno, tornillón móvil, límite H/B, sin montaje |
| 8 | **Pórtico peatonal sobre vereda** | bastidor (paso peatonal 2,50 h) o multi | ml, altura libre (≥ 2,50), ancho de paso, estructura arriba s/n | bastidores de paso o vigas puente, bandeja, recubrimiento de verticales |
| 9 | **Pórtico vehicular o puente sobre obstáculo** | multi | luz, gálibo, carga arriba | viga puente o celosía (M08), torres de apoyo, diagonal en planta |
| 10 | **Fachada con voladizo / ménsulas** | multi | fachada base + lado y brazo de ménsula por nivel | ménsulas, diagonales de ménsula (M09), contrapeso (M02) |
| 11 | **Plataforma** (de trabajo o de carga en voladizo) | multi | planta, cota, clase o carga, apoyo (piso o entre losas) | M10, vigas, fenólico |
| 12 | *Fuera de la v1:* sercha, apuntalamiento, tribuna, escenario | — | — | dejar "estructura libre" para dibujar celda a celda |

Combinaciones: una obra = varias estructuras sobre la misma planta. Ejemplos: 2 + 5 (fachada con torre de escalera) y 1 + 8 (pantalla con pórtico de acceso a garaje).

## 4. Datos que hay que pedirle a JS

1. **Catálogo real del multidireccional:** confirmar los largos (no hay 3,00 de horizontal; ¿hay tablón de 0,73 o 1,09 en multi?) y el **peso de cada código**. Hoy están vacíos en Odoo.
2. **Bastidor:** ¿1,30 × 1,80 (Odoo) o 1,50 × 2,00 (skill de memoria)? Composición exacta de un cuerpo: cuántas riendas H, cuántas D y qué tablones. ¿El "módulo" de Odoo es un kit armado?
3. **Ménsulas:** en Odoo solo figura la de 0,45. ¿Hay de 0,73 y 1,09? Vigas: ¿qué luces usan para pórticos y con qué carga?
4. **Criterios de armado de ABA**, para que los firme Hougassian: diagonales cada N vanos, grilla de anclajes con y sin media sombra, tablones por ancho, distancia a fachada, frecuencia de accesos y altura máxima con ruedas.
5. **Pantalla:** composición tipo de 3 / 6 / 8 m. ¿La bandeja es horizontal o tiene faldón inclinado? ¿Cómo va la media sombra (rollos de 4 × 50)?
6. **Pórtico peatonal:** altura libre y ancho que exige hoy la DGROC. Conseguir el RT-040505-020109-06.
7. **Tolerancia** de relleno de largo y altura, y si el vano de ajuste va al final o centrado.
8. **10 obras reales con su remito de entrega** (piezas y cantidades), para calibrar `construir()` con tests golden. Es la mejor validación posible.
9. **Mapeo pieza → código Odoo** y corrección de las categorías mal puestas (riendas como `anclaje`).
10. Si la cuadrilla arma con **tablón de 0,30 de acero o con plataforma con gancho**. Cambia el BOM y el render.

**Fuentes**

Repositorios:
- `/Users/joaquin/Desktop/Proyectos/AndamiosOS/docs/oficina-tecnica/handoff.md`
- `.../supabase/migrations/20260331000010_import_productos_odoo.sql`
- `.../supabase/migrations/20260330000003_seed_data.sql`
- `.../docs/permisos/modulo.md`
- `.../src/lib/tablero/tipos.ts`
- `.../src/lib/odoo/trabajo.ts`
- `.../src/lib/mapa-obras/medidas.ts`
- `.../src/lib/mapa-obras/geometria.ts`
- `.../src/lib/cotizador/{fachada,bandeja,alquiler,tipos}.ts`
- `.../src/app/api/ai/computo/route.ts`
- `/Users/joaquin/Desktop/Proyectos/oficina-tecnica-aba/src/lib/calc/catalog/{medidas,pesos,layher,seguridad,terrenos}.ts`
- `.../src/lib/calc/volumenes/volumenes.ts`
- `.../docs/specs/MODULOS.md`

Skills:
- `~/.claude/skills/synced/.../andamios-memoria-calculo/references/{sistemas_andamios,calculos_tipo}.md`
- `.../andamios-propuesta/references/estructura_propuesta.md`

Web:
- [Ley 3104 CABA](https://boletinoficial.buenosaires.gob.ar/normativaba/norma/130180)
- [Liga del Consorcista, Ley 3104](https://ligadelconsorcista.org/legislacion/modificaciones-al-c-digo-edificaci-n-andamios-la-v-p-blica-ley-3104)
- [Res. SSGU 205/22 Anexo 16](https://documentosboletinoficial.buenosaires.gob.ar/publico/PE-RES-MJGGC-SSGU-205-22-ANX-16.pdf)
- [Res. MEPHUGC 88/22 Anexo 5](https://documentosboletinoficial.buenosaires.gob.ar/publico/PE-RES-MEPHUGC-MEPHUGC-88-22-ANX-5.pdf)
- [DIBt Z-8.22-939](https://www.dibt.de/pdf_storage/2013/Z-8.22-939(1.8.22-34!12).pdf): largos de horizontal y viga celosía Layher (1,57/2,07, 2,57/3,07)
- [DIBt Z-8.22-64](https://www.dibt.de/pdf_storage/2018/Z-8.22-64(1.8.22-61!17).pdf)
- [Catálogo Allround Layher 2024](https://layher.pe/wp-content/uploads/2026/04/CatalogoAllround-ESP2024-1.pdf)
- [INSST NTP 1015](https://www.insst.es/documentacion/colecciones-tecnicas/ntp-notas-tecnicas-de-prevencion/29-serie-ntp-numeros-996-a-1030-ano-2014/nota-tecnica-de-prevencion-ntp-1015) (no se pudo leer)
- [UNL, especificación de cuerpo de andamio 1,3 × 2,5 × 1,8](https://www.unl.edu.ar/institucional/wp-content/uploads/sites/5/2019/02/2-PETP-LPri-04-22.pdf)

**No confirmado en la web:** "diagonal cada 5 vanos" y "anclaje cada 4 m alternado" no aparecen en las fuentes abiertas. Por eso están marcados con ⚠ para que los valide el profesional.