import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { fmtMoney, useI18n } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Printer, RefreshCw, TrendingDown, TrendingUp, Wallet, AlertTriangle } from "lucide-react";

type DailyEvent = {
  date: string; category: string; label: string; reference: string;
  amount: string; kind: string; detail?: string;
};
type ComparisonDay = { date: string; revenue: string; expense: string; net: string };
type DailyReport = {
  date: string; season: string;
  summary: {
    total_revenue: string; total_expenses: string; net_result: string;
    encaissements: string; decaissements: string;
    current_receivables: string; current_payables: string;
    unallocated_legacy_receipts: string;
  };
  events: DailyEvent[];
  comparison: ComparisonDay[];
  supplier_payments_available: boolean;
};

const localToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const shiftDay = (day: string, offset: number) => {
  const value = new Date(`${day}T12:00:00`);
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
};
const amount = (value: unknown) => {
  const raw = String(value ?? "0").trim();
  const match = raw.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return "0";
  const sign = match[1] === "-" ? "-" : "";
  const whole = BigInt(match[2]).toString();
  const fraction = (match[3] || "").padEnd(3, "0").slice(0, 3);
  return fmtMoney(`${sign}${whole}.${fraction}`);
};

function SummaryCard({ title, value, caption, icon: Icon, tone }: {
  title: string; value: string; caption: string; icon: typeof Wallet; tone: string;
}) {
  return <Card className={tone}>
    <CardContent className="flex items-start justify-between gap-3 p-4">
      <div><p className="text-sm font-medium text-stone-600">{title}</p><p className="mt-2 text-2xl font-bold text-stone-900 tabular-nums">{amount(value)}</p><p className="mt-1 text-xs text-stone-500">{caption}</p></div>
      <Icon className="size-5 shrink-0 text-stone-500" />
    </CardContent>
  </Card>;
}

