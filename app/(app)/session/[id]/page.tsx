import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studySession } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { assertSectionOwnership } from "@/services/guide";
import * as auditService from "@/services/audit";
import type { MergedDiffPoint, MergedErrorCandidate } from "@/core/correction/verdict";
import { Badge } from "@astryxdesign/core/Badge";
import { DiffList } from "@/components/correction-view";
import { ErrorCandidatesPanel } from "@/components/error-candidates-panel";

// U24 « [Voir la session d'origine] » (USER_FLOW É5.1, DECISIONS.md bloc 5.3) —
// lecture seule : une StudySession passée est immuable (FUNCTIONS §7), toujours
// affichée en divulgation complète (REVAMP v2, 2026-07-15 : c'est désormais le
// cas de toute session, plus seulement des sessions closes). Badge « override »
// (FUNCTIONS §3 S8) si un événement a été journalisé sur cette session.
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();

  const sess = await db.query.studySession.findFirst({ where: eq(studySession.id, id) });
  if (!sess) notFound();

  let sec;
  try {
    sec = await assertSectionOwnership(sess.sectionId, userId);
  } catch {
    notFound();
  }

  if (sess.correction === null) notFound();

  const { diff, erreursCandidates } = sess.correction as {
    diff: MergedDiffPoint[];
    erreursCandidates: MergedErrorCandidate[];
  };

  const events = await auditService.forEntity("study_session", sess.id);
  const overridden = events.some((e) => e.type === "revelation_correction" || e.type === "override_verdict");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{sec.titre}</h1>
        <Badge variant="neutral" label={`tentative n°${sess.tentative}`} />
        {overridden && <Badge variant="warning" label="override" />}
      </div>
      <p className="text-sm text-secondary">
        Lecture seule — session close, verdict {sess.verdictFinal}.
      </p>

      <div className="rounded border border-border p-3">
        <h2 className="mb-2 text-sm font-semibold">Restitution soumise</h2>
        <p className="whitespace-pre-wrap text-sm">{sess.input}</p>
      </div>

      <DiffList diff={diff} />
      <ErrorCandidatesPanel
        candidates={erreursCandidates}
        rejected={erreursCandidates.map(() => false)}
        onChange={() => {}}
        readOnly
      />
    </div>
  );
}
