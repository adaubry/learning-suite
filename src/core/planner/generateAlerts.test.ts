import { describe, expect, it } from "vitest";
import { evaluateAlertRules, type DeadlineForAlerts, type EvaluateAlertRulesInput } from "./generateAlerts";

const today = "2026-07-20";

function deadline(overrides: Partial<DeadlineForAlerts>): DeadlineForAlerts {
  return {
    id: "d1",
    type: "examen",
    dueDate: today,
    coefficient: null,
    libelle: "Écrit",
    ...overrides,
  };
}

const base: EvaluateAlertRulesInput = {
  today,
  deadlines: [],
  detteReports: 0,
  seuilDetteReports: 3,
  chargeParJour: {},
  moyenneCharge14j: 0,
};

describe("evaluateAlertRules · P13", () => {
  it("aucune échéance, dette sous le seuil ⇒ aucune alerte", () => {
    expect(evaluateAlertRules(base)).toEqual([]);
  });

  it("echeance_j7 : examen à J-7 uniquement (pas un CC)", () => {
    const examen = deadline({ id: "e", dueDate: "2026-07-27", type: "examen" });
    const cc = deadline({ id: "cc", dueDate: "2026-07-27", type: "controle_continu" });
    const alerts = evaluateAlertRules({ ...base, deadlines: [examen, cc] });
    expect(alerts.filter((a) => a.type === "echeance_j7")).toEqual([
      { type: "echeance_j7", deadlineId: "e", dateRef: today, payload: expect.any(Object) },
    ]);
  });

  it("echeance_j3 : examen coef >= 2 seulement", () => {
    const fort = deadline({ id: "fort", dueDate: "2026-07-23", coefficient: 2 });
    const faible = deadline({ id: "faible", dueDate: "2026-07-23", coefficient: 1 });
    const alerts = evaluateAlertRules({ ...base, deadlines: [fort, faible] });
    const j3 = alerts.filter((a) => a.type === "echeance_j3");
    expect(j3).toHaveLength(1);
    expect(j3[0].deadlineId).toBe("fort");
  });

  it("echeance_j1 et echeance_jour_j : examens ET contrôles continus", () => {
    const j1 = deadline({ id: "j1", dueDate: "2026-07-21", type: "controle_continu" });
    const jourJ = deadline({ id: "jj", dueDate: today, type: "controle_continu" });
    const alerts = evaluateAlertRules({ ...base, deadlines: [j1, jourJ] });
    expect(alerts.map((a) => a.type).sort()).toEqual(["echeance_j1", "echeance_jour_j"]);
  });

  it("echeance_depassee : toutes les échéances non acquittées passées, y compris type autre", () => {
    const passee = deadline({ id: "p", dueDate: "2026-07-10", type: "autre" });
    const alerts = evaluateAlertRules({ ...base, deadlines: [passee] });
    expect(alerts).toEqual([{ type: "echeance_depassee", deadlineId: "p", dateRef: today, payload: expect.any(Object) }]);
  });

  it("echeance_depassee est régénérée chaque jour (dateRef = today, pas de mémoire d'appel précédent)", () => {
    const passee = deadline({ id: "p", dueDate: "2026-07-01", type: "autre" });
    const jour1 = evaluateAlertRules({ ...base, today: "2026-07-15", deadlines: [passee] });
    const jour2 = evaluateAlertRules({ ...base, today: "2026-07-16", deadlines: [passee] });
    expect(jour1[0].dateRef).toBe("2026-07-15");
    expect(jour2[0].dateRef).toBe("2026-07-16");
  });

  it("dette_reports : déclenchée au-dessus du seuil, une seule fois", () => {
    const alerts = evaluateAlertRules({ ...base, detteReports: 3, seuilDetteReports: 3 });
    expect(alerts).toEqual([
      { type: "dette_reports", deadlineId: null, dateRef: today, payload: expect.any(Object) },
    ]);
  });

  it("dette_reports : rien sous le seuil", () => {
    expect(evaluateAlertRules({ ...base, detteReports: 2, seuilDetteReports: 3 })).toEqual([]);
  });

  it("pic_charge : charge de la veille d'un examen > 2x la moyenne 14j", () => {
    const examen = deadline({ id: "e", dueDate: "2026-07-25", type: "examen" });
    const alerts = evaluateAlertRules({
      ...base,
      deadlines: [examen],
      chargeParJour: { "2026-07-24": 20 },
      moyenneCharge14j: 5,
    });
    expect(alerts.filter((a) => a.type === "pic_charge")).toHaveLength(1);
  });

  it("pic_charge : rien pour un contrôle continu (portée examens uniquement)", () => {
    const cc = deadline({ id: "cc", dueDate: "2026-07-25", type: "controle_continu" });
    const alerts = evaluateAlertRules({
      ...base,
      deadlines: [cc],
      chargeParJour: { "2026-07-24": 20 },
      moyenneCharge14j: 5,
    });
    expect(alerts.filter((a) => a.type === "pic_charge")).toEqual([]);
  });

  it("pic_charge : rien si la charge reste sous 2x la moyenne", () => {
    const examen = deadline({ id: "e", dueDate: "2026-07-25", type: "examen" });
    const alerts = evaluateAlertRules({
      ...base,
      deadlines: [examen],
      chargeParJour: { "2026-07-24": 9, "2026-07-25": 9 },
      moyenneCharge14j: 5,
    });
    expect(alerts.filter((a) => a.type === "pic_charge")).toEqual([]);
  });
});
