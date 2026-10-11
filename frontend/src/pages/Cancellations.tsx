import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ban, ShieldAlert } from "lucide-react";
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
          <StatCard tone="rose" testId="cancellations-count" label={t("cancellations")} value={rows.length} icon={<Ban />} sub={`${fmtNum(rows.reduce((a, r) => a + r.olive_kg, 0))} ${t("kg")}`} />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
        <Table data-testid="cancellations-table">
          <TableHeader className="bg-red-50/60">
            <TableRow>
              <TableHead className="text-start">{t("code")}</TableHead>
              <TableHead className="text-start">{t("client")}</TableHead>
              <TableHead className="text-end">{t("olive_kg")}</TableHead>
              <TableHead className="text-start">{t("reason")}</TableHead>
              <TableHead className="text-start">{t("cancelled_by")}</TableHead>
              <TableHead className="text-start">{t("cancelled_at")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-stone-500">{t("no_data")}</TableCell></TableRow>
            )}
            {rows.map((l) => (
              <TableRow key={l.id} data-testid={`cancellation-row-${l.code}`}>
                <TableCell><Link to={`/search?code=${l.code}`}><CodeBadge code={l.code} /></Link></TableCell>
                <TableCell className="font-medium">{l.client_name}<div className="text-xs text-stone-500" dir="ltr">{l.phone}</div></TableCell>
                <TableCell className="text-end text-lime-800">{fmtNum(l.olive_kg)}</TableCell>
                <TableCell className="max-w-72 text-red-700" data-testid={`cancellation-reason-${l.code}`}>{l.cancel_reason}</TableCell>
                <TableCell dir="ltr" className="text-start">@{l.cancelled_by}</TableCell>
                <TableCell dir="ltr" className="text-start text-sm">{l.cancelled_at ? fmtDate(l.cancelled_at) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
