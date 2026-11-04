"use client";

import { useEffect } from "react";

/** Registra el service worker que habilita "Instalar app". */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
