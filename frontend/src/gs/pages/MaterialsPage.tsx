import { useEffect, useState } from "react";
import { gsApi } from "../services/api";

export function GSMaterialsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<any | null>(null);
  const [err, setErr] = useState("");
  const load = () => gsApi.listMaterials(q).then(setRows).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  async function showHistory(code: string) {
    try { setHistory(await gsApi.materialHistory(code)); }
    catch (e: any) { setErr(String(e.message || e)); }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Matériaux & traçabilité</h1>
      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="flex gap-2">
        <input className="rounded border px-3 py-2" placeholder="Code ou nom…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="rounded bg-slate-800 px-4 py-2 text-white" onClick={load}>Rechercher</button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className="p-3">Code</th><th className="p-3">Nom</th><th className="p-3">Saison</th><th className="p-3">Statut</th><th className="p-3"></th></tr></thead>
          <tbody>{rows.map((r) => (<tr key={r.id} className="border-t"><td className="p-3 font-mono font-semibold">{r.material_code}</td><td className="p-3">{r.material_name}</td><td className="p-3">{r.season}</td><td className="p-3">{r.status}</td><td className="p-3"><button className="text-emerald-700 underline" onClick={() => showHistory(r.material_code)}>Historique</button></td></tr>))}</tbody>
        </table>
      </div>
      {history && (
        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-bold">Historique {history.material?.material_code}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {(history.events || []).map((e: any) => (
              <li key={e.id} className="border-b py-1"><span className="font-medium">{e.event_type}</span> — qté {e.quantity} — {e.source} → {e.destination}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
