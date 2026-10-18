> Registro del equipo de UX/UI (17/10/2026). La maqueta final ([maqueta.html](./maqueta.html)) aplicó después las críticas: donde este texto y la maqueta no coincidan, vale la maqueta. En la maqueta, el técnico de SyH aparece como «HyS (técnico, ejemplo)» (sólo nombres inventados).

# Módulo RRHH: contrato visual y técnico de la maqueta

*Fuente única de verdad para los dos constructores. Oficina: escribe `docs/rrhh/maqueta.html`, que tiene el núcleo (`mq-`), la oficina (`of-`) y la API `window.MAQ`. Obra: escribe un fragmento aparte (`ob-`) que se pega dentro de `<div id="vista-obra">`. Los tokens salen de `src/app/globals.css`. Los marcos copian el enfoque de `docs/sistemas/maqueta.html` (riel, header de 56 px), `docs/partes/maqueta.html` (vista del capataz con texto de 17 px y botones de 56 px) y `docs/sofia/crm-maqueta.html` (WhatsApp). Los íconos son SVG inline. No se usa lucide por CDN, aunque Sistemas sí lo hace.*

Los contrastes que figuran abajo los medí con un script (fórmula WCAG, oklch convertido a sRGB). Cuando un par dice "≥ x:1", está medido. Todo par nuevo que no esté en este documento hay que medirlo antes de usarlo.

---

## 0. Esqueleto del archivo y orden de carga

```html
<title>Módulo RRHH</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  /* 1. tokens (§1)  2. base mq- (§2.1)  3. marcos de teléfono y kiosco (§2.3)  4. oficina of- (§2.2) */
</style>

<script>
  /* NÚCLEO: window.MAQ, íconos y estado inicial (§3). Va ANTES de cualquier markup,
     para que el fragmento de obra lo encuentre cuando su script corra durante el parseo. */
</script>

<div class="mq-maq" id="mq-maq">
  <header class="mq-barra" id="mq-barra"><!-- barra de la maqueta (§2.1) --></header>
  <main class="mq-escenario" id="mq-escenario" data-modo="oficina">
    <div class="mq-vista" id="vista-oficina"><!-- .of-app (§2.2) --></div>
    <div class="mq-vista" id="vista-obra" data-senal="si" hidden>
      <!-- @@FRAGMENTO-OBRA@@ : acá se pega el fragmento entero (§3.2) -->
      <p class="mq-falta">Falta pegar el fragmento de obra.</p>
    </div>
  </main>
  <div class="mq-toasts" id="mq-toasts" role="status" aria-live="polite"></div>
</div>

<script>
  /* OFICINA: datos de relleno, render de O1–O15, MAQ.registrar("oficina", …) y,
     en la última línea, MAQ._arrancar(). */
</script>
```

- Sin `<!doctype>`, `<html>`, `<head>` ni `<body>`. Todos los atributos van con comillas dobles y todos los elementos se cierran.
- Cuando se pega el fragmento, se borra el `<p class="mq-falta">`.
- Sólo el núcleo y la oficina escriben en `localStorage`, siempre con try/catch, y sólo para recordar la pantalla, el modo y el tema.

---

## 1. Tokens

### 1.1 Bloque completo (se copia tal cual)

```css
:root{
  /* ── Página de la maqueta (fuera de la app) ── */
  --page: oklch(0.945 0.004 90);
  /* ── Neutros AndamiosOS (globals.css :root) ── */
  --bg: oklch(0.985 0 0);
  --card: oklch(1 0 0);
  --card2: oklch(0.975 0 0);
  --hover: oklch(0.965 0 0);
  --fg: oklch(0.145 0 0);
  --muted: oklch(0.96 0 0);            /* FONDO apagado (shadcn --muted) */
  --muted-fg: oklch(0.5 0 0);          /* texto secundario: 6,0:1 sobre --card */
  --border: oklch(0.9 0 0);
  --border-strong: oklch(0.82 0 0);
  --input: oklch(0.9 0 0);
  --accent: oklch(0.96 0.02 42);
  /* ── Coral ABA #D85A30 ── */
  --primary: oklch(0.62 0.16 42);      /* logo, foco, pestaña activa, anillos. NO fondo de texto blanco (3,9:1) */
  --primary-btn: oklch(0.55 0.16 42);  /* fondo de botón primario: blanco encima 5,2:1 */
  --primary-btn-hover: oklch(0.5 0.16 42);
  --on-primary: oklch(1 0 0);
  --coral-bg: oklch(0.95 0.03 42);
  --coral-text: oklch(0.45 0.13 38);   /* 6,7:1 sobre --coral-bg; links y acciones de texto */
  --ring: oklch(0.62 0.16 42);
  /* ── Riel oscuro (sidebar) ── */
  --sb: oklch(0.17 0 0);
  --sb-fg: oklch(0.9 0 0);
  --sb-muted: oklch(0.62 0 0);         /* 5,25:1 sobre --sb */
  --sb-accent: oklch(0.24 0 0);
  --sb-border: oklch(0.26 0 0);
  --sb-primary: oklch(0.7 0.15 45);    /* ítem activo: 5,8:1 sobre --sb-accent (el coral de marca da 4,2) */
  /* ── Semánticos de estado (texto sobre su -bg ≥ 5:1) ── */
  --ok: oklch(0.45 0.12 140);  --ok-bg: oklch(0.95 0.04 140);  --ok-solido: oklch(0.52 0.13 140);
  --warn: oklch(0.47 0.1 60);  --warn-bg: oklch(0.95 0.05 80); --warn-borde: oklch(0.75 0.14 70);
  --err: oklch(0.52 0.2 28);   --err-bg: oklch(0.96 0.03 28);  --err-solido: #d92d20;   /* blanco encima 4,8:1 */
  --info: oklch(0.5 0.12 250); --info-bg: oklch(0.95 0.03 250);
  --priv: oklch(0.45 0.12 295); --priv-bg: oklch(0.95 0.03 295); /* SENSIBLE / restringido (candado) */
  --neutro-bg: oklch(0.95 0.005 90); --neutro-text: oklch(0.42 0.005 90);
  --on-solido: oklch(1 0 0);
  /* ── Canales (chips de la oficina) ── */
  --wa: oklch(0.45 0.11 155);  --wa-bg: oklch(0.95 0.04 155);
  --tg: oklch(0.47 0.11 235);  --tg-bg: oklch(0.95 0.03 235);
  /* ── Marcos (teléfono, tablet) y capas ── */
  --bezel: oklch(0.2 0 0);
  --bezel-edge: oklch(0.32 0 0);
  --notch: oklch(0.12 0 0);
  --dim: rgb(0 0 0 / 0.5);
  --shadow-1: 0 1px 2px oklch(0 0 0 / 6%);
  --shadow-2: 0 12px 32px -10px oklch(0 0 0 / 25%), 0 2px 6px oklch(0 0 0 / 6%);
  /* ── Tipografía y medidas ── */
  --font: "DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --r: 0.5rem;          /* 8 px: botones, inputs */
  --r-card: 10px;
  --r-dlg: 12px;
  --hd-h: 56px;
  --riel-w: 52px;
  --riel-w-abierto: 248px;

  /* ── OBRA: claro y de alto contraste A PROPÓSITO. NO se redefinen en los bloques oscuros. ── */
  --ob-bg: #ffffff;
  --ob-fg: #111111;          /* 18,9:1 */
  --ob-mut: #4a4a4a;         /* 8,9:1 sobre blanco, 7,9:1 sobre --ob-suave */
  --ob-suave: #f4f2ec;
  --ob-linea: #d6d3ca;       /* separadores decorativos, NUNCA el borde de un control */
  --ob-borde: #3d3d3d;       /* borde de botones y opciones: 10,9:1 */
  --ob-prim: oklch(0.52 0.16 42);       /* coral de obra: blanco encima 5,9:1 */
  --ob-prim-hover: oklch(0.47 0.15 42);
  --ob-on: #ffffff;
  --ob-ok: #2f6b2f;          /* blanco encima 6,4:1 */
  --ob-ok-bg: #e3f1d8;  --ob-ok-text: #1f4d1f;     /* 8,3:1 */
  --ob-warn-bg: #fff1d6; --ob-warn-text: #6b3a00;  /* 8,4:1 */
  --ob-warn-borde: #d98a00;  /* sólo trazo/relleno con texto --ob-fg (6,8:1); nunca texto blanco (2,8) */
  --ob-err: #b42318;         /* blanco encima 6,6:1 */
  --ob-err-bg: #fdecea; --ob-err-text: #8a1c12;    /* 8,1:1 */
  --ob-info-bg: #e6eefb; --ob-info-text: #14477d;  /* 8,1:1 */
  --ob-off-bg: #fef6e7; --ob-off-text: #7a4405; --ob-off-borde: #e0b866; /* "sin señal": 7,4:1 */
  --ob-foco: #1d4ed8;        /* anillo de foco de obra, 3 px: se ve sobre blanco y sobre coral */
  --ob-firma-bg: #fffef9; --ob-firma-tinta: #111111; --ob-firma-borde: #8a877f; /* 3,6:1, trazo */
  --ob-wa-bg: #efe9df; --ob-wa-in: #ffffff; --ob-wa-out: #d9fdd3; --ob-wa-cab: #f6f5f2;
  --ob-wa-link: #0b5cad;     /* 6,1:1 sobre --ob-wa-cab */
  --ob-tg-bg: #dfe9f2; --ob-tg-out: #effdde; --ob-tg: #0b5cad;
  --ob-kiosco-barra: #111111;
  --ob-sombra: 0 1px 1px rgb(0 0 0 / 0.08);

  color-scheme: light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --page: oklch(0.1 0 0);
    --bg: oklch(0.13 0 0); --card: oklch(0.2 0 0); --card2: oklch(0.17 0 0); --hover: oklch(0.235 0 0);
    --fg: oklch(0.93 0 0); --muted: oklch(0.25 0 0); --muted-fg: oklch(0.68 0 0);
    --border: oklch(1 0 0 / 10%); --border-strong: oklch(1 0 0 / 18%); --input: oklch(1 0 0 / 15%);
    --accent: oklch(0.25 0.02 42); --coral-bg: oklch(0.28 0.05 42); --coral-text: oklch(0.85 0.08 42);
    --sb: oklch(0.15 0 0); --sb-accent: oklch(0.21 0 0); --sb-border: oklch(1 0 0 / 10%);
    --ok: oklch(0.77 0.14 145); --ok-bg: oklch(0.29 0.06 145); --ok-solido: oklch(0.55 0.14 140);
    --warn: oklch(0.82 0.13 80); --warn-bg: oklch(0.3 0.06 80); --warn-borde: oklch(0.6 0.1 70);
    --err: oklch(0.72 0.17 27); --err-bg: oklch(0.3 0.07 27);
    --info: oklch(0.77 0.1 250); --info-bg: oklch(0.3 0.05 250);
    --priv: oklch(0.82 0.09 295); --priv-bg: oklch(0.29 0.05 295);
    --neutro-bg: oklch(0.26 0.006 90); --neutro-text: oklch(0.85 0.008 90);
    --wa: oklch(0.75 0.13 155); --wa-bg: oklch(0.28 0.05 155);
    --tg: oklch(0.77 0.1 235); --tg-bg: oklch(0.27 0.04 235);
    --bezel: oklch(0.3 0 0); --bezel-edge: oklch(0.42 0 0); --notch: oklch(0.08 0 0);
    --dim: rgb(0 0 0 / 0.62);
    --shadow-1: 0 1px 2px oklch(0 0 0 / 40%);
    --shadow-2: 0 14px 36px -10px oklch(0 0 0 / 70%), 0 2px 6px oklch(0 0 0 / 40%);
    color-scheme: dark;
  }
}
:root[data-theme="dark"]{
  --page: oklch(0.1 0 0);
  --bg: oklch(0.13 0 0); --card: oklch(0.2 0 0); --card2: oklch(0.17 0 0); --hover: oklch(0.235 0 0);
  --fg: oklch(0.93 0 0); --muted: oklch(0.25 0 0); --muted-fg: oklch(0.68 0 0);
  --border: oklch(1 0 0 / 10%); --border-strong: oklch(1 0 0 / 18%); --input: oklch(1 0 0 / 15%);
  --accent: oklch(0.25 0.02 42); --coral-bg: oklch(0.28 0.05 42); --coral-text: oklch(0.85 0.08 42);
  --sb: oklch(0.15 0 0); --sb-accent: oklch(0.21 0 0); --sb-border: oklch(1 0 0 / 10%);
  --ok: oklch(0.77 0.14 145); --ok-bg: oklch(0.29 0.06 145); --ok-solido: oklch(0.55 0.14 140);
  --warn: oklch(0.82 0.13 80); --warn-bg: oklch(0.3 0.06 80); --warn-borde: oklch(0.6 0.1 70);
  --err: oklch(0.72 0.17 27); --err-bg: oklch(0.3 0.07 27);
  --info: oklch(0.77 0.1 250); --info-bg: oklch(0.3 0.05 250);
  --priv: oklch(0.82 0.09 295); --priv-bg: oklch(0.29 0.05 295);
  --neutro-bg: oklch(0.26 0.006 90); --neutro-text: oklch(0.85 0.008 90);
  --wa: oklch(0.75 0.13 155); --wa-bg: oklch(0.28 0.05 155);
  --tg: oklch(0.77 0.1 235); --tg-bg: oklch(0.27 0.04 235);
  --bezel: oklch(0.3 0 0); --bezel-edge: oklch(0.42 0 0); --notch: oklch(0.08 0 0);
  --dim: rgb(0 0 0 / 0.62);
  --shadow-1: 0 1px 2px oklch(0 0 0 / 40%);
  --shadow-2: 0 14px 36px -10px oklch(0 0 0 / 70%), 0 2px 6px oklch(0 0 0 / 40%);
  color-scheme: dark;
}
```

