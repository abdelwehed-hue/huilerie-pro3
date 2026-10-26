import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/api";

type Config = { account_id: string; api_key: string; sender: string; api_url: string; has_api_key: boolean };
type FormConfig = { account_id: string; api_key: string; sender: string; api_url: string };

export default function TunisieSmsSettings() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["tunisie-sms"], queryFn: () => apiGet<Config>("/sms/tunisie") });
  const [edit, setEdit] = useState<Partial<FormConfig>>({});
  const c = cfg.data;
  const val = (k: keyof FormConfig) => edit[k] ?? (k === "api_key" ? "" : (c?.[k] ?? ""));
  const save = useMutation({
    mutationFn: (body: FormConfig) => apiPut<Config>("/sms/tunisie", body),
    onSuccess: () => { toast.success("Paramètres TunisieSMS enregistrés"); setEdit({}); qc.invalidateQueries({ queryKey: ["tunisie-sms"] }); },
    onError: () => toast.error("Impossible d’enregistrer les paramètres TunisieSMS"),
  });
  const field = (key: keyof FormConfig, label: string, secret = false) => (
    <div className="space-y-2" key={key}>
      <Label htmlFor={`tunisie-${key}`}>{label}</Label>
      <Input id={`tunisie-${key}`} dir="ltr" type={secret ? "password" : "text"} autoComplete="off"
        value={val(key)} onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
        placeholder={key === "api_key" && c?.has_api_key ? "••••••••" : ""}
        className="h-10 rounded-xl bg-white font-mono text-start" />
      {key === "api_key" && c?.has_api_key && <p className="text-xs text-stone-500">Laissez vide pour conserver la clé enregistrée.</p>}
    </div>
  );
  return <section className="max-w-4xl space-y-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-6" data-testid="tunisie-sms-settings">
    <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-amber-600 text-white"><KeyRound className="size-5" /></div>
      <div><h3 className="font-heading text-lg font-bold text-amber-950">TunisieSMS</h3>
      <p className="text-xs text-amber-900/80">Configuration séparée. L’envoi actuel via Twilio n’est pas modifié.</p></div></div>
    <form onSubmit={(e) => { e.preventDefault(); save.mutate({ account_id: val("account_id").trim(), api_key: val("api_key").trim(), sender: val("sender").trim(), api_url: val("api_url").trim() }); }} className="grid gap-4 sm:grid-cols-2">
      {field("account_id", "Identifiant du compte")}
      {field("api_key", "Clé API", true)}
      {field("sender", "Nom / expéditeur SMS")}
      {field("api_url", "URL API (selon votre compte)")}
      <div className="sm:col-span-2"><Button type="submit" disabled={save.isPending} className="h-10 rounded-xl bg-amber-700 hover:bg-amber-800"><Save className="size-4" /> Enregistrer TunisieSMS</Button></div>
    </form>
    <p className="text-xs text-stone-600">Ces champs enregistrent les paramètres uniquement. TunisieSMS n’est pas activé pour l’envoi automatique tant que l’intégration API n’est pas configurée et testée.</p>
  </section>;
}
