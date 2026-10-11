"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
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
};

type Draft = { name: string; price: string; description: string; stock: string };

const EMPTY: Draft = { name: "", price: "", description: "", stock: "" };

/**
 * Catálogo (automatizate.ec): los productos que el agente conoce y cuya foto
 * puede enviar por WhatsApp.
 */
export function CatalogClient() {
  const [products, setProducts] = useState<Product[] | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/catalog").catch(() => null);
    if (res?.ok) setProducts((await res.json()).products);
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
  onDone,
  onCancel,
}: {
  editing: Product | null;
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