Reglas de los tokens:
- **No se usan colores literales fuera de este bloque.** Si hace falta un token nuevo, se agrega acá: claro en `:root`, y oscuro en los dos bloques oscuros, salvo que sea `--ob-*`. Cada constructor puede sumar los suyos con prefijo `--of-x-*` o `--ob-x-*`, y se avisan.
- `--primary-btn` y `--on-primary` quedan iguales en oscuro: 0.55 con blanco da 5,2:1. El valor de Sofía (0.6) da 4,2 y no se copia.
- Las pantallas de obra fijan `color-scheme: light` en sus marcos, así los controles nativos no se oscurecen.

### 1.2 Tipografía

Se usan DM Sans (400, 500, 600 y 700) y JetBrains Mono (400 y 500) con el `<link>` de §0. La mono va para horas, fechas en tablas, CUIL, hash, token, PIN de ejemplo y las etiquetas de la barra de la maqueta. Todos los números llevan `font-variant-numeric: tabular-nums`.

**Escala de la oficina (escritorio):**

| Uso | Tamaño, peso y alto de línea |
|---|---|
| Etiqueta mono en mayúsculas (barra, "Ejemplo") | 10.5–11px, 500, `letter-spacing:.06em` |
| Contador, chip | 11.5px, 600 |
| Encabezado de tabla | 11.5px, 600, `--muted-fg` |
| Meta y ayudas | 12–12.5px, 400, `--muted-fg` |
| Tabla, botones, ítems del riel | 13px, 500 en botones |
| Cuerpo | 14px/1.45, 400 |
| Título de tarjeta o diálogo | 15.5px, 600 |
| Título de panel o sección | 17px, 600 |
| Número de métrica | 26px, 700, `letter-spacing:-.02em` |
| H1 de página | 26px/1.15, 700, `-.02em`; baja a 22px en ≤ 760px |

**Escala de obra (celular y kiosco).** El mínimo es 15px, no se usa itálica y el texto que hay que leer no baja de 500:

| Uso | Tamaño |
|---|---|
| Secundario (`.ob-chico`) | 15px, 500, `--ob-mut` |
| Cuerpo | 17px/1.45, 400 |
| Botón | 17px, 600; el primario, 18px, 700 |
| H2 | 19–20px, 700 |
| H1 de pantalla | 24px/1.2, 700 |
| Número grande (neto, días) | 28px, 700 |
| Tecla del PIN | 28px, 600 (32px en el kiosco) |

**Espaciado:** 4, 8, 12, 16, 24 y 32. En obra, el espacio mínimo entre dos áreas táctiles es de 12px.

---

## 2. Componentes con su CSS de referencia

### 2.1 Base común `mq-` (la escribe la oficina)

```css
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--page);color:var(--fg);font:400 14px/1.45 var(--font);-webkit-font-smoothing:antialiased;overflow-x:hidden}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer}
:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
}

/* Contenedor externo: lleva el gutter y el safe-area */
.mq-maq{min-height:100dvh;display:flex;flex-direction:column;gap:12px;
  padding-left:max(16px, env(safe-area-inset-left, 0px));padding-right:max(16px, env(safe-area-inset-right, 0px));padding-block:12px 24px;min-width:0}
.mq-escenario{flex:1;min-width:0}
.mq-escenario[data-modo="dos"]{display:grid;grid-template-columns:minmax(0,1fr) 430px;gap:16px;align-items:start}
@media (max-width:1279px){.mq-escenario[data-modo="dos"]{display:block}}
.mq-vista{min-width:0}
.mq-falta{padding:40px 16px;text-align:center;color:var(--muted-fg);border:1.5px dashed var(--border-strong);border-radius:12px}

/* Utilidades */
.mq-ico{display:inline-block;flex-shrink:0;vertical-align:-0.2em}   /* el tamaño va por atributo (MAQ.ico) */
.mq-mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.mq-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.mq-ej{font:500 10.5px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted-fg);border:1px dashed var(--border-strong);border-radius:4px;padding:3px 5px;white-space:nowrap}

/* Barra de la maqueta */
.mq-barra{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;font-size:12.5px;min-width:0}
.mq-marca{display:flex;align-items:center;gap:8px;font-weight:600;margin-right:auto;min-width:0}
.mq-marca i{width:8px;height:8px;border-radius:2px;background:var(--primary)}
.mq-seg{display:inline-flex;border:1px solid var(--border-strong);border-radius:999px;overflow:hidden;background:var(--card);flex-shrink:0}
.mq-seg button{border:0;background:none;padding:5px 11px;font-size:12.5px;display:inline-flex;gap:6px;align-items:center;color:var(--muted-fg);min-height:30px}
.mq-seg button+button{border-left:1px solid var(--border)}
.mq-seg button[aria-pressed="true"]{background:var(--fg);color:var(--bg)}
.mq-sel{height:30px;max-width:100%;min-width:0;border:1px solid var(--border-strong);border-radius:999px;background:var(--card);padding:0 10px;font-size:12.5px}
@media (max-width:1279px){.mq-solo-ancho{display:none!important}}   /* el botón "Las dos" */

/* Botones */
.mq-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 13px;border-radius:var(--r);
  border:1px solid var(--border-strong);background:var(--card);color:var(--fg);font-size:13px;font-weight:500;white-space:nowrap;text-decoration:none;transition:background .12s,border-color .12s}
.mq-btn:hover:not(:disabled){background:var(--hover)}
.mq-btn:active:not(:disabled){transform:translateY(1px)}
.mq-btn:disabled{opacity:.5;cursor:not-allowed}
.mq-btn--prim{background:var(--primary-btn);border-color:var(--primary-btn);color:var(--on-primary)}
.mq-btn--prim:hover:not(:disabled){background:var(--primary-btn-hover)}
.mq-btn--fant{border-color:transparent;background:transparent}
.mq-btn--peligro{color:var(--err);border-color:color-mix(in oklch, var(--err) 40%, var(--border))}
.mq-btn--sm{height:28px;padding:0 9px;font-size:12px;border-radius:6px}
.mq-btn--ico{width:34px;padding:0}
.mq-btn--sm.mq-btn--ico{width:28px}

/* Tonos: sirven para chips, íconos de alerta y celdas */
.mq-t-ok{background:var(--ok-bg);color:var(--ok)}
.mq-t-warn{background:var(--warn-bg);color:var(--warn)}
.mq-t-err{background:var(--err-bg);color:var(--err)}
.mq-t-info{background:var(--info-bg);color:var(--info)}
.mq-t-priv{background:var(--priv-bg);color:var(--priv)}
.mq-t-prim{background:var(--coral-bg);color:var(--coral-text)}
.mq-t-neutro{background:var(--neutro-bg);color:var(--neutro-text)}
.mq-t-wa{background:var(--wa-bg);color:var(--wa)}
.mq-t-tg{background:var(--tg-bg);color:var(--tg)}

/* Chip y semáforo (el semáforo es un chip con ícono: el color NUNCA va solo) */
.mq-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;line-height:1;border-radius:999px;padding:4px 8px;white-space:nowrap;background:var(--neutro-bg);color:var(--neutro-text)}
.mq-chip .mq-ico{margin:-1px 0}

/* Toasts (fijos al viewport: sirven en los dos mundos) */
.mq-toasts{position:fixed;z-index:100;right:max(16px, env(safe-area-inset-right, 0px));bottom:16px;display:flex;flex-direction:column;gap:8px;width:min(360px, calc(100vw - 32px));pointer-events:none}
.mq-toast{--tono:var(--ok-solido);pointer-events:auto;display:flex;gap:10px;align-items:flex-start;padding:11px 12px;background:var(--card);color:var(--fg);
  border:1px solid var(--border);border-left:3px solid var(--tono);border-radius:10px;box-shadow:var(--shadow-2);font-size:13px;line-height:1.4;animation:mq-entra .18s ease-out}
.mq-toast--info{--tono:var(--info)} .mq-toast--aviso{--tono:var(--warn-borde)} .mq-toast--error{--tono:var(--err-solido)}
.mq-toast > .mq-ico{color:var(--tono);margin-top:1px}
.mq-toast-tx{flex:1;min-width:0}
.mq-toast-acc{display:block;margin-top:6px;padding:0;border:0;background:none;color:var(--coral-text);font-weight:600;font-size:12.5px;text-decoration:underline;text-underline-offset:3px}
.mq-toast-x{border:0;background:none;color:var(--muted-fg);width:28px;height:28px;display:grid;place-items:center;border-radius:6px;margin:-4px -4px 0 0}
.mq-toast-x:hover{background:var(--hover)}
@keyframes mq-entra{from{opacity:0;transform:translateY(6px)}}
@media (max-width:600px){.mq-toasts{top:12px;bottom:auto;left:50%;right:auto;transform:translateX(-50%)}}
```

**Barra de la maqueta.** Va en `#mq-barra`, en este orden. Los ids son estables:
1. `.mq-marca`: "AndamiosOS · RRHH", seguido de `<span class="mq-ej">Maqueta · datos de ejemplo</span>` y `<span class="mq-mono">vie 17/10/2026</span>`.
2. Modo, en `.mq-seg`: `#mq-modo-oficina` "Oficina", `#mq-modo-obra` "Obra" y `#mq-modo-dos` "Las dos" (este último lleva `.mq-solo-ancho`).
3. `<select class="mq-sel" id="mq-pantalla">` con `<optgroup label="Oficina">` (O1–O15) y `<optgroup label="Obra">` (M1–M10 y sus variantes; la lista está en §3.4). El valor es `"M3"` o `"M3|mauro"`.
4. Señal, en `.mq-seg` `#mq-senal`: botones `#mq-senal-si` "Con señal" y `#mq-senal-no` "Sin señal". Se ve sólo en los modos obra y dos.
5. Tema, en `.mq-seg`: `#mq-tema-auto`, `#mq-tema-claro` y `#mq-tema-oscuro`, cada uno con su ícono y un `aria-label`.
6. `#mq-reiniciar`, un `.mq-btn--fant.mq-btn--sm` con el texto "Reiniciar".

### 2.2 Oficina `of-`

**Marco de la app.** Es un riel de 52px que se abre a 248px al pasar el mouse o al recibir foco, un header de 56px y el contenido.

```css
.of-app{container:ofapp / inline-size;position:relative;isolation:isolate;display:flex;width:100%;height:max(600px, calc(100dvh - 110px));
  background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.of-riel{position:absolute;inset:0 auto 0 0;width:var(--riel-w);z-index:20;display:flex;flex-direction:column;background:var(--sb);color:var(--sb-fg);
  border-right:1px solid var(--sb-border);overflow:hidden;transition:width .15s ease}
.of-riel:is(:hover,:focus-within,[data-abierto="si"]){width:var(--riel-w-abierto);box-shadow:var(--shadow-2)}
.of-riel :focus-visible{outline-color:var(--sb-primary)}
.of-riel-logo{display:flex;align-items:center;gap:10px;height:var(--hd-h);padding:0 10px;flex-shrink:0;white-space:nowrap}
.of-riel-a{width:32px;height:32px;border-radius:8px;background:var(--primary);color:var(--on-primary);display:grid;place-items:center;font-weight:700;flex-shrink:0}
.of-riel-nom{font-weight:700;font-size:15px}
.of-riel-nom b{color:var(--sb-primary)}
.of-riel-nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:4px 8px 16px;scrollbar-width:none}
.of-riel-grupo{font-size:11px;color:var(--sb-muted);white-space:nowrap;padding:0 8px;height:0;opacity:0;overflow:hidden}
.of-riel:is(:hover,:focus-within,[data-abierto="si"]) .of-riel-grupo{height:auto;opacity:1;padding:12px 8px 4px}
.of-riel-it{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-height:32px;padding:6px 8px;border:0;border-radius:6px;background:none;color:var(--sb-fg);font-size:13px;text-align:left;white-space:nowrap}
.of-riel-it:hover{background:var(--sb-accent)}
.of-riel-it[aria-current="page"]{background:var(--sb-accent);color:var(--sb-primary);font-weight:600}
.of-riel-sub{display:none;padding-left:34px;font-size:12.5px}
.of-riel:is(:hover,:focus-within,[data-abierto="si"]) .of-riel-sub{display:flex}
.of-riel-nuevo{margin-left:6px;font-size:9.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--sb-primary);border:1px solid currentColor;border-radius:4px;padding:0 4px}
.of-riel-bdg{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--primary-btn);color:var(--on-primary);font-size:10.5px;font-weight:600;display:grid;place-items:center}
.of-riel:not(:hover):not(:focus-within):not([data-abierto="si"]) .of-riel-bdg{position:absolute;top:2px;left:22px;min-width:14px;height:14px;font-size:9px;padding:0 3px}
.of-velo{position:absolute;inset:0;z-index:19;background:var(--dim)}   /* sólo con el riel abierto en ≤ 760 */

.of-inset{flex:1;min-width:0;margin-left:var(--riel-w);display:flex;flex-direction:column}
.of-hd{height:var(--hd-h);flex-shrink:0;display:flex;align-items:center;gap:6px;padding:0 14px;border-bottom:1px solid var(--border);background:var(--bg)}
.of-menu-btn{display:none}
.of-migas{display:flex;align-items:center;gap:6px;min-width:0;font-size:13px;color:var(--muted-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.of-migas b{color:var(--fg);font-weight:600}
.of-buscar{margin-left:auto;display:flex;align-items:center;gap:8px;height:34px;min-width:220px;padding:0 10px;border:1px solid var(--border);border-radius:var(--r);background:var(--card);color:var(--muted-fg);font-size:13px}
.of-buscar kbd{margin-left:auto;font:500 10.5px/1 var(--mono);border:1px solid var(--border);border-radius:4px;padding:2px 4px}
.of-avatar{width:32px;height:32px;border-radius:50%;border:0;background:var(--primary-btn);color:var(--on-primary);font-size:12px;font-weight:600;display:grid;place-items:center;flex-shrink:0;margin-left:2px}
.of-main{flex:1;min-height:0;overflow:auto;padding:22px 24px 40px}

@container ofapp (max-width:760px){
  .of-riel{width:0;border-right:0}
  .of-riel[data-abierto="si"]{width:min(280px, 86%)}
  .of-inset{margin-left:0}
  .of-menu-btn{display:inline-grid}
  .of-hd{padding:0 8px;gap:2px}
  .of-buscar{min-width:0;width:34px;padding:0;justify-content:center;border:0;background:none}
  .of-buscar span,.of-buscar kbd{display:none}
  .of-main{padding:14px 14px 32px}
  .of-ph h1{font-size:22px}
}
```

