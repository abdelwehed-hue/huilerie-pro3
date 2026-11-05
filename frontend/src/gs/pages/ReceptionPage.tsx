import { useEffect, useState } from "react";
import { gsApi } from "../services/api";

export function GSReceptionPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [form, setForm] = useState({
    material_code: "", reception_date: new Date().toISOString().slice(0, 10),
    quantity: "", location: "", notes: "",
  });
  const [err, setErr] = useState("");
  const load = async () => {
    setRows(await gsApi.listReceptions());
    setMaterials(await gsApi.listMaterials());
  };
  useEffect(() => { load().catch((e) => setErr(String(e.message || e))); }, []);
  async function create() {
    setErr("");
    try {
      await gsApi.createReception({ ...form, unit: "kg" });
      setForm((f) => ({ ...f, quantity: "", notes: "" }));
      await load();
    } catch (e: any) { setErr(String(e.message || e)); }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Réception</h1>
      <p className="text-sm text-slate-600">Utilise le code matière existant — aucun nouveau code.</p>
      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="grid gap-2 rounded-xl border bg-white p-4 sm:grid-cols-2">
        <select className="rounded border px-3 py-2" value={form.material_code} onChange={(e) => setForm({ ...form, material_code: e.target.value })}>
          <option value="">Code matière…</option>
          {materials.map((m) => <option key={m.id} value={m.material_code}>{m.material_code} — {m.material_name}</option>)}
        </select>
        <input type="date" className="rounded border px-3 py-2" value={form.reception_date} onChange={(e) => setForm({ ...form, reception_date: e.target.value })} />
        <input className="rounded border px-3 py-2" placeholder="Quantité kg" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        <input className="rounded border px-3 py-2" placeholder="Emplacement" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <button className="rounded bg-emerald-700 px-4 py-2 text-white sm:col-span-2" onClick={create}>Enregistrer la réception</button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className="p-3">Code</th><th className="p-3">Date</th><th className="p-3">Qté</th><th className="p-3">Lieu</th></tr></thead>
          <tbody>{rows.map((r) => (<tr key={r.id} className="border-t"><td className="p-3 font-mono font-semibold text-emerald-800">{r.material_code}</td><td className="p-3">{r.reception_date}</td><td className="p-3">{r.quantity} {r.unit}</td><td className="p-3">{r.location || "—"}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
