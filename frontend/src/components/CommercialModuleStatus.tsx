import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CommercialStatus = {
  ready?: boolean;
};

export default function CommercialModuleStatus() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const status = useQuery({
    queryKey: ["commercial", "status"],
    queryFn: () => apiGet<CommercialStatus>("/commercial/v1/status"),
    refetchInterval: 30_000,
    retry: false,
  });
  const ready = status.data?.ready === true;

  return (
    <Card className="border-sky-200 shadow-sm" data-testid="commercial-module-status">
      <CardHeader>
        <CardTitle>{ar ? "حالة الوحدة" : "État du module"}</CardTitle>
        <CardDescription>
          {status.isLoading ? (ar ? "جارٍ التحقق من حالة الوحدة…" : "Vérification de l’état du module…") : ready ? (ar ? "جاهزة بعد التهيئة" : "Prêt après initialisation") : (ar ? "التهيئة مطلوبة" : "Initialisation requise")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2 text-sm">
        {status.isLoading ? null : status.isError ? (
          <><AlertTriangle className="size-5 text-amber-600" />{ar ? "تعذّر التحقق من حالة الوحدة. تحقق من اتصال الخادم." : "Impossible de vérifier l’état du module. Vérifiez la connexion au serveur."}</>
        ) : ready ? (
          <><ShieldCheck className="size-5 text-emerald-600" />{ar ? "الوحدة التجارية مهيأة وجاهزة." : "Le module commercial est initialisé et prêt."}</>
        ) : (
          <><AlertTriangle className="size-5 text-amber-600" />{ar ? "الوحدة التجارية غير مهيأة في قاعدة البيانات." : "Le module commercial n’est pas encore initialisé dans la base de données."}</>
        )}
      </CardContent>
    </Card>
  );
}
