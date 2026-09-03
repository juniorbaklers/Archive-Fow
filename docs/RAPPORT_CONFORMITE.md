# Rapport de conformité au cahier des charges — ArchiveFlow / Universal Archive Manager v2.1

Ce rapport formalise l'analyse d'écart menée entre le cahier des charges d'origine (« Universal Archive Manager v2.1 ») et l'état réel du code, en distinguant ce qui est complet, partiel, ou absent. Il remplace l'analyse informelle donnée en conversation par une version vérifiée et à jour après le lot de correctifs le plus récent.

## 1. Fonctionnalités traitées dans ce lot (complètes)

| Fonctionnalité | État | Détails |
|---|---|---|
| Découpage en volumes / taille maximale par archive | Fait | Bucketing glouton par taille d'origine ; produit plusieurs archives complètes et indépendantes, vérifiées individuellement. Explicitement pas un format de volumes liés officiel. |
| Estimation taille/temps avant traitement | Fait | Heuristique par extension de fichier + débit approximatif, clairement présentée comme une estimation. L'estimation « mémoire » n'est pas isolée de l'estimation de temps/taille : le navigateur n'expose pas de mesure fiable de mémoire disponible avant traitement. |
| Vérification de l'espace disque | Fait | `navigator.storage.estimate()`, avec état explicite `unknown` quand le navigateur ne l'expose pas. Ne reflète pas l'espace disque réel de la machine (limite documentée). |
| Archives imbriquées | Fait | Option désactivée par défaut, profondeur max 3, mêmes limites de sécurité à chaque niveau. |
| Archives multiparties (concaténation séquentielle) | Fait | Détection et reconstitution automatique de `.001`/`.002`/… |
| Archives multiparties (ZIP fractionné / RAR multi-volumes) | Explicitement non supporté | Détecté et signalé à l'utilisateur plutôt que traité de façon incorrecte ; nécessite 7-Zip/WinRAR. |
| Export de l'historique (JSON/CSV/HTML) | Fait | Bouton dédié dans le panneau Historique, distinct de l'export des règles. |
| Mode clair/sombre | Fait | Bascule mémorisée, respecte la préférence système au premier lancement. |
| Architecture multilingue | Fait | Dictionnaire FR/EN (`app/i18n.ts`) couvrant l'ensemble de l'interface (navigation, accueil, espace de travail, historique et ses exports, matrice des formats, paramètres) ainsi que les messages d'erreur techniques du moteur d'archives. Les noms de catégories de classement restent volontairement non traduits (identifiants internes utilisés comme noms de dossiers réels). Voir `docs/LIMITES_CONNUES.md`. |
| Écran d'accueil dédié | Fait | Deux actions principales, opérations récentes, profils métiers enregistrés. |
| Suite de tests (§22) | Fait | `tests/archive-logic.test.mjs` (12 tests logiques) : round-trip ZIP compressé, quarantaine (signature de bombe zip), limites de sécurité (nombre de fichiers, profondeur), politiques de collision, préservation des noms de fichiers lors du raccourcissement de chemin, découpage en volumes, détection multi-parties, extraction imbriquée, estimation, parité i18n. `tests/e2e-workflows.test.mjs` (4 tests navigateur réel) : quarantaine visible à l'écran, avertissement de doublon entre archives, annulation d'une écriture de dossier en cours, affichage de l'estimation d'espace disque — contre le build de production réel, piloté par le même Chromium headless que la vérification manuelle. |
| Livrables documentaires (§23) | Fait | `docs/MANUEL_UTILISATEUR.md`, `docs/MODELE_SECURITE.md`, `docs/LIMITES_CONNUES.md`, `docs/LICENCES.md`, le présent rapport. |

## 2. Explicitement hors périmètre de ce lot (non traité)

Ces éléments ont été identifiés dans l'analyse d'écart mais délibérément exclus de ce lot de travail, à la demande explicite de l'utilisateur :

- Application native Windows/Tauri.
- Installabilité PWA hors ligne (service worker, manifeste installable).
- Prévisualisation sandboxée des fichiers extraits.
- Chiffrement / mot de passe sur les archives créées.

## 3. Processus de développement (§24-25)

Le cahier des charges décrit une méthode par phases avec validation intermédiaire documentée. Le développement réel (de ce lot comme des précédents) a suivi un processus itératif direct sur retours utilisateur : chaque fonctionnalité a été implémentée, vérifiée (build, tests, lint, vérification visuelle en navigateur réel via Playwright), puis déployée avant de passer à la suivante — sans document de validation de phase formel intermédiaire. Ce rapport et les autres documents de `docs/` constituent la trace a posteriori la plus proche de ce processus, mais ne peuvent pas se substituer à une validation de phase qui aurait dû être faite en amont.

## 4. Méthode de vérification utilisée pour ce rapport

Chaque ligne du tableau ci-dessus a été vérifiée par lecture du code source correspondant (pas seulement par la présence d'une fonctionnalité dans l'interface) et, quand c'était possible, par un test automatisé ou une vérification en navigateur réel (captures d'écran, assertions DOM, absence d'erreurs console) avant d'être marquée « Fait ».
