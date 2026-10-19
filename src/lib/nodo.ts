import type { FichaDto } from "./types";

/**
 * NODO (nodoec.com) — importación de China en contenedor compartido.
 *
 * Reglas del negocio que comparten la ficha, el tablero, los contenedores y la
 * cotización. Los datos del cliente viven en `contact.ficha` con estas claves
 * fijas: así el agente las llena con la misma puerta que usa para todo lo
 * demás, y el dueño las corrige desde la ficha.
 */

export const NODO_GREEN = "#00763D";

/** Servicios de importación por metro cúbico (flete, agenciamiento, puerto). */
export const USD_POR_CBM = 600;
/** Transferencia al proveedor + ISD, aproximado sobre la mercadería. */
export const TASA_TRANSFERENCIA_ISD = 0.08;
export const DIAS_TRANSITO = 55;
export const VALIDEZ_COTIZACION_DIAS = 7;
/** Últimas cotizaciones emitidas a mano por NODO llegaban a la 085. */
export const PRIMER_NUMERO_COTIZACION = 86;

export const NODO_ETAPAS = [
  "Nuevo contacto",
  "Buscando proveedor",
  "Esperando confirmación del cliente",
  "Muestra en aprobación",
  "Pago confirmado",
  "En producción",
  "Inspección en China",
  "En tránsito",
  "Impuestos de aduana pendientes",
  "Entregado",
] as const;

export const SERVICIOS = [
  "Importación",
  "Maquinaria",
  "Marca propia",
  "Verificación",
  "Viaje a ferias",
] as const;

/** Claves de la ficha, en el orden en que se muestran. */
export const NODO_CAMPOS = {
  ciudad: "ciudad",
  tieneProveedor: "tiene_proveedor",
  producto: "producto",
  cantidad: "cantidad",
  cbm: "cbm",
  servicio: "servicio",
  valorMercaderia: "valor_mercaderia",
  tributos: "tributos",
  imagenReferencia: "imagen_referencia",
} as const;

export const NODO_CLAVES: string[] = Object.values(NODO_CAMPOS);

export type NodoFicha = {
  ciudad: string | null;
  tieneProveedor: boolean | null;
  producto: string | null;
  cantidad: number | null;
  cbm: number | null;
  servicio: string | null;
  valorMercaderia: number | null;
  tributos: number | null;
  imagenReferencia: string | null;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.,-]/g, "").replace(",", "."));
    return v.trim() && Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["si", "sí", "true"].includes(t)) return true;
    if (["no", "false"].includes(t)) return false;
  }
  return null;
}

