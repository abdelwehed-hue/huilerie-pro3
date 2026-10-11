import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, PlugZap, Send, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { SmsTestResult, TwilioConfigIn, TwilioConfigOut } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function TwilioSettings() {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["twilio"], queryFn: () => apiGet<TwilioConfigOut>("/sms/twilio") });
  const c = cfg.isError ? undefined : cfg.data;
  const [edit, setEdit] = useState<Partial<TwilioConfigIn>>({});
  const [testPhone, setTestPhone] = useState("");
  const sid = edit.account_sid ?? c?.account_sid ?? "";
  const from = edit.from_number ?? c?.from_number ?? "";
  const mss = edit.messaging_service_sid ?? c?.messaging_service_sid ?? "";
  const token = edit.auth_token ?? "";
  const live = c?.mode === "live";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["twilio"] });
    qc.invalidateQueries({ queryKey: ["sms-status"] });
  };

  const save = useMutation({
    mutationFn: (b: TwilioConfigIn) => apiPut<TwilioConfigOut>("/sms/twilio", b),
    onSuccess: () => {
      toast.success(t("twilio_saved"));
      setEdit({});
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: () => apiDelete<TwilioConfigOut>("/sms/twilio"),
    onSuccess: () => {
      toast.success(t("twilio_disconnected"));
      setEdit({});
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const test = useMutation({
    mutationFn: (phone: string) => apiPost<SmsTestResult>("/sms/test", { phone }),
    onSuccess: (r) => {
      if (r.status === "sent") toast.success(`${t("test_sent")} → ${r.to_number}`);
      else if (r.status === "failed") toast.error(`${t("test_failed")}: ${r.error ?? ""}`);
      else toast.info(`${t("test_simulated")} → ${r.to_number}`);
      qc.invalidateQueries({ queryKey: ["sms"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="max-w-4xl space-y-4 rounded-2xl border border-sky-200 bg-[#F0F9FF] p-6" data-testid="twilio-settings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-sky-600 text-white"><KeyRound className="size-5" /></div>
          <div>
            <h3 className="font-heading text-lg font-bold text-sky-950">{t("twilio_title")}</h3>
            <p className="text-xs text-sky-900/70">{t("twilio_hint")}</p>
          </div>
        </div>
        <span
          data-testid="twilio-mode-badge"
          className={cn("rounded-full px-3 py-1 text-xs font-semibold", live ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}
        >
          {live ? t("sms_live") : t("sms_status_simulated")}
        </span>
      </div>
      {c?.source === "env" && <p className="text-xs text-sky-900">{t("twilio_source_env")}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ account_sid: sid.trim(), auth_token: token.trim(), from_number: from.trim(), messaging_service_sid: mss.trim() });
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="space-y-2">
          <Label htmlFor="tw-sid">{t("account_sid")}</Label>
          <Input id="tw-sid" dir="ltr" autoComplete="off" data-testid="twilio-sid-input" value={sid} onChange={(e) => setEdit({ ...edit, account_sid: e.target.value })} placeholder="ACxxxxxxxxxxxxxxxx" className="h-10 rounded-xl bg-white font-mono text-start" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tw-token">{t("auth_token")}</Label>
          <Input id="tw-token" dir="ltr" type="password" autoComplete="new-password" data-testid="twilio-token-input" value={token} onChange={(e) => setEdit({ ...edit, auth_token: e.target.value })} placeholder={c?.has_token ? "••••••••" : ""} className="h-10 rounded-xl bg-white font-mono text-start" />
          {c?.has_token && <p className="text-xs text-stone-500">{t("auth_token_keep")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="tw-from">{t("from_number")}</Label>
          <Input id="tw-from" dir="ltr" data-testid="twilio-from-input" value={from} onChange={(e) => setEdit({ ...edit, from_number: e.target.value })} placeholder="+1xxxxxxxxxx" className="h-10 rounded-xl bg-white font-mono text-start" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tw-mss">{t("messaging_service_sid")}</Label>
          <Input id="tw-mss" dir="ltr" data-testid="twilio-mss-input" value={mss} onChange={(e) => setEdit({ ...edit, messaging_service_sid: e.target.value })} placeholder="MGxxxxxxxxxxxxxxxx" className="h-10 rounded-xl bg-white font-mono text-start" />
        </div>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <Button type="submit" disabled={save.isPending || !sid.trim()} data-testid="twilio-save-button" className="h-10 rounded-xl bg-sky-700 hover:bg-sky-800">
            <PlugZap className="size-4" /> {t("twilio_save")}
          </Button>
          {c?.source === "db" && (
            <Button type="button" variant="outline" onClick={() => del.mutate()} disabled={del.isPending} data-testid="twilio-disconnect-button" className="h-10 rounded-xl border-red-200 text-red-700 hover:bg-red-50">
              <Unplug className="size-4" /> {t("twilio_disconnect")}
            </Button>
          )}
        </div>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (testPhone.trim().length >= 4) test.mutate(testPhone.trim());
        }}
        className="flex flex-wrap items-end gap-3 border-t border-sky-200 pt-4"
      >
        <div className="space-y-2">
          <Label htmlFor="tw-test">{t("test_phone")}</Label>
          <Input id="tw-test" dir="ltr" inputMode="tel" data-testid="twilio-test-phone-input" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="98123456" className="h-10 w-48 rounded-xl bg-white text-start" />
        </div>
        <Button type="submit" variant="outline" disabled={test.isPending || testPhone.trim().length < 4} data-testid="twilio-test-button" className="h-10 rounded-xl border-sky-300 text-sky-800 hover:bg-sky-100">
          <Send className="size-4 rtl:-scale-x-100" /> {t("test_sms")}
        </Button>
      </form>
    </div>
  );
}
