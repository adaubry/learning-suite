"use client";

import { useActionState, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { signInWithMagicLink } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signInWithMagicLink, undefined);
  const [email, setEmail] = useState("");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form action={action} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-xl font-semibold">Connexion</h1>
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
    </main>
  );
}
