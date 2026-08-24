import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

function codeMatches(supplied: string, expected: string) {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so guard first. The length of
  // the invite code is not a secret worth protecting.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.INVITE_CODE;
  if (!expected) {
    console.error("INVITE_CODE is not set — refusing all signups");
    return NextResponse.json({ error: "Signups are not configured." }, { status: 500 });
  }

  let body: { email?: string; password?: string; displayName?: string; inviteCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const displayName = body.displayName?.trim() ?? "";
  const inviteCode = body.inviteCode?.trim() ?? "";

  if (!codeMatches(inviteCode, expected)) {
    return NextResponse.json({ error: "That invite code isn't right." }, { status: 403 });
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (displayName.length < 1 || displayName.length > 40) {
    return NextResponse.json({ error: "Pick a name between 1 and 40 characters." }, { status: 400 });
  }

  // Created via the admin API with email_confirm already true. Supabase's
  // built-in mailer allows only 2 messages an hour, so the app never sends
  // one — the invite code is what gates access instead.
  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (createError) {
    const alreadyExists =
      createError.status === 422 || /already|registered|exists/i.test(createError.message);
    return NextResponse.json(
      { error: alreadyExists ? "That email is already registered — try logging in." : "Could not create the account." },
      { status: alreadyExists ? 409 : 500 },
    );
  }

  // Sign in immediately so the user lands in the app with cookies set.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return NextResponse.json(
      { error: "Account created, but sign-in failed. Try logging in." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
