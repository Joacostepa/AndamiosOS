import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoDeRechazoApi, moduloDeRuta, nivelEn, normalizarPermisos, puedeAbrir, type Acceso, type Permisos } from "./acceso.ts";

const persona = (rol: Acceso["rol"], permisos: Permisos = {}): Acceso => ({ rol, activo: true, permisos, debeCambiarClave: false });

test("Dirección: /direccion/socios es del módulo de socios (gana la ruta más larga)", () => {
  assert.equal(moduloDeRuta("/direccion")?.id, "direccion");
  assert.equal(moduloDeRuta("/direccion/caja")?.id, "direccion");
  assert.equal(moduloDeRuta("/direccion/socios")?.id, "direccion-socios");
});

test("Dirección › Socios: el admin NO lo trae solo (exigeExplicito)", () => {
  const admin = persona("admin");
  assert.equal(nivelEn(admin, "direccion"), "editar");
  assert.equal(nivelEn(admin, "direccion-socios"), null);
  assert.equal(puedeAbrir(admin, "/direccion"), true);
  assert.equal(puedeAbrir(admin, "/direccion/socios"), false);
  assert.match(motivoDeRechazoApi(admin, "/api/direccion/socios", "GET") ?? "", /No tenés acceso/);
  assert.equal(motivoDeRechazoApi(admin, "/api/direccion/caja", "GET"), null);
  // El resto de la app sigue abierta para el admin.
  assert.equal(puedeAbrir(admin, "/planificacion"), true);
  assert.equal(motivoDeRechazoApi(admin, "/api/planificacion", "POST"), null);
});

test("Dirección › Socios: el admin con el módulo tildado sí entra", () => {
  const admin = persona("admin", { "direccion-socios": "ver" });
  assert.equal(nivelEn(admin, "direccion-socios"), "ver");
  assert.equal(puedeAbrir(admin, "/direccion/socios"), true);
  assert.equal(motivoDeRechazoApi(admin, "/api/direccion/socios", "GET"), null);
});

test("Dirección: sin el módulo no se abre ni la página ni la API", () => {
  const oficina = persona("operativo", { planificacion: "editar" });
  assert.equal(puedeAbrir(oficina, "/direccion"), false);
  assert.ok(motivoDeRechazoApi(oficina, "/api/direccion/semana", "GET"));
});

test("Dirección: 'ver' lee, 'editar' escribe", () => {
  const ver = persona("operativo", { direccion: "ver" });
  assert.equal(motivoDeRechazoApi(ver, "/api/direccion/semana", "GET"), null);
  assert.match(motivoDeRechazoApi(ver, "/api/direccion/notas", "POST") ?? "", /sólo lectura/);
  // "Actualizar ahora" sólo relee: alcanza con ver.
  assert.equal(motivoDeRechazoApi(ver, "/api/direccion/actualizar", "POST"), null);
  const editar = persona("operativo", { direccion: "editar" });
  assert.equal(motivoDeRechazoApi(editar, "/api/direccion/notas", "POST"), null);
});

test("Dirección › Socios es sólo lectura: 'editar' se guarda como 'ver'", () => {
  assert.deepEqual(normalizarPermisos({ "direccion-socios": "editar", direccion: "editar" }), { "direccion-socios": "ver", direccion: "editar" });
});

test("Dirección › Socios sin Dirección: la API de socios responde, la página la frena aparte", () => {
  // El proxy mira un módulo por ruta; "los dos módulos" lo exige la página/ruta
  // (src/lib/direccion/permisos.ts). Acá sólo se documenta qué deja pasar el proxy.
  const soloSocios = persona("operativo", { "direccion-socios": "ver" });
  assert.equal(puedeAbrir(soloSocios, "/direccion/socios"), true);
  assert.equal(puedeAbrir(soloSocios, "/direccion"), false);
});

test("Dirección › Socios: sólo quien ya lo tiene puede darlo o sacarlo (ni un admin)", async () => {
  const { explicitosCambiados, motivoRechazoExplicitos } = await import("./acceso.ts");
  const adminSinSocios = persona("admin");
  const socio = persona("operativo", { direccion: "editar", "direccion-socios": "ver" });
  const dar = explicitosCambiados({}, { "direccion-socios": "ver" });
  assert.deepEqual(dar, ["direccion-socios"]);
  // Cambiar otros módulos no cuenta.
  assert.deepEqual(explicitosCambiados({ direccion: "ver", "direccion-socios": "ver" }, { direccion: "editar", "direccion-socios": "ver" }), []);
  // Con titulares: el admin sin el módulo no puede (ni para él ni para otro); el socio sí.
  assert.match(motivoRechazoExplicitos(adminSinSocios, dar, () => true) ?? "", /Sólo alguien que ya tiene/);
  assert.equal(motivoRechazoExplicitos(socio, dar, () => true), null);
  // Sacarlo también lo controla.
  assert.match(motivoRechazoExplicitos(adminSinSocios, explicitosCambiados({ "direccion-socios": "ver" }, {}), () => true) ?? "", /Sólo alguien/);
  // Arranque: si nadie lo tiene todavía, un admin lo da la primera vez; un no admin, no.
  assert.equal(motivoRechazoExplicitos(adminSinSocios, dar, () => false), null);
  assert.match(motivoRechazoExplicitos(persona("operativo", { direccion: "editar" }), dar, () => false) ?? "", /Sólo alguien/);
});

