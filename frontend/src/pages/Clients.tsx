import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookUser, Droplet, Layers, Pencil, Percent, Phone, Sprout, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiGet } from "@/lib/api";
import type { ClientDeleteResult, ClientHistory, ClientSummary, ClientUpdate } from "@/lib/types";
import { useMe } from "@/lib/useMe";
import EditClientDialog from "@/components/EditClientDialog";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { CodeBadge, GradeBadge, PageHeader, StatCard, StatusPill } from "@/components/shared";
import { cn } from "@/lib/utils";

export default function Clients() {
  const { t, errMsg } = useI18n();
  const [params, setParams] = useSearchParams();
  const phone = params.get("phone") ?? "";
  const [q, setQ] = useState("");

  const list = useQuery({
    queryKey: ["clients", q],
    queryFn: () => apiGet<ClientSummary[]>(`/clients?q=${encodeURIComponent(q)}`),
  });
  const hist = useQuery({
    queryKey: ["client", phone],
    queryFn: () => apiGet<ClientHistory>(`/clients/${encodeURIComponent(phone)}`),
    enabled: !!phone,
    retry: false,
  });
  const rows = list.isError ? [] : (list.data ?? []);
  const h = hist.isError ? null : hist.data;
  const isAdmin = useMe().data?.role === "admin";
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ClientUpdate | null>(null);
  const del = useMutation({
    mutationFn: (p: string) => apiDelete<ClientDeleteResult>(`/clients/${encodeURIComponent(p)}`),
    onSuccess: () => {
      toast.success(t("client_deleted"));
      setParams({});
      for (const k of ["clients", "loads", "stats", "sms"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div>
      <PageHeader title={t("clients")} sub={t("clients_sub")} accent="bg-teal-500" />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
          <Input
            data-testid="clients-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search_phone")}
            className="mb-3 h-10 rounded-xl"
          />
          {rows.length === 0 && <p className="py-10 text-center text-sm text-stone-500">{t("no_data")}</p>}
          <ul className="max-h-[65vh] space-y-1 overflow-y-auto">
            {rows.map((c) => (
              <li key={c.phone}>
                <button
                  type="button"
                  data-testid={`client-item-${c.phone}`}
                  onClick={() => setParams({ phone: c.phone })}
                  className={cn(
                    "w-full rounded-xl px-3 py-2.5 text-start transition-colors duration-200",
                    c.phone === phone ? "bg-teal-50 ring-1 ring-teal-300" : "hover:bg-stone-50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-stone-900">{c.client_name}</span>
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">{c.loads_count}×</span>
                  </div>
                  <div className="mt-0.5 flex justify-between text-xs text-stone-500">
                    <span dir="ltr">{c.phone}</span>
                    <span>{fmtNum(c.olive_kg)} {t("kg")}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          {!phone && (
            <div className="grid min-h-72 place-items-center rounded-2xl border-2 border-dashed border-stone-200 bg-white/60 p-8 text-center text-stone-500">
              <div><BookUser className="mx-auto mb-3 size-10 text-teal-400" />{t("select_client")}</div>
            </div>
          )}
          {h && (
            <div className="code-reveal space-y-5" data-testid="client-history">
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">{t("client")}</div>
                  <div className="font-heading text-3xl font-bold text-stone-900" data-testid="client-history-name">{h.client_name}</div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-stone-600"><Phone className="size-4" /><span dir="ltr">{h.phone}</span></div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditing({ client_name: h.client_name, phone: h.phone })} data-testid="client-edit-button" className="rounded-xl border-teal-300 text-teal-800 hover:bg-teal-50">
                      <Pencil className="size-4" /> {t("edit")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.confirm(t("confirm_delete_client")) && del.mutate(h.phone)}
                      disabled={del.isPending}
                      data-testid="client-delete-button"
                      className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="size-4" /> {t("delete")}
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard tone="rose" testId="client-history-visits" label={t("visits")} value={h.loads_count} icon={<Layers />} />
                <StatCard tone="olive" testId="client-history-olive" label={t("olive_kg")} value={fmtNum(h.olive_kg)} unit={t("kg")} icon={<Sprout />} />
                <StatCard tone="gold" testId="client-history-oil" label={t("oil_kg")} value={fmtNum(h.oil_kg)} unit={t("kg")} icon={<Droplet />} />
                <StatCard tone="sky" label={t("avg_yield")} value={h.avg_yield != null ? fmtNum(h.avg_yield, 2) : "—"} unit="%" icon={<Percent />} />
                {h.amount != null && <StatCard tone="violet" testId="client-history-amount" label={t("amount")} value={fmtNum(h.amount, 3)} unit={t("dt")} icon={<Wallet />} />}
              </div>
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                <div className="border-b border-stone-100 px-5 py-4 font-heading text-lg font-bold">{t("history")}</div>
                <Table data-testid="client-history-table">
                  <TableHeader className="bg-stone-50">
                    <TableRow>
                      <TableHead className="text-start">{t("code")}</TableHead>
                      <TableHead className="text-start">{t("date")}</TableHead>
                      <TableHead className="text-start">Variétés d’olives</TableHead>
                      <TableHead className="text-end">{t("olive_kg")}</TableHead>
                      <TableHead className="text-end">{t("oil_kg")}</TableHead>
                      <TableHead className="text-end">{t("yield")}</TableHead>
                      <TableHead className="text-start">{t("lab")}</TableHead>
                      <TableHead className="text-start">{t("status")}</TableHead>
                      {h.amount != null && <TableHead className="text-end">{t("amount")}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {h.loads.map((l) => (
                      <TableRow key={l.id} data-testid={`client-load-${l.code}`}>
                        <TableCell><Link to={`/search?code=${l.code}`}><CodeBadge code={l.code} /></Link></TableCell>
                        <TableCell className="text-xs text-stone-500" dir="ltr">{fmtDate(l.created_at)}</TableCell>
                        <TableCell className="text-start">{l.variety || "—"}</TableCell>
                        <TableCell className="text-end font-semibold text-lime-800">{fmtNum(l.olive_kg)}</TableCell>
                        <TableCell className="text-end font-semibold text-amber-700">{fmtNum(l.oil_kg)}</TableCell>
                        <TableCell className="text-end text-sky-700">{l.yield_pct != null ? `${fmtNum(l.yield_pct, 2)}%` : "—"}</TableCell>
                        <TableCell>
                          {l.lab ? (
                            <Link to={`/certificate/${l.lab.id}`} className="inline-flex items-center gap-2">
                              <GradeBadge grade={l.lab.classification} />
                              <span className="text-xs text-stone-500" dir="ltr">{fmtNum(l.lab.acidity, 2)}%</span>
                            </Link>
                          ) : <span className="text-xs text-stone-400">—</span>}
                        </TableCell>
                        <TableCell><StatusPill status={l.status} /></TableCell>
                        {h.amount != null && <TableCell className="text-end text-violet-700">{fmtNum(l.amount, 3)}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </div>
      <EditClientDialog
        client={editing}
        onClose={() => setEditing(null)}
        onSaved={(c) => {
          setEditing(null);
          setParams({ phone: c.phone });
        }}
      />
    </div>
  );
}
