import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ClipboardList, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AuditEvent = {
  id: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  actor_user_id?: string;
  actor_name?: string;
  created_at?: string;
  details?: Record<string, unknown>;
};

const ACTION_LABELS: Record<string, { ar: string; fr: string }> = {
  TANK_CAPACITY_CHANGED: { ar: "تغيير سعة الخزان", fr: "Capacité de cuve modifiée" },
  TANK_ROLE_CHANGED: { ar: "تغيير تصنيف الخزان", fr: "Rôle de cuve modifié" },
  LOCATION_CREATED: { ar: "إنشاء موقع تخزين", fr: "Emplacement créé" },
  SUPPLIER_CREATED: { ar: "إضافة مورد", fr: "Fournisseur créé" },
  SUPPLIER_UPDATED: { ar: "تعديل بيانات مورد", fr: "Fournisseur modifié" },
  SUPPLIER_DEACTIVATED: { ar: "تعطيل مورد", fr: "Fournisseur désactivé" },
  BUYER_CREATED: { ar: "إضافة مشترٍ", fr: "Acheteur créé" },
  BUYER_UPDATED: { ar: "تعديل بيانات مشترٍ", fr: "Acheteur modifié" },
  BUYER_DEACTIVATED: { ar: "تعطيل مشترٍ", fr: "Acheteur désactivé" },
  BUYER_REACTIVATED: { ar: "إعادة تفعيل مشترٍ", fr: "Acheteur réactivé" },
  COMMERCIAL_PERMISSIONS_UPDATED: { ar: "تعديل صلاحيات تجارية", fr: "Droits commerciaux modifiés" },
  DRAFT_CREATED: { ar: "إنشاء مسودة شراء", fr: "Brouillon d’achat créé" },
  DRAFT_UPDATED: { ar: "تعديل مسودة شراء", fr: "Brouillon d’achat modifié" },
  APPROVED_AND_RECEIVED: { ar: "اعتماد الشراء واستلامه", fr: "Achat approuvé et reçu" },
  SALE_DRAFT_CREATED: { ar: "إنشاء مسودة بيع", fr: "Brouillon de vente créé" },
  SALE_APPROVED_AND_DISPATCHED: { ar: "اعتماد البيع وتسليم المخزون", fr: "Vente approuvée et stock expédié" },
  SALE_DRAFT_CANCELLED: { ar: "إلغاء مسودة بيع", fr: "Brouillon de vente annulé" },
  PAYMENT_RECORDED: { ar: "تسجيل دفعة", fr: "Paiement enregistré" },
  PAYMENT_REVERSED: { ar: "عكس دفعة", fr: "Paiement contrepassé" },
  BUYER_CREDIT_APPLIED_TO_INVOICE: { ar: "تطبيق رصيد على فاتورة", fr: "Crédit imputé à la facture" },
  POSTED: { ar: "ترحيل حركة مخزون", fr: "Mouvement de stock comptabilisé" },
  COMPLETED_AND_STOCK_POSTED: { ar: "إتمام الإنتاج وترحيل المخزون", fr: "Production terminée et stock comptabilisé" },
  CUSTOMER_OLIVES_RECEIVED_IN_CUSTODY: { ar: "استلام زيتون أمانة", fr: "Olives reçues en dépôt" },
  CUSTOMER_OWNED_OIL_RELEASED: { ar: "تسليم زيت مملوك للحريف", fr: "Huile du client remise" },
  SALE_RETURN_RECEIVED_IN_QUARANTINE: { ar: "استلام إرجاع في الحجر", fr: "Retour reçu en quarantaine" },
  SALE_RETURN_ACCEPTED_AND_CREDIT_NOTE_ISSUED: { ar: "قبول الإرجاع وإصدار إشعار دائن", fr: "Retour accepté et avoir émis" },
  SALE_RETURN_REJECTED_AND_DISPATCHED: { ar: "رفض الإرجاع وإعادة التسليم", fr: "Retour rejeté et réexpédié" },
  QUALITY_RESULTS_SUBMITTED: { ar: "تسجيل نتائج الجودة", fr: "Résultats qualité enregistrés" },
  QUALITY_ASSESSMENT_UPDATED: { ar: "تعديل تقييم الجودة", fr: "Évaluation qualité modifiée" },
  QUALITY_ASSESSMENT_DELETED: { ar: "حذف تقييم الجودة", fr: "Évaluation qualité supprimée" },
  LOAD_CREATED: { ar: "إنشاء استقبال", fr: "Réception créée" },
  LOAD_OIL_RECORDED: { ar: "تسجيل كمية الزيت", fr: "Quantité d’huile enregistrée" },
  LOAD_STATUS_UPDATED: { ar: "تغيير حالة الاستقبال", fr: "Statut de réception modifié" },
  LOAD_DELIVERED: { ar: "تسليم الاستقبال", fr: "Réception livrée" },
  LOAD_CANCELLED: { ar: "إلغاء الاستقبال", fr: "Réception annulée" },
  LOAD_DELETED: { ar: "حذف الاستقبال", fr: "Réception supprimée" },
  INVOICE_CREATED: { ar: "إنشاء فاتورة", fr: "Facture créée" },
  INVOICE_UPDATED: { ar: "تعديل فاتورة أو دفعة", fr: "Facture ou paiement modifié" },
  INVOICE_DELETED: { ar: "حذف فاتورة", fr: "Facture supprimée" },
  INVOICE_LEGACY_REPAIRED: { ar: "استكمال بيانات فاتورة قديمة", fr: "Ancienne facture régularisée" },
};

