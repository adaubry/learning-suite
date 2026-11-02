import { NextResponse, type NextRequest } from "next/server";
import * as planner from "@/services/planner";

// Route Handler frappée par Vercel Cron (vercel.json) : housekeeping quotidien de
// la file (ordre manuel et re-file des jours passés). Aucune règle métier ici.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await planner.purgeExpired();
  return NextResponse.json({ ok: true });
}
