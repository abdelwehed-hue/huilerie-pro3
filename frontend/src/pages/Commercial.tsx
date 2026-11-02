import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, Beaker, Boxes, ClipboardList, Factory,
  RefreshCw, ShieldCheck, Warehouse,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AnyRecord = Record<string, any>;
type CommercialStatus = {
  active_season: string;
  season_code: string;
  tanks_provisioned: number;
  active_olive_locations: number;
  season_counters_provisioned: number;
  ready: boolean;
};
type TabKey = "overview" | "tanks" | "lots" | "movements" | "quality" | "audit" | "suppliers" | "locations";

const labels = {
  fr: {
    title: "Oro Verde — Gestion commerciale",
    subtitle: "Stocks, lots, production et contrôle qualité, indépendamment des opérations de trituration.",
    overview: "Vue générale", tanks: "Cuves", lots: "Lots", movements: "Mouvements", quality: "Qualité", audit: "Audit",
    season: "Saison active", tanksCount: "Cuves configurées", locations: "Emplacements actifs",
    counters: "Compteurs de documents", readiness: "État du module", ready: "Prêt après initialisation",
    notReady: "Initialisation requise", bootstrap: "Initialiser le module commercial", bootstrapping: "Initialisation…",
    bootstrapHint: "Cette action crée les neuf cuves et les compteurs de la saison. Elle ne crée aucun stock et ne modifie pas les données de trituration.",
    bootstrapSuccess: "Module commercial initialisé", bootstrapError: "Impossible d'initialiser le module commercial",
    tank: "Cuve", capacity: "Capacité", flexible: "Flexible — capacité non définie", active: "Active",
    product: "Produit", document: "Document", owner: "Propriétaire", quantity: "Quantité (kg)",
    status: "État", qualityStatus: "Contrôle qualité", created: "Créé le", location: "Emplacement",
    source: "Origine", destination: "Destination", movement: "Mouvement", noRows: "Aucune donnée à afficher",
    refresh: "Actualiser", adminOnly: "Initialisation réservée à l'administrateur",
    olive: "Olives", oil: "Huile", mill: "Maâsra", customer: "Client",
    pending: "En attente", released: "Libéré", rejected: "Rejeté", open: "Ouvert", closed: "Fermé",
    awaiting: "En attente de revue", unknown: "—", noPermission: "Accès en lecture seule selon vos autorisations.",
    qualityRule: "Un lot d'huile reste bloqué tant qu'un réviseur indépendant n'a pas approuvé son analyse.",
    warning: "Le module commercial n'est pas encore initialisé dans la base de données.",
    suppliers: "Fournisseurs", locationsTab: "Emplacements", supplierName: "Nom du fournisseur", supplierPhone: "Téléphone", taxId: "Identifiant fiscal", addSupplier: "Ajouter le fournisseur", supplierSaved: "Fournisseur ajouté", locationCode: "Code", locationName: "Nom de l’emplacement", locationType: "Type", oliveStorage: "Stockage olives", staging: "Zone de préparation", addLocation: "Ajouter l’emplacement", locationSaved: "Emplacement ajouté", notes: "Notes",
  },
  ar: {
    title: "Oro Verde — التسيير التجاري",
    subtitle: "المخزون والدفعات والإنتاج ومراقبة الجودة، بصورة مستقلة عن عمليات العصر.",
    overview: "نظرة عامة", tanks: "الخزانات", lots: "الدفعات", movements: "الحركات", quality: "الجودة", audit: "التدقيق",
    season: "الموسم الحالي", tanksCount: "الخزانات المهيأة", locations: "المواقع النشطة",
    counters: "عدادات الوثائق", readiness: "حالة الوحدة", ready: "جاهزة بعد التهيئة",
    notReady: "تتطلب التهيئة", bootstrap: "تهيئة الوحدة التجارية", bootstrapping: "جار التهيئة…",
    bootstrapHint: "تنشئ هذه العملية الخزانات التسعة وعدادات الموسم. لا تضيف أي مخزون ولا تغيّر بيانات العصر.",
    bootstrapSuccess: "تمت تهيئة الوحدة التجارية", bootstrapError: "تعذرت تهيئة الوحدة التجارية",
    tank: "الخزان", capacity: "السعة", flexible: "مرنة — السعة غير محددة", active: "نشط",
    product: "المنتج", document: "الوثيقة", owner: "المالك", quantity: "الكمية (كغ)",
    status: "الحالة", qualityStatus: "حالة الجودة", created: "تاريخ الإنشاء", location: "الموقع",
    source: "المصدر", destination: "الوجهة", movement: "الحركة", noRows: "لا توجد بيانات للعرض",
    refresh: "تحديث", adminOnly: "التهيئة متاحة للمدير فقط",
    olive: "زيتون", oil: "زيت", mill: "المعصرة", customer: "الحريف",
    pending: "في الانتظار", released: "مقبول", rejected: "مرفوض", open: "مفتوح", closed: "مغلق",
    awaiting: "في انتظار المراجعة", unknown: "—", noPermission: "صلاحية العرض فقط حسب أذونات حسابك.",
    qualityRule: "تبقى دفعة الزيت غير متاحة للبيع حتى يعتمد محلل مستقل نتائج التحليل.",
    warning: "لم تتم تهيئة الوحدة التجارية في قاعدة البيانات بعد.",
    suppliers: "المزوّدون", locationsTab: "مواقع التخزين", supplierName: "اسم المزوّد", supplierPhone: "الهاتف", taxId: "المعرّف الجبائي", addSupplier: "إضافة المزوّد", supplierSaved: "تمت إضافة المزوّد", locationCode: "الرمز", locationName: "اسم الموقع", locationType: "النوع", oliveStorage: "مخزن الزيتون", staging: "منطقة التحضير", addLocation: "إضافة الموقع", locationSaved: "تمت إضافة الموقع", notes: "ملاحظات",
  },
} as const;

