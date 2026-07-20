import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// prepare: false — requis dès que DATABASE_URL pointe vers le pooler Neon
// (pgbouncer, mode transaction, hostname `-pooler`) : les statements préparés
// ne survivent pas d'une requête à l'autre dans ce mode. Sans effet en
// connexion directe (local, Docker).
// max: 1 — chaque instance serverless (Vercel) traite ses requêtes une par une ;
// le défaut de postgres.js (10) multiplie inutilement les connexions ouvertes
// contre le pooler par instance (même doctrine que sous Supabase, dont ce
// projet migre — incident réel EMAXCONNSESSION à l'époque).
// NB : max: 3 testé (répartir les ~9 requêtes concurrentes de (app)/layout.tsx
// sur plusieurs connexions) casse un canari (planner.canary.test.ts) — la
// suite de tests n'est pas isolée pour du vrai parallélisme sur la même base ;
// abandonné, ne pas retenter sans fiabiliser l'isolation des tests d'abord.
// idle_timeout/max_lifetime/connect_timeout — une connexion bloquée (requête
// tuée côté Vercel avant lecture du résultat) ne doit pas rester bloquée
// indéfiniment et geler toutes les requêtes suivantes sur la même instance
// serverless réchauffée.
// statement_timeout/idle_in_transaction_session_timeout — insuffisant ci-dessus :
// idle_timeout/max_lifetime ne se déclenchent que sur une connexion IDLE, pas
// sur une requête bloquée en plein vol (en attente de réponse). Ce sont ces
// deux GUC, appliqués côté serveur par Postgres/pgbouncer, qui bornent
// réellement une requête (ou une transaction laissée ouverte) qui ne répond
// jamais — cause du 504 systématique observé sous Supabase sur toute session
// ouverte (incident réel 2026-07-20, motif de la migration vers Neon).
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 10,
  connection: {
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 10_000,
  },
});

export const db = drizzle(client, { schema });
