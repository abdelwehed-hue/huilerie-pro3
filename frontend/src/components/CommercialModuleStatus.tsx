import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Factory, ShieldCheck } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CommercialStatus = {
  active_season: string;
  season_code: string;
  tanks_provisioned: number;
  active_olive_locations: number;
  season_counters_provisioned: number;
  ready: boolean;
};

export default function CommercialModuleStatus() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ["commercial", "status"],
    queryFn: () => apiGet<CommercialStatus>("/commercial/v1/status"),
    refetchInterval: 30_000,
  });
  const ready = status.data?.ready === true;

  const bootstrap = useMutation({
    mutationFn: () => apiPost<CommercialStatus>("/commercial/v1/bootstrap"),
    onSuccess: async () => {
      toast.success(ar ? "تمت تهيئة الوحدة التجارية" : "Module commercial initialisé");
      await queryClient.invalidateQueries({ queryKey: ["commercial"] });
    },
    onError: () => toast.error(ar ? "تعذرت تهيئة الوحدة التجارية" : "Impossible d'initialiser le module commercial"),
  });

  return (
    <div className="space-y-4" data-testid="commercial-module-status">
      {status.isError && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            {ar ? "تعذر التحقق من حالة الوحدة التجارية." : "Impossible de vérifier l’état du module commercial."}
            {" "}{String((status.error as Error)?.message ?? "")}
          </div>
        </div>
      )}

      <Card className={ready ? "border-emerald-200 bg-emerald-50/40" : "border-amber-300 bg-amber-50/70"}>
        <CardHeader>
          <CardTitle>{ar ? "حالة الوحدة" : "État du module"}</CardTitle>
          <CardDescription>
            {status.isLoading
              ? (ar ? "جارٍ التحقق من حالة الوحدة…" : "Vérification de l’état du module…")
              : ready
                ? (ar ? "جاهزة بعد التهيئة" : "Prêt après initialisation")
                : (ar ? "تتطلب التهيئة" : "Initialisation requise")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm">
          {ready
            ? <ShieldCheck className="size-5 text-emerald-600" />
            : <AlertTriangle className="size-5 text-amber-600" />}
          {ready
            ? (ar ? "الوحدة التجارية جاهزة للعمل." : "Le module commercial est prêt à fonctionner.")
            : (ar ? "لم تتم تهيئة الوحدة التجارية في قاعدة البيانات بعد." : "Le module commercial n’est pas encore initialisé dans la base de données.")}
        </CardContent>
      </Card>

      {!ready && !status.isError && (
        <Card className="border-amber-300 bg-amber-50/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-950">
              <AlertTriangle className="size-5" />
              {ar ? "التهيئة مطلوبة" : "Initialisation requise"}
            </CardTitle>
            <CardDescription className="text-amber-900">
              {ar
                ? "تنشئ هذه العملية الخزانات التسعة وعدادات الموسم، بما فيها وثائق تجارب ما قبل الإنتاج ESS. لا تضيف أي مخزون ولا تغيّر بيانات العصر."
                : "Cette action crée les neuf cuves et les compteurs de la saison, y compris les essais préproduction ESS. Elle ne crée aucun stock et ne modifie pas les données de trituration."}
            </CardDescription>
          </CardHeader>
          {isAdmin ? (
            <CardContent>
              <Button disabled={bootstrap.isPending || status.isLoading} onClick={() => bootstrap.mutate()}>
                <Factory className="size-4" />
                {bootstrap.isPending
                  ? (ar ? "جار التهيئة…" : "Initialisation…")
                  : (ar ? "تهيئة الوحدة التجارية" : "Initialiser le module commercial")}
              </Button>
            </CardContent>
          ) : (
            <CardContent className="text-sm text-amber-900">
              {ar ? "التهيئة متاحة للمسؤول فقط." : "Initialisation réservée à l’administrateur."}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
