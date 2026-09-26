"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Markdown con los estilos de la app (no hay plugin de tipografía de Tailwind).
//
// SEGURO A PROPÓSITO, porque lo que se muestra puede venir de un modelo que leyó datos de
// afuera (notas de Odoo, PDFs de clientes):
//   · sin HTML crudo — react-markdown no lo interpreta si no se le agrega rehype-raw;
//   · sin imágenes remotas — una ![](https://…) es la forma más simple de sacar datos de la
//     pantalla hacia un servidor ajeno (la URL puede llevar lo que sea en la query);
//   · links sólo a destinos conocidos (la app, Odoo, Storage de Supabase); el resto se
//     muestra como texto.

const DESTINOS_PERMITIDOS = [
  /^\/(?!\/)/, // rutas de la app
  /^https:\/\/[a-z0-9-]+\.odoo\.com\//i,
  /^https:\/\/[a-z0-9]+\.supabase\.co\//i,
  /^mailto:/i,
  /^tel:/i,
];

function linkPermitido(href: string | undefined): boolean {
  return !!href && DESTINOS_PERMITIDOS.some((r) => r.test(href));
}

const componentes: Components = {
  h1: ({ children }) => <h2 className="mt-5 mb-2 text-lg font-semibold first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-3 mb-1 text-sm font-medium first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/50 bg-muted/40 py-1 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{children}</pre>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-left text-[0.92em]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => <th className="border-b border-border px-2.5 py-1.5 font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b border-border/60 px-2.5 py-1.5 align-top">{children}</td>,
  a: ({ href, children }) =>
    linkPermitido(href) ? (
      <a href={href} target={href!.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="text-primary underline underline-offset-2">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt }) => (alt ? <span className="text-muted-foreground">[{alt}]</span> : null),
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-sm break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
