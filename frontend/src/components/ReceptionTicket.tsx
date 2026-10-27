import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet } from "@/lib/api";
import type { LabAnalysis, Load, MillInfo } from "@/lib/types";
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
  const lab = useQuery({ queryKey: ["lab"], queryFn: () => apiGet<LabAnalysis[]>("/lab") });
  const analysis = (lab.data ?? []).find((item) => item.load_id === load.id);
  return (
    <div className={(printable ? "print-area " : "no-print ") + "code-reveal rounded-2xl border-2 border-dashed border-amber-300 bg-white p-8 shadow-sm"} data-testid={testId}>
      <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <div className="font-heading text-lg font-bold text-stone-900" data-testid="ticket-mill">{m?.mill_name || t("app_name")}</div>
          {m?.mill_address && <div className="text-xs text-stone-500">{m.mill_address}</div>}
          {m?.mill_phone && <div className="text-xs text-stone-500" dir="ltr">{m.mill_phone}</div>}
        </div>
        <div className="text-end">
          <BiLabel k="ticket" both={both} className="text-xs font-semibold uppercase tracking-wider text-amber-700" />
          <div className="mt-1 text-xs text-stone-500" dir="ltr" data-testid="ticket-date">{fmtDate(load.created_at)}</div>
        </div>
      </div>
      <div className="my-6 flex flex-wrap items-center justify-center gap-8 text-center">
        <div>
          <BiLabel k="code" both={both} className="mb-2 text-xs text-stone-500" />
          <CodeBadge code={load.code} testId="intake-generated-code" big />
          <BiLabel k="code_hint" both={both} className="mt-3 text-sm text-stone-500" />
        </div>
        <div data-testid="intake-ticket-qr" className="flex flex-col items-center gap-1">
          <QRCodeSVG value={`${window.location.origin}/search?code=${encodeURIComponent(load.code)}`} size={112} level="M" marginSize={1} />
          <BiLabel k="scan_to_open" both={both} className="text-[10px] text-stone-500" />
          {analysis && (
            <div data-testid="intake-lab-qr" className="mt-2 flex flex-col items-center gap-1 border-t border-stone-200 pt-2">
              <QRCodeSVG value={`${window.location.origin}/certificate/${encodeURIComponent(analysis.id)}`} size={96} level="M" marginSize={1} />
              <span className="text-[10px] text-stone-600">Analyse du laboratoire</span>
              <span dir="rtl" className="text-[10px] text-stone-600">تحليل المخبر</span>
            </div>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 border-t border-stone-200 pt-6 text-sm">
        <div><dt><BiLabel k="client" both={both} className="text-stone-500" /></dt><dd className="font-semibold text-stone-900" data-testid="ticket-name">{load.client_name}</dd></div>
        <div><dt><BiLabel k="phone" both={both} className="text-stone-500" /></dt><dd className="font-semibold text-stone-900" dir="ltr" data-testid="ticket-phone">{load.phone}</dd></div>
        <div><dt><BiLabel k="olive_kg" both={both} className="text-stone-500" /></dt><dd className="font-heading text-2xl font-bold text-lime-800" data-testid="ticket-kg">{fmtNum(load.olive_kg)} kg</dd></div>
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
