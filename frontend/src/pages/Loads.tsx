import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Droplet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import type { Load } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { CodeBadge, GradeBadge, PageHeader, StatusPill } from "@/components/shared";
import OilEntryDialog from "@/components/OilEntryDialog";

export default function Loads() {
  const { t } = useI18n();
  const isAdmin = useMe().data?.role === "admin";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Load | null>(null);
  const st = status === "all" ? "" : status;

  const loads = useQuery({
    queryKey: ["loads", q, st],
    queryFn: () => apiGet<Load[]>(`/loads?q=${encodeURIComponent(q)}&status=${st}`),
  });
  const rows = loads.isError ? [] : (loads.data ?? []);

  const STATUS_LABEL: Record<string, string> = { all: t("all"), pending: t("pending"), done: t("done") };
  const totalOlive = rows.reduce((a, r) => a + r.olive_kg, 0);
  const totalOil = rows.reduce((a, r) => a + (r.oil_kg ?? 0), 0);
  const totalAmount = rows.reduce((a, r) => a + (r.amount ?? 0), 0);

  return (
    <div>
      <PageHeader title={t("loads")} accent="bg-amber-500" />
      <div className="mb-5 flex flex-wrap gap-3">
        <Input data-testid="loads-filter-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("filter_placeholder")} className="h-10 max-w-sm rounded-xl bg-white" />
        <Select value={status} onValueChange={(v: string) => setStatus(v)}>
          <SelectTrigger className="h-10 w-44 rounded-xl bg-white" data-testid="loads-status-filter">
            <SelectValue>{(v) => STATUS_LABEL[v as string]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="pending">{t("pending")}</SelectItem>
            <SelectItem value="done">{t("done")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ms-auto flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-lime-100 px-3 py-1.5 font-semibold text-lime-900" data-testid="loads-total-olive">{t("olives")}: {fmtNum(totalOlive)} {t("kg")}</span>
          <span className="rounded-full bg-yellow-100 px-3 py-1.5 font-semibold text-yellow-900" data-testid="loads-total-oil">{t("oil")}: {fmtNum(totalOil)} {t("kg")}</span>
          {isAdmin && <span className="rounded-full bg-violet-100 px-3 py-1.5 font-semibold text-violet-900" data-testid="loads-total-amount">{t("revenue")}: {fmtNum(totalAmount, 3)} {t("dt")}</span>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <Table data-testid="loads-table">
          <TableHeader className="bg-stone-50">
            <TableRow>
              <TableHead className="text-start">{t("code")}</TableHead>
              <TableHead className="text-start">{t("client")}</TableHead>
              <TableHead className="text-start">{t("phone")}</TableHead>
              <TableHead className="text-end">{t("olive_kg")}</TableHead>
              <TableHead className="text-end">{t("oil_kg")}</TableHead>
              <TableHead className="text-end">{t("yield")}</TableHead>
              <TableHead className="text-start">{t("lab")}</TableHead>
              <TableHead className="text-start">{t("status")}</TableHead>
              {isAdmin && <TableHead className="text-end">{t("amount")}</TableHead>}
              <TableHead className="text-end">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 9} className="py-12 text-center text-stone-500">{t("no_data")}</TableCell>
              </TableRow>
            )}
            {rows.map((l) => (
              <TableRow key={l.id} data-testid={`load-row-${l.code}`} className="transition-colors hover:bg-amber-50/40">
                <TableCell>
                  <Link to={`/search?code=${l.code}`}><CodeBadge code={l.code} /></Link>
                  <div className="mt-1 text-xs text-stone-500" dir="ltr">{fmtDate(l.created_at)}</div>
                </TableCell>
                <TableCell className="font-medium">{l.client_name}</TableCell>
                <TableCell dir="ltr" className="text-start">{l.phone}</TableCell>
                <TableCell className="text-end font-semibold text-lime-800">{fmtNum(l.olive_kg)}</TableCell>
                <TableCell className="text-end font-semibold text-amber-700">{fmtNum(l.oil_kg)}</TableCell>
                <TableCell className="text-end text-sky-700">{l.yield_pct != null ? `${fmtNum(l.yield_pct, 2)}%` : "—"}</TableCell>
                <TableCell>{l.lab ? <GradeBadge grade={l.lab.classification} /> : <span className="text-xs text-stone-400">—</span>}</TableCell>
                <TableCell><StatusPill status={l.status} /></TableCell>
                {isAdmin && <TableCell className="text-end font-semibold text-violet-700">{fmtNum(l.amount, 3)}</TableCell>}
                <TableCell className="text-end">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(l)} data-testid={`load-enter-oil-${l.code}`} className="rounded-lg border-amber-300 text-amber-800 hover:bg-amber-50">
                      <Droplet className="size-4" />
                      {l.oil_kg != null ? t("edit_oil") : t("enter_oil")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <OilEntryDialog load={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
