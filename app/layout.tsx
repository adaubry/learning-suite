import type { Metadata } from "next";
import { Geist_Mono, Figtree, EB_Garamond } from "next/font/google";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@/theme/neutral";
import "./globals.css";

// Le thème (theme.css, src/theme/) référence "Figtree" par son nom littéral
// (pas de var CSS) : cette police doit être chargée ici pour que la règle
// matche, sinon repli silencieux sur la chaîne système du thème.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Geist Mono : conservé pour l'utilitaire Tailwind `font-mono` (affichage de
// code/identifiants, hors doctrine typographique du thème Astryx lui-même).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// EB Garamond : réservée à l'affichage en lecture seule du texte de cours
// (LectureView/U25, vue chapitre de ChapterEditorScreen) — mappée sur
// l'utilitaire Tailwind `font-serif` dans globals.css.
const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Learning Suite",
  description: "Apprentissage du droit : blurting, Feynman, révision espacée.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${figtree.variable} ${geistMono.variable} ${ebGaramond.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <Theme theme={neutralTheme} mode="system">
          {children}
        </Theme>
      </body>
    </html>
  );
}
