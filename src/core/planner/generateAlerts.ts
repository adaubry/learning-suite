// P13 · evaluateAlertRules (IMPLEMENT_SCHEDULE.md §5) — pur, sans I/O.
// Détermine QUELLES alertes doivent exister pour `today`, à partir d'un
// instantané chargé par le service. L'idempotence réelle (ne jamais dupliquer
// une alerte déjà générée) vient de l'index unique `alert_dedupe` en base — ce
// module ne fait qu'appliquer les règles du tableau §5, il ne connaît rien de
// ce qui existe déjà. `serie_en_peril` est exclu : évalué côté client (timer),
// hors de ce calcul serveur (§5).

export type AlertType =
  | "echeance_j7"
  | "echeance_j3"
  | "echeance_j1"
  | "echeance_jour_j"
  | "echeance_depassee"
  | "dette_reports"
  | "pic_charge";

export interface DeadlineForAlerts {
  id: string;
  type: "examen" | "controle_continu" | "autre";
  dueDate: string; // ISO date
  coefficient: number | null;
  libelle: string;
}

export interface AlertCandidate {
  type: AlertType;
  deadlineId: string | null;
  dateRef: string;
  payload: Record<string, unknown>;
}

export interface EvaluateAlertRulesInput {
  today: string; // ISO date
  /** Échéances non acquittées (`ackAt IS NULL`) uniquement. */
  deadlines: DeadlineForAlerts[];
  detteReports: number;
  seuilDetteReports: number;
  /** Charge par jour (ReviewCards dues + nouvelles), clé = date ISO, sur [today-1, today+14]. */
  chargeParJour: Record<string, number>;
  moyenneCharge14j: number;
}

function daysUntil(today: string, due: string): number {
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${due}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function evaluateAlertRules(input: EvaluateAlertRulesInput): AlertCandidate[] {
  const { today, deadlines, detteReports, seuilDetteReports, chargeParJour, moyenneCharge14j } = input;
  const candidates: AlertCandidate[] = [];

  for (const d of deadlines) {
    const distance = daysUntil(today, d.dueDate);
    const payload = { libelle: d.libelle, dueDate: d.dueDate, coefficient: d.coefficient };

    if (distance === 7 && d.type === "examen") {
      candidates.push({ type: "echeance_j7", deadlineId: d.id, dateRef: today, payload });
    }
    if (distance === 3 && d.type === "examen" && (d.coefficient ?? 0) >= 2) {
      candidates.push({ type: "echeance_j3", deadlineId: d.id, dateRef: today, payload });
    }
    if (distance === 1 && (d.type === "examen" || d.type === "controle_continu")) {
      candidates.push({ type: "echeance_j1", deadlineId: d.id, dateRef: today, payload });
    }
    if (distance === 0 && (d.type === "examen" || d.type === "controle_continu")) {
      candidates.push({ type: "echeance_jour_j", deadlineId: d.id, dateRef: today, payload });
    }
    if (distance < 0) {
      candidates.push({ type: "echeance_depassee", deadlineId: d.id, dateRef: today, payload });
    }

    if (d.type === "examen" && distance >= -1 && distance <= 14) {
      const veille = chargeParJour[addDays(d.dueDate, -1)] ?? 0;
      const jourJ = chargeParJour[d.dueDate] ?? 0;
      const seuil = moyenneCharge14j * 2;
      if (moyenneCharge14j > 0 && (veille > seuil || jourJ > seuil)) {
        candidates.push({
          type: "pic_charge",
          deadlineId: d.id,
          dateRef: today,
          payload: { libelle: d.libelle, dueDate: d.dueDate, veille, jourJ, moyenneCharge14j },
        });
      }
    }
  }

  if (detteReports >= seuilDetteReports) {
    candidates.push({
      type: "dette_reports",
      deadlineId: null,
      dateRef: today,
      payload: { detteReports, seuilDetteReports },
    });
  }

  return candidates;
}

// §6 routage bannière : une seule à la fois, la plus urgente
// (jour_j > j1 > depassee > j3).
const BANNER_PRIORITY: string[] = ["echeance_jour_j", "echeance_j1", "echeance_depassee", "echeance_j3"];

export function pickBannerAlert<T extends { type: string }>(alerts: T[]): T | null {
  for (const type of BANNER_PRIORITY) {
    const match = alerts.find((a) => a.type === type);
    if (match) return match;
  }
  return null;
}

// jour_j et depassee non snoozables (§6) — seule source de vérité, consommée
// par le service (garde) ET l'UI (affichage conditionnel du bouton).
export function isSnoozable(type: string): boolean {
  return type !== "echeance_jour_j" && type !== "echeance_depassee";
}

// Libellés d'alerte (§6, §7 AlertBell/AlertBanner/ToastAlerts) — une seule
// source, chaque consommateur n'indexe que les clés dont il a besoin.
export const ALERT_LABELS: Record<AlertType | "serie_en_peril", string> = {
  echeance_j7: "Échéance dans 7 jours",
  echeance_j3: "Échéance dans 3 jours",
  echeance_j1: "Échéance demain",
  echeance_jour_j: "Échéance aujourd'hui",
  echeance_depassee: "Échéance dépassée",
  serie_en_peril: "Série en péril",
  dette_reports: "Dette de reports",
  pic_charge: "Pic de charge",
};
