import { Archive, ArchiveRestore, FolderOpen, History, ShieldCheck, Sparkles } from "lucide-react";
import { HistoryEntry } from "./HistoryPanel";
import { TranslationKey } from "@/app/i18n";

export function HomeScreen({
  history,
  profiles,
  onStart,
  onSelectProfile,
  t,
}: {
  history: HistoryEntry[];
  profiles: { id: string; name: string; description: string }[];
  onStart: (mode: "extract" | "create") => void;
  onSelectProfile: (id: string) => void;
  t: (key: TranslationKey) => string;
}) {
  const recent = history.slice(0, 5);
  return (
    <section className="homescreen">
      <div className="homehero">
        <em>
          <Sparkles />
          {t("home.eyebrow").toUpperCase()}
        </em>
        <h1>{t("home.title")}</h1>
        <p>{t("home.subtitle")}</p>
      </div>
      <div className="homeactions">
        <button className="homeaction" onClick={() => onStart("extract")}>
          <i>
            <FolderOpen />
          </i>
          <div>
            <b>{t("home.extract.title")}</b>
            <small>{t("home.extract.desc")}</small>
          </div>
        </button>
        <button className="homeaction" onClick={() => onStart("create")}>
          <i>
            <Archive />
          </i>
          <div>
            <b>{t("home.create.title")}</b>
            <small>{t("home.create.desc")}</small>
          </div>
        </button>
      </div>
      <div className="homegrid">
        <div className="homepanel">
          <h2>
            <History />
            {t("home.recent")}
          </h2>
          {recent.length ? (
            <ul>
              {recent.map((h) => (
                <li key={h.id}>
                  <b>
                    {h.action} — {h.format}
                  </b>
                  <small>
                    {h.count} fichiers · {new Date(h.date).toLocaleString("fr-FR")}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="homeempty">{t("home.recentEmpty")}</p>
          )}
        </div>
        <div className="homepanel">
          <h2>
            <ArchiveRestore />
            {t("home.profiles")}
          </h2>
          <ul className="homeprofiles">
            {profiles.map((p) => (
              <li key={p.id}>
                <button onClick={() => onSelectProfile(p.id)}>
                  <b>{p.name}</b>
                  <small>{p.description}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="homefooter">
        <ShieldCheck />
        {t("home.footer")}
      </p>
    </section>
  );
}
