import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search as SearchIcon, Droplet, Printer, ScanLine, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
import type { Load, StatusUpdate } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { LoadDetail, PageHeader, StatusPill } from "@/components/shared";
import OilEntryDialog from "@/components/OilEntryDialog";
import QrScanDialog from "@/components/QrScanDialog";
import { ReprintDialog } from "@/components/ReceptionTicket";

function StatusControl({ load, onNeedOil }: { load: Load; onNeedOil: () => void }) {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (b: StatusUpdate) => apiPatch<Load>(`/loads/${load.id}/status`, b),
    onSuccess: () => {
      toast.success(t("status_updated"));
      ["load-by-code", "loads", "loads-search", "stats", "client"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  if (load.status === "cancelled") return null;
  return (
    <div className="space-y-2">
      <Label>{t("status_change")}</Label>
      <Select
        value={load.status}
        disabled={m.isPending}
        onValueChange={(v) => {
          const s = v as StatusUpdate["status"];
          if ((s === "done" || s === "delivered") && load.oil_kg == null) { toast.error(t("err_oil_not_ready")); onNeedOil(); return; }
          m.mutate({ status: s });
        }}
      >
        <SelectTrigger className="h-11 w-64 rounded-xl bg-white" data-testid="search-status-select"><SelectValue>{(v) => t(v as StatusUpdate["status"])}</SelectValue></SelectTrigger>
        <SelectContent>
          <SelectItem value="pending" disabled={load.oil_kg != null}>{t("pending")}</SelectItem>
          <SelectItem value="pressing" disabled={load.oil_kg != null} data-testid="search-status-option-pressing">{t("pressing")}</SelectItem>
          <SelectItem value="done" data-testid="search-status-option-done">{t("done")}</SelectItem>
          <SelectItem value="delivered" data-testid="search-status-option-delivered">{t("delivered")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default function SearchPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const code = params.get("code") ?? "";
  const term = params.get("q") ?? "";
  const [input, setInput] = useState(code || term);
  const [last, setLast] = useState(code + "|" + term);
  const [editing, setEditing] = useState<Load | null>(null);
  const [reprint, setReprint] = useState<Load | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  if (code + "|" + term !== last) {
    setLast(code + "|" + term);
    setInput(code || term);
  }

  const one = useQuery({
    queryKey: ["load-by-code", code],
    queryFn: () => apiGet<Load>(`/loads/by-code/${encodeURIComponent(code)}`),
    enabled: !!code,
    retry: false,
  });
  const list = useQuery({
    queryKey: ["loads-search", term],
    queryFn: () => apiGet<Load[]>(`/loads?q=${encodeURIComponent(term)}`),
    enabled: !!term && !code,
  });
  const results = list.isError ? [] : (list.data ?? []);
  const notFound = (one.isError && one.error instanceof ApiError && one.error.status === 404) || (!!term && !code && list.isSuccess && results.length === 0);
  const shown = code ? (one.isError ? undefined : one.data) : results.length === 1 ? results[0] : undefined;

  return (
    <div>
      <PageHeader title={t("search")} sub={t("search_any_hint")} accent="bg-sky-500" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = input.trim();
          if (!v) return;
          setParams(/^\d{10}$/.test(v) ? { code: v } : { q: v });
        }}
        className="mb-8 flex max-w-3xl flex-wrap gap-3"
      >
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          data-testid="search-qr-scan-button"
          title={t("scan_qr")}
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-teal-600 text-white shadow-lg shadow-sky-600/30 transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          <ScanLine className="size-8" />
        </button>
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-sky-500" />
          <Input
            data-testid="search-code-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("search_any_hint")}
            className="h-14 rounded-2xl border-sky-200 bg-white ps-12 text-xl"
          />
        </div>
        <Button type="submit" data-testid="search-code-submit" className="h-14 rounded-2xl bg-sky-600 px-8 text-base hover:bg-sky-700">
          {t("go")}
        </Button>
      </form>

      {(one.isLoading || list.isLoading) && <p className="text-stone-500">{t("loading")}</p>}
      {notFound && (
        <div data-testid="search-not-found" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          {t("not_found")}: <span className="font-mono font-bold" dir="ltr">{code || term}</span>
        </div>
      )}

      {!code && results.length > 1 && (
        <div className="max-w-4xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm" data-testid="search-results">
          <div className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-600">{t("results")} ({results.length})</div>
          <ul className="divide-y divide-stone-100">
            {results.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setParams({ code: l.code })}
                  data-testid={`search-result-${l.code}`}
                  className="flex w-full flex-wrap items-center gap-4 px-4 py-3 text-start transition-colors duration-150 hover:bg-sky-50"
                >
                  <span className="font-mono font-bold text-stone-900" dir="ltr">{l.code}</span>
                  <span className="flex min-w-40 flex-1 items-center gap-2"><UserRound className="size-4 text-teal-600" />{l.client_name} <span className="text-xs text-stone-500" dir="ltr">{l.phone}</span></span>
                  <span className="text-sm text-lime-800">{fmtNum(l.olive_kg)} kg</span>
                  <span className="text-xs text-stone-500" dir="ltr">{fmtDate(l.created_at)}</span>
                  <StatusPill status={l.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown && (
        <div className="space-y-5">
          <LoadDetail load={shown} />
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <StatusControl load={shown} onNeedOil={() => setEditing(shown)} />
            {shown.status !== "cancelled" && (
              <Button onClick={() => setEditing(shown)} data-testid="search-enter-oil-button" className="h-11 rounded-xl bg-amber-600 hover:bg-amber-700">
                <Droplet className="size-4" />
                {shown.oil_kg != null ? t("edit_oil") : t("enter_oil")}
              </Button>
            )}
            <Button onClick={() => setReprint(shown)} variant="outline" data-testid="search-reprint-button" className="h-11 rounded-xl border-amber-300 text-amber-800 hover:bg-amber-50">
              <Printer className="size-4" /> {t("reprint")}
            </Button>
          </div>
        </div>
      )}
      <OilEntryDialog load={editing} onClose={() => setEditing(null)} />
      <ReprintDialog load={reprint} onClose={() => setReprint(null)} />
      <QrScanDialog open={scanOpen} onClose={() => setScanOpen(false)} />
    </div>
  );
}
