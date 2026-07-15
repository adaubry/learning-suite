# Migration local → Supabase/Vercel production

Ce document trace la marche à suivre pour faire passer ce projet de « stack
Docker locale uniquement » à un déploiement réel. **Aucune de ces étapes n'a
encore été exécutée** au moment de la rédaction (2026-07-15) : pas de remote
git, pas de projet Vercel, pas de projet Supabase distant lié. C'est un
premier déploiement, pas une promotion de routine.

Contexte produit à garder en tête (DECISIONS.md) : app **mono-utilisateur**.
Ça simplifie plusieurs choix ci-dessous (pas de RLS à écrire, pas de vraie
volumétrie à anticiper).

## Vue d'ensemble

| Couche             | Aujourd'hui                                  | Cible                                            |
| ------------------ | --------------------------------------------- | ------------------------------------------------- |
| Postgres + Auth     | `supabase start` (Docker local)               | Projet Supabase Cloud                             |
| Schéma DB           | `npm run db:migrate` (Drizzle) contre le Postgres local | Même commande, contre le Postgres distant (une fois) |
| Hébergement app     | `npm run dev`                                 | Vercel (le repo doit d'abord exister sur GitHub)  |
| Tâche de fond       | Aucune (pas de cron local)                    | Vercel Cron (`vercel.json`, déjà présent, jamais activé) |
| OAuth Google        | `skip_nonce_check = true` (quirk Docker local) | Provider Google configuré sur le projet Cloud, nonce check actif |

## 1. Créer le projet Supabase Cloud

1. [dashboard.supabase.com](https://dashboard.supabase.com) → New Project.
2. Région proche de l'utilisation réelle (latence pour les requêtes LLM/DB).
3. Noter le mot de passe DB généré à la création — nécessaire pour `link`
   (étape 2) et pour construire les URLs de connexion (étape 4).
4. Vérifier que la version majeure Postgres du projet correspond à
   `supabase/config.toml` (`major_version = 17`) — c'est la valeur par
   défaut actuelle de Supabase, à re-vérifier au moment de créer le projet.

## 2. Lier le repo au projet distant

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
```

**Ne pas faire `supabase config push` en aveugle.** `supabase/config.toml`
contient des valeurs propres au dev local qui casseraient la prod si elles
étaient poussées telles quelles :

- `site_url = "http://localhost:3000"` et `additional_redirect_urls =
  ["http://localhost:3000/auth/callback"]` — pousser ça en l'état redirige
  les magic links et le retour OAuth Google vers `localhost` en production.
- `[auth.external.google].skip_nonce_check = true` — c'est un correctif pour
  le réseau Docker du CLI local (le commentaire du fichier le dit
  explicitement : « Required for local sign in with Google auth »). En
  production, cette vérification anti-rejeu doit rester active
  (`skip_nonce_check = false`) ; la laisser désactivée serait une régression
  de sécurité qu'aucune contrainte locale ne justifie plus.

→ Configurer **Auth → URL Configuration** et **Auth → Providers → Google**
directement dans le Dashboard du projet Cloud, avec les vraies valeurs de
prod. Ce sont des réglages spécifiques à l'environnement : ils n'ont pas
vocation à vivre dans le `config.toml` versionné et partagé entre
développeurs/environnements.

Valeurs à saisir dans le Dashboard :

- Site URL : `https://<domaine-prod>`
- Redirect URLs : `https://<domaine-prod>/auth/callback`
- Provider Google : activé, Client ID / Secret (voir étape 5), nonce check
  actif (ne pas cocher l'équivalent de `skip_nonce_check`)

## 3. Appliquer le schéma (Drizzle, pas les migrations Supabase)

Ce projet ne stocke aucune migration Supabase native (`supabase/migrations`
n'existe même pas) — **Drizzle est l'unique propriétaire du schéma**
(TECH_MAPPING : « natif > librairies listées »), `supabase db push` n'a rien
à faire ici. À exécuter une fois, depuis la machine de dev :

```bash
DATABASE_URL="<connexion-directe-prod>" npm run db:migrate
```

Utiliser la **connexion directe** (Dashboard → Project Settings → Database →
Connection string → onglet « Direct connection », port 5432), pas le
pooler transaction (étape 4) : `drizzle-kit migrate` a besoin de statements
préparés / verrous de session que le mode transaction de pgbouncer ne
garantit pas de façon fiable pour du DDL.

`npm run db:migrate` lit `.env.local` via `--env-file` (package.json) mais
une variable déjà présente dans l'environnement du shell prend le pas sur le
fichier — la commande ci-dessus ne touche donc pas ta config locale.

Vérifier ensuite dans Supabase Studio (Table Editor) que les tables du
schéma (`src/db/schema.ts`) sont bien présentes.

## 4. Variables d'environnement (Vercel)

| Variable | Source | Note |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard → Project Settings → API → Project URL | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → API → anon public key | |
| `DATABASE_URL` | Dashboard → Database → Connection string → **Transaction pooler** (port 6543) | Le runtime Next.js (Vercel, serverless) doit passer par le pooler, pas la connexion directe — la connexion directe a une limite de connexions simultanées trop basse pour du serverless. `src/db/index.ts` passe déjà `{ prepare: false }`, requis en mode transaction pgbouncer (sans quoi les requêtes échouent aléatoirement) |
| `NEXT_PUBLIC_SITE_URL` | `https://<domaine-prod>` | Doit correspondre exactement à ce qui est saisi dans Auth → URL Configuration (étape 2) |
| `OPENROUTER_API_KEY`, `LLM_MODEL_*` | Identiques au local | Pas liées à l'environnement |
| `CRON_SECRET` | Générer une nouvelle valeur (`openssl rand -hex 32`) | Vercel ajoute automatiquement `Authorization: Bearer <CRON_SECRET>` sur les requêtes qu'il déclenche lui-même vers `/api/cron` (déjà noté dans `.env.example`) — rien d'autre à câbler côté app |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` | Google Cloud Console (étape 5) | **Pas une variable Vercel** : ce sont des secrets Supabase Auth, saisis dans le Dashboard du projet (Auth → Providers → Google) — le Next.js déployé sur Vercel n'en a jamais besoin, l'échange OAuth se fait entre Supabase Auth et Google |

## 5. Google Cloud Console

1. Sur le client OAuth existant (celui créé pour le dev local) ou un nouveau,
   ajouter en redirect URI autorisée :
   `https://<project-ref>.supabase.co/auth/v1/callback`
   (même schéma que le local, juste le `project-ref` du projet Cloud au lieu
   de `127.0.0.1:54321`).
2. Ajouter le domaine prod aux « Authorized JavaScript origins » si l'écran
   de consentement Google l'exige.
3. Écran de consentement OAuth : app mono-utilisateur → rester en mode
   **Testing** et ajouter `adam@protectionjuridique.org` comme utilisateur
   de test. Évite la procédure de vérification Google (inutile pour un seul
   utilisateur, et potentiellement bloquante si le scope `email`/`profile`
   n'est pas jugé suffisant pour publier sans vérification).

## 6. Déploiement Vercel

1. Pousser le repo sur GitHub (aucun remote git n'existe actuellement — à
   faire côté humain, en dehors de ce document).
2. Importer le repo dans Vercel.
3. Renseigner les variables d'environnement (tableau étape 4).
4. Vercel lit `vercel.json` automatiquement pour le cron (`0 3 * * *`,
   quotidien) — aucune config supplémentaire côté Vercel. Le plan Hobby
   suffit (limite de fréquence minimale du plan gratuit largement respectée
   par un cron quotidien).
5. Déployer.

## 7. Vérifications post-déploiement

- `/login` accessible, magic link reçu (voir note ci-dessous sur les
  limites d'envoi) et connexion Google fonctionnelle bout en bout.
- Déclencher le cron manuellement avant d'attendre le lendemain 3h :
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<domaine-prod>/api/cron
  ```
- Vérifier `npm run check` / `npm run test:canary` en local restent verts
  (déjà fait avant cette migration — aucune régression attendue, ces
  commandes ne touchent pas l'environnement distant).

### Limite à connaître : service email intégré Supabase

Le service email par défaut de Supabase (celui qui envoie les magic links)
a un débit très faible en production (de l'ordre de quelques emails/heure),
pensé pour du test, pas un usage réel — même occasionnel. Pour un
utilisateur unique ça peut suffire, mais si des connexions ratées par email
non reçu apparaissent, la solution standard est de brancher un SMTP externe
(Dashboard → Auth → Emails → SMTP Settings). Non fait par défaut ici : ça
demande un fournisseur SMTP et des credentials que je n'ai pas — décision à
prendre si le besoin se confirme à l'usage, pas à anticiper maintenant.

## Hors scope de cette migration

- **RLS (Row Level Security)** : jamais utilisée dans ce projet et pas
  nécessaire ici — `src/db/index.ts` se connecte à Postgres directement via
  Drizzle (`DATABASE_URL`), ça contourne entièrement PostgREST/RLS. Ajouter
  des policies n'aurait aucun effet sur les requêtes de l'app.
- **Migrations Supabase natives** (`supabase db push`, `supabase/migrations`)
  : n'existent pas dans ce projet, ne pas les introduire — Drizzle reste
  l'unique propriétaire du schéma (TECH_MAPPING).
- **CI/CD** : aucun pipeline demandé ; le déploiement Vercel sur push Git
  suffit pour l'usage mono-utilisateur actuel.
