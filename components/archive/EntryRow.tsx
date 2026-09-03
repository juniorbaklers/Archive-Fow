import { CheckCircle2, File, FolderOpen } from "lucide-react";
import { formatBytes } from "@/app/archive-utils";
import { SmartEntry } from "@/app/smart-engine";
import { TranslationKey } from "@/app/i18n";

const COLLISION_KEY: Record<string, TranslationKey> = {
  "same-name-same-content": "entry.collisionSameNameSameContent",
  "same-name-different-content": "entry.collisionSameNameDifferentContent",
  "same-content-different-name": "entry.collisionSameContentDifferentName",
};

export function EntryRow({
  e,
  excluded,
  toggle,
  t,
}: {
  e: SmartEntry;
  excluded: boolean;
  toggle: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className={`v2row ${e.collision ? "duplicate" : ""} ${excluded ? "excluded" : ""}`}
      title={e.quarantined ? t("entry.quarantinedTitle", { reason: e.quarantineReason || "" }) : e.explanation}
    >
      <input type="checkbox" checked={!excluded} onChange={toggle} aria-label={t("entry.include", { name: (e.planned || e.name).split("/").pop() || "" })} />
      <i>{e.directory ? <FolderOpen /> : <File />}</i>
      <div>
        <b>{(e.planned || e.name).split("/").pop()}</b>
        <small>
          {e.category} • {formatBytes(e.size)} • {e.source}
        </small>
        {e.quarantined ? (
          <small className="familywarn">{t("entry.quarantineLabel", { reason: e.quarantineReason || "" })}</small>
        ) : (
          <small className="why">{e.explanation}</small>
        )}
        {e.family && (
          <small className={e.familyIncomplete ? "familywarn" : "familyok"}>
            {e.family} —{" "}
            {e.familyIncomplete ? t("entry.familyIncomplete") : t("entry.familyComplete")}
          </small>
        )}
      </div>
      {e.quarantined ? (
        <span className="integritybadge unsafe">{t("entry.quarantineBadge")}</span>
      ) : e.collision ? (
        <span className="dup">{t(COLLISION_KEY[e.collision])}</span>
      ) : e.pathUnsafe ? (
        <span className="integritybadge unsafe">{t("entry.longPathBadge")}</span>
      ) : e.integrityProtected && e.pathAdjusted ? (
        <span className="pathfixed" title={t("entry.before", { path: e.originalPlanned || "" })}>{t("entry.foldersShortenedSig")}</span>
      ) : e.integrityProtected ? (
        <span className="integritybadge">{t("entry.sigLinksProtected")}</span>
      ) : e.pathAdjusted ? (
        <span className="pathfixed" title={t("entry.before", { path: e.originalPlanned || "" })}>{t("entry.windowsPathFixed")}</span>
      ) : e.contentMatch ? (
        <span className="shared">{t("entry.identicalElsewhere")}</span>
      ) : (
        <CheckCircle2 />
      )}
    </div>
  );
}
