import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    const { client } = await requireAuthenticatedSupabaseClient();
    const { data, error } = await client.rpc("get_rating_rebuild_status", { p_group_id: groupId });
    if (error) return NextResponse.json({ message: "Could not load rating status." }, { status: 403 });
    return NextResponse.json(data ?? { status: null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
  }
}
