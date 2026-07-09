import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subject } from "@/db/schema";
import * as guide from "@/services/guide";
import * as planner from "@/services/planner";

// Route Handler frappée par Vercel Cron (vercel.json, tranché avec l'humain en
// récitation Bloc 6.4 — TECH_MAPPING §5/§10 : « Route Handlers natifs frappés
// par un cron »). Orchestration mince (AGENTS §2) : aucune règle métier ici,
// délègue tout à S3/S5. Deux tâches quotidiennes (FUNCTIONS §5) :
// - génération paresseuse (S3.lazyScheduler) pour chaque utilisateur actif —
//   redondant avec le hook de S5.todayQueue (app/(app)/page.tsx), qui ne couvre
//   que les visites effectives de l'accueil ; le cron rattrape les jours sans visite.
// - purge de l'ordre manuel + expiration de la re-file (S5.purgeExpired).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const activeUserIds = await db
    .selectDistinct({ userId: subject.userId })
    .from(subject)
    .where(eq(subject.statut, "active"));

  const lazyResults = await Promise.allSettled(
    activeUserIds.map(({ userId }) => guide.lazyScheduler(userId)),
  );
  await planner.purgeExpired();

  return NextResponse.json({
    ok: true,
    usersProcessed: activeUserIds.length,
    failures: lazyResults.filter((r) => r.status === "rejected").length,
  });
}
