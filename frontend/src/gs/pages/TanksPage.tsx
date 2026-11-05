import { useEffect, useState } from "react";
import { gsApi } from "../services/api";

export function GSTanksPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [err, setErr] = useState("");
  const load = () => gsApi.listTanks().then(setRows).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  async function create() {
    setErr("");
    try {
      await gsApi.createTank({ code, name, capacity });
      setCode(""); setName(""); setCapacity("");
      await load();
    } catch (e: any) { setErr(String(e.message || e)); }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Citernes</h1>
      <p className="text-sm text-slate-600">Nombre configurable. Mélange multi-sources autorisé (FIFO).</p>
      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-4">
        <input className="rounded border px-3 py-2" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="rounded border px-3 py-2" placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded border px-3 py-2" placeholder="Capacité" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        <button className="rounded bg-emerald-700 px-4 py-2 text-white" onClick={create}>Créer</button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className="p-3">Code</th><th className="p-3">Nom</th><th className="p-3">Capacité</th><th className="p-3">Stock</th><th className="p-3">Actif</th></tr></thead>
          <tbody>{rows.map((r) => (<tr key={r.id} className="border-t"><td className="p-3 font-mono">{r.code}</td><td className="p-3">{r.name}</td><td className="p-3">{r.capacity}</td><td className="p-3">{r.quantity}</td><td className="p-3">{r.active ? "oui" : "non"}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
