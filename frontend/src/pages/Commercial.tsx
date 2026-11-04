import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, Beaker, Boxes, ClipboardList, Factory,
  RefreshCw, ShieldCheck, Warehouse, ShoppingCart, UserRound, Wallet, Pencil, UserX, UserCheck, X, Ban, Trash2,
  Truck, ShoppingBasket, MapPin, ArrowLeftRight, Handshake, Home,
} from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
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
type TabKey = "overview" | "tanks" | "lots" | "movements" | "quality" | "suppliers" | "locations" | "purchases" | "production" | "custody" | "transfers" | "buyers" | "sales" | "permissions";

const labels = {
  fr: {
    permissionsTab: "Droits des employés", chooseWorker: "Choisir un employé", labPermission: "Saisie des analyses laboratoire", reviewerPermission: "Validation indépendante de la qualité", auditPermission: "Consultation du journal d’audit", savePermissions: "Enregistrer les autorisations", permissionsSaved: "Autorisations mises à jour", noWorkers: "Aucun compte employé actif.",
    labEntry: "Analyse de l’olive", oilAnalysis: "Analyse de l’huile", acidity: "Acidité", peroxide: "Indice de peroxyde", k232: "K232", k270: "K270", oilContent: "Teneur en huile (%)", classification: "Classification", autoClassification: "Automatique", extraVirgin: "Extra vierge", virgin: "Vierge", lampante: "Lampante", oilType: "Type d’huile", analysisNotes: "Observations", viewCertificate: "Certificat", laboratoryTab: "Laboratoire", sampleReference: "Référence de l’échantillon", sampleDate: "Date de prélèvement", testedDate: "Date d’analyse", laboratory: "Laboratoire", specification: "Référence de la norme", measurementCode: "Paramètre", measurementValue: "Résultat", measurementUnit: "Unité", addMeasurement: "Ajouter un paramètre", submitAssessment: "Soumettre les résultats", assessmentSaved: "Résultats transmis pour revue indépendante", assessmentList: "Analyses enregistrées", reviewerPanel: "Décision indépendante", chooseAssessment: "Analyse à examiner", decision: "Décision", releaseOil: "Accepter le lot", rejectOil: "Refuser le lot", decisionReason: "Justification de la décision (10 caractères minimum)", decisionSaved: "Décision qualité enregistrée", noAssessment: "Aucune analyse en attente de revue", noLabPermission: "Vous ne disposez pas de la permission de saisie laboratoire.", noReviewPermission: "Vous ne disposez pas de la permission de validation qualité.", awaitingReview: "En attente de revue", reviewed: "Examinée", submitter: "Analyste", reviewer: "Réviseur", qualityLot: "Lot d’huile",
    productionTab: "Production", newProduction: "Nouvelle production", productionDate: "Date de production", inputLots: "Lots d’olives consommés", chooseOliveBalance: "Lot · emplacement · propriétaire", inputQuantity: "Quantité consommée (kg)", outputQuantity: "Huile réellement obtenue (kg)", outputTank: "Cuve de réception", extractionRate: "Rendement réel", completeProduction: "Enregistrer la production", productionSaved: "Production enregistrée et stock mis à jour", productionHistory: "Historique de production", ownerMill: "Maâsra", ownerCustomer: "Client", addInput: "Ajouter un lot", totalInput: "Total olives consommées (kg)", noOliveStock: "Aucun stock d’olives disponible pour la production.", selectTank: "Sélectionnez une cuve.",
    actions: "Actions",
    title: "Gestion commerciale",
    subtitle: "Stocks, lots, production et contrôle qualité, indépendamment des opérations de trituration.",
    overview: "Vue générale", tanks: "Cuves", lots: "Lots", movements: "Mouvements", quality: "Qualité", audit: "Audit",
    season: "Saison active", tanksCount: "Cuves configurées", locations: "Emplacements actifs",
    counters: "Compteurs de documents", readiness: "État du module", ready: "Prêt après initialisation",
    notReady: "Initialisation requise", bootstrap: "Initialiser le module commercial", bootstrapping: "Initialisation…",
    bootstrapHint: "Cette action crée les neuf cuves et les compteurs de la saison. Elle ne crée aucun stock et ne modifie pas les données de trituration.",
    bootstrapSuccess: "Module commercial initialisé", bootstrapError: "Impossible d'initialiser le module commercial",
    tank: "Cuve", capacity: "Capacité max. (kg)", flexible: "Flexible — capacité non définie", active: "Active", saveCapacity: "Enregistrer", clearCapacity: "Vide = flexible", capacitySaved: "Capacité de la cuve mise à jour", capacityError: "Impossible de modifier la capacité",
    product: "Produit", document: "Document", owner: "Propriétaire actuel", quantity: "Quantité (kg)", currentStock: "Stock actuel (kg)",
    status: "État", qualityStatus: "Contrôle qualité", created: "Créé le", location: "Emplacement",
    source: "Origine", destination: "Destination", movement: "Mouvement", internalMovementsTab: "Transferts", internalMovementTitle: "Nouveau transfert interne", movementType: "Type de mouvement", transferType: "Transfert entre emplacements", ownershipTransferType: "Changement de propriétaire", productKind: "Produit concerné", sourceBalance: "Stock source disponible", targetLocation: "Emplacement de destination", targetOwner: "Nouveau propriétaire", targetCustomer: "Client propriétaire", movementReason: "Motif du mouvement", postInternalMovement: "Valider le mouvement", internalMovementSaved: "Mouvement interne enregistré", internalMovementHistory: "Historique des transferts internes", noAvailableBalance: "Aucun stock disponible pour ce type de mouvement.", noRows: "Aucune donnée à afficher",
    refresh: "Actualiser", adminOnly: "Initialisation réservée à l'administrateur",
    olive: "Olives", oil: "Huile", mill: "Maâsra", customer: "Client",
    pending: "En attente", released: "Libéré", rejected: "Rejeté", open: "Ouvert", closed: "Fermé",
    awaiting: "En attente de revue", unknown: "—", noPermission: "Accès en lecture seule selon vos autorisations.",
    qualityRule: "Un lot d'huile reste bloqué tant qu'un réviseur indépendant n'a pas approuvé son analyse.",
    warning: "Le module commercial n'est pas encore initialisé dans la base de données.",
    varietiesTab: "Variétés d’olives", varietiesManaged: "Les variétés sont gérées dans Paramètres → Tarif. Cette liste est synchronisée automatiquement.", varietyCode: "Code variété", varietyNameFr: "Nom en français", varietyNameAr: "Nom en arabe", addVariety: "Ajouter une variété", varietySaved: "Variété ajoutée",     purchasesTab: "Achats d’olives", newPurchase: "Nouvel achat", editPurchase: "Modifier l’achat", updateDraft: "Enregistrer les modifications", cancelEdit: "Annuler la modification", purchaseDate: "Date d’achat", supplier: "Fournisseur", variety: "Variété", unitPrice: "Prix unitaire (DT/kg)", addLine: "Ajouter une ligne", removeLine: "Retirer", createDraft: "Créer le brouillon", purchaseCreated: "Brouillon d’achat créé", approve: "Approuver et réceptionner", receivingLocation: "Emplacement de réception", totalAmount: "Montant total (DT)", totalQuantity: "Quantité totale (kg)", draft: "Brouillon", approved: "Approuvé", noSuppliers: "Créez d’abord un fournisseur.", noVarieties: "Créez d’abord les variétés commerciales.",     suppliers: "Fournisseurs", locationsTab: "Emplacements", supplierName: "Nom du fournisseur", supplierPhone: "Téléphone", taxId: "Identifiant fiscal", addSupplier: "Ajouter le fournisseur", supplierSaved: "Fournisseur ajouté", editSupplier: "Modifier le fournisseur", saveSupplierChanges: "Enregistrer les modifications", cancelSupplierEdit: "Annuler", supplierUpdated: "Fournisseur modifié", deleteSupplier: "Supprimer", confirmDeleteSupplier: "Confirmer la suppression de ce fournisseur ? Il sera retiré des nouveaux achats, mais ses anciennes opérations seront conservées.", supplierDeleted: "Fournisseur supprimé", locationCode: "Code", locationName: "Nom de l’emplacement", locationType: "Type", oliveStorage: "Stockage olives", staging: "Zone de préparation", addLocation: "Ajouter l’emplacement", locationSaved: "Emplacement ajouté", custodyTab: "Garde des clients", custodyReceiptTitle: "Réception d’olives appartenant au client", custodyReleaseTitle: "Restitution d’huile au propriétaire", custodyCustomer: "Client propriétaire", custodyDate: "Date", custodyVariety: "Variété", custodyQuantity: "Quantité (kg)", custodyLocation: "Emplacement de réception", custodyAck: "Référence de l’accusé client", custodySource: "Référence source (facultative)", custodyReason: "Motif de restitution", receiveCustody: "Enregistrer la réception en garde", releaseCustody: "Restituer l’huile au client", custodyReceipts: "Historique des réceptions en garde", custodyReleases: "Historique des restitutions", custodyOilLot: "Lot d’huile", custodySourceTank: "Cuve de sortie", noCustodyClients: "Aucun client enregistré. Ajoutez d’abord le client dans le carnet.", noCustomerOil: "Aucun lot d’huile de ce client n’est disponible dans une cuve normale après validation qualité.", custodyReceiptNote: "Cette réception enregistre des olives appartenant au client. Elle ne crée ni achat ni dette fournisseur.", custodyReleaseNote: "La restitution n’est pas une vente et ne génère aucune facture.", custodyStatementTitle: "État de garde du client", custodyMovement: "Mouvement", custodyProduct: "Produit", custodyDelta: "Variation", custodyBalance: "Solde après mouvement", custodyRecordedAt: "Date d’enregistrement", selectCustodyOwner: "Choisir le propriétaire pour consulter son état",notes: "Notes",
  },
  ar: {
    permissionsTab: "صلاحيات العمال", chooseWorker: "اختيار العامل", labPermission: "تسجيل التحاليل المخبرية", reviewerPermission: "المراجعة المستقلة للجودة", auditPermission: "الاطلاع على سجل التدقيق", savePermissions: "حفظ الصلاحيات", permissionsSaved: "تم تحديث الصلاحيات", noWorkers: "لا توجد حسابات عمال نشطة.",
    labEntry: "تحليل الزيتون", oilAnalysis: "تحليل الزيت", acidity: "الحموضة", peroxide: "مؤشر البيروكسيد", k232: "K232", k270: "K270", oilContent: "نسبة الزيت (%)", classification: "التصنيف", autoClassification: "آلي", extraVirgin: "بكر ممتاز", virgin: "بكر", lampante: "لامبانتي", oilType: "نوع الزيت", analysisNotes: "ملاحظات", viewCertificate: "شهادة التحليل", laboratoryTab: "المخبر", sampleReference: "مرجع العينة", sampleDate: "تاريخ أخذ العينة", testedDate: "تاريخ التحليل", laboratory: "المخبر", specification: "مرجع المواصفة", measurementCode: "المعيار", measurementValue: "النتيجة", measurementUnit: "الوحدة", addMeasurement: "إضافة معيار", submitAssessment: "إرسال النتائج", assessmentSaved: "تم إرسال النتائج للمراجعة المستقلة", assessmentList: "التحاليل المسجلة", reviewerPanel: "قرار الجودة المستقل", chooseAssessment: "التحليل المطلوب مراجعته", decision: "القرار", releaseOil: "قبول الدفعة", rejectOil: "رفض الدفعة", decisionReason: "تعليل القرار (10 أحرف على الأقل)", decisionSaved: "تم تسجيل قرار الجودة", noAssessment: "لا توجد تحاليل تنتظر المراجعة", noLabPermission: "ليست لديك صلاحية تسجيل التحاليل.", noReviewPermission: "ليست لديك صلاحية اعتماد الجودة.", awaitingReview: "في انتظار المراجعة", reviewed: "تمت المراجعة", submitter: "المحلل", reviewer: "المراجع", qualityLot: "دفعة الزيت",
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
    tank: "الخزان", capacity: "السعة القصوى (كغ)", flexible: "مرنة — دون سعة محددة", active: "نشط", saveCapacity: "حفظ", clearCapacity: "اتركه فارغاً للسعة المرنة", capacitySaved: "تم تحديث سعة الخزان", capacityError: "تعذر تعديل سعة الخزان",
    product: "المنتج", document: "الوثيقة", owner: "المالك الحالي", quantity: "الكمية (كغ)", currentStock: "الرصيد الحالي (كغ)",
    status: "الحالة", qualityStatus: "حالة الجودة", created: "تاريخ الإنشاء", location: "الموقع",
    source: "المصدر", destination: "الوجهة", movement: "الحركة", internalMovementsTab: "التحويلات", internalMovementTitle: "تسجيل تحويل داخلي", movementType: "نوع الحركة", transferType: "تحويل بين المواقع", ownershipTransferType: "تغيير المالك", productKind: "نوع المنتج", sourceBalance: "المخزون المصدر المتاح", targetLocation: "موقع الوجهة", targetOwner: "المالك الجديد", targetCustomer: "الحريف المالك", movementReason: "سبب الحركة", postInternalMovement: "تأكيد الحركة", internalMovementSaved: "تم تسجيل التحويل الداخلي", internalMovementHistory: "سجل التحويلات الداخلية", noAvailableBalance: "لا يوجد مخزون متاح لهذا النوع من الحركات.", noRows: "لا توجد بيانات للعرض",
    refresh: "تحديث", adminOnly: "التهيئة متاحة للمدير فقط",
    olive: "زيتون", oil: "زيت", mill: "المعصرة", customer: "الحريف",
    pending: "في الانتظار", released: "مقبول", rejected: "مرفوض", open: "مفتوح", closed: "مغلق",
    awaiting: "في انتظار المراجعة", unknown: "—", noPermission: "صلاحية العرض فقط حسب أذونات حسابك.",
    qualityRule: "تبقى دفعة الزيت غير متاحة للبيع حتى يعتمد محلل مستقل نتائج التحليل.",
    warning: "لم تتم تهيئة الوحدة التجارية في قاعدة البيانات بعد.",
    varietiesTab: "أصناف الزيتون", varietiesManaged: "تتم إدارة الأصناف من الإعدادات ← التعريفة، وتُزامَن هذه القائمة تلقائياً.", varietyCode: "رمز الصنف", varietyNameFr: "الاسم بالفرنسية", varietyNameAr: "الاسم بالعربية", addVariety: "إضافة صنف", varietySaved: "تمت إضافة الصنف",     purchasesTab: "شراء الزيتون", newPurchase: "شراء جديد", editPurchase: "تعديل الشراء", updateDraft: "حفظ التعديلات", cancelEdit: "إلغاء التعديل", purchaseDate: "تاريخ الشراء", supplier: "المزوّد", variety: "الصنف", unitPrice: "السعر للوحدة (د.ت/كغ)", addLine: "إضافة سطر", removeLine: "حذف السطر", createDraft: "إنشاء مسودة", purchaseCreated: "تم إنشاء مسودة الشراء", approve: "اعتماد واستلام", receivingLocation: "موقع الاستلام", totalAmount: "المبلغ الجملي (د.ت)", totalQuantity: "الكمية الجملية (كغ)", draft: "مسودة", approved: "معتمد", noSuppliers: "أنشئ مزوّداً أولاً.", noVarieties: "أنشئ أصناف الزيتون التجارية أولاً.",     suppliers: "المزوّدون", locationsTab: "مواقع التخزين", supplierName: "اسم المزوّد", supplierPhone: "الهاتف", taxId: "المعرّف الجبائي", addSupplier: "إضافة المزوّد", supplierSaved: "تمت إضافة المزوّد", editSupplier: "تعديل بيانات المزوّد", saveSupplierChanges: "حفظ التعديلات", cancelSupplierEdit: "إلغاء", supplierUpdated: "تم تعديل بيانات المزوّد", deleteSupplier: "حذف", confirmDeleteSupplier: "هل تؤكد حذف هذا المزوّد؟ سيُمنع من عمليات الشراء الجديدة مع الحفاظ على عملياته السابقة.", supplierDeleted: "تم حذف المزوّد", locationCode: "الرمز", locationName: "اسم الموقع", locationType: "النوع", oliveStorage: "مخزن الزيتون", staging: "منطقة التحضير", addLocation: "إضافة الموقع", locationSaved: "تمت إضافة الموقع", custodyTab: "أمانة الحرفاء", custodyReceiptTitle: "استلام زيتون مملوك للحريف", custodyReleaseTitle: "إرجاع الزيت إلى مالكه", custodyCustomer: "الحريف المالك", custodyDate: "التاريخ", custodyVariety: "الصنف", custodyQuantity: "الكمية (كغ)", custodyLocation: "مكان الاستلام", custodyAck: "مرجع وصل إقرار الحريف", custodySource: "مرجع المصدر (اختياري)", custodyReason: "سبب التسليم", receiveCustody: "تسجيل استلام الأمانة", releaseCustody: "تسليم الزيت إلى الحريف", custodyReceipts: "سجل استلام الأمانة", custodyReleases: "سجل تسليم الزيت", custodyOilLot: "دفعة الزيت", custodySourceTank: "الخزان المصدر", noCustodyClients: "لا يوجد حرفاء مسجلون. أضف الحريف أولاً إلى دفتر الحرفاء.", noCustomerOil: "لا توجد دفعة زيت مملوكة لهذا الحريف ومتاحة في خزان عادي بعد المصادقة على الجودة.", custodyReceiptNote: "هذا الإجراء يسجل زيتوناً مملوكاً للحريف ولا ينشئ عملية شراء أو ديناً للمزوّد.", custodyReleaseNote: "تسليم الزيت ليس عملية بيع ولا ينشئ فاتورة.", custodyStatementTitle: "كشف أمانة الحريف", custodyMovement: "الحركة", custodyProduct: "المنتج", custodyDelta: "التغيير", custodyBalance: "الرصيد بعد الحركة", custodyRecordedAt: "تاريخ التسجيل", selectCustodyOwner: "اختر المالك لعرض كشف الأمانة",notes: "ملاحظات",
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
async function apiGetAllPages<T>(path: string, pageSize: number): Promise<T[]> {
  const rows: T[] = [];
  for (let skip = 0, page = 0; page <= 100; skip += pageSize, page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const chunk = await apiGet<T[]>(`${path}${separator}limit=${pageSize}&skip=${skip}`);
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
  throw new Error("Commercial list exceeded the safe pagination limit; narrow the list before continuing.");
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">{text}</TableCell></TableRow>;
}

export default function Commercial() {
  const { lang } = useI18n();
  const l = labels[lang === "ar" ? "ar" : "fr"];
  const salesText = lang === "ar" ? {
    buyers: "الحرفاء التجاريون", account: "الحساب التجاري", accountInvoices: "عدد الفواتير", grossTotal: "إجمالي الفواتير", creditNotesTotal: "الإشعارات الدائنة", netReceivable: "الصافي المستحق", buyerCreditBalance: "رصيد الحريف الدائن", buyerName: "اسم الحريف", buyerContact: "اسم المسؤول",
    buyerPhone: "الهاتف", buyerTax: "المعرّف الجبائي", buyerAddress: "العنوان",
    addBuyer: "إضافة حريف", buyerSaved: "تم تسجيل الحريف", buyerEmail: "البريد الإلكتروني",
    editBuyer: "تعديل الحريف", saveBuyer: "حفظ التعديلات", cancelEdit: "إلغاء",
    activeBuyer: "نشط", inactiveBuyer: "معطّل", deactivateBuyer: "تعطيل", reactivateBuyer: "إعادة التفعيل",
    sales: "البيع بالجملة",
    saleDate: "تاريخ البيع", selectBuyer: "اختر الحريف", selectOilLot: "دفعة الزيت",
    selectTank: "الخزان", saleQty: "الكمية المباعة (كغ)", salePrice: "سعر الكغ (د.ت)",
    createSale: "إنشاء مسودة بيع", saleSaved: "تم إنشاء مسودة البيع",
    approveSale: "اعتماد البيع وإخراج الكمية", saleApproved: "تم اعتماد البيع وإصدار الفاتورة",
    saleHistory: "سجل عمليات البيع", invoice: "الفاتورة", invoiceNo: "رقم الفاتورة",
    paymentStatus: "حالة التسوية", unpaid: "غير مسددة", partial: "تسوية جزئية", paid: "مسددة", appliedCredit: "رصيد مطبق", settledAmount: "إجمالي المسدد", applyCredit: "تطبيق رصيد الحريف", creditAvailable: "الرصيد الدائن المتاح", creditAmount: "المبلغ المراد تطبيقه (د.ت)", creditReason: "سبب التطبيق", creditApplied: "تم تطبيق الرصيد الدائن", creditApplicationHistory: "سجل تطبيق الأرصدة الدائنة", creditApplicationNumber: "رقم تطبيق الرصيد", creditApplyConfirm: "هل تؤكد خصم هذا الرصيد الدائن من حساب الحريف وتسوية الفاتورة بهذا المبلغ؟ لن يُسجّل ذلك كخلاص نقدي.", reversePayment: "عكس الخلاص", reverseAmount: "المبلغ المراد عكسه (د.ت)", reverseReason: "سبب عكس الخلاص", reverseConfirm: "هل تؤكد عكس هذا الخلاص؟ سيتم تسجيل وثيقة REV مستقلة ولن يتم حذف وثيقة PAY الأصلية.", reversalHistory: "سجل عمليات عكس الخلاص", reversalNumber: "رقم وثيقة العكس", remainingReversible: "المبلغ القابل للعكس", selectPayment: "اختر عملية الخلاص أولاً", reversalSaved: "تم تسجيل عكس الخلاص", reversalDate: "تاريخ العكس", reversalEvidence: "مرجع إثبات العكس",
    taxNotice: "المعالجة الجبائية غير مضبوطة بعد؛ هذه فاتورة تجارية داخلية وليست فاتورة جبائية جاهزة.",
    chooseInvoice: "اختر الفاتورة", paymentAmount: "مبلغ الخلاص (د.ت)",
    paymentMethod: "طريقة الخلاص", paymentDate: "تاريخ الخلاص", recordPayment: "تسجيل الخلاص",
    paymentSaved: "تم تسجيل الخلاص", cash: "نقداً", bank: "تحويل بنكي", cheque: "صك",
    outstanding: "الباقي", total: "المجموع", paidAmount: "المبلغ المدفوع",
    saleCancelled: "تم إلغاء مسودة البيع", returnIntake: "تسجيل مرتجع زيت", returnWarning: "سيبقى الزيت المرتجع في الحجر وغير قابل للبيع إلى حين إعادة التحليل والاعتماد.", returnConfirm: "تأكيد استلام الكمية في خزان الحجر؟ سيُسجّل ذلك كمرتجع فعلي.", returnSale: "عملية البيع الأصلية", returnQty: "الكمية المرتجعة (كغ)", quarantineTank: "خزان الحجر", returnReason: "سبب الإرجاع", returnSaved: "تم استلام المرتجع في خزان الحجر", returnHistory: "سجل المرتجعات", acceptReturn: "قبول المرتجع وإصدار إشعار دائن", returnAccepted: "تم قبول المرتجع وإصدار الإشعار الدائن", returnAcceptancePrompt: "اذكر سبب القبول التجاري (5 أحرف على الأقل):", returnRejection: "وثيقة رفض المرتجع", rejectReturn: "رفض المرتجع وإعادته للحريف", returnRejected: "تم رفض المرتجع وإرجاع الزيت للحريف", returnRejectionReason: "سبب الرفض (5 أحرف على الأقل):", buyerReceiptReference: "مرجع استلام الحريف", rejectReturnConfirm: "هل تؤكد رفض المرتجع وإخراج كامل الكمية من خزان الحجر؟ لن يصدر إشعار دائن أو استرجاع نقدي.", creditNote: "الإشعار الدائن", netTotal: "الصافي بعد الإشعارات", credited: "مغطاة بإشعار دائن", creditedAmount: "المبلغ الدائن", noQuarantineTank: "يجب تعيين خزان فارغ للحجر أولاً من تبويب الخزانات.", remainingReturnable: "الكمية المتبقية للإرجاع", ackRef: "مرجع إقرار الحريف", cancelSalePrompt: "اذكر سبب إلغاء مسودة البيع (5 أحرف على الأقل):", cancelSale: "إلغاء المسودة",
    noEligibleOil: "لا توجد دفعات زيت مملوكة للمعصرة ومصادق عليها ومتوفرة للبيع.",
  } : {
    buyers: "Acheteurs", account: "Compte commercial", accountInvoices: "Nombre de factures", grossTotal: "Total brut facturé", creditNotesTotal: "Avoirs", netReceivable: "Net à recevoir", buyerCreditBalance: "Crédit de l’acheteur", buyerName: "Nom de l’acheteur", buyerContact: "Contact",
    buyerPhone: "Téléphone", buyerTax: "Identifiant fiscal", buyerAddress: "Adresse",
    addBuyer: "Ajouter l’acheteur", buyerSaved: "Acheteur enregistré", buyerEmail: "E-mail",
    editBuyer: "Modifier l’acheteur", saveBuyer: "Enregistrer les modifications", cancelEdit: "Annuler",
    activeBuyer: "Actif", inactiveBuyer: "Désactivé", deactivateBuyer: "Désactiver", reactivateBuyer: "Réactiver",
    sales: "Vente en gros",
    saleDate: "Date de vente", selectBuyer: "Choisir l’acheteur", selectOilLot: "Lot d’huile",
    selectTank: "Cuve", saleQty: "Quantité vendue (kg)", salePrice: "Prix/kg (DT)",
    createSale: "Créer le brouillon", saleSaved: "Brouillon de vente créé",
    approveSale: "Valider et expédier", saleApproved: "Vente validée et facture créée",
    saleHistory: "Historique des ventes", invoice: "Facture", invoiceNo: "N° facture",
    paymentStatus: "Statut du règlement", unpaid: "Non réglée", partial: "Partiellement réglée", paid: "Réglée", appliedCredit: "Crédit appliqué", settledAmount: "Total réglé", applyCredit: "Appliquer le crédit acheteur", creditAvailable: "Crédit disponible", creditAmount: "Montant à appliquer (DT)", creditReason: "Motif de l’application", creditApplied: "Crédit acheteur appliqué", creditApplicationHistory: "Historique des applications de crédit", creditApplicationNumber: "N° application de crédit", creditApplyConfirm: "Confirmer l’application de ce crédit au solde de la facture ? Cette opération réduit le crédit disponible et n’est pas un paiement en espèces.", reversePayment: "Contrepasser le paiement", reverseAmount: "Montant à contrepasser (DT)", reverseReason: "Motif de contrepassation", reverseConfirm: "Confirmer la contrepassation ? Un document REV sera créé et le document PAY original restera intact.", reversalHistory: "Historique des contrepassations", reversalNumber: "N° de contrepassation", remainingReversible: "Montant encore réversible", selectPayment: "Sélectionnez d’abord un paiement", reversalSaved: "Contrepassation enregistrée", reversalDate: "Date de contrepassation", reversalEvidence: "Référence justificative",
    taxNotice: "Traitement fiscal non configuré : document commercial interne, pas encore une facture fiscale prête à émettre.",
    chooseInvoice: "Choisir la facture", paymentAmount: "Montant reçu (DT)",
    paymentMethod: "Mode de paiement", paymentDate: "Date du paiement", recordPayment: "Enregistrer le paiement",
    paymentSaved: "Paiement enregistré", cash: "Espèces", bank: "Virement", cheque: "Chèque",
    outstanding: "Solde dû", total: "Total", paidAmount: "Payé",
    saleCancelled: "Brouillon de vente annulé", returnIntake: "Réception d’un retour d’huile", returnWarning: "L’huile retournée reste en quarantaine et ne peut être vendue avant une nouvelle analyse et validation.", returnConfirm: "Confirmer la réception physique du retour dans la cuve de quarantaine ?", returnSale: "Vente d’origine", returnQty: "Quantité retournée (kg)", quarantineTank: "Cuve de quarantaine", returnReason: "Motif du retour", returnSaved: "Retour reçu en quarantaine", returnHistory: "Historique des retours", acceptReturn: "Accepter le retour et émettre l’avoir", returnAccepted: "Retour accepté et avoir émis", returnAcceptancePrompt: "Motif de l’acceptation commerciale (5 caractères minimum) :", returnRejection: "Document de rejet", rejectReturn: "Refuser le retour et le réexpédier à l’acheteur", returnRejected: "Retour refusé et huile réexpédiée à l’acheteur", returnRejectionReason: "Motif du rejet (5 caractères minimum) :", buyerReceiptReference: "Référence de réception par l’acheteur", rejectReturnConfirm: "Confirmer le rejet et la sortie de toute la quantité de la cuve de quarantaine ? Aucun avoir ni remboursement ne sera émis.", creditNote: "Avoir", netTotal: "Net après avoirs", credited: "Soldée par avoir", creditedAmount: "Montant crédité", noQuarantineTank: "Désignez d’abord une cuve vide comme quarantaine dans l’onglet Cuves.", remainingReturnable: "Quantité encore retournable", ackRef: "Référence d’accusé de l’acheteur", cancelSalePrompt: "Motif de l’annulation (5 caractères minimum) :", cancelSale: "Annuler le brouillon",
    noEligibleOil: "Aucun lot d’huile libéré, appartenant à la maâsra et disponible à la vente.",
  };
  const me = useMe();
  const navigate = useNavigate();
  const isAdmin = me.data?.role === "admin";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("overview");
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierTaxId, setSupplierTaxId] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [editingSupplier, setEditingSupplier] = useState<AnyRecord | null>(null);
  const [tankCapacityDrafts, setTankCapacityDrafts] = useState<Record<string, string>>({});
  const [locationCode, setLocationCode] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationKind, setLocationKind] = useState<"OLIVE_STORAGE" | "STAGING">("OLIVE_STORAGE");
  const [locationNotes, setLocationNotes] = useState("");
  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [editingPurchase, setEditingPurchase] = useState<AnyRecord | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseLines, setPurchaseLines] = useState([{ variety_id: "", quantity_kg: "", unit_price_dt: "" }]);
  const [receivingLocationId, setReceivingLocationId] = useState("");
  const [productionDate, setProductionDate] = useState(new Date().toISOString().slice(0, 10));
  const [productionInputs, setProductionInputs] = useState([{ balance_key: "", quantity_kg: "" }]);
  const [productionOutputKg, setProductionOutputKg] = useState("");
  const [productionTankId, setProductionTankId] = useState("");
  const [productionNotes, setProductionNotes] = useState("");
  const [qualityLotId, setQualityLotId] = useState("");
  const [editingQualityAssessmentId, setEditingQualityAssessmentId] = useState("");
  const [sampleReference, setSampleReference] = useState("");
  const [sampleDate, setSampleDate] = useState(new Date().toISOString().slice(0, 10));
  const [testedDate, setTestedDate] = useState(new Date().toISOString().slice(0, 10));
  const [laboratoryName, setLaboratoryName] = useState("");
  const [specificationReference, setSpecificationReference] = useState("");
  const [measurements, setMeasurements] = useState([{ code: "", value: "", unit: "" }]);
  const [oilAcidity, setOilAcidity] = useState("");
  const [oilPeroxide, setOilPeroxide] = useState("");
  const [oilK232, setOilK232] = useState("");
  const [oilK270, setOilK270] = useState("");
  const [oilContent, setOilContent] = useState("");
  const [oilClassification, setOilClassification] = useState<"auto" | "extra_vierge" | "vierge" | "lampante">("auto");
  const [oilType, setOilType] = useState("");
  const [analysisNotes, setAnalysisNotes] = useState("");
  const [reviewAssessmentId, setReviewAssessmentId] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"RELEASED" | "REJECTED">("RELEASED");
  const [reviewReason, setReviewReason] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [assignedPermissions, setAssignedPermissions] = useState<string[]>([]);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [editingBuyerId, setEditingBuyerId] = useState("");
  const [selectedBuyerAccountId, setSelectedBuyerAccountId] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerTaxId, setBuyerTaxId] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [saleBuyerId, setSaleBuyerId] = useState("");
  const [saleLotId, setSaleLotId] = useState("");
  const [saleTankId, setSaleTankId] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("");
  const [saleUnitPrice, setSaleUnitPrice] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [returnSaleId, setReturnSaleId] = useState("");
  const [returnQuantity, setReturnQuantity] = useState("");
  const [returnTankId, setReturnTankId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnAcknowledgement, setReturnAcknowledgement] = useState("");
  const [returnIdempotencyKey, setReturnIdempotencyKey] = useState(() => crypto.randomUUID());
  const [returnAcceptanceKeys, setReturnAcceptanceKeys] = useState<Record<string, { key: string; reason: string }>>({});
  const [returnRejectionKeys, setReturnRejectionKeys] = useState<Record<string, { key: string; reason: string; receiptReference: string }>>({});
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [creditApplicationAmount, setCreditApplicationAmount] = useState("");
  const [creditApplicationReason, setCreditApplicationReason] = useState("");
  const [creditApplicationKey, setCreditApplicationKey] = useState(() => crypto.randomUUID());
  const [selectedPaymentForReversal, setSelectedPaymentForReversal] = useState("");
  const [reversalAmount, setReversalAmount] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const [reversalDate, setReversalDate] = useState(new Date().toISOString().slice(0, 10));
  const [reversalEvidenceReference, setReversalEvidenceReference] = useState("");
  const [reversalKey, setReversalKey] = useState(() => crypto.randomUUID());
  useEffect(() => { setCreditApplicationAmount(""); setCreditApplicationReason(""); setCreditApplicationKey(crypto.randomUUID()); setSelectedPaymentForReversal(""); setReversalAmount(""); setReversalReason(""); setReversalDate(new Date().toISOString().slice(0, 10)); setReversalEvidenceReference(""); setReversalKey(crypto.randomUUID()); }, [selectedInvoiceId]);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "CHEQUE">("CASH");
  const [custodyCustomerPhone, setCustodyCustomerPhone] = useState("");
  const [custodyReceiptDate, setCustodyReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [custodyVarietyId, setCustodyVarietyId] = useState("");
  const [custodyReceiptQuantity, setCustodyReceiptQuantity] = useState("");
  const [custodyReceivingLocationId, setCustodyReceivingLocationId] = useState("");
  const [custodyReceiptAck, setCustodyReceiptAck] = useState("");
  const [custodySourceReference, setCustodySourceReference] = useState("");
  const [custodyReceiptKey, setCustodyReceiptKey] = useState(() => crypto.randomUUID());
  const [pickupCustomerId, setPickupCustomerId] = useState("");
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().slice(0, 10));
  const [pickupBalanceKey, setPickupBalanceKey] = useState("");
  const [pickupQuantity, setPickupQuantity] = useState("");
  const [pickupAck, setPickupAck] = useState("");
  const [pickupReason, setPickupReason] = useState("");
  const [pickupKey, setPickupKey] = useState(() => crypto.randomUUID());
  const [internalMovementKind, setInternalMovementKind] = useState<"TRANSFER" | "OWNERSHIP_TRANSFER">("TRANSFER");
  const [internalProductKind, setInternalProductKind] = useState<"OLIVE" | "OIL">("OIL");
  const [internalSourceBalanceKey, setInternalSourceBalanceKey] = useState("");
  const [internalDestinationLocationId, setInternalDestinationLocationId] = useState("");
  const [internalDestinationOwnerKey, setInternalDestinationOwnerKey] = useState("MILL");
  const [internalMovementQuantity, setInternalMovementQuantity] = useState("");
  const [internalMovementReason, setInternalMovementReason] = useState("");
  const [internalMovementKey, setInternalMovementKey] = useState(() => crypto.randomUUID());
  const status = useQuery({
    queryKey: ["commercial", "status"],
    queryFn: () => apiGet<CommercialStatus>("/commercial/v1/status"),
    refetchInterval: 30_000,
  });
  const ready = status.data?.ready === true;
  const tanks = useQuery({ queryKey: ["commercial", "tanks"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/tanks"), enabled: ready });
  const lots = useQuery({ queryKey: ["commercial", "lots"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/lots", 500), enabled: ready });
  const balances = useQuery({ queryKey: ["commercial", "balances"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/stock-balances", 1000), enabled: ready });
  const movements = useQuery({ queryKey: ["commercial", "movements"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/stock-movements", 500), enabled: ready && tab === "movements" });
  const internalMovementDocuments = useQuery({ queryKey: ["commercial", "internal-movements"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/internal-movements", 500), enabled: ready && tab === "transfers" });
  const quality = useQuery({ queryKey: ["commercial", "quality"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/quality-assessments", 500), enabled: ready && tab === "quality" });
  const permissions = useQuery({ queryKey: ["commercial", "my-permissions"], queryFn: () => apiGet<{ permissions: string[] }>("/commercial/v1/me/permissions"), enabled: ready });
  const workers = useQuery({ queryKey: ["commercial", "workers"], queryFn: () => apiGet<AnyRecord[]>("/users"), enabled: ready && isAdmin && tab === "permissions" });
  const targetPermissions = useQuery({ queryKey: ["commercial", "worker-permissions", selectedWorkerId], queryFn: () => apiGet<{ permissions: string[] }>(`/commercial/v1/users/${encodeURIComponent(selectedWorkerId)}/commercial-permissions`), enabled: ready && isAdmin && tab === "permissions" && !!selectedWorkerId });
  const suppliers = useQuery({ queryKey: ["commercial", "suppliers"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/suppliers", 500), enabled: ready && (tab === "suppliers" || tab === "purchases") });
  const locations = useQuery({ queryKey: ["commercial", "locations"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/locations", 500), enabled: ready && (tab === "locations" || tab === "purchases" || tab === "production" || tab === "custody" || tab === "transfers") });
  const varieties = useQuery({ queryKey: ["commercial", "varieties"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/varieties", 500), enabled: ready && (tab === "purchases" || tab === "custody") });
  const purchases = useQuery({ queryKey: ["commercial", "purchases"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/olive-purchases", 500), enabled: ready && tab === "purchases" });
  const productionRuns = useQuery({ queryKey: ["commercial", "production-runs"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/production-runs", 500), enabled: ready && tab === "production" });
  const buyers = useQuery({ queryKey: ["commercial", "buyers"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/buyers", 500), enabled: ready && (tab === "buyers" || tab === "sales") });
  const buyerAccountSummary = useQuery({ queryKey: ["commercial", "buyer-account-summary", selectedBuyerAccountId], queryFn: () => apiGet<AnyRecord>(`/commercial/v1/buyers/${encodeURIComponent(selectedBuyerAccountId)}/account-summary`), enabled: ready && tab === "buyers" && !!selectedBuyerAccountId });
  const sales = useQuery({ queryKey: ["commercial", "sales"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sales", 500), enabled: ready && tab === "sales" });
  const salesInvoices = useQuery({ queryKey: ["commercial", "sales-invoices"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sales-invoices", 500), enabled: ready && tab === "sales" });
  const saleReturns = useQuery({ queryKey: ["commercial", "sale-returns"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sale-returns", 500), enabled: ready && tab === "sales" });
  const returnRejections = useQuery({ queryKey: ["commercial", "sale-return-rejections"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sale-return-rejections", 500), enabled: ready && tab === "sales" });
  const creditNotes = useQuery({ queryKey: ["commercial", "credit-notes"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/credit-notes", 500), enabled: ready && tab === "sales" });
  const salePayments = useQuery({ queryKey: ["commercial", "sale-payments", selectedInvoiceId], queryFn: () => apiGetAllPages<AnyRecord>(`/commercial/v1/sales-invoices/${encodeURIComponent(selectedInvoiceId)}/payments`, 500), enabled: ready && tab === "sales" && !!selectedInvoiceId });
  const paymentReversals = useQuery({ queryKey: ["commercial", "payment-reversals", selectedInvoiceId], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sales-invoices/" + encodeURIComponent(selectedInvoiceId) + "/payment-reversals", 500), enabled: ready && tab === "sales" && !!selectedInvoiceId });
  const selectedPayment = (salePayments.data ?? []).find((payment) => payment.id === selectedPaymentForReversal);
  const selectedSalesInvoice = (salesInvoices.data ?? []).find((invoice) => invoice.id === selectedInvoiceId);
  const invoiceBuyerSummary = useQuery({
    queryKey: ["commercial", "invoice-buyer-summary", selectedInvoiceId],
    queryFn: () => apiGet<AnyRecord>("/commercial/v1/buyers/" + encodeURIComponent(selectedSalesInvoice!.buyer_id) + "/account-summary"),
    enabled: ready && tab === "sales" && !!selectedSalesInvoice,
  });
  const creditApplications = useQuery({
    queryKey: ["commercial", "credit-applications", selectedInvoiceId],
    queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sales-invoices/" + encodeURIComponent(selectedInvoiceId) + "/credit-applications", 500),
    enabled: ready && tab === "sales" && !!selectedInvoiceId,
  });
  const custodyClients = useQuery({ queryKey: ["commercial", "custody-clients"], queryFn: () => apiGetAllPages<AnyRecord>("/clients/options", 500), enabled: ready && tab === "custody" });
  const custodyOwners = useQuery({ queryKey: ["commercial", "custody-owners"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/customer-custody/owners", 500), enabled: ready && (tab === "custody" || tab === "transfers" || tab === "lots" || tab === "production") });
  const custodyReceipts = useQuery({ queryKey: ["commercial", "custody-receipts"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/customer-custody/receipts", 500), enabled: ready && tab === "custody" });
  const custodyReleases = useQuery({ queryKey: ["commercial", "custody-releases"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/customer-custody/releases", 500), enabled: ready && tab === "custody" });
  const custodyStatement = useQuery({ queryKey: ["commercial", "custody-statement", pickupCustomerId], queryFn: () => apiGet<AnyRecord>("/commercial/v1/customer-custody/owners/" + encodeURIComponent(pickupCustomerId) + "/statement"), enabled: ready && tab === "custody" && !!pickupCustomerId });
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
  const updateSupplier = useMutation({
    mutationFn: () => {
      if (!editingSupplier) throw new Error("No supplier selected");
      return apiPut<AnyRecord>(`/commercial/v1/suppliers/${encodeURIComponent(editingSupplier.id)}`, {
        expected_version: editingSupplier.version ?? 1,
        name: supplierName.trim(),
        phone: supplierPhone.trim() || null,
        tax_identifier: supplierTaxId.trim() || null,
        notes: supplierNotes.trim() || null,
      });
    },
    onSuccess: async () => {
      toast.success(l.supplierUpdated);
      setEditingSupplier(null);
      setSupplierName(""); setSupplierPhone(""); setSupplierTaxId(""); setSupplierNotes("");
      await queryClient.invalidateQueries({ queryKey: ["commercial", "suppliers"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const deleteSupplier = useMutation({
    mutationFn: (supplier: AnyRecord) => apiDelete<{ id: string; active: boolean }>(`/commercial/v1/suppliers/${encodeURIComponent(supplier.id)}`),
    onSuccess: async (_result, supplier) => {
      toast.success(l.supplierDeleted);
      if (editingSupplier?.id === supplier.id) cancelSupplierEdit();
      await queryClient.invalidateQueries({ queryKey: ["commercial", "suppliers"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const beginSupplierEdit = (supplier: AnyRecord) => {
    setEditingSupplier(supplier);
    setSupplierName(supplier.name ?? "");
    setSupplierPhone(supplier.phone ?? "");
    setSupplierTaxId(supplier.tax_identifier ?? "");
    setSupplierNotes(supplier.notes ?? "");
  };
  const cancelSupplierEdit = () => {
    setEditingSupplier(null);
    setSupplierName(""); setSupplierPhone(""); setSupplierTaxId(""); setSupplierNotes("");
  };
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
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const updatePurchase = useMutation({
    mutationFn: () => {
      if (!editingPurchase) throw new Error("No purchase selected for editing");
      return apiPut<AnyRecord>(`/commercial/v1/olive-purchases/${encodeURIComponent(editingPurchase.id)}`, {
        expected_version: editingPurchase.version,
        supplier_id: purchaseSupplierId,
        purchase_date: purchaseDate,
        lines: purchaseLines.map((line) => ({
          variety_id: line.variety_id,
          quantity_kg: line.quantity_kg,
          unit_price_dt: line.unit_price_dt,
        })),
        notes: purchaseNotes.trim() || null,
      });
    },
    onSuccess: async () => {
      toast.success(l.updateDraft);
      setEditingPurchase(null);
      setPurchaseSupplierId("");
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setPurchaseNotes("");
      setPurchaseLines([{ variety_id: "", quantity_kg: "", unit_price_dt: "" }]);
      await queryClient.invalidateQueries({ queryKey: ["commercial", "purchases"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const startPurchaseEdit = (purchase: AnyRecord) => {
    if (purchase.status !== "DRAFT") return;
    setEditingPurchase(purchase);
    setPurchaseSupplierId(purchase.supplier_id);
    setPurchaseDate(String(purchase.purchase_date).slice(0, 10));
    setPurchaseNotes(purchase.notes ?? "");
    setPurchaseLines((purchase.lines ?? []).map((line: AnyRecord) => ({
      variety_id: line.variety_id,
      quantity_kg: String(line.quantity_kg?.$numberDecimal ?? line.quantity_kg),
      unit_price_dt: String(line.unit_price_dt?.$numberDecimal ?? line.unit_price_dt),
    })));
  };
  const cancelPurchaseEdit = () => {
    setEditingPurchase(null);
    setPurchaseSupplierId("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseNotes("");
    setPurchaseLines([{ variety_id: "", quantity_kg: "", unit_price_dt: "" }]);
  };
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
  const postInternalMovement = useMutation({
    mutationFn: () => {
      const balance = (balances.data ?? []).find((item) =>
        [item.product_kind, item.lot_id, item.location_id, ownerIdentity(item.owner)].join("::") === internalSourceBalanceKey
      );
      if (!balance) throw new Error("The selected source balance is no longer available");
      const quantity = Number(internalMovementQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(balance.quantity_kg)) {
        throw new Error("Movement quantity exceeds the available source balance");
      }
      const destinationOwner = internalMovementKind === "TRANSFER"
        ? balance.owner
        : internalDestinationOwnerKey === "MILL"
          ? { kind: "MILL" }
          : { kind: "CUSTOMER", customer_id: internalDestinationOwnerKey.slice("CUSTOMER:".length) };
      return apiPost<AnyRecord>("/commercial/v1/internal-movements", {
        movement_kind: internalMovementKind,
        product_kind: balance.product_kind,
        lot_id: balance.lot_id,
        quantity_kg: internalMovementQuantity,
        source_location_id: balance.location_id,
        destination_location_id: internalMovementKind === "TRANSFER" ? internalDestinationLocationId : balance.location_id,
        source_owner: balance.owner,
        destination_owner: destinationOwner,
        idempotency_key: internalMovementKey,
        reason: internalMovementReason.trim(),
      });
    },
    onSuccess: async () => {
      toast.success(l.internalMovementSaved);
      setInternalSourceBalanceKey("");
      setInternalDestinationLocationId("");
      setInternalDestinationOwnerKey("MILL");
      setInternalMovementQuantity("");
      setInternalMovementReason("");
      setInternalMovementKey(crypto.randomUUID());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "internal-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-statement"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const submitQualityAssessment = useMutation({
    mutationFn: () => {
      const lot = (lots.data ?? []).find((item) => item.id === qualityLotId);
      if (!lot) throw new Error("Oil lot is no longer available");
      const payload = {
        oil_lot_id: qualityLotId,
        expected_lot_version: lot.version ?? 1,
        sample_reference: sampleReference.trim(),
        sample_date: sampleDate,
        tested_date: testedDate,
        laboratory_name: laboratoryName.trim(),
        specification_reference: specificationReference.trim(),
        measurements: [],
        acidity: oilAcidity,
        peroxide: oilPeroxide === "" ? null : oilPeroxide,
        k232: oilK232 === "" ? null : oilK232,
        k270: oilK270 === "" ? null : oilK270,
        oil_content_pct: oilContent === "" ? null : oilContent,
        classification: oilClassification === "auto"
          ? (Number(oilAcidity) <= 0.8 && (oilPeroxide === "" || Number(oilPeroxide) <= 20) && (oilK232 === "" || Number(oilK232) <= 2.5) && (oilK270 === "" || Number(oilK270) <= 0.22)
              ? "extra_vierge"
              : Number(oilAcidity) <= 2 && (oilPeroxide === "" || Number(oilPeroxide) <= 20) && (oilK232 === "" || Number(oilK232) <= 2.6) && (oilK270 === "" || Number(oilK270) <= 0.25)
                ? "vierge" : "lampante")
          : oilClassification,
        oil_type: oilType.trim() || null,
        notes: analysisNotes.trim(),
        idempotency_key: crypto.randomUUID(),
      };
      return editingQualityAssessmentId
        ? apiPut<AnyRecord>(`/commercial/v1/quality-assessments/${encodeURIComponent(editingQualityAssessmentId)}`, payload)
        : apiPost<AnyRecord>("/commercial/v1/quality-assessments", payload);
    },
    onSuccess: async () => {
      toast.success(editingQualityAssessmentId ? (lang === "ar" ? "تم تحديث التحليل" : "Analyse mise à jour") : l.assessmentSaved);
      setEditingQualityAssessmentId(""); setQualityLotId("");
      setSampleReference(""); setLaboratoryName(""); setSpecificationReference("");
      setMeasurements([{ code: "", value: "", unit: "" }]);
      setOilAcidity(""); setOilPeroxide(""); setOilK232(""); setOilK270(""); setOilContent("");
      setOilClassification("auto"); setOilType(""); setAnalysisNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "quality"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const deleteQualityAssessment = useMutation({
    mutationFn: (assessment: AnyRecord) => apiDelete<AnyRecord>(`/commercial/v1/quality-assessments/${encodeURIComponent(assessment.id)}`),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم حذف التحليل" : "Analyse supprimée");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "quality"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const releaseQualityAssessment = useMutation({
    mutationFn: () => {
      const assessment = (quality.data ?? []).find((item) => item.id === reviewAssessmentId);
      if (!assessment) throw new Error("Quality assessment is no longer available");
      return apiPost<AnyRecord>("/commercial/v1/quality-assessments/release", {
        assessment_id: assessment.id,
        expected_lot_version: assessment.lot_version_after_submission,
        decision: reviewDecision,
        decision_reason: reviewReason.trim(),
        idempotency_key: crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      toast.success(l.decisionSaved);
      setReviewAssessmentId(""); setReviewReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "quality"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const saveBuyer = useMutation({
    mutationFn: () => {
      const payload = {
        name: buyerName.trim(), contact_name: buyerContact.trim() || null,
        phone: buyerPhone.trim() || null, email: buyerEmail.trim() || null,
        tax_identifier: buyerTaxId.trim() || null, address: buyerAddress.trim() || null,
      };
      if (editingBuyerId) {
        const buyer = (buyers.data ?? []).find((item) => item.id === editingBuyerId);
        if (!buyer) throw new Error("Acheteur introuvable ou actualisé");
        return apiPut<AnyRecord>(`/commercial/v1/buyers/${encodeURIComponent(editingBuyerId)}`, {
          ...payload, expected_version: buyer.version ?? 1,
        });
      }
      return apiPost<AnyRecord>("/commercial/v1/buyers", payload);
    },
    onSuccess: async () => {
      toast.success(salesText.buyerSaved);
      setBuyerName(""); setBuyerContact(""); setBuyerPhone(""); setBuyerEmail("");
      setBuyerTaxId(""); setBuyerAddress(""); setEditingBuyerId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyers"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyer-account-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const changeBuyerStatus = useMutation({
    mutationFn: (buyer: AnyRecord) => apiPost<AnyRecord>(
      `/commercial/v1/buyers/${encodeURIComponent(buyer.id)}/status`,
      { expected_version: buyer.version ?? 1, active: !buyer.active },
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyers"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyer-account-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const createSale = useMutation({
    mutationFn: () => apiPost<AnyRecord>("/commercial/v1/sales", {
      sale_date: saleDate, buyer_id: saleBuyerId, oil_lot_id: saleLotId,
      source_tank_id: saleTankId, quantity_kg: saleQuantity,
      unit_price_dt: saleUnitPrice, notes: saleNotes.trim() || null,
      idempotency_key: crypto.randomUUID(),
    }),
    onSuccess: async () => {
      toast.success(salesText.saleSaved);
      setSaleQuantity(""); setSaleUnitPrice(""); setSaleNotes("");
      await queryClient.invalidateQueries({ queryKey: ["commercial", "sales"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const cancelSale = useMutation({
    mutationFn: ({ sale, reason }: { sale: AnyRecord; reason: string }) =>
      apiPost<AnyRecord>(`/commercial/v1/sales/${encodeURIComponent(sale.id)}/cancel`, {
        expected_version: sale.version, reason, idempotency_key: crypto.randomUUID(),
      }),
    onSuccess: async () => {
      toast.success(salesText.saleCancelled);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const receiveSaleReturn = useMutation({
    mutationFn: () => {
      const sale = (sales.data ?? []).find((item) => item.id === returnSaleId);
      if (!sale) throw new Error("Sale is no longer available");
      return apiPost<AnyRecord>(`/commercial/v1/sales/${encodeURIComponent(sale.id)}/returns`, {
        expected_sale_version: sale.version,
        quantity_kg: returnQuantity,
        quarantine_tank_id: returnTankId,
        reason: returnReason.trim(),
        buyer_acknowledgement_reference: returnAcknowledgement.trim() || null,
        idempotency_key: returnIdempotencyKey,
      });
    },
    onSuccess: async () => {
      toast.success(salesText.returnSaved);
      setReturnIdempotencyKey(crypto.randomUUID());
      setReturnQuantity(""); setReturnReason(""); setReturnAcknowledgement("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "sale-returns"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const acceptSaleReturn = useMutation({
    mutationFn: ({ item, reason, idempotencyKey }: { item: AnyRecord; reason: string; idempotencyKey: string }) =>
      apiPost<AnyRecord>(`/commercial/v1/sale-returns/${encodeURIComponent(item.id)}/accept`, {
        expected_return_version: item.version ?? 1,
        reason,
        idempotency_key: idempotencyKey,
      }),
    onSuccess: async (_result, variables) => {
      toast.success(salesText.returnAccepted);
      setReturnAcceptanceKeys((current) => { const next = { ...current }; delete next[variables.item.id]; return next; });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "sale-returns"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "credit-notes"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyers"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyer-account-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "invoice-buyer-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const rejectSaleReturn = useMutation({
    mutationFn: ({ item, reason, receiptReference, idempotencyKey }: { item: AnyRecord; reason: string; receiptReference: string; idempotencyKey: string }) =>
      apiPost<AnyRecord>(`/commercial/v1/sale-returns/${encodeURIComponent(item.id)}/reject`, {
        rejection_date: new Date().toISOString().slice(0, 10),
        expected_return_version: item.version ?? 1,
        reason,
        buyer_receipt_reference: receiptReference,
        idempotency_key: idempotencyKey,
      }),
    onSuccess: async (_result, variables) => {
      toast.success(salesText.returnRejected);
      setReturnRejectionKeys((current) => { const next = { ...current }; delete next[variables.item.id]; return next; });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "sale-returns"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "sale-return-rejections"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const approveSale = useMutation({
    mutationFn: (sale: AnyRecord) => apiPost<AnyRecord>(`/commercial/v1/sales/${encodeURIComponent(sale.id)}/approve`, {
      expected_version: sale.version, idempotency_key: crypto.randomUUID(),
    }),
    onSuccess: async () => {
      toast.success(salesText.saleApproved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyer-account-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "invoice-buyer-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const recordPayment = useMutation({
    mutationFn: () => {
      const invoice = (salesInvoices.data ?? []).find((item) => item.id === selectedInvoiceId);
      if (!invoice) throw new Error("Invoice is no longer available");
      return apiPost<AnyRecord>(`/commercial/v1/sales-invoices/${encodeURIComponent(selectedInvoiceId)}/payments`, {
        payment_date: paymentDate, amount_dt: paymentAmount, method: paymentMethod,
        reference: paymentReference.trim() || null,
        expected_invoice_version: invoice.version, idempotency_key: crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      toast.success(salesText.paymentSaved);
      setPaymentAmount(""); setPaymentReference("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyer-account-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "invoice-buyer-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "sale-payments", selectedInvoiceId] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });

  const applyBuyerCredit = useMutation({
    mutationFn: () => {
      if (!selectedSalesInvoice) throw new Error("Invoice is no longer available");
      return apiPost<AnyRecord>(
        "/commercial/v1/sales-invoices/" + encodeURIComponent(selectedInvoiceId) + "/credit-applications",
        {
          amount_dt: creditApplicationAmount,
          expected_invoice_version: selectedSalesInvoice.version,
          reason: creditApplicationReason.trim(),
          idempotency_key: creditApplicationKey,
        },
      );
    },
    onSuccess: async () => {
      toast.success(salesText.creditApplied);
      setCreditApplicationAmount(""); setCreditApplicationReason("");
      setCreditApplicationKey(crypto.randomUUID());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyers"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyer-account-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "invoice-buyer-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "credit-applications", selectedInvoiceId] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const reversePayment = useMutation({
    mutationFn: () => {
      if (!selectedPayment || !selectedSalesInvoice) throw new Error("Select a valid original payment");
      return apiPost<AnyRecord>(
        "/commercial/v1/sale-payments/" + encodeURIComponent(selectedPayment.id) + "/reversals",
        {
          amount_dt: reversalAmount,
          expected_invoice_version: selectedSalesInvoice.version,
          reversal_date: reversalDate,
          reason: reversalReason.trim(),
          evidence_reference: reversalEvidenceReference.trim() || null,
          idempotency_key: reversalKey,
        },
      );
    },
    onSuccess: async () => {
      toast.success(salesText.reversalSaved);
      setSelectedPaymentForReversal(""); setReversalAmount(""); setReversalReason(""); setReversalEvidenceReference("");
      setReversalKey(crypto.randomUUID());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyers"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyer-account-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "sale-payments", selectedInvoiceId] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "payment-reversals", selectedInvoiceId] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "invoice-buyer-summary", selectedInvoiceId] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const receiveCustomerCustody = useMutation({
    mutationFn: () => apiPost<AnyRecord>("/commercial/v1/customer-custody/receipts", {
      customer_phone: custodyCustomerPhone,
      receipt_date: custodyReceiptDate,
      variety_id: custodyVarietyId,
      quantity_kg: custodyReceiptQuantity,
      receiving_location_id: custodyReceivingLocationId,
      customer_acknowledgement_reference: custodyReceiptAck.trim(),
      source_reference: custodySourceReference.trim() || null,
      idempotency_key: custodyReceiptKey,
    }),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم استلام زيتون الحريف وتسجيله كأمانة" : "Olives du client reçues en garde");
      setCustodyReceiptQuantity(""); setCustodyReceiptAck(""); setCustodySourceReference("");
      setCustodyReceiptKey(crypto.randomUUID());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-owners"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-statement"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const releaseCustomerCustody = useMutation({
    mutationFn: () => {
      const owner = (custodyOwners.data ?? []).find((item) => item.id === pickupCustomerId);
      const balance = (balances.data ?? []).find((item) => item.lot_id + "::" + item.location_id === pickupBalanceKey);
      if (!owner || !balance) throw new Error("Customer or stock balance is no longer available");
      return apiPost<AnyRecord>("/commercial/v1/customer-custody/releases", {
        customer_id: owner.id,
        release_date: pickupDate,
        oil_lot_id: balance.lot_id,
        source_tank_id: balance.location_id,
        quantity_kg: pickupQuantity,
        customer_acknowledgement_reference: pickupAck.trim(),
        reason: pickupReason.trim(),
        idempotency_key: pickupKey,
      });
    },
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم تسليم زيت الحريف وتخفيض المخزون" : "Huile du client restituée et stock débité");
      setPickupQuantity(""); setPickupAck(""); setPickupReason(""); setPickupBalanceKey("");
      setPickupKey(crypto.randomUUID());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-releases"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-statement"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const saveWorkerPermissions = useMutation({
    mutationFn: () => apiPost<AnyRecord>(`/commercial/v1/users/${encodeURIComponent(selectedWorkerId)}/commercial-permissions`, {
      permissions: ["commercial.read", ...assignedPermissions],
    }),
    onSuccess: async () => {
      toast.success(l.permissionsSaved);
      await queryClient.invalidateQueries({ queryKey: ["commercial", "worker-permissions", selectedWorkerId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const changeTankCapacity = useMutation({
    mutationFn: ({ tank, capacity }: { tank: AnyRecord; capacity: string }) =>
      apiPut<AnyRecord>(`/commercial/v1/tanks/${encodeURIComponent(tank.id)}/capacity`, {
        capacity_kg: capacity.trim() === "" ? null : Number(capacity),
        expected_version: tank.version ?? 1,
      }),
    onSuccess: async () => {
      toast.success(l.capacitySaved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "tanks"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.capacityError),
  });
  const changeTankRole = useMutation({
    mutationFn: ({ tank, role }: { tank: AnyRecord; role: "NORMAL" | "QUARANTINE" }) =>
      apiPost<AnyRecord>(`/commercial/v1/tanks/${encodeURIComponent(tank.id)}/role`, {
        role, expected_version: tank.version ?? 1,
      }),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم تحديث دور الخزان" : "Rôle de la cuve mis à jour");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "tanks"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
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
  const canPostStock = permissions.data?.permissions.includes("commercial.post_stock") === true;
  const canRecordLab = permissions.data?.permissions.includes("commercial.lab_record") === true;
  const canReviewQuality = permissions.data?.permissions.includes("commercial.quality_release") === true;
  useEffect(() => {
    setAssignedPermissions(targetPermissions.data?.permissions.filter((permission) => permission !== "commercial.read") ?? []);
  }, [targetPermissions.data, selectedWorkerId]);

  // Show every oil lot generated by the application in the analysis selector. Only open lots awaiting analysis or re-analysis remain selectable.
  const qualityOilLots = (lots.data ?? []).filter((lot) => lot.product_kind === "OIL");
  const reviewableAssessments = (quality.data ?? []).filter((assessment) => {
    const lot = (lots.data ?? []).find((item) => item.id === assessment.oil_lot_id);
    return assessment.status === "AWAITING_INDEPENDENT_REVIEW"
      && assessment.created_by !== me.data?.id
      && lot?.last_quality_assessment_id === assessment.id
      && lot?.version === assessment.lot_version_after_submission;
  });
  const selectedReviewAssessment = (quality.data ?? []).find((assessment) => assessment.id === reviewAssessmentId);

  const displayOwnerLabel = (owner: AnyRecord | undefined) => {
    if (owner?.kind !== "CUSTOMER") return ownerLabel(owner, l);
    const custodyOwner = (custodyOwners.data ?? []).find((item) => item.id === owner.customer_id);
    return `${l.customer}: ${custodyOwner?.client_name ?? owner.customer_id}`;
  };
  const currentOwnersForLot = (lot: AnyRecord) => {
    const owners = Array.from(new Map<string, string>((balances.data ?? [])
      .filter((balance) => balance.lot_id === lot.id && Number(balance.quantity_kg) > 0)
      .map((balance): [string, string] => [ownerIdentity(balance.owner), displayOwnerLabel(balance.owner)])).values());
    return owners.length ? owners.join(" / ") : "—";
  };
  const currentStockQuantityForLot = (lot: AnyRecord) => (balances.data ?? [])
    .filter((balance) => balance.lot_id === lot.id)
    .reduce((total, balance) => total + Number(balance.quantity_kg ?? 0), 0);

  const tankOilStocks = (tanks.data ?? []).filter((tank) => tank.active !== false).map((tank, index) => {
    const quantity = (balances.data ?? [])
      .filter((balance) => balance.product_kind === "OIL" && balance.location_id === tank.id)
      .reduce((sum, balance) => sum + Number(balance.quantity_kg ?? 0), 0);
    return { tank, index, quantity };
  });
  const maxFlexibleTankStock = Math.max(1, ...tankOilStocks.map((item) => item.quantity));
  const availableMillOilLots = (lots.data ?? []).filter((lot) =>
    lot.product_kind === "OIL" && lot.status === "OPEN" && lot.quality_status === "RELEASED"
    && (balances.data ?? []).some((balance) => balance.product_kind === "OIL" && balance.lot_id === lot.id
      && balance.owner?.kind === "MILL" && Number(balance.quantity_kg) > 0
      && (tanks.data ?? []).some((tank) => tank.id === balance.location_id && tank.active && (tank.role ?? "NORMAL") === "NORMAL"))
  );

  const availableOliveBalances: AnyRecord[] = (balances.data ?? []).filter((balance: AnyRecord) =>
    balance.product_kind === "OLIVE" && Number(balance.quantity_kg) > 0
    && (lots.data ?? []).some((lot: AnyRecord) => lot.id === balance.lot_id && lot.status === "OPEN")
  );

  const availableInternalBalances = (balances.data ?? []).filter((balance) => {
    if (balance.product_kind !== internalProductKind || Number(balance.quantity_kg) <= 0) return false;
    const lot = (lots.data ?? []).find((item) => item.id === balance.lot_id && item.status === "OPEN");
    if (!lot) return false;
    if (internalProductKind === "OIL") {
      const tank = (tanks.data ?? []).find((item) => item.id === balance.location_id && item.active);
      if (!tank) return false;
      if (tank.role === "QUARANTINE" && (internalMovementKind !== "TRANSFER" || lot.quality_status !== "RELEASED")) return false;
    } else if (!(locations.data ?? []).some((item) => item.id === balance.location_id && item.active)) {
      return false;
    }
    return true;
  });
  const selectedInternalBalance = availableInternalBalances.find((balance) =>
    [balance.product_kind, balance.lot_id, balance.location_id, ownerIdentity(balance.owner)].join("::") === internalSourceBalanceKey
  );
  const internalDestinationLocations = internalProductKind === "OIL"
    ? (tanks.data ?? []).filter((item) => item.active && (item.role ?? "NORMAL") === "NORMAL")
    : (locations.data ?? []).filter((item) => item.active);
  const internalDestinationOwnerOptions = selectedInternalBalance?.owner?.kind === "CUSTOMER"
    ? [{ key: "MILL", label: l.mill }]
    : (custodyOwners.data ?? [])
      .filter((owner) => owner.active !== false)
      .map((owner) => ({ key: "CUSTOMER:" + owner.id, label: l.customer + ": " + owner.client_name + " · " + owner.client_phone }));

  const availableCustomerOilBalances = (balances.data ?? []).filter((balance) =>
    balance.product_kind === "OIL" && Number(balance.quantity_kg) > 0
    && balance.owner?.kind === "CUSTOMER" && balance.owner?.customer_id === pickupCustomerId
    && (tanks.data ?? []).some((tank) => tank.id === balance.location_id && tank.active && (tank.role ?? "NORMAL") === "NORMAL")
    && (lots.data ?? []).some((lot) => lot.id === balance.lot_id && lot.status === "OPEN" && lot.quality_status === "RELEASED")
  );
  const selectedPickupBalance = availableCustomerOilBalances.find((balance) => balance.lot_id + "::" + balance.location_id === pickupBalanceKey);
  const productionInputTotal = productionInputs.reduce((sum, line) => sum + (Number(line.quantity_kg) || 0), 0);
  const productionRate = productionInputTotal > 0 && Number(productionOutputKg) >= 0
    ? (Number(productionOutputKg) / productionInputTotal) * 100 : 0;


  // Operational sequence: supplier → olive intake/purchase → lot tracking → pressing → oil storage → quality → movements → delivery/sale.
  const tabs: { id: TabKey; label: string; icon: typeof Warehouse }[] = [
    { id: "overview", label: l.overview, icon: Activity },
    { id: "suppliers", label: l.suppliers, icon: Truck },
    { id: "purchases", label: l.purchasesTab, icon: ShoppingBasket },
    { id: "lots", label: l.lots, icon: Boxes },
    { id: "quality", label: l.quality, icon: Beaker },
    { id: "production", label: l.productionTab, icon: Factory },
    { id: "tanks", label: l.tanks, icon: Warehouse },
    { id: "movements", label: l.movements, icon: ArrowLeftRight },
    { id: "transfers", label: l.internalMovementsTab, icon: RefreshCw },
    { id: "custody", label: l.custodyTab, icon: Handshake },
    { id: "buyers", label: salesText.buyers, icon: UserRound },
    { id: "sales", label: salesText.sales, icon: ShoppingCart },
    // Supporting/setup sections are grouped after the operational flow.
    { id: "locations", label: l.locationsTab, icon: MapPin },
  ];
  if (isAdmin) tabs.push({ id: "permissions", label: l.permissionsTab, icon: ShieldCheck });

  return (
    <div className="commercial-workspace mx-auto max-w-7xl space-y-6" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">{tab === "overview" ? l.title : (tabs.find((item) => item.id === tab)?.label ?? l.title)}</h1>
          {tab === "overview" && <p className="mt-2 max-w-3xl text-sm text-stone-500 md:text-base">{l.subtitle}</p>}
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

      {tab === "overview" && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="commercial-card commercial-card--green"><CardHeader className="pb-1"><div className="flex items-center justify-between gap-2"><CardDescription>{l.season}</CardDescription><Activity className="commercial-card-icon size-6" /></div><CardTitle className="text-2xl" dir="ltr">{value(status.data?.season_code)}</CardTitle></CardHeader></Card>
        <Card className="commercial-card commercial-card--blue"><CardHeader className="pb-1"><div className="flex items-center justify-between gap-2"><CardDescription>{l.tanksCount}</CardDescription><Warehouse className="commercial-card-icon size-6" /></div><CardTitle className="text-2xl">{status.data?.tanks_provisioned ?? "—"}/9</CardTitle></CardHeader></Card>
        <Card className="commercial-card commercial-card--teal"><CardHeader className="pb-1"><div className="flex items-center justify-between gap-2"><CardDescription>{l.locations}</CardDescription><MapPin className="commercial-card-icon size-6" /></div><CardTitle className="text-2xl">{status.data?.active_olive_locations ?? "—"}</CardTitle></CardHeader></Card>
        <Card className="commercial-card commercial-card--amber"><CardHeader className="pb-1"><div className="flex items-center justify-between gap-2"><CardDescription>{l.counters}</CardDescription><ClipboardList className="commercial-card-icon size-6" /></div><CardTitle className="text-2xl">{status.data?.season_counters_provisioned ?? "—"}/15</CardTitle></CardHeader></Card>
      </div>}

      {tab === "overview" && ready && <Card className="commercial-card commercial-card--blue">
        <CardHeader className="pb-2">
          <CardTitle>{lang === "ar" ? "مستوى الزيت في الخزانات" : "Niveau d’huile dans les cuves"}</CardTitle>
          <CardDescription>{lang === "ar" ? "كمية الزيت الحالية في كل خزان" : "Quantité d’huile actuellement stockée dans chaque cuve"}</CardDescription>
        </CardHeader>
        <CardContent>
          {tanks.isLoading || balances.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{lang === "ar" ? "جار تحميل مستويات الخزانات…" : "Chargement des niveaux des cuves…"}</p>
          ) : tankOilStocks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{l.noRows}</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9">
              {tankOilStocks.map(({ tank, index, quantity }) => {
                const capacity = Number(tank.capacity_kg ?? 0);
                const fillPercent = Math.max(0, Math.min(100, capacity > 0 ? quantity / capacity * 100 : quantity / maxFlexibleTankStock * 100));
                const tankLabel = String(tank.code ?? tank.name ?? (index + 1));
                return (
                  <div key={tank.id} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-2 pt-3 pb-2 dark:border-sky-900/60 dark:bg-slate-900/50" title={`${tankLabel}: ${number(quantity)} kg${capacity > 0 ? ` / ${number(capacity)} kg` : ""}`}>
                    <div className="flex h-36 w-full max-w-16 items-end overflow-hidden rounded-t-lg rounded-b-md border border-sky-200 bg-white shadow-inner dark:border-slate-700 dark:bg-slate-950">
                      <div className="w-full rounded-t-sm bg-gradient-to-t from-sky-700 via-cyan-500 to-cyan-300 transition-[height] duration-700 ease-out" style={{ height: `${fillPercent}%`, minHeight: quantity > 0 ? "4px" : "0" }} />
                    </div>
                    <span className="w-full truncate text-center text-sm font-bold text-slate-800 dark:text-slate-100">{lang === "ar" ? "خزان" : "Cuve"} {tankLabel}</span>
                    <span className="text-xs font-semibold tabular-nums text-sky-800 dark:text-sky-300">{number(quantity)} kg</span>
                    {capacity > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(fillPercent)}%</span>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>}

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

      

      <nav aria-label="Gestion commerciale" data-testid="commercial-bottom-nav" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-[#CFE3C4]/30 bg-[#1E2B20]/80 shadow-[0_-8px_24px_rgba(20,35,22,0.20)] backdrop-blur-none">
        <div className="mx-auto flex max-w-7xl items-stretch gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`flex min-w-[5.4rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-1.5 text-xs font-semibold transition-colors ${tab === id ? "border-[#CFE3C4] bg-[#2C4A30] text-white" : "border-transparent text-[#D3DDCF] hover:bg-white/10 hover:text-white"}`}>
              <Icon className="size-5 stroke-[1.7]" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
          <button type="button" onClick={() => navigate("/")} aria-label={lang === "ar" ? "العودة إلى التطبيق الأصلي" : "Retour à l’application originale"} title={lang === "ar" ? "العودة إلى التطبيق الأصلي" : "Retour à l’application originale"} data-testid="commercial-return-home" className="ml-1 flex min-w-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-[#CFE3C4]/40 bg-[#DCE8D3] px-2 py-1.5 text-xs font-bold text-[#1E3A25] hover:bg-white">
            <Home className="size-5" />
            <span className="whitespace-nowrap">{lang === "ar" ? "الرئيسية" : "Accueil"}</span>
          </button>
        </div>
      </nav>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="commercial-card commercial-card--olive"><CardHeader><div className="flex items-center justify-between gap-2"><CardDescription>{l.olive}</CardDescription><ShoppingBasket className="commercial-card-icon size-7" /></div><CardTitle className="text-3xl">{number(totalOlives)} kg</CardTitle></CardHeader></Card>
            <Card className="commercial-card commercial-card--violet"><CardHeader><div className="flex items-center justify-between gap-2"><CardDescription>{l.oil}</CardDescription><Beaker className="commercial-card-icon size-7" /></div><CardTitle className="text-3xl">{number(totalOil)} kg</CardTitle></CardHeader></Card>
            <Card className="commercial-card commercial-card--rose"><CardHeader><div className="flex items-center justify-between gap-2"><CardDescription>{l.quality}</CardDescription><ShieldCheck className="commercial-card-icon size-7" /></div><CardTitle className="text-3xl">{ready ? qualityPending : "—"}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader></Card>
          </div>
          <Card><CardHeader><CardTitle>{l.readiness}</CardTitle><CardDescription>{ready ? l.ready : l.notReady}</CardDescription></CardHeader><CardContent className="flex items-center gap-2 text-sm">{ready ? <ShieldCheck className="size-5 text-emerald-600" /> : <AlertTriangle className="size-5 text-amber-600" />}{ready ? l.ready : l.warning}</CardContent></Card>
        </div>
      )}

      {tab === "tanks" && <Card><CardHeader><CardTitle>{l.tanks}</CardTitle><CardDescription>{l.capacity}: {lang === "ar" ? "حدد السعة لكل خزان؛ اترك الحقل فارغاً لإبقائه مرناً." : "Définissez une capacité par cuve ; laissez le champ vide pour conserver une capacité flexible."}</CardDescription></CardHeader><CardContent><Table dir="rtl"><TableHeader><TableRow><TableHead>{l.actions}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{l.capacity}</TableHead><TableHead>{lang === "ar" ? "الدور" : "Rôle"}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.tank}</TableHead></TableRow></TableHeader><TableBody>{(tanks.data ?? []).map((tank) => { const quantity = (balances.data ?? []).filter((b) => b.location_id === tank.id && b.product_kind === "OIL").reduce((sum, b) => sum + Number(b.quantity_kg ?? 0), 0); const flexibleScale = Math.max(1, ...(tanks.data ?? []).map((item) => (balances.data ?? []).filter((b) => b.location_id === item.id && b.product_kind === "OIL").reduce((sum, b) => sum + Number(b.quantity_kg ?? 0), 0))); const scale = tank.capacity_kg != null && Number(tank.capacity_kg) > 0 ? Number(tank.capacity_kg) : flexibleScale; const fillPercent = Math.min(100, Math.max(0, (quantity / scale) * 100)); return <TableRow key={tank.id}><TableCell>{isAdmin && <div dir={lang === "ar" ? "rtl" : "ltr"} className="flex flex-wrap items-center gap-2">
            <input aria-label={l.capacity} type="number" min={Math.max(0.001, quantity)} step="0.001" placeholder={l.flexible} value={tankCapacityDrafts[tank.id] ?? (tank.capacity_kg == null ? "" : String(tank.capacity_kg))} onChange={(e) => setTankCapacityDrafts((current) => ({ ...current, [tank.id]: e.target.value }))} className="h-9 w-32 rounded-lg border bg-background px-2 text-sm" />
            <Button size="sm" variant="outline" disabled={changeTankCapacity.isPending || (tankCapacityDrafts[tank.id] ?? (tank.capacity_kg == null ? "" : String(tank.capacity_kg))) !== "" && Number(tankCapacityDrafts[tank.id] ?? tank.capacity_kg) < quantity} onClick={() => changeTankCapacity.mutate({ tank, capacity: tankCapacityDrafts[tank.id] ?? (tank.capacity_kg == null ? "" : String(tank.capacity_kg)) })}>{l.saveCapacity}</Button>
            <select aria-label={lang === "ar" ? "دور الخزان" : "Rôle de la cuve"} value={tank.role ?? "NORMAL"} disabled={quantity > 0 || changeTankRole.isPending} onChange={(e) => { const role = e.target.value as "NORMAL" | "QUARANTINE"; if (window.confirm(lang === "ar" ? "تأكيد تغيير دور الخزان؟" : "Confirmer le changement de rôle de la cuve ?")) changeTankRole.mutate({ tank, role }); }} className="h-9 rounded-lg border bg-background px-2 text-sm disabled:opacity-50"><option value="NORMAL">{lang === "ar" ? "عادي" : "Normal"}</option><option value="QUARANTINE">{lang === "ar" ? "حجر" : "Quarantaine"}</option></select>
          </div>}</TableCell><TableCell className="min-w-[190px]"><div dir="ltr" className="flex items-center gap-3"><div dir="ltr" className="h-5 min-w-[90px] flex-1 overflow-hidden rounded-full bg-stone-200 shadow-inner" role="progressbar" aria-label={`${l.quantity}: ${number(quantity)} kg`} aria-valuemin={0} aria-valuemax={scale} aria-valuenow={quantity}><div className="h-full rounded-full transition-[width,background-color] duration-500" style={{ width: `${fillPercent}%`, backgroundColor: `hsl(${120 - (fillPercent * 1.2)} 75% 40%)` }} /></div><span className="whitespace-nowrap font-bold tabular-nums">{number(quantity)} kg</span></div></TableCell><TableCell>{tank.capacity_kg == null ? l.flexible : number(tank.capacity_kg)}</TableCell><TableCell>{(tank.role ?? "NORMAL") === "QUARANTINE" ? (lang === "ar" ? "حجر" : "Quarantaine") : (lang === "ar" ? "عادي" : "Normal")}</TableCell><TableCell>{tank.active ? l.active : l.closed}</TableCell><TableCell className="font-semibold">{value(tank.code)} · {value(tank.name)}</TableCell></TableRow>; })}{(!tanks.isLoading && !(tanks.data?.length)) && <EmptyRow colSpan={6} text={l.noRows} />}</TableBody></Table></CardContent></Card>}

      {tab === "lots" && <Card><CardHeader><CardTitle>{l.lots}</CardTitle><CardDescription>{l.owner}: MILL / CUSTOMER</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.product}</TableHead><TableHead>{l.owner}</TableHead><TableHead>{l.currentStock}</TableHead><TableHead>{l.qualityStatus}</TableHead><TableHead>{l.status}</TableHead></TableRow></TableHeader><TableBody>{(lots.data ?? []).map((lot) => <TableRow key={lot.id}><TableCell className="font-mono text-xs">{value(lot.document_number)}</TableCell><TableCell>{lot.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell><TableCell>{currentOwnersForLot(lot)}</TableCell><TableCell>{number(currentStockQuantityForLot(lot))}</TableCell><TableCell>{lot.product_kind === "OIL" ? value(lot.quality_status, l.pending) : "—"}</TableCell><TableCell>{value(lot.status)}</TableCell></TableRow>)}{(!lots.isLoading && !(lots.data?.length)) && <EmptyRow colSpan={6} text={l.noRows} />}</TableBody></Table></CardContent></Card>}

      {tab === "transfers" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>{l.internalMovementTitle}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader>
          <CardContent>
            {canPostStock && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); postInternalMovement.mutate(); }}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">{l.movementType}
                  <select value={internalMovementKind} onChange={(e) => { setInternalMovementKind(e.target.value as "TRANSFER" | "OWNERSHIP_TRANSFER"); setInternalDestinationLocationId(""); setInternalDestinationOwnerKey("MILL"); setInternalMovementKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal">
                    <option value="TRANSFER">{l.transferType}</option>
                    <option value="OWNERSHIP_TRANSFER">{l.ownershipTransferType}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">{l.productKind}
                  <select value={internalProductKind} onChange={(e) => { setInternalProductKind(e.target.value as "OLIVE" | "OIL"); setInternalSourceBalanceKey(""); setInternalDestinationLocationId(""); setInternalMovementKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal">
                    <option value="OIL">{l.oil}</option><option value="OLIVE">{l.olive}</option>
                  </select>
                </label>
              </div>
              <label className="grid max-w-2xl gap-1 text-sm font-medium">{l.sourceBalance}
                <select required value={internalSourceBalanceKey} onChange={(e) => { setInternalSourceBalanceKey(e.target.value); setInternalDestinationLocationId(""); setInternalDestinationOwnerKey("MILL"); setInternalMovementQuantity(""); setInternalMovementKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal">
                  <option value="">—</option>
                  {availableInternalBalances.map((balance) => {
                    const lot = (lots.data ?? []).find((item) => item.id === balance.lot_id);
                    const location = internalProductKind === "OIL"
                      ? (tanks.data ?? []).find((item) => item.id === balance.location_id)
                      : (locations.data ?? []).find((item) => item.id === balance.location_id);
                    const key = [balance.product_kind, balance.lot_id, balance.location_id, ownerIdentity(balance.owner)].join("::");
                    return <option key={key} value={key}>{lot?.document_number ?? balance.lot_id} · {location?.code ?? balance.location_id} · {displayOwnerLabel(balance.owner)} · {number(balance.quantity_kg)} kg</option>;
                  })}
                </select>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                {internalMovementKind === "TRANSFER" ? <label className="grid gap-1 text-sm font-medium">{l.targetLocation}
                  <select required value={internalDestinationLocationId} onChange={(e) => { setInternalDestinationLocationId(e.target.value); setInternalMovementKey(crypto.randomUUID()); }} disabled={!selectedInternalBalance} className="h-10 rounded-lg border bg-background px-3 font-normal">
                    <option value="">—</option>
                    {internalDestinationLocations.filter((item) => item.id !== selectedInternalBalance?.location_id).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name ?? item.code}</option>)}
                  </select>
                </label> : <label className="grid gap-1 text-sm font-medium">{l.targetOwner}
                  <select required value={internalDestinationOwnerKey} onChange={(e) => { setInternalDestinationOwnerKey(e.target.value); setInternalMovementKey(crypto.randomUUID()); }} disabled={!selectedInternalBalance} className="h-10 rounded-lg border bg-background px-3 font-normal">
                    <option value="">—</option>
                    {internalDestinationOwnerOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </label>}
                <label className="grid gap-1 text-sm font-medium">{l.quantity}
                  <input required type="number" min="0.001" step="0.001" max={selectedInternalBalance?.quantity_kg ?? undefined} value={internalMovementQuantity} onChange={(e) => { setInternalMovementQuantity(e.target.value); setInternalMovementKey(crypto.randomUUID()); }} disabled={!selectedInternalBalance} className="h-10 rounded-lg border bg-background px-3 font-normal" />
                  {selectedInternalBalance && <span className="text-xs text-muted-foreground">{l.quantity}: {number(selectedInternalBalance.quantity_kg)} kg</span>}
                </label>
              </div>
              <label className="grid max-w-2xl gap-1 text-sm font-medium">{l.movementReason}
                <input required minLength={3} maxLength={500} value={internalMovementReason} onChange={(e) => { setInternalMovementReason(e.target.value); setInternalMovementKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" />
              </label>
              {availableInternalBalances.length === 0 && <p className="text-sm text-amber-700">{l.noAvailableBalance}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={postInternalMovement.isPending || !selectedInternalBalance || !(Number(internalMovementQuantity) > 0) || Number(internalMovementQuantity) > Number(selectedInternalBalance?.quantity_kg ?? 0) || internalMovementReason.trim().length < 3 || (internalMovementKind === "TRANSFER" ? !internalDestinationLocationId : !internalDestinationOwnerKey || !internalDestinationOwnerOptions.some((item) => item.key === internalDestinationOwnerKey))}>
                  {l.postInternalMovement}
                </Button>
              </div>
            </form>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{l.internalMovementHistory}</CardTitle></CardHeader>
          <CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.movement}</TableHead><TableHead>{l.product}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{l.source}</TableHead><TableHead>{l.destination}</TableHead><TableHead>{l.owner}</TableHead><TableHead>{l.created}</TableHead></TableRow></TableHeader>
            <TableBody>{(internalMovementDocuments.data ?? []).map((movement) => {
              return <TableRow key={movement.id}>
                <TableCell className="font-mono text-xs">{value(movement.document_number)}</TableCell>
                <TableCell>{value(movement.movement_kind)}</TableCell>
                <TableCell>{movement.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell>
                <TableCell>{number(movement.quantity_kg)} kg</TableCell>
                <TableCell>{value((movement.product_kind === "OIL" ? (tanks.data ?? []) : (locations.data ?? [])).find((item) => item.id === movement.source_location_id)?.code ?? movement.source_location_id)}</TableCell>
                <TableCell>{value((movement.product_kind === "OIL" ? (tanks.data ?? []) : (locations.data ?? [])).find((item) => item.id === movement.destination_location_id)?.code ?? movement.destination_location_id)}</TableCell>
                <TableCell>{displayOwnerLabel(movement.source_owner)} → {displayOwnerLabel(movement.destination_owner)}</TableCell>
                <TableCell>{date(movement.created_at)}</TableCell>
              </TableRow>;
            })}{(!internalMovementDocuments.isLoading && !(internalMovementDocuments.data?.length)) && <EmptyRow colSpan={8} text={l.noRows} />}</TableBody>
          </Table></CardContent>
        </Card>
      </div>}

      {tab === "movements" && <Card><CardHeader><CardTitle>{l.movements}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.movement}</TableHead><TableHead>{l.product}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{l.source}</TableHead><TableHead>{l.destination}</TableHead><TableHead>{l.created}</TableHead></TableRow></TableHeader><TableBody>{(movements.data ?? []).map((m) => <TableRow key={m.id}><TableCell className="font-mono text-xs">{value(m.document_number)}</TableCell><TableCell>{value(m.movement_kind)}</TableCell><TableCell>{m.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell><TableCell>{number(m.quantity_kg)}</TableCell><TableCell>{value(m.source_location_id)}</TableCell><TableCell>{value(m.destination_location_id)}</TableCell><TableCell>{date(m.created_at)}</TableCell></TableRow>)}{(!movements.isLoading && !(movements.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody></Table></CardContent></Card>}


      {tab === "quality" && <div className="space-y-4">
        {canRecordLab && <Card><CardHeader><CardTitle>{editingQualityAssessmentId ? (lang === "ar" ? "تعديل تحليل الزيت" : "Modifier l’analyse d’huile") : l.labEntry}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader><CardContent>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submitQualityAssessment.mutate(); }}>
            <label className="grid max-w-xl gap-1 text-sm font-medium">{l.qualityLot}
              <select required disabled={!!editingQualityAssessmentId} value={qualityLotId} onChange={(e) => setQualityLotId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{qualityOilLots.map((lot) => { const eligible = lot.status === "OPEN" && ["PENDING", "REJECTED"].includes(lot.quality_status); return <option key={lot.id} value={lot.id} disabled={!eligible}>{lot.document_number} · v{lot.version ?? 1}{eligible ? "" : ` · ${value(lot.quality_status, lot.status)}`}</option>; })}</select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">{l.sampleReference}<input required maxLength={100} value={sampleReference} onChange={(e) => setSampleReference(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{l.laboratory}<input required minLength={2} maxLength={160} value={laboratoryName} onChange={(e) => setLaboratoryName(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{l.sampleDate}<input required type="date" value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{l.testedDate}<input required type="date" min={sampleDate} value={testedDate} onChange={(e) => setTestedDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium md:col-span-2">{l.specification}<input required minLength={2} maxLength={160} value={specificationReference} onChange={(e) => setSpecificationReference(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            </div>
            <div className="space-y-3 rounded-xl border p-4">
              <h3 className="font-semibold">{l.oilAnalysis}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">{l.acidity}<input required type="number" min="0" step="0.01" value={oilAcidity} onChange={(e) => setOilAcidity(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.peroxide}<input type="number" min="0" step="0.01" value={oilPeroxide} onChange={(e) => setOilPeroxide(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.k232}<input type="number" min="0" step="0.001" value={oilK232} onChange={(e) => setOilK232(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.k270}<input type="number" min="0" step="0.001" value={oilK270} onChange={(e) => setOilK270(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.oilContent}<input type="number" min="0" step="0.1" value={oilContent} onChange={(e) => setOilContent(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.oilType}<input maxLength={100} value={oilType} onChange={(e) => setOilType(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.classification}
                  <select value={oilClassification} onChange={(e) => setOilClassification(e.target.value as typeof oilClassification)} className="h-10 rounded-lg border bg-background px-3 font-normal">
                    <option value="auto">{l.autoClassification}</option><option value="extra_vierge">{l.extraVirgin}</option><option value="vierge">{l.virgin}</option><option value="lampante">{l.lampante}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium md:col-span-2">{l.analysisNotes}<textarea maxLength={2000} value={analysisNotes} onChange={(e) => setAnalysisNotes(e.target.value)} className="min-h-20 rounded-lg border bg-background px-3 py-2 font-normal" /></label>
              </div>
              <p className="text-xs text-muted-foreground">{l.qualityRule}</p>
            </div>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={submitQualityAssessment.isPending || !qualityLotId || !sampleReference.trim() || !laboratoryName.trim() || !specificationReference.trim() || oilAcidity === ""}>{editingQualityAssessmentId ? (lang === "ar" ? "حفظ التعديلات" : "Enregistrer les modifications") : l.submitAssessment}</Button>{editingQualityAssessmentId && <Button type="button" variant="outline" onClick={() => { setEditingQualityAssessmentId(""); setQualityLotId(""); setSampleReference(""); setLaboratoryName(""); setSpecificationReference(""); setOilAcidity(""); setOilPeroxide(""); setOilK232(""); setOilK270(""); setOilContent(""); setOilClassification("auto"); setOilType(""); setAnalysisNotes(""); }}>{lang === "ar" ? "إلغاء" : "Annuler"}</Button>}</div>
          </form>
        </CardContent></Card>}
        {!canRecordLab && <p className="rounded-lg border p-3 text-sm text-muted-foreground">{l.noLabPermission}</p>}
        {canReviewQuality && <Card><CardHeader><CardTitle>{l.reviewerPanel}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader><CardContent>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); releaseQualityAssessment.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{l.chooseAssessment}
              <select required value={reviewAssessmentId} onChange={(e) => setReviewAssessmentId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{reviewableAssessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{(lots.data ?? []).find((lot) => lot.id === assessment.oil_lot_id)?.document_number ?? assessment.oil_lot_id} · {assessment.sample_reference} · {assessment.laboratory_name}</option>)}</select>
            </label>
            {selectedReviewAssessment && <div className="space-y-3 rounded-xl border p-4">
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <p><strong>{l.sampleReference}:</strong> {value(selectedReviewAssessment.sample_reference)}</p>
                <p><strong>{l.laboratory}:</strong> {value(selectedReviewAssessment.laboratory_name)}</p>
                <p><strong>{l.sampleDate}:</strong> {date(selectedReviewAssessment.sample_date)}</p>
                <p><strong>{l.testedDate}:</strong> {date(selectedReviewAssessment.tested_date)}</p>
                <p className="md:col-span-2"><strong>{l.specification}:</strong> {value(selectedReviewAssessment.specification_reference)}</p>
                <p><strong>{l.acidity}:</strong> {value(selectedReviewAssessment.acidity)}</p>
                <p><strong>{l.peroxide}:</strong> {value(selectedReviewAssessment.peroxide)}</p>
                <p><strong>{l.k232}:</strong> {value(selectedReviewAssessment.k232)}</p>
                <p><strong>{l.k270}:</strong> {value(selectedReviewAssessment.k270)}</p>
                <p><strong>{l.oilContent}:</strong> {value(selectedReviewAssessment.oil_content_pct)}</p>
                <p><strong>{l.classification}:</strong> {value(selectedReviewAssessment.classification)}</p>
                <p><strong>{l.oilType}:</strong> {value(selectedReviewAssessment.oil_type)}</p>
                <p className="md:col-span-2"><strong>{l.analysisNotes}:</strong> {value(selectedReviewAssessment.notes)}</p>
              </div>
              <Table><TableHeader><TableRow><TableHead>{l.measurementCode}</TableHead><TableHead>{l.measurementValue}</TableHead><TableHead>{l.measurementUnit}</TableHead></TableRow></TableHeader>
                <TableBody>{(selectedReviewAssessment.measurements ?? []).map((item: AnyRecord, index: number) => <TableRow key={item.code + "-" + index}><TableCell className="font-mono">{value(item.code)}</TableCell><TableCell>{value(item.value)}</TableCell><TableCell>{value(item.unit)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>}
            <label className="grid max-w-sm gap-1 text-sm font-medium">{l.decision}
              <select value={reviewDecision} onChange={(e) => setReviewDecision(e.target.value as "RELEASED" | "REJECTED")} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="RELEASED">{l.releaseOil}</option><option value="REJECTED">{l.rejectOil}</option></select>
            </label>
            <label className="grid gap-1 text-sm font-medium">{l.decisionReason}
              <textarea required minLength={10} maxLength={1000} value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} className="min-h-24 rounded-lg border bg-background px-3 py-2 font-normal" />
            </label>
            {reviewableAssessments.length === 0 && <p className="text-sm text-muted-foreground">{l.noAssessment}</p>}
            <Button type="submit" disabled={releaseQualityAssessment.isPending || !reviewAssessmentId || reviewReason.trim().length < 10}>{l.decision}</Button>
          </form>
        </CardContent></Card>}
        {!canReviewQuality && <p className="rounded-lg border p-3 text-sm text-muted-foreground">{l.noReviewPermission}</p>}
        <Card><CardHeader><CardTitle>{l.assessmentList}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{l.qualityLot}</TableHead><TableHead>{l.sampleReference}</TableHead><TableHead>{l.laboratory}</TableHead><TableHead>{l.submitter}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.created}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader>
            <TableBody>{(quality.data ?? []).map((assessment) => <TableRow key={assessment.id}>
              <TableCell className="font-mono text-xs"><button type="button" className={`underline underline-offset-2 ${assessment.status === "AWAITING_INDEPENDENT_REVIEW" && (lots.data ?? []).some((lot) => lot.id === assessment.oil_lot_id && lot.last_quality_assessment_id === assessment.id) && canRecordLab && (assessment.created_by === me.data?.id || isAdmin) ? "cursor-pointer text-emerald-700 font-semibold" : "cursor-default"}`} disabled={!(assessment.status === "AWAITING_INDEPENDENT_REVIEW" && canRecordLab && (assessment.created_by === me.data?.id || isAdmin))} title={lang === "ar" ? "انقر لتعديل التحليل المعلّق" : "Cliquer pour modifier l’analyse en attente"} onClick={() => { const lot = (lots.data ?? []).find((item) => item.id === assessment.oil_lot_id); if (!lot) { toast.error(l.warning); return; } setEditingQualityAssessmentId(assessment.id); setQualityLotId(assessment.oil_lot_id); setSampleReference(value(assessment.sample_reference, "")); setSampleDate(String(assessment.sample_date ?? "").slice(0,10)); setTestedDate(String(assessment.tested_date ?? "").slice(0,10)); setLaboratoryName(value(assessment.laboratory_name, "")); setSpecificationReference(value(assessment.specification_reference, "")); setOilAcidity(assessment.acidity == null ? "" : String(assessment.acidity)); setOilPeroxide(assessment.peroxide == null ? "" : String(assessment.peroxide)); setOilK232(assessment.k232 == null ? "" : String(assessment.k232)); setOilK270(assessment.k270 == null ? "" : String(assessment.k270)); setOilContent(assessment.oil_content_pct == null ? "" : String(assessment.oil_content_pct)); setOilClassification(assessment.classification ?? "auto"); setOilType(value(assessment.oil_type, "")); setAnalysisNotes(value(assessment.notes, "")); window.scrollTo({top:0,behavior:"smooth"}); }}>{value((lots.data ?? []).find((lot) => lot.id === assessment.oil_lot_id)?.document_number, assessment.oil_lot_id)}</button></TableCell>
              <TableCell>{value(assessment.sample_reference)}</TableCell>
              <TableCell>{value(assessment.laboratory_name)}</TableCell>
              <TableCell className="font-mono text-xs">{value(assessment.created_by)}</TableCell>
              <TableCell>{assessment.status === "AWAITING_INDEPENDENT_REVIEW" ? l.awaitingReview : l.reviewed + " · " + value(assessment.decision)}</TableCell>
              <TableCell>{date(assessment.created_at)}</TableCell><TableCell><div className="flex flex-wrap items-center gap-2"><a href={`/commercial/certificate/${encodeURIComponent(assessment.id)}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 underline">{l.viewCertificate}</a>{assessment.status === "AWAITING_INDEPENDENT_REVIEW" && canRecordLab && (assessment.created_by === me.data?.id || isAdmin) && <Button type="button" size="sm" variant="destructive" disabled={deleteQualityAssessment.isPending} onClick={() => { if (window.confirm(lang === "ar" ? "هل تؤكد حذف هذا التحليل؟ لا يمكن حذف تحليل تمت مراجعته." : "Confirmer la suppression de cette analyse ? Une analyse déjà revue ne peut pas être supprimée.")) deleteQualityAssessment.mutate(assessment); }}><Trash2 className="mr-1 size-4" />{lang === "ar" ? "حذف" : "Supprimer"}</Button>}</div></TableCell>
            </TableRow>)}{(!quality.isLoading && !(quality.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody>
          </Table>
        </CardContent></Card>
      </div>}

      {tab === "suppliers" && <div className="space-y-4">
        {isAdmin && <Card><CardHeader><CardTitle>{editingSupplier ? l.editSupplier : l.addSupplier}</CardTitle></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (supplierName.trim().length >= 2) editingSupplier ? updateSupplier.mutate() : addSupplier.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{l.supplierName}<input required minLength={2} maxLength={160} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.supplierPhone}<input maxLength={40} value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.taxId}<input maxLength={80} value={supplierTaxId} onChange={(e) => setSupplierTaxId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.notes}<input maxLength={1000} value={supplierNotes} onChange={(e) => setSupplierNotes(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <div className="md:col-span-2"><div className="flex flex-wrap gap-2"><Button type="submit" disabled={addSupplier.isPending || updateSupplier.isPending || supplierName.trim().length < 2}>{editingSupplier ? l.saveSupplierChanges : l.addSupplier}</Button>{editingSupplier && <Button type="button" variant="outline" onClick={cancelSupplierEdit}>{l.cancelSupplierEdit}</Button>}</div></div>
          </form>
        </CardContent></Card>}
        <Card><CardHeader><CardTitle>{l.suppliers}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.supplierName}</TableHead><TableHead>{l.supplierPhone}</TableHead><TableHead>{l.taxId}</TableHead>{isAdmin && <TableHead className="text-right">{l.actions}</TableHead>}</TableRow></TableHeader><TableBody>{(suppliers.data ?? []).map((s) => <TableRow key={s.id}><TableCell className="font-semibold">{isAdmin ? <button type="button" className="text-primary underline underline-offset-4 hover:opacity-80" onClick={() => beginSupplierEdit(s)} title={l.editSupplier}>{value(s.name)}</button> : value(s.name)}</TableCell><TableCell>{value(s.phone)}</TableCell><TableCell>{value(s.tax_identifier)}</TableCell>{isAdmin && <TableCell className="text-right"><Button type="button" size="icon" variant="ghost" className="text-destructive hover:text-destructive" title={l.deleteSupplier} aria-label={l.deleteSupplier} disabled={deleteSupplier.isPending} onClick={() => { if (window.confirm(l.confirmDeleteSupplier)) deleteSupplier.mutate(s); }}><Trash2 className="h-4 w-4" /></Button></TableCell>}</TableRow>)}{(!suppliers.isLoading && !(suppliers.data?.length)) && <EmptyRow colSpan={isAdmin ? 4 : 3} text={l.noRows} />}</TableBody></Table></CardContent></Card>
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

      {tab === "purchases" && <div className="space-y-4">
        {isAdmin && <Card><CardHeader><CardTitle>{editingPurchase ? `${l.editPurchase} · ${editingPurchase.document_number}` : l.newPurchase}</CardTitle><CardDescription>{l.bootstrapHint}</CardDescription></CardHeader><CardContent>
          {(suppliers.data?.length ?? 0) === 0 || (varieties.data?.length ?? 0) === 0 ? <p className="mb-3 text-sm text-amber-700">{(suppliers.data?.length ?? 0) === 0 ? l.noSuppliers : l.noVarieties}</p> : null}
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); editingPurchase ? updatePurchase.mutate() : createPurchase.mutate(); }}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">{l.supplier}<select required value={purchaseSupplierId} onChange={(e) => setPurchaseSupplierId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-medium">{l.purchaseDate}<input required type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            </div>
            <div className="space-y-3">
              {purchaseLines.map((line, index) => <div key={index} className="grid items-end gap-3 rounded-xl border p-3 md:grid-cols-[1.3fr_1fr_1fr_auto]">
                <label className="grid gap-1 text-sm font-medium">{l.variety}<select required value={line.variety_id} onChange={(e) => setPurchaseLines((rows) => rows.map((row, i) => i === index ? { ...row, variety_id: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(varieties.data ?? []).filter((v) => v.active).map((v) => <option key={v.id} value={v.id}>{lang === "ar" ? (v.name_ar || v.name_fr) : v.name_fr}</option>)}</select></label>
                <label className="grid gap-1 text-sm font-medium">{l.quantity}<input required type="number" min="0.001" step="0.001" value={line.quantity_kg} onChange={(e) => setPurchaseLines((rows) => rows.map((row, i) => i === index ? { ...row, quantity_kg: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.unitPrice}<input required type="number" min="0" step="0.001" value={line.unit_price_dt} onChange={(e) => setPurchaseLines((rows) => rows.map((row, i) => i === index ? { ...row, unit_price_dt: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <Button type="button" variant="outline" disabled={purchaseLines.length === 1} onClick={() => setPurchaseLines((rows) => rows.filter((_, i) => i !== index))}>{l.removeLine}</Button>
              </div>)}
              <Button type="button" variant="outline" onClick={() => setPurchaseLines((rows) => [...rows, { variety_id: "", quantity_kg: "", unit_price_dt: "" }])}>{l.addLine}</Button>
            </div>
            <label className="grid gap-1 text-sm font-medium">{l.notes}<input maxLength={1000} value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={createPurchase.isPending || updatePurchase.isPending || !purchaseSupplierId || !(varieties.data?.length) || purchaseLines.some((line) => !line.variety_id || !(Number(line.quantity_kg) > 0) || !(Number(line.unit_price_dt) >= 0))}>{editingPurchase ? l.updateDraft : l.createDraft}</Button>{editingPurchase && <Button type="button" variant="outline" onClick={cancelPurchaseEdit}>{l.cancelEdit}</Button>}</div>
          </form>
        </CardContent></Card>}
        {isAdmin && <Card><CardHeader><CardTitle>{l.receivingLocation}</CardTitle></CardHeader><CardContent><select value={receivingLocationId} onChange={(e) => setReceivingLocationId(e.target.value)} className="h-10 w-full max-w-xl rounded-lg border bg-background px-3"><option value="">—</option>{(locations.data ?? []).map((loc) => <option key={loc.id} value={loc.id}>{loc.code} · {loc.name}</option>)}</select></CardContent></Card>}
        <Card><CardHeader><CardTitle>{l.purchasesTab}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.supplier}</TableHead><TableHead>{l.purchaseDate}</TableHead><TableHead>{l.totalQuantity}</TableHead><TableHead>{l.totalAmount}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader><TableBody>
          {(purchases.data ?? []).map((purchase) => <TableRow key={purchase.id}>
            <TableCell className="font-mono text-xs">{purchase.status === "DRAFT" && isAdmin ? <button type="button" className="text-primary underline underline-offset-4 hover:opacity-80" onClick={() => startPurchaseEdit(purchase)} title={l.editPurchase}>{value(purchase.document_number)}</button> : value(purchase.document_number)}</TableCell>
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
                          return <option key={key(balance.lot_id, balance.location_id)} value={key(balance.lot_id, balance.location_id)}>{lot?.document_number ?? balance.lot_id} · {loc?.code ?? balance.location_id} · {displayOwnerLabel(balance.owner)} · {number(balance.quantity_kg)} kg</option>;
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
                <select required value={productionTankId} onChange={(e) => setProductionTankId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(tanks.data ?? []).filter((tank) => tank.active && (tank.role ?? "NORMAL") === "NORMAL").map((tank) => <option key={tank.id} value={tank.id}>{tank.code} · {tank.name}</option>)}</select>
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

      {tab === "custody" && <div className="space-y-4">
        {isAdmin && <Card><CardHeader><CardTitle>{l.custodyReceiptTitle}</CardTitle><CardDescription>{l.custodyReceiptNote}</CardDescription></CardHeader><CardContent>
          {(custodyClients.data?.length ?? 0) === 0 && <p className="mb-3 text-sm text-amber-700">{l.noCustodyClients}</p>}
          <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); receiveCustomerCustody.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{l.custodyCustomer}<select required value={custodyCustomerPhone} onChange={(e) => { setCustodyCustomerPhone(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(custodyClients.data ?? []).map((client) => <option key={client.phone} value={client.phone}>{client.client_name} · {client.phone}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyDate}<input required type="date" value={custodyReceiptDate} onChange={(e) => { setCustodyReceiptDate(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyVariety}<select required value={custodyVarietyId} onChange={(e) => { setCustodyVarietyId(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(varieties.data ?? []).filter((variety) => variety.active).map((variety) => <option key={variety.id} value={variety.id}>{lang === "ar" ? (variety.name_ar || variety.name_fr) : variety.name_fr}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyQuantity}<input required type="number" min="0.001" step="0.001" value={custodyReceiptQuantity} onChange={(e) => { setCustodyReceiptQuantity(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyLocation}<select required value={custodyReceivingLocationId} onChange={(e) => { setCustodyReceivingLocationId(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(locations.data ?? []).filter((location) => location.active && ["OLIVE_STORAGE", "STAGING"].includes(location.kind)).map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyAck}<input required minLength={3} maxLength={120} value={custodyReceiptAck} onChange={(e) => { setCustodyReceiptAck(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium md:col-span-2">{l.custodySource}<input maxLength={120} value={custodySourceReference} onChange={(e) => { setCustodySourceReference(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <div className="flex items-end"><Button type="submit" disabled={receiveCustomerCustody.isPending || !custodyCustomerPhone || !custodyVarietyId || !custodyReceivingLocationId || !(Number(custodyReceiptQuantity) > 0) || custodyReceiptAck.trim().length < 3}>{l.receiveCustody}</Button></div>
          </form>
        </CardContent></Card>}

        {isAdmin && <Card><CardHeader><CardTitle>{l.custodyReleaseTitle}</CardTitle><CardDescription>{l.custodyReleaseNote}</CardDescription></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); if (window.confirm(lang === "ar" ? "هل تؤكد تسليم هذه الكمية إلى مالكها؟ سيتم خصمها من المخزون ولن تُسجّل كعملية بيع." : "Confirmer la restitution au propriétaire ? La quantité sera débitée du stock et ne sera pas enregistrée comme une vente.")) releaseCustomerCustody.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{l.custodyCustomer}<select required value={pickupCustomerId} onChange={(e) => { setPickupCustomerId(e.target.value); setPickupBalanceKey(""); setPickupQuantity(""); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(custodyOwners.data ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.client_name} · {owner.client_phone}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyDate}<input required type="date" value={pickupDate} onChange={(e) => { setPickupDate(e.target.value); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyOilLot}<select required value={pickupBalanceKey} onChange={(e) => { setPickupBalanceKey(e.target.value); setPickupQuantity(""); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{availableCustomerOilBalances.map((balance) => { const lot = (lots.data ?? []).find((item) => item.id === balance.lot_id); const tank = (tanks.data ?? []).find((item) => item.id === balance.location_id); return <option key={balance.lot_id + "::" + balance.location_id} value={balance.lot_id + "::" + balance.location_id}>{lot?.document_number ?? balance.lot_id} · {tank?.code ?? balance.location_id} · {number(balance.quantity_kg)} kg</option>; })}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyQuantity}<input required type="number" min="0.001" step="0.001" max={selectedPickupBalance?.quantity_kg ?? undefined} value={pickupQuantity} disabled={!selectedPickupBalance} onChange={(e) => { setPickupQuantity(e.target.value); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyAck}<input required minLength={3} maxLength={120} value={pickupAck} onChange={(e) => { setPickupAck(e.target.value); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyReason}<input required minLength={5} maxLength={500} value={pickupReason} onChange={(e) => { setPickupReason(e.target.value); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <div className="md:col-span-3 flex flex-wrap items-center gap-3"><Button type="submit" disabled={releaseCustomerCustody.isPending || !pickupCustomerId || !pickupBalanceKey || !(Number(pickupQuantity) > 0) || Number(pickupQuantity) > Number(selectedPickupBalance?.quantity_kg ?? 0) || pickupAck.trim().length < 3 || pickupReason.trim().length < 5}>{l.releaseCustody}</Button>{pickupCustomerId && availableCustomerOilBalances.length === 0 && <span className="text-xs text-amber-700">{l.noCustomerOil}</span>}</div>
          </form>
        </CardContent></Card>}

        <Card><CardHeader><CardTitle>{l.custodyStatementTitle}</CardTitle><CardDescription>{l.selectCustodyOwner}</CardDescription><label className="mt-2 grid max-w-xl gap-1 text-sm font-medium">{l.custodyCustomer}<select value={pickupCustomerId} onChange={(e) => { setPickupCustomerId(e.target.value); setPickupBalanceKey(""); setPickupQuantity(""); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(custodyOwners.data ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.client_name} · {owner.client_phone}</option>)}</select></label></CardHeader><CardContent>
          {pickupCustomerId && custodyStatement.data ? <><div className="mb-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{l.olive}</p><p className="text-2xl font-semibold">{number(custodyStatement.data.current_balances_kg?.OLIVE)} kg</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{l.oil}</p><p className="text-2xl font-semibold">{number(custodyStatement.data.current_balances_kg?.OIL)} kg</p></div></div><Table><TableHeader><TableRow><TableHead>{l.custodyRecordedAt}</TableHead><TableHead>{l.document}</TableHead><TableHead>{l.custodyProduct}</TableHead><TableHead>{l.custodyMovement}</TableHead><TableHead>{l.custodyQuantity}</TableHead><TableHead>{l.custodyDelta}</TableHead><TableHead>{l.custodyBalance}</TableHead></TableRow></TableHeader><TableBody>{(custodyStatement.data.movements ?? []).map((movement: AnyRecord) => <TableRow key={movement.id}><TableCell>{date(movement.created_at)}</TableCell><TableCell className="font-mono text-xs">{value(movement.document_number)}</TableCell><TableCell>{movement.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell><TableCell>{value(movement.movement_kind)}</TableCell><TableCell>{number(movement.quantity_kg)} kg</TableCell><TableCell className={Number(movement.delta_kg) < 0 ? "text-red-700" : Number(movement.delta_kg) > 0 ? "text-emerald-700" : ""}>{Number(movement.delta_kg) > 0 ? "+" : ""}{number(movement.delta_kg)} kg</TableCell><TableCell>{number(movement.balance_after_kg)} kg</TableCell></TableRow>)}{(!custodyStatement.isLoading && !(custodyStatement.data.movements?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody></Table></> : <p className="text-sm text-muted-foreground">{pickupCustomerId ? (lang === "ar" ? "جار تحميل كشف الأمانة…" : "Chargement de l’état de garde…") : l.selectCustodyOwner}</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{l.custodyReceipts}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.custodyDate}</TableHead><TableHead>{l.custodyCustomer}</TableHead><TableHead>{l.custodyVariety}</TableHead><TableHead>{l.custodyQuantity}</TableHead><TableHead>{l.custodyLocation}</TableHead><TableHead>{l.custodyAck}</TableHead></TableRow></TableHeader><TableBody>
          {(custodyReceipts.data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{value(item.document_number)}</TableCell><TableCell>{date(item.receipt_date)}</TableCell><TableCell>{value(item.customer_name, item.customer_phone)}</TableCell><TableCell>{value((varieties.data ?? []).find((variety) => variety.id === item.variety_id)?.name_fr, item.variety_id)}</TableCell><TableCell>{number(item.quantity_kg)} kg</TableCell><TableCell>{value((locations.data ?? []).find((location) => location.id === item.receiving_location_id)?.code, item.receiving_location_id)}</TableCell><TableCell>{value(item.customer_acknowledgement_reference)}</TableCell></TableRow>)}{(!custodyReceipts.isLoading && !(custodyReceipts.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}
        </TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle>{l.custodyReleases}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.custodyDate}</TableHead><TableHead>{l.custodyCustomer}</TableHead><TableHead>{l.custodyOilLot}</TableHead><TableHead>{l.custodyQuantity}</TableHead><TableHead>{l.custodySourceTank}</TableHead><TableHead>{l.custodyAck}</TableHead></TableRow></TableHeader><TableBody>
          {(custodyReleases.data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{value(item.document_number)}</TableCell><TableCell>{date(item.release_date)}</TableCell><TableCell>{value(item.customer_name, item.customer_phone)}</TableCell><TableCell>{value((lots.data ?? []).find((lot) => lot.id === item.oil_lot_id)?.document_number, item.oil_lot_id)}</TableCell><TableCell>{number(item.quantity_kg)} kg</TableCell><TableCell>{value((tanks.data ?? []).find((tank) => tank.id === item.source_tank_id)?.code, item.source_tank_id)}</TableCell><TableCell>{value(item.customer_acknowledgement_reference)}</TableCell></TableRow>)}{(!custodyReleases.isLoading && !(custodyReleases.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}
        </TableBody></Table></CardContent></Card>
      </div>}

      {tab === "buyers" && <div className="space-y-4">
        {isAdmin && <Card><CardHeader><CardTitle>{editingBuyerId ? salesText.editBuyer : salesText.addBuyer}</CardTitle></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveBuyer.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{salesText.buyerName}<input required minLength={2} maxLength={160} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.buyerContact}<input maxLength={120} value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.buyerPhone}<input maxLength={40} value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.buyerTax}<input maxLength={80} value={buyerTaxId} onChange={(e) => setBuyerTaxId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.buyerEmail}<input type="email" maxLength={160} value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium md:col-span-2">{salesText.buyerAddress}<input maxLength={500} value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saveBuyer.isPending || !buyerName.trim()}><UserRound className="size-4" />{editingBuyerId ? salesText.saveBuyer : salesText.addBuyer}</Button>
              {editingBuyerId && <Button type="button" variant="outline" onClick={() => { setEditingBuyerId(""); setBuyerName(""); setBuyerContact(""); setBuyerPhone(""); setBuyerEmail(""); setBuyerTaxId(""); setBuyerAddress(""); }}><X className="size-4" />{salesText.cancelEdit}</Button>}
            </div>
          </form>
        </CardContent></Card>}
        <Card><CardHeader><CardTitle>{salesText.buyers}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{salesText.buyerName}</TableHead><TableHead>{salesText.buyerContact}</TableHead><TableHead>{salesText.buyerPhone}</TableHead><TableHead>{salesText.buyerTax}</TableHead><TableHead>{salesText.buyerAddress}</TableHead><TableHead>{l.status}</TableHead><TableHead>{salesText.account}</TableHead>{isAdmin && <TableHead>{l.actions}</TableHead>}</TableRow></TableHeader>
            <TableBody>{(buyers.data ?? []).map((buyer) => <TableRow key={buyer.id}>
              <TableCell className="font-semibold">{value(buyer.name)}</TableCell><TableCell>{value(buyer.contact_name)}</TableCell><TableCell>{value(buyer.phone)}</TableCell><TableCell>{value(buyer.tax_identifier)}</TableCell><TableCell>{value(buyer.address)}</TableCell>
              <TableCell><span className={buyer.active ? "text-emerald-700" : "text-muted-foreground"}>{buyer.active ? salesText.activeBuyer : salesText.inactiveBuyer}</span></TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={() => setSelectedBuyerAccountId(buyer.id)}><Wallet className="size-3.5" />{salesText.account}</Button></TableCell>
              {isAdmin && <TableCell><div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => { setEditingBuyerId(buyer.id); setBuyerName(buyer.name ?? ""); setBuyerContact(buyer.contact_name ?? ""); setBuyerPhone(buyer.phone ?? ""); setBuyerEmail(buyer.email ?? ""); setBuyerTaxId(buyer.tax_identifier ?? ""); setBuyerAddress(buyer.address ?? ""); }}><Pencil className="size-3.5" />{salesText.editBuyer}</Button>
                <Button size="sm" variant="outline" disabled={changeBuyerStatus.isPending} onClick={() => changeBuyerStatus.mutate(buyer)}>{buyer.active ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}{buyer.active ? salesText.deactivateBuyer : salesText.reactivateBuyer}</Button>
              </div></TableCell>}
            </TableRow>)}{(!buyers.isLoading && !(buyers.data?.length)) && <EmptyRow colSpan={isAdmin ? 8 : 7} text={l.noRows} />}</TableBody>
          </Table>
        </CardContent></Card>
        {selectedBuyerAccountId && <Card><CardHeader><CardTitle>{salesText.account} · {value(buyerAccountSummary.data?.buyer?.name)}</CardTitle></CardHeader><CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{salesText.accountInvoices}</p><p className="text-xl font-semibold">{buyerAccountSummary.data?.summary?.invoice_count ?? "—"}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{salesText.grossTotal}</p><p className="text-xl font-semibold">{number(buyerAccountSummary.data?.summary?.gross_invoiced_amount_dt)} DT</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{salesText.creditNotesTotal}</p><p className="text-xl font-semibold">{number(buyerAccountSummary.data?.summary?.credited_amount_dt)} DT</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{salesText.netReceivable}</p><p className="text-xl font-semibold">{number(buyerAccountSummary.data?.summary?.total_amount_dt)} DT</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{salesText.paidAmount}</p><p className="text-xl font-semibold">{number(buyerAccountSummary.data?.summary?.paid_amount_dt)} DT</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{salesText.appliedCredit}</p><p className="text-xl font-semibold">{number(buyerAccountSummary.data?.summary?.applied_credit_amount_dt)} DT</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{salesText.settledAmount}</p><p className="text-xl font-semibold">{number(buyerAccountSummary.data?.summary?.settled_amount_dt)} DT</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{salesText.outstanding}</p><p className="text-xl font-semibold">{number(buyerAccountSummary.data?.summary?.outstanding_amount_dt)} DT</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{salesText.buyerCreditBalance}</p><p className="text-xl font-semibold">{number(buyerAccountSummary.data?.summary?.buyer_credit_balance_dt)} DT</p></div>
          </div>
        </CardContent></Card>}
      </div>}

      {tab === "sales" && <div className="space-y-4">
        {isAdmin && <Card><CardHeader><CardTitle>{salesText.createSale}</CardTitle><CardDescription>{salesText.noEligibleOil}</CardDescription></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); createSale.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{salesText.saleDate}<input required type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.selectBuyer}<select required value={saleBuyerId} onChange={(e) => setSaleBuyerId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(buyers.data ?? []).filter((buyer) => buyer.active).map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.selectOilLot}<select required value={saleLotId} onChange={(e) => { setSaleLotId(e.target.value); setSaleTankId(""); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{availableMillOilLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.document_number} · {lot.quality_status}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.selectTank}<select required value={saleTankId} onChange={(e) => setSaleTankId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(balances.data ?? []).filter((balance) => balance.product_kind === "OIL" && balance.lot_id === saleLotId && balance.owner?.kind === "MILL" && Number(balance.quantity_kg) > 0 && (tanks.data ?? []).some((tank) => tank.id === balance.location_id && tank.active && (tank.role ?? "NORMAL") === "NORMAL")).map((balance) => { const tank = (tanks.data ?? []).find((item) => item.id === balance.location_id); return <option key={balance.location_id} value={balance.location_id}>{tank?.code ?? balance.location_id} · {number(balance.quantity_kg)} kg</option>; })}</select></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.saleQty}<input required type="number" min="0.001" step="0.001" max={(balances.data ?? []).find((b) => b.product_kind === "OIL" && b.lot_id === saleLotId && b.location_id === saleTankId && b.owner?.kind === "MILL")?.quantity_kg ?? undefined} value={saleQuantity} onChange={(e) => setSaleQuantity(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.salePrice}<input required type="number" min="0.001" step="0.001" value={saleUnitPrice} onChange={(e) => setSaleUnitPrice(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium md:col-span-3">{l.notes}<input maxLength={1000} value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <p className="text-xs text-amber-700 md:col-span-3">{salesText.taxNotice}</p>
            <Button type="submit" disabled={createSale.isPending || !saleBuyerId || !saleLotId || !saleTankId || !(Number(saleQuantity) > 0) || !(Number(saleUnitPrice) > 0)}><ShoppingCart className="size-4" />{salesText.createSale}</Button>
          </form>
        </CardContent></Card>}
        
        {isAdmin && <Card><CardHeader><CardTitle>{salesText.returnIntake}</CardTitle><CardDescription>{(tanks.data ?? []).some((tank) => tank.active && tank.role === "QUARANTINE") ? salesText.returnWarning : salesText.noQuarantineTank}</CardDescription></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (window.confirm(salesText.returnConfirm)) receiveSaleReturn.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{salesText.returnSale}<select required value={returnSaleId} onChange={(e) => { setReturnIdempotencyKey(crypto.randomUUID()); setReturnSaleId(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(sales.data ?? []).filter((sale) => sale.status === "APPROVED" && Number(sale.quantity_kg) - Number(sale.returned_quantity_kg ?? 0) > 0).map((sale) => <option key={sale.id} value={sale.id}>{sale.document_number} · {number(Number(sale.quantity_kg) - Number(sale.returned_quantity_kg ?? 0))} kg</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.quarantineTank}<select required value={returnTankId} onChange={(e) => { setReturnIdempotencyKey(crypto.randomUUID()); setReturnTankId(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(tanks.data ?? []).filter((tank) => tank.active && tank.role === "QUARANTINE").map((tank) => <option key={tank.id} value={tank.id}>{tank.code} · {tank.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.returnQty}<input required type="number" min="0.001" step="0.001" max={(sales.data ?? []).find((sale) => sale.id === returnSaleId) ? Number((sales.data ?? []).find((sale) => sale.id === returnSaleId)?.quantity_kg) - Number((sales.data ?? []).find((sale) => sale.id === returnSaleId)?.returned_quantity_kg ?? 0) : undefined} value={returnQuantity} onChange={(e) => { setReturnIdempotencyKey(crypto.randomUUID()); setReturnQuantity(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium md:col-span-2">{salesText.returnReason}<input required minLength={5} maxLength={500} value={returnReason} onChange={(e) => { setReturnIdempotencyKey(crypto.randomUUID()); setReturnReason(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.ackRef}<input maxLength={120} value={returnAcknowledgement} onChange={(e) => { setReturnIdempotencyKey(crypto.randomUUID()); setReturnAcknowledgement(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <Button type="submit" disabled={receiveSaleReturn.isPending || !returnSaleId || !returnTankId || !(Number(returnQuantity) > 0) || returnReason.trim().length < 5 || !(tanks.data ?? []).some((tank) => tank.id === returnTankId && tank.role === "QUARANTINE")}>{salesText.returnIntake}</Button>
          </form>
        </CardContent></Card>}
<Card><CardHeader><CardTitle>{salesText.saleHistory}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{salesText.saleDate}</TableHead><TableHead>{salesText.buyerName}</TableHead><TableHead>{salesText.selectOilLot}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{salesText.total}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader>
            <TableBody>{(sales.data ?? []).map((sale) => <TableRow key={sale.id}><TableCell className="font-mono text-xs">{value(sale.document_number)}</TableCell><TableCell>{date(sale.sale_date)}</TableCell><TableCell>{value((buyers.data ?? []).find((b) => b.id === sale.buyer_id)?.name, sale.buyer_id)}</TableCell><TableCell>{value((lots.data ?? []).find((lot) => lot.id === sale.oil_lot_id)?.document_number, sale.oil_lot_id)}</TableCell><TableCell>{number(sale.quantity_kg)}</TableCell><TableCell>{number(sale.total_amount_dt)} DT</TableCell><TableCell>{value(sale.status)}</TableCell><TableCell>{isAdmin && sale.status === "DRAFT" ? <div className="flex flex-wrap gap-1">
              <Button size="sm" disabled={approveSale.isPending || cancelSale.isPending} onClick={() => approveSale.mutate(sale)}>{salesText.approveSale}</Button>
              <Button size="sm" variant="outline" disabled={approveSale.isPending || cancelSale.isPending} onClick={() => { const reason = window.prompt(salesText.cancelSalePrompt); if (reason && reason.trim().length >= 5) cancelSale.mutate({ sale, reason: reason.trim() }); else if (reason !== null) toast.error(lang === "ar" ? "سبب الإلغاء يجب أن يكون 5 أحرف على الأقل" : "Le motif doit contenir au moins 5 caractères"); }}><Ban className="size-3.5" />{salesText.cancelSale}</Button>
            </div> : value((salesInvoices.data ?? []).find((invoice) => invoice.id === sale.invoice_id)?.document_number)}</TableCell></TableRow>)}{(!sales.isLoading && !(sales.data?.length)) && <EmptyRow colSpan={8} text={l.noRows} />}</TableBody>
          </Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{salesText.returnHistory}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{salesText.returnSale}</TableHead><TableHead>{salesText.returnQty}</TableHead><TableHead>{salesText.quarantineTank}</TableHead><TableHead>{l.qualityStatus}</TableHead><TableHead>{l.status}</TableHead><TableHead>{salesText.creditNote}</TableHead><TableHead>{salesText.creditedAmount}</TableHead><TableHead>{salesText.returnRejection}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader>
            <TableBody>{(saleReturns.data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{value(item.document_number)}</TableCell><TableCell>{value((sales.data ?? []).find((sale) => sale.id === item.sale_id)?.document_number, item.sale_id)}</TableCell><TableCell>{number(item.quantity_kg)}</TableCell><TableCell>{value((tanks.data ?? []).find((tank) => tank.id === item.quarantine_tank_id)?.code, item.quarantine_tank_id)}</TableCell><TableCell>{value((lots.data ?? []).find((lot) => lot.id === item.returned_oil_lot_id)?.quality_status, item.quality_status)}</TableCell><TableCell>{value(item.commercial_acceptance_status)}</TableCell><TableCell>{value((creditNotes.data ?? []).find((note) => note.id === item.credit_note_id)?.document_number)}</TableCell><TableCell>{number((creditNotes.data ?? []).find((note) => note.id === item.credit_note_id)?.amount_dt)} DT</TableCell><TableCell className="font-mono text-xs">{value(returnRejections.data?.find((doc) => doc.return_id === item.id)?.document_number)}</TableCell><TableCell>{isAdmin && item.status === "RECEIVED" && item.commercial_acceptance_status === "PENDING" ? <div className="flex flex-wrap gap-1"><Button size="sm" disabled={acceptSaleReturn.isPending || rejectSaleReturn.isPending} onClick={() => { const reason = window.prompt(salesText.returnAcceptancePrompt); if (reason && reason.trim().length >= 5) { const normalizedReason = reason.trim(); const previous = returnAcceptanceKeys[item.id]; const idempotencyKey = previous?.reason === normalizedReason ? previous.key : crypto.randomUUID(); setReturnAcceptanceKeys((current) => ({ ...current, [item.id]: { key: idempotencyKey, reason: normalizedReason } })); acceptSaleReturn.mutate({ item, reason: normalizedReason, idempotencyKey }); } else if (reason !== null) toast.error(lang === "ar" ? "يجب أن يحتوي السبب على 5 أحرف على الأقل" : "Le motif doit contenir au moins 5 caractères"); }}>{salesText.acceptReturn}</Button><Button size="sm" variant="destructive" disabled={acceptSaleReturn.isPending || rejectSaleReturn.isPending} onClick={() => { const reason = window.prompt(salesText.returnRejectionReason); if (reason === null) return; const normalizedReason = reason.trim(); if (normalizedReason.length < 5) { toast.error(lang === "ar" ? "يجب أن يحتوي السبب على 5 أحرف على الأقل" : "Le motif doit contenir au moins 5 caractères"); return; } const receiptReference = window.prompt(salesText.buyerReceiptReference); if (receiptReference === null) return; const normalizedReference = receiptReference.trim(); if (normalizedReference.length < 3) { toast.error(lang === "ar" ? "مرجع استلام الحريف مطلوب" : "La référence de réception par l’acheteur est obligatoire"); return; } if (!window.confirm(salesText.rejectReturnConfirm)) return; const previous = returnRejectionKeys[item.id]; const idempotencyKey = previous?.reason === normalizedReason && previous.receiptReference === normalizedReference ? previous.key : crypto.randomUUID(); setReturnRejectionKeys((current) => ({ ...current, [item.id]: { key: idempotencyKey, reason: normalizedReason, receiptReference: normalizedReference } })); rejectSaleReturn.mutate({ item, reason: normalizedReason, receiptReference: normalizedReference, idempotencyKey }); }}>{salesText.rejectReturn}</Button></div> : "—"}</TableCell></TableRow>)}{(!saleReturns.isLoading && !(saleReturns.data?.length)) && <EmptyRow colSpan={10} text={l.noRows} />}</TableBody>
          </Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{salesText.invoice}</CardTitle><CardDescription>{salesText.taxNotice}</CardDescription></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{salesText.invoiceNo}</TableHead><TableHead>{salesText.buyerName}</TableHead><TableHead>{salesText.netTotal}</TableHead><TableHead>{salesText.paidAmount}</TableHead><TableHead>{salesText.appliedCredit}</TableHead><TableHead>{salesText.outstanding}</TableHead><TableHead>{salesText.paymentStatus}</TableHead></TableRow></TableHeader>
            <TableBody>{(salesInvoices.data ?? []).map((invoice) => <TableRow key={invoice.id} className={selectedInvoiceId === invoice.id ? "bg-muted/60" : ""} onClick={() => setSelectedInvoiceId(invoice.id)}><TableCell className="font-mono text-xs">{value(invoice.document_number)}</TableCell><TableCell>{value((buyers.data ?? []).find((b) => b.id === invoice.buyer_id)?.name, invoice.buyer_id)}</TableCell><TableCell>{number(invoice.net_amount_dt ?? invoice.total_amount_dt)} DT</TableCell><TableCell>{number(invoice.paid_amount_dt)} DT</TableCell><TableCell>{number(invoice.applied_credit_amount_dt)} DT</TableCell><TableCell>{number(invoice.outstanding_amount_dt)} DT</TableCell><TableCell>{invoice.payment_status === "CREDITED" ? salesText.credited : invoice.payment_status === "PAID" ? salesText.paid : invoice.payment_status === "PARTIALLY_PAID" ? salesText.partial : salesText.unpaid}</TableCell></TableRow>)}{(!salesInvoices.isLoading && !(salesInvoices.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody>
          </Table>
          {selectedInvoiceId && <div className="mt-4 space-y-3 rounded-xl border p-4">
            {invoiceBuyerSummary.data?.summary && <div className="rounded-lg border p-3 text-sm"><span className="font-medium">{salesText.creditAvailable}: </span>{number(invoiceBuyerSummary.data.summary.buyer_credit_balance_dt ?? 0)} DT</div>}
            {isAdmin && selectedSalesInvoice && Number(invoiceBuyerSummary.data?.summary?.buyer_credit_balance_dt ?? 0) > 0 && Number(selectedSalesInvoice.outstanding_amount_dt) > 0 && <div className="rounded-lg border p-3">
              <h3 className="mb-2 font-semibold">{salesText.applyCredit}</h3>
              <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (window.confirm(salesText.creditApplyConfirm)) applyBuyerCredit.mutate(); }}>
                <label className="grid gap-1 text-sm font-medium">{salesText.creditAmount}<input required type="number" min="0.001" step="0.001" max={Math.min(Number(invoiceBuyerSummary.data?.summary?.buyer_credit_balance_dt ?? 0), Number(selectedSalesInvoice.outstanding_amount_dt))} value={creditApplicationAmount} onChange={(e) => { setCreditApplicationAmount(e.target.value); setCreditApplicationKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium md:col-span-2">{salesText.creditReason}<input required minLength={5} maxLength={500} value={creditApplicationReason} onChange={(e) => { setCreditApplicationReason(e.target.value); setCreditApplicationKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <div className="md:col-span-3"><Button type="submit" disabled={applyBuyerCredit.isPending || !(Number(creditApplicationAmount) > 0) || Number(creditApplicationAmount) > Math.min(Number(invoiceBuyerSummary.data?.summary?.buyer_credit_balance_dt ?? 0), Number(selectedSalesInvoice.outstanding_amount_dt)) || creditApplicationReason.trim().length < 5}><Wallet className="size-4"/>{salesText.applyCredit}</Button></div>
              </form>
            </div>}
            <h3 className="font-semibold">{salesText.recordPayment}</h3>
            {isAdmin && <form className="grid gap-3 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); recordPayment.mutate(); }}>
              <label className="grid gap-1 text-sm font-medium">{salesText.paymentDate}<input required type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.paymentAmount}<input required type="number" min="0.001" step="0.001" max={Math.max(0, Number(selectedSalesInvoice?.outstanding_amount_dt ?? 0))} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.paymentMethod}<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="CASH">{salesText.cash}</option><option value="BANK_TRANSFER">{salesText.bank}</option><option value="CHEQUE">{salesText.cheque}</option></select></label>
              <label className="grid gap-1 text-sm font-medium">{lang === "ar" ? "مرجع العملية" : "Référence du paiement"}<input maxLength={120} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <div className="flex items-end"><Button type="submit" disabled={recordPayment.isPending || !(Number(paymentAmount) > 0) || Number(selectedSalesInvoice?.outstanding_amount_dt ?? 0) <= 0 || Number(paymentAmount) > Number(selectedSalesInvoice?.outstanding_amount_dt ?? 0) || (paymentMethod !== "CASH" && !paymentReference.trim())}><Wallet className="size-4" />{salesText.recordPayment}</Button></div>
            </form>}
            <div className="pt-2"><h4 className="mb-2 text-sm font-semibold">{salesText.creditApplicationHistory}</h4><Table><TableHeader><TableRow><TableHead>{salesText.creditApplicationNumber}</TableHead><TableHead>{salesText.paymentDate}</TableHead><TableHead>{salesText.creditAmount}</TableHead><TableHead>{salesText.creditReason}</TableHead></TableRow></TableHeader><TableBody>{(creditApplications.data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{value(item.document_number)}</TableCell><TableCell>{date(item.created_at)}</TableCell><TableCell>{number(item.amount_dt)} DT</TableCell><TableCell>{value(item.reason)}</TableCell></TableRow>)}{(!creditApplications.isLoading && !(creditApplications.data?.length)) && <EmptyRow colSpan={4} text={l.noRows} />}</TableBody></Table></div>
            <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{salesText.paymentDate}</TableHead><TableHead>{salesText.paymentAmount}</TableHead><TableHead>{salesText.paymentMethod}</TableHead><TableHead>{lang === "ar" ? "المرجع" : "Référence"}</TableHead><TableHead>{salesText.remainingReversible}</TableHead><TableHead>{salesText.reversePayment}</TableHead></TableRow></TableHeader><TableBody>{(salePayments.data ?? []).map((payment) => { const remaining = Number(payment.remaining_reversible_dt ?? payment.amount_dt); return <TableRow key={payment.id}><TableCell>{value(payment.document_number)}</TableCell><TableCell>{date(payment.payment_date)}</TableCell><TableCell>{number(payment.amount_dt)} DT</TableCell><TableCell>{value(payment.method)}</TableCell><TableCell>{value(payment.reference)}</TableCell><TableCell>{number(remaining)} DT</TableCell><TableCell>{isAdmin && <Button type="button" size="sm" variant="outline" disabled={remaining <= 0} onClick={() => { setSelectedPaymentForReversal(payment.id); setReversalAmount(remaining.toFixed(3)); setReversalReason(""); setReversalDate(new Date().toISOString().slice(0, 10)); setReversalEvidenceReference(payment.reference || ""); setReversalKey(crypto.randomUUID()); }}>{salesText.reversePayment}</Button>}</TableCell></TableRow>; })}{(!salePayments.isLoading && !(salePayments.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody></Table>
            {isAdmin && selectedPayment && <div className="rounded-lg border p-3"><h4 className="mb-2 font-semibold">{salesText.reversePayment} · {value(selectedPayment.document_number)}</h4><p className="mb-3 text-xs text-muted-foreground">{salesText.remainingReversible}: {number(Number(selectedPayment.remaining_reversible_dt ?? selectedPayment.amount_dt))} DT</p><form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); if (window.confirm(salesText.reverseConfirm)) reversePayment.mutate(); }}><label className="grid gap-1 text-sm font-medium">{salesText.reversalDate}<input required type="date" value={reversalDate} onChange={(e) => { setReversalDate(e.target.value); setReversalKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label><label className="grid gap-1 text-sm font-medium">{salesText.reverseAmount}<input required type="number" min="0.001" step="0.001" max={Math.max(0, Number(selectedPayment.amount_dt) - (paymentReversals.data ?? []).filter((item) => item.payment_id === selectedPayment.id).reduce((sum, item) => sum + Number(item.amount_dt), 0))} value={reversalAmount} onChange={(e) => { setReversalAmount(e.target.value); setReversalKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label><label className="grid gap-1 text-sm font-medium">{salesText.reversalEvidence}<input maxLength={120} value={reversalEvidenceReference} onChange={(e) => { setReversalEvidenceReference(e.target.value); setReversalKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label><label className="grid gap-1 text-sm font-medium">{salesText.reverseReason}<input required minLength={5} maxLength={500} value={reversalReason} onChange={(e) => { setReversalReason(e.target.value); setReversalKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label><div className="md:col-span-4 flex gap-2"><Button type="submit" disabled={reversePayment.isPending || !(Number(reversalAmount) > 0) || Number(reversalAmount) > Number(selectedPayment.amount_dt) - (paymentReversals.data ?? []).filter((item) => item.payment_id === selectedPayment.id).reduce((sum, item) => sum + Number(item.amount_dt), 0) || reversalReason.trim().length < 5}>{salesText.reversePayment}</Button><Button type="button" variant="outline" onClick={() => setSelectedPaymentForReversal("")}>{lang === "ar" ? "إلغاء" : "Annuler"}</Button></div></form></div>}
            <div className="pt-2"><h4 className="mb-2 text-sm font-semibold">{salesText.reversalHistory}</h4><Table><TableHeader><TableRow><TableHead>{salesText.reversalNumber}</TableHead><TableHead>{salesText.invoiceNo}</TableHead><TableHead>{salesText.paymentDate}</TableHead><TableHead>{salesText.reverseAmount}</TableHead><TableHead>{salesText.reverseReason}</TableHead><TableHead>{l.status}</TableHead></TableRow></TableHeader><TableBody>{(paymentReversals.data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{value(item.document_number)}</TableCell><TableCell>{value(item.original_payment_number)}</TableCell><TableCell>{date(item.created_at)}</TableCell><TableCell>{number(item.amount_dt)} DT</TableCell><TableCell>{value(item.reason)}</TableCell><TableCell>{value(item.status)}</TableCell></TableRow>)}{(!paymentReversals.isLoading && !(paymentReversals.data?.length)) && <EmptyRow colSpan={6} text={l.noRows} />}</TableBody></Table></div>
          </div>}
        </CardContent></Card>
      </div>}

      {tab === "permissions" && isAdmin && <Card>
        <CardHeader><CardTitle>{l.permissionsTab}</CardTitle><CardDescription>{l.noPermission}</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-4">
            <label className="grid max-w-xl gap-1 text-sm font-medium">{l.chooseWorker}
              <select value={selectedWorkerId} onChange={(e) => setSelectedWorkerId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(workers.data ?? []).filter((worker) => worker.role === "worker" && worker.active).map((worker) => <option key={worker.id} value={worker.id}>{worker.full_name} · {worker.username}</option>)}</select>
            </label>
            {(workers.data ?? []).filter((worker) => worker.role === "worker" && worker.active).length === 0 && <p className="text-sm text-muted-foreground">{l.noWorkers}</p>}
            {selectedWorkerId && <div className="space-y-3 rounded-xl border p-4">
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={assignedPermissions.includes("commercial.lab_record")} onChange={(e) => setAssignedPermissions((current) => e.target.checked ? [...current, "commercial.lab_record"] : current.filter((item) => item !== "commercial.lab_record"))} />{l.labPermission}</label>
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={assignedPermissions.includes("commercial.quality_release")} onChange={(e) => setAssignedPermissions((current) => e.target.checked ? [...current, "commercial.quality_release"] : current.filter((item) => item !== "commercial.quality_release"))} />{l.reviewerPermission}</label>
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={assignedPermissions.includes("commercial.view_audit")} onChange={(e) => setAssignedPermissions((current) => e.target.checked ? [...current, "commercial.view_audit"] : current.filter((item) => item !== "commercial.view_audit"))} />{l.auditPermission}</label>
              <Button disabled={saveWorkerPermissions.isPending || targetPermissions.isLoading || targetPermissions.isError} onClick={() => saveWorkerPermissions.mutate()}>{l.savePermissions}</Button>
            </div>}
          </div>
        </CardContent>
      </Card>}
    </div>
  );
}
