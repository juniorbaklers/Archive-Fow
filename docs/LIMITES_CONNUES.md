# Limites connues — ArchiveFlow

Ce document liste, honnêtement, ce qu'ArchiveFlow ne fait pas (encore), pour éviter toute ambiguïté avec ce qui est documenté comme fonctionnel.

## Formats d'archives

- **Création** : ZIP (avec ou sans compression), TAR, TAR.GZ, GZIP (un seul fichier). La création directe en 7Z ou RAR n'est pas disponible dans le navigateur (aucune bibliothèque JavaScript fiable de création RAR/7Z n'existe côté client).
- **Chiffrement à la création** : les archives créées par ArchiveFlow ne peuvent pas être protégées par mot de passe.
- **Lecture d'archives chiffrées** : possible pour les formats qui le permettent via `libarchive.js`, avec saisie du mot de passe à la demande ; non garanti pour tous les schémas de chiffrement.
- **Volumes multi-parties officiels** : les ZIP fractionnés (`.zNN` + `.zip`) et les archives RAR multi-volumes (`.partN.rar`) sont détectés mais **non reconstitués** automatiquement — l'application l'indique explicitement et recommande 7-Zip/WinRAR. Seule la concaténation séquentielle simple (`.001`, `.002`, …) est reconstituée automatiquement.
- **Découpage en volumes à la création** : produit plusieurs archives complètes et indépendantes (`nom_part1.zip`, …), pas un format de volumes multi-parties liés entre eux comme le fait WinRAR/7-Zip.

## Plateforme

- **Application native (Windows/macOS/Linux via Tauri ou équivalent)** : non développée. ArchiveFlow est une application web (PWA non installable pour l'instant).
- **Fonctionnement hors ligne (PWA installable, service worker)** : non implémenté. Une connexion est nécessaire pour charger l'application (le traitement des fichiers, lui, reste local une fois la page chargée).
- **Prévisualisation sandboxée des fichiers extraits** : non implémentée ; ArchiveFlow ne propose pas de visionneuse de fichiers intégrée.

## Internationalisation

- Un système de traduction FR/EN existe (`app/i18n.ts`) et couvre : la navigation, l'écran d'accueil, l'en-tête de l'espace de travail. Le reste de l'interface (éditeur de règles, paramètres avancés, détails des entrées, messages d'erreur et d'avertissement) reste en français uniquement. Étendre la couverture nécessite d'ajouter les clés manquantes au dictionnaire et de remplacer les chaînes câblées dans les composants concernés.

## Estimation avant traitement

- L'estimation de taille de sortie et de durée (`estimateProcessing`) est une **heuristique** basée sur l'extension de fichier et un débit de traitement approximatif ; elle n'est jamais garantie et ne doit pas être utilisée pour un dimensionnement précis.
- L'estimation d'espace disque disponible (`navigator.storage.estimate()`) reflète le quota du navigateur pour ce site, pas l'espace disque réel de la machine ; elle peut être significativement inférieure à l'espace réellement libre.

## Sécurité (voir aussi `docs/MODELE_SECURITE.md`)

- Aucune analyse antivirus ou détection de contenu malveillant dans les fichiers extraits.
- Les limites de sécurité (nombre de fichiers, taille, ratio, profondeur) sont configurables par l'utilisateur et peuvent donc être assouplies volontairement.

## Compatibilité navigateur

- Le choix direct d'un dossier de destination (File System Access API) nécessite Chrome ou Edge sur ordinateur ; les autres navigateurs (Firefox, Safari, mobile) se rabattent sur le téléchargement classique.
- `navigator.storage.estimate()` peut renvoyer un résultat `unknown` sur certains navigateurs ou dans certains contextes (navigation privée, quota non exposé).

## Processus de développement

- Le développement de ce lot de fonctionnalités a été mené par itérations directes sur les retours utilisateur plutôt que selon un processus formel de phases avec validation intermédiaire documentée (méthode décrite au §24-25 du cahier des charges d'origine). Cela ne peut pas être appliqué rétroactivement à ce qui a déjà été construit.
