import { useEffect, useState } from "react";
import { gsApi } from "../services/api";

export function GSSalesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tanks, setTanks] = useState<any[]>([]);
  const [form, setForm] = useState({
    customer_id: "", tank_id: "", quantity: "", unit_price: "",
    sale_date: new Date().toISOString().slice(0, 10), notes: "",
  });
  const [err, setErr] = useState("");
  const load = async () => {
    setRows(await gsApi.listSales());
    setCustomers(await gsApi.listCustomers());
    setTanks(await gsApi.listTanks());
  };
  useEffect(() => { load().catch((e) => setErr(String(e.message || e))); }, []);
  async function create() {
    setErr("");
    try {
      await gsApi.createSale({ ...form, create_invoice: true });
      setForm((f) => ({ ...f, quantity: "", unit_price: "", notes: "" }));
      await load();
    } catch (e: any) { setErr(String(e.message || e)); }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ventes</h1>
      <p className="text-sm text-slate-600">Sélection citerne, contrôle stock, FIFO, facture optionnelle.</p>
      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="grid gap-2 rounded-xl border bg-white p-4 sm:grid-cols-2">
        <select className="rounded border px-3 py-2" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
          <option value="">Client…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="rounded border px-3 py-2" value={form.tank_id} onChange={(e) => setForm({ ...form, tank_id: e.target.value })}>
          <option value="">Citerne…</option>
          {tanks.map((t) => <option key={t.id} value={t.id}>{t.code} (stock {t.quantity})</option>)}
        </select>
        <input className="rounded border px-3 py-2" placeholder="Quantité kg" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        <input className="rounded border px-3 py-2" placeholder="Prix unitaire" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
        <input type="date" className="rounded border px-3 py-2" value={form.sale_date} onChange={(e) => setForm({ ...form, sale_date: e.target.value })} />
        <button className="rounded bg-emerald-700 px-4 py-2 text-white" onClick={create}>Enregistrer la vente + facture</button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className="p-3">N°</th><th className="p-3">Client</th><th className="p-3">Citerne</th><th className="p-3">Qté</th><th className="p-3">Total</th><th className="p-3">Facture</th></tr></thead>
          <tbody>{rows.map((r) => (<tr key={r.id} className="border-t"><td className="p-3 font-mono">{r.sale_number}</td><td className="p-3">{r.customer_name}</td><td className="p-3">{r.tank_code}</td><td className="p-3">{r.quantity}</td><td className="p-3">{r.total_amount}</td><td className="p-3 font-mono text-emerald-800">{r.invoice_number || "—"}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
