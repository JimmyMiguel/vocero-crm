"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bath,
  BedDouble,
  Car,
  ImageIcon,
  ImagePlus,
  MapPin,
  Megaphone,
  Pencil,
  Plus,
  Ruler,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ProductImage = { id: string; assetId: string };

type Product = {
  id: string;
  name: string;
  price: string | null;
  description: string | null;
  stock: number | null;
  imageAssetId: string | null;
  images: ProductImage[];
  operation: string | null;
  propertyType: string | null;
  city: string | null;
  sector: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  lotM2: number | null;
  parking: number | null;
  features: string | null;
  locationUrl: string | null;
  status: string;
  adIds: string[];
};

/** Un anuncio del que ya llegaron clientes (`/api/catalog/ads`). */
type RecentAd = { sourceId: string; headline: string | null; conversaciones: number };

/** Los IDs escritos en el campo, en orden y sin repetir. */
function idsDelCampo(texto: string): string[] {
  return [...new Set(texto.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean))];
}

const FIELDS = [
  "name",
  "price",
  "description",
  "operation",
  "propertyType",
  "city",
  "sector",
  "bedrooms",
  "bathrooms",
  "areaM2",
  "lotM2",
  "parking",
  "features",
  "locationUrl",
  "status",
] as const;

type Draft = Record<(typeof FIELDS)[number], string> & { adIds: string };

const EMPTY: Draft = {
  name: "",
  price: "",
  description: "",
  operation: "venta",
  propertyType: "Casa",
  city: "",
  sector: "",
  bedrooms: "",
  bathrooms: "",
  areaM2: "",
  lotM2: "",
  parking: "",
  features: "",
  locationUrl: "",
  status: "disponible",
  adIds: "",
};

const TYPES = [
  "Casa",
  "Departamento",
  "Suite",
  "Terreno",
  "Local comercial",
  "Oficina",
  "Bodega",
  "Casa de playa",
];

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  disponible: { label: "Disponible", variant: "success" },
  reservado: { label: "Reservado", variant: "warning" },
  vendido: { label: "Vendido", variant: "secondary" },
  arrendado: { label: "Arrendado", variant: "secondary" },
};

const MAX_IMAGES = 15;
/** Fotos por petición: así ninguna subida pesa demasiado. */
const UPLOAD_BATCH = 3;

const selectClass = "h-9 w-full rounded-md border border-input bg-card px-2 text-sm";

/**
 * Propiedades (cliente/inmobiliaria): la ficha de cada inmueble con sus
 * fotos. El agente ofrece solo las disponibles y envía sus fotos por WhatsApp.
 */