**Contenido del riel.** Los grupos y los nombres son los de `src/lib/constants/navigation.ts`, copiados tal cual:
- **Dirección**: Dirección.
- **Comercial**: Asistente comercial, WhatsApp de clientes, Clientes, Parámetros de cotización.
- **Operaciones**: Obras, Ordenes de Trabajo, **Habilitaciones** (es la ruta de O7 y O8), Informes de obra, Mapa de Obras, Planificacion, con los subítems Tablero y **Hoja del día** (O9).
- **Gestorias**: Permisos de andamio.
- **Oficina Tecnica**: Computos, Modelador.
- **Deposito y Logistica**: Stock, Catalogo de Piezas, Movimientos, Remitos, Pañol.
- **Campo**: Partes de Obra, Solicitudes Extra, Incidentes, Inspecciones.
- **Personal y Flota**: Legajos, Fichadas, Vehiculos, Organigrama y el ítem nuevo **RRHH**, con el tag `.of-riel-nuevo` "Nuevo" y el badge de pendientes. Sus subítems son Tablero (O1), Personas (O2), Vencimientos (O5), Ausencias y vacaciones (O12), Recibos (O10), Comunicados (O11), Novedades del mes (O13), Altas y bajas (O14) y Mi espacio (O15).
- **Sistema**: Alertas, Configuracion.

Las pantallas O3 y O4 marcan Personas como activa. Los ítems de los otros módulos no navegan: muestran el toast `MAQ.toast("En la maqueta sólo está armado RRHH", {tipo:"info"})`.

**Header.** De izquierda a derecha:
- `#of-menu` (`.of-menu-btn.mq-btn--fant.mq-btn--ico`, ícono `menu`);
- `.of-migas`, por ejemplo "Personal y Flota › RRHH › **Tablero**";
- `.of-buscar` con "Buscar…" y la tecla ⌘K, que no hace nada;
- la campanita `#of-campana`;
- `#of-avatar` con las iniciales del usuario de la oficina (CB, LF, DO o JS).

El avatar abre un menú `.of-pop` con el nombre, el rol, "Mi espacio" y "Ver como: Carolina / Lucía / Daniela / JS", que es una comodidad de la maqueta.

**Encabezado de página y tarjetas de métrica:**

```css
.of-ph{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.of-ph h1{margin:0;font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-.02em;text-wrap:balance}
.of-ph p{margin:4px 0 0;color:var(--muted-fg);font-size:13.5px}
.of-ph-acc{display:flex;gap:8px;flex-wrap:wrap}
.of-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-card)}
.of-seccion{margin-top:22px}
.of-seccion > h2{margin:0 0 10px;font-size:17px;font-weight:600}

.of-metricas{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.of-metrica{--tono:var(--border-strong);position:relative;display:flex;flex-direction:column;gap:6px;padding:14px 14px 12px;background:var(--card);border:1px solid var(--border);border-radius:var(--r-card);min-width:0}
.of-metrica::before{content:"";position:absolute;left:-1px;top:12px;bottom:12px;width:3px;border-radius:0 3px 3px 0;background:var(--tono)}
.of-metrica[data-tono="ok"]{--tono:var(--ok-solido)} .of-metrica[data-tono="warn"]{--tono:var(--warn-borde)}
.of-metrica[data-tono="err"]{--tono:var(--err-solido)} .of-metrica[data-tono="info"]{--tono:var(--info)}
.of-metrica-lbl{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--muted-fg)}
.of-metrica-num{font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums}
.of-metrica-num small{font-size:14px;font-weight:500;color:var(--muted-fg);margin-left:4px}
.of-metrica-sub{font-size:12.5px;color:var(--muted-fg);line-height:1.4}
.of-metrica-sub b{color:var(--fg);font-weight:600}
.of-metrica-pie{margin-top:auto;padding-top:6px;display:flex;gap:6px;flex-wrap:wrap}
```

La tarjeta de métrica es un `<article>`, no un botón. Adentro lleva hasta dos `.mq-btn--sm`: el primero es "Ver" y abre la lista; el segundo es la acción propia de la tarjeta ("Pedir nómina al contador", "Reenviar por WhatsApp", "Ver destrabes").

**Tabla, filtros y formularios:**

```css
.of-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.of-q{position:relative;flex:1;min-width:180px;max-width:320px}
.of-q .mq-ico{position:absolute;left:9px;top:9px;color:var(--muted-fg)}
.of-q input{padding-left:30px}
.of-fchip{border:1px solid var(--border);background:var(--card);border-radius:999px;padding:5px 11px;font-size:12.5px;display:inline-flex;gap:6px;align-items:center;min-height:30px}
.of-fchip[aria-pressed="true"]{border-color:var(--fg);background:var(--fg);color:var(--bg)}
.of-fchip .of-ct{font-size:11px;font-variant-numeric:tabular-nums;opacity:.75}

.of-tabla-wrap{overflow-x:auto;max-width:100%;border:1px solid var(--border);border-radius:var(--r-card);background:var(--card)}
.of-tabla{width:100%;border-collapse:collapse;font-size:13px}
.of-tabla caption{caption-side:top;text-align:left;padding:10px 12px;font-size:12px;color:var(--muted-fg)}
.of-tabla th{text-align:left;font-size:11.5px;font-weight:600;color:var(--muted-fg);background:var(--muted);padding:9px 12px;white-space:nowrap}
.of-tabla td{padding:9px 12px;border-top:1px solid var(--border);vertical-align:middle;white-space:nowrap}
.of-tabla tbody tr:hover{background:var(--hover)}
.of-tabla tr[aria-selected="true"]{background:var(--accent)}
.of-tabla .of-num{text-align:right;font-variant-numeric:tabular-nums}
.of-tabla .of-larga{white-space:normal;min-width:220px}
.of-tabla tr.of-gris td{color:var(--muted-fg)}          /* p. ej. sin consentimiento en O8 */
.of-quien{display:flex;align-items:center;gap:10px;min-width:0}
.of-ini{width:28px;height:28px;border-radius:50%;background:var(--muted);color:var(--fg);font-size:11px;font-weight:600;display:grid;place-items:center;flex-shrink:0}
.of-quien b{display:block;font-weight:600}
.of-quien small{display:block;font-size:11.5px;color:var(--muted-fg)}
.of-link{border:0;background:none;padding:0;color:var(--coral-text);font-weight:600;text-decoration:underline;text-underline-offset:3px;font-size:inherit}

.of-campo{display:flex;flex-direction:column;gap:6px}
.of-lbl{font-size:12px;font-weight:600;color:var(--muted-fg)}
.of-in{width:100%;height:34px;border:1px solid var(--input);background:var(--card);border-radius:var(--r);padding:0 10px;font-size:13.5px}
textarea.of-in{height:auto;min-height:88px;padding:8px 10px;resize:vertical;line-height:1.45}
.of-in:focus-visible{outline:2px solid var(--ring);outline-offset:0;border-color:var(--ring)}
.of-in[aria-invalid="true"]{border-color:var(--err)}
.of-hint{font-size:12px;color:var(--muted-fg);margin:0}
.of-error{font-size:12px;color:var(--err);margin:0;font-weight:600}
.of-check{display:flex;gap:8px;align-items:flex-start;font-size:13px}
.of-check input{width:16px;height:16px;margin-top:2px;accent-color:var(--primary-btn)}
.of-grilla{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.of-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.of-kv > div{border:1px solid var(--border);border-radius:var(--r);padding:8px 10px;background:var(--bg)}
.of-kv span{display:block;font-size:11.5px;color:var(--muted-fg)}
.of-kv b{font-weight:600}
.of-pasos{display:flex;gap:4px;margin-bottom:14px}
.of-pasos > div{flex:1;min-width:0}
.of-pasos i{display:block;height:4px;border-radius:2px;background:var(--muted)}
.of-pasos > div[data-hecho] i,.of-pasos > div[aria-current="step"] i{background:var(--primary)}
.of-pasos span{display:block;margin-top:4px;font-size:11.5px;color:var(--muted-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.of-pasos > div[aria-current="step"] span{color:var(--fg);font-weight:600}
.of-aviso{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:var(--r);font-size:13px;line-height:1.45;border:1px solid color-mix(in oklch, currentColor 30%, transparent)}
.of-evidencia{margin:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 14px;font-size:12.5px}
.of-evidencia dt{color:var(--muted-fg)} .of-evidencia dd{margin:0;font-family:var(--mono);overflow-wrap:anywhere}
```

El aviso combina `.of-aviso` con un tono: `.of-aviso.mq-t-warn` es el cartel amarillo de O9 y `.mq-t-err` el rojo. Los semáforos que se usan en todos lados son estos:

| Estado | Marcado | Texto |
|---|---|---|
| Habilitado | `mq-chip mq-t-ok` + `check` | "Habilitado" / "Vigente hasta 14/03/2027" |
| Vence pronto | `mq-chip mq-t-warn` + `reloj` | "Vence 29/10" |
| Vencido o bloquea | `mq-chip mq-t-err` + `alerta` | "Vencido 02/10" / "No puede salir a obra" |
| A regularizar o sin datos | `mq-chip mq-t-neutro` + `menos` | "A regularizar" |
| Sensible | `mq-chip mq-t-priv` + `candado` | "Restringido" |
| No aplica (oficina) | sin chip | "—" en `--muted-fg` |
| Canal | `mq-t-wa` + `whatsapp` / `mq-t-tg` + `telegram` / `mq-t-neutro` + `kiosco` | "WhatsApp", "Telegram", "Kiosco" |

**Pestañas.** Siguen el patrón ARIA tablist con tabindex móvil y se manejan con las flechas izquierda/derecha, Inicio y Fin.

```css
.of-tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:14px;overflow-x:auto;scrollbar-width:none}
.of-tab{border:0;background:none;padding:8px 12px 9px;margin-bottom:-1px;border-bottom:2px solid transparent;font-size:13px;font-weight:500;color:var(--muted-fg);white-space:nowrap;display:inline-flex;gap:6px;align-items:center}
.of-tab:hover{color:var(--fg)}
.of-tab[aria-selected="true"]{color:var(--fg);border-bottom-color:var(--primary);font-weight:600}
.of-tab .of-ct{font-size:11px;background:var(--muted);border-radius:999px;padding:0 6px;font-variant-numeric:tabular-nums}
.of-tab[aria-selected="true"] .of-ct{background:var(--coral-bg);color:var(--coral-text)}
.of-tab--sensible .mq-ico{color:var(--priv)}
```

Los ids de las pestañas son `of-tab-<pantalla>-<clave>` (por ejemplo `of-tab-O3-sensible`) y los de los paneles, `of-panel-<pantalla>-<clave>`.

**Diálogo.** Se abre dentro de `.of-app`, no fijo a la ventana, y nunca se usan alert, confirm ni prompt.

