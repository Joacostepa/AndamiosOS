import { accesoActual } from "@/lib/auth/servidor";
import { AccesoProvider } from "@/components/providers/acceso-provider";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { RecorridoObligatorio } from "@/components/recorridos/recorrido-obligatorio";
import { leerRecorridosVistos, usuarioDe } from "@/lib/recorridos/servidor";
import { recorridoPendiente } from "@/lib/recorridos/registro";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Los permisos se leen en el servidor y bajan por contexto: pedirlos desde el cliente
  // haría que el menú completo se pinte por un instante antes de recortarse, que es justo
  // lo que se quiere evitar. La puerta de verdad igual es el proxy.
  //
  // En paralelo, qué recorridos obligatorios ya hizo (recorridos_vistos). Si la tabla no
  // existe o la consulta falla, `vistos` es null y el recorrido no sale: nunca bloquea.
  const [sesion, vistos] = await Promise.all([accesoActual(), leerRecorridosVistos()]);
  const pendiente = sesion ? recorridoPendiente(sesion.acceso, usuarioDe(vistos, sesion.userId)) : null;

  return (
    <QueryProvider>
      <AccesoProvider acceso={sesion?.acceso ?? null}>
        <SidebarProvider defaultOpen={false}>
          <AppSidebar />
          <SidebarInset>
            <Header />
            <main className="flex-1 overflow-auto p-6">{children}</main>
          </SidebarInset>
        </SidebarProvider>
        <Toaster />
        <RecorridoObligatorio pendiente={pendiente} />
      </AccesoProvider>
    </QueryProvider>
  );
}
