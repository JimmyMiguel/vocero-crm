"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Product = {
  id: string;
  name: string;
  price: string | null;
  description: string | null;
  stock: number | null;
  imageAssetId: string | null;
  adIds: string[];
};

/** Un anuncio del que ya llegaron clientes (`/api/catalog/ads`). */
type RecentAd = { sourceId: string; headline: string | null; conversaciones: number };

type Draft = { name: string; price: string; description: string; stock: string; adIds: string };

const EMPTY: Draft = { name: "", price: "", description: "", stock: "", adIds: "" };

/** Los IDs escritos en el campo, en orden y sin repetir. */
function idsDelCampo(texto: string): string[] {
  return [...new Set(texto.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean))];
}

/**
 * Catálogo (automatizate.ec): los productos que el agente conoce y cuya foto
 * puede enviar por WhatsApp.
 */
export function CatalogClient() {
  const [products, setProducts] = useState<Product[] | null>(null);

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

  async function remove(p: Product) {
    if (!confirm(`¿Eliminar "${p.name}" del catálogo?`)) return;
    await fetch(`/api/catalog/${p.id}`, { method: "DELETE" }).catch(() => null);
    if (editing?.id === p.id) setEditing(null);
    void refetch();
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-[17px] font-bold tracking-tight">Catálogo</h2>
        {products && (
          <span className="text-sm text-muted-foreground">
            {products.length} {products.length === 1 ? "producto" : "productos"}
          </span>
        )}
      </header>

      <div className="grid gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[380px_1fr]">
        <ProductForm
          key={editing?.id ?? "nuevo"}
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
          ) : products.length === 0 ? (
            <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              Sin productos todavía. Agrega el primero: el agente lo ofrecerá y
              enviará su foto.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-lg border bg-card">
                  <div className="flex aspect-square items-center justify-center bg-muted">
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
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{p.name}</p>
                      {p.stock === 0 ? (
                        <Badge variant="warning">Agotado</Badge>
                      ) : p.stock !== null ? (
                        <Badge variant="secondary">Stock {p.stock}</Badge>
                      ) : null}
                    </div>
                    {p.price && <p className="text-sm font-semibold text-primary">{p.price}</p>}
                    {p.adIds.length > 0 && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Megaphone className="h-3.5 w-3.5" />
                        {p.adIds.length === 1 ? "1 anuncio conectado" : `${p.adIds.length} anuncios conectados`}
                      </p>
                    )}
                    {p.description && (
                      <p className="line-clamp-3 text-xs text-muted-foreground">{p.description}</p>
                    )}
                    <div className="flex justify-end gap-1 pt-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar producto"
                        onClick={() => setEditing(p)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar producto"
                        onClick={() => void remove(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductForm({
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
  const [draft, setDraft] = useState<Draft>(
    editing
      ? {
          name: editing.name,
          price: editing.price ?? "",
          description: editing.description ?? "",
          stock: editing.stock === null ? "" : String(editing.stock),
          adIds: editing.adIds.join("\n"),
        }
      : EMPTY
  );
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(
    editing?.imageAssetId ? `/api/media/${editing.imageAssetId}` : null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(file: File | null) {
    setImage(file);
    if (file) setPreview(URL.createObjectURL(file));
  }

  async function save() {
    if (!draft.name.trim()) return;
    setSaving(true);
    setError(null);
    const form = new FormData();
    form.set("name", draft.name);
    form.set("price", draft.price);
    form.set("description", draft.description);
    form.set("stock", draft.stock);
    form.set("adIds", draft.adIds);
    if (image) form.set("image", image);
    const res = await fetch(editing ? `/api/catalog/${editing.id}` : "/api/catalog", {
      method: editing ? "PATCH" : "POST",
      body: form,
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error?.message ?? body?.message ?? "No se pudo guardar");
      return;
    }
    onDone();
  }

  const set = (key: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>{editing ? "Editar producto" : "Nuevo producto"}</CardTitle>
        <CardDescription>
          El agente solo ofrece lo que está aquí. Con stock 0 deja de ofrecerlo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted text-sm text-muted-foreground hover:border-brand"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1">
              <ImageIcon className="h-7 w-7" />
              Subir foto (JPG o PNG)
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Nombre</Label>
          <Input id="p-name" value={draft.name} onChange={set("name")} placeholder="Sérum de vitamina C 30 ml" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-price">Precio</Label>
            <Input id="p-price" value={draft.price} onChange={set("price")} placeholder="$18.90" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-stock">Stock</Label>
            <Input
              id="p-stock"
              inputMode="numeric"
              value={draft.stock}
              onChange={set("stock")}
              placeholder="Sin control"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-desc">Descripción</Label>
          <Textarea
            id="p-desc"
            rows={4}
            value={draft.description}
            onChange={set("description")}
            placeholder="Para qué sirve, tipo de piel, modo de uso…"
          />
        </div>
        <AdIdsField
          value={draft.adIds}
          onChange={(adIds) => setDraft((d) => ({ ...d, adIds }))}
          ads={ads}
          products={products}
          editingId={editing?.id ?? null}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={!draft.name.trim() || saving}>
            {editing ? "Guardar cambios" : (<><Plus className="h-4 w-4" /> Agregar</>)}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={onCancel}>
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