```css
.of-capa{position:absolute;inset:0;z-index:60;display:grid;place-items:center;padding:16px;background:var(--dim)}
.of-dlg{width:min(560px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--card);color:var(--fg);border:1px solid var(--border);border-radius:var(--r-dlg);box-shadow:var(--shadow-2);animation:mq-entra .16s ease-out}
.of-dlg--ancho{width:min(880px,100%)}
.of-dlg-hd{display:flex;align-items:flex-start;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border)}
.of-dlg-hd h2{margin:0;font-size:15.5px;font-weight:600}
.of-dlg-hd p{margin:2px 0 0;font-size:12.5px;color:var(--muted-fg)}
.of-dlg-x{margin-left:auto}
.of-dlg-body{padding:14px 16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.of-dlg-ft{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--border)}
@container ofapp (max-width:760px){
  .of-capa{place-items:end stretch;padding:0}
  .of-dlg{width:100%;max-height:92%;border-radius:14px 14px 0 0}
}
```

Comportamiento del diálogo:
- Lleva `role="dialog"`, `aria-modal="true"` y `aria-labelledby` apuntando a su `h2`.
- Al abrirse, el foco va al primer control. El foco queda atrapado adentro, Escape lo cierra, y al cerrar el foco vuelve al botón que lo abrió.
- Las acciones destructivas o de registro se confirman en el mismo diálogo. Por ejemplo, la pestaña Sensible usa `.of-aviso.mq-t-priv` con "Tu lectura queda registrada" y el botón "Ver igual".
- Los diálogos que la propuesta pide son: O6 (Subir documento), la evidencia de una firma, "Mandar link por WhatsApp" (vista previa del mensaje armado), "Pedir nómina al contador" (el texto del mail con "Copiar texto"), "Destrabar" (motivo obligatorio), "Rechazar con motivo" y "Revisar disconformidad".

**Campanita:**

```css
.of-campana{position:relative}
.of-campana-n{position:absolute;top:3px;right:3px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--err-solido);color:var(--on-solido);font-size:10px;font-weight:700;line-height:1;display:grid;place-items:center}
.of-pop{position:absolute;top:calc(var(--hd-h) - 4px);right:12px;z-index:40;width:min(380px, calc(100% - 24px));max-height:calc(100% - 70px);display:flex;flex-direction:column;background:var(--card);border:1px solid var(--border);border-radius:var(--r-card);box-shadow:var(--shadow-2);overflow:hidden}
.of-pop-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600}
.of-pop-lista{overflow-y:auto;margin:0;padding:0;list-style:none}
.of-al{display:flex;gap:10px;width:100%;padding:10px 14px;border:0;border-bottom:1px solid var(--border);background:none;text-align:left;font-size:13px;line-height:1.4}
.of-al:hover{background:var(--hover)}
.of-al[data-leida="no"]{background:var(--accent)}
.of-al-ico{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}  /* + mq-t-* */
.of-al small{display:block;margin-top:2px;font-size:11.5px;color:var(--muted-fg)}
.of-pop-pie{padding:9px;text-align:center;font-size:12.5px}
```

- El botón es `#of-campana` (`.mq-btn--fant.mq-btn--ico`, ícono `campana`). Lleva `aria-label="Alertas, 3 sin leer"` y `aria-expanded`.
- La lista sale de `MAQ.estado.campanita[usuario]`. Al tocar un ítem se marca como leído y se ejecuta `MAQ.ir(item.ir, item.opts)`. Escape o un clic afuera la cierran.

### 2.3 Marcos de teléfono y de kiosco `mq-`

El CSS lo escribe la oficina, pero lo usa la obra.

```css
/* Teléfono */
.mq-tel{position:relative;display:flex;flex-direction:column;width:390px;max-width:100%;height:min(800px, calc(100dvh - 110px));min-height:620px;
  border:11px solid var(--bezel);outline:1px solid var(--bezel-edge);border-radius:46px;overflow:hidden;background:var(--ob-bg);color:var(--ob-fg);
  color-scheme:light;box-shadow:var(--shadow-2)}
.mq-tel::before{content:"";position:absolute;top:7px;left:50%;transform:translateX(-50%);width:92px;height:24px;border-radius:14px;background:var(--notch);z-index:12}
.mq-tel-status{flex-shrink:0;height:40px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 22px 6px;background:var(--ob-bg);color:var(--ob-fg);font:600 13px/1 var(--font)}
.mq-tel-status .mq-tel-der{display:inline-flex;gap:6px;align-items:center}
.mq-tel-sin{display:none;align-items:center;gap:4px;color:var(--ob-err-text)}
#vista-obra[data-senal="no"] .mq-tel-con{display:none}
#vista-obra[data-senal="no"] .mq-tel-sin{display:inline-flex}
.mq-tel-pantalla{flex:1;min-height:0;position:relative;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;background:var(--ob-bg)}
.mq-tel-home{flex-shrink:0;height:18px;display:grid;place-items:center;background:var(--ob-bg)}
.mq-tel-home::after{content:"";width:120px;height:4px;border-radius:2px;background:var(--ob-fg);opacity:.35}
@media (max-width:460px){
  .mq-tel{width:100%;height:max(560px, calc(100dvh - 130px));min-height:0;border:1px solid var(--border);outline:0;border-radius:16px;box-shadow:none}
  .mq-tel::before,.mq-tel-home{display:none}
  .mq-tel-status{height:30px;align-items:center;padding:0 14px}
}

/* Tablet del kiosco del pañol (apaisada; en angosto pasa a vertical) */
.mq-kiosco{display:flex;flex-direction:column;width:min(960px,100%);aspect-ratio:16 / 10;max-height:calc(100dvh - 110px);margin-inline:auto;
  border:18px solid var(--bezel);outline:1px solid var(--bezel-edge);border-radius:28px;overflow:hidden;background:var(--ob-bg);color:var(--ob-fg);color-scheme:light;box-shadow:var(--shadow-2)}
.mq-kiosco-barra{flex-shrink:0;height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 20px;background:var(--ob-kiosco-barra);color:var(--ob-bg);font:600 15px/1 var(--font)}
.mq-kiosco-pantalla{flex:1;min-height:0;overflow-y:auto;container:kiosco / inline-size;background:var(--ob-bg)}
@media (max-width:720px){.mq-kiosco{aspect-ratio:auto;height:max(600px, calc(100dvh - 130px));max-height:none;border-width:12px;border-radius:22px}}
.mq-escenario[data-modo="dos"] .mq-kiosco{aspect-ratio:auto;height:max(600px, calc(100dvh - 130px));border-width:12px;border-radius:22px}
@media (max-width:460px){.mq-kiosco{border:1px solid var(--border);outline:0;border-radius:16px;box-shadow:none}}
```

Markup fijo de la barra de estado. Es decorativa, y la hora la actualiza `MAQ.hora()` a través de `[data-mq-hora]`:

```html
<div class="mq-tel-status" aria-hidden="true">
  <span class="mq-mono" data-mq-hora>18:40</span>
  <span class="mq-tel-der">
    <span class="mq-tel-con">{ico senal 15}{ico wifi 15}</span>
    <span class="mq-tel-sin">{ico sin-senal 15} Sin señal</span>
    {ico bateria 15} 64%
  </span>
</div>
```

La barra del kiosco muestra a la izquierda "Kiosco del pañol · Depósito" y a la derecha `<span class="ob-kiosco-cierre" hidden>Se cierra en 0:58</span>`, seguido de la hora.

### 2.4 Obra `ob-`

El CSS va en el `<style>` del fragmento. **Todo selector empieza con `#vista-obra` o con una clase `.ob-`.** Nunca se escriben selectores de elemento sueltos, ni `:root`, ni `body`.

