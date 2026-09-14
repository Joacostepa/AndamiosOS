import { accesoActual } from "@/lib/auth/servidor";
import { AccesoProvider } from "@/components/providers/acceso-provider";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Los permisos se leen en el servidor y bajan por contexto: pedirlos desde el cliente
  // haría que el menú completo se pinte por un instante antes de recortarse, que es justo
  // lo que se quiere evitar. La puerta de verdad igual es el proxy.
  const sesion = await accesoActual();

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
      </AccesoProvider>
    </QueryProvider>
  );
}
