import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Droplet, FileText, PackageCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { Load } from "@/lib/types";
import { fmtDate, fmtMoney, fmtNum, useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { CodeBadge, GradeBadge, PageHeader, StatusPill } from "@/components/shared";
import OilEntryDialog from "@/components/OilEntryDialog";
import CancelLoadDialog from "@/components/CancelLoadDialog";

export default function Loads() {
  const { t, errMsg } = useI18n();
  const isAdmin = useMe().data?.role === "admin";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Load | null>(null);
  const [cancelling, setCancelling] = useState<Load | null>(null);
  const st = status === "all" ? "" : status;

  const loads = useQuery({
    queryKey: ["loads", q, st],
    queryFn: () => apiGet<Load[]>(`/loads?q=${encodeURIComponent(q)}&status=${st}`),
  });
  const rows = loads.isError ? [] : (loads.data ?? []);
  const invoices = useQuery({ queryKey: ["invoices", "load-links"], queryFn: () => apiGet<Array<{ id: string; load_id: string; number: string }>>("/invoices") });
  const invoiceByLoad = new Map((invoices.data ?? []).map((invoice) => [invoice.load_id, invoice]));

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/loads/${id}`),
    onSuccess: () => {
      toast.success(t("load_deleted"));
      for (const k of ["loads", "stats", "clients", "client"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const deliver = useMutation({
    mutationFn: (id: string) => apiPost<Load>(`/loads/${id}/deliver`, {}),
    onSuccess: () => {
      toast.success(t("delivered_toast"));
      qc.invalidateQueries({ queryKey: ["loads"] });
      qc.invalidateQueries({ queryKey: ["load-by-code"] });
      qc.invalidateQueries({ queryKey: ["client"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const STATUS_LABEL: Record<string, string> = { all: t("all"), pending: t("pending"), pressing: t("pressing"), done: t("done"), delivered: t("delivered"), cancelled: t("cancelled") };
  const active = rows.filter((r) => r.status !== "cancelled");
  const totalOlive = active.reduce((a, r) => a + r.olive_kg, 0);
  const totalOil = active.reduce((a, r) => a + (r.oil_kg ?? 0), 0);
  const totalAmount = active.reduce((a, r) => a + (r.amount ?? 0), 0);

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
            <SelectItem value="pressing">{t("pressing")}</SelectItem>
            <SelectItem value="done">{t("done")}</SelectItem>
            <SelectItem value="delivered">{t("delivered")}</SelectItem>
            <SelectItem value="cancelled">{t("cancelled")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ms-auto flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-lime-100 px-3 py-1.5 font-semibold text-lime-900" data-testid="loads-total-olive">{t("olives")}: {fmtNum(totalOlive)} {t("kg")}</span>
          <span className="rounded-full bg-yellow-100 px-3 py-1.5 font-semibold text-yellow-900" data-testid="loads-total-oil">{t("oil")}: {fmtNum(totalOil)} {t("liter")}</span>
          {isAdmin && <span className="rounded-full bg-violet-100 px-3 py-1.5 font-semibold text-violet-900" data-testid="loads-total-amount">{t("revenue")}: {fmtMoney(totalAmount)}</span>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <Table data-testid="loads-table">
          <TableHeader className="bg-stone-50">
            <TableRow>
              <TableHead className="text-start">{t("code")}</TableHead>
              <TableHead className="text-start">{t("client")}</TableHead>
              <TableHead className="text-start">{t("phone")}</TableHead>
              <TableHead className="text-start">{t("varieties")}</TableHead>
              <TableHead className="text-end">{t("olive_kg")}</TableHead>
              <TableHead className="text-end">{t("oil_kg")}</TableHead>
              <TableHead className="text-end">{t("yield")}</TableHead>
              <TableHead className="text-start">{t("lab")}</TableHead>
              <TableHead className="text-start">{t("status")}</TableHead>
              <TableHead className="text-start">Facture</TableHead>
              {isAdmin && <TableHead className="text-end">{t("amount")}</TableHead>}
              <TableHead className="text-end">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 11 : 10} className="py-12 text-center text-stone-500">{t("no_data")}</TableCell>
              </TableRow>
            )}
            {rows.map((l) => (
              <TableRow key={l.id} data-testid={`load-row-${l.code}`} className={l.status === "cancelled" ? "bg-red-50/40 opacity-70" : "transition-colors hover:bg-amber-50/40"}>
                <TableCell>
                  <Link to={`/search?code=${l.code}`}><CodeBadge code={l.code} /></Link>
                  <div className="mt-1 text-xs text-stone-500" dir="ltr">{fmtDate(l.created_at)}</div>
                </TableCell>
                <TableCell className="font-medium">{l.client_name}</TableCell>
                <TableCell dir="ltr" className="text-start">{l.phone}</TableCell>
                <TableCell className="text-start">{l.variety || "—"}</TableCell>
                <TableCell className="text-end font-semibold text-lime-800">{fmtNum(l.olive_kg)}</TableCell>
                <TableCell className="text-end font-semibold text-amber-700">{fmtNum(l.oil_kg)}</TableCell>
                <TableCell className="text-end text-sky-700">{l.yield_pct != null ? `${fmtNum(l.yield_pct, 2)}%` : "—"}</TableCell>
                <TableCell>{l.lab ? <GradeBadge grade={l.lab.classification} /> : <span className="text-xs text-stone-400">—</span>}</TableCell>
                <TableCell><StatusPill status={l.status} size="large" /></TableCell>
                <TableCell>{invoiceByLoad.has(l.id) ? <Link to={`/factures?invoice_id=${encodeURIComponent(invoiceByLoad.get(l.id)!.id)}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><FileText className="size-4" />{invoiceByLoad.get(l.id)!.number}</Link> : <span className="text-stone-400">—</span>}</TableCell>
                {isAdmin && <TableCell className="text-end font-semibold text-violet-700">{fmtMoney(l.amount)}</TableCell>}
                <TableCell className="text-end">
                  <div className="flex items-center justify-end gap-1">
                  {l.status === "cancelled" ? (
                    <div className="max-w-56 text-end text-xs text-red-700" data-testid={`load-cancel-reason-${l.code}`}>{l.cancel_reason}</div>
                  ) : l.status === "delivered" ? (
                    <div className="text-end text-xs text-emerald-700" data-testid={`load-delivered-info-${l.code}`}>@{l.delivered_by}{l.delivered_at && <div dir="ltr">{fmtDate(l.delivered_at)}</div>}</div>
                  ) : (
                  <div className="flex justify-end gap-1">
                    {l.status === "done" && (
                      <Button size="sm" onClick={() => deliver.mutate(l.id)} disabled={deliver.isPending} data-testid={`load-deliver-${l.code}`} className="rounded-lg bg-emerald-600 hover:bg-emerald-700">
                        <PackageCheck className="size-4" />
                        {t("mark_delivered")}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setEditing(l)} disabled={l.status === "done"} title={l.status === "done" ? t("done") : undefined} data-testid={`load-enter-oil-${l.code}`} className="rounded-lg border-amber-300 text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50">
                      <Droplet className="size-4" />
                      {l.oil_kg != null ? t("edit_oil") : t("enter_oil")}
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(l)} data-testid={`load-cancel-${l.code}`} className="rounded-lg text-red-600 hover:bg-red-50">
                        <Ban className="size-4" />
                        {t("cancel_load")}
                      </Button>
                    )}
                  </div>
                  )}
                  {isAdmin && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t("delete")}
                      data-testid={`load-delete-${l.code}`}
                      onClick={() => window.confirm(t("confirm_delete")) && del.mutate(l.id)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <OilEntryDialog load={editing} onClose={() => setEditing(null)} />
      <CancelLoadDialog load={cancelling} onClose={() => setCancelling(null)} />
    </div>
  );
}
