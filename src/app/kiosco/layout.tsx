import type { Metadata } from "next";
import { QueryProvider } from "@/components/providers/query-provider";
import { KioscoProvider } from "@/components/panol/kiosco/sesion";
import { Toaster } from "@/components/ui/sonner";

// El kiosco del pañol va a pantalla completa, sin la barra ni el menú del dashboard: es un
// equipo compartido y fijo (docs §5). El KioscoProvider vive en el layout para que «¿Quién
// sos?» se conserve al pasar a /kiosco/conteo, /kiosco/control-cuadrilla o /kiosco/afuera.
// El acceso lo controla el proxy (módulo panol-kiosco, o Pañol en editar).

export const metadata: Metadata = { title: "Kiosco del pañol · AndamiosOS" };

export default function KioscoLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <KioscoProvider>
        <div className="flex min-h-dvh flex-1 flex-col bg-background text-foreground">{children}</div>
        <Toaster position="top-center" />
      </KioscoProvider>
    </QueryProvider>
  );
}
