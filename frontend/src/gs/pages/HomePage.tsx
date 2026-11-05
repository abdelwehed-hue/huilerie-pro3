import { useEffect, useState } from "react";
import { gsApi } from "../services/api";

export function GSHomePage() {
  const [status, setStatus] = useState("…");
  const [health, setHealth] = useState("…");
  useEffect(() => {
    gsApi.status()
      .then((s) => setStatus(`${s.module} (${s.version})`))
      .catch((e) => setStatus(String(e.message || e)));
    gsApi.health()
      .then((h) => setHealth(h.ok ? `DB OK · tx=${String(h.transactions)}` : "DB KO"))
      .catch((e) => setHealth(String(e.message || e)));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Accueil GS</h1>
      <p className="text-slate-600">
        Module commercial isolé — base <code>oroverde_gs</code>. Codes matière permanents (ex. 2627A0008).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Statut</div>
          <div className="mt-1 font-medium">{status}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Santé base GS</div>
          <div className="mt-1 font-medium">{health}</div>
        </div>
      </div>
    </div>
  );
}
