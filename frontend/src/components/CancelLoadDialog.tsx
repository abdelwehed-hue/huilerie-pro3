import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/api";
import type { Load } from "@/lib/types";
import { fmtNum, useI18n } from "@/lib/i18n";
import { CodeBadge } from "@/components/shared";

export default function CancelLoadDialog({ load, onClose }: { load: Load | null; onClose: () => void }) {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const close = () => {
    setReason("");
    onClose();
  };

  const m = useMutation({
    mutationFn: (r: string) => apiPost<Load>(`/loads/${load!.id}/cancel`, { reason: r }),
    onSuccess: () => {
      toast.success(t("load_cancelled_toast"));
      for (const k of ["loads", "stats", "load-by-code", "client", "clients", "report", "report-workers"]) {
        qc.invalidateQueries({ queryKey: [k] });
      }
      close();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const valid = reason.trim().length >= 3;

  return (
    <Dialog open={!!load} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid="cancel-load-dialog">
        <DialogHeader>
          <DialogTitle>{t("cancel_load_title")}</DialogTitle>
          <DialogDescription>
            {load && (
              <span className="flex flex-wrap items-center gap-2">
                <CodeBadge code={load.code} /> {load.client_name} · {fmtNum(load.olive_kg)} {t("kg")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) m.mutate(reason.trim());
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="cr">{t("cancel_reason")}</Label>
            <Textarea id="cr" data-testid="cancel-reason-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("cancel_reason_ph")} autoFocus />
          </div>
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{t("cancel_hint")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} data-testid="cancel-load-close-btn">{t("cancel")}</Button>
            <Button type="submit" disabled={!valid || m.isPending} data-testid="cancel-load-submit-btn" className="bg-red-600 hover:bg-red-700">
              {t("cancel_confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
