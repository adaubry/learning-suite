import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// prepare: false — requis dès que DATABASE_URL pointe vers le pooler Supabase
// (pgbouncer, mode transaction) : les statements préparés ne survivent pas
// d'une requête à l'autre dans ce mode. Sans effet en connexion directe (local).
// max: 1 — chaque instance serverless (Vercel) traite ses requêtes une par une ;
// le défaut de postgres.js (10) multiplie inutilement les connexions ouvertes
// contre le pooler par instance, ce qui a déjà épuisé le quota du pooler en
// mode session (incident réel, EMAXCONNSESSION) — sans effet en local (Docker).
const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

export const db = drizzle(client, { schema });
