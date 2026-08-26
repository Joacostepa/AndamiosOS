import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/auth/roles";
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
  // El rol se lee en el servidor y baja como prop: pedirlo desde el cliente haría que el
  // menú completo se pinte por un instante antes de recortarse, que es justo lo que se
  // quiere evitar. La puerta de verdad igual es el middleware.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from("user_profiles").select("rol").eq("id", user.id).single()
    : { data: null };
  const rol = (perfil?.rol as Rol | undefined) ?? null;

  return (
    <QueryProvider>
      <SidebarProvider defaultOpen={false}>
        <AppSidebar rol={rol} />
        <SidebarInset>
          <Header rol={rol} />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </QueryProvider>
  );
}
