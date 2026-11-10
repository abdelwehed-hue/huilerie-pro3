import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, ShieldAlert, ArrowRightLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import type { Load } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { CodeBadge, PageHeader, StatCard } from "@/components/shared";

export default function Cancellations() {
  const { t } = useI18n();
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const [month, setMonth] = useState("");
  const q = useQuery({
    queryKey: ["loads", "cancellations", month],
    queryFn: () => apiGet<Load[]>(`/loads/cancellations${month ? `?month=${month}` : ""}`),
    enabled: isAdmin,
  });
  const rows = q.isError ? [] : (q.data ?? []);

  if (me.data && !isAdmin) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800" data-testid="admin-only-notice">
        <ShieldAlert /> {t("admin_only")}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("cancellations")} sub={t("cancellations_sub")} accent="bg-red-500" />
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="cm">{t("month")}</Label>
          <Input id="cm" type="month" data-testid="cancellations-month-input" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 w-48 rounded-xl bg-white" />
        </div>
        <div className="w-60">
          <StatCard tone="rose" testId="cancellations-count" label="Annuler" value={rows.length} icon={<Ban />} sub={`${fmtNum(rows.reduce((a, r) => a + r.olive_kg, 0))} ${t("kg")}`} />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
        <Table data-testid="cancellations-table">
          <TableHeader className="bg-red-50/60">
            <TableRow>
              <TableHead className="text-start">{t("code")}</TableHead>
              <TableHead className="text-start">{t("client")}</TableHead>
              <TableHead className="text-end">{t("olive_kg")}</TableHead>
              <TableHead className="text-start">Type / motif</TableHead>
              <TableHead className="text-start">Responsable</TableHead>
              <TableHead className="text-start">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-stone-500">{t("no_data")}</TableCell></TableRow>
            )}
            {rows.map((l) => (
              <TableRow key={l.id} data-testid={`cancellation-row-${l.code}`}>
                <TableCell><CodeBadge code={l.code} /></TableCell>
                <TableCell className="font-medium">{l.client_name}<div className="text-xs text-stone-500" dir="ltr">{l.phone}</div></TableCell>
                <TableCell className="text-end text-lime-800">{fmtNum(l.olive_kg)}</TableCell>
                <TableCell className="max-w-72" data-testid={`cancellation-reason-${l.code}`}>
                  {l.ownership_transferred && !l.cancel_reason ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
                      <ArrowRightLeft className="size-3.5" /> VENDUE À L'HUILERIE
                    </span>
                  ) : (
                    <span className="text-red-700">{l.cancel_reason || "إلغاء الحمولة"}</span>
                  )}
                </TableCell>
                <TableCell dir="ltr" className="text-start">
                  {l.ownership_transferred && !l.cancel_reason ? "Huilerie" : `@${l.cancelled_by || "—"}`}
                </TableCell>
                <TableCell dir="ltr" className="text-start text-sm">
                  {l.ownership_transferred && !l.cancel_reason
                    ? (l.ownership_transferred_at ? fmtDate(l.ownership_transferred_at) : "—")
                    : (l.cancelled_at ? fmtDate(l.cancelled_at) : "—")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
