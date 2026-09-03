# Manuel utilisateur — ArchiveFlow (Universal Archive Manager)

ArchiveFlow est une application web qui s'exécute entièrement dans votre navigateur. Aucun fichier n'est envoyé vers un serveur : tout le traitement (lecture, classement, création d'archives) se fait localement, sur votre appareil.

## 1. Démarrage

À l'ouverture, l'écran d'accueil propose deux actions principales :

- **Extraire & organiser** — ouvrir une ou plusieurs archives existantes (ZIP, TAR, TAR.GZ, GZIP, 7Z, RAR), les classer, les renommer si besoin, puis enregistrer le résultat.
- **Créer une archive** — rassembler des fichiers et des dossiers dans une nouvelle archive ZIP, TAR, TAR.GZ ou GZIP.

L'écran d'accueil affiche aussi vos dernières opérations et vos profils métiers enregistrés (SIG, Documents, Médias, Développeur, CAO/BIM, Scientifique) : cliquer sur un profil applique ses réglages par défaut et ouvre directement l'espace de travail.

## 2. Extraire & organiser

1. **Ajouter des fichiers** : glissez-déposez une ou plusieurs archives, ou utilisez « Ajouter des fichiers » / « Importer un dossier récursivement ».
2. Si plusieurs fichiers portent le même nom d'archive, ils sont automatiquement numérotés pour éviter toute confusion.
3. **Archives imbriquées** : cochez « Extraire aussi les archives imbriquées » si une archive contient elle-même d'autres archives (jusqu'à 3 niveaux de profondeur). Cette option est désactivée par défaut.
4. **Fichiers multi-parties** : si vous sélectionnez un ensemble de fichiers `nom.ext.001`, `nom.ext.002`, etc., ils sont reconstitués automatiquement avant lecture. Les volumes ZIP fractionnés (`.zNN` + `.zip`) et RAR multi-parties (`.partN.rar`) ne sont pas reconstituables dans le navigateur : reconstituez-les avec 7-Zip ou WinRAR avant de les importer ici.
5. Le **moteur intelligent** (classement automatique, renommage, gestion des collisions) est configurable dans la colonne de gauche. Un **profil métier** peut préconfigurer ces réglages.
6. La colonne de droite simule le résultat avant tout enregistrement : nombre de fichiers, conflits, chemins raccourcis, éléments mis en quarantaine.
7. Choisissez un dossier de destination (« Choisir le dossier maintenant »). L'application analyse le dossier (conflits, espace disque estimé) avant d'écrire quoi que ce soit.

## 3. Créer une archive

1. Ajoutez des fichiers et/ou des dossiers complets ; répétez l'opération pour combiner plusieurs sources dans une seule archive.
2. Choisissez le format de sortie (ZIP, TAR, TAR.GZ, GZIP — GZIP n'accepte qu'un seul fichier à la fois).
3. Pour un ZIP, vous pouvez activer la compression (plus lent, fichier plus petit) ou la désactiver (stockage brut, plus rapide).
4. **Taille maximale par archive** (facultatif) : si le résultat dépasse cette taille, plusieurs archives complètes et indépendantes sont produites (`nom_part1.zip`, `nom_part2.zip`, …) au lieu d'une seule. Ce n'est pas un format de volumes multi-parties officiel : chaque partie s'ouvre seule, avec n'importe quel outil standard.
5. Une estimation (taille totale, taille compressée approximative, durée approximative) s'affiche avant le lancement.
6. Cliquez sur « Télécharger » (génère l'archive et la propose au téléchargement) ou « Choisir un dossier » (écrit les fichiers directement, sans les compresser).

## 4. Vérifications de sécurité et d'intégrité

- Chaque archive lue est protégée contre les chemins dangereux (`../`, chemins absolus) et contre les taux de compression anormaux (bombes zip) : un élément suspect est mis en quarantaine (exclu par défaut) plutôt que décompressé.
- Après la création d'une archive, son contenu est relu et comparé à la sélection d'origine avant de la proposer au téléchargement.
- Des limites de sécurité par défaut (nombre de fichiers, taille totale décompressée, ratio de compression, profondeur de dossiers) sont appliquées à toute lecture d'archive ; voir `docs/MODELE_SECURITE.md`.

## 5. Historique, thème et langue

- **Historique** : liste locale (stockée uniquement dans votre navigateur) des opérations effectuées, exportable en JSON, CSV ou HTML.
- **Thème clair/sombre** : bouton dans la barre du haut, mémorisé pour les prochaines visites.
- **Langue** : sélecteur FR/EN dans la barre du haut. La navigation, l'écran d'accueil et l'en-tête de l'espace de travail sont traduits ; le reste de l'interface (règles, paramètres, détails de fichiers) reste en français pour le moment — voir `docs/LIMITES_CONNUES.md`.

## 6. Confidentialité

Aucun fichier ni métadonnée n'est transmis à un serveur. Le traitement, le stockage temporaire et l'écriture du résultat se font intégralement dans votre navigateur, via les API natives (File System Access, Compression Streams, Web Crypto).
