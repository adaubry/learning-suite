import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  listSubjects,
  getPlannerConfig,
  getMethodologieGlobale,
  hasCompletedOnboarding,
} from "@/services/account";
import {
  StepMatieres,
  StepRythme,
  StepMethodologie,
  StepRecap,
} from "./onboarding-steps";

// P0 É0.2 — Configuration initiale (USER_FLOW), 4 étapes pilotées par ?step=
// (reprise gratuite par URL, TECH_MAPPING §4.3).

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (await hasCompletedOnboarding(user.id)) {
    redirect("/");
  }

  const { step } = await searchParams;
  const currentStep = Number(step ?? "1");

  const subjects = await listSubjects(user.id);
  if (currentStep > 1 && subjects.length === 0) {
    redirect("/onboarding?step=1");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 p-8">
      <p className="text-xs text-secondary">Étape {currentStep} / 4</p>

      {currentStep === 1 && <StepMatieres subjects={subjects} />}

      {currentStep === 2 && (
        <StepRythme nouvellesParJour={(await getPlannerConfig(user.id)).nouvellesParJour} />
      )}

      {currentStep === 3 && (
        <StepMethodologie methodologieTitresGlobale={await getMethodologieGlobale(user.id)} />
      )}

      {currentStep === 4 && (
        <StepRecap
          subjects={subjects}
          nouvellesParJour={(await getPlannerConfig(user.id)).nouvellesParJour}
          methodologieTitresGlobale={await getMethodologieGlobale(user.id)}
        />
      )}
    </main>
  );
}
