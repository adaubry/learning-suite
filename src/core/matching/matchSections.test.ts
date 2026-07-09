import { describe, expect, it } from "vitest";
import { parseChapter } from "@/core/parser/parseChapter";
import { mechanicalSectioning } from "@/core/sectioning/mechanicalSectioning";
import { matchSections, type OldSection } from "./matchSections";

// Contenu réel (extraits authentiques de e2e/evals/fixtures/Introduction obli.md) — AGENTS.md
// interdit d'inventer du faux cours de droit. Aucune paire avant/après d'un vrai ré-import
// n'existe encore dans le dépôt (2 fixtures figées seulement) : les scénarios de mise en scène
// (renommage, réordonnancement, fusion, scission) sont construits, mais le texte juridique
// lui-même est repris tel quel du fixture réel (tranché avec l'humain, récitation Bloc 8.1).

const LOI =
  "### La loi\n\nLa source principale, c'est la loi, qu'on va retrouver dans le Code civil. C'est le Code civil qui va prévoir notamment la théorie générale du contrat et qui va prévoir aussi les textes sur la responsabilité civile extra-contractuelle.";

const SOURCES_SUPRA =
  "### Sources supra-législatives\n\nOn a d'autres sources qui sont des sources supra-législatives (au-dessus de la loi) qui vont avoir une incidence sur le contenu et la réglementation du droit des obligations.";

function section(titre: string, corps: string): string {
  return `## ${titre}\n\n${corps}`;
}

const SOURCES = section("Sources du droit des obligations", `À ne pas confondre avec les sources des obligations elles-mêmes.\n\n${LOI}\n\n${SOURCES_SUPRA}`);

const NOTION = section(
  "Notion d'obligation",
  "L'obligation au sens juridique repose sur une relation entre d'un côté le créancier et de l'autre le débiteur.",
);

const EFFET_RELATIF = section(
  "L'effet relatif du contrat",
  "Le contrat ne produit d'effet qu'entre les parties qui l'ont conclu, sauf exceptions prévues par la loi.",
);

// Reproduit l'extraction réelle de S2.propose (P1 + P6 : une section par candidat Titre 2,
// contenu = markdown.slice(start,end)) — pour construire un "ancien plan" symétrique au
// "nouvel arbre" que matchSections construit lui-même en interne.
function buildOldSections(markdown: string): OldSection[] {
  const { titleTree } = parseChapter(markdown);
  return mechanicalSectioning(titleTree, markdown.length).map((b, i) => ({
    id: `old-${i}`,
    titre: b.titre,
    ordre: i + 1,
    contenu: markdown.slice(b.start, b.end),
  }));
}

function newTree(markdown: string) {
  return parseChapter(markdown).titleTree;
}

describe("matchSections — cas nominaux", () => {
  it("contenu strictement identique ⇒ intacte, même position", () => {
    const ancien = buildOldSections(`# Introduction\n\n${SOURCES}\n\n${NOTION}`);
    const result = matchSections(ancien, newTree(`# Introduction\n\n${SOURCES}\n\n${NOTION}`), `# Introduction\n\n${SOURCES}\n\n${NOTION}`);

    expect(result.appariements).toHaveLength(2);
    expect(result.disparues).toHaveLength(0);
    expect(result.nouvelles).toHaveLength(0);
    for (const m of result.appariements) expect(m.statut).toBe("intacte");
  });

  it("déplacement (ordre inversé, contenu identique) ⇒ toujours intacte", () => {
    const ancien = buildOldSections(`# Introduction\n\n${SOURCES}\n\n${NOTION}`);
    const markdownReordonne = `# Introduction\n\n${NOTION}\n\n${SOURCES}`;
    const result = matchSections(ancien, newTree(markdownReordonne), markdownReordonne);

    expect(result.disparues).toHaveLength(0);
    expect(result.nouvelles).toHaveLength(0);
    expect(result.appariements.every((m) => m.statut === "intacte")).toBe(true);
    const sources = result.appariements.find((m) => m.nouveauBloc.titre === "Sources du droit des obligations");
    expect(sources?.statut).toBe("intacte");
  });

  it("contenu retouché, titre identique ⇒ modifiée (hash différent, titre exact)", () => {
    const ancien = buildOldSections(`# Introduction\n\n${SOURCES}\n\n${NOTION}`);
    const sourcesModifiee = section(
      "Sources du droit des obligations",
      `À ne pas confondre avec les sources des obligations elles-mêmes.\n\n${LOI}\n\nPhrase ajoutée lors de la mise à jour du cours.`,
    );
    const markdownV2 = `# Introduction\n\n${sourcesModifiee}\n\n${NOTION}`;
    const result = matchSections(ancien, newTree(markdownV2), markdownV2);

    const notion = result.appariements.find((m) => m.ancienneId === ancien.find((s) => s.titre === "Notion d'obligation")!.id);
    expect(notion?.statut).toBe("intacte");
    const sources = result.appariements.find((m) => m.ancienneId === ancien.find((s) => s.titre === "Sources du droit des obligations")!.id);
    expect(sources?.statut).toBe("modifiee");
    expect(sources?.nouveauBloc.contenu).toContain("Phrase ajoutée");
    expect(result.disparues).toHaveLength(0);
    expect(result.nouvelles).toHaveLength(0);
  });

  it("renommage léger, contenu identique ⇒ modifiée (similarité titre+position)", () => {
    const ancien = buildOldSections(`# Introduction\n\n${SOURCES}\n\n${NOTION}`);
    const sourcesRenommee = section(
      "Les sources du droit des obligations",
      `À ne pas confondre avec les sources des obligations elles-mêmes.\n\n${LOI}\n\n${SOURCES_SUPRA}`,
    );
    const markdownV2 = `# Introduction\n\n${sourcesRenommee}\n\n${NOTION}`;
    const result = matchSections(ancien, newTree(markdownV2), markdownV2);

    const sources = result.appariements.find((m) => m.ancienneId === ancien.find((s) => s.titre === "Sources du droit des obligations")!.id);
    expect(sources?.statut).toBe("modifiee");
    expect(sources?.nouveauBloc.titre).toBe("Les sources du droit des obligations");
    expect(result.disparues).toHaveLength(0);
    expect(result.nouvelles).toHaveLength(0);
  });

  it("section supprimée du chapitre ⇒ disparue", () => {
    const ancien = buildOldSections(`# Introduction\n\n${SOURCES}\n\n${NOTION}`);
    const markdownV2 = `# Introduction\n\n${SOURCES}`;
    const result = matchSections(ancien, newTree(markdownV2), markdownV2);

    expect(result.disparues).toEqual([{ ancienneId: ancien.find((s) => s.titre === "Notion d'obligation")!.id }]);
    expect(result.nouvelles).toHaveLength(0);
  });

  it("section ajoutée au chapitre ⇒ nouvelle, le reste inchangé", () => {
    const ancien = buildOldSections(`# Introduction\n\n${SOURCES}`);
    const markdownV2 = `# Introduction\n\n${SOURCES}\n\n${EFFET_RELATIF}`;
    const result = matchSections(ancien, newTree(markdownV2), markdownV2);

    expect(result.disparues).toHaveLength(0);
    expect(result.nouvelles).toHaveLength(1);
    expect(result.nouvelles[0].titre).toBe("L'effet relatif du contrat");
    expect(result.appariements[0].statut).toBe("intacte");
  });
});

