# Licences des dépendances — ArchiveFlow

## Dépendances réellement utilisées par le code de l'application

Ce sont les seuls paquets tiers effectivement importés par le code d'ArchiveFlow (`app/`, `components/archive/`) — à distinguer de la liste complète de `package.json`, qui inclut aussi des dépendances du gabarit de démarrage (starter template) non utilisées par cette fonctionnalité (voir section suivante).

| Paquet | Version | Licence | Usage |
|---|---|---|---|
| react | 19.2.6 | MIT | Bibliothèque d'interface utilisateur |
| react-dom | 19.2.6 | MIT | Rendu React |
| next | 16.2.6 | MIT | API du framework (via vinext, compatible Next.js) |
| vinext | 0.0.50 | MIT | Exécution du framework Next.js-compatible sur Vite/Cloudflare |
| lucide-react | 1.31.0 | ISC | Icônes de l'interface |
| libarchive.js | 2.0.2 | MIT | Lecture des formats 7Z / RAR / ZIP chiffré (secours) |

Toutes ces licences sont permissives (MIT / ISC) et autorisent l'usage, la modification et la redistribution, y compris commerciale, sous réserve de conserver la mention de copyright et la licence d'origine.

## Outils de build et de test (non distribués avec l'application)

| Paquet | Licence |
|---|---|
| vite | MIT |
| typescript | Apache-2.0 |
| tailwindcss | MIT |
| eslint | MIT |
| wrangler | MIT |

## Dépendances du gabarit de démarrage non utilisées par ArchiveFlow

`package.json` liste aussi des paquets provenant du gabarit de départ (composants shadcn/ui, formulaires, graphiques, base de données) qui ne sont importés par aucun fichier sous `app/` ou `components/archive/` : `@base-ui/react`, `@hookform/resolvers`, `@shadcn/react`, `class-variance-authority`, `clsx`, `cmdk`, `date-fns`, `drizzle-orm`, `embla-carousel-react`, `input-otp`, `next-themes`, `radix-ui`, `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `recharts`, `sonner`, `tailwind-merge`, `vaul`, `zod`, `drizzle-kit`. Elles restent installées (le gabarit n'a pas été purgé) mais ne font pas partie de la surface fonctionnelle d'ArchiveFlow. Toutes celles vérifiées sont également sous licence MIT.

## Méthode

Cette liste a été établie en (1) recherchant tous les imports réels (`from "..."` et `import(...)` dynamiques) dans le code source de l'application, puis (2) en lisant le champ `license` du `package.json` de chaque paquet installé dans `node_modules`. Elle doit être régénérée si de nouvelles dépendances sont ajoutées au code de l'application.