```css
/* Escena: dispositivo + nota explicativa de la maqueta */
#vista-obra .ob-escena{display:grid;grid-template-columns:auto minmax(0,340px);gap:28px;justify-content:center;align-items:start}
#vista-obra .ob-escena[data-marco="kiosco"]{grid-template-columns:minmax(0,960px)}
@media (max-width:900px){#vista-obra .ob-escena{grid-template-columns:minmax(0,1fr)} #vista-obra .ob-nota{order:-1}}
.mq-escenario[data-modo="dos"] #vista-obra .ob-escena{grid-template-columns:minmax(0,1fr)}
.ob-dispositivo{display:flex;justify-content:center;min-width:0}
/* La nota es "chrome" de la maqueta: usa los tokens de la oficina (sigue el tema) */
.ob-nota{background:var(--card);color:var(--fg);border:1px solid var(--border);border-radius:12px;padding:16px;font-size:13.5px;line-height:1.5;min-width:0}
.ob-nota h2{margin:0 0 4px;font-size:16px;font-weight:600}
.ob-nota p{margin:6px 0 0;color:var(--muted-fg)}
.ob-nota-var{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}

/* Pantalla */
#vista-obra .ob-pantalla{min-height:100%;display:flex;flex-direction:column;background:var(--ob-bg);color:var(--ob-fg);font:400 17px/1.45 var(--font)}
#vista-obra .ob-pantalla .mq-ico{stroke-width:2.5}
#vista-obra .ob-pantalla :focus-visible{outline:3px solid var(--ob-foco);outline-offset:3px}
.ob-cab{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;min-height:56px;padding:4px 10px;background:var(--ob-bg);border-bottom:1px solid var(--ob-linea)}
.ob-volver{display:inline-flex;align-items:center;gap:4px;min-height:48px;min-width:48px;padding:0 10px 0 4px;border:0;border-radius:12px;background:none;color:var(--ob-fg);font:600 16px/1 var(--font)}
.ob-marca{display:inline-flex;align-items:center;gap:8px;margin-left:auto;font:700 15px/1.2 var(--font)}
.ob-marca i{width:28px;height:28px;border-radius:7px;background:var(--ob-prim);color:var(--ob-on);display:grid;place-items:center;font-style:normal;font-size:12px}
.ob-sinsenal{display:none;gap:10px;align-items:flex-start;padding:12px 16px;background:var(--ob-off-bg);color:var(--ob-off-text);border-bottom:2px solid var(--ob-off-borde);font:600 15px/1.35 var(--font)}
#vista-obra[data-senal="no"] .ob-sinsenal{display:flex}
.ob-cuerpo{flex:1;padding:18px 18px 24px;display:flex;flex-direction:column;gap:14px}
.ob-h1{margin:0;font:700 24px/1.2 var(--font);letter-spacing:-.01em;text-wrap:balance}
.ob-h1:focus{outline:none}
.ob-h2{margin:6px 0 0;font:700 19px/1.25 var(--font)}
.ob-p{margin:0;font-size:17px;line-height:1.45}
.ob-chico{margin:0;font:500 15px/1.4 var(--font);color:var(--ob-mut)}
.ob-pie{position:sticky;bottom:0;z-index:5;margin-top:auto;padding:12px 18px 16px;background:var(--ob-bg);border-top:1px solid var(--ob-linea);display:flex;flex-direction:column;gap:10px}
.ob-lista{display:flex;flex-direction:column;gap:12px}

/* Botón grande */
.ob-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:12px 18px;border-radius:14px;border:2px solid var(--ob-borde);
  background:var(--ob-bg);color:var(--ob-fg);font:600 17px/1.25 var(--font);text-align:center;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ob-btn:active:not(:disabled){background:var(--ob-suave)}
.ob-btn--prim{min-height:64px;background:var(--ob-prim);border-color:var(--ob-prim);color:var(--ob-on);font-size:18px;font-weight:700}
.ob-btn--prim:active:not(:disabled){background:var(--ob-prim-hover);border-color:var(--ob-prim-hover)}
.ob-btn--ok{background:var(--ob-ok);border-color:var(--ob-ok);color:var(--ob-on)}
.ob-btn--peligro{background:var(--ob-err-bg);border-color:var(--ob-err);color:var(--ob-err-text)}
.ob-btn--sec{min-height:48px;border-color:transparent;background:transparent;text-decoration:underline;text-underline-offset:3px}
.ob-btn:disabled{background:var(--ob-suave);border-color:var(--ob-linea);color:var(--ob-mut);cursor:not-allowed}   /* sin opacity: tiene que seguir leyéndose */
.ob-btn--fila{justify-content:flex-start;text-align:left;min-height:68px;padding:12px 14px;gap:14px}
.ob-btn-tx{flex:1;min-width:0}
.ob-btn-tx small{display:block;font:500 15px/1.3 var(--font);color:var(--ob-mut)}
.ob-btn--prim .ob-btn-tx small,.ob-btn--ok .ob-btn-tx small{color:var(--ob-on)}
.ob-cont{min-width:30px;height:30px;padding:0 9px;border-radius:15px;background:var(--ob-prim);color:var(--ob-on);font:700 16px/1 var(--font);display:grid;place-items:center;flex-shrink:0}

/* Avisos y cola sin señal */
.ob-aviso{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;border:2px solid;font:500 16px/1.4 var(--font)}
.ob-aviso .mq-ico{flex-shrink:0;margin-top:1px}
.ob-aviso--ok{background:var(--ob-ok-bg);color:var(--ob-ok-text);border-color:var(--ob-ok)}
.ob-aviso--warn{background:var(--ob-warn-bg);color:var(--ob-warn-text);border-color:var(--ob-warn-borde)}
.ob-aviso--err{background:var(--ob-err-bg);color:var(--ob-err-text);border-color:var(--ob-err)}
.ob-aviso--info{background:var(--ob-info-bg);color:var(--ob-info-text);border-color:var(--ob-info-text)}
.ob-cola{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:var(--ob-off-bg);color:var(--ob-off-text);border:1px solid var(--ob-off-borde);font:600 15px/1.2 var(--font)}

/* Lista de opciones grandes (radio) */
.ob-opciones{display:flex;flex-direction:column;gap:12px;margin:0;padding:0;border:0}
.ob-opciones--2{display:grid;grid-template-columns:1fr 1fr}
.ob-op{display:grid;grid-template-columns:28px minmax(0,1fr) 26px;align-items:center;gap:12px;width:100%;min-height:64px;padding:12px 14px;
  border:2px solid var(--ob-borde);border-radius:14px;background:var(--ob-bg);color:var(--ob-fg);text-align:left;font:600 17px/1.3 var(--font)}
.ob-op small{display:block;font:500 15px/1.3 var(--font);color:var(--ob-mut)}
.ob-op-marca{width:26px;height:26px;border-radius:50%;border:2px solid currentColor;display:grid;place-items:center}
.ob-op-marca .mq-ico{visibility:hidden}
.ob-op[aria-checked="true"]{background:var(--ob-fg);border-color:var(--ob-fg);color:var(--ob-bg)}
.ob-op[aria-checked="true"] small{color:var(--ob-bg)}
.ob-op[aria-checked="true"] .ob-op-marca{background:var(--ob-bg);color:var(--ob-fg);border-color:var(--ob-bg)}
.ob-op[aria-checked="true"] .ob-op-marca .mq-ico{visibility:visible}

/* Resumen y montos */
.ob-resumen{margin:0;border:2px solid var(--ob-linea);border-radius:14px;overflow:hidden}
.ob-resumen > div{display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:12px 14px;border-top:1px solid var(--ob-linea)}
.ob-resumen > div:first-child{border-top:0}
.ob-resumen dt{font:500 15px/1.3 var(--font);color:var(--ob-mut)}
.ob-resumen dd{margin:0;font-weight:600;text-align:right}
.ob-monto{font:700 28px/1.1 var(--font);font-variant-numeric:tabular-nums}
.ob-ficticio{font:500 12px/1 var(--mono);letter-spacing:.05em;text-transform:uppercase;color:var(--ob-mut);border:1px dashed var(--ob-firma-borde);border-radius:4px;padding:3px 5px}

/* PIN del pañol */
.ob-pin{display:flex;flex-direction:column;align-items:center;gap:18px}
.ob-pin-puntos{display:flex;gap:18px}
.ob-pin-puntos i{width:20px;height:20px;border-radius:50%;border:2px solid var(--ob-fg)}
.ob-pin-puntos i[data-lleno]{background:var(--ob-fg)}
.ob-pin[data-error] .ob-pin-puntos i{border-color:var(--ob-err)}
.ob-pin[data-error] .ob-pin-puntos i[data-lleno]{background:var(--ob-err)}
.ob-pin-msj{min-height:24px;margin:0;text-align:center;font:600 16px/1.35 var(--font);color:var(--ob-err-text)}
.ob-pin-teclas{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%;max-width:320px}
.ob-pin-teclas button{min-height:64px;border-radius:14px;border:2px solid var(--ob-linea);background:var(--ob-suave);color:var(--ob-fg);font:600 28px/1 var(--font);font-variant-numeric:tabular-nums}
.ob-pin-teclas button:active{background:var(--ob-linea)}
.ob-pin-teclas .ob-pin-borrar{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:15px}

/* Firma con el dedo */
.ob-firma{position:relative}
.ob-firma-lienzo{display:block;width:100%;height:200px;border:2px dashed var(--ob-firma-borde);border-radius:14px;background:var(--ob-firma-bg);touch-action:none;cursor:crosshair}
.ob-firma::after{content:"";position:absolute;left:20px;right:20px;bottom:46px;border-bottom:2px solid var(--ob-linea);pointer-events:none}
.ob-firma-guia{position:absolute;left:20px;bottom:16px;font:500 15px/1 var(--font);color:var(--ob-mut);pointer-events:none}
.ob-firma[data-firmado] .ob-firma-guia{visibility:hidden}

/* Reproductor de audio DETENIDO (nunca arranca solo) */
.ob-audio{display:grid;grid-template-columns:56px minmax(0,1fr);gap:10px 14px;align-items:center;padding:14px;border-radius:14px;background:var(--ob-suave);border:2px solid var(--ob-linea)}
.ob-audio-play{width:56px;height:56px;border-radius:50%;border:2px solid var(--ob-fg);background:var(--ob-bg);color:var(--ob-fg);display:grid;place-items:center}
.ob-audio-tx b{display:block;font:700 17px/1.25 var(--font)}
.ob-audio-tx span{font:500 15px/1.3 var(--font);color:var(--ob-mut)}
.ob-audio-pista{grid-column:1 / -1;display:flex;align-items:center;gap:10px}
.ob-audio-barra{flex:1;height:8px;border-radius:4px;background:var(--ob-linea);overflow:hidden}
.ob-audio-barra i{display:block;height:100%;width:0;background:var(--ob-fg)}
.ob-audio-t{font:500 15px/1 var(--mono);font-variant-numeric:tabular-nums;color:var(--ob-mut)}
.ob-audio[data-estado="escuchado"] .ob-audio-play{background:var(--ob-ok);border-color:var(--ob-ok);color:var(--ob-on)}
.ob-transcripcion{margin:0;padding:12px 14px;border-radius:12px;background:var(--ob-suave);font-size:16px}

/* "Mis papeles": tarjeta para mostrar en el portón */
.ob-porton{border:3px solid var(--ob-ok);border-radius:18px;overflow:hidden;background:var(--ob-bg)}
.ob-porton[data-estado="err"]{border-color:var(--ob-err)}
.ob-porton-cab{display:flex;gap:12px;align-items:center;padding:14px;background:var(--ob-suave)}
.ob-porton-ini{width:56px;height:56px;border-radius:50%;background:var(--ob-fg);color:var(--ob-bg);display:grid;place-items:center;font:700 20px/1 var(--font);flex-shrink:0}
.ob-porton-cab b{display:block;font:700 22px/1.2 var(--font)}
.ob-porton-cab span{font:500 15px/1.3 var(--font);color:var(--ob-mut)}
.ob-porton-fila{display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;align-items:center;padding:12px 14px;border-top:1px solid var(--ob-linea)}
.ob-porton-est{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--ob-ok);color:var(--ob-on)}
.ob-porton-fila[data-estado="err"] .ob-porton-est{background:var(--ob-err)}
.ob-porton-fila[data-estado="warn"] .ob-porton-est{background:var(--ob-warn-borde);color:var(--ob-fg)}
.ob-porton-fila b{display:block;font:700 19px/1.25 var(--font)}
.ob-porton-fila span{font:500 16px/1.3 var(--font)}
.ob-porton-pie{padding:10px 14px;border-top:1px solid var(--ob-linea);font:500 15px/1.3 var(--font);color:var(--ob-mut)}

/* Constancia final */
.ob-sello{width:88px;height:88px;border-radius:50%;background:var(--ob-ok);color:var(--ob-on);display:grid;place-items:center;margin:24px auto 8px}

/* Chat de WhatsApp (y variante Telegram) */
.ob-wa{display:flex;flex-direction:column;min-height:100%;background:var(--ob-wa-bg);color:var(--ob-fg);font:400 15.5px/1.4 var(--font)}
.ob-wa-cab{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;min-height:56px;padding:6px 10px;background:var(--ob-wa-cab);border-bottom:1px solid var(--ob-linea)}
.ob-wa-av{width:38px;height:38px;border-radius:50%;background:var(--ob-prim);color:var(--ob-on);display:grid;place-items:center;font:700 12px/1 var(--font);flex-shrink:0}
.ob-wa-cab b{display:block;font:600 16px/1.2 var(--font)}
.ob-wa-cab small{display:block;font-size:13px;color:var(--ob-mut)}
.ob-wa-chat{flex:1;padding:12px 10px;display:flex;flex-direction:column;gap:6px}
.ob-wa-dia{align-self:center;padding:3px 10px;border-radius:7px;background:var(--ob-wa-in);font:500 13px/1.3 var(--font);color:var(--ob-mut)}
.ob-wa-b{max-width:86%;padding:7px 10px 5px;border-radius:10px;box-shadow:var(--ob-sombra);overflow-wrap:anywhere}
.ob-wa-b--in{align-self:flex-start;background:var(--ob-wa-in);border-top-left-radius:3px}
.ob-wa-b--out{align-self:flex-end;background:var(--ob-wa-out);border-top-right-radius:3px}
.ob-wa-h{display:block;text-align:right;font-size:12px;color:var(--ob-mut);margin-top:2px;font-variant-numeric:tabular-nums}
.ob-wa-link{display:block;width:100%;min-height:44px;margin-top:6px;padding:8px 10px;border:0;border-radius:8px;background:var(--ob-wa-cab);color:var(--ob-wa-link);text-align:left;font:600 15px/1.3 var(--font);text-decoration:underline;text-underline-offset:3px}
.ob-wa-link small{display:block;text-decoration:none;font-weight:500;font-size:13px;color:var(--ob-mut)}
.ob-wa-comp{position:sticky;bottom:0;display:flex;gap:8px;align-items:center;padding:8px;background:var(--ob-wa-cab)}
.ob-wa-comp input{flex:1;min-width:0;height:40px;border-radius:20px;border:1px solid var(--ob-linea);background:var(--ob-bg);padding:0 14px;font-size:15px}
.ob-wa--tg{background:var(--ob-tg-bg)}
.ob-wa--tg .ob-wa-b--out{background:var(--ob-tg-out)}
.ob-wa--tg .ob-wa-link{color:var(--ob-tg)}

/* Kiosco: más grande y en dos columnas cuando hay ancho */
.mq-kiosco .ob-btn{min-height:64px;font-size:19px}
.mq-kiosco .ob-pin-teclas{max-width:380px}
.mq-kiosco .ob-pin-teclas button{min-height:72px;font-size:32px}
.ob-kiosco-dos{display:grid;grid-template-columns:minmax(0,1fr);gap:24px}
@container kiosco (min-width:700px){.ob-kiosco-dos{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}}
```

**Reglas visuales de obra:**
- Hay una sola acción principal por pantalla, en `.ob-pie`, y es la única `.ob-btn--prim`. Las demás son `.ob-btn` o `.ob-btn--sec`.
- El área táctil mínima es de 56px de alto. "Volver" y las teclas tienen 48 × 48 como mínimo.
- El texto que hay que leer va en `--ob-fg`, y `--ob-mut` queda para lo secundario (los dos dan ≥ 7:1). No se baja la opacidad del texto, ni siquiera en los botones deshabilitados.
- **No hay movimiento:** ni transiciones ni animaciones en las pantallas de obra (el CSS de arriba no tiene ninguna). Nada se reproduce solo.
- **Sin señal:** el banner `.ob-sinsenal` va debajo de `.ob-cab` y dice: "**Sin señal.** Lo que hagas se manda cuando vuelva." Según la acción:
  - "Entendido", "Hoy no voy" y el pedido de vacaciones quedan en cola, con `.ob-cola` y el ícono `reloj`: "Se manda cuando vuelva la señal".
  - El recibo, los certificados, el PDF y el audio necesitan conexión. Se muestra `.ob-aviso--warn`: "Para abrir el recibo necesitás señal. Probá de nuevo cuando tengas."
  - "Mis papeles" se ve igual, con el pie "Guardado en el celular · actualizado vie 17/10 07:10".
- Las listas de motivos usan íconos más texto, nunca sólo el ícono.

### 2.5 Referencias de JS para obra

**Firma con el dedo.** Hay que llamar a `medir()` cuando la sección ya está visible, porque un canvas oculto mide 0.

```js
function firmaLienzo(canvas, alCambiar) {
  const ctx = canvas.getContext("2d"); let dib = false, ult = null, largo = 0;
  const tinta = () => getComputedStyle(canvas).getPropertyValue("--ob-firma-tinta").trim() || "#111";
  function medir() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = tinta();
    largo = 0; alCambiar(false);
  }
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener("pointerdown", e => { dib = true; ult = pos(e); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => {
    if (!dib) return; const p = pos(e);
    ctx.beginPath(); ctx.moveTo(ult[0], ult[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
    largo += Math.hypot(p[0] - ult[0], p[1] - ult[1]); ult = p; if (largo > 60) alCambiar(true);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => canvas.addEventListener(t, () => { dib = false; }));
  function ejemplo() { /* firma de ejemplo para teclado o lector de pantalla */
    medir(); const w = canvas.getBoundingClientRect().width; ctx.beginPath(); ctx.moveTo(24, 140);
    for (let x = 24; x < w - 24; x += 6) ctx.lineTo(x, 130 - Math.sin(x / 14) * 18 - (x % 40 < 6 ? 14 : 0));
    ctx.stroke(); largo = 999; alCambiar(true);
  }
  return { medir, borrar: medir, ejemplo, firmado: () => largo > 60 };
}
```

- El canvas lleva `id="ob-firma-M3"` (o `-M9`, `-M10`), `role="img"` y `aria-label="Recuadro para firmar con el dedo"`.
- Abajo van dos botones `.ob-btn--sec`: "Borrar y firmar de nuevo" y "Usar firma de ejemplo". El segundo existe porque la maqueta tiene que poder recorrerse con teclado.
- `.ob-btn--prim` "Listo, firmar" queda deshabilitado hasta que `firmado()` dé verdadero.

