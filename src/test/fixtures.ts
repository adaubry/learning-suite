import postgres from "postgres";
import * as account from "@/services/account";
import * as ficheService from "@/services/fiche";

// Aides partagées des tests de services (hors `include` Vitest : pas un test).
// Chaque fichier de test ouvre son client, crée ses utilisateurs, et les nettoie
// en fin de fichier dans l'ordre des clés étrangères.

export const client = postgres(process.env.DATABASE_URL!);

export const SAMPLE_SET = `## 1. La justice retenue

Sous la justice retenue, le Conseil d'État prépare les décisions, mais le chef de l'État juge.

- **Définition :** justice retenue dans les mains du chef de l'État.
- **Cause :** la séparation de 1790 écarte le juge judiciaire.
- **Complément (hors cours) :** art. 52 de la Constitution de l'an VIII.

## 2. La justice déléguée

Depuis 1872, le Conseil d'État juge seul et souverainement.

| | **Retenue** | **Déléguée** |
|---|---|---|
| Qui décide | Le chef de l'État | Le Conseil d'État |

- **Conséquence :** un juge administratif indépendant.

## 3. L'arrêt Cadot

Le Conseil d'État se reconnaît compétent sans texte.

- **Constat :** abandon du ministre-juge.
`;

const createdUserIds: string[] = [];

export async function createUser(): Promise<string> {
  const [user] = await client`insert into "user" (name, email) values ('Test', gen_random_uuid()::text || '@example.com') returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

export async function createSubject(userId: string, nom = "Droit administratif", dateExamen?: string) {
  return account.createSubject(userId, { nom, semestre: "S3", dateExamen });
}

// Utilisateur + matière + set importé ; renvoie les fiches triées par numéro.
export async function seedSet(markdown = SAMPLE_SET) {
  const userId = await createUser();
  const subject = await createSubject(userId);
  const set = await ficheService.importSet(userId, { subjectId: subject.id, titre: "Semaine test", markdown });
  const fiches = await client<{ id: string; numero: number; titre: string; statut: string }[]>`
    select id, numero, titre, statut from fiche where set_id = ${set.id} order by numero`;
  return { userId, subject, set, fiches };
}

export async function cleanupUser(userId: string) {
  const ficheIds = (
    await client<{ id: string }[]>`
      select f.id from fiche f join fiche_set s on f.set_id = s.id join subject su on s.subject_id = su.id
      where su.user_id = ${userId}`
  ).map((r) => r.id);
  await client`delete from error_entry where fiche_id = any(${ficheIds}::uuid[])`;
  await client`delete from tentative where fiche_id = any(${ficheIds}::uuid[])`;
  await client`delete from study_cycle where user_id = ${userId}`;
  await client`delete from review_card where fiche_id = any(${ficheIds}::uuid[])`;
  await client`delete from deferral_log where item_id = any(${ficheIds}::uuid[])`;
  await client`delete from refile_item where item_id = any(${ficheIds}::uuid[])`;
  await client`delete from fiche where id = any(${ficheIds}::uuid[])`;
  await client`delete from fiche_set where subject_id in (select id from subject where user_id = ${userId})`;
  await client`delete from deadline where subject_id in (select id from subject where user_id = ${userId})`;
  await client`delete from subject where user_id = ${userId}`;
  await client`delete from planner_config where user_id = ${userId}`;
  await client`delete from "user" where id = ${userId}`;
}

// À appeler dans afterAll : nettoie tous les utilisateurs créés par ce fichier.
export async function cleanupAll() {
  for (const id of createdUserIds.splice(0)) await cleanupUser(id);
  await client.end();
}
