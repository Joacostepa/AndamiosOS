# Pendientes del modelador

Acá van los casos de obra que el modelador todavía no arma con una plantilla. Mientras tanto se resuelven con la **Estructura libre** o con una plantilla propia.

Cada tanto se toman varios juntos y se suman como tipologías nuevas. Cómo se agrega una está en [../como-agregar-tipologia.md](../como-agregar-tipologia.md).

## Cómo cargar un caso

Creá una carpeta por caso, con un nombre corto (por ejemplo `chimenea-industrial/`). Adentro poné una o dos fotos y un `caso.md` con este formato:

```markdown
# Andamio para chimenea industrial

- **Qué es:** envolvente cilíndrica alrededor de una chimenea de ladrillo.
- **Sistema:** multidireccional (Coronet), vanos de 1,09 y 0,73.
- **Medidas típicas:** diámetro 3 a 5 m, altura 15 a 30 m.
- **Lo particular:** anclajes a la chimenea cada 4 m y plataforma en cada nivel de trabajo.
- **Obra de referencia:** S01234 (si hay remito, mejor).
- **Cargado por / fecha:** JS · 14/10/2026
```

## Ya incorporados (15/10/2026)

- **Fachadas y pantallas.** Incluye la fachada de bastidores y el voladizo con ménsulas.
- **Torres:**
  - escalera y acceso;
  - torre de plataforma de varios vanos (`torre_plataforma`), que también se puede embeber en otra estructura;
  - torre en azotea (`torre_azotea`);
  - torre móvil interior y exterior (`torre_movil`).
- **Pórticos** peatonal y vehicular.
- **Bandejas de protección:**
  - con visera a 90° o 45°;
  - amplia con vigas de celosía (`bandeja`);
  - con pórtico peatonal (`bandeja_portico`);
  - en voladizo sin patas (`bandeja_voladizo`).
- **Estructuras colgantes** de losa o de puente (`colgante`).
- **Envolventes** de cúpula, tanque o columna, con torre central (`envolvente`).
- **Patios internos** entre medianeras, contra el fondo o por dentro de varios muros (`patio_interno`).
- **Escaleras:**
  - estructuras sobre escaleras, con perfil de apoyo editable (`sobre_escalera`);
  - plataformas en huecos de escalera (`hueco_escalera`).
- **Medida libre y estructura libre**, con «Convertir a estructura libre».
- **Volúmenes de referencia:** el edificio desde medidas, con caja, prisma, escalonado, cilindro o cúpula, salientes y patios. Se modela arriba de una cara y avisa los choques.
