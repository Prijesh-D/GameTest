import Link from "next/link";

const STEPS = [
  { icon: "1️⃣", text: "Open this page in Safari (not Chrome — iOS only allows Safari to install apps)." },
  { icon: "2️⃣", text: "Tap the Share button at the bottom of the screen." },
  { icon: "3️⃣", text: "Scroll down and tap “Add to Home Screen”." },
  { icon: "4️⃣", text: "Tap “Add”, then open GymGroup from the new icon." },
];

export default function InstallPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-6 py-10">
      <div className="mb-6 text-center">
        <div className="mb-3 text-5xl">📲</div>
        <h1 className="text-2xl font-bold">Put it on your home screen</h1>
        <p className="mt-2 text-sm text-muted">
          GymGroup runs as a proper app once it&rsquo;s installed — full screen, works without
          signal in the gym, and it&rsquo;s the only way iPhone will let it send you nudges.
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {STEPS.map((step) => (
          <li key={step.text} className="card flex gap-3 py-3 text-sm">
            <span>{step.icon}</span>
            <span className="flex-1">{step.text}</span>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-center text-xs text-muted">
        Safari has no install button of its own, so this is the only route — Apple doesn&rsquo;t
        support the one-tap prompt other browsers show.
      </p>

      <Link href="/" className="btn-ghost mt-6 w-full">
        Continue in the browser
      </Link>
    </main>
  );
}
