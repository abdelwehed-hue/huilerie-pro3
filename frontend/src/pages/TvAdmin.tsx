import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, MonitorPlay, MonitorX, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPatch } from "@/lib/api";
import type { TvAdminItem, TvItemUpdate } from "@/lib/types";
import { fmtDate, useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { PageHeader } from "@/components/shared";
import { cn } from "@/lib/utils";

export default function TvAdmin() {
  const { t, errMsg } = useI18n();
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["tv-admin"],
    queryFn: () => apiGet<TvAdminItem[]>("/tv/admin"),
    refetchInterval: 5000,
  });
  const rows = q.isError ? [] : (q.data ?? []);
  const m = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TvItemUpdate }) => apiPatch<TvAdminItem>(`/tv/items/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tv-admin"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const link = `${window.location.origin}/tv`;

  return (
    <div>
      <PageHeader
        title={t("tv")}
        sub={t("tv_sub")}
        accent="bg-orange-500"
        right={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              data-testid="tv-copy-link-button"
              onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success(t("tv_copied")), () => toast.error(link))}
            >
              <Copy className="size-4" /> {t("tv_copy")}
            </Button>
            <a href="/tv" target="_blank" rel="noreferrer" data-testid="tv-open-link" className={cn(buttonVariants(), "rounded-xl bg-orange-600 hover:bg-orange-700")}>
              <MonitorPlay className="size-4" /> {t("tv_open")}
            </a>
          </div>
        }
      />
      <div className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 font-mono text-lg text-orange-900" dir="ltr" data-testid="tv-link">{link}</div>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <Table data-testid="tv-admin-table">
          <TableHeader className="bg-stone-50">
            <TableRow>
              <TableHead className="text-start">{t("code")}</TableHead>
              <TableHead className="text-start">{t("tv_finished_at")}</TableHead>
              <TableHead className="text-start">{t("status")}</TableHead>
              <TableHead className="text-end">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-stone-500" data-testid="tv-admin-empty">{t("tv_empty")}</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`tv-admin-row-${r.code}`} className={r.removed ? "opacity-60" : ""}>
                <TableCell className="font-mono text-lg font-bold" dir="ltr">{r.code}</TableCell>
                <TableCell className="text-sm text-stone-600" dir="ltr">{fmtDate(r.finished_at)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", r.removed ? "bg-stone-200 text-stone-600" : "bg-lime-100 text-lime-800")} data-testid={`tv-admin-state-${r.code}`}>
                      {r.removed ? t("tv_removed") : t("tv_on_screen")}
                    </span>
                    {r.hidden && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">{t("tv_hidden")}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" disabled={m.isPending} className="rounded-lg" data-testid={`tv-toggle-code-${r.code}`} onClick={() => m.mutate({ id: r.id, body: { hidden: !r.hidden } })}>
                      {r.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />} {r.hidden ? t("tv_show_code") : t("tv_hide_code")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={m.isPending}
                      className={cn("rounded-lg", !r.removed && "border-red-200 text-red-600 hover:bg-red-50")}
                      data-testid={`tv-toggle-remove-${r.code}`}
                      onClick={() => m.mutate({ id: r.id, body: { removed: !r.removed } })}
                    >
                      {r.removed ? <RotateCcw className="size-4" /> : <MonitorX className="size-4" />} {r.removed ? t("tv_restore") : t("tv_remove")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
