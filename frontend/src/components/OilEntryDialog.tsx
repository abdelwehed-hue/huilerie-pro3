import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPatch } from "@/lib/api";
import type { Load } from "@/lib/types";
import { fmtNum, useI18n } from "@/lib/i18n";
import { CodeBadge } from "@/components/shared";

export default function OilEntryDialog({ load, onClose }: { load: Load | null; onClose: () => void }) {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const [oil, setOil] = useState("");
  const [forId, setForId] = useState<string | null>(null);
  if (load && forId !== load.id) {
    setForId(load.id);
    setOil(load.oil_kg != null ? String(load.oil_kg) : "");
  }

  const m = useMutation({
    mutationFn: (v: number) => apiPatch<Load>(`/loads/${load!.id}/oil`, { oil_kg: v }),
    onSuccess: () => {
      toast.success(t("saved"));
      qc.invalidateQueries({ queryKey: ["loads"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["load-by-code"] });
      qc.invalidateQueries({ queryKey: ["sms"] });
      qc.invalidateQueries({ queryKey: ["client"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const oilLocked = !!load && (load.ownership_transferred || load.available_olive_kg <= 0 || load.status === "done" || load.status === "delivered" || load.status === "cancelled");
  const val = parseFloat(oil.replace(",", "."));
  const preview = load && !isNaN(val) && load.olive_kg ? (val / load.olive_kg) * 100 : null;

  return (
    <Dialog open={!!load && !oilLocked} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="oil-entry-dialog">
        <DialogHeader>
          <DialogTitle>{load?.oil_kg != null ? t("edit_oil") : t("enter_oil")}</DialogTitle>
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
            if (!isNaN(val) && val >= 0) m.mutate(val);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="oil">{t("oil_kg")}</Label>
            <Input id="oil" data-testid="oil-entry-input" inputMode="decimal" value={oil} onChange={(e) => setOil(e.target.value)} autoFocus className="h-11 text-lg" />
          </div>
          <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900" data-testid="oil-entry-yield-preview">
            {t("yield")}: <b dir="ltr">{preview != null ? `${fmtNum(preview, 2)} %` : "—"}</b>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="oil-entry-cancel-btn">{t("cancel")}</Button>
            <Button type="submit" disabled={m.isPending || isNaN(val)} data-testid="oil-entry-submit-btn" className="bg-amber-600 hover:bg-amber-700">
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
