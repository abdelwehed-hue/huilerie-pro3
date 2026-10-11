import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, Droplet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, ApiError } from "@/lib/api";
import type { Load } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { LoadDetail, PageHeader } from "@/components/shared";
import OilEntryDialog from "@/components/OilEntryDialog";

export default function SearchPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const code = params.get("code") ?? "";
  const [input, setInput] = useState(code);
  const [lastCode, setLastCode] = useState(code);
  const [editing, setEditing] = useState<Load | null>(null);
  if (code !== lastCode) {
    setLastCode(code);
    setInput(code);
  }

  const q = useQuery({
    queryKey: ["load-by-code", code],
    queryFn: () => apiGet<Load>(`/loads/by-code/${encodeURIComponent(code)}`),
    enabled: !!code,
    retry: false,
  });

  const notFound = q.isError && q.error instanceof ApiError && q.error.status === 404;

  return (
    <div>
      <PageHeader title={t("search")} sub={t("search_sub")} accent="bg-sky-500" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) setParams({ code: input.trim() });
        }}
        className="mb-8 flex max-w-2xl gap-3"
      >
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-sky-500" />
          <Input
            data-testid="search-code-input"
            dir="ltr"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="2503141035"
            className="h-14 rounded-2xl border-sky-200 bg-white ps-12 font-mono text-2xl tracking-wider"
          />
        </div>
        <Button type="submit" data-testid="search-code-submit" className="h-14 rounded-2xl bg-sky-600 px-8 text-base hover:bg-sky-700">
          {t("go")}
        </Button>
      </form>

      {q.isLoading && <p className="text-stone-500">{t("loading")}</p>}
      {notFound && (
        <div data-testid="search-not-found" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          {t("not_found")}: <span className="font-mono font-bold" dir="ltr">{code}</span>
        </div>
      )}
      {q.data && !q.isError && (
        <div className="space-y-4">
          <LoadDetail load={q.data} />
          <Button onClick={() => setEditing(q.data)} data-testid="search-enter-oil-button" className="rounded-xl bg-amber-600 hover:bg-amber-700">
            <Droplet className="size-4" />
            {q.data.oil_kg != null ? t("edit_oil") : t("enter_oil")}
          </Button>
        </div>
      )}
      <OilEntryDialog load={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
