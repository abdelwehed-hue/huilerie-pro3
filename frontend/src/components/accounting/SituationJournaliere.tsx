import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { fmtMoney } from "@/lib/i18n";
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
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
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
  const [reportDate, setReportDate] = useState(localToday);
  const report = useQuery({
    queryKey: ["accounting-daily-situation", reportDate],
    queryFn: () => apiGet<DailyReport>(`/accounting/daily-situation?report_date=${encodeURIComponent(reportDate)}`),
    staleTime: 15_000,
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
        <h2 className="text-xl font-bold text-stone-900">Situation journalière</h2>
        <p className="mt-1 text-sm text-stone-500">Rapport calculé automatiquement à partir des opérations enregistrées · saison {data?.season ?? "active"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
          <CalendarDays className="size-4 text-stone-500" />
          <span className="sr-only">Date du rapport</span>
          <input type="date" value={reportDate} onChange={event => setReportDate(event.target.value)} className="bg-transparent outline-none" />
        </label>
        <button onClick={() => void report.refetch()} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><RefreshCw className="size-4" /> Actualiser</button>
        <button onClick={() => window.print()} disabled={!data} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Printer className="size-4" /> Imprimer / PDF</button>
      </div>
    </div>

    {report.isPending && <p className="rounded-lg border bg-white p-5 text-sm text-stone-600">Chargement du rapport journalier…</p>}
    {report.isError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Impossible de charger la situation journalière. {report.error.message}</div>}

    {data && <>
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Oro Verde — Situation journalière</h1>
        <p className="text-sm text-stone-600">Date : {data.date} · Saison : {data.season}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard title="Total des revenus" value={data.summary.total_revenue} caption="Factures de prestation, ventes GS et revenus passifs" icon={TrendingUp} tone="border-emerald-200 bg-emerald-50/60" />
        <SummaryCard title="Total des dépenses" value={data.summary.total_expenses} caption="Achats approuvés et dépenses enregistrées" icon={TrendingDown} tone="border-rose-200 bg-rose-50/60" />
        <SummaryCard title="Résultat net" value={data.summary.net_result} caption="Revenus moins dépenses" icon={Wallet} tone="border-sky-200 bg-sky-50/60" />
        <SummaryCard title="Encaissements" value={data.summary.encaissements} caption="Argent réellement reçu ce jour" icon={Wallet} tone="border-violet-200 bg-violet-50/60" />
        <SummaryCard title="Décaissements" value={data.summary.decaissements} caption="Paiements réellement enregistrés ce jour" icon={Wallet} tone="border-orange-200 bg-orange-50/60" />
        <SummaryCard title="Créances clients — solde actuel" value={data.summary.current_receivables} caption="Soldes encore à recevoir sur les factures" icon={TrendingUp} tone="border-amber-200 bg-amber-50/60" />
        <SummaryCard title="Dettes — solde actuel" value={data.summary.current_payables} caption="Achats clients impayés et achats fournisseurs" icon={TrendingDown} tone="border-fuchsia-200 bg-fuchsia-50/60" />
      </div>

      {Number(data.summary.unallocated_legacy_receipts) > 0 && <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>Des règlements historiques totalisant <strong>{amount(data.summary.unallocated_legacy_receipts)}</strong> ne possèdent pas de date de paiement exploitable. Ils ne sont donc pas attribués artificiellement à ce jour.</p>
      </div>}
      {!data.supplier_payments_available && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>Le registre des règlements aux fournisseurs n’existe pas encore dans l’application. Les achats fournisseurs augmentent les dettes, mais aucun décaissement fournisseur n’est inventé.</p>
      </div>}

      <Card>
        <CardHeader><CardTitle>Opérations du {data.date}</CardTitle><CardDescription>Les factures constituent les revenus/dépenses comptables; les règlements sont affichés séparément dans la trésorerie.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {[
            {title:"Revenus", items:revenues, color:"text-emerald-700"},
            {title:"Dépenses", items:expenses, color:"text-rose-700"},
            {title:"Encaissements", items:receipts, color:"text-violet-700"},
            {title:"Décaissements", items:disbursements, color:"text-orange-700"},
          ].map(group => <section key={group.title}>
            <h3 className={`mb-2 font-semibold ${group.color}`}>{group.title}</h3>
            {group.items.length === 0 ? <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-500">Aucune opération pour cette rubrique.</p> :
              <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b text-left text-xs text-stone-500"><th className="px-2 py-2">Origine</th><th className="px-2 py-2">Détail</th><th className="px-2 py-2">Référence</th><th className="px-2 py-2 text-right">Montant</th></tr></thead>
                <tbody>{group.items.map((item,index)=><tr key={`${item.kind}-${item.reference}-${index}`} className="border-b last:border-0"><td className="px-2 py-2">{item.category}</td><td className="px-2 py-2">{item.label}{item.detail ? <span className="block text-xs text-stone-500">{item.detail}</span> : null}</td><td className="px-2 py-2">{item.reference}</td><td className="px-2 py-2 text-right font-semibold tabular-nums">{amount(item.amount)}</td></tr>)}</tbody>
              </table></div>}
          </section>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Comparaison des 7 jours</CardTitle><CardDescription>Évolution quotidienne des revenus, dépenses et résultat net jusqu’à la date sélectionnée.</CardDescription></CardHeader>
        <CardContent><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
          <thead><tr className="border-b text-left text-xs text-stone-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Revenus</th><th className="px-3 py-2 text-right">Dépenses</th><th className="px-3 py-2 text-right">Résultat net</th></tr></thead>
          <tbody>{data.comparison.map(day=><tr key={day.date} className={`border-b last:border-0 ${day.date===data.date?"bg-emerald-50 font-semibold":""}`}><td className="px-3 py-2">{day.date}</td><td className="px-3 py-2 text-right tabular-nums">{amount(day.revenue)}</td><td className="px-3 py-2 text-right tabular-nums">{amount(day.expense)}</td><td className="px-3 py-2 text-right tabular-nums">{amount(day.net)}</td></tr>)}</tbody>
          </table></div></CardContent>
      </Card>
    </>}
  </div>;
}
