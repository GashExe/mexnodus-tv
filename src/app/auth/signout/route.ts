import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", publicEnv.siteUrl), { status: 303 });
}