export default function SituationJournaliere() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [startDate, setStartDate] = useState(() => shiftDay(localToday(), -6));
  const [endDate, setEndDate] = useState(localToday);
  const validPeriod = !!startDate && !!endDate && startDate <= endDate;
  const report = useQuery({
    queryKey: ["accounting-daily-situation", startDate, endDate],
    queryFn: () => apiGet<DailyReport>(`/accounting/daily-situation?report_start_date=${encodeURIComponent(startDate)}&report_end_date=${encodeURIComponent(endDate)}`),
    staleTime: 15_000,
    enabled: validPeriod,
  });
  const data = report.data;
  const rows = data?.events ?? [];
  const revenues = rows.filter(row => row.kind === "revenue");
  const expenses = rows.filter(row => row.kind === "expense");
  const receipts = rows.filter(row => row.kind === "receipt" || row.kind === "receipt_adjustment");
  const disbursements = rows.filter(row => row.kind === "disbursement");

  return <div className="daily-report-print space-y-5">
    <style>{`@media print { body * { visibility: hidden !important; } .daily-report-print, .daily-report-print * { visibility: visible !important; } .daily-report-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; padding: 12px !important; background: white !important; } .no-print { display: none !important; } }`}</style>
    <div className="flex flex-wrap items-end justify-between gap-3 no-print">
      <div>
        <h2 className="text-xl font-bold text-stone-900">{ar ? "الوضعية اليومية" : "Situation journalière"}</h2>
        <p className="mt-1 text-sm text-stone-500">Rapport calculé automatiquement à partir des opérations enregistrées · saison {data?.season ?? "active"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
          <CalendarDays className="size-4 text-stone-500" />
          <span className="font-medium text-stone-700">Du</span>
          <input aria-label={ar ? "تاريخ البداية" : "Date de début"} type="date" value={startDate} max={endDate || undefined} onChange={event => setStartDate(event.target.value)} className="bg-transparent outline-none" />
        </label>
        <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
          <CalendarDays className="size-4 text-stone-500" />
          <span className="font-medium text-stone-700">Au</span>
          <input aria-label={ar ? "تاريخ النهاية" : "Date de fin"} type="date" value={endDate} min={startDate || undefined} onChange={event => setEndDate(event.target.value)} className="bg-transparent outline-none" />
        </label>
        <button onClick={() => void report.refetch()} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><RefreshCw className="size-4" /> Actualiser</button>
        <button onClick={() => window.print()} disabled={!data} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Printer className="size-4" /> Imprimer / PDF</button>
      </div>
    </div>

    {!validPeriod && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">La date « Du » doit être antérieure ou égale à la date « Au ».</p>}
    {report.isPending && <p className="rounded-lg border bg-white p-5 text-sm text-stone-600">{ar ? "جارٍ تحميل التقرير اليومي…" : "Chargement du rapport journalier…"}</p>}
    {report.isError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{ar ? "تعذّر تحميل الوضعية اليومية." : "Impossible de charger la situation journalière."} {report.error.message}</div>}

    {data && <>
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Oro Verde — {ar ? "الوضعية اليومية" : "Situation journalière"}</h1>
        <p className="text-sm text-stone-600">Période : {startDate} → {endDate} · Saison : {data.season}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard title="Total des revenus" value={data.summary.total_revenue} caption="Factures de prestation, ventes GS et revenus passifs" icon={TrendingUp} tone="border-emerald-200 bg-emerald-50/60" />
        <SummaryCard title="Total des dépenses" value={data.summary.total_expenses} caption="Achats fournisseurs et achats clients, plus dépenses enregistrées" icon={TrendingDown} tone="border-rose-200 bg-rose-50/60" />
        <SummaryCard title="Résultat net" value={data.summary.net_result} caption="Revenus moins dépenses" icon={Wallet} tone="border-sky-200 bg-sky-50/60" />
        <SummaryCard title="Encaissements" value={data.summary.encaissements} caption="Argent réellement reçu pendant la période" icon={Wallet} tone="border-violet-200 bg-violet-50/60" />
        <SummaryCard title="Décaissements" value={data.summary.decaissements} caption="Paiements réellement enregistrés pendant la période" icon={Wallet} tone="border-orange-200 bg-orange-50/60" />
        <SummaryCard title="Créances clients — solde actuel" value={data.summary.current_receivables} caption="Soldes encore à recevoir sur les factures" icon={TrendingUp} tone="border-amber-200 bg-amber-50/60" />
        <SummaryCard title="Dettes — solde actuel" value={data.summary.current_payables} caption="Soldes encore dus aux fournisseurs et aux clients" icon={TrendingDown} tone="border-fuchsia-200 bg-fuchsia-50/60" />
      </div>

      {Number(data.summary.unallocated_legacy_receipts) > 0 && <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>Des règlements historiques totalisant <strong>{amount(data.summary.unallocated_legacy_receipts)}</strong> ne possèdent pas de date de paiement exploitable. Ils ne sont pas attribués artificiellement à la période.</p>
      </div>}
      {!data.supplier_payments_available && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>Les règlements fournisseurs sont désormais intégrés. Chaque paiement enregistré dans GS apparaît comme un décaissement à sa date réelle.</p>
      </div>}

      <Card>
        <CardHeader><CardTitle>Opérations du {startDate} au {endDate}</CardTitle><CardDescription>Toutes les opérations enregistrées entre ces deux dates. Les factures constituent les revenus/dépenses comptables; les règlements sont affichés séparément dans la trésorerie.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {[
            {title:"Revenus", items:revenues, color:"text-emerald-700"},
            {title:"Dépenses", items:expenses, color:"text-rose-700"},
            {title:"Encaissements", items:receipts, color:"text-violet-700"},
            {title:"Décaissements", items:disbursements, color:"text-orange-700"},
          ].map(group => <section key={group.title}>
            <h3 className={`mb-2 font-semibold ${group.color}`}>{group.title}</h3>
            {group.items.length === 0 ? <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-500">{ar ? "لا توجد عمليات في هذا القسم." : "Aucune opération pour cette rubrique."}</p> :
              <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b text-left text-xs text-stone-500"><th className="px-2 py-2">{ar ? "المصدر" : "Origine"}</th><th className="px-2 py-2">{ar ? "التفاصيل" : "Détail"}</th><th className="px-2 py-2">{ar ? "المرجع" : "Référence"}</th><th className="px-2 py-2 text-right">{ar ? "المبلغ" : "Montant"}</th></tr></thead>
                <tbody>{group.items.map((item,index)=><tr key={`${item.kind}-${item.reference}-${index}`} className="border-b last:border-0"><td className="px-2 py-2">{item.category}</td><td className="px-2 py-2">{item.label}{item.detail ? <span className="block text-xs text-stone-500">{item.detail}</span> : null}</td><td className="px-2 py-2">{item.reference}</td><td className="px-2 py-2 text-right font-semibold tabular-nums">{amount(item.amount)}</td></tr>)}</tbody>
              </table></div>}
          </section>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{ar ? "المقارنة اليومية للفترة نفسها" : "Comparaison quotidienne de la même période"}</CardTitle><CardDescription>{ar ? "تفصيل يومي للفترة المحددة في أعلى التقرير." : "Ventilation jour par jour de la période sélectionnée en haut du rapport."}</CardDescription></CardHeader>
        <CardContent><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
          <thead><tr className="border-b text-left text-xs text-stone-500"><th className="px-3 py-2">{ar ? "التاريخ" : "Date"}</th><th className="px-3 py-2 text-right">{ar ? "المداخيل" : "Revenus"}</th><th className="px-3 py-2 text-right">{ar ? "المصاريف" : "Dépenses"}</th><th className="px-3 py-2 text-right">{ar ? "النتيجة الصافية" : "Résultat net"}</th></tr></thead>
          <tbody>{data.comparison.map(day=><tr key={day.date} className={`border-b last:border-0 ${day.date===endDate?"bg-emerald-50 font-semibold":""}`}><td className="px-3 py-2">{day.date}</td><td className="px-3 py-2 text-right tabular-nums">{amount(day.revenue)}</td><td className="px-3 py-2 text-right tabular-nums">{amount(day.expense)}</td><td className="px-3 py-2 text-right tabular-nums">{amount(day.net)}</td></tr>)}</tbody>
        </table></div>{data.comparison.length===0&&<p className="py-3 text-sm text-stone-500">Aucune journée dans cette période.</p>}</CardContent>
      </Card>
    </>}
  </div>;
}
