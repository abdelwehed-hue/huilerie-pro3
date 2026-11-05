import { useEffect, useState } from "react";
import { gsApi } from "../services/api";

export function GSPurchasesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [form, setForm] = useState({
    supplier_id: "", purchase_date: new Date().toISOString().slice(0, 10),
    material_name: "Olives", quantity: "", unit_price: "", notes: "",
  });
  const [err, setErr] = useState("");
  const load = async () => {
    setRows(await gsApi.listPurchases());
    setSuppliers(await gsApi.listSuppliers());
  };
  useEffect(() => { load().catch((e) => setErr(String(e.message || e))); }, []);
  async function create() {
    setErr("");
    try {
      await gsApi.createPurchase({ ...form, unit: "kg", payment_status: "unpaid" });
      setForm((f) => ({ ...f, quantity: "", unit_price: "", notes: "" }));
      await load();
    } catch (e: any) { setErr(String(e.message || e)); }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Achats</h1>
      <p className="text-sm text-slate-600">Chaque achat crée un code matière permanent (ex. 2627A0008).</p>
      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="grid gap-2 rounded-xl border bg-white p-4 sm:grid-cols-2">
        <select className="rounded border px-3 py-2" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
          <option value="">Fournisseur…</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" className="rounded border px-3 py-2" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
        <input className="rounded border px-3 py-2" placeholder="Quantité kg" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        <input className="rounded border px-3 py-2" placeholder="Prix unitaire" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
        <button className="rounded bg-emerald-700 px-4 py-2 text-white sm:col-span-2" onClick={create}>Enregistrer l&apos;achat</button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className="p-3">Code</th><th className="p-3">Date</th><th className="p-3">Fournisseur</th><th className="p-3">Qté</th><th className="p-3">Total</th></tr></thead>
          <tbody>{rows.map((r) => (<tr key={r.id} className="border-t"><td className="p-3 font-mono font-semibold text-emerald-800">{r.material_code}</td><td className="p-3">{r.purchase_date}</td><td className="p-3">{r.supplier_name}</td><td className="p-3">{r.quantity} {r.unit}</td><td className="p-3">{r.total_amount}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
