// Minimal i18n layer: FR (default) and EN. This covers the navigation, home
// screen, and workspace header - a representative subset proving the
// translation plumbing works end to end - not the full app, which still runs
// in French elsewhere (rule editor, settings, entry details, messages).
// See docs/LIMITES_CONNUES.md.
export type Locale = "fr" | "en";
export const LOCALES: { id: Locale; label: string }[] = [
  { id: "fr", label: "FR" },
  { id: "en", label: "EN" },
];

const dict = {
  fr: {
    "nav.home": "Accueil",
    "nav.workspace": "Espace de travail",
    "nav.history": "Historique",
    "nav.settings": "Paramètres",
    "brand.tagline": "MANAGER",
    "brand.localProcessing": "Traitement local",
    "home.eyebrow": "Gestionnaire d’archives local",
    "home.title": "Que voulez-vous faire ?",
    "home.subtitle": "Extrayez et organisez une archive existante, ou créez-en une nouvelle. Tout se passe dans votre navigateur, sans transfert de fichiers.",
    "home.extract.title": "Extraire & organiser",
    "home.extract.desc": "Ouvrez une ou plusieurs archives, classez et renommez leur contenu, puis enregistrez-le.",
    "home.create.title": "Créer une archive",
    "home.create.desc": "Rassemblez des fichiers et des dossiers dans une nouvelle archive ZIP, TAR ou GZIP.",
    "home.recent": "Opérations récentes",
    "home.recentEmpty": "Aucune opération pour l’instant.",
    "home.profiles": "Profils métiers enregistrés",
    "home.footer": "Traitement 100 % local : vos fichiers ne quittent jamais votre appareil.",
    "workspace.eyebrow": "Espace de travail",
    "workspace.title": "Organisez vos archives en toute confiance.",
    "workspace.subtitle": "Classement intelligent, renommage, familles et collisions sécurisées.",
    "mode.extract": "Extraire & organiser",
    "mode.create": "Créer une archive",
  },
  en: {
    "nav.home": "Home",
    "nav.workspace": "Workspace",
    "nav.history": "History",
    "nav.settings": "Settings",
    "brand.tagline": "MANAGER",
    "brand.localProcessing": "Local processing",
    "home.eyebrow": "Local archive manager",
    "home.title": "What would you like to do?",
    "home.subtitle": "Extract and organize an existing archive, or create a new one. Everything happens in your browser, with no file transfer.",
    "home.extract.title": "Extract & organize",
    "home.extract.desc": "Open one or more archives, classify and rename their content, then save it.",
    "home.create.title": "Create an archive",
    "home.create.desc": "Gather files and folders into a new ZIP, TAR, or GZIP archive.",
    "home.recent": "Recent operations",
    "home.recentEmpty": "No operations yet.",
    "home.profiles": "Saved business profiles",
    "home.footer": "100% local processing: your files never leave your device.",
    "workspace.eyebrow": "Workspace",
    "workspace.title": "Organize your archives with confidence.",
    "workspace.subtitle": "Smart classification, renaming, families, and safe collision handling.",
    "mode.extract": "Extract & organize",
    "mode.create": "Create an archive",
  },
} as const;

export type TranslationKey = keyof (typeof dict)["fr"];
export function translate(locale: Locale, key: TranslationKey): string {
  return dict[locale][key] ?? dict.fr[key] ?? key;
}
