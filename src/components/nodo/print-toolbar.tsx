"use client";

import { useEffect } from "react";

/** Barra que no se imprime: guardar como PDF y volver. */
export function PrintToolbar({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    // Un respiro para que carguen la fuente y los logos antes de imprimir.
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <div className="q-toolbar">
      <span>
        Para descargar: <strong>Guardar como PDF</strong> en el diálogo de impresión.
      </span>
      <button onClick={() => window.print()}>Descargar PDF</button>
      <button className="q-ghost" onClick={() => window.close()}>
        Cerrar
      </button>
    </div>
  );
}
