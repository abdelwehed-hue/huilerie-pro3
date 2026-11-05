import { useEffect, useState } from "react";
import { gsApi } from "../services/api";

export function GSCustomersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const load = () => gsApi.listCustomers().then(setRows).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  async function create() {
    setErr("");
    try {
      await gsApi.createCustomer({ name, phone });
      setName(""); setPhone("");
      await load();
    } catch (e: any) { setErr(String(e.message || e)); }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Clients</h1>
      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-4">
        <input className="rounded border px-3 py-2" placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded border px-3 py-2" placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button className="rounded bg-emerald-700 px-4 py-2 text-white" onClick={create}>Ajouter</button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className="p-3">Nom</th><th className="p-3">Téléphone</th></tr></thead>
          <tbody>{rows.map((r) => (<tr key={r.id} className="border-t"><td className="p-3">{r.name}</td><td className="p-3">{r.phone || "—"}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