**PIN:**
- Usa la tecla `#ob-pin-<pantalla>-<dígito>`. El PIN de ejemplo es **4821** y se muestra en `.ob-nota`, nunca dentro del celular.
- Valida solo al cuarto dígito. Si es incorrecto, pone `data-error`, muestra "Ese PIN no es. Te quedan 2 intentos." (con `aria-live="assertive"`) y vacía los puntos. No hay animación de sacudida.
- Mientras se ve el paso del PIN, acepta las teclas 0–9 y Retroceso, siempre que el foco esté dentro de `#vista-obra`.

**Audio:**
- `data-estado` pasa por `detenido`, `sonando`, `pausado` y `escuchado`. Arranca en `detenido`, con "Tocá para escuchar · 40 segundos · voz de Joaquín (JS)".
- La reproducción se simula con un `setInterval` de 1 s que sólo arranca con un toque; no hay archivo de audio. Al llegar a 40 s pasa a `escuchado`.
- El botón alterna su `aria-label` entre "Escuchar" y "Pausar". Debajo, siempre visible, va `.ob-transcripcion` con "Lo que dice el audio: …".

---

## 3. Convivencia y API `window.MAQ`

### 3.1 Reglas para no pisarse

| | Oficina (archivo principal) | Obra (fragmento) |
|---|---|---|
| Clases | `of-*`; además define todo `mq-*` | `ob-*`; usa `mq-tel*`, `mq-kiosco*`, `mq-ico` y `mq-btn` (este último sólo en `.ob-nota`) |
| Ids | `of-*`, más `mq-*` para la barra, los toasts y la vista | `ob-*`, y siempre con la pantalla adentro: `ob-M3-firmar`, `ob-firma-M3`, `ob-pin-M3-4` |
| Tokens nuevos | `--of-x-*`, avisando | `--ob-x-*`, definidos dentro de `#vista-obra {}` y sin colores literales nuevos (se arman con los tokens del contrato) |
| CSS | puede escribir la base global de §2.1 | todo selector empieza con `#vista-obra` o `.ob-` |
| JS | variables globales permitidas sólo bajo `MAQ` | todo dentro de un IIFE `(function(){ "use strict"; … })();`, sin globales |
| Delegación de eventos | `data-of-acc="…"`, escuchando en `#vista-oficina`, `#mq-barra` y `.of-capa` | `data-ob-acc="…"`, escuchando sólo en `#vista-obra` |
| Teclado | Escape cierra el diálogo o popover de la oficina, si hay uno abierto | Los dígitos del PIN sólo cuentan si `document.activeElement` está dentro de `#vista-obra` |
| `localStorage` | sólo el núcleo, con la clave `rrhh-maqueta:v1` | **no lo usa** |
| Capas (z-index) | riel 20, velo 19, popover 40, diálogo 60 | dentro del marco, 10 como máximo; la muesca del teléfono va en 12 |
| Toasts | `MAQ.toast` | `MAQ.toast`; la obra no arma toasts propios |

### 3.2 Estructura del fragmento de obra

```html
<!-- FRAGMENTO DE OBRA · desde acá -->
<style>/* sólo #vista-obra y .ob-* (§2.4) */</style>
<div class="ob-escena" id="ob-escena" data-marco="tel">
  <div class="ob-dispositivo">
    <div class="mq-tel" id="ob-tel">
      <div class="mq-tel-status" aria-hidden="true">…(§2.3)…</div>
      <div class="mq-tel-pantalla" id="ob-tel-pantalla">
        <section class="ob-pantalla" data-pantalla="M1" data-marco="tel" aria-labelledby="ob-M1-h" hidden>…</section>
        <!-- … M2 a M8, cada una con data-marco="tel" -->
      </div>
      <div class="mq-tel-home" aria-hidden="true"></div>
    </div>
    <div class="mq-kiosco" id="ob-kiosco" hidden>
      <div class="mq-kiosco-barra">…</div>
      <div class="mq-kiosco-pantalla" id="ob-kiosco-pantalla">
        <section class="ob-pantalla" data-pantalla="M9" data-marco="kiosco" aria-labelledby="ob-M9-h" hidden>…</section>
        <section class="ob-pantalla" data-pantalla="M10" data-marco="kiosco" aria-labelledby="ob-M10-h" hidden>…</section>
      </div>
    </div>
  </div>
  <aside class="ob-nota" id="ob-nota" aria-live="polite"><!-- qué es esta pantalla, persona, variantes, "Ver en la oficina" --></aside>
</div>
<script>
(function () {
  "use strict";
  const M = window.MAQ;
  M.registrar("obra", {
    mostrar(id, opts) { /* ver abajo */ },
    reiniciar() { /* vuelve los pasos internos al inicio */ },
  });
  window.addEventListener("maq:cambio", e => { /* re-render de lo que dependa de e.detail.clave */ });
})();
</script>
<!-- FRAGMENTO DE OBRA · hasta acá -->
```

- Cada pantalla tiene un `<h1 class="ob-h1" id="ob-M3-h" tabindex="-1">`.
- Los pasos internos son `<div class="ob-paso" data-paso="resumen|elegir|pin|firma|listo" hidden>`. Los maneja la obra, y `MAQ.ir` no se mete con ellos.
- `mostrar(id, opts)` hace cuatro cosas:
  1. alterna `#ob-tel` y `#ob-kiosco` según el `data-marco` de la sección;
  2. pone el mismo valor en `#ob-escena[data-marco]`;
  3. lleva la pantalla al primer paso (o a `opts.paso`);
  4. actualiza `.ob-nota`.

### 3.3 La API

`window.MAQ` existe antes de que se parsee cualquier markup. Esto es todo lo que expone:

| Miembro | Firma | Qué hace |
|---|---|---|
| `MAQ.estado` | objeto (§3.5) | Sólo para leer. **Nadie escribe directo**: se escribe con `set` o con `acciones`. |
| `MAQ.get(ruta)` | `"recibos.porPersona.ramiro.estado"` → valor | Lee por ruta con puntos. |
| `MAQ.set(ruta, valor, origen)` | `origen`: `"oficina"`, `"obra"` o `"maqueta"` | Escribe y dispara `maq:cambio`. Devuelve el valor. |
| `MAQ.acciones.<nombre>(…)` | §3.6 | Cambios de negocio: tocan varias claves, avisan a la campanita y disparan **un** `maq:cambio` con `accion`. **Es la vía principal para que la obra le avise a la oficina.** |
| `MAQ.ir(id, opts)` | `id` entre `"O1"…"O15"` y `"M1"…"M10"`; `opts`: `{persona?, variante?, paso?, foco?}` | Muestra la pantalla y cambia de modo si hace falta (detalle abajo). |
| `MAQ.toast(texto, op)` | `op`: `{tipo:"ok"\|"info"\|"aviso"\|"error", accion?:{texto, ir, opts}, dur?:4500}` | Toast en `#mq-toasts`, con tres visibles como máximo. El texto se carga con `textContent`. |
| `MAQ.avisar(item)` | `{para:"carolina"\|"daniela"\|"js"\|"lucia", tipo, ico, texto, ir, opts}` | Agrega un ítem sin leer a la campanita y dispara `maq:cambio` con `clave:"campanita"`. |
| `MAQ.hora(min = 1)` | → `"18:42"` | Adelanta el reloj de la maqueta `min` minutos (arranca a las 18:40 del 17/10), actualiza los `[data-mq-hora]` y devuelve la hora. `MAQ.hora(0)` sólo la lee. |
| `MAQ.fecha()` | → `"17/10"` | |
| `MAQ.ico(nombre, tam = 16, clase = "")` | → string SVG | Los íconos de §4. |
| `MAQ.senal(bool)` | | `set("senal", bool)`, más `#vista-obra[data-senal]` y la barra. |
| `MAQ.tema(v)` | `"auto"`, `"light"` o `"dark"` | Pone o saca `data-theme` en `<html>` y lo guarda. |
| `MAQ.modo` | sólo lectura: `"oficina"`, `"obra"` o `"dos"` | |
| `MAQ.actual` | sólo lectura: `{oficina:"O1", obra:"M2"}` | La última pantalla de cada mundo. |
| `MAQ.pantallas` | §3.4 | El catálogo. |
| `MAQ.registrar(mundo, hooks)` | `mundo`: `"oficina"` u `"obra"`; `hooks`: `{mostrar(id, opts), reiniciar()}` | |
| `MAQ.listo(fn)` | | Ejecuta `fn` después de `_arrancar`, o enseguida si ya arrancó. |
| `MAQ.reiniciar()` | | Vuelve el estado al inicial y la hora a 18:40, llama a los `reiniciar()` de los dos mundos, dispara `maq:reiniciar` y va a `O1`. |
| `MAQ._arrancar()` | sólo la oficina, una vez, al final | Restaura la pantalla guardada (o `O1`), marca el arranque, ejecuta la cola de `listo` y dispara `maq:listo`. |

**Eventos.** Todos se disparan en `window` como `CustomEvent`:
- `maq:cambio`, con `detail: { clave, valor, anterior, origen, accion? }`. Cuando viene de una acción, `clave` es el área (`"recibos"`, `"comunicados"`, `"ausencias"`, `"vacaciones"`, `"epp"`, `"habilitacion"`, `"nomina"`, `"chats"`, `"campanita"`, `"persona"`, `"usuario"`, `"senal"`) y `accion` es el nombre de la acción.
- `maq:pantalla`, con `detail: { id, mundo, opts }`.
- `maq:listo`, sin detalle.
- `maq:reiniciar`, sin detalle.

Cada mundo vuelve a dibujar lo suyo cuando llega un `maq:cambio`. La oficina, por ejemplo, actualiza O1, O3, O10 o la campanita si `clave` es `"recibos"`.

**`MAQ.ir(id, opts)`:**
1. Busca `PANTALLAS[id]`. Si no existe, muestra `console.warn` y termina.
2. Calcula el modo: si `MAQ.modo === "dos"` y la ventana mide 1280px o más, sigue en `"dos"`; si no, pasa a `PANTALLAS[id].mundo`. En `"dos"` se ven las dos vistas. En los otros modos, `#vista-oficina.hidden` y `#vista-obra.hidden` se alternan, `#mq-escenario[data-modo]` se actualiza y también los `aria-pressed` de la barra.
3. Persona: si viene `opts.persona` u otra por defecto, ejecuta `MAQ.set("persona", …, "maqueta")` (obra). Para la oficina hace lo mismo con `usuario`.
4. Obra: oculta todas las `#vista-obra .ob-pantalla`, muestra la de `data-pantalla="id"` y llama a `hooks.obra.mostrar(id, opts)`. Lleva el `scrollTop` de `#ob-tel-pantalla` o de `#ob-kiosco-pantalla` a 0. Si `opts.foco !== false`, pone el foco en el `h1` de la sección. Si la sección no existe, muestra `.mq-falta`.
   Oficina: llama a `hooks.oficina.mostrar(id, opts)`; la oficina dibuja y enfoca su `h1`.
5. Actualiza `MAQ.actual[mundo]` y el `<select id="mq-pantalla">`, guarda `{pantalla:id, opts, modo, tema}` y dispara `maq:pantalla`.

**Cómo avisa la obra a la oficina, con un ejemplo.** La obra no toca el DOM de la oficina ni llama a sus funciones. Hace esto:

```js
// en M3, al confirmar la firma:
const r = MAQ.acciones.firmarRecibo("ramiro", { conforme: true, via: "link" });
// r = { hora: "18:42", fecha: "17/10" } → la obra lo usa en la constancia: "Firmado el 17/10 a las 18:42. Te queda guardado."
```

Dentro de la acción, el núcleo:
1. pasa a Ramiro de `abierto` a `conforme`;
2. ajusta el conteo (34 conformes y 4 abiertos; las firmas pendientes bajan de 9 a 8);
3. ejecuta `MAQ.avisar({para:"carolina", tipo:"ok", ico:"firma", texto:"Ramiro Ledesma firmó el recibo de septiembre (conforme) · 18:42", ir:"O3", opts:{persona:"ramiro", tab:"recibos"}})`;
4. dispara `maq:cambio` con `{clave:"recibos", accion:"firmarRecibo", origen:"obra", valor:{persona:"ramiro", …}}`;
5. si `MAQ.modo === "obra"`, muestra además el toast: `MAQ.toast("En la oficina ya ven que Ramiro firmó.", {tipo:"info", accion:{texto:"Ver en la oficina", ir:"O10"}})`.

Al revés funciona igual: la oficina ejecuta `MAQ.acciones.resolverVacaciones("v1", {aprobado:false, motivo:"…", por:"daniela"})`, y M6 muestra el motivo la próxima vez que se dibuja o enseguida si está a la vista.

### 3.4 Catálogo de pantallas (`MAQ.pantallas`)

