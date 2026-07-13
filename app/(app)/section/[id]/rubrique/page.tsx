import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import * as guide from "@/services/guide";
import { RubricEditor } from "@/components/rubric-editor";
import { validateRubricAction, regenerateRubricAction } from "./actions";
import type { ControlPoint } from "@/llm/schemas/guide";

// U14 RubricEditor + U3 (FUNCTIONS §6.2, USER_FLOW É1.5) — écran de
// relecture/édition/validation d'une rubrique.

export default async function RubricPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sectionId } = await params;
  const userId = await requireUserId();

  const result = await guide.getForSection(userId, sectionId).catch(() => null);
  if (!result) notFound();
  const { section, guide: currentGuide } = result;

  if (section.statut === "active") {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-3">
        <h1 className="text-lg font-semibold">{section.titre}</h1>
        <p className="text-sm text-secondary">
          Aucune rubrique pour cette section pour l&apos;instant — génère-la depuis le curriculum.
        </p>
      </div>
    );
  }

  if (section.statut !== "rubrique_a_valider" || !currentGuide) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-3">
        <h1 className="text-lg font-semibold">{section.titre}</h1>
        <p className="text-sm text-secondary">
          {section.statut === "prete" || section.statut === "validee"
            ? "La rubrique de cette section est déjà validée."
            : "Aucune rubrique à valider pour cette section."}
        </p>
      </div>
    );
  }

  const points = (currentGuide.contenu as { points: ControlPoint[] }).points;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Rubrique — {section.titre}</h1>
      <RubricEditor
        sectionTitre={section.titre}
        sectionContenu={section.contenu}
        initialPoints={points}
        action={validateRubricAction.bind(null, currentGuide.id)}
        regenerateAction={regenerateRubricAction.bind(null, section.id)}
      />
    </div>
  );
}
