import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/shared";
import IntakePanel from "@/components/IntakePanel";

export default function Intake() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t("intake")} sub={t("arrival_sub")} accent="bg-emerald-500" />
      <IntakePanel />
    </div>
  );
}
