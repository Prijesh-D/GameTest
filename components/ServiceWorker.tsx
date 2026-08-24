"use client";

import { useEffect } from "react";

/**
 * Registers the Serwist-built service worker. Serwist emits public/sw.js at
 * build time but does not register it for us.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development") return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed", err);
    });
  }, []);

  return null;
}
