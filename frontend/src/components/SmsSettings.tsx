import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw, Radio, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPut } from "@/lib/api";
import { DEFAULT_SMS_ARRIVAL, DEFAULT_SMS_READY } from "@/lib/types";
import type { AppSettings, SmsStatus } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

const VARS = ["mill", "name", "code", "olive_kg", "oil_kg"] as const;
const SAMPLE: Record<string, string> = { mill: "", name: "Mohamed Trabelsi", code: "2503141035", olive_kg: "1200", oil_kg: "216" };

function renderPreview(tpl: string, mill: string) {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k === "mill" ? mill || "Huilerie Pro" : (SAMPLE[k] ?? m)));
}

type TplKey = "sms_arrival_template" | "sms_ready_template";

function TemplateField({
  k, label, value, onChange, mill, defaultValue,
}: { k: TplKey; label: string; value: string; onChange: (v: string) => void; mill: string; defaultValue: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (v: string) => {
    const el = ref.current;
    const token = `{${v}}`;
    if (!el) return onChange(value + token);
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    onChange(value.slice(0, s) + token + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  };
  return (
    <div className="space-y-3 rounded-2xl border border-pink-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={k} className="text-base font-semibold">{label}</Label>
        <Button type="button" size="xs" variant="ghost" onClick={() => onChange(defaultValue)} data-testid={`${k}-reset`}>
          <RotateCcw className="size-3.5" /> {t("reset_default")}
        </Button>
      </div>
      <Textarea id={k} ref={ref} data-testid={`${k}-input`} value={value} onChange={(e) => onChange(e.target.value)} rows={4} className="rounded-xl" />
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-stone-500">{t("placeholders")}:</span>
        {VARS.map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`${k}-var-${v}`}
            onClick={() => insert(v)}
            className="rounded-md border border-pink-200 bg-pink-50 px-2 py-0.5 font-mono text-pink-800 transition-colors duration-150 hover:bg-pink-100"
            dir="ltr"
          >
            {`{${v}}`}
          </button>
        ))}
        <span className="ms-auto text-stone-400">{value.length} {t("chars")}</span>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">{t("preview")}</div>
        <div data-testid={`${k}-preview`} className="whitespace-pre-line rounded-xl bg-stone-50 p-3 text-sm text-stone-800">{renderPreview(value, mill)}</div>
      </div>
    </div>
  );
}

export default function SmsSettings() {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const status = useQuery({ queryKey: ["sms-status"], queryFn: () => apiGet<SmsStatus>("/sms/status") });
  const [edit, setEdit] = useState<Partial<Pick<AppSettings, TplKey | "sms_enabled">>>({});
  const data = s.isError ? undefined : s.data;
  const arrival = edit.sms_arrival_template ?? data?.sms_arrival_template ?? "";
  const ready = edit.sms_ready_template ?? data?.sms_ready_template ?? "";
  const enabled = edit.sms_enabled ?? data?.sms_enabled ?? true;
  const live = !status.isError && status.data?.mode === "live";

  const m = useMutation({
    mutationFn: (b: AppSettings) => apiPut<AppSettings>("/settings", b),
    onSuccess: () => {
      toast.success(t("saved"));
      setEdit({});
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["sms-status"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (data) m.mutate({ ...data, sms_enabled: enabled, sms_arrival_template: arrival, sms_ready_template: ready });
      }}
      className="max-w-4xl space-y-5"
      data-testid="sms-settings-form"
    >
      <div className={live ? "flex items-center gap-3 rounded-2xl border border-green-300 bg-green-50 p-4 text-green-900" : "flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900"} data-testid="sms-mode-banner">
        {live ? <Radio className="size-5" /> : <TriangleAlert className="size-5" />}
        {live ? t("sms_live") : t("sms_simulated")}
      </div>
      <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <Checkbox checked={enabled} onCheckedChange={(c) => setEdit({ ...edit, sms_enabled: !!c })} data-testid="sms-enabled-checkbox" />
        <span className="font-medium">{t("sms_enabled")}</span>
      </label>
      <div className="grid gap-5 lg:grid-cols-2">
        <TemplateField k="sms_arrival_template" label={t("sms_arrival_tpl")} value={arrival} onChange={(v) => setEdit({ ...edit, sms_arrival_template: v })} mill={data?.mill_name ?? ""} defaultValue={DEFAULT_SMS_ARRIVAL} />
        <TemplateField k="sms_ready_template" label={t("sms_ready_tpl")} value={ready} onChange={(v) => setEdit({ ...edit, sms_ready_template: v })} mill={data?.mill_name ?? ""} defaultValue={DEFAULT_SMS_READY} />
      </div>
      <Button type="submit" disabled={!data || m.isPending || !arrival.trim() || !ready.trim()} data-testid="sms-settings-save" className="h-11 rounded-xl bg-pink-600 px-8 hover:bg-pink-700">
        {t("save")}
      </Button>
    </form>
  );
}
