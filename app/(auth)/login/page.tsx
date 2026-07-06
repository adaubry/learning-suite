"use client";

import { useActionState } from "react";
import { signInWithMagicLink } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signInWithMagicLink, undefined);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form action={action} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-xl font-semibold">Connexion</h1>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            className="rounded border px-3 py-2"
            placeholder="vous@exemple.fr"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-foreground px-3 py-2 text-background disabled:opacity-50"
        >
          {pending ? "Envoi…" : "Recevoir un lien de connexion"}
        </button>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.sent && (
          <p className="text-sm">Lien envoyé — vérifiez votre boîte mail.</p>
        )}
      </form>
    </main>
  );
}