const ENTITY_LABELS: Record<string, { ar: string; fr: string }> = {
  commercial_supplier: { ar: "مورد", fr: "Fournisseur" },
  commercial_buyer: { ar: "مشتري", fr: "Acheteur" },
  commercial_purchase: { ar: "شراء زيتون", fr: "Achat d’olives" },
  commercial_sale: { ar: "عملية بيع", fr: "Vente" },
  commercial_sales_invoice: { ar: "فاتورة بيع", fr: "Facture de vente" },
  commercial_tank: { ar: "خزان", fr: "Cuve" },
  commercial_stock_movement: { ar: "حركة مخزون", fr: "Mouvement de stock" },
  commercial_production: { ar: "إنتاج", fr: "Production" },
  commercial_location: { ar: "موقع تخزين", fr: "Emplacement" },
  olive_purchase: { ar: "شراء زيتون", fr: "Achat d’olives" },
  stock_movement: { ar: "حركة مخزون", fr: "Mouvement de stock" },
  commercial_production_run: { ar: "عملية إنتاج", fr: "Lot de production" },
  customer_custody_receipt: { ar: "استلام زيتون أمانة", fr: "Réception d’olives en dépôt" },
  customer_custody_release: { ar: "تسليم زيت أمانة", fr: "Remise d’huile en dépôt" },
  commercial_payment_reversal: { ar: "عكس دفعة", fr: "Annulation de paiement" },
  commercial_buyer_credit_application: { ar: "تطبيق رصيد دائن", fr: "Imputation d’avoir acheteur" },
  commercial_sale_return: { ar: "إرجاع مبيعات", fr: "Retour de vente" },
  commercial_sale_return_rejection: { ar: "رفض إرجاع مبيعات", fr: "Rejet de retour de vente" },
  commercial_oil_lot: { ar: "دفعة زيت وجودة", fr: "Lot d’huile et qualité" },
  user: { ar: "مستخدم وصلاحيات", fr: "Utilisateur et droits" },
  traditional_load: { ar: "استقبال تقليدي", fr: "Réception traditionnelle" },
  traditional_invoice: { ar: "فاتورة تقليدية", fr: "Facture traditionnelle" },
};

