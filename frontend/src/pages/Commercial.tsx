import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, Beaker, Boxes, ClipboardList, Factory,
  RefreshCw, ShieldCheck, Warehouse, ShoppingCart, UserRound, Wallet, Pencil, UserX, UserCheck, X, Ban,
} from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
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
type TabKey = "overview" | "tanks" | "lots" | "movements" | "quality" | "audit" | "suppliers" | "locations" | "varieties" | "purchases" | "production" | "custody" | "buyers" | "sales" | "permissions";

const labels = {
  fr: {
    permissionsTab: "Droits des employés", chooseWorker: "Choisir un employé", labPermission: "Saisie des analyses laboratoire", reviewerPermission: "Validation indépendante de la qualité", auditPermission: "Consultation du journal d’audit", savePermissions: "Enregistrer les autorisations", permissionsSaved: "Autorisations mises à jour", noWorkers: "Aucun compte employé actif.",
    labEntry: "Saisie des analyses", sampleReference: "Référence de l’échantillon", sampleDate: "Date de prélèvement", testedDate: "Date d’analyse", laboratory: "Laboratoire", specification: "Référence de la norme", measurementCode: "Paramètre", measurementValue: "Résultat", measurementUnit: "Unité", addMeasurement: "Ajouter un paramètre", submitAssessment: "Soumettre les résultats", assessmentSaved: "Résultats transmis pour revue indépendante", assessmentList: "Analyses enregistrées", reviewerPanel: "Décision indépendante", chooseAssessment: "Analyse à examiner", decision: "Décision", releaseOil: "Accepter le lot", rejectOil: "Refuser le lot", decisionReason: "Justification de la décision (10 caractères minimum)", decisionSaved: "Décision qualité enregistrée", noAssessment: "Aucune analyse en attente de revue", noLabPermission: "Vous ne disposez pas de la permission de saisie laboratoire.", noReviewPermission: "Vous ne disposez pas de la permission de validation qualité.", awaitingReview: "En attente de revue", reviewed: "Examinée", submitter: "Analyste", reviewer: "Réviseur", qualityLot: "Lot d’huile",
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
    varietiesTab: "Variétés d’olives", varietyCode: "Code variété", varietyNameFr: "Nom en français", varietyNameAr: "Nom en arabe", addVariety: "Ajouter une variété", varietySaved: "Variété ajoutée",     purchasesTab: "Achats d’olives", newPurchase: "Nouvel achat", purchaseDate: "Date d’achat", supplier: "Fournisseur", variety: "Variété", unitPrice: "Prix unitaire (DT/kg)", addLine: "Ajouter une ligne", removeLine: "Retirer", createDraft: "Créer le brouillon", purchaseCreated: "Brouillon d’achat créé", approve: "Approuver et réceptionner", receivingLocation: "Emplacement de réception", totalAmount: "Montant total (DT)", totalQuantity: "Quantité totale (kg)", draft: "Brouillon", approved: "Approuvé", noSuppliers: "Créez d’abord un fournisseur.", noVarieties: "Créez d’abord les variétés commerciales.",     suppliers: "Fournisseurs", locationsTab: "Emplacements", supplierName: "Nom du fournisseur", supplierPhone: "Téléphone", taxId: "Identifiant fiscal", addSupplier: "Ajouter le fournisseur", supplierSaved: "Fournisseur ajouté", locationCode: "Code", locationName: "Nom de l’emplacement", locationType: "Type", oliveStorage: "Stockage olives", staging: "Zone de préparation", addLocation: "Ajouter l’emplacement", locationSaved: "Emplacement ajouté", custodyTab: "Garde des clients", custodyReceiptTitle: "Réception d’olives appartenant au client", custodyReleaseTitle: "Restitution d’huile au propriétaire", custodyCustomer: "Client propriétaire", custodyDate: "Date", custodyVariety: "Variété", custodyQuantity: "Quantité (kg)", custodyLocation: "Emplacement de réception", custodyAck: "Référence de l’accusé client", custodySource: "Référence source (facultative)", custodyReason: "Motif de restitution", receiveCustody: "Enregistrer la réception en garde", releaseCustody: "Restituer l’huile au client", custodyReceipts: "Historique des réceptions en garde", custodyReleases: "Historique des restitutions", custodyOilLot: "Lot d’huile", custodySourceTank: "Cuve de sortie", noCustodyClients: "Aucun client enregistré. Ajoutez d’abord le client dans le carnet.", noCustomerOil: "Aucun lot d’huile de ce client n’est disponible dans une cuve normale après validation qualité.", custodyReceiptNote: "Cette réception enregistre des olives appartenant au client. Elle ne crée ni achat ni dette fournisseur.", custodyReleaseNote: "La restitution n’est pas une vente et ne génère aucune facture.",notes: "Notes",
  },
  ar: {
    permissionsTab: "صلاحيات العمال", chooseWorker: "اختيار العامل", labPermission: "تسجيل التحاليل المخبرية", reviewerPermission: "المراجعة المستقلة للجودة", auditPermission: "الاطلاع على سجل التدقيق", savePermissions: "حفظ الصلاحيات", permissionsSaved: "تم تحديث الصلاحيات", noWorkers: "لا توجد حسابات عمال نشطة.",
    labEntry: "تسجيل التحاليل", sampleReference: "مرجع العينة", sampleDate: "تاريخ أخذ العينة", testedDate: "تاريخ التحليل", laboratory: "المخبر", specification: "مرجع المواصفة", measurementCode: "المعيار", measurementValue: "النتيجة", measurementUnit: "الوحدة", addMeasurement: "إضافة معيار", submitAssessment: "إرسال النتائج", assessmentSaved: "تم إرسال النتائج للمراجعة المستقلة", assessmentList: "التحاليل المسجلة", reviewerPanel: "قرار الجودة المستقل", chooseAssessment: "التحليل المطلوب مراجعته", decision: "القرار", releaseOil: "قبول الدفعة", rejectOil: "رفض الدفعة", decisionReason: "تعليل القرار (10 أحرف على الأقل)", decisionSaved: "تم تسجيل قرار الجودة", noAssessment: "لا توجد تحاليل تنتظر المراجعة", noLabPermission: "ليست لديك صلاحية تسجيل التحاليل.", noReviewPermission: "ليست لديك صلاحية اعتماد الجودة.", awaitingReview: "في انتظار المراجعة", reviewed: "تمت المراجعة", submitter: "المحلل", reviewer: "المراجع", qualityLot: "دفعة الزيت",
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
    varietiesTab: "أصناف الزيتون", varietyCode: "رمز الصنف", varietyNameFr: "الاسم بالفرنسية", varietyNameAr: "الاسم بالعربية", addVariety: "إضافة صنف", varietySaved: "تمت إضافة الصنف",     purchasesTab: "شراء الزيتون", newPurchase: "شراء جديد", purchaseDate: "تاريخ الشراء", supplier: "المزوّد", variety: "الصنف", unitPrice: "السعر للوحدة (د.ت/كغ)", addLine: "إضافة سطر", removeLine: "حذف السطر", createDraft: "إنشاء مسودة", purchaseCreated: "تم إنشاء مسودة الشراء", approve: "اعتماد واستلام", receivingLocation: "موقع الاستلام", totalAmount: "المبلغ الجملي (د.ت)", totalQuantity: "الكمية الجملية (كغ)", draft: "مسودة", approved: "معتمد", noSuppliers: "أنشئ مزوّداً أولاً.", noVarieties: "أنشئ أصناف الزيتون التجارية أولاً.",     suppliers: "المزوّدون", locationsTab: "مواقع التخزين", supplierName: "اسم المزوّد", supplierPhone: "الهاتف", taxId: "المعرّف الجبائي", addSupplier: "إضافة المزوّد", supplierSaved: "تمت إضافة المزوّد", locationCode: "الرمز", locationName: "اسم الموقع", locationType: "النوع", oliveStorage: "مخزن الزيتون", staging: "منطقة التحضير", addLocation: "إضافة الموقع", locationSaved: "تمت إضافة الموقع", custodyTab: "أمانة الحرفاء", custodyReceiptTitle: "استلام زيتون مملوك للحريف", custodyReleaseTitle: "إرجاع الزيت إلى مالكه", custodyCustomer: "الحريف المالك", custodyDate: "التاريخ", custodyVariety: "الصنف", custodyQuantity: "الكمية (كغ)", custodyLocation: "مكان الاستلام", custodyAck: "مرجع وصل إقرار الحريف", custodySource: "مرجع المصدر (اختياري)", custodyReason: "سبب التسليم", receiveCustody: "تسجيل استلام الأمانة", releaseCustody: "تسليم الزيت إلى الحريف", custodyReceipts: "سجل استلام الأمانة", custodyReleases: "سجل تسليم الزيت", custodyOilLot: "دفعة الزيت", custodySourceTank: "الخزان المصدر", noCustodyClients: "لا يوجد حرفاء مسجلون. أضف الحريف أولاً إلى دفتر الحرفاء.", noCustomerOil: "لا توجد دفعة زيت مملوكة لهذا الحريف ومتاحة في خزان عادي بعد المصادقة على الجودة.", custodyReceiptNote: "هذا الإجراء يسجل زيتوناً مملوكاً للحريف ولا ينشئ عملية شراء أو ديناً للمزوّد.", custodyReleaseNote: "تسليم الزيت ليس عملية بيع ولا ينشئ فاتورة.",notes: "ملاحظات",
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
    paymentStatus: "حالة الخلاص", unpaid: "غير خالصة", partial: "خلاص جزئي", paid: "خالصة",
    taxNotice: "المعالجة الجبائية غير مضبوطة بعد؛ هذه فاتورة تجارية داخلية وليست فاتورة جبائية جاهزة.",
    chooseInvoice: "اختر الفاتورة", paymentAmount: "مبلغ الخلاص (د.ت)",
    paymentMethod: "طريقة الخلاص", paymentDate: "تاريخ الخلاص", recordPayment: "تسجيل الخلاص",
    paymentSaved: "تم تسجيل الخلاص", cash: "نقداً", bank: "تحويل بنكي", cheque: "صك",
    outstanding: "الباقي", total: "المجموع", paidAmount: "المبلغ المدفوع",
    saleCancelled: "تم إلغاء مسودة البيع", returnIntake: "تسجيل مرتجع زيت", returnWarning: "سيبقى الزيت المرتجع في الحجر وغير قابل للبيع إلى حين إعادة التحليل والاعتماد.", returnConfirm: "تأكيد استلام الكمية في خزان الحجر؟ سيُسجّل ذلك كمرتجع فعلي.", returnSale: "عملية البيع الأصلية", returnQty: "الكمية المرتجعة (كغ)", quarantineTank: "خزان الحجر", returnReason: "سبب الإرجاع", returnSaved: "تم استلام المرتجع في خزان الحجر", returnHistory: "سجل المرتجعات", acceptReturn: "قبول المرتجع وإصدار إشعار دائن", returnAccepted: "تم قبول المرتجع وإصدار الإشعار الدائن", returnAcceptancePrompt: "اذكر سبب القبول التجاري (5 أحرف على الأقل):", creditNote: "الإشعار الدائن", netTotal: "الصافي بعد الإشعارات", credited: "مغطاة بإشعار دائن", creditedAmount: "المبلغ الدائن", noQuarantineTank: "يجب تعيين خزان فارغ للحجر أولاً من تبويب الخزانات.", remainingReturnable: "الكمية المتبقية للإرجاع", ackRef: "مرجع إقرار الحريف", cancelSalePrompt: "اذكر سبب إلغاء مسودة البيع (5 أحرف على الأقل):", cancelSale: "إلغاء المسودة",
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
    paymentStatus: "Paiement", unpaid: "Impayée", partial: "Partiellement payée", paid: "Payée",
    taxNotice: "Traitement fiscal non configuré : document commercial interne, pas encore une facture fiscale prête à émettre.",
    chooseInvoice: "Choisir la facture", paymentAmount: "Montant reçu (DT)",
    paymentMethod: "Mode de paiement", paymentDate: "Date du paiement", recordPayment: "Enregistrer le paiement",
    paymentSaved: "Paiement enregistré", cash: "Espèces", bank: "Virement", cheque: "Chèque",
    outstanding: "Solde dû", total: "Total", paidAmount: "Payé",
    saleCancelled: "Brouillon de vente annulé", returnIntake: "Réception d’un retour d’huile", returnWarning: "L’huile retournée reste en quarantaine et ne peut être vendue avant une nouvelle analyse et validation.", returnConfirm: "Confirmer la réception physique du retour dans la cuve de quarantaine ?", returnSale: "Vente d’origine", returnQty: "Quantité retournée (kg)", quarantineTank: "Cuve de quarantaine", returnReason: "Motif du retour", returnSaved: "Retour reçu en quarantaine", returnHistory: "Historique des retours", acceptReturn: "Accepter le retour et émettre l’avoir", returnAccepted: "Retour accepté et avoir émis", returnAcceptancePrompt: "Motif de l’acceptation commerciale (5 caractères minimum) :", creditNote: "Avoir", netTotal: "Net après avoirs", credited: "Soldée par avoir", creditedAmount: "Montant crédité", noQuarantineTank: "Désignez d’abord une cuve vide comme quarantaine dans l’onglet Cuves.", remainingReturnable: "Quantité encore retournable", ackRef: "Référence d’accusé de l’acheteur", cancelSalePrompt: "Motif de l’annulation (5 caractères minimum) :", cancelSale: "Annuler le brouillon",
    noEligibleOil: "Aucun lot d’huile libéré, appartenant à la maâsra et disponible à la vente.",
  };
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
  const [qualityLotId, setQualityLotId] = useState("");
  const [sampleReference, setSampleReference] = useState("");
  const [sampleDate, setSampleDate] = useState(new Date().toISOString().slice(0, 10));
  const [testedDate, setTestedDate] = useState(new Date().toISOString().slice(0, 10));
  const [laboratoryName, setLaboratoryName] = useState("");
  const [specificationReference, setSpecificationReference] = useState("");
  const [measurements, setMeasurements] = useState([{ code: "", value: "", unit: "" }]);
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
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
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
  const permissions = useQuery({ queryKey: ["commercial", "my-permissions"], queryFn: () => apiGet<{ permissions: string[] }>("/commercial/v1/me/permissions"), enabled: ready });
  const workers = useQuery({ queryKey: ["commercial", "workers"], queryFn: () => apiGet<AnyRecord[]>("/users"), enabled: ready && isAdmin && tab === "permissions" });
  const targetPermissions = useQuery({ queryKey: ["commercial", "worker-permissions", selectedWorkerId], queryFn: () => apiGet<{ permissions: string[] }>(`/commercial/v1/users/${encodeURIComponent(selectedWorkerId)}/commercial-permissions`), enabled: ready && isAdmin && tab === "permissions" && !!selectedWorkerId });
  const audit = useQuery({ queryKey: ["commercial", "audit"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/audit-events?limit=500"), enabled: ready && tab === "audit" });
  const suppliers = useQuery({ queryKey: ["commercial", "suppliers"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/suppliers"), enabled: ready && (tab === "suppliers" || tab === "purchases") });
  const locations = useQuery({ queryKey: ["commercial", "locations"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/locations"), enabled: ready && (tab === "locations" || tab === "purchases" || tab === "production" || tab === "custody") });
  const varieties = useQuery({ queryKey: ["commercial", "varieties"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/varieties"), enabled: ready && (tab === "varieties" || tab === "purchases" || tab === "custody") });
  const purchases = useQuery({ queryKey: ["commercial", "purchases"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/olive-purchases?limit=500"), enabled: ready && tab === "purchases" });
  const productionRuns = useQuery({ queryKey: ["commercial", "production-runs"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/production-runs?limit=500"), enabled: ready && tab === "production" });
  const buyers = useQuery({ queryKey: ["commercial", "buyers"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/buyers"), enabled: ready && (tab === "buyers" || tab === "sales") });
  const buyerAccountSummary = useQuery({ queryKey: ["commercial", "buyer-account-summary", selectedBuyerAccountId], queryFn: () => apiGet<AnyRecord>(`/commercial/v1/buyers/${encodeURIComponent(selectedBuyerAccountId)}/account-summary`), enabled: ready && tab === "buyers" && !!selectedBuyerAccountId });
  const sales = useQuery({ queryKey: ["commercial", "sales"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/sales?limit=500"), enabled: ready && tab === "sales" });
  const salesInvoices = useQuery({ queryKey: ["commercial", "sales-invoices"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/sales-invoices?limit=500"), enabled: ready && tab === "sales" });
  const saleReturns = useQuery({ queryKey: ["commercial", "sale-returns"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/sale-returns?limit=500"), enabled: ready && tab === "sales" });
  const creditNotes = useQuery({ queryKey: ["commercial", "credit-notes"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/credit-notes?limit=500"), enabled: ready && tab === "sales" });
  const salePayments = useQuery({ queryKey: ["commercial", "sale-payments", selectedInvoiceId], queryFn: () => apiGet<AnyRecord[]>(`/commercial/v1/sales-invoices/${encodeURIComponent(selectedInvoiceId)}/payments`), enabled: ready && tab === "sales" && !!selectedInvoiceId });
  const custodyClients = useQuery({ queryKey: ["commercial", "custody-clients"], queryFn: () => apiGet<AnyRecord[]>("/clients"), enabled: ready && tab === "custody" });
  const custodyOwners = useQuery({ queryKey: ["commercial", "custody-owners"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/customer-custody/owners"), enabled: ready && tab === "custody" });
  const custodyReceipts = useQuery({ queryKey: ["commercial", "custody-receipts"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/customer-custody/receipts?limit=500"), enabled: ready && tab === "custody" });
  const custodyReleases = useQuery({ queryKey: ["commercial", "custody-releases"], queryFn: () => apiGet<AnyRecord[]>("/commercial/v1/customer-custody/releases?limit=500"), enabled: ready && tab === "custody" });
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
  const submitQualityAssessment = useMutation({
    mutationFn: () => {
      const lot = (lots.data ?? []).find((item) => item.id === qualityLotId);
      if (!lot) throw new Error("Oil lot is no longer available");
      return apiPost<AnyRecord>("/commercial/v1/quality-assessments", {
        oil_lot_id: qualityLotId,
        expected_lot_version: lot.version ?? 1,
        sample_reference: sampleReference.trim(),
        sample_date: sampleDate,
        tested_date: testedDate,
        laboratory_name: laboratoryName.trim(),
        specification_reference: specificationReference.trim(),
        measurements: measurements.map((item) => ({
          code: item.code.trim().toUpperCase(),
          value: item.value,
          unit: item.unit.trim(),
        })),
        idempotency_key: crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      toast.success(l.assessmentSaved);
      setSampleReference(""); setLaboratoryName(""); setSpecificationReference("");
      setMeasurements([{ code: "", value: "", unit: "" }]);
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
        queryClient.invalidateQueries({ queryKey: ["commercial", "sale-payments", selectedInvoiceId] }),
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
  const canRecordLab = permissions.data?.permissions.includes("commercial.lab_record") === true;
  const canReviewQuality = permissions.data?.permissions.includes("commercial.quality_release") === true;
  useEffect(() => {
    setAssignedPermissions(targetPermissions.data?.permissions.filter((permission) => permission !== "commercial.read") ?? []);
  }, [targetPermissions.data, selectedWorkerId]);

  const qualityOilLots = (lots.data ?? []).filter((lot) => lot.product_kind === "OIL" && lot.status === "OPEN" && ["PENDING", "REJECTED"].includes(lot.quality_status));
  const reviewableAssessments = (quality.data ?? []).filter((assessment) => {
    const lot = (lots.data ?? []).find((item) => item.id === assessment.oil_lot_id);
    return assessment.status === "AWAITING_INDEPENDENT_REVIEW"
      && assessment.created_by !== me.data?.id
      && lot?.last_quality_assessment_id === assessment.id
      && lot?.version === assessment.lot_version_after_submission;
  });
  const selectedReviewAssessment = (quality.data ?? []).find((assessment) => assessment.id === reviewAssessmentId);

  const availableOliveBalances: AnyRecord[] = (balances.data ?? []).filter((balance: AnyRecord) =>
    balance.product_kind === "OLIVE" && Number(balance.quantity_kg) > 0
    && (lots.data ?? []).some((lot: AnyRecord) => lot.id === balance.lot_id && lot.status === "OPEN")
  );

  const selectedPickupOwner = (custodyOwners.data ?? []).find((owner) => owner.id === pickupCustomerId);
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
    { id: "custody", label: l.custodyTab, icon: ClipboardList },
    { id: "buyers", label: salesText.buyers, icon: UserRound },
    { id: "sales", label: salesText.sales, icon: ShoppingCart },
    ...(isAdmin ? [{ id: "permissions" as const, label: l.permissionsTab, icon: ShieldCheck }] : []),
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
        <Card><CardHeader className="pb-1"><CardDescription>{l.counters}</CardDescription><CardTitle className="text-2xl">{status.data?.season_counters_provisioned ?? "—"}/12</CardTitle></CardHeader></Card>
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

      {tab === "tanks" && <Card><CardHeader><CardTitle>{l.tanks}</CardTitle><CardDescription>{l.capacity}: {l.flexible}</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.tank}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{l.capacity}</TableHead><TableHead>{lang === "ar" ? "الدور" : "Rôle"}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader><TableBody>{(tanks.data ?? []).map((tank) => { const quantity = (balances.data ?? []).filter((b) => b.location_id === tank.id && b.product_kind === "OIL").reduce((sum, b) => sum + Number(b.quantity_kg ?? 0), 0); return <TableRow key={tank.id}><TableCell className="font-semibold">{value(tank.code)} · {value(tank.name)}</TableCell><TableCell>{number(quantity)} kg</TableCell><TableCell>{tank.capacity_kg == null ? l.flexible : number(tank.capacity_kg)}</TableCell><TableCell>{(tank.role ?? "NORMAL") === "QUARANTINE" ? (lang === "ar" ? "حجر" : "Quarantaine") : (lang === "ar" ? "عادي" : "Normal")}</TableCell><TableCell>{tank.active ? l.active : l.closed}</TableCell><TableCell>{isAdmin && <select aria-label={lang === "ar" ? "دور الخزان" : "Rôle de la cuve"} value={tank.role ?? "NORMAL"} disabled={quantity > 0 || changeTankRole.isPending} onChange={(e) => { const role = e.target.value as "NORMAL" | "QUARANTINE"; if (window.confirm(lang === "ar" ? "تأكيد تغيير دور الخزان؟" : "Confirmer le changement de rôle de la cuve ?")) changeTankRole.mutate({ tank, role }); }} className="h-9 rounded-lg border bg-background px-2 text-sm disabled:opacity-50"><option value="NORMAL">{lang === "ar" ? "عادي" : "Normal"}</option><option value="QUARANTINE">{lang === "ar" ? "حجر" : "Quarantaine"}</option></select>}</TableCell></TableRow>; })}{(!tanks.isLoading && !(tanks.data?.length)) && <EmptyRow colSpan={6} text={l.noRows} />}</TableBody></Table></CardContent></Card>}

      {tab === "lots" && <Card><CardHeader><CardTitle>{l.lots}</CardTitle><CardDescription>{l.owner}: MILL / CUSTOMER</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.product}</TableHead><TableHead>{l.owner}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{l.qualityStatus}</TableHead><TableHead>{l.status}</TableHead></TableRow></TableHeader><TableBody>{(lots.data ?? []).map((lot) => <TableRow key={lot.id}><TableCell className="font-mono text-xs">{value(lot.document_number)}</TableCell><TableCell>{lot.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell><TableCell>{ownerLabel(lot.owner, l)}</TableCell><TableCell>{number(lot.quantity_received_kg ?? lot.quantity_kg)}</TableCell><TableCell>{lot.product_kind === "OIL" ? value(lot.quality_status, l.pending) : "—"}</TableCell><TableCell>{value(lot.status)}</TableCell></TableRow>)}{(!lots.isLoading && !(lots.data?.length)) && <EmptyRow colSpan={6} text={l.noRows} />}</TableBody></Table></CardContent></Card>}

      {tab === "movements" && <Card><CardHeader><CardTitle>{l.movements}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.movement}</TableHead><TableHead>{l.product}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{l.source}</TableHead><TableHead>{l.destination}</TableHead><TableHead>{l.created}</TableHead></TableRow></TableHeader><TableBody>{(movements.data ?? []).map((m) => <TableRow key={m.id}><TableCell className="font-mono text-xs">{value(m.document_number)}</TableCell><TableCell>{value(m.movement_kind)}</TableCell><TableCell>{m.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell><TableCell>{number(m.quantity_kg)}</TableCell><TableCell>{value(m.source_location_id)}</TableCell><TableCell>{value(m.destination_location_id)}</TableCell><TableCell>{date(m.created_at)}</TableCell></TableRow>)}{(!movements.isLoading && !(movements.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody></Table></CardContent></Card>}

      {tab === "quality" && <div className="space-y-4">
        {canRecordLab && <Card><CardHeader><CardTitle>{l.labEntry}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader><CardContent>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submitQualityAssessment.mutate(); }}>
            <label className="grid max-w-xl gap-1 text-sm font-medium">{l.qualityLot}
              <select required value={qualityLotId} onChange={(e) => setQualityLotId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{qualityOilLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.document_number} · {ownerLabel(lot.owner, l)} · v{lot.version ?? 1}</option>)}</select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">{l.sampleReference}<input required maxLength={100} value={sampleReference} onChange={(e) => setSampleReference(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{l.laboratory}<input required minLength={2} maxLength={160} value={laboratoryName} onChange={(e) => setLaboratoryName(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{l.sampleDate}<input required type="date" value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{l.testedDate}<input required type="date" min={sampleDate} value={testedDate} onChange={(e) => setTestedDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium md:col-span-2">{l.specification}<input required minLength={2} maxLength={160} value={specificationReference} onChange={(e) => setSpecificationReference(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{l.measurementCode}</h3><Button type="button" variant="outline" onClick={() => setMeasurements((rows) => [...rows, { code: "", value: "", unit: "" }])}>{l.addMeasurement}</Button></div>
              {measurements.map((measurement, index) => <div key={index} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                <label className="grid gap-1 text-sm font-medium">{l.measurementCode}<input required minLength={2} maxLength={30} pattern="[A-Za-z0-9_]+" value={measurement.code} onChange={(e) => setMeasurements((rows) => rows.map((row, i) => i === index ? { ...row, code: e.target.value.toUpperCase() } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.measurementValue}<input required type="number" step="0.000001" value={measurement.value} onChange={(e) => setMeasurements((rows) => rows.map((row, i) => i === index ? { ...row, value: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.measurementUnit}<input required maxLength={20} value={measurement.unit} onChange={(e) => setMeasurements((rows) => rows.map((row, i) => i === index ? { ...row, unit: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <Button type="button" variant="outline" disabled={measurements.length === 1} onClick={() => setMeasurements((rows) => rows.filter((_, i) => i !== index))}>{l.removeLine}</Button>
              </div>)}
            </div>
            <Button type="submit" disabled={submitQualityAssessment.isPending || !qualityLotId || !sampleReference.trim() || !laboratoryName.trim() || !specificationReference.trim() || measurements.some((item) => item.code.trim().length < 2 || item.value === "" || !item.unit.trim())}>{l.submitAssessment}</Button>
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
          <Table><TableHeader><TableRow><TableHead>{l.qualityLot}</TableHead><TableHead>{l.sampleReference}</TableHead><TableHead>{l.laboratory}</TableHead><TableHead>{l.submitter}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.created}</TableHead></TableRow></TableHeader>
            <TableBody>{(quality.data ?? []).map((assessment) => <TableRow key={assessment.id}>
              <TableCell className="font-mono text-xs">{value((lots.data ?? []).find((lot) => lot.id === assessment.oil_lot_id)?.document_number, assessment.oil_lot_id)}</TableCell>
              <TableCell>{value(assessment.sample_reference)}</TableCell>
              <TableCell>{value(assessment.laboratory_name)}</TableCell>
              <TableCell className="font-mono text-xs">{value(assessment.created_by)}</TableCell>
              <TableCell>{assessment.status === "AWAITING_INDEPENDENT_REVIEW" ? l.awaitingReview : l.reviewed + " · " + value(assessment.decision)}</TableCell>
              <TableCell>{date(assessment.created_at)}</TableCell>
            </TableRow>)}{(!quality.isLoading && !(quality.data?.length)) && <EmptyRow colSpan={6} text={l.noRows} />}</TableBody>
          </Table>
        </CardContent></Card>
      </div>}

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
            <label className="grid gap-1 text-sm font-medium">{l.custodyVariety}<select required value={custodyVarietyId} onChange={(e) => { setCustodyVarietyId(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(varieties.data ?? []).map((variety) => <option key={variety.id} value={variety.id}>{variety.code} · {lang === "ar" ? (variety.name_ar || variety.name_fr) : variety.name_fr}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyQuantity}<input required type="number" min="0.001" step="0.001" value={custodyReceiptQuantity} onChange={(e) => { setCustodyReceiptQuantity(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyLocation}<select required value={custodyReceivingLocationId} onChange={(e) => { setCustodyReceivingLocationId(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(locations.data ?? []).map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</select></label>
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
            <label className="grid gap-1 text-sm font-medium">{salesText.selectOilLot}<select required value={saleLotId} onChange={(e) => { setSaleLotId(e.target.value); setSaleTankId(""); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(lots.data ?? []).filter((lot) => lot.product_kind === "OIL" && lot.status === "OPEN" && lot.quality_status === "RELEASED" && lot.owner?.kind === "MILL").map((lot) => <option key={lot.id} value={lot.id}>{lot.document_number} · {lot.quality_status}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.selectTank}<select required value={saleTankId} onChange={(e) => setSaleTankId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(balances.data ?? []).filter((balance) => balance.product_kind === "OIL" && balance.lot_id === saleLotId && balance.owner?.kind === "MILL" && Number(balance.quantity_kg) > 0 && (tanks.data ?? []).some((tank) => tank.id === balance.location_id && (tank.role ?? "NORMAL") === "NORMAL")).map((balance) => { const tank = (tanks.data ?? []).find((item) => item.id === balance.location_id); return <option key={balance.location_id} value={balance.location_id}>{tank?.code ?? balance.location_id} · {number(balance.quantity_kg)} kg</option>; })}</select></label>
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
          <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{salesText.returnSale}</TableHead><TableHead>{salesText.returnQty}</TableHead><TableHead>{salesText.quarantineTank}</TableHead><TableHead>{l.qualityStatus}</TableHead><TableHead>{l.status}</TableHead><TableHead>{salesText.creditNote}</TableHead><TableHead>{salesText.creditedAmount}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader>
            <TableBody>{(saleReturns.data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{value(item.document_number)}</TableCell><TableCell>{value((sales.data ?? []).find((sale) => sale.id === item.sale_id)?.document_number, item.sale_id)}</TableCell><TableCell>{number(item.quantity_kg)}</TableCell><TableCell>{value((tanks.data ?? []).find((tank) => tank.id === item.quarantine_tank_id)?.code, item.quarantine_tank_id)}</TableCell><TableCell>{value((lots.data ?? []).find((lot) => lot.id === item.returned_oil_lot_id)?.quality_status, item.quality_status)}</TableCell><TableCell>{value(item.commercial_acceptance_status)}</TableCell><TableCell>{value((creditNotes.data ?? []).find((note) => note.id === item.credit_note_id)?.document_number)}</TableCell><TableCell>{number((creditNotes.data ?? []).find((note) => note.id === item.credit_note_id)?.amount_dt)} DT</TableCell><TableCell>{isAdmin && item.status === "RECEIVED" && item.commercial_acceptance_status === "PENDING" ? <Button size="sm" disabled={acceptSaleReturn.isPending} onClick={() => { const reason = window.prompt(salesText.returnAcceptancePrompt); if (reason && reason.trim().length >= 5) { const normalizedReason = reason.trim(); const previous = returnAcceptanceKeys[item.id]; const idempotencyKey = previous?.reason === normalizedReason ? previous.key : crypto.randomUUID(); setReturnAcceptanceKeys((current) => ({ ...current, [item.id]: { key: idempotencyKey, reason: normalizedReason } })); acceptSaleReturn.mutate({ item, reason: normalizedReason, idempotencyKey }); } else if (reason !== null) toast.error(lang === "ar" ? "يجب أن يحتوي السبب على 5 أحرف على الأقل" : "Le motif doit contenir au moins 5 caractères"); }}>{salesText.acceptReturn}</Button> : "—"}</TableCell></TableRow>)}{(!saleReturns.isLoading && !(saleReturns.data?.length)) && <EmptyRow colSpan={9} text={l.noRows} />}</TableBody>
          </Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{salesText.invoice}</CardTitle><CardDescription>{salesText.taxNotice}</CardDescription></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{salesText.invoiceNo}</TableHead><TableHead>{salesText.buyerName}</TableHead><TableHead>{salesText.netTotal}</TableHead><TableHead>{salesText.paidAmount}</TableHead><TableHead>{salesText.outstanding}</TableHead><TableHead>{salesText.paymentStatus}</TableHead></TableRow></TableHeader>
            <TableBody>{(salesInvoices.data ?? []).map((invoice) => <TableRow key={invoice.id} className={selectedInvoiceId === invoice.id ? "bg-muted/60" : ""} onClick={() => setSelectedInvoiceId(invoice.id)}><TableCell className="font-mono text-xs">{value(invoice.document_number)}</TableCell><TableCell>{value((buyers.data ?? []).find((b) => b.id === invoice.buyer_id)?.name, invoice.buyer_id)}</TableCell><TableCell>{number(invoice.net_amount_dt ?? invoice.total_amount_dt)} DT</TableCell><TableCell>{number(invoice.paid_amount_dt)} DT</TableCell><TableCell>{number(invoice.outstanding_amount_dt)} DT</TableCell><TableCell>{invoice.payment_status === "CREDITED" ? salesText.credited : value(invoice.payment_status)}</TableCell></TableRow>)}{(!salesInvoices.isLoading && !(salesInvoices.data?.length)) && <EmptyRow colSpan={6} text={l.noRows} />}</TableBody>
          </Table>
          {selectedInvoiceId && <div className="mt-4 space-y-3 rounded-xl border p-4">
            <h3 className="font-semibold">{salesText.recordPayment}</h3>
            {isAdmin && <form className="grid gap-3 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); recordPayment.mutate(); }}>
              <label className="grid gap-1 text-sm font-medium">{salesText.paymentDate}<input required type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.paymentAmount}<input required type="number" min="0.001" step="0.001" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.paymentMethod}<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="CASH">{salesText.cash}</option><option value="BANK_TRANSFER">{salesText.bank}</option><option value="CHEQUE">{salesText.cheque}</option></select></label>\n              <label className="grid gap-1 text-sm font-medium">{lang === "ar" ? "مرجع العملية" : "Référence du paiement"}<input maxLength={120} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <div className="flex items-end"><Button type="submit" disabled={recordPayment.isPending || !(Number(paymentAmount) > 0) || (salesInvoices.data ?? []).find((i) => i.id === selectedInvoiceId)?.payment_status === "PAID" || (paymentMethod !== "CASH" && !paymentReference.trim())}><Wallet className="size-4" />{salesText.recordPayment}</Button></div>
            </form>}
            <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{salesText.paymentDate}</TableHead><TableHead>{salesText.paymentAmount}</TableHead><TableHead>{salesText.paymentMethod}</TableHead><TableHead>{lang === "ar" ? "المرجع" : "Référence"}</TableHead></TableRow></TableHeader><TableBody>{(salePayments.data ?? []).map((payment) => <TableRow key={payment.id}><TableCell>{value(payment.document_number)}</TableCell><TableCell>{date(payment.payment_date)}</TableCell><TableCell>{number(payment.amount_dt)} DT</TableCell><TableCell>{value(payment.method)}</TableCell><TableCell>{value(payment.reference)}</TableCell></TableRow>)}{(!salePayments.isLoading && !(salePayments.data?.length)) && <EmptyRow colSpan={5} text={l.noRows} />}</TableBody></Table>
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