function value(v: unknown, fallback = "—") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}
function number(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) : "—";
}
function date(v: unknown) {
  if (!v) return "—";
  const parsed = new Date(String(v));
  return Number.isNaN(parsed.getTime()) ? String(v) : parsed.toLocaleDateString();
}
function ownerLabel(owner: AnyRecord | undefined, l: { mill: string; customer: string; unknown: string }) {
  if (!owner) return l.unknown;
  return owner.kind === "MILL" ? l.mill : owner.kind === "CUSTOMER" ? `${l.customer}: ${value(owner.customer_id)}` : value(owner.kind);
}
function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">{text}</TableCell></TableRow>;
}

export default function Commercial() {
  const { lang } = useI18n();
  const l = labels[lang === "ar" ? "ar" : "fr"];
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("overview");
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierTaxId, setSupplierTaxId] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationKind, setLocationKind] = useState<"OLIVE_STORAGE" | "STAGING">("OLIVE_STORAGE");
  const [locationNotes, setLocationNotes] = useState("");
  const status = useQuery({
    queryKey: ["commercial", "status"],
    queryFn: () => apiGet<CommercialStatus>("/commercial/v1/status"),
    refetchInterval: 30_000,
  });
  const ready = status.data?.ready === true;
  const tanks = useQuery({ queryKey: ["commercial", "tanks"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/tanks"), enabled: ready });
  const lots = useQuery({ queryKey: ["commercial", "lots"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/lots?limit=500"), enabled: ready });
  const balances = useQuery({ queryKey: ["commercial", "balances"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/stock-balances?limit=1000"), enabled: ready });
  const movements = useQuery({ queryKey: ["commercial", "movements"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/stock-movements?limit=500"), enabled: ready && tab === "movements" });
  const quality = useQuery({ queryKey: ["commercial", "quality"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/quality-assessments?limit=500"), enabled: ready && tab === "quality" });
  const audit = useQuery({ queryKey: ["commercial", "audit"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/audit-events?limit=500"), enabled: ready && tab === "audit" });
  const suppliers = useQuery({ queryKey: ["commercial", "suppliers"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/suppliers"), enabled: ready && tab === "suppliers" });
  const locations = useQuery({ queryKey: ["commercial", "locations"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/locations"), enabled: ready && tab === "locations" });
  const bootstrap = useMutation({
    mutationFn: () => apiPost<CommercialStatus>("/commercial/v1/bootstrap"),
    onSuccess: async () => {
      toast.success(l.bootstrapSuccess);
      await queryClient.invalidateQueries({ queryKey: ["commercial"] });
    },
    onError: () => toast.error(l.bootstrapError),
  });

  const totalOlives = useMemo(() => (balances.data ?? []).filter((b) => b.product_kind === "OLIVE").reduce((sum, b) => sum + Number(b.quantity_kg ?? 0), 0), [balances.data]);
  const totalOil = useMemo(() => (balances.data ?? []).filter((b) => b.product_kind === "OIL").reduce((sum, b) => sum + Number(b.quantity_kg ?? 0), 0), [balances.data]);
  const qualityPending = (lots.data ?? []).filter((lot) => lot.product_kind === "OIL" && lot.quality_status !== "RELEASED").length;

  const tabs: { id: TabKey; label: string; icon: typeof Warehouse }[] = [
    { id: "overview", label: l.overview, icon: Activity },
    { id: "tanks", label: l.tanks, icon: Warehouse },
    { id: "lots", label: l.lots, icon: Boxes },
    { id: "movements", label: l.movements, icon: RefreshCw },
    { id: "quality", label: l.quality, icon: Beaker },
    { id: "audit", label: l.audit, icon: ClipboardList },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">{l.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-stone-500 md:text-base">{l.subtitle}</p>
        </div>
        <Button variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: ["commercial"] })}>
          <RefreshCw className="size-4" /> {l.refresh}
        </Button>
      </div>

      {status.isError && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">{l.warning} {String((status.error as Error)?.message ?? "")}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardDescription>{l.season}</CardDescription><CardTitle className="text-2xl" dir="ltr">{value(status.data?.season_code)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-1"><CardDescription>{l.tanksCount}</CardDescription><CardTitle className="text-2xl">{status.data?.tanks_provisioned ?? "—"}/9</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-1"><CardDescription>{l.locations}</CardDescription><CardTitle className="text-2xl">{status.data?.active_olive_locations ?? "—"}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-1"><CardDescription>{l.counters}</CardDescription><CardTitle className="text-2xl">{status.data?.season_counters_provisioned ?? "—"}/6</CardTitle></CardHeader></Card>
      </div>

      {!ready && (
        <Card className="border-amber-300 bg-amber-50/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-950"><AlertTriangle className="size-5" />{l.notReady}</CardTitle>
            <CardDescription className="text-amber-900">{l.bootstrapHint}</CardDescription>
          </CardHeader>
          {isAdmin ? (
            <CardContent><Button disabled={bootstrap.isPending || status.isLoading} onClick={() => bootstrap.mutate()}>
              <Factory className="size-4" /> {bootstrap.isPending ? l.bootstrapping : l.bootstrap}
            </Button></CardContent>
          ) : (
            <CardContent className="text-sm text-amber-900">{l.adminOnly}</CardContent>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-2 rounded-2xl border bg-white p-2 shadow-sm">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${tab === id ? "bg-[#1F4D2B] text-white" : "text-stone-600 hover:bg-stone-100"}`}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader><CardDescription>{l.olive}</CardDescription><CardTitle className="text-3xl">{number(totalOlives)} kg</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>{l.oil}</CardDescription><CardTitle className="text-3xl">{number(totalOil)} kg</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>{l.quality}</CardDescription><CardTitle className="text-3xl">{ready ? qualityPending : "—"}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader></Card>
          </div>
          <Card><CardHeader><CardTitle>{l.readiness}</CardTitle><CardDescription>{ready ? l.ready : l.notReady}</CardDescription></CardHeader><CardContent className="flex items-center gap-2 text-sm">{ready ? <ShieldCheck className="size-5 text-emerald-600" /> : <AlertTriangle className="size-5 text-amber-600" />}{ready ? l.ready : l.warning}</CardContent></Card>
        </div>
      )}

      {tab === "tanks" && <Card><CardHeader><CardTitle>{l.tanks}</CardTitle><CardDescription>{l.capacity}: {l.flexible}</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.tank}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{l.capacity}</TableHead><TableHead>{l.status}</TableHead></TableRow></TableHeader><TableBody>{(tanks.data ?? []).map((tank) => <TableRow key={tank.id}><TableCell className="font-semibold">{value(tank.code)} · {value(tank.name)}</TableCell><TableCell>{number((balances.data ?? []).filter((b) => b.location_id === tank.id && b.product_kind === "OIL").reduce((sum, b) => sum + Number(b.quantity_kg ?? 0), 0))} kg</TableCell><TableCell>{tank.capacity_kg == null ? l.flexible : number(tank.capacity_kg)}</TableCell><TableCell>{tank.active ? l.active : l.closed}</TableCell></TableRow>)}{(!tanks.isLoading && !(tanks.data?.length)) && <EmptyRow colSpan={4} text={l.noRows} />}</TableBody></Table></CardContent></Card>}

      {tab === "lots" && <Card><CardHeader><CardTitle>{l.lots}</CardTitle><CardDescription>{l.owner}: MILL / CUSTOMER</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.product}</TableHead><TableHead>{l.owner}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{l.qualityStatus}</TableHead><TableHead>{l.status}</TableHead></TableRow></TableHeader><TableBody>{(lots.data ?? []).map((lot) => <TableRow key={lot.id}><TableCell className="font-mono text-xs">{value(lot.document_number)}</TableCell><TableCell>{lot.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell><TableCell>{ownerLabel(lot.owner, l)}</TableCell><TableCell>{number(lot.quantity_received_kg ?? lot.quantity_kg)}</TableCell><TableCell>{lot.product_kind === "OIL" ? value(lot.quality_status, l.pending) : "—"}</TableCell><TableCell>{value(lot.status)}</TableCell></TableRow>)}{(!lots.isLoading && !(lots.data?.length)) && <EmptyRow colSpan={6} text={l.noRows} />}</TableBody></Table></CardContent></Card>}

      {tab === "movements" && <Card><CardHeader><CardTitle>{l.movements}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.movement}</TableHead><TableHead>{l.product}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{l.source}</TableHead><TableHead>{l.destination}</TableHead><TableHead>{l.created}</TableHead></TableRow></TableHeader><TableBody>{(movements.data ?? []).map((m) => <TableRow key={m.id}><TableCell className="font-mono text-xs">{value(m.document_number)}</TableCell><TableCell>{value(m.movement_kind)}</TableCell><TableCell>{m.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell><TableCell>{number(m.quantity_kg)}</TableCell><TableCell>{value(m.source_location_id)}</TableCell><TableCell>{value(m.destination_location_id)}</TableCell><TableCell>{date(m.created_at)}</TableCell></TableRow>)}{(!movements.isLoading && !(movements.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody></Table></CardContent></Card>}

      {tab === "quality" && <Card><CardHeader><CardTitle>{l.quality}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.source}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.created}</TableHead></TableRow></TableHeader><TableBody>{(quality.data ?? []).map((q) => <TableRow key={q.id}><TableCell className="font-mono text-xs">{value(q.id)}</TableCell><TableCell>{value(q.laboratory_name)}</TableCell><TableCell>{value(q.status, l.awaiting)}</TableCell><TableCell>{date(q.created_at)}</TableCell></TableRow>)}{(!quality.isLoading && !(quality.data?.length)) && <EmptyRow colSpan={4} text={l.noRows} />}</TableBody></Table></CardContent></Card>}

      {tab === "audit" && <Card><CardHeader><CardTitle>{l.audit}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.created}</TableHead><TableHead>{l.movement}</TableHead><TableHead>{l.document}</TableHead><TableHead>{l.source}</TableHead></TableRow></TableHeader><TableBody>{(audit.data ?? []).map((a) => <TableRow key={a.id}><TableCell>{date(a.created_at)}</TableCell><TableCell>{value(a.action)}</TableCell><TableCell>{value(a.entity_type)}</TableCell><TableCell className="font-mono text-xs">{value(a.entity_id)}</TableCell></TableRow>)}{(!audit.isLoading && !(audit.data?.length)) && <EmptyRow colSpan={4} text={l.noRows} />}</TableBody></Table></CardContent></Card>}
    </div>
  );
}
