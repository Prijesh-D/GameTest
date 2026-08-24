"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    inviteCode: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Something went wrong." }));
      setError(error);
      setBusy(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mb-3 text-5xl">🏋️</div>
        <h1 className="text-2xl font-bold">Join the group</h1>
        <p className="mt-1 text-sm text-muted">You&rsquo;ll need the invite code from your mates.</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          className="field"
          placeholder="Your name"
          autoComplete="nickname"
          maxLength={40}
          value={form.displayName}
          onChange={set("displayName")}
          required
        />
        <input
          className="field"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Email"
          value={form.email}
          onChange={set("email")}
          required
        />
        <input
          className="field"
          type="password"
          autoComplete="new-password"
          placeholder="Password (8+ characters)"
          minLength={8}
          value={form.password}
          onChange={set("password")}
          required
        />
        <input
          className="field"
          placeholder="Invite code"
          autoCapitalize="none"
          autoComplete="off"
          value={form.inviteCode}
          onChange={set("inviteCode")}
          required
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button type="submit" className="btn-primary mt-1" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p className="mt-2 text-center text-sm text-muted">
          Already in?{" "}
          <Link href="/login" className="text-accent underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
