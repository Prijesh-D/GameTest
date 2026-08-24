"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** VAPID keys are base64url; the browser wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);

  // Backed by a plain ArrayBuffer so it satisfies BufferSource, which excludes
  // the SharedArrayBuffer-backed variant.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type State =
  | "checking"
  | "unsupported"
  | "needs-install" // iOS: PushManager only exists once added to the home screen
  | "off"
  | "on"
  | "denied"
  | "working";

export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator)) return setState("unsupported");

      // On iOS this is the tell: Safari exposes PushManager to an installed PWA
      // only. In a normal tab it is simply absent, however modern the OS is.
      if (!("PushManager" in window)) {
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        return setState(isIos ? "needs-install" : "unsupported");
      }

      if (Notification.permission === "denied") return setState("denied");

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setState("working");
    setError(null);

    try {
      // Must be called from the user gesture that got us here — iOS rejects a
      // permission prompt that isn't tied to a tap.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });

      const json = subscription.toJSON();
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user!.id,
          endpoint: subscription.endpoint,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: "endpoint" },
      );

      if (error) throw error;
      setState("on");
    } catch (err) {
      console.error(err);
      setError("Couldn't turn on notifications.");
      setState("off");
    }
  }

  async function disable() {
    setState("working");
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      const supabase = createClient();
      await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
    setState("off");
  }

  if (state === "checking") return null;

  if (state === "needs-install") {
    return (
      <div className="card">
        <p className="font-medium">Turn on nudges</p>
        <p className="mt-1 text-sm text-muted">
          iPhone only allows notifications once the app is on your home screen. Tap{" "}
          <span className="text-text">Share</span> in Safari, then{" "}
          <span className="text-text">Add to Home Screen</span>, and open GymGroup from the icon.
        </p>
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className="card">
        <p className="font-medium">Nudges</p>
        <p className="mt-1 text-sm text-muted">This browser doesn&rsquo;t support notifications.</p>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="card">
        <p className="font-medium">Nudges are blocked</p>
        <p className="mt-1 text-sm text-muted">
          Re-enable notifications for GymGroup in your device settings, then come back.
        </p>
      </div>
    );
  }

  return (
    <div className="card flex items-center gap-3">
      <div className="flex-1">
        <p className="font-medium">Nudges</p>
        <p className="text-sm text-muted">
          {state === "on"
            ? "You'll get a push when someone calls you out."
            : "Get a push when a friend nudges you, or when you're behind pace."}
        </p>
        {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      </div>
      <button
        onClick={state === "on" ? disable : enable}
        disabled={state === "working"}
        className={state === "on" ? "btn-ghost px-4 py-2 text-sm" : "btn-primary px-4 py-2 text-sm"}
      >
        {state === "working" ? "…" : state === "on" ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
