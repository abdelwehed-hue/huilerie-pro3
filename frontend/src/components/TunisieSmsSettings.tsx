import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Config = { account_id: string; api_key: string; sender: string; api_url: string; has_api_key: boolean };
type FormConfig = { account_id: string; api_key: string; sender: string; api_url: string };

export default function TunisieSmsSettings() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["tunisie-sms"], queryFn: () => apiGet<Config>("/sms/tunisie") });
  const [edit, setEdit] = useState<Partial<FormConfig>>({});
  const [testPhone, setTestPhone] = useState("");
  const c = cfg.data;
  const val = (k: keyof FormConfig) => edit[k] ?? (k === "api_key" ? "" : (c?.[k] ?? ""));
  const save = useMutation({
    mutationFn: (body: FormConfig) => apiPut<Config>("/sms/tunisie", body),
    onSuccess: () => { toast.success((ar ? "تم حفظ إعدادات TunisieSMS" : "Paramètres TunisieSMS enregistrés")); setEdit({}); qc.invalidateQueries({ queryKey: ["tunisie-sms"] }); },
    onError: () => toast.error((ar ? "تعذّر حفظ إعدادات TunisieSMS" : "Impossible d’enregistrer les paramètres TunisieSMS")),
  });
  const testSms = useMutation({
    mutationFn: () => apiPost<{ message: string }>("/sms/tunisie/test", { phone: testPhone.trim() }),
    onSuccess: () => toast.success((ar ? "تم إرسال طلب SMS تجريبي إلى TunisieSMS" : "Demande de SMS de test envoyée à TunisieSMS")),
    onError: () => toast.error((ar ? "فشل إرسال SMS التجريبي. تحقق من الإعدادات وواجهة TunisieSMS." : "Échec de l’envoi du SMS de test. Vérifiez les paramètres et l’API TunisieSMS.")),
  });
  const field = (key: keyof FormConfig, label: string, secret = false) => (
    <div className="space-y-2" key={key}>
      <Label htmlFor={`tunisie-${key}`}>{label}</Label>
      <Input id={`tunisie-${key}`} dir="ltr" type={secret ? "password" : "text"} autoComplete="off"
        value={val(key)} onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
        placeholder={key === "api_key" && c?.has_api_key ? "••••••••" : ""}
        className="h-10 rounded-xl bg-white font-mono text-start" />
      {key === "api_key" && c?.has_api_key && <p className="text-xs text-stone-500">{ar ? "اترك الحقل فارغاً للاحتفاظ بالمفتاح المحفوظ." : "Laissez vide pour conserver la clé enregistrée."}</p>}
    </div>
  );
  return <section className="max-w-4xl space-y-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-6" data-testid="tunisie-sms-settings">
    <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-amber-600 text-white"><KeyRound className="size-5" /></div>
      <div><h3 className="font-heading text-lg font-bold text-amber-950">TunisieSMS</h3>
      <p className="text-xs text-amber-900/80">{ar ? "إعداد مستقل. لن يتغير الإرسال الحالي عبر Twilio." : "Configuration séparée. L’envoi actuel via Twilio n’est pas modifié."}</p></div></div>
    <form onSubmit={(e) => { e.preventDefault(); save.mutate({ account_id: val("account_id").trim(), api_key: val("api_key").trim(), sender: val("sender").trim(), api_url: val("api_url").trim() }); }} className="grid gap-4 sm:grid-cols-2">
      {field("account_id", ar ? "معرّف الحساب" : "Identifiant du compte")}
      {field("api_key", ar ? "مفتاح API" : "Clé API", true)}
      {field("sender", ar ? "الاسم / مرسل SMS" : "Nom / expéditeur SMS")}
      {field("api_url", ar ? "رابط API (حسب حسابك)" : "URL API (selon votre compte)")}
      <div className="sm:col-span-2"><Button type="submit" disabled={save.isPending} className="h-10 rounded-xl bg-amber-700 hover:bg-amber-800"><Save className="size-4" /> {ar ? "حفظ إعدادات TunisieSMS" : "Enregistrer TunisieSMS"}</Button></div>
    </form>
    <div className="grid max-w-2xl gap-3 border-t border-amber-200 pt-4 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end">
      <div className="space-y-2"><Label htmlFor="tunisie-test-phone">{ar ? "رقم تجريبي" : "Numéro de test"}</Label><Input id="tunisie-test-phone" dir="ltr" type="tel" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+216..." className="h-10 rounded-xl bg-white font-mono text-start" /></div>
      <Button type="button" disabled={!testPhone.trim() || testSms.isPending || save.isPending} onClick={() => {
        if (edit.account_id !== undefined || edit.api_key !== undefined || edit.sender !== undefined || edit.api_url !== undefined) {
          toast.error((ar ? "احفظ إعدادات TunisieSMS أولاً." : "Enregistrez d’abord les paramètres TunisieSMS.")); return;
        }
        testSms.mutate();
      }} className="h-10 rounded-xl bg-amber-700 hover:bg-amber-800"><Send className="size-4" /> {testSms.isPending ? (ar ? "جارٍ الإرسال..." : "Envoi...") : (ar ? "إرسال SMS تجريبي" : "Envoyer un SMS de test")}</Button>
    </div>
    <p className="text-xs text-stone-600">{ar ? "يبقى Twilio دون تغيير. تستخدم الرسالة التجريبية إعدادات TunisieSMS المحفوظة." : "Twilio reste inchangé. Le SMS de test utilise les paramètres TunisieSMS enregistrés."}</p>
  </section>;
}
