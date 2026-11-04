"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Botón de la campana: activa o desactiva los avisos de mensajes nuevos en
 * este dispositivo. Se oculta si el navegador no soporta push (en iPhone solo
 * existe con la app añadida a la pantalla de inicio) o si el servidor no
 * tiene claves VAPID.
 */
export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    void (async () => {
      const res = await fetch("/api/push").catch(() => null);
      const data = (await res?.json().catch(() => null)) as { publicKey: string | null } | null;
      if (!data?.publicKey) return;
      setSupported(true);
      const reg = await navigator.serviceWorker.ready;
      setEnabled(Boolean(await reg.pushManager.getSubscription()) && Notification.permission === "granted");
    })();
  }, []);

  if (!supported) return null;

  async function toggle() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (enabled && existing) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setEnabled(false);
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        window.alert("Las notificaciones están bloqueadas. Actívalas en los ajustes del navegador o del teléfono.");
        return;
      }
      const keyRes = await fetch("/api/push");
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setEnabled(res.ok);
    } finally {
      setBusy(false);
    }
  }

  const label = enabled ? "Desactivar notificaciones" : "Activar notificaciones";
  return (
    <button
      aria-label={label}
      title={label}
      disabled={busy}
      className="rounded p-1 text-text-3 hover:text-foreground disabled:opacity-50"
      onClick={() => void toggle()}
    >
      {enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
    </button>
  );
}