export default function Audit() {
  const { lang } = useI18n();
  const me = useMe();
  const isArabic = lang === "ar";
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState("all");
  const labels = {
    title: isArabic ? "سجل التدقيق الإداري" : "Journal d’audit administratif",
    subtitle: isArabic
      ? "سجل للقراءة فقط يوثق التغييرات على المخزون والعمليات المالية والموردين والمشترين."
      : "Journal en lecture seule des changements de stock, opérations financières, fournisseurs et acheteurs.",
    search: isArabic ? "ابحث بالعملية أو المستند أو الموظف…" : "Rechercher une action, un document ou un employé…",
    date: isArabic ? "التاريخ والوقت" : "Date et heure",
    actor: isArabic ? "منفّذ العملية" : "Effectué par",
    action: isArabic ? "العملية" : "Action",
    entity: isArabic ? "نوع السجل" : "Type d’enregistrement",
    reference: isArabic ? "مرجع السجل" : "Référence",
    details: isArabic ? "تفاصيل التغيير" : "Détails du changement",
    all: isArabic ? "الكل" : "Tous",
    refresh: isArabic ? "تحديث" : "Actualiser",
    loading: isArabic ? "جار تحميل سجل التدقيق…" : "Chargement du journal…",
    empty: isArabic ? "لا توجد أحداث مطابقة." : "Aucun événement correspondant.",
    error: isArabic ? "تعذر تحميل السجل. تحقق من صلاحية الاطلاع على التدقيق." : "Impossible de charger le journal. Vérifiez le droit de consultation.",
    count: isArabic ? "عدد الأحداث المعروضة" : "Événements affichés",
    noDetails: isArabic ? "لا توجد تفاصيل إضافية" : "Aucun détail supplémentaire",
    denied: isArabic ? "هذا القسم مخصص للمستخدمين المخولين فقط." : "Cette section est réservée aux utilisateurs autorisés.",
  };
  const events = useInfiniteQuery({
    queryKey: ["commercial", "audit", "standalone", entity, action, search.trim()],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "200", skip: String(pageParam) });
      if (search.trim()) params.set("q", search.trim());
      if (entity !== "all") params.set("entity_type", entity);
      if (action !== "all") params.set("action", action);
      return apiGet<AuditEvent[]>(`/commercial/v1/audit-events?${params.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => lastPage.length === 200 ? lastPageParam + 200 : undefined,
    enabled: !!me.data,
    staleTime: 10_000,
  });
  const allEvents = useMemo(() => events.data?.pages.flat() ?? [], [events.data]);
  const entityOptions = useMemo(() => [...new Set([
    ...Object.keys(ENTITY_LABELS), ...allEvents.map((item) => item.entity_type).filter(Boolean) as string[],
  ])], [allEvents]);
  const actionOptions = useMemo(() => [...new Set([
    ...Object.keys(ACTION_LABELS), ...allEvents.map((item) => item.action).filter(Boolean) as string[],
  ])], [allEvents]);
  const filtered = allEvents;
  const formatDate = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(isArabic ? "ar-TN" : "fr-FR");
  };
  const entityName = (value?: string) => value ? (ENTITY_LABELS[value]?.[isArabic ? "ar" : "fr"] ?? value) : "—";
  const actionName = (value?: string) => value ? (ACTION_LABELS[value]?.[isArabic ? "ar" : "fr"] ?? value) : "—";

  return (
    <div className="mx-auto max-w-7xl space-y-6" dir={isArabic ? "rtl" : "ltr"} data-testid="admin-audit-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-emerald-800"><ClipboardList className="size-6" /><span className="text-sm font-semibold">{isArabic ? "الرقابة والمساءلة" : "Contrôle et traçabilité"}</span></div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">{labels.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-stone-500 md:text-base">{labels.subtitle}</p>
        </div>
        <Button variant="outline" onClick={() => void events.refetch()} disabled={events.isFetching}>
          <RefreshCw className={`size-4 ${events.isFetching ? "animate-spin" : ""}`} /> {labels.refresh}
        </Button>
      </div>

      {events.isError && <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><ShieldAlert className="size-5 shrink-0" /><p className="text-sm">{labels.error}</p></div>}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{labels.title}</CardTitle>
          <CardDescription>{labels.count}: {filtered.length.toLocaleString(isArabic ? "ar-TN" : "fr-FR")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(170px,220px)_minmax(170px,220px)]">
            <label className="relative grid gap-1 text-sm font-medium">
              <span>{isArabic ? "بحث" : "Recherche"}</span>
              <Search className="absolute end-3 top-9 size-4 text-muted-foreground" />
              <input value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} placeholder={labels.search} className="h-10 rounded-lg border bg-background px-3 pe-9 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-medium">{labels.entity}
              <select value={entity} onChange={(event) => setEntity(event.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal">
                <option value="all">{labels.all}</option>
                {entityOptions.map((value) => <option key={value} value={value}>{entityName(value)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">{labels.action}
              <select value={action} onChange={(event) => setAction(event.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal">
                <option value="all">{labels.all}</option>
                {actionOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{labels.date}</TableHead><TableHead>{labels.actor}</TableHead><TableHead>{labels.action}</TableHead><TableHead>{labels.entity}</TableHead><TableHead>{labels.reference}</TableHead><TableHead>{labels.details}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((item) => <TableRow key={item.id}>
                  <TableCell className="min-w-44 whitespace-nowrap text-xs">{formatDate(item.created_at)}</TableCell>
                  <TableCell className="min-w-36 font-medium">{item.actor_name || item.actor_user_id || "system"}</TableCell>
                  <TableCell className="min-w-48 font-semibold">{actionName(item.action)}</TableCell>
                  <TableCell className="min-w-32">{entityName(item.entity_type)}</TableCell>
                  <TableCell className="min-w-36 font-mono text-xs">{item.entity_id || "—"}</TableCell>
                  <TableCell className="min-w-64">
                    {item.details && Object.keys(item.details).length > 0
                      ? <details className="max-w-md"><summary className="cursor-pointer text-sm font-medium text-emerald-800">{isArabic ? "عرض التفاصيل" : "Afficher"}</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs">{JSON.stringify(item.details, null, 2)}</pre></details>
                      : <span className="text-sm text-muted-foreground">{labels.noDetails}</span>}
                  </TableCell>
                </TableRow>)}
                {!events.isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{labels.empty}</TableCell></TableRow>}
                {events.isLoading && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{labels.loading}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          {events.hasNextPage && <div className="flex justify-center"><Button type="button" variant="outline" onClick={() => void events.fetchNextPage()} disabled={events.isFetchingNextPage}>{events.isFetchingNextPage ? (isArabic ? "جار التحميل…" : "Chargement…") : (isArabic ? "تحميل أحداث أقدم" : "Charger les événements précédents")}</Button></div>}
          <p className="text-xs text-muted-foreground">{isArabic ? "السجل للعرض فقط. لا توجد أزرار لتعديل أو حذف أحداث التدقيق." : "Journal en consultation seule. Aucune action de modification ou de suppression n’est disponible."}</p>
        </CardContent>
      </Card>
    </div>
  );
}
