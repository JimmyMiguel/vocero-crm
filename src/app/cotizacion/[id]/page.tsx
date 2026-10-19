import { notFound, redirect } from "next/navigation";
import { Poppins } from "next/font/google";
import { getSessionOrNull } from "@/lib/auth/session";
import {
  DIAS_TRANSITO,
  NOTAS_IMPORTANTES,
  TERMINOS,
  VALIDEZ_COTIZACION_DIAS,
  cbmTexto,
  fechaLarga,
  numeroCotizacion,
  usd,
} from "@/lib/nodo";
import { getQuote } from "@/server/nodo";
import { PrintToolbar } from "@/components/nodo/print-toolbar";
import "./cotizacion.css";

export const dynamic = "force-dynamic";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imprimir?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const session = await getSessionOrNull();
  if (!session) return { title: "Cotización" };
  const q = await getQuote(session.organizationId, (await params).id);
  return {
    title: q ? `Cotización ${numeroCotizacion(q.number)} — ${q.data.cliente}` : "Cotización",
  };
}

/** **negrita** → <strong>, para los textos legales. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part
      )}
    </>
  );
}

function Sidebar() {
  return (
    <aside className="q-side">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/nodo/logo-vertical-blanco.png" alt="NODO" className="q-side-logo" />
    </aside>
  );
}

/**
 * Cotización de NODO en dos hojas A4, con el mismo formato que el equipo ya
 * entrega a sus clientes. Se guarda como PDF desde el diálogo de impresión.
 */
export default async function CotizacionPage({ params, searchParams }: Props) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const { id } = await params;
  const quote = await getQuote(session.organizationId, id);
  if (!quote) notFound();
  const d = quote.data;
  const inv = d.inversion;
  const unidades = d.cantidad ?? 1;
  const c = d.contenedor;

  return (
    <div className={`${poppins.className} q-root`}>
      <PrintToolbar autoPrint={(await searchParams).imprimir === "1"} />

      {/* ---------- Hoja 1 ---------- */}
      <section className="q-page">
        <Sidebar />
        <div className="q-body">
          <header className="q-head">
            <h1 className="q-title">COTIZACIÓN</h1>
            <p className="q-num">
              <strong>Nº:</strong> {numeroCotizacion(quote.number)}
            </p>
          </header>

          <p className="q-label">Emitido a</p>
          <p className="q-client">{d.cliente}</p>

          <div className="q-meta">
            <div>
              <p className="q-label">Teléfono:</p>
              <p>{d.telefono ? `+${d.telefono}` : "-"}</p>
            </div>
            <div>
              <p className="q-label">Dirección de Entrega:</p>
              <p>{d.ciudad ?? "-"}</p>
            </div>
            <div>
              <p className="q-label">Fecha / Validez:</p>
              <p>{fechaLarga(d.emitida)}</p>
              <p>{VALIDEZ_COTIZACION_DIAS} días</p>
            </div>
          </div>

          <h2 className="q-bar">DETALLES DE COTIZACIÓN</h2>
          <table className="q-table q-center">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Volumen</th>
                <th>Unidades</th>
                <th>Incoterm</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{d.producto}</td>
                <td>{cbmTexto(d.cbm)}</td>
                <td>{d.cantidad === null ? "-" : `${d.cantidad} UND`}</td>
                <td>Consolidado</td>
              </tr>
            </tbody>
          </table>

          <h2 className="q-bar">EMBARQUE Y TIEMPO DE TRÁNSITO</h2>
          <div className="q-ship">
            <div className="q-ship-step">
              <p className="q-ship-cap">🇨🇳 Llegada a la bodega en China</p>
              <div className="q-ship-box">
                <span>Hasta el:</span>
                <strong>
                  {c ? fechaLarga(c.corteBodega ?? c.salida, false) : "Por confirmar"}
                </strong>
              </div>
            </div>
            <div className="q-ship-arrow" aria-hidden>
              ›››
            </div>
            <div className="q-ship-step">
              <p className="q-ship-cap">🇪🇨 Recibirás tu pedido en Ecuador</p>
              <div className="q-ship-box">
                <span>Desde el:</span>
                <strong>{c ? fechaLarga(c.llegada, false) : "Por confirmar"}</strong>
              </div>
            </div>
          </div>
          <p className="q-ship-note">
            {c ? `Contenedor: sale el ${fechaLarga(c.salida)} · ` : ""}
            Tiempo estimado de tránsito: {DIAS_TRANSITO} días. Tiempos sujetos a la
            variación de las navieras.
          </p>

          <h2 className="q-bar">DETALLES DE INVERSIÓN</h2>
          <table className="q-table q-money">
            <thead>
              <tr>
                <th className="q-left">Concepto</th>
                <th colSpan={2}>Valor Total</th>
              </tr>
            </thead>
            <tbody>
              <Row label="Valor de Mercadería" value={inv.mercaderia} pending="Por confirmar" />
              <Row
                label="Costos de Transferencia e ISD (Aprox)"
                value={inv.transferenciaIsd}
                pending="Por confirmar"
              />
              <Row label="Servicios de Importación" value={inv.servicios} pending="Por confirmar" />
              <Row
                label="Tributos e Impuestos Aduaneros"
                value={inv.tributos}
                pending="Según el producto"
              />
              <tr className="q-total">
                <td className="q-right">
                  INVERSIÓN TOTAL{inv.sinTributos ? " (sin tributos)" : ""}
                </td>
                <td className="q-cur">$</td>
                <td className="q-amt">{usd(inv.total)}</td>
              </tr>
            </tbody>
          </table>
          {inv.sinTributos && (
            <p className="q-warn">
              No incluye impuestos de aduana, se calculan según el producto.
            </p>
          )}

          <h2 className="q-bar">SIMULACIÓN DE PRECIO PUESTO EN ECUADOR</h2>
          <table className="q-table q-sim">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Unidades</th>
                <th colSpan={2}>Precio Und.</th>
                <th colSpan={2}>Precio Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="q-left q-small">{d.producto}</td>
                <td>{unidades}</td>
                <td className="q-cur">$</td>
                <td className="q-amt">{usd(inv.total / unidades)}</td>
                <td className="q-cur">$</td>
                <td className="q-amt">{usd(inv.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="q-foot" />
      </section>

      {/* ---------- Hoja 2 ---------- */}
      <section className="q-page">
        <Sidebar />
        <div className="q-body q-legal">
          <h3>Notas Importantes:</h3>
          <ul>
            {NOTAS_IMPORTANTES.map((n) => (
              <li key={n}>
                <Rich text={n} />
              </li>
            ))}
          </ul>
          <h3>Términos y Condiciones del Servicio</h3>
          <ul>
            {TERMINOS.map(([t, txt]) => (
              <li key={t}>
                <strong>{t}:</strong> <Rich text={txt} />
              </li>
            ))}
          </ul>
        </div>
        <div className="q-foot" />
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  pending,
}: {
  label: string;
  value: number | null;
  pending: string;
}) {
  return (
    <tr>
      <td className="q-left">{label}</td>
      {value === null ? (
        <td colSpan={2} className="q-pending">
          {pending}
        </td>
      ) : (
        <>
          <td className="q-cur">$</td>
          <td className="q-amt">{usd(value)}</td>
        </>
      )}
    </tr>
  );
}
