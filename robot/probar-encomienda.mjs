// Prueba del robot del CPAU SIN FINALIZAR: una pasada hasta Confirmar con los datos de la
// encomienda de Trelles (EX-2026-38891134). No crea tareas ni toca trámites: sólo sube las
// capturas a tramites/prueba-robot-cpau/cpau/ en el bucket y muestra el resultado.
//
// Sirve para ver que el robot sigue andando si el CPAU cambia algo, sin gastar una encomienda.
// Entra con la cuenta de Hougassian.
//
// Correr: node --env-file=.env.local --env-file=robot/.env.robot robot/probar-encomienda.mjs
import { createClient } from "@supabase/supabase-js";
import { hacerEncomienda } from "./cpau-encomienda.mjs";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tarea = {
  id: Date.now(),
  tramite_id: "prueba-robot-cpau",
  payload: {
    es_prueba: true,
    finalizar: false,
    direccion: "Trelles 1086 (prueba del robot)",
    propietario: { nombre: "CONS PROP TRELLES 1084 86 88 GAONA 2402", cuit: "30641067950" },
    frente: { calle: "TRELLES, MANUEL R.", desde: 1084, hasta: 1088 },
    superficie: "32",
    descripcion: "Pantalla de protección peatonal de 8 mts lineales.",
  },
};

const r = await hacerEncomienda({ db, tarea, log: (...a) => console.log(...a) });
console.log(`\nEtapa: ${r.etapa} · calle en el CPAU: ${r.calle_cpau} · ${r.capturas.length} capturas`);
console.log(r.resumen);