/** Lee la ficha libre como datos de NODO. Lo que no se entiende queda en null. */
export function leerNodoFicha(ficha: FichaDto | Record<string, unknown> | null | undefined): NodoFicha {
  const f = (ficha ?? {}) as Record<string, unknown>;
  return {
    ciudad: str(f[NODO_CAMPOS.ciudad]),
    tieneProveedor: bool(f[NODO_CAMPOS.tieneProveedor]),
    producto: str(f[NODO_CAMPOS.producto]),
    cantidad: num(f[NODO_CAMPOS.cantidad]),
    cbm: num(f[NODO_CAMPOS.cbm]),
    servicio: str(f[NODO_CAMPOS.servicio]),
    valorMercaderia: num(f[NODO_CAMPOS.valorMercaderia]),
    tributos: num(f[NODO_CAMPOS.tributos]),
    imagenReferencia: str(f[NODO_CAMPOS.imagenReferencia]),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Costo estimado del servicio: CBM × $600, sin impuestos. */
export function costoServicio(cbm: number | null): number | null {
  return cbm === null ? null : r2(cbm * USD_POR_CBM);
}

export type Inversion = {
  mercaderia: number | null;
  transferenciaIsd: number | null;
  servicios: number | null;
  tributos: number | null;
  total: number;
  /** El total no incluye tributos porque aún no se calcularon. */
  sinTributos: boolean;
};

/** Desglose de la cotización, igual al que NODO entrega a sus clientes. */
export function calcularInversion(f: NodoFicha): Inversion {
  const mercaderia = f.valorMercaderia;
  const transferenciaIsd = mercaderia === null ? null : r2(mercaderia * TASA_TRANSFERENCIA_ISD);
  const servicios = costoServicio(f.cbm);
  const tributos = f.tributos;
  const total = r2((mercaderia ?? 0) + (transferenciaIsd ?? 0) + (servicios ?? 0) + (tributos ?? 0));
  return { mercaderia, transferenciaIsd, servicios, tributos, total, sinTributos: tributos === null };
}

/** `1234.5` → `1.234,50` (formato de las cotizaciones de NODO). */
export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function cbmTexto(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("es-EC", { maximumFractionDigits: 2 })} CBM`;
}

/** `0001-0001-086` */
export function numeroCotizacion(n: number): string {
  return `0001-0001-${String(n).padStart(3, "0")}`;
}

/** Suma días a una fecha `YYYY-MM-DD` sin pasar por zonas horarias. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** `2026-10-25` → `25 de octubre, 2026` (o sin año). */
export function fechaLarga(fecha: string, conAnio = true): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const txt = d.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return conAnio ? `${txt}, ${d.getUTCFullYear()}` : txt;
}

export function fechaCorta(fecha: string): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export const NOTAS_IMPORTANTES = [
  "Las fechas brindadas son **estimadas y están sujetas a la variación** de las navieras y procesos de aduana.",
  "No se emitirá comprobante por conceptos correspondientes a liquidaciones aduaneras internas puras (como ajustes de SENAE, multas por aforo, etc.) salvo que se facture como “Gestión de Compra/Servicio Logístico”.",
  "Los Gastos Logísticos + Impuestos y tributos (Aranceles, FODINFA, IVA) se deben cancelar **una semana antes de que el contenedor llegue** al Puerto de Guayaquil (o puerto ecuatoriano de destino).",
];

export const TERMINOS: [string, string][] = [
  ["Moneda y Pagos", "Todos los pagos se realizan en dólares de los Estados Unidos (USD)."],
  ["Propiedad Intelectual", "Todas las marcas de los productos deben ser verificadas previamente por el cliente. No se aceptan réplicas ni marcas con medidas en frontera o prohibiciones de propiedad intelectual."],
  ["Tiempos de Proveedor y Recepción en Bodega", "NODO no se hace responsable por los retrasos en la entrega de la carga por parte de las fábricas o proveedores en China. Si la mercadería llega a nuestros almacenes (Yiwu o Guangzhou) fuera del rango de fechas indicado por su asesor, será desplazada para el embarque del siguiente contenedor disponible y el cliente asumirá un recargo de **$30.00 USD** por concepto de almacenaje adicional."],
  ["Pagos Tardíos", "Los pagos realizados fuera de las fechas límite establecidas estarán sujetos a un recargo por mora de **$10.00 USD** por cada día de retraso."],
  ["Abandono en Destino", "Se procederá a cobrar **$10.00 USD** diarios por concepto de almacenaje en Ecuador si el cliente no retira o coordina el envío de su pedido en el plazo acordado tras la liberación aduanera."],
  ["Envíos Nacionales", "Los envíos a provincias se realizan a través de agencias terrestres (ej. Servientrega, Tramaco Express, o cooperativas de transporte), previo pago del flete interno por parte del cliente. Costos aproximados desde **$10.00 USD.**"],
  ["Cargas Pesadas", "Las mercancías cuyo peso sea mayor a 200 kg por bulto tendrán un costo adicional por manipuleo de carga pesada; el cliente deberá consultar la tarifa exacta con nuestro equipo logístico."],
  ["Reembolsos", "Una vez iniciado el proceso de consolidación y flete, no existe opción de reembolso."],
  ["Ajustes Aduaneros (SENAE)", "Si el Servicio Nacional de Aduana del Ecuador (SENAE) determina un ajuste de valor (duda razonable) o aplica cambios de partida arancelaria (Ad-valorem), el cliente asumirá en su totalidad el pago de la diferencia de los tributos generados."],
  ["Cobertura del CBM", "El costo cotizado por metro cúbico (CBM) incluye: Flete Internacional, Agenciamiento Aduanero y Costos operativos en puerto de destino."],
  ["Mercancía Restringida", "No se aceptan productos de importación prohibida o que requieran permisos específicos no gestionados previamente (ej. regulaciones INEN, ARCSA, Agrocalidad)."],
  ["Documentación", "Los documentos comerciales de origen (Invoice, Packing List, Certificado de Origen) deben ser entregados a tiempo. De lo contrario, el cliente perderá la opción de acogerse a beneficios arancelarios y acuerdos comerciales vigentes."],
  ["Protección Legal", "En caso de que el cliente intente importar carga ilícita, no declarada, o que vulnere la ley, perjudicando las operaciones de NODO, se procederá a tomar las acciones legales correspondientes por daños y perjuicios."],
  ["Propiedad por Impago", "Si el cliente se niega a pagar los tributos aduaneros o los gastos logísticos/administrativos de su cotización en los plazos establecidos, NODO pasará a ser el propietario total de la carga para recuperar los costos operativos, declarándola en abandono por parte del cliente."],
  ["Mermas de Origen", "NODO entrega el pedido en las mismas condiciones y cantidades en las que el proveedor chino lo despachó a nuestras bodegas. No somos responsables de faltantes, mermas o defectos de fábrica provenientes del proveedor."],
  ["Titularidad de Importación", "Para efectos de agilidad logística en carga consolidada, las mercancías serán declaradas a nombre de NODO (o su figura legal designada)."],
  ["Facturación", "Se emitirá el comprobante electrónico (Factura) correspondiente a su importación con base en la estrategia de declaración aduanera y el servicio brindado. El monto facturado corresponderá al valor de la mercancía más los gastos logísticos ejecutados."],
];
