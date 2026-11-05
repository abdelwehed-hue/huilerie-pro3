import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Warehouse } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AnyRecord = Record<string, any>;

async function fetchAllPages(path: string, pageSize: number): Promise<AnyRecord[]> {
  const rows: AnyRecord[] = [];
  for (let skip = 0, page = 0; page <= 100; skip += pageSize, page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const chunk = await apiGet<AnyRecord[]>(path + separator + "limit=" + pageSize + "&skip=" + skip);
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
  throw new Error("La liste dépasse la limite de pagination sûre.");
}

function formatQuantity(input: unknown) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) : "—";
}

export default function CommercialTanksSettings() {
  const { lang } = useI18n();
  const queryClient = useQueryClient();
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({});
  const labels = lang === "ar" ? {
    title: "الخزانات",
    description: "تحديد السعة ودور كل خزان ومتابعة كمية الزيت الموجودة فيه.",
    actions: "الإجراءات",
    quantity: "الكمية الحالية (كغ)",
    capacity: "السعة القصوى (كغ)",
    flexible: "مرنة — دون سعة محددة",
    save: "حفظ",
    role: "دور الخزان",
    normal: "عادي",
    quarantine: "حجر",
    status: "الحالة",
    active: "نشط",
    inactive: "غير نشط",
    tank: "الخزان",
    loading: "جار تحميل الخزانات…",
    notReady: "يلزم تهيئة الوحدة التجارية أولاً.",
    loadError: "تعذر تحميل بيانات الخزانات.",
    noRows: "لا توجد خزانات للعرض.",
    capacitySaved: "تم تحديث سعة الخزان",
    capacityError: "تعذر تعديل سعة الخزان",
    roleSaved: "تم تحديث دور الخزان",
    confirmRole: "تأكيد تغيير دور الخزان؟",
  } : {
    title: "Cuves",
    description: "Définissez la capacité et le rôle de chaque cuve et consultez le stock d’huile.",
    actions: "Actions",
    quantity: "Quantité actuelle (kg)",
    capacity: "Capacité maximale (kg)",
    flexible: "Flexible — capacité non définie",
    save: "Enregistrer",
    role: "Rôle de la cuve",
    normal: "Normale",
    quarantine: "Quarantaine",
    status: "État",
    active: "Active",
    inactive: "Inactive",
    tank: "Cuve",
    loading: "Chargement des cuves…",
    notReady: "Initialisez d’abord le module commercial.",
    loadError: "Impossible de charger les données des cuves.",
    noRows: "Aucune cuve à afficher.",
    capacitySaved: "Capacité de la cuve mise à jour",
    capacityError: "Impossible de modifier la capacité",
    roleSaved: "Rôle de la cuve mis à jour",
    confirmRole: "Confirmer le changement de rôle de la cuve ?",
  };

  const status = useQuery({
    queryKey: ["commercial", "status"],
    queryFn: () => apiGet<{ ready: boolean }>("/commercial/v1/status"),
    refetchInterval: 30_000,
  });
  const ready = status.data?.ready === true;
  const tanks = useQuery({
    queryKey: ["commercial", "tanks"],
    queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/tanks"),
    enabled: ready,
  });
  const balances = useQuery({
    queryKey: ["commercial", "balances"],
    queryFn: () => fetchAllPages("/commercial/v1/stock-balances", 1000),
    enabled: ready,
  });
  const changeCapacity = useMutation({
    mutationFn: ({ tank, capacity }: { tank: AnyRecord; capacity: string }) =>
      apiPut<AnyRecord>("/commercial/v1/tanks/" + encodeURIComponent(tank.id) + "/capacity", {
        capacity_kg: capacity.trim() === "" ? null : Number(capacity),
        expected_version: tank.version ?? 1,
      }),
    onSuccess: async () => {
      toast.success(labels.capacitySaved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "tanks"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : labels.capacityError),
  });
  const changeRole = useMutation({
    mutationFn: ({ tank, role }: { tank: AnyRecord; role: "NORMAL" | "QUARANTINE" }) =>
      apiPost<AnyRecord>("/commercial/v1/tanks/" + encodeURIComponent(tank.id) + "/role", {
        role,
        expected_version: tank.version ?? 1,
      }),
    onSuccess: async () => {
      toast.success(labels.roleSaved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "tanks"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : labels.loadError),
  });

  const tankQuantity = (tankId: string) => (balances.data ?? [])
    .filter((balance) => balance.location_id === tankId && balance.product_kind === "OIL")
    .reduce((sum, balance) => sum + Number(balance.quantity_kg ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Warehouse className="size-5 text-cyan-700" />{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {status.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">{labels.loading}</p>}
        {(status.isError || tanks.isError || balances.isError) && (
          <p className="py-6 text-center text-sm text-red-700">{labels.loadError}</p>
        )}
        {!status.isLoading && !status.isError && !ready && (
          <p className="py-6 text-center text-sm text-muted-foreground">{labels.notReady}</p>
        )}
        {ready && (tanks.isLoading || balances.isLoading) && (
          <p className="py-6 text-center text-sm text-muted-foreground">{labels.loading}</p>
        )}
        {ready && !tanks.isLoading && !balances.isLoading && !tanks.isError && !balances.isError && (
          <Table dir={lang === "ar" ? "rtl" : "ltr"}>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.actions}</TableHead>
                <TableHead>{labels.quantity}</TableHead>
                <TableHead>{labels.capacity}</TableHead>
                <TableHead>{labels.role}</TableHead>
                <TableHead>{labels.status}</TableHead>
                <TableHead>{labels.tank}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tanks.data ?? []).map((tank) => {
                const quantity = tankQuantity(tank.id);
                const flexibleScale = Math.max(1, ...(tanks.data ?? []).map((item) => tankQuantity(item.id)));
                const scale = tank.capacity_kg != null && Number(tank.capacity_kg) > 0
                  ? Number(tank.capacity_kg)
                  : flexibleScale;
                const fillPercent = Math.min(100, Math.max(0, (quantity / scale) * 100));
                const currentDraft = capacityDrafts[tank.id] ?? (tank.capacity_kg == null ? "" : String(tank.capacity_kg));

                return (
                  <TableRow key={tank.id}>
                    <TableCell>
                      <div dir={lang === "ar" ? "rtl" : "ltr"} className="flex flex-wrap items-center gap-2">
                        <input
                          aria-label={labels.capacity}
                          type="number"
                          min={Math.max(0.001, quantity)}
                          step="0.001"
                          placeholder={labels.flexible}
                          value={currentDraft}
                          onChange={(event) => setCapacityDrafts((current) => ({ ...current, [tank.id]: event.target.value }))}
                          className="h-9 w-32 rounded-lg border bg-background px-2 text-sm"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={changeCapacity.isPending || (currentDraft !== "" && Number(currentDraft) < quantity)}
                          onClick={() => changeCapacity.mutate({ tank, capacity: currentDraft })}
                        >
                          {labels.save}
                        </Button>
                        <select
                          aria-label={labels.role}
                          value={tank.role ?? "NORMAL"}
                          disabled={quantity > 0 || changeRole.isPending}
                          onChange={(event) => {
                            const role = event.target.value as "NORMAL" | "QUARANTINE";
                            if (window.confirm(labels.confirmRole)) changeRole.mutate({ tank, role });
                          }}
                          className="h-9 rounded-lg border bg-background px-2 text-sm disabled:opacity-50"
                        >
                          <option value="NORMAL">{labels.normal}</option>
                          <option value="QUARANTINE">{labels.quarantine}</option>
                        </select>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[190px]">
                      <div dir="ltr" className="flex items-center gap-3">
                        <div
                          className="h-5 min-w-[90px] flex-1 overflow-hidden rounded-full bg-stone-200 shadow-inner"
                          role="progressbar"
                          aria-label={labels.quantity + ": " + formatQuantity(quantity) + " kg"}
                          aria-valuemin={0}
                          aria-valuemax={scale}
                          aria-valuenow={quantity}
                        >
                          <div
                            className="h-full rounded-full transition-[width,background-color] duration-500"
                            style={{ width: formatPercent(fillPercent), backgroundColor: "hsl(" + (120 - (fillPercent * 1.2)) + " 75% 40%)" }}
                          />
                        </div>
                        <span className="whitespace-nowrap font-bold tabular-nums">{formatQuantity(quantity)} kg</span>
                      </div>
                    </TableCell>
                    <TableCell>{tank.capacity_kg == null ? labels.flexible : formatQuantity(tank.capacity_kg)}</TableCell>
                    <TableCell>{(tank.role ?? "NORMAL") === "QUARANTINE" ? labels.quarantine : labels.normal}</TableCell>
                    <TableCell>{tank.active ? labels.active : labels.inactive}</TableCell>
                    <TableCell className="font-semibold">{String(tank.code ?? "—")} · {String(tank.name ?? "—")}</TableCell>
                  </TableRow>
                );
              })}
              {!(tanks.data?.length) && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{labels.noRows}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function formatPercent(value: number) {
  return value + "%";
}
