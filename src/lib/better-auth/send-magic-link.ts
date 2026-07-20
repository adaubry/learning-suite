import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// ponytail: hors prod, ne rien faire — le token est déjà persisté par
// Better-Auth dans `verification` avant cet appel ; dev-magic-link.ts relit
// cette même source (voir son commentaire pour le pourquoi).
export async function sendMagicLink({ email, url }: { email: string; url: string }) {
  if (process.env.NODE_ENV !== "production") return;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: email,
    subject: "Connexion",
    html: `<a href="${url}">Se connecter</a>`,
  });
}
