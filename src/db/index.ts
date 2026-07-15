import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// prepare: false — requis dès que DATABASE_URL pointe vers le pooler Supabase
// (pgbouncer, mode transaction) : les statements préparés ne survivent pas
// d'une requête à l'autre dans ce mode. Sans effet en connexion directe (local).
const client = postgres(process.env.DATABASE_URL!, { prepare: false });

export const db = drizzle(client, { schema });
