import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { ServiceWorker } from "@/components/ServiceWorker";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects, but a Server Component must not assume that.
  if (!user) redirect("/login");

  return (
    <>
      {/* pb-20 clears the fixed bottom nav. */}
      <div className="mx-auto min-h-[100dvh] w-full max-w-lg px-4 pb-20 pt-4">{children}</div>
      <BottomNav />
      <ServiceWorker />
    </>
  );
}
