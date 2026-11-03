import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { ScanLine } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";

const READER_ID = "qr-reader";

/** Accepts either a ticket URL (…/search?code=XXXX) or a raw code. */
export function codeFromScan(text: string): string {
  try {
    const u = new URL(text);
    const c = u.searchParams.get("code");
    if (c) return c.trim();
  } catch {
    /* not a URL */
  }
  return text.trim();
}

export default function QrScanDialog({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan?: (code: string) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    let scanner: Html5Qrcode | null = null;
    let stopped = false;
    const stop = () => {
      if (scanner?.isScanning) scanner.stop().catch(() => undefined);
    };
    // wait one frame so the dialog has mounted the reader element
    const raf = requestAnimationFrame(() => {
      if (stopped) return;
      scanner = new Html5Qrcode(READER_ID, false);
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 230, height: 230 } },
          (text) => {
            const code = codeFromScan(text);
            if (!code) return;
            stopped = true;
            stop();
            onClose();
            if (onScan) onScan(code);
            else navigate(`/search?code=${encodeURIComponent(code)}`);
          },
          () => undefined,
        )
        .catch(() => setError(t("camera_error")));
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stop();
    };
  }, [open, navigate, onClose, onScan, t]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="qr-scan-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="size-5 text-sky-600" /> {t("scan_qr")}</DialogTitle>
          <DialogDescription>{t("scan_qr_hint")}</DialogDescription>
        </DialogHeader>
        <div id={READER_ID} data-testid="qr-reader" className="min-h-64 overflow-hidden rounded-xl bg-stone-900" />
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" data-testid="qr-scan-error">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