export function CatalogClient() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [opFilter, setOpFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todos");

  const [ads, setAds] = useState<RecentAd[]>([]);

  const refetch = useCallback(async () => {
    const [res, adsRes] = await Promise.all([
      fetch("/api/catalog").catch(() => null),
      fetch("/api/catalog/ads").catch(() => null),
    ]);
    if (res?.ok) setProducts((await res.json()).products);
    if (adsRes?.ok) setAds((await adsRes.json()).ads);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const [editing, setEditing] = useState<Product | null>(null);

  const visible = useMemo(
    () =>
      (products ?? []).filter(
        (p) =>
          (opFilter === "todas" || p.operation === opFilter) &&
          (statusFilter === "todos" || p.status === statusFilter)
      ),
    [products, opFilter, statusFilter]
  );

  async function remove(p: Product) {
    if (!confirm(`¿Eliminar "${p.name}"? Se borran también sus fotos.`)) return;
    await fetch(`/api/catalog/${p.id}`, { method: "DELETE" }).catch(() => null);
    if (editing?.id === p.id) setEditing(null);
    void refetch();
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-[17px] font-bold tracking-tight">Propiedades</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por operación"
            value={opFilter}
            onChange={(e) => setOpFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todas">Venta y arriendo</option>
            <option value="venta">Venta</option>
            <option value="arriendo">Arriendo</option>
          </select>
          <select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todos los estados</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          {products && (
            <span className="text-sm text-muted-foreground">
              {visible.length} {visible.length === 1 ? "propiedad" : "propiedades"}
            </span>
          )}
        </div>
      </header>

      <div className="grid gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[420px_1fr]">
        <PropertyForm
          key={editing?.id ?? "nueva"}
          editing={editing}
          ads={ads}
          products={products ?? []}
          onDone={() => {
            setEditing(null);
            void refetch();
          }}
          onCancel={() => setEditing(null)}
        />

        <div>
          {products === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : visible.length === 0 ? (
            <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              {products.length === 0
                ? "Sin propiedades todavía. Agrega la primera con sus fotos: el agente la ofrecerá por WhatsApp."
                : "Ninguna propiedad con esos filtros."}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((p) => (
                <PropertyCard
                  key={p.id}
                  p={p}
                  onEdit={() => setEditing(p)}
                  onRemove={() => void remove(p)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function PropertyCard({
  p,
  onEdit,
  onRemove,
}: {
  p: Product;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const status = STATUS[p.status] ?? { label: p.status, variant: "secondary" as const };
  const where = [p.sector, p.city].filter(Boolean).join(", ");
  const area = p.areaM2 ?? p.lotM2;
  return (
    <li className="overflow-hidden rounded-lg border bg-card">
      <div className="relative flex aspect-[4/3] items-center justify-center bg-muted">
        {p.imageAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${p.imageAssetId}`}
            alt={p.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          {p.operation && (
            <Badge variant="default" className="capitalize">
              {p.operation}
            </Badge>
          )}
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        {p.images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
            {p.images.length} fotos
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <p className="font-medium leading-tight">{p.name}</p>
        {p.price && <p className="text-sm font-semibold text-primary">{p.price}</p>}
        {(p.propertyType || where) && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {[p.propertyType, where].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-2">
          {p.bedrooms !== null && (
            <span className="flex items-center gap-1" title="Habitaciones">
              <BedDouble className="h-3.5 w-3.5" /> {p.bedrooms}
            </span>
          )}
          {p.bathrooms !== null && (
            <span className="flex items-center gap-1" title="Baños">
              <Bath className="h-3.5 w-3.5" /> {String(p.bathrooms).replace(".", ",")}
            </span>
          )}
          {p.parking !== null && (
            <span className="flex items-center gap-1" title="Parqueaderos">
              <Car className="h-3.5 w-3.5" /> {p.parking}
            </span>
          )}
          {area !== null && (
            <span className="flex items-center gap-1" title="Área">
              <Ruler className="h-3.5 w-3.5" /> {area} m²
            </span>
          )}
        </div>
        {p.adIds.length > 0 && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Megaphone className="h-3.5 w-3.5" />
            {p.adIds.length === 1 ? "1 anuncio conectado" : `${p.adIds.length} anuncios conectados`}
          </p>
        )}
        <div className="flex items-center justify-end gap-1 pt-1">
          {p.locationUrl && (
            <a
              href={p.locationUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Ver ubicación"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
            >
              <MapPin className="h-4 w-4" />
            </a>
          )}
          <Button variant="ghost" size="icon" aria-label="Editar propiedad" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Eliminar propiedad" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * Las fotos del celular suelen pasar los 5 MB que acepta WhatsApp: se reducen
 * a JPG de 1600 px como máximo antes de subirlas. Si el navegador no puede
 * leerla (p. ej. HEIC fuera de Safari), se sube tal cual y el servidor decide.
 */
async function compressImage(file: File): Promise<File> {
  if (file.size < 1_200_000 && /^image\/(jpeg|png)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function toDraft(p: Product | null): Draft {
  if (!p) return EMPTY;
  const d = { ...EMPTY };
  for (const k of FIELDS) {
    const v = p[k];
    if (v === null || v === undefined) d[k] = k === "status" ? "disponible" : "";
    else d[k] = k === "bathrooms" ? String(v).replace(".", ",") : String(v);
  }
  d.adIds = p.adIds.join("\n");
  return d;
}

function PropertyForm({
  editing,
  ads,
  products,
  onDone,
  onCancel,
}: {
  editing: Product | null;
  ads: RecentAd[];
  products: Product[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(editing));
  const existing = editing?.images ?? [];
  const [removed, setRemoved] = useState<string[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: File; url: string }[]>([]);
  // Si una subida falla después de crear la ficha, el siguiente intento la edita.
  const [savedId, setSavedId] = useState<string | null>(editing?.id ?? null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const kept = existing.filter((img) => !removed.includes(img.id));
  const ordered = coverId
    ? [...kept.filter((i) => i.id === coverId), ...kept.filter((i) => i.id !== coverId)]
    : kept;
  const total = kept.length + pending.length;

  function pick(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files).slice(0, Math.max(0, MAX_IMAGES - total));
    setError(files.length > list.length ? `Máximo ${MAX_IMAGES} fotos por propiedad` : null);
    setPending((prev) => [
      ...prev,
      ...list.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send(url: string, method: "POST" | "PATCH", form: FormData) {
    const res = await fetch(url, { method, body: form }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error?.message ?? body?.message ?? "No se pudo guardar");
      return null;
    }
    return (await res.json()).product as { id: string };
  }

  async function save() {
    if (!draft.name.trim()) return;
    setError(null);
    setSaving("Guardando…");

    // 1) La ficha, las fotos quitadas y la portada.
    const form = new FormData();
    for (const k of FIELDS) form.set(k, draft[k]);
    form.set("adIds", draft.adIds);
    for (const id of removed) form.append("removeImages", id);
    if (coverId) form.set("coverImage", coverId);
    const saved = await send(
      savedId ? `/api/catalog/${savedId}` : "/api/catalog",
      savedId ? "PATCH" : "POST",
      form
    );
    if (!saved) return setSaving(null);
    setSavedId(saved.id);

    // 2) Las fotos nuevas, de a pocas.
    for (let i = 0; i < pending.length; i += UPLOAD_BATCH) {
      const end = Math.min(i + UPLOAD_BATCH, pending.length);
      setSaving(`Subiendo fotos ${end} de ${pending.length}…`);
      const batch = new FormData();
      for (const { file } of pending.slice(i, end)) {
        batch.append("images", await compressImage(file));
      }
      if (!(await send(`/api/catalog/${saved.id}`, "PATCH", batch))) {
        // Lo anterior ya quedó guardado; quedan pendientes solo las que fallaron.
        setPending((prev) => prev.slice(i));
        return setSaving(null);
      }
    }
    setSaving(null);
    onDone();
  }

  const set = (key: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const field = (
    key: keyof Draft,
    label: string,
    placeholder = "",
    inputMode?: "numeric" | "decimal"
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`p-${key}`}>{label}</Label>
      <Input
        id={`p-${key}`}
        value={draft[key]}
        onChange={set(key)}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </div>
  );

  const badge = "rounded bg-black/60 px-1 text-[10px] text-white";
  const iconBtn = "rounded bg-black/60 p-0.5 text-white";

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>{editing ? "Editar propiedad" : "Nueva propiedad"}</CardTitle>
        <CardDescription>
          El agente solo ofrece las disponibles y envía hasta 4 fotos por WhatsApp. La primera es
          la portada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {ordered.map((img, i) => (
              <div key={img.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${img.assetId}`} alt="" className="h-full w-full object-cover" />
                {i === 0 && <span className={`absolute left-1 top-1 ${badge}`}>Portada</span>}
                <div className="absolute right-1 top-1 flex gap-1">
                  {i !== 0 && (
                    <button
                      type="button"
                      aria-label="Usar como portada"
                      title="Usar como portada"
                      onClick={() => setCoverId(img.id)}
                      className={iconBtn}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Quitar foto"
                    onClick={() => setRemoved((r) => [...r, img.id])}
                    className={iconBtn}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {pending.map((p, i) => (
              <div
                key={p.url}
                className="relative aspect-square overflow-hidden rounded-md border border-dashed bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover opacity-80" />
                {ordered.length === 0 && i === 0 && (
                  <span className={`absolute left-1 top-1 ${badge}`}>Portada</span>
                )}
                <button
                  type="button"
                  aria-label="Quitar foto"
                  onClick={() => setPending((prev) => prev.filter((x) => x !== p))}
                  className={`absolute right-1 top-1 ${iconBtn}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {total < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted text-xs text-muted-foreground hover:border-brand"
              >
                <ImagePlus className="h-6 w-6" />
                Agregar fotos
              </button>
            )}
          </div>
          <p className="text-xs text-text-3">
            {total}/{MAX_IMAGES} fotos · puedes elegir varias a la vez; las grandes se reducen solas.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => pick(e.target.files)}
          />
        </div>

        {field("name", "Título", "Casa 3 hab. en Samborondón")}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-operation">Operación</Label>
            <select id="p-operation" value={draft.operation} onChange={set("operation")} className={selectClass}>
              <option value="venta">Venta</option>
              <option value="arriendo">Arriendo</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-propertyType">Tipo</Label>
            <select
              id="p-propertyType"
              value={draft.propertyType}
              onChange={set("propertyType")}
              className={selectClass}
            >
              {[...new Set([...TYPES, draft.propertyType].filter(Boolean))].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field("price", "Precio", draft.operation === "arriendo" ? "$650/mes" : "$175.000")}
          <div className="space-y-1.5">
            <Label htmlFor="p-status">Estado</Label>
            <select id="p-status" value={draft.status} onChange={set("status")} className={selectClass}>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field("city", "Ciudad", "Guayaquil")}
          {field("sector", "Sector / urbanización", "Samborondón km 10")}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {field("bedrooms", "Habitaciones", "3", "numeric")}
          {field("bathrooms", "Baños", "2,5", "decimal")}
          {field("parking", "Parqueaderos", "2", "numeric")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field("areaM2", "m² construcción", "160", "numeric")}
          {field("lotM2", "m² terreno", "200", "numeric")}
        </div>

        {field("features", "Amenidades", "Piscina, guardianía 24/7, patio")}

        <div className="space-y-1.5">
          <Label htmlFor="p-description">Descripción</Label>
          <Textarea
            id="p-description"
            rows={4}
            value={draft.description}
            onChange={set("description")}
            placeholder="Lo que la hace especial, alícuota, cercanía a colegios, si acepta mascotas…"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-locationUrl">Ubicación (Google Maps)</Label>
          <Input
            id="p-locationUrl"
            value={draft.locationUrl}
            onChange={set("locationUrl")}
            placeholder="https://maps.app.goo.gl/…"
          />
          <p className="text-xs text-text-3">Solo para el equipo: el agente no la comparte.</p>
        </div>

        <AdIdsField
          value={draft.adIds}
          onChange={(adIds) => setDraft((d) => ({ ...d, adIds }))}
          ads={ads}
          products={products}
          editingId={editing?.id ?? null}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-2">
          <Button onClick={() => void save()} disabled={!draft.name.trim() || saving !== null}>
            {saving ??
              (editing ? (
                "Guardar cambios"
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Agregar propiedad
                </>
              ))}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={onCancel} disabled={saving !== null}>
              Cancelar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Los anuncios de Meta que llevan a este producto. Se pega el «Identificador
 * del anuncio» o se toca uno de los anuncios de los que ya llegaron clientes.
 */
function AdIdsField({
  value,
  onChange,
  ads,
  products,
  editingId,
}: {
  value: string;
  onChange: (value: string) => void;
  ads: RecentAd[];
  products: Product[];
  editingId: string | null;
}) {
  const actuales = idsDelCampo(value);
  const duenoDe = (sourceId: string) =>
    products.find((p) => p.id !== editingId && p.adIds.includes(sourceId)) ?? null;
  const sugeridos = ads.filter((a) => !actuales.includes(a.sourceId)).slice(0, 8);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="p-ads">IDs de anuncios de Meta</Label>
      <Textarea
        id="p-ads"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="120212345678900000"
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted-foreground">
        Copia el «Identificador del anuncio» en el Administrador de anuncios (no el de la campaña
        ni el del conjunto). Quien escriba desde ese anuncio llega conectado a este producto. Si
        no lo pegas, el agente lo conecta solo cuando el anuncio nombra el producto.
      </p>
      {sugeridos.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium">Anuncios de los que ya te escribieron</p>
          <ul className="flex flex-wrap gap-1.5">
            {sugeridos.map((a) => {
              const dueno = duenoDe(a.sourceId);
              return (
                <li key={a.sourceId}>
                  <button
                    type="button"
                    onClick={() => onChange([...actuales, a.sourceId].join("\n"))}
                    className="max-w-full rounded-full border px-2.5 py-1 text-left text-xs hover:border-brand"
                    title={`ID ${a.sourceId}`}
                  >
                    <span className="font-medium">+ {a.headline ?? "Anuncio sin título"}</span>
                    <span className="text-muted-foreground">
                      {" "}· {a.conversaciones} {a.conversaciones === 1 ? "chat" : "chats"}
                      {dueno ? ` · ahora en ${dueno.name}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
