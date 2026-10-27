import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet } from "@/lib/api";
import type { Load, MillInfo } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { CodeBadge } from "@/components/shared";

type BothFn = ReturnType<typeof useI18n>["both"];

function BiLabel({ k, both, className }: { k: Parameters<BothFn>[0]; both: BothFn; className?: string }) {
  const v = both(k);
  return (
    <div className={className}>
      <span dir="ltr" className="block">{v.fr}</span>
      <span dir="rtl" className="block">{v.ar}</span>
    </div>
  );
}

/** Printable reception receipt — same layout for first print and reprints. */
export default function ReceptionTicket({ load, children, testId = "intake-ticket", printable = true }: { load: Load; children?: React.ReactNode; testId?: string; printable?: boolean }) {
  const { t, both } = useI18n();
  const mill = useQuery({ queryKey: ["mill"], queryFn: () => apiGet<MillInfo>("/mill") });
  const m = mill.isError ? undefined : mill.data;
  return (
    <div className={(printable ? "print-area " : "no-print ") + "receipt-ticket code-reveal bg-white p-3 text-sm"} data-testid={testId}>
      <div className="flex items-start justify-between gap-2 border-b border-stone-200 pb-2">
        <div>
          <div className="font-heading text-base font-bold text-stone-900" data-testid="ticket-mill">{m?.mill_name || t("app_name")}</div>
          {m?.mill_address && <div className="text-xs text-stone-500">{m.mill_address}</div>}
          {m?.mill_phone && <div className="text-xs text-stone-500" dir="ltr">{m.mill_phone}</div>}
        </div>
        <div className="text-end">
          <BiLabel k="ticket" both={both} className="text-xs font-semibold uppercase tracking-wider text-amber-700" />
          <div className="mt-1 text-xs text-stone-500" dir="ltr" data-testid="ticket-date">{fmtDate(load.created_at)}</div>
        </div>
      </div>
      <div className="my-3 flex flex-col items-center justify-center gap-2 border-b border-stone-200 pb-3 text-center">
        <BiLabel k="code" both={both} className="text-xs text-stone-500" />
        <CodeBadge code={load.code} testId="intake-generated-code" big />
        <BiLabel k="code_hint" both={both} className="text-xs text-stone-500" />
        <div data-testid="intake-ticket-qr" className="flex flex-col items-center gap-1">
          <QRCodeSVG value={`${window.location.origin}/search?code=${encodeURIComponent(load.code)}`} size={100} level="M" marginSize={1} />
          <BiLabel k="scan_to_open" both={both} className="text-[10px] text-stone-500" />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 text-xs">
        <div><dt><BiLabel k="client" both={both} className="text-stone-500" /></dt><dd className="font-semibold text-stone-900" data-testid="ticket-name">{load.client_name}</dd></div>
        <div><dt><BiLabel k="phone" both={both} className="text-stone-500" /></dt><dd className="font-semibold text-stone-900" dir="ltr" data-testid="ticket-phone">{load.phone}</dd></div>
        <div><dt><BiLabel k="olive_kg" both={both} className="text-stone-500" /></dt><dd className="font-heading text-lg font-bold text-lime-800" data-testid="ticket-kg">{fmtNum(load.olive_kg)} kg</dd></div>
        <div><dt><BiLabel k="variety" both={both} className="text-stone-500" /></dt><dd className="font-semibold text-stone-900" data-testid="ticket-variety">{load.variety || "—"}</dd></div>
        {load.bags != null && (
          <div><dt><BiLabel k="bags" both={both} className="text-stone-500" /></dt><dd className="font-semibold text-stone-900" data-testid="ticket-bags">{load.bags}</dd></div>
        )}
        <div><dt><BiLabel k="employee" both={both} className="text-stone-500" /></dt><dd className="font-semibold text-stone-900" data-testid="ticket-employee">{load.created_by_name || load.created_by}</dd></div>
        {load.notes && (
          <div className="col-span-2"><dt><BiLabel k="observations" both={both} className="text-stone-500" /></dt><dd className="whitespace-pre-wrap text-stone-800" data-testid="ticket-notes">{load.notes}</dd></div>
        )}
      </dl>
      {children}
    </div>
  );
}

export function ReprintDialog({ load, onClose }: { load: Load | null; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog open={!!load} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-2xl" data-testid="reprint-dialog">
        <DialogHeader className="no-print"><DialogTitle>{t("reprint")}</DialogTitle></DialogHeader>
        {load && (
          <ReceptionTicket load={load} testId="reprint-ticket" printable={false}>
            <div className="no-print mt-6 flex justify-end">
              <Button onClick={() => window.print()} className="rounded-xl bg-amber-600 hover:bg-amber-700" data-testid="reprint-print-button">
                <Printer className="size-4" /> {t("print")}
              </Button>
            </div>
          </ReceptionTicket>
        )}
      </DialogContent>
      {load && createPortal(<div className="print-sheet"><ReceptionTicket load={load} testId="reprint-print-sheet" /></div>, document.body)}
    </Dialog>
  );
}