```js
const PANTALLAS = {
  O1:  { mundo: "oficina", titulo: "Tablero de RRHH", usuario: "carolina", migas: ["Personal y Flota", "RRHH", "Tablero"] },
  O2:  { mundo: "oficina", titulo: "Personas", usuario: "carolina", migas: ["Personal y Flota", "RRHH", "Personas"] },
  O3:  { mundo: "oficina", titulo: "Ficha de Ramiro Ledesma (obra)", usuario: "carolina", persona: "ramiro", migas: ["Personal y Flota", "RRHH", "Personas", "Ramiro Ledesma"] },
  O4:  { mundo: "oficina", titulo: "Ficha de Lucía Ferraro (oficina)", usuario: "carolina", persona: "lucia", migas: ["Personal y Flota", "RRHH", "Personas", "Lucía Ferraro"] },
  O5:  { mundo: "oficina", titulo: "Vencimientos", usuario: "carolina", migas: ["Personal y Flota", "RRHH", "Vencimientos"] },
  O6:  { mundo: "oficina", titulo: "Subir documento (diálogo)", usuario: "carolina", sobre: "O5", migas: ["Personal y Flota", "RRHH", "Vencimientos"] },
  O7:  { mundo: "oficina", titulo: "Control contra la Nómina ART", usuario: "carolina", migas: ["Operaciones", "Habilitaciones", "Fachada Av. Cabildo 2350"] },
  O8:  { mundo: "oficina", titulo: "Carpeta completa por comitente", usuario: "carolina", migas: ["Operaciones", "Habilitaciones", "Torre Parque Chas"] },
  O9:  { mundo: "oficina", titulo: "Hoja del día con habilitación", usuario: "daniela", variantes: ["advertencia", "bloqueo"], migas: ["Operaciones", "Planificacion", "Hoja del día"] },
  O10: { mundo: "oficina", titulo: "Recibos del mes", usuario: "carolina", variantes: ["estado", "paso1", "paso2", "paso3"], migas: ["Personal y Flota", "RRHH", "Recibos"] },
  O11: { mundo: "oficina", titulo: "Comunicados", usuario: "carolina", migas: ["Personal y Flota", "RRHH", "Comunicados"] },
  O12: { mundo: "oficina", titulo: "Ausencias y vacaciones", usuario: "carolina", migas: ["Personal y Flota", "RRHH", "Ausencias y vacaciones"] },
  O13: { mundo: "oficina", titulo: "Novedades del mes para el contador", usuario: "carolina", migas: ["Personal y Flota", "RRHH", "Novedades del mes"] },
  O14: { mundo: "oficina", titulo: "Altas y bajas", usuario: "carolina", migas: ["Personal y Flota", "RRHH", "Altas y bajas"] },
  O15: { mundo: "oficina", titulo: "Mi espacio (Lucía Ferraro)", usuario: "lucia", migas: ["Personal y Flota", "RRHH", "Mi espacio"] },
  M1:  { mundo: "obra", marco: "tel", titulo: "El mensaje que llega por WhatsApp", persona: "ramiro", variantes: ["whatsapp", "telegram", "comunicado"] },
  M2:  { mundo: "obra", marco: "tel", titulo: "Inicio del link", persona: "ramiro" },
  M3:  { mundo: "obra", marco: "tel", titulo: "Firmar el recibo", persona: "ramiro", variantes: ["ramiro", "mauro"] },
  M4:  { mundo: "obra", marco: "tel", titulo: "Comunicado con «Entendido»", persona: "ramiro" },
  M5:  { mundo: "obra", marco: "tel", titulo: "«Hoy no voy»", persona: "ramiro" },
  M6:  { mundo: "obra", marco: "tel", titulo: "Pedir vacaciones", persona: "ramiro" },
  M7:  { mundo: "obra", marco: "tel", titulo: "Mis papeles (anda sin señal)", persona: "ramiro", variantes: ["ramiro", "mauro"] },
  M8:  { mundo: "obra", marco: "tel", titulo: "Capataz: pedir en nombre de otro", persona: "tito" },
  M9:  { mundo: "obra", marco: "kiosco", titulo: "Kiosco: entrega de EPP", persona: "ramiro" },
  M10: { mundo: "obra", marco: "kiosco", titulo: "Kiosco: pendientes de quien no tiene celular", persona: "omar" },
};
```

- El `<select>` de la barra arma una opción por pantalla y una por variante. Cuando la variante es una persona (por ejemplo "M3 · Mauro, sin PIN" o "M7 · Mauro, apto vencido"), el valor queda `"M3|mauro"` y `MAQ.ir("M3", {persona:"mauro"})`. Las otras variantes se pasan como `{variante}`.
- "Sin señal" no es una variante: es el interruptor global de la barra, y vale para todas las M.
- `O6` abre O5 y encima el diálogo.

### 3.5 Estado inicial (`MAQ.estado`)

Hoy es viernes 17/10/2026. Todos los datos son inventados.

```js
const INICIAL = {
  persona: "ramiro",      // quién tiene el link en la mano (obra)
  usuario: "carolina",    // quién está logueado en la oficina
  senal: true,
  personas: {             // elenco común; el resto de la dotación es relleno de la oficina
    ramiro:   { nombre: "Ramiro Ledesma", ini: "RL", puesto: "Oficial montador", mundo: "obra", cuadrilla: 3, canal: "whatsapp", pin: true, ingreso: "03/2019", saldoVac: 21 },
    mauro:    { nombre: "Mauro Giménez", ini: "MG", puesto: "Ayudante", mundo: "obra", cuadrilla: 3, canal: "whatsapp", pin: false, aptoVencido: "02/10", turnoArt: "martes 21/10, 8 h" },
    tito:     { nombre: "Héctor «Tito» Paz", corto: "Tito Paz", ini: "TP", puesto: "Capataz", mundo: "obra", cuadrilla: 3, canal: "whatsapp", pin: true, respAltura: true },
    walter:   { nombre: "Walter Sosa", ini: "WS", puesto: "Chofer (camión con hidrogrúa)", mundo: "obra", canal: "telegram", pin: true, registroVence: "29/10" },
    nestor:   { nombre: "Néstor Aguirre", ini: "NA", puesto: "Encargado de pañol", mundo: "obra", canal: "kiosco", pin: true },
    brian:    { nombre: "Brian Quiroga", ini: "BQ", puesto: "Medio oficial", mundo: "obra", cuadrilla: 3, canal: "whatsapp", pin: true, alta: "06/10", sinPreocupacional: true },
    lucas:    { nombre: "Lucas Ferreyra", ini: "LF", puesto: "Ayudante", mundo: "obra", baja: "15/10" },
    omar:     { nombre: "Omar Villalba", ini: "OV", puesto: "Ayudante", mundo: "obra", cuadrilla: 2, canal: "kiosco", pin: true, sinCelular: true },   /* relleno, para M10 */
    julio:    { nombre: "Julio Cáceres", ini: "JC", puesto: "Ayudante", mundo: "obra", cuadrilla: 1, canal: "whatsapp", pin: true },                  /* relleno */
    cristian: { nombre: "Cristian Funes", ini: "CF", puesto: "Medio oficial", mundo: "obra", cuadrilla: 2, canal: "kiosco", pin: false },                /* relleno */
    carolina: { nombre: "Carolina Benítez", ini: "CB", puesto: "Administración · operadora de RRHH", mundo: "oficina" },
    lucia:    { nombre: "Lucía Ferraro", ini: "LF", puesto: "Comercial", mundo: "oficina", jefe: "rinaldi", saldoVac: 14 },
    rinaldi:  { nombre: "Ing. Pablo Rinaldi", ini: "PR", puesto: "Oficina técnica", mundo: "oficina" },
    daniela:  { nombre: "Daniela Ojeda", ini: "DO", puesto: "Logística y planificación", mundo: "oficina" },
    js:       { nombre: "Joaquín Stepansky", corto: "JS", ini: "JS", puesto: "Dirección", mundo: "oficina" },
    inaki:    { nombre: "Iñaki Capurro", ini: "IC", puesto: "Técnico de SyH", mundo: "oficina" },
    sergio:   { nombre: "Sergio Molina", ini: "SM", puesto: "Montador · Montajes Molina", mundo: "contratista", aptoVence: "20/11" },
  },
  dotacion: { obra: 30, oficina: 15, contratistas: 4 },   // 45 propios; Lucas ya no cuenta, Brian sí
  recibos: {
    periodo: "septiembre 2026",
    total: 45,                       // incluye a Lucas (trabajó septiembre); no a Brian (alta 06/10)
    conteo: { conformes: 33, disconformes: 3, abiertos: 5, sinAbrir: 4 },   // pendientes = 9 de 45
    porPersona: {
      ramiro: { estado: "abierto", abierto: "16/10 19:20", neto: "$ 1.180.400,00" },   // importe ficticio
      mauro:  { estado: "sin_abrir", neto: "$ 905.700,00" },
      lucia:  { estado: "sin_abrir", neto: "$ 1.342.000,00" },
      omar:   { estado: "sin_abrir", neto: "$ 905.700,00" },
      tito:   { estado: "conforme", firmado: "06/10 09:30", via: "link" },
      walter: { estado: "conforme", firmado: "06/10 07:55", via: "link" },
    },
    historial: { ramiro: [{ periodo: "agosto 2026", estado: "conforme", firmado: "05/09 09:12", via: "link" }] },
  },
  comunicados: [
    { id: "arnes", texto: "Desde el lunes 27/10 el arnés se retira y se devuelve en el pañol todos los días.", alcance: "Obra",
      audio: { de: "js", seg: 40 }, publicado: "16/10 07:00", total: 30,
      pendientes: ["ramiro", "mauro", "brian", "walter", "omar", "julio", "cristian"] },   // 23 de 30
    { id: "viernes", texto: "El viernes 24/10 la oficina cierra a las 15 h.", alcance: "Oficina", audio: null, publicado: "17/10 09:00", total: 15,
      pendientes: ["lucia", "rinaldi"] },
  ],
  ausencias: [
    { id: "a1", persona: "mauro", tipo: "hoy_no_voy", motivo: "enfermo", fecha: "17/10", creado: "17/10 06:12", via: "link", estado: "a_confirmar",
      certificado: { forma: "link", plataforma: "ReNaPDiS", matricula: "MN 000000 (ejemplo)" } },
    { id: "a2", persona: "julio", tipo: "hoy_no_voy", motivo: "tramite", fecha: "17/10", creado: "17/10 06:40", via: "capataz", por: "tito", estado: "a_confirmar" },
  ],
  vacaciones: [
    { id: "v1", persona: "ramiro", desde: "05/01/2027", hasta: "18/01/2027", dias: 14, estado: "pendiente", pedido: "15/10 19:02", via: "link",
      opinion: { de: "tito", valor: "si_pero", texto: "Sí, pero que no salga junto con Giménez" }, aprueba: ["daniela", "js"], motivo: null },
  ],
  epp: { ramiro: [{ fecha: "08/09", items: ["Casco", "Botines talle 42", "Guantes"], via: "kiosco" }] },
  habilitacion: {
    modo: "advertencia",          // O9 lo alterna con "bloqueo" para mostrar los dos
    destrabes: [{ id: "d1", persona: "julio", fecha: "14/10 06:35", por: "daniela", motivo: "Turno en la ART el 16/10; ese día sólo carga y descarga en el depósito.", avisoJs: true, revisoHys: false }],
  },
  nomina: { cabildo: { obra: "Fachada Av. Cabildo 2350", ultima: "01/10", noFiguran: ["brian"], salida: "lunes 20/10" } },
  chats: {
    ramiro: [
      { de: "oficina", fecha: "16/10", hora: "19:18", texto: "Hola Ramiro, tenés el recibo de septiembre para firmar. Abrí este link:", link: { texto: "Firmar el recibo de septiembre", sub: "andamiosos.app/r/… (link de ejemplo)", ir: "M2" } },
      { de: "oficina", fecha: "16/10", hora: "19:19", texto: "Y hay un comunicado nuevo. Leé esto y tocá Entendido:", link: { texto: "Comunicado: el arnés se retira en el pañol", sub: "andamiosos.app/c/… (link de ejemplo)", ir: "M4" } },
    ],
  },
  campanita: {
    carolina: [
      { id: "c1", tipo: "err", ico: "alerta", texto: "Brian Quiroga no figura en la última Nómina ART (Av. Cabildo 2350, sale el lunes).", hace: "hace 2 h", ir: "O7", leida: false },
      { id: "c2", tipo: "warn", ico: "reloj", texto: "A Walter Sosa le vence el registro de conducir el 29/10.", hace: "hoy 07:00", ir: "O5", leida: false },
      { id: "c3", tipo: "info", ico: "termometro", texto: "Mauro Giménez avisó «hoy no voy». A confirmar.", hace: "hoy 06:12", ir: "O12", leida: false },
    ],
    js: [
      { id: "j1", tipo: "warn", ico: "candado-abierto", texto: "Daniela asignó a Julio Cáceres con el apto vencido. Motivo: turno en la ART.", hace: "mar 14/10", ir: "O9", leida: true },
      { id: "j2", tipo: "prim", ico: "calendario", texto: "Mañana cumple años Néstor Aguirre. Llamalo.", hace: "hoy 08:00", ir: "O2", leida: false },
    ],
    daniela: [], lucia: [{ id: "l1", tipo: "info", ico: "megafono", texto: "Comunicado: el viernes 24/10 la oficina cierra a las 15 h.", hace: "hoy 09:00", ir: "O15", leida: false }],
  },
};
```

