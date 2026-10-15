// Quién ve qué dentro de Dirección (puro: lo usan servidor, cliente y tests).
//
// · Dirección: módulo `direccion` ("ver" lee; "editar" anota, asigna dueños, metas, colchón).
// · Socios: `direccion-socios` ADEMÁS de `direccion`. El admin no lo trae solo
//   (exigeExplicito en acceso.ts). Sin esto, ni las APIs ni los server components mandan
//   retiros, dividendos, política ni circuitos de facturación.

import { nivelEn, type Acceso, type Nivel } from "../auth/acceso.ts";

export type PermisosDireccion = { nivel: Nivel | null; puedeVer: boolean; puedeEditar: boolean; conSocios: boolean };

export function permisosDireccion(acceso: Acceso | null | undefined): PermisosDireccion {
  const nivel = nivelEn(acceso, "direccion");
  const socios = nivelEn(acceso, "direccion-socios") !== null;
  return { nivel, puedeVer: nivel !== null, puedeEditar: nivel === "editar", conSocios: nivel !== null && socios };
}

export const MENSAJE_SIN_ACCESO = "No tenés acceso a Dirección. Pedíselo a un socio.";
export const MENSAJE_SIN_SOCIOS = "No tenés acceso a esa sección.";
