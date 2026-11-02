import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fiche, reviewCard } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import { FicheIntrouvableError } from "@/services/ownership";
import * as reviewService from "@/services/review";
import { FocusShell } from "@/components/focus-shell";
import { LectureView } from "@/components/lecture-view";
import { BlurtingEditor } from "@/components/blurting-editor";
import { ComparaisonView } from "@/components/comparaison-view";
import { Button } from "@astryxdesign/core/Button";
import {
  commencerAction,
  terminerLectureAction,
  submitBlurtingAction,
  relireAction,
  noterAction,
  abandonAction,
  addErrorAction,
} from "./actions";

// Session sur une fiche (ARCHITECTURE.md v2 §2) — lecture → blurting →
// comparaison côte à côte (auto-évaluation) → note ; la page rend l'état persisté du cycle.

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

  let etat;
  try {
    etat = await session.etatSessionFiche(userId, ficheId);
  } catch (e) {
    if (e instanceof FicheIntrouvableError) notFound();
    throw e;
  }
  if (etat.kind === "autre_session") {
    return (
      <Message titre={titre}>
        <p className="text-sm text-secondary">
          Une autre session est déjà ouverte ({etat.open.ficheTitre}) — termine-la ou abandonne-la d&apos;abord.
        </p>
        <Link href={`/etude/${etat.open.ficheId}`} prefetch={false} className="self-start text-sm underline">
          Reprendre cette session
        </Link>
      </Message>
    );
  }
  if (etat.kind === "non_etudiable") {
    return (
      <Message titre={titre}>
        <p className="text-sm text-secondary">Cette fiche n&apos;est pas à étudier (archivée).</p>
        <Link href="/" className="self-start text-sm underline">
          Retour à l&apos;accueil
        </Link>
      </Message>
    );
  }
  if (etat.kind === "a_demarrer") {
    return (
      <Message titre={titre}>
        <form action={commencerAction.bind(null, ficheId)}>
          <Button type="submit" label="Commencer la session" />
        </form>
      </Message>
    );
  }
  const { cycle } = etat;

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
    const [comparaison, preview] = await Promise.all([
      session.getComparaison(userId, cycle.id),
      reviewService.preview(userId, ficheId),
    ]);
    return (
      <FocusShell wide>
        <ComparaisonView
          ficheTitre={titre}
          tentativeId={comparaison.tentativeId}
          numero={comparaison.numero}
          input={comparaison.input}
          contenu={comparaison.contenu}
          points={comparaison.points}
          erreursConnues={comparaison.erreursConnues}
          verdictPremierePasse={comparaison.verdictPremierePasse}
          preview={preview}
          relireAction={comparaison.numero === 1 ? relireAction.bind(null, cycle.id, ficheId) : undefined}
          noterAction={noterAction.bind(null, cycle.id)}
          abandonAction={abandonAction.bind(null, cycle.id)}
          addErrorAction={addErrorAction}
        />
      </FocusShell>
    );
  }

  // clos : etatSessionFiche ne renvoie jamais un cycle clos.
  notFound();
}
