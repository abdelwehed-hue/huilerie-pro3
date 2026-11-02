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
type TabKey = "overview" | "tanks" | "lots" | "movements" | "quality" | "audit" | "suppliers" | "locations" | "varieties" | "purchases" | "production";

const labels = {
  fr: {
    productionTab: "Production", newProduction: "Nouvelle production", productionDate: "Date de production", inputLots: "Lots d’olives consommés", chooseOliveBalance: "Lot · emplacement · propriétaire", inputQuantity: "Quantité consommée (kg)", outputQuantity: "Huile réellement obtenue (kg)", outputTank: "Cuve de réception", extractionRate: "Rendement réel", completeProduction: "Enregistrer la production", productionSaved: "Production enregistrée et stock mis à jour", productionHistory: "Historique de production", ownerMill: "Maâsra", ownerCustomer: "Client", addInput: "Ajouter un lot", totalInput: "Total olives consommées (kg)", noOliveStock: "Aucun stock d’olives disponible pour la production.", selectTank: "Sélectionnez une cuve.",
    actions: "Actions",
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
    varietiesTab: "Variétés d’olives", varietyCode: "Code variété", varietyNameFr: "Nom en français", varietyNameAr: "Nom en arabe", addVariety: "Ajouter une variété", varietySaved: "Variété ajoutée",     purchasesTab: "Achats d’olives", newPurchase: "Nouvel achat", purchaseDate: "Date d’achat", supplier: "Fournisseur", variety: "Variété", unitPrice: "Prix unitaire (DT/kg)", addLine: "Ajouter une ligne", removeLine: "Retirer", createDraft: "Créer le brouillon", purchaseCreated: "Brouillon d’achat créé", approve: "Approuver et réceptionner", receivingLocation: "Emplacement de réception", totalAmount: "Montant total (DT)", totalQuantity: "Quantité totale (kg)", draft: "Brouillon", approved: "Approuvé", noSuppliers: "Créez d’abord un fournisseur.", noVarieties: "Créez d’abord les variétés commerciales.",     suppliers: "Fournisseurs", locationsTab: "Emplacements", supplierName: "Nom du fournisseur", supplierPhone: "Téléphone", taxId: "Identifiant fiscal", addSupplier: "Ajouter le fournisseur", supplierSaved: "Fournisseur ajouté", locationCode: "Code", locationName: "Nom de l’emplacement", locationType: "Type", oliveStorage: "Stockage olives", staging: "Zone de préparation", addLocation: "Ajouter l’emplacement", locationSaved: "Emplacement ajouté", notes: "Notes",
  },
  ar: {
    productionTab: "الإنتاج", newProduction: "إنتاج جديد", productionDate: "تاريخ الإنتاج", inputLots: "دفعات الزيتون المستهلكة", chooseOliveBalance: "الدفعة · الموقع · المالك", inputQuantity: "الكمية المستهلكة (كغ)", outputQuantity: "كمية الزيت الفعلية الناتجة (كغ)", outputTank: "خزان الاستلام", extractionRate: "المردودية الفعلية", completeProduction: "تسجيل الإنتاج", productionSaved: "تم تسجيل الإنتاج وتحيين المخزون", productionHistory: "سجل الإنتاج", ownerMill: "المعصرة", ownerCustomer: "الحريف", addInput: "إضافة دفعة", totalInput: "مجموع الزيتون المستهلك (كغ)", noOliveStock: "لا يوجد مخزون زيتون متاح للإنتاج.", selectTank: "يرجى اختيار خزان.",
    actions: "الإجراءات",
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
    varietiesTab: "أصناف الزيتون", varietyCode: "رمز الصنف", varietyNameFr: "الاسم بالفرنسية", varietyNameAr: "الاسم بالعربية", addVariety: "إضافة صنف", varietySaved: "تمت إضافة الصنف",     purchasesTab: "شراء الزيتون", newPurchase: "شراء جديد", purchaseDate: "تاريخ الشراء", supplier: "المزوّد", variety: "الصنف", unitPrice: "السعر للوحدة (د.ت/كغ)", addLine: "إضافة سطر", removeLine: "حذف السطر", createDraft: "إنشاء مسودة", purchaseCreated: "تم إنشاء مسودة الشراء", approve: "اعتماد واستلام", receivingLocation: "موقع الاستلام", totalAmount: "المبلغ الجملي (د.ت)", totalQuantity: "الكمية الجملية (كغ)", draft: "مسودة", approved: "معتمد", noSuppliers: "أنشئ مزوّداً أولاً.", noVarieties: "أنشئ أصناف الزيتون التجارية أولاً.",     suppliers: "المزوّدون", locationsTab: "مواقع التخزين", supplierName: "اسم المزوّد", supplierPhone: "الهاتف", taxId: "المعرّف الجبائي", addSupplier: "إضافة المزوّد", supplierSaved: "تمت إضافة المزوّد", locationCode: "الرمز", locationName: "اسم الموقع", locationType: "النوع", oliveStorage: "مخزن الزيتون", staging: "منطقة التحضير", addLocation: "إضافة الموقع", locationSaved: "تمت إضافة الموقع", notes: "ملاحظات",
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
function ownerIdentity(owner: AnyRecord | undefined) {
  if (!owner) return "";
  return owner.kind === "CUSTOMER" ? "CUSTOMER:" + String(owner.customer_id ?? "") : String(owner.kind ?? "");
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
  const [varietyCode, setVarietyCode] = useState("");
  const [varietyNameFr, setVarietyNameFr] = useState("");
  const [varietyNameAr, setVarietyNameAr] = useState("");
  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseLines, setPurchaseLines] = useState([{ variety_id: "", quantity_kg: "", unit_price_dt: "" }]);
  const [receivingLocationId, setReceivingLocationId] = useState("");
  const [productionDate, setProductionDate] = useState(new Date().toISOString().slice(0, 10));
  const [productionInputs, setProductionInputs] = useState([{ balance_key: "", quantity_kg: "" }]);
  const [productionOutputKg, setProductionOutputKg] = useState("");
  const [productionTankId, setProductionTankId] = useState("");
  const [productionNotes, setProductionNotes] = useState("");
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
  const suppliers = useQuery({ queryKey: ["commercial", "suppliers"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/suppliers"), enabled: ready && (tab === "suppliers" || tab === "purchases") });
  const locations = useQuery({ queryKey: ["commercial", "locations"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/locations"), enabled: ready && (tab === "locations" || tab === "purchases") });
  const varieties = useQuery({ queryKey: ["commercial", "varieties"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/varieties"), enabled: ready && (tab === "varieties" || tab === "purchases") });
  const purchases = useQuery({ queryKey: ["commercial", "purchases"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/olive-purchases?limit=500"), enabled: ready && tab === "purchases" });
  const productionRuns = useQuery({ queryKey: ["commercial", "production-runs"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/production-runs?limit=500"), enabled: ready && tab === "production" });
  const addSupplier = useMutation({
    mutationFn: () => apiPost<AnyRecord>("/commercial/v1/suppliers", {
      name: supplierName.trim(), phone: supplierPhone.trim() || null,
      tax_identifier: supplierTaxId.trim() || null, notes: supplierNotes.trim() || null,
    }),
    onSuccess: async () => {
      toast.success(l.supplierSaved);
      setSupplierName(""); setSupplierPhone(""); setSupplierTaxId(""); setSupplierNotes("");
      await queryClient.invalidateQueries({ queryKey: ["commercial", "suppliers"] });
    },
    onError: () => toast.error(l.warning),
  });
  const addLocation = useMutation({
    mutationFn: () => apiPost<AnyRecord>("/commercial/v1/locations", {
      code: locationCode.trim().toUpperCase(), name: locationName.trim(),
      kind: locationKind, notes: locationNotes.trim() || null,
    }),
    onSuccess: async () => {
      toast.success(l.locationSaved);
      setLocationCode(""); setLocationName(""); setLocationNotes("");
      await queryClient.invalidateQueries({ queryKey: ["commercial", "locations"] });
    },
    onError: () => toast.error(l.warning),
  });
  const addVariety = useMutation({
    mutationFn: () => apiPost<AnyRecord>("/commercial/v1/varieties", {
      code: varietyCode.trim().toUpperCase(), name_fr: varietyNameFr.trim(),
      name_ar: varietyNameAr.trim() || null,
    }),
    onSuccess: async () => {
      toast.success(l.varietySaved);
      setVarietyCode(""); setVarietyNameFr(""); setVarietyNameAr("");
      await queryClient.invalidateQueries({ queryKey: ["commercial", "varieties"] });
    },
    onError: () => toast.error(l.warning),
  });
  const createPurchase = useMutation({
    mutationFn: () => apiPost<AnyRecord>("/commercial/v1/olive-purchases", {
      supplier_id: purchaseSupplierId,
      purchase_date: purchaseDate,
      lines: purchaseLines.map((line) => ({
        variety_id: line.variety_id,
        quantity_kg: line.quantity_kg,
        unit_price_dt: line.unit_price_dt,
      })),
      notes: purchaseNotes.trim() || null,
      idempotency_key: crypto.randomUUID(),
    }),
    onSuccess: async () => {
      toast.success(l.purchaseCreated);
      setPurchaseNotes("");
      setPurchaseLines([{ variety_id: "", quantity_kg: "", unit_price_dt: "" }]);
      await queryClient.invalidateQueries({ queryKey: ["commercial", "purchases"] });
    },
    onError: () => toast.error(l.warning),
  });
  const approvePurchase = useMutation({
    mutationFn: (purchase: AnyRecord) => apiPost<AnyRecord>(`/commercial/v1/olive-purchases/${encodeURIComponent(purchase.id)}/approve`, {
      expected_version: purchase.version,
      receiving_location_id: receivingLocationId,
      idempotency_key: crypto.randomUUID(),
    }),
    onSuccess: async () => {
      toast.success(l.approved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "purchases"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
      ]);
    },
    onError: () => toast.error(l.warning),
  });
  const completeProduction = useMutation({
    mutationFn: () => {
      const inputLines = productionInputs.map((line) => {
        const balance = (balances.data ?? []).find((b) => `${b.lot_id}::${b.location_id}` === line.balance_key);
        const lot = (lots.data ?? []).find((item) => item.id === balance?.lot_id);
        if (!balance || !lot) throw new Error("Selected olive balance is no longer available");
        return {
          olive_lot_id: lot.id,
          source_location_id: balance.location_id,
          owner: balance.owner,
          quantity_kg: line.quantity_kg,
        };
      });
      return apiPost<AnyRecord>("/commercial/v1/production-runs", {
        production_date: productionDate,
        inputs: inputLines,
        actual_oil_output_kg: productionOutputKg,
        output_tank_id: productionTankId,
        notes: productionNotes.trim() || null,
        idempotency_key: crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      toast.success(l.productionSaved);
      setProductionInputs([{ balance_key: "", quantity_kg: "" }]);
      setProductionOutputKg(""); setProductionNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "production-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(`${l.warning} ${error instanceof Error ? error.message : ""}`),
  });
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
    { id: "suppliers", label: l.suppliers, icon: Boxes },
    { id: "locations", label: l.locationsTab, icon: Warehouse },
    { id: "varieties", label: l.varietiesTab, icon: Boxes },
    { id: "purchases", label: l.purchasesTab, icon: ClipboardList },
    { id: "production", label: l.productionTab, icon: Factory },
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

      {tab === "suppliers" && <div className="space-y-4">
        {isAdmin && <Card><CardHeader><CardTitle>{l.addSupplier}</CardTitle></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (supplierName.trim().length >= 2) addSupplier.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{l.supplierName}<input required minLength={2} maxLength={160} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.supplierPhone}<input maxLength={40} value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.taxId}<input maxLength={80} value={supplierTaxId} onChange={(e) => setSupplierTaxId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.notes}<input maxLength={1000} value={supplierNotes} onChange={(e) => setSupplierNotes(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <div className="md:col-span-2"><Button type="submit" disabled={addSupplier.isPending || supplierName.trim().length < 2}>{l.addSupplier}</Button></div>
          </form>
        </CardContent></Card>}
        <Card><CardHeader><CardTitle>{l.suppliers}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.supplierName}</TableHead><TableHead>{l.supplierPhone}</TableHead><TableHead>{l.taxId}</TableHead></TableRow></TableHeader><TableBody>{(suppliers.data ?? []).map((s) => <TableRow key={s.id}><TableCell className="font-semibold">{value(s.name)}</TableCell><TableCell>{value(s.phone)}</TableCell><TableCell>{value(s.tax_identifier)}</TableCell></TableRow>)}{(!suppliers.isLoading && !(suppliers.data?.length)) && <EmptyRow colSpan={3} text={l.noRows} />}</TableBody></Table></CardContent></Card>
      </div>}

      {tab === "locations" && <div className="space-y-4">
        {isAdmin && <Card><CardHeader><CardTitle>{l.addLocation}</CardTitle></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (locationCode.trim().length >= 2 && locationName.trim().length >= 2) addLocation.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{l.locationCode}<input required minLength={2} maxLength={20} value={locationCode} onChange={(e) => setLocationCode(e.target.value.toUpperCase())} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.locationName}<input required minLength={2} maxLength={100} value={locationName} onChange={(e) => setLocationName(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.locationType}<select value={locationKind} onChange={(e) => setLocationKind(e.target.value as "OLIVE_STORAGE" | "STAGING")} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="OLIVE_STORAGE">{l.oliveStorage}</option><option value="STAGING">{l.staging}</option></select></label>
            <label className="grid gap-1 text-sm font-medium">{l.notes}<input maxLength={500} value={locationNotes} onChange={(e) => setLocationNotes(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <div className="md:col-span-2"><Button type="submit" disabled={addLocation.isPending || locationCode.trim().length < 2 || locationName.trim().length < 2}>{l.addLocation}</Button></div>
          </form>
        </CardContent></Card>}
        <Card><CardHeader><CardTitle>{l.locationsTab}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.locationCode}</TableHead><TableHead>{l.locationName}</TableHead><TableHead>{l.locationType}</TableHead><TableHead>{l.status}</TableHead></TableRow></TableHeader><TableBody>{(locations.data ?? []).map((loc) => <TableRow key={loc.id}><TableCell className="font-mono">{value(loc.code)}</TableCell><TableCell className="font-semibold">{value(loc.name)}</TableCell><TableCell>{loc.kind === "OLIVE_STORAGE" ? l.oliveStorage : l.staging}</TableCell><TableCell>{loc.active ? l.active : l.closed}</TableCell></TableRow>)}{(!locations.isLoading && !(locations.data?.length)) && <EmptyRow colSpan={4} text={l.noRows} />}</TableBody></Table></CardContent></Card>
      </div>}

      {tab === "varieties" && <div className="space-y-4">
        {isAdmin && <Card><CardHeader><CardTitle>{l.addVariety}</CardTitle></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); if (varietyCode.trim().length >= 2 && varietyNameFr.trim().length >= 2) addVariety.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{l.varietyCode}<input required minLength={2} maxLength={20} value={varietyCode} onChange={(e) => setVarietyCode(e.target.value.toUpperCase())} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.varietyNameFr}<input required minLength={2} maxLength={100} value={varietyNameFr} onChange={(e) => setVarietyNameFr(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.varietyNameAr}<input maxLength={100} value={varietyNameAr} onChange={(e) => setVarietyNameAr(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" dir="rtl" /></label>
            <div className="md:col-span-3"><Button type="submit" disabled={addVariety.isPending || varietyCode.trim().length < 2 || varietyNameFr.trim().length < 2}>{l.addVariety}</Button></div>
          </form>
        </CardContent></Card>}
        <Card><CardHeader><CardTitle>{l.varietiesTab}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.varietyCode}</TableHead><TableHead>{l.varietyNameFr}</TableHead><TableHead>{l.varietyNameAr}</TableHead></TableRow></TableHeader><TableBody>{(varieties.data ?? []).map((v) => <TableRow key={v.id}><TableCell className="font-mono">{value(v.code)}</TableCell><TableCell className="font-semibold">{value(v.name_fr)}</TableCell><TableCell dir="rtl">{value(v.name_ar)}</TableCell></TableRow>)}{(!varieties.isLoading && !(varieties.data?.length)) && <EmptyRow colSpan={3} text={l.noRows} />}</TableBody></Table></CardContent></Card>
      </div>}

      {tab === "purchases" && <div className="space-y-4">
        {isAdmin && <Card><CardHeader><CardTitle>{l.newPurchase}</CardTitle><CardDescription>{l.bootstrapHint}</CardDescription></CardHeader><CardContent>
          {(suppliers.data?.length ?? 0) === 0 || (varieties.data?.length ?? 0) === 0 ? <p className="mb-3 text-sm text-amber-700">{(suppliers.data?.length ?? 0) === 0 ? l.noSuppliers : l.noVarieties}</p> : null}
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); createPurchase.mutate(); }}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">{l.supplier}<select required value={purchaseSupplierId} onChange={(e) => setPurchaseSupplierId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-medium">{l.purchaseDate}<input required type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            </div>
            <div className="space-y-3">
              {purchaseLines.map((line, index) => <div key={index} className="grid items-end gap-3 rounded-xl border p-3 md:grid-cols-[1.3fr_1fr_1fr_auto]">
                <label className="grid gap-1 text-sm font-medium">{l.variety}<select required value={line.variety_id} onChange={(e) => setPurchaseLines((rows) => rows.map((row, i) => i === index ? { ...row, variety_id: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(varieties.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.code} · {lang === "ar" ? (v.name_ar || v.name_fr) : v.name_fr}</option>)}</select></label>
                <label className="grid gap-1 text-sm font-medium">{l.quantity}<input required type="number" min="0.001" step="0.001" value={line.quantity_kg} onChange={(e) => setPurchaseLines((rows) => rows.map((row, i) => i === index ? { ...row, quantity_kg: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.unitPrice}<input required type="number" min="0" step="0.001" value={line.unit_price_dt} onChange={(e) => setPurchaseLines((rows) => rows.map((row, i) => i === index ? { ...row, unit_price_dt: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <Button type="button" variant="outline" disabled={purchaseLines.length === 1} onClick={() => setPurchaseLines((rows) => rows.filter((_, i) => i !== index))}>{l.removeLine}</Button>
              </div>)}
              <Button type="button" variant="outline" onClick={() => setPurchaseLines((rows) => [...rows, { variety_id: "", quantity_kg: "", unit_price_dt: "" }])}>{l.addLine}</Button>
            </div>
            <label className="grid gap-1 text-sm font-medium">{l.notes}<input maxLength={1000} value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <Button type="submit" disabled={createPurchase.isPending || !purchaseSupplierId || !(varieties.data?.length) || purchaseLines.some((line) => !line.variety_id || !(Number(line.quantity_kg) > 0) || !(Number(line.unit_price_dt) >= 0))}>{l.createDraft}</Button>
          </form>
        </CardContent></Card>}
        {isAdmin && <Card><CardHeader><CardTitle>{l.receivingLocation}</CardTitle></CardHeader><CardContent><select value={receivingLocationId} onChange={(e) => setReceivingLocationId(e.target.value)} className="h-10 w-full max-w-xl rounded-lg border bg-background px-3"><option value="">—</option>{(locations.data ?? []).map((loc) => <option key={loc.id} value={loc.id}>{loc.code} · {loc.name}</option>)}</select></CardContent></Card>}
        <Card><CardHeader><CardTitle>{l.purchasesTab}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.supplier}</TableHead><TableHead>{l.purchaseDate}</TableHead><TableHead>{l.totalQuantity}</TableHead><TableHead>{l.totalAmount}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader><TableBody>
          {(purchases.data ?? []).map((purchase) => <TableRow key={purchase.id}>
            <TableCell className="font-mono text-xs">{value(purchase.document_number)}</TableCell>
            <TableCell>{value((suppliers.data ?? []).find((s) => s.id === purchase.supplier_id)?.name, purchase.supplier_id)}</TableCell>
            <TableCell>{date(purchase.purchase_date)}</TableCell>
            <TableCell>{number(purchase.total_quantity_kg)}</TableCell>
            <TableCell>{number(purchase.total_amount_dt)}</TableCell>
            <TableCell>{purchase.status === "APPROVED" ? l.approved : l.draft}</TableCell>
            <TableCell>{isAdmin && purchase.status === "DRAFT" ? <Button size="sm" disabled={approvePurchase.isPending || !receivingLocationId} onClick={() => approvePurchase.mutate(purchase)}>{l.approve}</Button> : "—"}</TableCell>
          </TableRow>)}
          {(!purchases.isLoading && !(purchases.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}
        </TableBody></Table></CardContent></Card>
      </div>}

      {tab === "production" && <div className="space-y-4">
        {isAdmin && <Card>
          <CardHeader><CardTitle>{l.newProduction}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); completeProduction.mutate(); }}>
              <label className="grid max-w-sm gap-1 text-sm font-medium">{l.productionDate}
                <input required type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" />
              </label>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{l.inputLots}</h3><Button type="button" variant="outline" onClick={() => setProductionInputs((rows) => [...rows, { balance_key: "", quantity_kg: "" }])}>{l.addInput}</Button></div>
                {productionInputs.map((line, index) => {
                  const key = (lotId: string, locationId: string) => lotId + "::" + locationId;
                  const selectedBalance = availableOliveBalances.find((b) => key(b.lot_id, b.location_id) === line.balance_key);
                  const selectedLot = (lots.data ?? []).find((lot) => lot.id === selectedBalance?.lot_id);
                  const usedKeys = productionInputs.filter((_, i) => i !== index).map((row) => row.balance_key);
                  const otherOwners = productionInputs.filter((row, i) => i !== index && row.balance_key).map((row) => availableOliveBalances.find((b) => key(b.lot_id, b.location_id) === row.balance_key)?.owner);
                  return <div key={index} className="grid items-end gap-3 rounded-xl border p-3 md:grid-cols-[2fr_1fr_auto]">
                    <label className="grid gap-1 text-sm font-medium">{l.chooseOliveBalance}
                      <select required value={line.balance_key} onChange={(e) => setProductionInputs((rows) => rows.map((row, i) => i === index ? { ...row, balance_key: e.target.value, quantity_kg: "" } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal">
                        <option value="">—</option>
                        {availableOliveBalances.filter((b) => !usedKeys.includes(key(b.lot_id, b.location_id)) && (otherOwners.length === 0 || otherOwners.every((owner) => ownerIdentity(owner) === ownerIdentity(b.owner)))).map((balance) => {
                          const lot = (lots.data ?? []).find((item) => item.id === balance.lot_id);
                          const loc = (locations.data ?? []).find((item) => item.id === balance.location_id);
                          return <option key={key(balance.lot_id, balance.location_id)} value={key(balance.lot_id, balance.location_id)}>{lot?.document_number ?? balance.lot_id} · {loc?.code ?? balance.location_id} · {ownerLabel(balance.owner, l)} · {number(balance.quantity_kg)} kg</option>;
                        })}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium">{l.inputQuantity}
                      <input required type="number" min="0.001" step="0.001" max={selectedBalance?.quantity_kg ?? undefined} value={line.quantity_kg} disabled={!selectedBalance} onChange={(e) => setProductionInputs((rows) => rows.map((row, i) => i === index ? { ...row, quantity_kg: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal" />
                      {selectedBalance && <span className="text-xs text-muted-foreground">{l.quantity}: {number(selectedBalance.quantity_kg)} kg</span>}
                    </label>
                    <Button type="button" variant="outline" disabled={productionInputs.length === 1} onClick={() => setProductionInputs((rows) => rows.filter((_, i) => i !== index))}>{l.removeLine}</Button>
                    {selectedLot && <p className="text-xs text-muted-foreground md:col-span-3">{l.owner}: {ownerLabel(selectedLot.owner, l)}</p>}
                  </div>;
                })}
                {availableOliveBalances.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{l.noOliveStock}</p>}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-sm font-medium">{l.totalInput}
                  <input readOnly value={number(productionInputTotal)} className="h-10 rounded-lg border bg-muted px-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-medium">{l.outputQuantity}
                  <input required type="number" min="0.001" step="0.001" max={productionInputTotal || undefined} value={productionOutputKg} onChange={(e) => setProductionOutputKg(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" />
                </label>
                <label className="grid gap-1 text-sm font-medium">{l.extractionRate} (%)
                  <input readOnly value={productionInputTotal > 0 && Number(productionOutputKg) > 0 ? productionRate.toLocaleString(lang === "ar" ? "ar-TN" : "fr-FR", { maximumFractionDigits: 2 }) : "—"} className="h-10 rounded-lg border bg-muted px-3 font-normal" />
                </label>
              </div>
              <label className="grid max-w-xl gap-1 text-sm font-medium">{l.outputTank}
                <select required value={productionTankId} onChange={(e) => setProductionTankId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(tanks.data ?? []).filter((tank) => tank.active).map((tank) => <option key={tank.id} value={tank.id}>{tank.code} · {tank.name}</option>)}</select>
              </label>
              <label className="grid gap-1 text-sm font-medium">{l.notes}
                <input maxLength={1000} value={productionNotes} onChange={(e) => setProductionNotes(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" />
              </label>
              <Button type="submit" disabled={completeProduction.isPending || !productionTankId || !productionInputs.every((line) => line.balance_key && Number(line.quantity_kg) > 0) || !(Number(productionOutputKg) > 0) || Number(productionOutputKg) > productionInputTotal || productionInputs.some((line) => { const b = availableOliveBalances.find((x) => x.lot_id + "::" + x.location_id === line.balance_key); return !b || Number(line.quantity_kg) > Number(b.quantity_kg); })}>
                <Factory className="size-4" /> {l.completeProduction}
              </Button>
            </form>
          </CardContent>
        </Card>}
        <Card><CardHeader><CardTitle>{l.productionHistory}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.productionDate}</TableHead><TableHead>{l.owner}</TableHead><TableHead>{l.totalInput}</TableHead><TableHead>{l.outputQuantity}</TableHead><TableHead>{l.extractionRate} (%)</TableHead><TableHead>{l.outputTank}</TableHead></TableRow></TableHeader>
            <TableBody>{(productionRuns.data ?? []).map((run) => <TableRow key={run.id}>
              <TableCell className="font-mono text-xs">{value(run.document_number)}</TableCell>
              <TableCell>{date(run.production_date)}</TableCell>
              <TableCell>{ownerLabel(run.owner, l)}</TableCell>
              <TableCell>{number(run.total_olive_input_kg)}</TableCell>
              <TableCell>{number(run.actual_oil_output_kg)}</TableCell>
              <TableCell>{number(run.extraction_rate_percent)}</TableCell>
              <TableCell>{value((tanks.data ?? []).find((tank) => tank.id === run.output_tank_id)?.code, run.output_tank_id)}</TableCell>
            </TableRow>)}{(!productionRuns.isLoading && !(productionRuns.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody>
          </Table>
        </CardContent></Card>
      </div>}
    </div>
  );
}
