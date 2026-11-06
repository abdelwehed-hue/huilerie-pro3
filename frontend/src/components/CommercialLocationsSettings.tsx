import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { apiGet, apiGetAllPages, apiPost } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type LocationRecord = { id: string; code: string; name: string; kind: "OLIVE_STORAGE" | "STAGING"; active: boolean; notes?: string | null };

export default function CommercialLocationsSettings() {
  const { lang } = useI18n();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"OLIVE_STORAGE" | "STAGING">("OLIVE_STORAGE");
  const [notes, setNotes] = useState("");
  const ar = lang === "ar";
  const labels = ar ? {
    title: "Emplacements", description: "إدارة مواقع استقبال وتخزين الزيتون ومناطق التحضير.", code: "الرمز", name: "اسم الموقع",
    kind: "النوع", olive: "مخزن الزيتون", staging: "منطقة التحضير", notes: "ملاحظات", add: "إضافة الموقع",
    saved: "تمت إضافة الموقع", error: "تعذرت إضافة الموقع", status: "الحالة", active: "نشط", inactive: "غير نشط",
    empty: "لا توجد مواقع مسجلة", loading: "جار تحميل المواقع…", notReady: "يلزم تهيئة الوحدة التجارية أولاً.",
  } : {
    title: "Emplacements", description: "Gérez les zones de réception et de stockage des olives ainsi que les zones de préparation.",
    code: "Code", name: "Nom de l’emplacement", kind: "Type", olive: "Stockage olives", staging: "Zone de préparation",
    notes: "Notes", add: "Ajouter l’emplacement", saved: "Emplacement ajouté", error: "Impossible d’ajouter l’emplacement",
    status: "État", active: "Actif", inactive: "Inactif", empty: "Aucun emplacement enregistré",
    loading: "Chargement des emplacements…", notReady: "Initialisez d’abord le module commercial.",
  };
  const status = useQuery({
    queryKey: ["commercial", "status"],
    queryFn: () => apiGet<{ ready: boolean }>("/commercial/v1/status"),
    refetchInterval: 30_000,
  });
  const ready = status.data?.ready === true;
  const locations = useQuery({
    queryKey: ["commercial", "locations"],
    queryFn: () => apiGetAllPages<LocationRecord>("/commercial/v1/locations", 500),
    enabled: ready,
  });
  const addLocation = useMutation({
    mutationFn: () => apiPost<LocationRecord>("/commercial/v1/locations", {
      code: code.trim().toUpperCase(), name: name.trim(), kind, notes: notes.trim() || null,
    }),
    onSuccess: async () => {
      toast.success(labels.saved);
      setCode(""); setName(""); setNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "locations"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : labels.error),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MapPin className="size-5 text-indigo-700" />{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5" dir={ar ? "rtl" : "ltr"}>
        {status.isLoading && <p className="py-4 text-center text-sm text-muted-foreground">{labels.loading}</p>}
        {(status.isError || locations.isError) && <p className="py-4 text-center text-sm text-red-700">{labels.error}</p>}
        {!status.isLoading && !status.isError && !ready && <p className="py-4 text-center text-sm text-muted-foreground">{labels.notReady}</p>}
        {ready && (
          <>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (code.trim().length >= 2 && name.trim().length >= 2) addLocation.mutate(); }}>
              <label className="grid gap-1 text-sm font-medium">{labels.code}<input required minLength={2} maxLength={20} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{labels.name}<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{labels.kind}<select value={kind} onChange={(event) => setKind(event.target.value as "OLIVE_STORAGE" | "STAGING")} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="OLIVE_STORAGE">{labels.olive}</option><option value="STAGING">{labels.staging}</option></select></label>
              <label className="grid gap-1 text-sm font-medium">{labels.notes}<input maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <div className="md:col-span-2"><Button type="submit" disabled={addLocation.isPending || code.trim().length < 2 || name.trim().length < 2}>{labels.add}</Button></div>
            </form>
            {locations.isLoading ? <p className="py-4 text-center text-sm text-muted-foreground">{labels.loading}</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>{labels.code}</TableHead><TableHead>{labels.name}</TableHead><TableHead>{labels.kind}</TableHead><TableHead>{labels.status}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(locations.data ?? []).map((location) => <TableRow key={location.id}><TableCell className="font-mono">{location.code}</TableCell><TableCell className="font-semibold">{location.name}</TableCell><TableCell>{location.kind === "OLIVE_STORAGE" ? labels.olive : labels.staging}</TableCell><TableCell>{location.active ? labels.active : labels.inactive}</TableCell></TableRow>)}
                  {!locations.isLoading && !(locations.data?.length) && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{labels.empty}</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