describe("matchSections — cas limites et seuil conservateur", () => {
  it("scission implicite (une section éclatée en deux) ⇒ disparue + deux nouvelles, jamais fusionnée à tort", () => {
    const ancien = buildOldSections(`# Introduction\n\n${SOURCES}`);
    // Le contenu de "Sources du droit des obligations" est éclaté en deux Titre 2 indépendants
    // dans la nouvelle version — aucun des deux ne doit hériter à tort de l'historique de l'ancienne.
    const markdownV2 = `# Introduction\n\n${section("La loi", LOI.replace("### La loi\n\n", ""))}\n\n${section("Sources supra-législatives", SOURCES_SUPRA.replace("### Sources supra-législatives\n\n", ""))}`;
    const result = matchSections(ancien, newTree(markdownV2), markdownV2);

    expect(result.appariements).toHaveLength(0);
    expect(result.disparues).toEqual([{ ancienneId: ancien[0].id }]);
    expect(result.nouvelles).toHaveLength(2);
  });

  it("deux anciennes sections au contenu identique (doublon) ⇒ appariées par position, pas par erreur", () => {
    const doublon = section("Notion d'obligation", "Texte identique répété par erreur dans le cours.");
    const ancien = buildOldSections(`# Introduction\n\n${doublon}\n\n${doublon}`);
    const markdownV2 = `# Introduction\n\n${doublon}\n\n${doublon}`;
    const result = matchSections(ancien, newTree(markdownV2), markdownV2);

    expect(result.appariements).toHaveLength(2);
    expect(result.appariements.every((m) => m.statut === "intacte")).toBe(true);
    expect(result.disparues).toHaveLength(0);
    expect(result.nouvelles).toHaveLength(0);
  });

  it("titre totalement différent et contenu proche mais pas identique ⇒ disparue + nouvelle (doute)", () => {
    const ancien = buildOldSections(`# Introduction\n\n${NOTION}`);
    const sansRapport = section(
      "Conclusion",
      "L'obligation au sens juridique repose sur une relation entre le créancier et le débiteur, légèrement reformulée ici.",
    );
    const markdownV2 = `# Introduction\n\n${sansRapport}`;
    const result = matchSections(ancien, newTree(markdownV2), markdownV2);

    expect(result.appariements).toHaveLength(0);
    expect(result.disparues).toEqual([{ ancienneId: ancien[0].id }]);
    expect(result.nouvelles).toHaveLength(1);
  });

  it("chapitre sans aucun titre ⇒ secours P6 'chapitre entier', compte comme une seule nouvelle", () => {
    // mechanicalSectioning n'est jamais bloquant (FUNCTIONS §1 P6) : sans titre exploitable,
    // il retourne un unique bloc "Chapitre entier" plutôt qu'une liste vide.
    const result = matchSections([], newTree(""), "");
    expect(result.appariements).toHaveLength(0);
    expect(result.disparues).toHaveLength(0);
    expect(result.nouvelles).toEqual([{ titre: "Chapitre entier", start: 0, end: 0, contenu: "" }]);
  });

  it("ancien plan vide, nouveau chapitre non vide ⇒ tout en nouvelles", () => {
    const markdownV2 = `# Introduction\n\n${SOURCES}\n\n${NOTION}`;
    const result = matchSections([], newTree(markdownV2), markdownV2);
    expect(result.appariements).toHaveLength(0);
    expect(result.disparues).toHaveLength(0);
    expect(result.nouvelles).toHaveLength(2);
  });

  it("nouveau chapitre sans rapport avec l'ancien ⇒ tout en disparues + le secours en nouvelle", () => {
    const ancien = buildOldSections(`# Introduction\n\n${SOURCES}\n\n${NOTION}`);
    const result = matchSections(ancien, newTree("Vidé."), "Vidé.");
    expect(result.appariements).toHaveLength(0);
    expect(result.disparues).toHaveLength(2);
    expect(result.nouvelles).toHaveLength(1); // secours P6 "Chapitre entier"
  });
});
