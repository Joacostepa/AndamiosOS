"use client";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Hammer } from "lucide-react";

export default function InsumosPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Insumos y Herramientas" description="Control de EPP, herramientas y consumibles" />
      <EmptyState
        icon={Hammer}
        title="Modulo en desarrollo"
        description="Pronto vas a poder gestionar insumos, EPP y herramientas con control de vencimiento."
      />
    </div>
  );
}
