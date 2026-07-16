"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { signInWithGoogle, signInWithMagicLink } from "../actions";

function OAuthError() {
  const oauthError = useSearchParams().get("error") === "oauth";
  if (!oauthError) return null;
  return <p className="text-sm text-error">Échec de la connexion Google — réessayez.</p>;
}

export default function LoginPage() {
  const [state, action, pending] = useActionState(signInWithMagicLink, undefined);
  const [email, setEmail] = useState("");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-xl font-semibold">Connexion</h1>
        <form action={signInWithGoogle}>
          <Button type="submit" variant="secondary" label="Continuer avec Google" />
        </form>
        <Suspense fallback={null}>
          <OAuthError />
        </Suspense>
        <div className="flex items-center gap-2 text-sm text-secondary">
          <span className="h-px flex-1 bg-border" />
          ou
          <span className="h-px flex-1 bg-border" />
        </div>
        <form action={action} className="flex flex-col gap-4">
          <TextInput
            type="email"
            label="Email"
            htmlName="email"
            isRequired
            value={email}
            onChange={setEmail}
            placeholder="vous@exemple.fr"
          />
          <Button type="submit" isDisabled={pending} label={pending ? "Envoi…" : "Recevoir un lien de connexion"} />
          {state?.error && <p className="text-sm text-error">{state.error}</p>}
          {state?.sent && (
            <p className="text-sm">Lien envoyé — vérifiez votre boîte mail.</p>
          )}
        </form>
        {process.env.NODE_ENV === "development" && (
          <a href="/dev-session" className="self-start text-xs text-secondary underline">
            Connexion test (dev)
          </a>
        )}
      </div>
    </main>
  );
}
