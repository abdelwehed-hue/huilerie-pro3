import { useEffect, useState } from "react";
import { gsApi } from "../services/api";

export function GSInvoicesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const load = () => gsApi.listInvoices().then(setRows).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Factures</h1>
      <p className="text-sm text-slate-600">
        Numérotation indépendante (ex. 2627F0001). Impression / PDF via le navigateur.
      </p>
      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">N° facture</th>
              <th className="p-3">Date</th>
              <th className="p-3">Client</th>
              <th className="p-3">Total</th>
              <th className="p-3">Solde</th>
              <th className="p-3">Statut</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 font-mono font-semibold text-emerald-800">{r.invoice_number}</td>
                <td className="p-3">{r.invoice_date}</td>
                <td className="p-3">{r.customer_name}</td>
                <td className="p-3">{r.total_amount}</td>
                <td className="p-3">{r.balance}</td>
                <td className="p-3">{r.status} / {r.payment_status}</td>
                <td className="p-3">
                  <a className="text-emerald-700 underline" href={gsApi.invoicePdfUrl(r.id)} target="_blank" rel="noreferrer">PDF</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
