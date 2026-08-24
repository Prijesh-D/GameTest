import { Feed } from "@/components/Feed";
import { createClient } from "@/lib/supabase/server";
import type { FeedItem, Reaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: items } = await supabase
    .from("workout_feed")
    .select("*")
    .order("finished_at", { ascending: false })
    .limit(50)
    .returns<FeedItem[]>();

  const { data: reactions } = await supabase
    .from("reactions")
    .select("*")
    .in("workout_id", (items ?? []).map((i) => i.id))
    .returns<Reaction[]>();

  return <Feed initialItems={items ?? []} initialReactions={reactions ?? []} userId={user!.id} />;
}