test("WhatsApp de clientes: página y APIs del módulo clientes-whatsapp, aparte de Clientes", () => {
  assert.equal(moduloDeRuta("/comercial/clientes")?.id, "clientes-whatsapp");
  assert.equal(moduloDeRuta("/clientes")?.id, "clientes");
  const atiende = persona("comercial", { "clientes-whatsapp": "editar" });
  const mira = persona("comercial", { "clientes-whatsapp": "ver" });
  const otro = persona("comercial", { "asistente-comercial": "editar" });
  assert.equal(puedeAbrir(atiende, "/comercial/clientes"), true);
  assert.equal(puedeAbrir(otro, "/comercial/clientes"), false);
  assert.equal(motivoDeRechazoApi(atiende, "/api/comercial/clientes/conversaciones/x/responder", "POST"), null);
  assert.equal(motivoDeRechazoApi(mira, "/api/comercial/clientes/conversaciones", "GET"), null);
  assert.match(motivoDeRechazoApi(mira, "/api/comercial/clientes/conversaciones/x/responder", "POST") ?? "", /sólo lectura/);
  assert.match(motivoDeRechazoApi(otro, "/api/comercial/clientes/conversaciones", "GET") ?? "", /No tenés acceso a WhatsApp de clientes/);
  assert.equal(puedeAbrir(persona("admin"), "/comercial/clientes"), true);
});

test("Sistemas: cualquiera abre Mis reportes y /sistemas, y reporta por /api/sistemas/reportes", () => {
  const campo = persona("campo", { planificacion: "editar", partes: "editar" });
  const sinNada = persona("comercial");
  for (const p of [campo, sinNada]) {
    assert.equal(puedeAbrir(p, "/sistemas/mis-reportes"), true);
    assert.equal(puedeAbrir(p, "/sistemas"), true);
    assert.equal(motivoDeRechazoApi(p, "/api/sistemas/reportes", "GET"), null);
    assert.equal(motivoDeRechazoApi(p, "/api/sistemas/reportes", "POST"), null);
    assert.equal(motivoDeRechazoApi(p, "/api/sistemas/reportes/subidas", "POST"), null);
    assert.equal(motivoDeRechazoApi(p, "/api/sistemas/reportes/x/confirmar", "POST"), null);
  }
  // Sin sesión activa, nada.
  assert.equal(puedeAbrir({ ...campo, activo: false }, "/sistemas/mis-reportes"), false);
});

test("Sistemas · Revisión: un usuario de campo no abre la bandeja ni su API", () => {
  const campo = persona("campo", { planificacion: "editar", partes: "editar" });
  assert.equal(moduloDeRuta("/sistemas/revision")?.id, "sistemas");
  assert.equal(puedeAbrir(campo, "/sistemas/revision"), false);
  assert.match(motivoDeRechazoApi(campo, "/api/sistemas/revision", "GET") ?? "", /No tenés acceso a Sistemas · Revisión/);
  // /sistemas es exacta: no abre por prefijo nada de abajo.
  assert.equal(puedeAbrir(campo, "/sistemas/revisionX"), false);
  assert.equal(puedeAbrir(campo, "/sistemas/otra"), false);
});

test("Sistemas · Revisión: el admin NO la trae sola (exigeExplicito)", () => {
  const admin = persona("admin");
  assert.equal(nivelEn(admin, "sistemas"), null);
  assert.equal(puedeAbrir(admin, "/sistemas/revision"), false);
  assert.match(motivoDeRechazoApi(admin, "/api/sistemas/revision", "GET") ?? "", /No tenés acceso/);
  assert.match(motivoDeRechazoApi(admin, "/api/sistemas/revision/x", "PATCH") ?? "", /No tenés acceso/);
  // Sus propios reportes, sí.
  assert.equal(puedeAbrir(admin, "/sistemas/mis-reportes"), true);
  assert.equal(motivoDeRechazoApi(admin, "/api/sistemas/reportes", "POST"), null);
});

test("Sistemas · Revisión: con el módulo en «editar» entra; en «ver» no cambia nada", () => {
  const revisor = persona("operativo", { sistemas: "editar" });
  assert.equal(puedeAbrir(revisor, "/sistemas/revision"), true);
  assert.equal(motivoDeRechazoApi(revisor, "/api/sistemas/revision", "GET"), null);
  assert.equal(motivoDeRechazoApi(revisor, "/api/sistemas/revision/x", "PATCH"), null);
  const mira = persona("admin", { sistemas: "ver" });
  assert.match(motivoDeRechazoApi(mira, "/api/sistemas/revision/x", "PATCH") ?? "", /sólo lectura/);
  // No es soloLectura: «editar» se guarda tal cual.
  assert.deepEqual(normalizarPermisos({ sistemas: "editar" }), { sistemas: "editar" });
});

test("Explícitos: «Pedíselo a un socio» sólo para Socios", async () => {
  const { motivoRechazoExplicitos } = await import("./acceso.ts");
  const adminSin = persona("admin");
  assert.match(motivoRechazoExplicitos(adminSin, ["sistemas"], () => true) ?? "", /Sistemas · Revisión.*Pedíselo a quien ya lo tenga\./);
  assert.match(motivoRechazoExplicitos(adminSin, ["direccion-socios"], () => true) ?? "", /Pedíselo a un socio\./);
  assert.equal(motivoRechazoExplicitos(persona("operativo", { sistemas: "editar" }), ["sistemas"], () => true), null);
});
