import type { Metadata } from "next";
import { Geist_Mono, Poppins, Crimson_Text, EB_Garamond } from "next/font/google";
import { Theme } from "@astryxdesign/core/theme";
import { y2kTheme } from "@astryxdesign/theme-y2k/built";
import "@astryxdesign/theme-y2k/theme.css";
import "./globals.css";

// Le thème Y2K (theme.css) référence "Poppins"/"Crimson Text" par leur nom
// littéral (pas de var CSS) : ces polices doivent être chargées ici pour que
// ces règles matchent, sinon repli silencieux sur la chaîne système du thème.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const crimsonText = Crimson_Text({
  variable: "--font-crimson-text",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
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
      className={`${poppins.variable} ${crimsonText.variable} ${geistMono.variable} ${ebGaramond.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <Theme theme={y2kTheme} mode="system">
          {children}
        </Theme>
      </body>
    </html>
  );
}
