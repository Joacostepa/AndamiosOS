"use client";

import { QueryProvider } from "@/components/providers/query-provider";

export default function CotizadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <QueryProvider>{children}</QueryProvider>;
}
