import { redirect } from "next/navigation";

// /sistemas no tiene pantalla propia: es la puerta de «Mis reportes», que es de todos. La
// bandeja de revisión vive en /sistemas/revision, con su propio permiso.
export default function SistemasPage() {
  redirect("/sistemas/mis-reportes");
}
