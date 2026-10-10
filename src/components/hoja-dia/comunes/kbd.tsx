// La tecla de un atajo, al lado del botón ("Nuevo pedido [N]").
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid h-[18px] min-w-[18px] place-items-center rounded border border-current/40 px-1 font-sans text-[11px] leading-none font-medium opacity-80 max-md:hidden">
      {children}
    </kbd>
  );
}
