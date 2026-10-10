import { PantallaConteo } from "@/components/panol/tablet/conteo";

// Conteo cíclico en la tablet del depósito (docs §6.7). Hereda el layout de /kiosco
// (KioscoProvider): la pantalla pide un encargado identificado.
export default function Page() {
  return <PantallaConteo />;
}
