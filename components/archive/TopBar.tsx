import { Archive, History, Home, Moon, Settings2, ShieldCheck, Sun } from "lucide-react";
import { LOCALES, Locale, TranslationKey } from "@/app/i18n";

export function TopBar({
  onOpenHistory,
  onOpenSettings,
  theme,
  onToggleTheme,
  screen,
  onNavigateHome,
  onNavigateWorkspace,
  locale,
  onChangeLocale,
  t,
}: {
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  screen: "home" | "workspace";
  onNavigateHome: () => void;
  onNavigateWorkspace: () => void;
  locale: Locale;
  onChangeLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <header className="v2bar">
      <a className="v2brand" onClick={onNavigateHome}>
        <i>
          <Archive />
        </i>
        <span>
          Archive<b>Flow</b>
          <small>{t("brand.tagline")}</small>
        </span>
      </a>
      <nav>
        <button className={screen === "home" ? "on" : ""} onClick={onNavigateHome}>
          <Home />
          {t("nav.home")}
        </button>
        <button className={screen === "workspace" ? "on" : ""} onClick={onNavigateWorkspace}>
          {t("nav.workspace")}
        </button>
        <button onClick={onOpenHistory}>
          <History />
          {t("nav.history")}
        </button>
        <button onClick={onOpenSettings}>
          <Settings2 />
          {t("nav.settings")}
        </button>
      </nav>
      <div className="v2barright">
        <div className="localeswitch">
          {LOCALES.map((l) => (
            <button key={l.id} className={locale === l.id ? "on" : ""} onClick={() => onChangeLocale(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <button className="themetoggle" onClick={onToggleTheme} title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <strong>
          <ShieldCheck />
          {t("brand.localProcessing")}
        </strong>
      </div>
    </header>
  );
}
