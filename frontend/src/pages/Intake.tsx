import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/shared";
import IntakePanel from "@/components/IntakePanel";

export default function Intake() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader
        title={t("intake")}
        accent="bg-emerald-500"
        right={
          <div className="text-right">
            <div className="font-mono text-2xl font-bold tracking-wider text-stone-500" dir="ltr">AAAANM</div>
            <p className="mt-1 text-sm text-stone-600">{t("arrival_sub")}</p>
          </div>
        }
      />
      <IntakePanel />
    </div>
  );
}