- **Un desvío de la propuesta, a propósito.** En O3, Ramiro tiene firmado **agosto** (05/09 09:12). Septiembre queda "abierto, sin firmar" hasta que firme en M3, y desde ahí O3 muestra "Septiembre: firmado conforme el 17/10 a las 18:42, desde su celular". La propuesta pedía las dos cosas a la vez (firmado el 06/10 y firmando el 17/10), y no son compatibles.
- **Comunicado del arnés.** Es para obra, así que son **23 de 30** con "Entendido" y 7 pendientes. Así el "7" del tablero (O1) coincide con O11. La propuesta decía 38 de 45, pero con alcance obra no da.
- **Reloj.** La maqueta arranca a las **18:40** para que la constancia de M3 quede en 18:42. Ningún envío de la oficina puede quedar después de las 21 h. Si una acción manda algo a obra después de las 21, el núcleo lo deja como "Se envía el lunes 7:00".

### 3.6 Acciones (`MAQ.acciones`)

Todas devuelven `{hora, fecha, …}` y disparan un solo `maq:cambio`, con `clave` (el área), `accion` y `origen`. El origen se toma de `opts.origen` y, si no viene, de `PANTALLAS[MAQ.actual]`.

| Acción | Quién la llama | Qué cambia | Aviso a la campanita |
|---|---|---|---|
| `verRecibo(persona)` | M3, al abrir el resumen | `sin_abrir` pasa a `abierto`, y el conteo se ajusta | — |
| `firmarRecibo(persona, {conforme, texto?, via:"link"\|"kiosco"\|"web"})` | M3, M10, O15 | estado `conforme`/`disconforme`, `firmado` y `via`; conteo | carolina: "X firmó el recibo de septiembre (conforme o **en disconformidad**)" → O10 |
| `entendido(persona, idComunicado, {via})` | M4, M10, O15 | lo saca de `pendientes` | — (sólo el conteo de O1 y O11) |
| `hoyNoVoy(persona, {motivo, certificado?, via, por?})` | M5, M8 | agrega una ausencia `a_confirmar`; **si no hay señal** queda `enCola:true` y se manda con `senal(true)` | daniela y carolina: "X avisó «hoy no voy»" → O12. El texto para el capataz es "ausente con aviso", sin el motivo |
| `pedirVacaciones(persona, {desde, hasta, dias, via, por?})` | M6, M8, O15 | agrega un pedido `pendiente` | daniela (obra) o el jefe directo (oficina) → O12 |
| `opinarVacaciones(id, {valor:"si"\|"no"\|"si_pero", texto?})` | M8 | `opinion` | — |
| `resolverVacaciones(id, {aprobado, motivo?, por})` | O12 | `aprobado` o `rechazado` con `motivo`, que **el empleado ve** en M6 | — (la obra lo ve en M6; en modo oficina, un toast con "Ver lo que ve Ramiro" → M6) |
| `confirmarAusencia(id, {por})` | O12 | `confirmada` | — |
| `entregarEpp(persona, {items, via:"kiosco"})` | M9 | agrega la entrega a `epp[persona]` | carolina: "Ramiro firmó la entrega de EPP en el kiosco" → O3 Papeles |
| `avisarDatoMal(persona, texto)` | M7, O15 | — | carolina → O3 o O4 |
| `destrabar(persona, {motivo, por})` | O9 | agrega a `habilitacion.destrabes` | **js**: "Daniela destrabó a X. Motivo: …" → O9. El toast dice "Le avisamos a JS ahora" |
| `subirNomina(obraId, {fecha})` | O7 | `ultima` y `noFiguran: []` | — |
| `enviarLink(persona, {que:"recibo"\|"comunicado"\|"vacaciones", canal})` | O1, O3, O11 | agrega un mensaje de la oficina a `chats[persona]` con la hora de `MAQ.hora()` | — (toast "Se abrió WhatsApp con el mensaje armado (simulado)" con "Ver el celular de X" → M1) |

Lo que es sólo de la oficina, como subir documentos, la checklist de baja, la exportación o el registro de lecturas sensibles, vive en el script de la oficina y no pasa por `MAQ`.

### 3.7 Sustitutos permitidos de lo prohibido

| La propuesta dice | En la maqueta |
|---|---|
| "Mandar link por WhatsApp" (wa.me) | un diálogo con la vista previa del mensaje y "Abrir WhatsApp" → `acciones.enviarLink` y un toast |
| "Pedir nómina al contador (arma el mail)" | un diálogo con el texto del mail y "Copiar texto" (`navigator.clipboard.writeText` con try/catch; si falla, un toast que dice que no se pudo copiar) |
| "Exportar", "Armar ZIP", "Bajar el PDF" | un toast "Se generó novedades-octubre-2026.xlsx (simulado)"; en obra, `.ob-aviso--info` con el peso ("El PDF pesa 180 KB") y "Abrir" simulado |
| "Copiar link temporal (vence en 7 días)" | clipboard con try/catch y un toast |
| Grabar audio (O11) | un botón con el ícono `mic` que pasa a "Grabando… 0:12" (sin animación con reduced-motion) y "Listo: audio de 40 s"; no pide el micrófono |
| Imprimir | no existe |

---

## 4. Íconos

Son SVG inline de 24 × 24, con `fill="none"`, `stroke="currentColor"`, `stroke-width` 2 (2.5 dentro de las pantallas de obra, por CSS), `stroke-linecap="round"` y `stroke-linejoin="round"`. Llevan `aria-hidden="true"` y `focusable="false"`. Los botones que son sólo ícono necesitan `aria-label`.

**Tamaños:**
- oficina: 16 (13 en chips, 14 en ítems de tabla);
- riel: 16;
- obra: 24 en botones y avisos, 28 en la lista de inicio (M2), 44 en el sello y 22 en la barra sin señal;
- barra de estado del teléfono: 15.

```js
const ICONOS = {
  /* básicos */
  check: "M20 6 9 17l-5-5",
  "check-doble": "M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16",
  x: "M18 6 6 18M6 6l12 12",
  mas: "M12 5v14M5 12h14",
  menos: "M5 12h14",
  "chev-izq": "m15 18-6-6 6-6",
  "chev-der": "m9 18 6-6-6-6",
  "chev-abajo": "m6 9 6 6 6-6",
  flecha: "M5 12h14M13 6l6 6-6 6",
  volver: "M19 12H5M11 18l-6-6 6-6",
  menu: "M4 6h16M4 12h16M4 18h16",
  puntos: "M5 12h.01M12 12h.01M19 12h.01",
  buscar: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  filtro: "M22 3H2l8 9.46V19l4 2v-8.54z",
  /* estado */
  alerta: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  pregunta: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01",
  reloj: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  calendario: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  campana: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  /* privacidad y habilitación */
  candado: "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4",
  "candado-abierto": "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 9.9-1",
  escudo: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  ojo: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  historial: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  /* personas y lugares */
  persona: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  personas: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  "persona-mas": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  "persona-menos": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 11h-6",
  casco: "M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1zM10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5M4 15v-3a6 6 0 0 1 6-6M14 6a6 6 0 0 1 6 6v3",
  maletin: "M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20",
  obra: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18zM6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4",
  camion: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 9.38a1 1 0 0 0-.78-.38H14M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  casa: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  "mapa-pin": "M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  /* papeles */
  archivo: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  recibo: "M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zM9 7h6M9 11h6M9 15h4",
  firma: "M3 17c3-4 5-4 6 0s3 4 5 0 3-3 7-1M3 21h18",
  lapiz: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  carpeta: "M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  zip: "M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4",
  tramite: "M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
  planilla: "M4 3h16v18H4zM4 9h16M4 15h16M10 3v18",
  subir: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  descargar: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  copiar: "M8 8h12v12H8zM4 16V4h12",
  basura: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  foto: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  /* comunicación y audio */
  megafono: "M3 10v4h3l9 5V5L6 10zM6 14l1.5 5h3L9 15.5M18 9a3 3 0 0 1 0 6",
  play: "M7 4v16l13-8z",
  pausa: "M7 4h3v16H7zM14 4h3v16h-3z",
  volumen: "M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
  whatsapp: "M7.9 20A9 9 0 1 0 4 16.1L2 22z",
  telegram: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  /* dispositivos y conexión */
  celu: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  kiosco: "M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 18v3M8 21h8",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM21 14v3M14 21h3M21 21h.01",
  "tecla-borrar": "M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM18 9l-6 6M12 9l6 6",
  senal: "M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 20V4",
  "sin-senal": "M2 20h.01M7 20v-4M12 20v-8M15 3l6 6M21 3l-6 6",
  wifi: "M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0M12 20h.01",
  bateria: "M4 7h13a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM22 11v2M6 10v4M9 10v4M12 10v4",
  /* motivos y licencias */
  termometro: "M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z",
  sombrilla: "M12 2a10 10 0 0 1 10 10H2A10 10 0 0 1 12 2zM12 12v8a2 2 0 0 0 4 0",
  cruz: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  /* tema y app */
  sol: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42",
  luna: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
  auto: "M12 22a10 10 0 1 0 0-20v20zM12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  tablero: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  organigrama: "M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4",
  gauge: "M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0",
  paquete: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  ajustes: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  salir: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};
const RELLENO = new Set(["play", "pausa"]);   // éstos van con fill, sin trazo

MAQ.ico = (n, s = 16, cls = "") => {
  const d = ICONOS[n] || ICONOS.puntos, f = RELLENO.has(n);
  return `<svg class="mq-ico${cls ? " " + cls : ""}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="${f ? "currentColor" : "none"}" stroke="${f ? "none" : "currentColor"}" stroke-width="${n === "puntos" ? 3 : 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
};
```

**Íconos por uso, para que los dos mundos digan lo mismo:**

| Uso | Ícono |
|---|---|
| Recibo y firma del recibo | `recibo`; la firma con el dedo, `firma` |
| Comunicado | `megafono`; el audio, `play`/`pausa`/`volumen` |
| "Hoy no voy" | `casa` como acción. Motivos: Enfermo `termometro`, Trámite `tramite`, Familiar `personas`, Otro `puntos` |
| Vacaciones | `sombrilla`; los días que quedan, `calendario` |
| Mis papeles y habilitación | `escudo`; apto vencido `alerta`; vence pronto `reloj` |
| EPP y kiosco | `casco`, `kiosco`, `qr`; PIN `candado` |
| Datos sensibles | `candado` en `--priv`; lectura registrada `historial`; evidencia `ojo` |
| Destrabe | `candado-abierto` |
| Nómina ART y carpeta | `archivo`, `carpeta`, `zip`, `link` |
| Novedades del mes | `planilla` |
| Alta y baja | `persona-mas` / `persona-menos` |
| Canales | `whatsapp`, `telegram`, `kiosco`; sin celular `celu` con el chip "Sin celular" |
| Sin señal | `sin-senal`; en cola `reloj` |
| Cumpleaños (aviso a JS) | `calendario` |
| Riel | Dirección `gauge`; Comercial `whatsapp`/`personas`/`ajustes`; Obras `obra`; OT e Informes `archivo`; Habilitaciones `escudo`; Mapa `mapa-pin`; Planificacion `calendario`; Permisos `archivo`; Computos `tablero`; Modelador y Stock `paquete`; Movimientos `tramite`; Remitos `archivo`; Pañol y Partes `casco`; Solicitudes `mas`; Incidentes `alerta`; Inspecciones `buscar`; Legajos `persona`; Fichadas `reloj`; Vehiculos `camion`; Organigrama `organigrama`; **RRHH `personas`**; Alertas `campana`; Configuracion `ajustes` |

---

## 5. Lista de control antes de entregar (para los dos)

- [ ] A 400px de ancho no hay scroll horizontal en el body. La barra se acomoda en varias líneas, `.of-app` usa sus reglas de ≤ 760, `.mq-tel` y `.mq-kiosco` se achican, y las tablas tienen scroll propio dentro de `.of-tabla-wrap`.
- [ ] Todo color sale de un token, y los tres bloques de tokens están completos.
- [ ] El foco se ve en todo: anillo coral en la oficina, azul de 3px en obra. Las pestañas, los diálogos y el PIN se manejan con teclado.
- [ ] Con `prefers-reduced-motion` no queda ninguna animación. Las pantallas de obra no tienen ninguna, ni siquiera sin esa preferencia.
- [ ] No se reproduce nada solo, y el audio arranca en "detenido".
- [ ] Cada M probada **sin señal**, con la barra, la cola y lo que queda bloqueado.
- [ ] Al abrir se ve O1 con datos (o la pantalla recordada), nunca una vista vacía.
- [ ] No se usan `alert`, `confirm`, `prompt`, `print`, `mailto:`, `tel:`, `<a download>` ni iframes, y lo que se muestra u oculta usa `hidden`.
- [ ] Los ids son estables y tienen su prefijo, y los atributos van con comillas dobles.
- [ ] Los importes llevan "Importe ficticio" y la barra dice "datos de ejemplo".
- [ ] La obra sólo se comunica con la oficina por `MAQ.acciones`, `MAQ.ir`, `MAQ.toast` y los eventos `maq:*`.