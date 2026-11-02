import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fiche, reviewCard } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import * as reviewService from "@/services/review";
import { FocusShell } from "@/components/focus-shell";
import { LectureView } from "@/components/lecture-view";
import { BlurtingEditor } from "@/components/blurting-editor";
import { CorrectionView } from "@/components/correction-view";
import { Button } from "@astryxdesign/core/Button";
import {
  terminerLectureAction,
  submitBlurtingAction,
  retryCorrectionAction,
  relireAction,
  noterAction,
  abandonAction,
} from "./actions";

// Session sur une fiche (ARCHITECTURE.md v2 §2) — lecture → blurting →
// correction → note, la page rend l'état persisté du cycle.

function Message({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <FocusShell>
      <div className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{titre}</h1>
        {children}
      </div>
    </FocusShell>
  );
}

export default async function EtudePage({ params }: { params: Promise<{ ficheId: string }> }) {
  const { ficheId } = await params;
  const userId = await requireUserId();

  const f = await db.query.fiche.findFirst({ where: eq(fiche.id, ficheId) });
  if (!f) notFound();
  const titre = `${f.numero}. ${f.titre}`;

  let cycle;
  try {
    cycle = await session.start(userId, ficheId);
  } catch (e) {
    if (e instanceof session.SessionAlreadyOpenError) {
      const open = await session.findOpenCycle(userId);
      return (
        <Message titre={titre}>
          <p className="text-sm text-secondary">
            Une autre session est déjà ouverte{open ? ` (${open.ficheTitre})` : ""} — termine-la ou abandonne-la d&apos;abord.
          </p>
          <Link href={open ? `/etude/${open.ficheId}` : "/"} className="self-start text-sm underline">
            Reprendre cette session
          </Link>
        </Message>
      );
    }
    if (e instanceof session.FicheNonEtudiableError) {
      return (
        <Message titre={titre}>
          <p className="text-sm text-secondary">{e.message}</p>
          <Link href="/" className="self-start text-sm underline">
            Retour à l&apos;accueil
          </Link>
        </Message>
      );
    }
    throw e;
  }

  if (cycle.etat === "lecture") {
    const numero = await session.prochaineTentative(cycle.id);
    return (
      <FocusShell wide>
        <LectureView
          ficheTitre={titre}
          contenu={f.contenu}
          relecture={numero === 2}
          action={terminerLectureAction.bind(null, cycle.id, ficheId)}
          abandonAction={abandonAction.bind(null, cycle.id)}
        />
      </FocusShell>
    );
  }

  if (cycle.etat === "blurting") {
    const numero = await session.prochaineTentative(cycle.id);
    const card =
      cycle.type === "revision"
        ? await db.query.reviewCard.findFirst({ where: eq(reviewCard.ficheId, ficheId), columns: { reps: true } })
        : null;
    return (
      <FocusShell>
        <BlurtingEditor
          ficheTitre={titre}
          tentative={numero}
          type={cycle.type}
          rappelNumero={card ? card.reps + 1 : undefined}
          action={submitBlurtingAction.bind(null, cycle.id, ficheId)}
          abandonAction={abandonAction.bind(null, cycle.id)}
        />
      </FocusShell>
    );
  }

  if (cycle.etat === "correction") {
    const current = await session.getCurrentCorrection(userId, cycle.id);

    if (current.status === "pending") {
      return (
        <Message titre={titre}>
          <p className="text-sm text-error">La correction a échoué. Ta restitution est sauvegardée.</p>
          <div className="flex flex-wrap gap-2">
            <form action={retryCorrectionAction.bind(null, cycle.id, ficheId)}>
              <Button type="submit" size="sm" label="Relancer la correction" />
            </form>
            <form action={abandonAction.bind(null, cycle.id)}>
              <Button type="submit" size="sm" variant="ghost" label="Abandonner" />
            </form>
          </div>
        </Message>
      );
    }

    const [notes, preview] = await Promise.all([
      session.notesPermises(cycle.id),
      reviewService.preview(userId, ficheId),
    ]);
    return (
      <FocusShell>
        <CorrectionView
          ficheTitre={titre}
          numero={current.numero}
          verdict={current.verdict}
          input={current.input}
          points={current.points}
          erreursCandidates={current.erreursCandidates}
          notes={notes}
          preview={preview}
          relireAction={current.numero === 1 ? relireAction.bind(null, cycle.id, ficheId) : undefined}
          noterAction={noterAction.bind(null, cycle.id)}
          abandonAction={abandonAction.bind(null, cycle.id)}
        />
      </FocusShell>
    );
  }

  // clos : start() reprend un cycle ouvert ou en crée un, jamais un cycle clos.
  notFound();
}
