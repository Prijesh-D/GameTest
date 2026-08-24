import { Leaderboard } from "@/components/Leaderboard";
import { createClient } from "@/lib/supabase/server";
import type { LeaderboardPeriod, LeaderboardRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: raw } = await searchParams;
  const period: LeaderboardPeriod =
    raw === "month" || raw === "all" ? raw : "week";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase.rpc("leaderboard", { period });
  const rows = (data ?? []) as LeaderboardRow[];

  return <Leaderboard rows={rows} period={period} userId={user!.id} />;
}
