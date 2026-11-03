import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPut } from "@/lib/api";
import type { ClientUpdate } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

export default function EditClientDialog({
  client, onClose, onSaved,
}: { client: ClientUpdate | null; onClose: () => void; onSaved: (c: ClientUpdate) => void }) {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<ClientUpdate>>({});
  const name = edit.client_name ?? client?.client_name ?? "";
  const phone = edit.phone ?? client?.phone ?? "";

  const close = () => {
    setEdit({});
    onClose();
  };

  const m = useMutation({
    mutationFn: (b: ClientUpdate) => apiPut<ClientUpdate>(`/clients/${encodeURIComponent(client!.phone)}`, b),
    onSuccess: (c) => {
      toast.success(t("client_updated"));
      setEdit({});
      onSaved(c);
      // only refresh the client's new key; the old phone key no longer exists server-side
      qc.invalidateQueries({ queryKey: ["client", c.phone] });
      for (const k of ["clients", "loads", "stats"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const valid = name.trim().length >= 2 && phone.trim().length >= 4;

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid="edit-client-dialog">
        <DialogHeader>
          <DialogTitle>{t("edit_client")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) m.mutate({ client_name: name.trim(), phone: phone.trim() });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="ec-name">{t("client_name")}</Label>
            <Input id="ec-name" data-testid="edit-client-name-input" value={name} onChange={(e) => setEdit({ ...edit, client_name: e.target.value })} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-phone">{t("phone")}</Label>
            <Input id="ec-phone" dir="ltr" inputMode="tel" data-testid="edit-client-phone-input" value={phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className="h-11 rounded-xl text-start" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} data-testid="edit-client-cancel-btn">{t("cancel")}</Button>
            <Button type="submit" disabled={!valid || m.isPending} data-testid="edit-client-submit-btn" className="bg-teal-700 hover:bg-teal-800">{t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
