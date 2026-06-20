"use client";

import { useBalanceMaterialObra } from "@/hooks/use-balance-material";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Package } from "lucide-react";

// Balance de material por obra: cómputo madre (planeado) vs lo realmente movido.
export function BalanceMaterial({ obraId }: { obraId: string }) {
  const { data, isLoading } = useBalanceMaterialObra(obraId);

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!data || data.length === 0) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />Sin cómputo ni remitos para esta obra todavía
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Pieza</TableHead>
              <TableHead className="text-right">Cómputo</TableHead>
              <TableHead className="text-right">Entregado</TableHead>
              <TableHead className="text-right">Sobrante</TableHead>
              <TableHead className="text-right">Devuelto</TableHead>
              <TableHead className="text-right">En obra</TableHead>
              <TableHead className="text-right">Desvío</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((b) => (
              <TableRow key={b.pieza_id}>
                <TableCell className="font-mono text-xs">{b.codigo}</TableCell>
                <TableCell>{b.descripcion}</TableCell>
                <TableCell className="text-right">{b.planeado || "—"}</TableCell>
                <TableCell className="text-right">{b.entregado}</TableCell>
                <TableCell className="text-right">{b.sobrante || "—"}</TableCell>
                <TableCell className="text-right">{b.devuelto || "—"}</TableCell>
                <TableCell className="text-right font-semibold">{b.en_obra}</TableCell>
                <TableCell className={`text-right ${b.desvio_computo > 0 ? "text-red-400" : b.desvio_computo < 0 ? "text-yellow-400" : "text-muted-foreground"}`}>
                  {b.planeado ? (b.desvio_computo > 0 ? `+${b.desvio_computo}` : b.desvio_computo) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">
          Cómputo = lo que planeó Oficina Técnica · Entregado/Sobrante/Devuelto = remitos recibidos ·
          En obra = entregado − sobrante − devuelto (lo que queda sin volver = faltante si ya se desarmó) ·
          Desvío = entregado − cómputo.
        </p>
      </CardContent>
    </Card>
  );
}
