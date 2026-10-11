import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Printer, Plus, Sprout, UserRound } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/api";
import type { ClientHistory, ClientSummary, Load, LoadCreate, MillInfo, SmsStatus } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { CodeBadge, StatusPill } from "@/components/shared";

type BothFn = ReturnType<typeof useI18n>["both"];

function BiLabel({ k, both, className }: { k: Parameters<BothFn>[0]; both: BothFn; className?: string }) {
  const v = both(k);
  return (
    <div className={className}>
      <span dir="ltr" className="block">{v.fr}</span>
      <span dir="rtl" className="block">{v.ar}</span>
    </div>
  );
}

export default function IntakePanel() {
  const { t, both, errMsg } = useI18n();
  const qc = useQueryClient();
  const mill = useQuery({ queryKey: ["mill"], queryFn: () => apiGet<MillInfo>("/mill") });
  const sms = useQuery({ queryKey: ["sms-status"], queryFn: () => apiGet<SmsStatus>("/sms/status") });
  const smsNote = sms.data && !sms.isError && sms.data.enabled ? (sms.data.mode === "live" ? t("sms_sent_live_toast") : t("sms_sent_toast")) : undefined;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kg, setKg] = useState("");
  const [showSug, setShowSug] = useState(false);
  const [created, setCreated] = useState<Load | null>(null);

  const term = name.trim();
  const sug = useQuery({
    queryKey: ["clients", term],
    queryFn: () => apiGet<ClientSummary[]>(`/clients?q=${encodeURIComponent(term)}`),
    enabled: showSug,
  });
  const suggestions = sug.isError ? [] : (sug.data ?? []).slice(0, 8);

  const pick = (c: ClientSummary) => {
    setName(c.client_name);
    setPhone(c.phone);
    setPicked(c.phone);
    setShowSug(false);
  };

  const [picked, setPicked] = useState<string | null>(null);
  const histPhone = picked && picked === phone.trim() ? picked : null;
  const hist = useQuery({
    queryKey: ["client", histPhone],
    queryFn: () => apiGet<ClientHistory>(`/clients/${encodeURIComponent(histPhone!)}`),
    enabled: !!histPhone,
  });
  const h = hist.isError ? undefined : hist.data;

  const m = useMutation({
    mutationFn: (b: LoadCreate) => apiPost<Load>("/loads", b),
    onSuccess: (l) => {
      setCreated(l);
      setName("");
      setPhone("");
      setKg("");
      toast.success(`${t("created")} — ${l.code}`, { description: smsNote });
      qc.invalidateQueries({ queryKey: ["sms"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["loads"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const kgVal = parseFloat(kg.replace(",", "."));
  const valid = name.trim() && phone.trim().length >= 4 && kgVal > 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) m.mutate({ client_name: name, phone, olive_kg: kgVal });
        }}
        className="space-y-5 rounded-2xl border border-lime-200 bg-[#F2F8EE] p-6 shadow-sm"
        data-testid="intake-form"
      >
        <div className="flex items-center gap-3 text-[#1E3A14]">
          <div className="grid size-10 place-items-center rounded-xl bg-lime-600 text-white"><Sprout className="size-5" /></div>
          <h2 className="font-heading text-xl font-bold">{t("register_arrival")}</h2>
        </div>
        <div className="relative space-y-2">
          <Label htmlFor="n">{t("client_name")}</Label>
          <Input
            id="n"
            autoComplete="off"
            data-testid="intake-client-name-input"
            value={name}
            onChange={(e) => { setName(e.target.value); setShowSug(true); }}
            onFocus={() => setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
            className="h-11 rounded-xl bg-white"
          />
          {showSug && suggestions.length > 0 && (
            <ul
              data-testid="intake-client-suggestions"
              className="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-auto rounded-xl border border-lime-200 bg-white p-1 shadow-xl shadow-lime-900/10"
            >
              {suggestions.map((c) => (
                <li key={c.phone}>
                  <button
                    type="button"
                    data-testid={`intake-client-suggestion-${c.phone}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(c)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors duration-150 hover:bg-lime-50"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700"><UserRound className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-stone-900">{c.client_name}</span>
                      <span className="block text-xs text-stone-500" dir="ltr">{c.phone}</span>
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{c.loads_count}×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="ph">{t("phone")}</Label>
          <Input id="ph" dir="ltr" inputMode="tel" data-testid="intake-client-phone-input" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl bg-white text-start" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kg">{t("olive_kg")}</Label>
          <Input id="kg" inputMode="decimal" data-testid="intake-olive-kg-input" value={kg} onChange={(e) => setKg(e.target.value)} className="h-11 rounded-xl bg-white text-lg font-semibold" />
        </div>
        <Button type="submit" disabled={!valid || m.isPending} data-testid="intake-submit-button" className="h-12 w-full rounded-xl bg-lime-700 text-base hover:bg-lime-800 active:scale-[0.98] transition-transform">
          <Plus className="size-5" />
          {t("register_arrival")}
        </Button>

        {histPhone && h && (
          <div data-testid="intake-client-history" className="rounded-xl border border-teal-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-teal-900"><History className="size-4 text-teal-600" /> {t("client_quick_history")}</div>
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800" data-testid="intake-history-avg-yield">
                {t("yield")}: <span dir="ltr">{h.avg_yield != null ? `${fmtNum(h.avg_yield, 2)} %` : "—"}</span>
              </span>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-amber-50 p-2"><div className="text-stone-500">{t("loads")}</div><div className="text-base font-bold text-amber-800" data-testid="intake-history-count">{h.loads_count}</div></div>
              <div className="rounded-lg bg-lime-50 p-2"><div className="text-stone-500">{t("olives")}</div><div className="text-base font-bold text-lime-800">{fmtNum(h.olive_kg)}</div></div>
              <div className="rounded-lg bg-yellow-50 p-2"><div className="text-stone-500">{t("oil")}</div><div className="text-base font-bold text-yellow-800">{fmtNum(h.oil_kg)}</div></div>
            </div>
            <div className="mb-1 text-xs font-semibold text-stone-500">{t("previous_loads")}</div>
            {h.loads.length === 0 ? (
              <p className="text-sm text-stone-500">{t("no_previous_loads")}</p>
            ) : (
              <ul className="max-h-48 divide-y divide-stone-100 overflow-auto text-sm">
                {h.loads.slice(0, 6).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-1.5" data-testid={`intake-history-load-${l.code}`}>
                    <span className="font-mono text-xs text-stone-600" dir="ltr">{l.code}</span>
                    <span className="text-lime-800">{fmtNum(l.olive_kg)} kg</span>
                    <span className="text-amber-700">{l.oil_kg != null ? `${fmtNum(l.oil_kg)} kg` : "—"}</span>
                    <span className="text-sky-700" dir="ltr">{l.yield_pct != null ? `${fmtNum(l.yield_pct, 2)}%` : "—"}</span>
                    <StatusPill status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>

      <div>
        {created ? (
          <div className="print-area code-reveal rounded-2xl border-2 border-dashed border-amber-300 bg-white p-8 shadow-sm" data-testid="intake-ticket">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
              <div>
                <div className="font-heading text-lg font-bold text-stone-900" data-testid="intake-ticket-mill">{(!mill.isError && mill.data?.mill_name) || t("app_name")}</div>
                {!mill.isError && mill.data?.mill_address && <div className="text-xs text-stone-500">{mill.data.mill_address}</div>}
                {!mill.isError && mill.data?.mill_phone && <div className="text-xs text-stone-500" dir="ltr">{mill.data.mill_phone}</div>}
              </div>
              <div className="text-end">
                <BiLabel k="ticket" both={both} className="text-xs font-semibold uppercase tracking-wider text-amber-700" />
                <div className="mt-1 text-xs text-stone-500" dir="ltr">{fmtDate(created.created_at)}</div>
              </div>
            </div>
            <div className="my-8 flex flex-wrap items-center justify-center gap-8 text-center">
              <div>
                <BiLabel k="code" both={both} className="mb-2 text-xs text-stone-500" />
                <CodeBadge code={created.code} testId="intake-generated-code" big />
                <BiLabel k="code_hint" both={both} className="mt-3 text-sm text-stone-500" />
              </div>
              <div data-testid="intake-ticket-qr" className="flex flex-col items-center gap-1">
                <QRCodeSVG value={`${window.location.origin}/search?code=${encodeURIComponent(created.code)}`} size={112} level="M" marginSize={1} />
                <BiLabel k="scan_to_open" both={both} className="text-[10px] text-stone-500" />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t border-stone-200 pt-6 text-sm">
              <div><dt><BiLabel k="client" both={both} className="text-stone-500" /></dt><dd className="font-semibold text-stone-900" data-testid="intake-ticket-name">{created.client_name}</dd></div>
              <div><dt><BiLabel k="phone" both={both} className="text-stone-500" /></dt><dd className="font-semibold text-stone-900" dir="ltr" data-testid="intake-ticket-phone">{created.phone}</dd></div>
              <div><dt><BiLabel k="olive_kg" both={both} className="text-stone-500" /></dt><dd className="font-heading text-2xl font-bold text-lime-800" data-testid="intake-ticket-kg">{fmtNum(created.olive_kg)} kg</dd></div>
              {created.amount != null && (
                <div><dt><BiLabel k="amount" both={both} className="text-stone-500" /></dt><dd className="font-heading text-2xl font-bold text-violet-700" data-testid="intake-ticket-amount">{fmtNum(created.amount, 3)} DT</dd></div>
              )}
            </dl>
            <div className="no-print mt-8 flex gap-3">
              <Button onClick={() => window.print()} variant="outline" className="rounded-xl" data-testid="intake-print-button">
                <Printer className="size-4" /> {t("print")}
              </Button>
              <Button onClick={() => setCreated(null)} variant="ghost" className="rounded-xl" data-testid="intake-new-button">
                {t("new_arrival")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-72 place-items-center rounded-2xl border-2 border-dashed border-stone-200 bg-white/60 p-8 text-center">
            <div>
              <div className="font-mono text-4xl font-bold tracking-wider text-stone-300" dir="ltr">YYMMDDHHMM</div>
              <p className="mt-3 text-sm text-stone-500">{t("arrival_sub")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
