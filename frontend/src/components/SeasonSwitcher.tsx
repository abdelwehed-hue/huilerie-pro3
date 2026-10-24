import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPut } from "@/lib/api";
import type { SeasonInfo, SeasonSet } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

/** Header season selector: admins switch the active season (affects all pages); workers see it read-only. */
export default function SeasonSwitcher({ isAdmin }: { isAdmin: boolean }) {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["seasons"], queryFn: () => apiGet<SeasonInfo>("/seasons") });
  const s = q.isError ? undefined : q.data;
  const m = useMutation({
    mutationFn: (b: SeasonSet) => apiPut<SeasonInfo>("/seasons/active", b),
    onSuccess: () => {
      toast.success(t("season_saved"));
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  if (!s) return null;
  if (!isAdmin) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900" data-testid="header-season-badge">
        <CalendarRange className="size-4" /> <span dir="ltr">{s.active}</span>
      </div>
    );
  }
  return (
    <Select value={s.active} disabled={m.isPending} onValueChange={(v) => v && v !== s.active && m.mutate({ season: v as string })}>
      <SelectTrigger className="h-9 gap-1.5 rounded-xl border-amber-300 bg-amber-50 font-semibold text-amber-900" data-testid="header-season-select" title={t("season")}>
        <CalendarRange className="size-4" />
        <SelectValue>{(v) => <span dir="ltr">{String(v)}</span>}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {s.available.map((x) => (
          <SelectItem key={x} value={x} data-testid={`header-season-option-${x}`}>
            <span dir="ltr">{x}</span>{x === s.current ? ` · ${t("season_current")}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
