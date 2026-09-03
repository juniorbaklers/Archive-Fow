# Modèle de sécurité — ArchiveFlow

## 1. Principe général

ArchiveFlow traite les archives entièrement côté client (navigateur), sans transfert réseau. Le modèle de menace considéré ici est donc : *une archive non fiable, potentiellement malveillante ou corrompue, ouverte localement par l'utilisateur* — pas une attaque réseau ou serveur, puisqu'il n'y a pas de serveur applicatif traitant les fichiers.

## 2. Menaces couvertes

### 2.1 Zip-Slip (écriture hors dossier cible)
Chaque chemin d'entrée d'archive est nettoyé par `safe()` (`app/archive-utils.ts`) : les segments `..` et les chemins absolus sont supprimés avant toute écriture, empêchant une archive de placer un fichier en dehors du dossier de destination choisi.

### 2.2 Bombes zip (décompression excessive)
Deux mécanismes complémentaires :
- **Limites agrégées** (`SecurityLimits`, valeurs par défaut dans `DEFAULT_SECURITY_LIMITS`) : nombre de fichiers max (50 000), taille décompressée totale max (10 Go), profondeur de dossiers max (20). Le dépassement bloque la lecture de l'archive entière avec un message explicite.
- **Quarantaine par entrée** : si le ratio taille décompressée / taille compressée d'une entrée dépasse la limite configurée (200:1 par défaut), cette entrée est mise en quarantaine — elle n'est **pas décompressée**, son contenu est vide, et elle est exclue par défaut de tout traitement ultérieur. L'utilisateur peut l'inclure explicitement s'il fait confiance à l'origine du fichier, après avoir vu l'avertissement.

Ces limites sont réglables dans les paramètres avancés, sous la responsabilité de l'utilisateur qui les modifie.

### 2.3 Archives imbriquées et multi-parties
- L'extraction d'archives imbriquées (option désactivée par défaut) est bornée à une profondeur de 3 niveaux, et chaque niveau imbriqué est soumis aux mêmes limites de sécurité qu'une archive de premier niveau.
- La reconstitution de fichiers multi-parties ne concatène que des séquences numériques complètes et contiguës (`.001`, `.002`, … sans trou) explicitement détectées ; les formats nécessitant une reconstruction consciente du conteneur (ZIP fractionné, RAR multi-volumes) sont explicitement refusés plutôt que traités de façon incorrecte.

### 2.4 Intégrité après création
Après la construction d'une archive (ZIP/TAR/TAR.GZ/GZIP), son contenu est relu et comparé (nombre d'entrées, taille totale) à la sélection d'origine avant qu'elle soit proposée au téléchargement. En cas d'écart, aucun fichier n'est proposé et une erreur est affichée.

### 2.5 Collisions de noms
Le moteur de classement détecte les collisions de chemins de sortie (même nom, contenu identique ou différent) et applique la politique choisie par l'utilisateur (conserver les deux avec numérotation, ignorer, dossier « Doublons », remplacement avec confirmation). Aucun écrasement silencieux n'a lieu sans confirmation explicite lorsque la politique choisie l'exige.

## 3. Ce qui n'est pas couvert (hors périmètre)

- **Archives chiffrées avec mot de passe** : la lecture est possible via `libarchive.js` lorsque le format le permet, mais aucune analyse du contenu chiffré n'est faite avant décompression (impossible par construction).
- **Création d'archives chiffrées/protégées par mot de passe** : non disponible actuellement (voir `docs/LIMITES_CONNUES.md`).
- **Analyse antivirus / détection de contenu malveillant dans les fichiers extraits** : hors périmètre. ArchiveFlow protège la mécanique d'extraction (chemins, ratios), pas le contenu des fichiers eux-mêmes.
- **Isolation du rendu de fichiers extraits** (prévisualisation sandboxée) : non implémentée.

## 4. Confidentialité des données

- Aucune donnée (fichier, nom, métadonnée) n'est envoyée à un serveur : toutes les API utilisées (lecture de fichiers, compression, hachage) sont des API navigateur natives exécutées localement.
- L'historique des opérations est stocké uniquement dans le `localStorage` du navigateur de l'utilisateur et n'est jamais transmis.
- L'estimation d'espace disque utilise `navigator.storage.estimate()`, une API qui renseigne sur le quota d'origine du navigateur, jamais sur le contenu réel du disque.

## 5. Limites de sécurité par défaut

| Paramètre | Valeur par défaut |
|---|---|
| Fichiers max par archive | 50 000 |
| Taille décompressée totale max | 10 Go |
| Ratio de compression max (avant quarantaine) | 200:1 |
| Profondeur de dossiers max | 20 |
| Profondeur d'archives imbriquées | 3 (si l'option est activée) |

Ces valeurs sont définies dans `DEFAULT_SECURITY_LIMITS` (`app/archive-utils.ts`) et testées dans `tests/archive-logic.test.mjs`.
