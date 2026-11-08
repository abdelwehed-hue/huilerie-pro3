import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, Beaker, Boxes, ClipboardList, Factory, FileText,
  RefreshCw, ShieldCheck, Warehouse, ShoppingCart, UserRound, Wallet, Pencil, UserCheck, X, Ban, Trash2, Printer,
  Truck, ShoppingBasket, ArrowLeftRight, Handshake, Home, MapPin, Plus, Search, BookUser, Phone, Sprout, Layers, ScanLine,
} from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { dinarsToMillimesInput, millimesInputNumber, millimesInputToDinars } from "@/lib/commercial-money";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CommercialFactures from "@/components/CommercialFactures";
import { StatCard } from "@/components/shared";
import QrScanDialog from "@/components/QrScanDialog";
import CommercialReports from "@/components/CommercialReports";

import { QRCodeSVG } from "qrcode.react";

type AnyRecord = Record<string, any>;
type CommercialStatus = {
  active_season: string;
  season_code: string;
  tanks_provisioned: number;
  active_olive_locations: number;
  season_counters_provisioned: number;
  ready: boolean;
};
type TabKey = "overview" | "factures" | "lots" | "movements" | "quality" | "suppliers" | "purchases" | "production" | "custody" | "transfers" | "buyers" | "sales";

const labels = {
  fr: {
    permissionsTab: "Droits des employés", editRecordsPermission: "Modification des dossiers commerciaux", deleteRecordsPermission: "Suppression / annulation des dossiers commerciaux", chooseWorker: "Choisir un employé", labPermission: "Saisie des analyses laboratoire", reviewerPermission: "Validation indépendante de la qualité", auditPermission: "Consultation du journal d’audit", savePermissions: "Enregistrer les autorisations", permissionsSaved: "Autorisations mises à jour", noWorkers: "Aucun compte employé actif.",
    labEntry: "Analyse de l’olive", oilAnalysis: "Analyse de l’huile", acidity: "Acidité", peroxide: "Indice de peroxyde", k232: "K232", k270: "K270", oilContent: "Teneur en huile (%)", oliveType: "Type d’olive", classification: "Classification", autoClassification: "Automatique", extraVirgin: "Extra vierge", virgin: "Vierge", lampante: "Lampante", oilType: "Type d’huile", analysisNotes: "Observations", viewCertificate: "Certificat", laboratoryTab: "Laboratoire", sampleReference: "Référence de l’échantillon", sampleDate: "Date de prélèvement", testedDate: "Date d’analyse", laboratory: "Laboratoire", specification: "Référence de la norme", measurementCode: "Paramètre", measurementValue: "Résultat", measurementUnit: "Unité", addMeasurement: "Ajouter un paramètre", submitAssessment: "Soumettre les résultats", assessmentSaved: "Résultats transmis pour revue indépendante", assessmentList: "Analyses enregistrées", reviewerPanel: "Décision indépendante", chooseAssessment: "Analyse à examiner", decision: "Décision", releaseOil: "Accepter le lot", rejectOil: "Refuser le lot", decisionReason: "Justification de la décision (10 caractères minimum)", decisionSaved: "Décision qualité enregistrée", noAssessment: "Aucune analyse en attente de revue", submitCorrection: "Soumettre la correction pour revue", correctedAnalysis: "Corriger l’analyse approuvée", correctionSubmitted: "Correction transmise pour revue", noLabPermission: "Vous ne disposez pas de la permission de saisie laboratoire.", noReviewPermission: "Vous ne disposez pas de la permission de validation qualité.", awaitingReview: "En attente de revue", reviewed: "Examinée", submitter: "Analyste", reviewer: "Réviseur", qualityLot: "Lot d’huile",
    productionTab: "Production", newProduction: "Nouvelle production", productionDate: "Date de production", inputLots: "Lots d’olives consommés", chooseOliveBalance: "Lot · emplacement · propriétaire", inputQuantity: "Quantité consommée (kg)", outputQuantity: "Huile réellement obtenue (L)", outputTank: "Cuve de réception", extractionRate: "Rendement réel", completeProduction: "Enregistrer la production", productionSaved: "Production enregistrée et stock mis à jour", productionHistory: "Historique de production", ownerMill: "Maâsra", ownerCustomer: "Client", addInput: "Ajouter un lot", totalInput: "Total olives consommées (kg)", noOliveStock: "Aucun stock d’olives disponible pour la production.", selectTank: "Sélectionnez une cuve.",
    actions: "Actions",
    title: "Gestion Commerciale",
    subtitle: "Stocks, lots, production et contrôle qualité, indépendamment des opérations de trituration.",
    overview: "Vue générale", facturesTab: "Factures", tanks: "Cuves", lots: "Lots", movements: "Mouvements", quality: "Qualité", audit: "Audit",
    season: "Saison active", tanksCount: "Cuves configurées", locations: "Emplacements actifs",
    counters: "Compteurs de documents", readiness: "État du module", ready: "Prêt après initialisation",
    notReady: "Initialisation requise", bootstrap: "Initialiser le module commercial", bootstrapping: "Initialisation…",
    bootstrapHint: "Cette action crée les neuf cuves et les compteurs de la saison, y compris les essais préproduction ESS. Elle ne crée aucun stock et ne modifie pas les données de trituration.",
    bootstrapSuccess: "Module commercial initialisé", bootstrapError: "Impossible d'initialiser le module commercial",
    tank: "Cuve", capacity: "Capacité max. (L)", flexible: "Flexible — capacité non définie", active: "Active", saveCapacity: "Enregistrer", clearCapacity: "Vide = flexible", capacitySaved: "Capacité de la cuve mise à jour", capacityError: "Impossible de modifier la capacité",
    product: "Produit", document: "Document", purchaseCode: "Code d’achat", purchaseReference: "Réf. achat", owner: "Propriétaire actuel", quantity: "Quantité", currentStock: "Stock actuel",
    status: "État", qualityStatus: "Contrôle qualité", created: "Créé le", location: "Emplacement",
    source: "Origine", destination: "Destination", movement: "Mouvement", internalMovementsTab: "Transferts", internalMovementTitle: "Nouveau transfert interne", movementType: "Type de mouvement", transferType: "Transfert entre emplacements", ownershipTransferType: "Changement de propriétaire", productKind: "Produit concerné", sourceBalance: "Stock source disponible", targetLocation: "Emplacement de destination", targetOwner: "Nouveau propriétaire", targetCustomer: "Client propriétaire", movementReason: "Motif du mouvement", postInternalMovement: "Valider le mouvement", internalMovementSaved: "Mouvement interne enregistré", internalMovementHistory: "Historique des transferts internes", noAvailableBalance: "Aucun stock disponible pour ce type de mouvement.", noRows: "Aucune donnée à afficher",
    refresh: "Actualiser", adminOnly: "Initialisation réservée à l'administrateur",
    olive: "Olives", oil: "Huile", mill: "Maâsra", customer: "Client",
    pending: "En attente", released: "Libéré", rejected: "Rejeté", open: "Ouvert", closed: "Fermé",
    awaiting: "En attente de revue", unknown: "—", noPermission: "Accès en lecture seule selon vos autorisations.",
    qualityRule: "Un lot d'huile reste bloqué tant qu'un réviseur indépendant n'a pas approuvé son analyse.", qualityCorrectionNote: "Une correction crée une nouvelle analyse et remet le lot en attente de validation. L’analyse approuvée reste conservée.",
    warning: "Le module commercial n'est pas encore initialisé dans la base de données.",
    varietiesTab: "Variétés d’olives", varietiesManaged: "Les variétés sont gérées dans Paramètres → Tarif. Cette liste est synchronisée automatiquement.", varietyCode: "Code variété", varietyNameFr: "Nom en français", varietyNameAr: "Nom en arabe", addVariety: "Ajouter une variété", varietySaved: "Variété ajoutée",     purchasesTab: "Achats d’olives", newPurchase: "Nouvel achat", editPurchase: "Modifier l’achat", updateDraft: "Enregistrer les modifications", cancelEdit: "Annuler la modification", purchaseDate: "Date d’achat", supplier: "Fournisseur", variety: "Variété", unitPrice: "Prix unitaire / kg (millimes)", addLine: "Ajouter une ligne", removeLine: "Retirer", createDraft: "Créer le brouillon", purchaseCreated: "Brouillon d’achat créé", approve: "Approuver et réceptionner", receivingLocation: "Emplacement de réception", totalAmount: "Montant total", totalQuantity: "Quantité totale (kg)", draft: "Brouillon", approved: "Approuvé", noSuppliers: "Créez d’abord un fournisseur.", noVarieties: "Créez d’abord les variétés commerciales.",     suppliers: "Fournisseurs", locationsTab: "Emplacements", supplierName: "Nom du fournisseur", supplierPhone: "Téléphone", taxId: "Identifiant fiscal", addSupplier: "Ajouter le fournisseur", supplierSaved: "Fournisseur ajouté", editSupplier: "Modifier le fournisseur", saveSupplierChanges: "Enregistrer les modifications", cancelSupplierEdit: "Annuler", supplierUpdated: "Fournisseur modifié", deleteSupplier: "Supprimer", confirmDeleteSupplier: "Confirmer la suppression de ce fournisseur ? Il sera retiré des nouveaux achats, mais ses anciennes opérations seront conservées.", supplierDeleted: "Fournisseur supprimé", locationCode: "Code", locationName: "Nom de l’emplacement", locationType: "Type", oliveStorage: "Stockage olives", staging: "Zone de préparation", addLocation: "Ajouter l’emplacement", locationSaved: "Emplacement ajouté", custodyTab: "Garde des clients", custodyReceiptTitle: "Réception d’olives appartenant au client", custodyReleaseTitle: "Restitution d’huile au propriétaire", custodyCustomer: "Client propriétaire", custodyDate: "Date", custodyVariety: "Variété", custodyQuantity: "Quantité (kg)", custodyLocation: "Emplacement de réception", custodyAck: "Référence de l’accusé client", custodySource: "Référence source (facultative)", custodyReason: "Motif de restitution", receiveCustody: "Enregistrer la réception en garde", releaseCustody: "Restituer l’huile au client", custodyReceipts: "Historique des réceptions en garde", custodyReleases: "Historique des restitutions", custodyOilLot: "Lot d’huile", custodySourceTank: "Cuve de sortie", noCustodyClients: "Aucun client enregistré. Ajoutez d’abord le client dans le carnet.", noCustomerOil: "Aucun lot d’huile de ce client n’est disponible dans une cuve normale après validation qualité.", custodyReceiptNote: "Cette réception enregistre des olives appartenant au client. Elle ne crée ni achat ni dette fournisseur.", custodyReleaseNote: "La restitution n’est pas une vente et ne génère aucune facture.", custodyStatementTitle: "État de garde du client", custodyMovement: "Mouvement", custodyProduct: "Produit", custodyDelta: "Variation", custodyBalance: "Solde après mouvement", custodyRecordedAt: "Date d’enregistrement", selectCustodyOwner: "Choisir le propriétaire pour consulter son état",notes: "Notes",
  },
  ar: {
    permissionsTab: "صلاحيات العمال", editRecordsPermission: "تعديل السجلات التجارية", deleteRecordsPermission: "حذف / إلغاء السجلات التجارية", chooseWorker: "اختيار العامل", labPermission: "تسجيل التحاليل المخبرية", reviewerPermission: "المراجعة المستقلة للجودة", auditPermission: "الاطلاع على سجل التدقيق", savePermissions: "حفظ الصلاحيات", permissionsSaved: "تم تحديث الصلاحيات", noWorkers: "لا توجد حسابات عمال نشطة.",
    labEntry: "تحليل الزيتون", oilAnalysis: "تحليل الزيت", acidity: "الحموضة", peroxide: "مؤشر البيروكسيد", k232: "K232", k270: "K270", oilContent: "نسبة الزيت (%)", oliveType: "نوع الزيتون", classification: "التصنيف", autoClassification: "آلي", extraVirgin: "بكر ممتاز", virgin: "بكر", lampante: "لامبانتي", oilType: "نوع الزيت", analysisNotes: "ملاحظات", viewCertificate: "شهادة التحليل", laboratoryTab: "المخبر", sampleReference: "مرجع العينة", sampleDate: "تاريخ أخذ العينة", testedDate: "تاريخ التحليل", laboratory: "المخبر", specification: "مرجع المواصفة", measurementCode: "المعيار", measurementValue: "النتيجة", measurementUnit: "الوحدة", addMeasurement: "إضافة معيار", submitAssessment: "إرسال النتائج", assessmentSaved: "تم إرسال النتائج للمراجعة المستقلة", assessmentList: "التحاليل المسجلة", reviewerPanel: "قرار الجودة المستقل", chooseAssessment: "التحليل المطلوب مراجعته", decision: "القرار", releaseOil: "قبول الدفعة", rejectOil: "رفض الدفعة", decisionReason: "تعليل القرار (10 أحرف على الأقل)", decisionSaved: "تم تسجيل قرار الجودة", noAssessment: "لا توجد تحاليل تنتظر المراجعة", submitCorrection: "إرسال التصحيح للمراجعة", correctedAnalysis: "تصحيح التحليل المعتمد", correctionSubmitted: "تم إرسال التصحيح للمراجعة", noLabPermission: "ليست لديك صلاحية تسجيل التحاليل.", noReviewPermission: "ليست لديك صلاحية اعتماد الجودة.", awaitingReview: "في انتظار المراجعة", reviewed: "تمت المراجعة", submitter: "المحلل", reviewer: "المراجع", qualityLot: "دفعة الزيت",
    productionTab: "الإنتاج", newProduction: "إنتاج جديد", productionDate: "تاريخ الإنتاج", inputLots: "دفعات الزيتون المستهلكة", chooseOliveBalance: "الدفعة · الموقع · المالك", inputQuantity: "الكمية المستهلكة (كغ)", outputQuantity: "كمية الزيت الفعلية الناتجة (لتر)", outputTank: "خزان الاستلام", extractionRate: "المردودية الفعلية", completeProduction: "تسجيل الإنتاج", productionSaved: "تم تسجيل الإنتاج وتحيين المخزون", productionHistory: "سجل الإنتاج", ownerMill: "المعصرة", ownerCustomer: "الحريف", addInput: "إضافة دفعة", totalInput: "مجموع الزيتون المستهلك (كغ)", noOliveStock: "لا يوجد مخزون زيتون متاح للإنتاج.", selectTank: "يرجى اختيار خزان.",
    actions: "الإجراءات",
    title: "Oro Verde — التسيير التجاري",
    subtitle: "المخزون والدفعات والإنتاج ومراقبة الجودة، بصورة مستقلة عن عمليات العصر.",
    overview: "نظرة عامة", facturesTab: "الفواتير", tanks: "الخزانات", lots: "الدفعات", movements: "الحركات", quality: "الجودة", audit: "التدقيق",
    season: "الموسم الحالي", tanksCount: "الخزانات المهيأة", locations: "المواقع النشطة",
    counters: "عدادات الوثائق", readiness: "حالة الوحدة", ready: "جاهزة بعد التهيئة",
    notReady: "تتطلب التهيئة", bootstrap: "تهيئة الوحدة التجارية", bootstrapping: "جار التهيئة…",
    bootstrapHint: "تنشئ هذه العملية الخزانات التسعة وعدادات الموسم، بما فيها وثائق تجارب ما قبل الإنتاج ESS. لا تضيف أي مخزون ولا تغيّر بيانات العصر.",
    bootstrapSuccess: "تمت تهيئة الوحدة التجارية", bootstrapError: "تعذرت تهيئة الوحدة التجارية",
    tank: "الخزان", capacity: "السعة القصوى (لتر)", flexible: "مرنة — دون سعة محددة", active: "نشط", saveCapacity: "حفظ", clearCapacity: "اتركه فارغاً للسعة المرنة", capacitySaved: "تم تحديث سعة الخزان", capacityError: "تعذر تعديل سعة الخزان",
    product: "المنتج", document: "الوثيقة", purchaseCode: "كود الشراء", purchaseReference: "مرجع الشراء", owner: "المالك الحالي", quantity: "الكمية", currentStock: "الرصيد الحالي",
    status: "الحالة", qualityStatus: "حالة الجودة", created: "تاريخ الإنشاء", location: "الموقع",
    source: "المصدر", destination: "الوجهة", movement: "الحركة", internalMovementsTab: "التحويلات", internalMovementTitle: "تسجيل تحويل داخلي", movementType: "نوع الحركة", transferType: "تحويل بين المواقع", ownershipTransferType: "تغيير المالك", productKind: "نوع المنتج", sourceBalance: "المخزون المصدر المتاح", targetLocation: "موقع الوجهة", targetOwner: "المالك الجديد", targetCustomer: "الحريف المالك", movementReason: "سبب الحركة", postInternalMovement: "تأكيد الحركة", internalMovementSaved: "تم تسجيل التحويل الداخلي", internalMovementHistory: "سجل التحويلات الداخلية", noAvailableBalance: "لا يوجد مخزون متاح لهذا النوع من الحركات.", noRows: "لا توجد بيانات للعرض",
    refresh: "تحديث", adminOnly: "التهيئة متاحة للمدير فقط",
    olive: "زيتون", oil: "زيت", mill: "المعصرة", customer: "الحريف",
    pending: "في الانتظار", released: "مقبول", rejected: "مرفوض", open: "مفتوح", closed: "مغلق",
    awaiting: "في انتظار المراجعة", unknown: "—", noPermission: "صلاحية العرض فقط حسب أذونات حسابك.",
    qualityRule: "تبقى دفعة الزيت غير متاحة للبيع حتى يعتمد محلل مستقل نتائج التحليل.", qualityCorrectionNote: "ينشئ التصحيح تحليلاً جديدًا ويعيد الدفعة إلى انتظار الاعتماد، مع الاحتفاظ بالتحليل المعتمد السابق.",
    warning: "لم تتم تهيئة الوحدة التجارية في قاعدة البيانات بعد.",
    varietiesTab: "أصناف الزيتون", varietiesManaged: "تتم إدارة الأصناف من الإعدادات ← التعريفة، وتُزامَن هذه القائمة تلقائياً.", varietyCode: "رمز الصنف", varietyNameFr: "الاسم بالفرنسية", varietyNameAr: "الاسم بالعربية", addVariety: "إضافة صنف", varietySaved: "تمت إضافة الصنف",     purchasesTab: "شراء الزيتون", newPurchase: "شراء جديد", editPurchase: "تعديل الشراء", updateDraft: "حفظ التعديلات", cancelEdit: "إلغاء التعديل", purchaseDate: "تاريخ الشراء", supplier: "المزوّد", variety: "الصنف", unitPrice: "السعر للوحدة / كغ (مليم)", addLine: "إضافة سطر", removeLine: "حذف السطر", createDraft: "إنشاء مسودة", purchaseCreated: "تم إنشاء مسودة الشراء", approve: "اعتماد واستلام", receivingLocation: "موقع الاستلام", totalAmount: "المبلغ الجملي", totalQuantity: "الكمية الجملية (كغ)", draft: "مسودة", approved: "معتمد", noSuppliers: "أنشئ مزوّداً أولاً.", noVarieties: "أنشئ أصناف الزيتون التجارية أولاً.",     suppliers: "المزوّدون", locationsTab: "مواقع التخزين", supplierName: "اسم المزوّد", supplierPhone: "الهاتف", taxId: "المعرّف الجبائي", addSupplier: "إضافة المزوّد", supplierSaved: "تمت إضافة المزوّد", editSupplier: "تعديل بيانات المزوّد", saveSupplierChanges: "حفظ التعديلات", cancelSupplierEdit: "إلغاء", supplierUpdated: "تم تعديل بيانات المزوّد", deleteSupplier: "حذف", confirmDeleteSupplier: "هل تؤكد حذف هذا المزوّد؟ سيُمنع من عمليات الشراء الجديدة مع الحفاظ على عملياته السابقة.", supplierDeleted: "تم حذف المزوّد", locationCode: "الرمز", locationName: "اسم الموقع", locationType: "النوع", oliveStorage: "مخزن الزيتون", staging: "منطقة التحضير", addLocation: "إضافة الموقع", locationSaved: "تمت إضافة الموقع", custodyTab: "أمانة الحرفاء", custodyReceiptTitle: "استلام زيتون مملوك للحريف", custodyReleaseTitle: "إرجاع الزيت إلى مالكه", custodyCustomer: "الحريف المالك", custodyDate: "التاريخ", custodyVariety: "الصنف", custodyQuantity: "الكمية (كغ)", custodyLocation: "مكان الاستلام", custodyAck: "مرجع وصل إقرار الحريف", custodySource: "مرجع المصدر (اختياري)", custodyReason: "سبب التسليم", receiveCustody: "تسجيل استلام الأمانة", releaseCustody: "تسليم الزيت إلى الحريف", custodyReceipts: "سجل استلام الأمانة", custodyReleases: "سجل تسليم الزيت", custodyOilLot: "دفعة الزيت", custodySourceTank: "الخزان المصدر", noCustodyClients: "لا يوجد حرفاء مسجلون. أضف الحريف أولاً إلى دفتر الحرفاء.", noCustomerOil: "لا توجد دفعة زيت مملوكة لهذا الحريف ومتاحة في خزان عادي بعد المصادقة على الجودة.", custodyReceiptNote: "هذا الإجراء يسجل زيتوناً مملوكاً للحريف ولا ينشئ عملية شراء أو ديناً للمزوّد.", custodyReleaseNote: "تسليم الزيت ليس عملية بيع ولا ينشئ فاتورة.", custodyStatementTitle: "كشف أمانة الحريف", custodyMovement: "الحركة", custodyProduct: "المنتج", custodyDelta: "التغيير", custodyBalance: "الرصيد بعد الحركة", custodyRecordedAt: "تاريخ التسجيل", selectCustodyOwner: "اختر المالك لعرض كشف الأمانة",notes: "ملاحظات",
  },
} as const;

function value(v: unknown, fallback = "—") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}
function lotCode(lot: AnyRecord | null | undefined, fallback = "—") {
  return value(lot?.batch_code, fallback);
}
function number(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) : "—";
}
function money(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n) : "—";
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
    activeBuyer: "نشط", inactiveBuyer: "معطّل", deactivateBuyer: "تعطيل", reactivateBuyer: "إعادة التفعيل", deleteBuyer: "حذف الحريف", confirmDeleteBuyer: "سيُحذف الحريف من قائمة البيع مع الاحتفاظ بفواتيره وعملياته السابقة. هل تؤكد؟", buyerDeleted: "تم حذف الحريف من قائمة البيع", buyerReactivated: "تمت إعادة تفعيل الحريف",
    sales: "البيع بالجملة",
    saleDate: "تاريخ البيع", selectBuyer: "اختر الحريف", selectOilLot: "دفعة الزيت",
    selectTank: "الخزان", noSaleTank: "لا يوجد زيت متاح للبيع في الخزانات العادية النشطة.", saleQty: "الكمية المباعة (لتر)", salePrice: "السعر/لتر (مليم)",
    createSale: "إنشاء مسودة بيع", saleSaved: "تم إنشاء مسودة البيع",
    approveSale: "اعتماد البيع وإخراج الكمية", saleApproved: "تم اعتماد البيع وإصدار الفاتورة",
    saleHistory: "سجل عمليات البيع", invoice: "الفاتورة", invoiceNo: "رقم الفاتورة",
    paymentStatus: "حالة التسوية", unpaid: "غير مسددة", partial: "تسوية جزئية", paid: "مسددة", appliedCredit: "رصيد مطبق", settledAmount: "إجمالي المسدد", applyCredit: "تطبيق رصيد الحريف", creditAvailable: "الرصيد الدائن المتاح", creditAmount: "المبلغ المراد تطبيقه (مليم)", creditReason: "سبب التطبيق", creditApplied: "تم تطبيق الرصيد الدائن", creditApplicationHistory: "سجل تطبيق الأرصدة الدائنة", creditApplicationNumber: "رقم تطبيق الرصيد", creditApplyConfirm: "هل تؤكد خصم هذا الرصيد الدائن من حساب الحريف وتسوية الفاتورة بهذا المبلغ؟ لن يُسجّل ذلك كخلاص نقدي.", reversePayment: "عكس الخلاص", reverseAmount: "المبلغ المراد عكسه (مليم)", reverseReason: "سبب عكس الخلاص", reverseConfirm: "هل تؤكد عكس هذا الخلاص؟ سيتم تسجيل وثيقة REV مستقلة ولن يتم حذف وثيقة PAY الأصلية.", reversalHistory: "سجل عمليات عكس الخلاص", reversalNumber: "رقم وثيقة العكس", remainingReversible: "المبلغ القابل للعكس", selectPayment: "اختر عملية الخلاص أولاً", reversalSaved: "تم تسجيل عكس الخلاص", reversalDate: "تاريخ العكس", reversalEvidence: "مرجع إثبات العكس",
    taxNotice: "المعالجة الجبائية غير مضبوطة بعد؛ هذه فاتورة تجارية داخلية وليست فاتورة جبائية جاهزة.",
    chooseInvoice: "اختر الفاتورة", paymentAmount: "مبلغ الخلاص (مليم)",
    paymentMethod: "طريقة الخلاص", paymentDate: "تاريخ الخلاص", recordPayment: "تسجيل الخلاص",
    paymentSaved: "تم تسجيل الخلاص", cash: "نقداً", bank: "تحويل بنكي", cheque: "صك",
    outstanding: "الباقي", total: "المجموع", paidAmount: "المبلغ المدفوع",
    saleCancelled: "تم إلغاء مسودة البيع", returnIntake: "تسجيل مرتجع زيت", returnWarning: "سيبقى الزيت المرتجع في الحجر وغير قابل للبيع إلى حين إعادة التحليل والاعتماد.", returnConfirm: "تأكيد استلام الكمية في خزان الحجر؟ سيُسجّل ذلك كمرتجع فعلي.", returnSale: "عملية البيع الأصلية", returnQty: "الكمية المرتجعة (لتر)", quarantineTank: "خزان الحجر", returnReason: "سبب الإرجاع", returnSaved: "تم استلام المرتجع في خزان الحجر", returnHistory: "سجل المرتجعات", acceptReturn: "قبول المرتجع وإصدار إشعار دائن", returnAccepted: "تم قبول المرتجع وإصدار الإشعار الدائن", returnAcceptancePrompt: "اذكر سبب القبول التجاري (5 أحرف على الأقل):", returnRejection: "وثيقة رفض المرتجع", rejectReturn: "رفض المرتجع وإعادته للحريف", returnRejected: "تم رفض المرتجع وإرجاع الزيت للحريف", returnRejectionReason: "سبب الرفض (5 أحرف على الأقل):", buyerReceiptReference: "مرجع استلام الحريف", rejectReturnConfirm: "هل تؤكد رفض المرتجع وإخراج كامل الكمية من خزان الحجر؟ لن يصدر إشعار دائن أو استرجاع نقدي.", creditNote: "الإشعار الدائن", netTotal: "الصافي بعد الإشعارات", credited: "مغطاة بإشعار دائن", creditedAmount: "المبلغ الدائن", noQuarantineTank: "يجب تعيين خزان فارغ للحجر أولاً من تبويب الخزانات.", remainingReturnable: "الكمية المتبقية للإرجاع", ackRef: "مرجع إقرار الحريف", cancelSalePrompt: "اذكر سبب إلغاء مسودة البيع (5 أحرف على الأقل):", cancelSale: "إلغاء المسودة",
    noEligibleOil: "لا يوجد مخزون زيت مملوك للمعصرة في خزان نشط عادي.", saleDraftHint: "اختر الخزان فقط؛ سيخصم النظام الكمية تلقائيًا من أقدم الدفعات المتاحة أولًا.",
  } : {
    buyers: "Acheteurs", account: "Compte commercial", accountInvoices: "Nombre de factures", grossTotal: "Total brut facturé", creditNotesTotal: "Avoirs", netReceivable: "Net à recevoir", buyerCreditBalance: "Crédit de l’acheteur", buyerName: "Nom de l’acheteur", buyerContact: "Contact",
    buyerPhone: "Téléphone", buyerTax: "Identifiant fiscal", buyerAddress: "Adresse",
    addBuyer: "Ajouter l’acheteur", buyerSaved: "Acheteur enregistré", buyerEmail: "E-mail",
    editBuyer: "Modifier l’acheteur", saveBuyer: "Enregistrer les modifications", cancelEdit: "Annuler",
    activeBuyer: "Actif", inactiveBuyer: "Désactivé", deactivateBuyer: "Désactiver", reactivateBuyer: "Réactiver", deleteBuyer: "Supprimer l’acheteur", confirmDeleteBuyer: "Cet acheteur sera retiré des nouvelles ventes. Ses factures et opérations passées resteront conservées. Confirmer ?", buyerDeleted: "Acheteur retiré des nouvelles ventes", buyerReactivated: "Acheteur réactivé",
    sales: "Vente",
    saleDate: "Date de vente", selectBuyer: "Choisir l’acheteur", selectOilLot: "Lot d’huile",
    selectTank: "Cuve", noSaleTank: "Aucune huile disponible à la vente dans les cuves normales actives.", saleQty: "Quantité vendue (L)", salePrice: "Prix/L (millimes)",
    createSale: "Créer le brouillon", saleSaved: "Brouillon de vente créé",
    approveSale: "Valider et expédier", saleApproved: "Vente validée et facture créée",
    saleHistory: "Historique des ventes", invoice: "Facture", invoiceNo: "N° facture",
    paymentStatus: "Statut du règlement", unpaid: "Non réglée", partial: "Partiellement réglée", paid: "Réglée", appliedCredit: "Crédit appliqué", settledAmount: "Total réglé", applyCredit: "Appliquer le crédit acheteur", creditAvailable: "Crédit disponible", creditAmount: "Montant à appliquer (millimes)", creditReason: "Motif de l’application", creditApplied: "Crédit acheteur appliqué", creditApplicationHistory: "Historique des applications de crédit", creditApplicationNumber: "N° application de crédit", creditApplyConfirm: "Confirmer l’application de ce crédit au solde de la facture ? Cette opération réduit le crédit disponible et n’est pas un paiement en espèces.", reversePayment: "Contrepasser le paiement", reverseAmount: "Montant à contrepasser (millimes)", reverseReason: "Motif de contrepassation", reverseConfirm: "Confirmer la contrepassation ? Un document REV sera créé et le document PAY original restera intact.", reversalHistory: "Historique des contrepassations", reversalNumber: "N° de contrepassation", remainingReversible: "Montant encore réversible", selectPayment: "Sélectionnez d’abord un paiement", reversalSaved: "Contrepassation enregistrée", reversalDate: "Date de contrepassation", reversalEvidence: "Référence justificative",
    taxNotice: "Traitement fiscal non configuré : document commercial interne, pas encore une facture fiscale prête à émettre.",
    chooseInvoice: "Choisir la facture", paymentAmount: "Montant reçu (millimes)",
    paymentMethod: "Mode de paiement", paymentDate: "Date du paiement", recordPayment: "Enregistrer le paiement",
    paymentSaved: "Paiement enregistré", cash: "Espèces", bank: "Virement", cheque: "Chèque",
    outstanding: "Solde dû", total: "Total", paidAmount: "Payé",
    saleCancelled: "Brouillon de vente annulé", returnIntake: "Réception d’un retour d’huile", returnWarning: "L’huile retournée reste en quarantaine et ne peut être vendue avant une nouvelle analyse et validation.", returnConfirm: "Confirmer la réception physique du retour dans la cuve de quarantaine ?", returnSale: "Vente d’origine", returnQty: "Quantité retournée (L)", quarantineTank: "Cuve de quarantaine", returnReason: "Motif du retour", returnSaved: "Retour reçu en quarantaine", returnHistory: "Historique des retours", acceptReturn: "Accepter le retour et émettre l’avoir", returnAccepted: "Retour accepté et avoir émis", returnAcceptancePrompt: "Motif de l’acceptation commerciale (5 caractères minimum) :", returnRejection: "Document de rejet", rejectReturn: "Refuser le retour et le réexpédier à l’acheteur", returnRejected: "Retour refusé et huile réexpédiée à l’acheteur", returnRejectionReason: "Motif du rejet (5 caractères minimum) :", buyerReceiptReference: "Référence de réception par l’acheteur", rejectReturnConfirm: "Confirmer le rejet et la sortie de toute la quantité de la cuve de quarantaine ? Aucun avoir ni remboursement ne sera émis.", creditNote: "Avoir", netTotal: "Net après avoirs", credited: "Soldée par avoir", creditedAmount: "Montant crédité", noQuarantineTank: "Désignez d’abord une cuve vide comme quarantaine dans l’onglet Cuves.", remainingReturnable: "Quantité encore retournable", ackRef: "Référence d’accusé de l’acheteur", cancelSalePrompt: "Motif de l’annulation (5 caractères minimum) :", cancelSale: "Annuler le brouillon",
    noEligibleOil: "Aucun stock d’huile de la maâsra dans une cuve normale active.", saleDraftHint: "Choisissez uniquement la cuve ; le système déduira automatiquement la quantité des lots disponibles, du plus ancien au plus récent.",
  };
  const me = useMe();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qrBatchCode = searchParams.get("batch") || "";
  const requestedTab = searchParams.get("tab") as TabKey | null;
  const validTabs: TabKey[] = ["overview", "factures", "lots", "movements", "quality", "suppliers", "purchases", "production", "custody", "transfers", "buyers", "sales", "reports"];
  const initialTab: TabKey = qrBatchCode ? "lots" : requestedTab && validTabs.includes(requestedTab) ? requestedTab : "overview";
  const isAdmin = me.data?.role === "admin";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const selectTab = (nextTab: TabKey) => {
    setTab(nextTab);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", nextTab);
      return next;
    }, { replace: true });
  };
  const [showTankLevels, setShowTankLevels] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierTaxId, setSupplierTaxId] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [editingSupplier, setEditingSupplier] = useState<AnyRecord | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [selectedBuyerId, setSelectedBuyerId] = useState("");
  const [buyerInvoiceToOpen, setBuyerInvoiceToOpen] = useState("");
  const [buyerSearch, setBuyerSearch] = useState("");
  const [showBuyerForm, setShowBuyerForm] = useState(false);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [editingPurchase, setEditingPurchase] = useState<AnyRecord | null>(null);
  const [selectedPurchaseReceipt, setSelectedPurchaseReceipt] = useState<AnyRecord | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseLines, setPurchaseLines] = useState([{ variety_id: "", quantity_kg: "", unit_price_dt: "" }]);
  const [receivingLocationId, setReceivingLocationId] = useState("");
  const [productionDate, setProductionDate] = useState(new Date().toISOString().slice(0, 10));
  const [productionInputs, setProductionInputs] = useState([{ balance_key: "", quantity_kg: "" }]);
  const [productionOutputKg, setProductionOutputKg] = useState("");
  const [productionTankId, setProductionTankId] = useState("");
  const [productionNotes, setProductionNotes] = useState("");
  const [adjustingReadyBalance, setAdjustingReadyBalance] = useState<AnyRecord | null>(null);
  const [readyBalanceTarget, setReadyBalanceTarget] = useState("");
  const [readyBalanceReason, setReadyBalanceReason] = useState("");
  const [trialBalanceKey, setTrialBalanceKey] = useState("");
  const [trialInputKg, setTrialInputKg] = useState("");
  const [trialOilKg, setTrialOilKg] = useState("");
  const [trialDate, setTrialDate] = useState(new Date().toISOString().slice(0, 10));
  const [trialNotes, setTrialNotes] = useState("");
  const [cancelTrialId, setCancelTrialId] = useState("");
  const [qualityLotId, setQualityLotId] = useState("");
  const [editingQualityAssessmentId, setEditingQualityAssessmentId] = useState("");
  const [showNewQualityAssessment, setShowNewQualityAssessment] = useState(false);
  const [correctingQualityAssessmentId, setCorrectingQualityAssessmentId] = useState("");
  const [sampleReference, setSampleReference] = useState("");
  const [sampleDate, setSampleDate] = useState(new Date().toISOString().slice(0, 10));
  const [testedDate, setTestedDate] = useState(new Date().toISOString().slice(0, 10));
  const [laboratoryName, setLaboratoryName] = useState("");
  const [specificationReference, setSpecificationReference] = useState("");
  const [measurements, setMeasurements] = useState([{ code: "", value: "", unit: "" }]);
  const [oilAcidity, setOilAcidity] = useState("");
  const [qualityClassification, setQualityClassification] = useState<"" | "extra_vierge" | "vierge" | "lampante">("");
  const [oilPeroxide, setOilPeroxide] = useState("");
  const [oilK232, setOilK232] = useState("");
  const [oilK270, setOilK270] = useState("");
  const [oilContent, setOilContent] = useState("");
  const [oilType, setOilType] = useState("");
  const [analysisNotes, setAnalysisNotes] = useState("");
  const [reviewAssessmentId, setReviewAssessmentId] = useState("");
  const [qualityQrScanOpen, setQualityQrScanOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"RELEASED" | "REJECTED">("RELEASED");
  const [reviewReason, setReviewReason] = useState("");
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
  const [saleTankId, setSaleTankId] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("");
  const [saleUnitPrice, setSaleUnitPrice] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [saleIdempotencyKey, setSaleIdempotencyKey] = useState(() => crypto.randomUUID());
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
  const [editingCustodyReceipt, setEditingCustodyReceipt] = useState<AnyRecord | null>(null);
  const [pickupCustomerId, setPickupCustomerId] = useState("");
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().slice(0, 10));
  const [pickupBalanceKey, setPickupBalanceKey] = useState("");
  const [pickupQuantity, setPickupQuantity] = useState("");
  const [pickupAck, setPickupAck] = useState("");
  const [pickupReason, setPickupReason] = useState("");
  const [pickupKey, setPickupKey] = useState(() => crypto.randomUUID());
  const [editingCustodyRelease, setEditingCustodyRelease] = useState<AnyRecord | null>(null);
  const [internalMovementKind, setInternalMovementKind] = useState<"TRANSFER" | "OWNERSHIP_TRANSFER">("TRANSFER");
  const [internalProductKind, setInternalProductKind] = useState<"OLIVE" | "OIL">("OIL");
  const [internalSourceBalanceKey, setInternalSourceBalanceKey] = useState("");
  const [internalDestinationLocationId, setInternalDestinationLocationId] = useState("");
  const [internalDestinationOwnerKey, setInternalDestinationOwnerKey] = useState("");
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
  const millSettings = useQuery({ queryKey: ["mill"], queryFn: () => apiGet<AnyRecord>("/mill"), enabled: ready && tab === "quality" });
  const purchaseMill = useQuery({ queryKey: ["mill"], queryFn: () => apiGet<AnyRecord>("/mill"), enabled: ready && tab === "purchases" });
  const preproductionSamples = useQuery({ queryKey: ["commercial", "preproduction-samples"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/preproduction-samples", 500), enabled: ready && (tab === "quality" || tab === "production") });
  const permissions = useQuery({ queryKey: ["commercial", "my-permissions"], queryFn: () => apiGet<{ permissions: string[] }>("/commercial/v1/me/permissions"), enabled: ready });
  const canEditRecords = isAdmin || (permissions.data?.permissions ?? []).includes("commercial.edit_records");
  const canDeleteRecords = isAdmin || (permissions.data?.permissions ?? []).includes("commercial.delete_records");
  const suppliers = useQuery({ queryKey: ["commercial", "suppliers"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/suppliers", 500), enabled: ready && (tab === "overview" || tab === "suppliers" || tab === "purchases") });
  const locations = useQuery({ queryKey: ["commercial", "locations"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/locations", 500), enabled: ready && (tab === "purchases" || tab === "production" || tab === "quality" || tab === "custody" || tab === "transfers") });
  const varieties = useQuery({ queryKey: ["commercial", "varieties"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/varieties", 500), enabled: ready && (tab === "overview" || tab === "purchases" || tab === "suppliers" || tab === "custody" || tab === "quality") });
  const purchases = useQuery({ queryKey: ["commercial", "purchases"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/olive-purchases", 500), enabled: ready && (tab === "overview" || tab === "purchases" || tab === "suppliers" || tab === "quality" || tab === "lots") });
  const productionRuns = useQuery({ queryKey: ["commercial", "production-runs"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/production-runs", 500), enabled: ready && (tab === "production" || tab === "lots") });
  const buyers = useQuery({ queryKey: ["commercial", "buyers"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/buyers", 500), enabled: ready && (tab === "buyers" || tab === "sales") });
  const buyerAccountSummary = useQuery({ queryKey: ["commercial", "buyer-account-summary", selectedBuyerAccountId], queryFn: () => apiGet<AnyRecord>(`/commercial/v1/buyers/${encodeURIComponent(selectedBuyerAccountId)}/account-summary`), enabled: ready && tab === "buyers" && !!selectedBuyerAccountId });
  const pumpSettings = useQuery({ queryKey: ["commercial", "sales", "pumps"], queryFn: () => apiGet<AnyRecord>("/commercial/v1/sales/pumps"), enabled: ready && tab === "sales" });
  const sales = useQuery({ queryKey: ["commercial", "sales"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sales", 500), enabled: ready && tab === "sales" });
  const salesInvoices = useQuery({ queryKey: ["commercial", "sales-invoices"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sales-invoices", 500), enabled: ready && (tab === "sales" || tab === "buyers") });
  const saleReturns = useQuery({ queryKey: ["commercial", "sale-returns"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sale-returns", 500), enabled: ready && tab === "sales" });
  const returnRejections = useQuery({ queryKey: ["commercial", "sale-return-rejections"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sale-return-rejections", 500), enabled: ready && tab === "sales" });
  const creditNotes = useQuery({ queryKey: ["commercial", "credit-notes"], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/credit-notes", 500), enabled: ready && tab === "sales" });
  const salePayments = useQuery({ queryKey: ["commercial", "sale-payments", selectedInvoiceId], queryFn: () => apiGetAllPages<AnyRecord>(`/commercial/v1/sales-invoices/${encodeURIComponent(selectedInvoiceId)}/payments`, 500), enabled: ready && tab === "sales" && !!selectedInvoiceId });
  const paymentReversals = useQuery({ queryKey: ["commercial", "payment-reversals", selectedInvoiceId], queryFn: () => apiGetAllPages<AnyRecord>("/commercial/v1/sales-invoices/" + encodeURIComponent(selectedInvoiceId) + "/payment-reversals", 500), enabled: ready && tab === "sales" && !!selectedInvoiceId });
  const supplierRows = suppliers.data ?? [];
  const purchaseRows = purchases.data ?? [];
  const selectedSupplier = supplierRows.find((supplier) => supplier.id === selectedSupplierId) ?? null;
  const selectedSupplierPurchases = purchaseRows.filter((purchase) => purchase.supplier_id === selectedSupplierId)
    .sort((a, b) => String(b.purchase_date ?? b.created_at ?? "").localeCompare(String(a.purchase_date ?? a.created_at ?? "")));
  const supplierPurchaseCount = selectedSupplierPurchases.length;
  const supplierApprovedPurchases = selectedSupplierPurchases.filter((purchase) => purchase.status === "APPROVED");
  const supplierDraftPurchases = selectedSupplierPurchases.filter((purchase) => purchase.status === "DRAFT");
  const supplierTotalKg = selectedSupplierPurchases.reduce((sum, purchase) => sum + Number(purchase.total_quantity_kg ?? 0), 0);
  const supplierTotalAmount = selectedSupplierPurchases.reduce((sum, purchase) => sum + Number(purchase.total_amount_dt ?? 0), 0);
  const allSupplierPurchaseCount = purchaseRows.length;
  const allSupplierPurchaseKg = purchaseRows.reduce((sum, purchase) => sum + Number(purchase.total_quantity_kg ?? 0), 0);
  const allSupplierPurchaseAmount = purchaseRows.reduce((sum, purchase) => sum + Number(purchase.total_amount_dt ?? 0), 0);
  const buyerRows = buyers.data ?? [];
  const invoiceRows = salesInvoices.data ?? [];
  const selectedBuyer = buyerRows.find((buyer) => buyer.id === selectedBuyerId) ?? null;
  const selectedBuyerInvoices = invoiceRows.filter((invoice) => invoice.buyer_id === selectedBuyerId)
    .sort((a, b) => String(b.sale_date ?? b.created_at ?? "").localeCompare(String(a.sale_date ?? a.created_at ?? "")));
  const buyerInvoiceCount = selectedBuyerInvoices.length;
  const buyerGrossAmount = selectedBuyerInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount_dt ?? 0), 0);
  const buyerPaidAmount = selectedBuyerInvoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount_dt ?? 0), 0);
  const buyerOutstandingAmount = selectedBuyerInvoices.reduce((sum, invoice) => sum + Number(invoice.outstanding_amount_dt ?? 0), 0);
  const buyerCreditedAmount = selectedBuyerInvoices.reduce((sum, invoice) => sum + Number(invoice.credited_amount_dt ?? 0), 0);
  const allBuyerInvoiceCount = invoiceRows.length;
  const allBuyerGrossAmount = invoiceRows.reduce((sum, invoice) => sum + Number(invoice.total_amount_dt ?? 0), 0);
  const allBuyerOutstandingAmount = invoiceRows.reduce((sum, invoice) => sum + Number(invoice.outstanding_amount_dt ?? 0), 0);
  const filteredBuyerRows = buyerRows.filter((buyer) =>
    String(buyer.name ?? "").toLowerCase().includes(buyerSearch.toLowerCase()) ||
    String(buyer.phone ?? "").toLowerCase().includes(buyerSearch.toLowerCase()) ||
    String(buyer.contact_name ?? "").toLowerCase().includes(buyerSearch.toLowerCase()) ||
    String(buyer.tax_identifier ?? "").toLowerCase().includes(buyerSearch.toLowerCase())
  );
  useEffect(() => {
    if (!selectedBuyerId && buyerRows.length) setSelectedBuyerId(buyerRows[0].id);
    if (selectedBuyerId && !buyerRows.some((buyer) => buyer.id === selectedBuyerId)) setSelectedBuyerId(buyerRows[0]?.id ?? "");
  }, [selectedBuyerId, buyerRows]);
  useEffect(() => {
    if (!selectedSupplierId && supplierRows.length) setSelectedSupplierId(supplierRows[0].id);
    if (selectedSupplierId && !supplierRows.some((supplier) => supplier.id === selectedSupplierId)) setSelectedSupplierId(supplierRows[0]?.id ?? "");
  }, [selectedSupplierId, supplierRows]);
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
  const custodyClients = useQuery({ queryKey: ["commercial", "custody-clients"], queryFn: () => apiGetAllPages<AnyRecord>("/clients/options", 500), enabled: ready && (tab === "custody" || tab === "transfers") });
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
      setShowSupplierForm(false);
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
  const cancelPurchase = useMutation({
    mutationFn: ({ purchase, reason }: { purchase: AnyRecord; reason: string }) =>
      apiPost<AnyRecord>(`/commercial/v1/olive-purchases/${encodeURIComponent(purchase.id)}/cancel`, {
        expected_version: purchase.version ?? 1,
        reason,
      }),
    onSuccess: async (_result, { purchase }) => {
      toast.success(lang === "ar" ? "أُلغيت مسودة الشراء مع الاحتفاظ بسجل التدقيق" : "Brouillon d’achat annulé; l’audit est conservé");
      if (editingPurchase?.id === purchase.id) cancelPurchaseEdit();
      await queryClient.invalidateQueries({ queryKey: ["commercial", "purchases"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const createPurchase = useMutation({
    mutationFn: () => apiPost<AnyRecord>("/commercial/v1/olive-purchases", {
      supplier_id: purchaseSupplierId,
      purchase_date: purchaseDate,
      lines: purchaseLines.map((line) => ({
        variety_id: line.variety_id,
        quantity_kg: line.quantity_kg,
        unit_price_dt: line.unit_price_dt === "" ? "0.000" : millimesInputToDinars(line.unit_price_dt),
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
          unit_price_dt: line.unit_price_dt === "" ? "0.000" : millimesInputToDinars(line.unit_price_dt),
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
      unit_price_dt: dinarsToMillimesInput(line.unit_price_dt?.$numberDecimal ?? line.unit_price_dt),
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
    onSuccess: async (approvedPurchase) => {
      setSelectedPurchaseReceipt(approvedPurchase);
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
        const balance = (balances.data ?? []).find((b) => [b.lot_id, b.location_id, ownerIdentity(b.owner)].join("::") === line.balance_key);
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
  const createPreproductionSample = useMutation({
    mutationFn: () => {
      const balance = (balances.data ?? []).find((item) => [item.lot_id, item.location_id, ownerIdentity(item.owner)].join("::") === trialBalanceKey && item.product_kind === "OLIVE");
      const lot = (lots.data ?? []).find((item) => item.id === balance?.lot_id);
      if (!balance || !lot) throw new Error("Selected olive balance is no longer available");
      return apiPost<AnyRecord>("/commercial/v1/preproduction-samples", {
        source_olive_lot_id: lot.id, source_location_id: balance.location_id, owner: balance.owner,
        input_olive_quantity_kg: trialInputKg, sample_oil_quantity_kg: trialOilKg,
        trial_date: trialDate, notes: trialNotes.trim(), idempotency_key: crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم تسجيل تجربة العصر وخصم كمية الزيتون" : "Essai enregistré; la quantité d’olives a été déduite");
      setTrialBalanceKey(""); setTrialInputKg(""); setTrialOilKg(""); setTrialNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "preproduction-samples"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const adjustReadyLotBalance = useMutation({
    mutationFn: ({ balance, lot, target, reason }: { balance: AnyRecord; lot: AnyRecord; target: string; reason: string }) =>
      apiPost<AnyRecord>(`/commercial/v1/lots/${encodeURIComponent(lot.id)}/adjust-balance`, {
        expected_version: lot.version ?? 1,
        location_id: balance.location_id,
        target_quantity_kg: target,
        reason: reason.trim(),
      }),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم تعديل رصيد الدفعة وتسجيل الحركة" : "Stock du lot corrigé et mouvement enregistré");
      setAdjustingReadyBalance(null);
      setReadyBalanceTarget("");
      setReadyBalanceReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "internal-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const cancelPreproductionSample = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiPost<AnyRecord>(`/commercial/v1/preproduction-samples/${encodeURIComponent(id)}/cancel`, { reason }),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم إلغاء التجربة مع الاحتفاظ بسجل التدقيق" : "Essai annulé; l’audit est conservé");
      setCancelTrialId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "preproduction-samples"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const resolveInternalDestinationOwner = useMutation({
    mutationFn: (phone: string) => apiPost<AnyRecord>("/commercial/v1/customer-custody/owners/resolve", { customer_phone: phone }),
    onSuccess: async (owner) => {
      setInternalDestinationOwnerKey("CUSTOMER:" + owner.id);
      await queryClient.invalidateQueries({ queryKey: ["commercial", "custody-owners"] });
    },
    onError: (error) => {
      setInternalDestinationOwnerKey("");
      toast.error(error instanceof Error ? error.message : l.warning);
    },
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
      setInternalDestinationOwnerKey("");
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
        sample_reference: String(qualitySampleReference ?? "").trim(),
        sample_date: sampleDate,
        tested_date: testedDate,
        laboratory_name: configuredLaboratoryName,
        specification_reference: specificationReference.trim(),
        measurements: [],
        acidity: oilAcidity,
        peroxide: oilPeroxide === "" ? null : oilPeroxide,
        k232: oilK232 === "" ? null : oilK232,
        k270: oilK270 === "" ? null : oilK270,
        oil_content_pct: oilContent === "" ? null : oilContent,
        classification: qualityClassification || liveOilClassification,
        oil_type: oilType.trim() || null,
        notes: analysisNotes.trim(),
        idempotency_key: crypto.randomUUID(),
      };
      return correctingQualityAssessmentId
        ? apiPost<AnyRecord>(`/commercial/v1/quality-assessments/${encodeURIComponent(correctingQualityAssessmentId)}/corrections`, payload)
        : editingQualityAssessmentId
          ? apiPut<AnyRecord>(`/commercial/v1/quality-assessments/${encodeURIComponent(editingQualityAssessmentId)}`, payload)
          : apiPost<AnyRecord>("/commercial/v1/quality-assessments", payload);
    },
    onSuccess: async () => {
      toast.success(correctingQualityAssessmentId ? l.correctionSubmitted : editingQualityAssessmentId ? (lang === "ar" ? "تم تحديث التحليل" : "Analyse mise à jour") : l.assessmentSaved);
      setEditingQualityAssessmentId(""); setShowNewQualityAssessment(false); setCorrectingQualityAssessmentId(""); setQualityLotId("");
      setSampleReference(""); setLaboratoryName(""); setSpecificationReference("");
      setMeasurements([{ code: "", value: "", unit: "" }]);
      setOilAcidity(""); setQualityClassification(""); setOilPeroxide(""); setOilK232(""); setOilK270(""); setOilContent("");
      setOilType(""); setAnalysisNotes("");
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
      const lot = (lots.data ?? []).find((item) => item.id === assessment.oil_lot_id);
      if (!lot) throw new Error("Le lot d’huile lié à cette analyse est introuvable. Actualisez la page.");
      return apiPost<AnyRecord>("/commercial/v1/quality-assessments/release", {
        assessment_id: assessment.id,
        expected_lot_version: lot.version ?? 1,
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
      setBuyerTaxId(""); setBuyerAddress(""); setEditingBuyerId(""); setShowBuyerForm(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyers"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "buyer-account-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const resetBuyerEditor = () => {
    setEditingBuyerId(""); setBuyerName(""); setBuyerContact(""); setBuyerPhone("");
    setBuyerEmail(""); setBuyerTaxId(""); setBuyerAddress("");
  };
  const startBuyerEdit = (buyer: AnyRecord) => {
    setEditingBuyerId(buyer.id); setBuyerName(buyer.name ?? "");
    setBuyerContact(buyer.contact_name ?? ""); setBuyerPhone(buyer.phone ?? "");
    setBuyerEmail(buyer.email ?? ""); setBuyerTaxId(buyer.tax_identifier ?? "");
    setBuyerAddress(buyer.address ?? "");
  };
  const changeBuyerStatus = useMutation({
    mutationFn: (buyer: AnyRecord) => apiPost<AnyRecord>(
      `/commercial/v1/buyers/${encodeURIComponent(buyer.id)}/status`,
      { expected_version: buyer.version ?? 1, active: !buyer.active },
    ),
    onSuccess: async (_result, buyer) => {
      if (buyer.active) {
        toast.success(salesText.buyerDeleted);
        if (editingBuyerId === buyer.id) resetBuyerEditor();
      } else {
        toast.success(salesText.buyerReactivated);
      }
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
      sale_date: saleDate, buyer_id: saleBuyerId,
      source_tank_id: saleTankId, quantity_kg: saleQuantity,
      unit_price_dt: millimesInputToDinars(saleUnitPrice), notes: saleNotes.trim() || null,
      idempotency_key: saleIdempotencyKey,
    }),
    onSuccess: async () => {
      toast.success(salesText.saleSaved);
      setSaleQuantity(""); setSaleUnitPrice(""); setSaleNotes("");
      setSaleIdempotencyKey(crypto.randomUUID());
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
  const selectFillingPump = useMutation({
    mutationFn: ({ sale, pump }: { sale: AnyRecord; pump: AnyRecord }) =>
      apiPost<AnyRecord>(`/commercial/v1/sales/${encodeURIComponent(sale.id)}/pump-selection`, { pump_id: pump.id }),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم تسجيل المضخّة المختارة" : "Pompe sélectionnée et enregistrée");
      await queryClient.invalidateQueries({ queryKey: ["commercial", "sales"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const updateFillingStatus = useMutation({
    mutationFn: ({ sale, status, reason }: { sale: AnyRecord; status: "IN_PROGRESS" | "COMPLETED" | "INTERRUPTED"; reason?: string }) =>
      apiPost<AnyRecord>(`/commercial/v1/sales/${encodeURIComponent(sale.id)}/pump-status`, { status, reason }),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم تحديث حالة التعبئة" : "État du remplissage mis à jour");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "sales", "pumps"] }),
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
        payment_date: paymentDate, amount_dt: millimesInputToDinars(paymentAmount), method: paymentMethod,
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
          amount_dt: millimesInputToDinars(creditApplicationAmount),
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
          amount_dt: millimesInputToDinars(reversalAmount),
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
    mutationFn: (correctionReason?: string) => {
      const payload = {
        customer_phone: custodyCustomerPhone,
        receipt_date: custodyReceiptDate,
        variety_id: custodyVarietyId,
        quantity_kg: custodyReceiptQuantity,
        receiving_location_id: custodyReceivingLocationId,
        customer_acknowledgement_reference: custodyReceiptAck.trim(),
        source_reference: custodySourceReference.trim() || null,
        idempotency_key: custodyReceiptKey,
      };
      if (editingCustodyReceipt) {
        if (!correctionReason) throw new Error("A reason is required to correct a posted custody receipt");
        return apiPost<AnyRecord>(`/commercial/v1/customer-custody/receipts/${encodeURIComponent(editingCustodyReceipt.id)}/correct`, {
          expected_version: editingCustodyReceipt.version ?? 1,
          reason: correctionReason,
          replacement: payload,
        });
      }
      return apiPost<AnyRecord>("/commercial/v1/customer-custody/receipts", payload);
    },
    onSuccess: async () => {
      toast.success(editingCustodyReceipt
        ? (lang === "ar" ? "تم حفظ التصحيح مع الاحتفاظ بالمستند السابق" : "Correction enregistrée; le document précédent est conservé")
        : (lang === "ar" ? "تم استلام زيتون الحريف وتسجيله كأمانة" : "Olives du client reçues en garde"));
      setEditingCustodyReceipt(null);
      setCustodyReceiptQuantity(""); setCustodyReceiptAck(""); setCustodySourceReference("");
      setCustodyReceiptKey(crypto.randomUUID());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-owners"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-statement"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "internal-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const cancelCustodyReceipt = useMutation({
    mutationFn: ({ item, reason }: { item: AnyRecord; reason: string }) =>
      apiPost<AnyRecord>(`/commercial/v1/customer-custody/receipts/${encodeURIComponent(item.id)}/cancel`, {
        expected_version: item.version ?? 1,
        reason,
      }),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "أُلغي الاستلام بقيد عكسي محفوظ في سجل المخزون" : "Réception annulée par une écriture compensatoire conservée");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-statement"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "internal-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const releaseCustomerCustody = useMutation({
    mutationFn: (correctionReason?: string) => {
      const selectedOwner = (custodyOwners.data ?? []).find((item) => item.id === pickupCustomerId);
      if (!selectedOwner) throw new Error("Customer is no longer available");
      const balance = (balances.data ?? []).find((item) => item.lot_id + "::" + item.location_id === pickupBalanceKey);
      const payload = editingCustodyRelease
        ? {
            customer_id: editingCustodyRelease.customer_id,
            release_date: pickupDate,
            oil_lot_id: editingCustodyRelease.oil_lot_id,
            source_tank_id: editingCustodyRelease.source_tank_id,
            quantity_kg: pickupQuantity,
            customer_acknowledgement_reference: pickupAck.trim(),
            reason: pickupReason.trim(),
            idempotency_key: pickupKey,
          }
        : balance ? {
            customer_id: selectedOwner.id,
            release_date: pickupDate,
            oil_lot_id: balance.lot_id,
            source_tank_id: balance.location_id,
            quantity_kg: pickupQuantity,
            customer_acknowledgement_reference: pickupAck.trim(),
            reason: pickupReason.trim(),
            idempotency_key: pickupKey,
          } : null;
      if (!payload) throw new Error("Customer stock balance is no longer available");
      if (editingCustodyRelease) {
        if (!correctionReason) throw new Error("A reason is required to correct a posted custody release");
        return apiPost<AnyRecord>(`/commercial/v1/customer-custody/releases/${encodeURIComponent(editingCustodyRelease.id)}/correct`, {
          expected_version: editingCustodyRelease.version ?? 1,
          reason: correctionReason,
          replacement: payload,
        });
      }
      return apiPost<AnyRecord>("/commercial/v1/customer-custody/releases", payload);
    },
    onSuccess: async () => {
      toast.success(editingCustodyRelease
        ? (lang === "ar" ? "تم حفظ تصحيح التسليم مع الاحتفاظ بالمستند السابق" : "Correction enregistrée; le document précédent est conservé")
        : (lang === "ar" ? "تم تسليم زيت الحريف وتخفيض المخزون" : "Huile du client restituée et stock débité"));
      setEditingCustodyRelease(null);
      setPickupQuantity(""); setPickupAck(""); setPickupReason(""); setPickupBalanceKey("");
      setPickupKey(crypto.randomUUID());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-releases"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-statement"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "internal-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const cancelCustodyRelease = useMutation({
    mutationFn: ({ item, reason }: { item: AnyRecord; reason: string }) =>
      apiPost<AnyRecord>(`/commercial/v1/customer-custody/releases/${encodeURIComponent(item.id)}/cancel`, {
        expected_version: item.version ?? 1,
        reason,
      }),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "أُلغي التسليم بقيد عكسي محفوظ في سجل المخزون" : "Restitution annulée par une écriture compensatoire conservée");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-releases"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "custody-statement"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "lots"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "internal-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial", "audit"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : l.warning),
  });
  const beginCustodyReceiptEdit = (item: AnyRecord) => {
    setEditingCustodyReceipt(item);
    setCustodyCustomerPhone(item.customer_phone ?? "");
    setCustodyReceiptDate(String(item.receipt_date ?? "").slice(0, 10));
    setCustodyVarietyId(item.variety_id ?? "");
    setCustodyReceiptQuantity(String(item.quantity_kg?.$numberDecimal ?? item.quantity_kg ?? ""));
    setCustodyReceivingLocationId(item.receiving_location_id ?? "");
    setCustodyReceiptAck(item.customer_acknowledgement_reference ?? "");
    setCustodySourceReference(item.source_reference ?? "");
    setCustodyReceiptKey(crypto.randomUUID());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const beginCustodyReleaseEdit = (item: AnyRecord) => {
    setEditingCustodyRelease(item);
    setPickupCustomerId(item.customer_id ?? "");
    setPickupDate(String(item.release_date ?? "").slice(0, 10));
    setPickupBalanceKey(item.oil_lot_id + "::" + item.source_tank_id);
    setPickupQuantity(String(item.quantity_kg?.$numberDecimal ?? item.quantity_kg ?? ""));
    setPickupAck(item.customer_acknowledgement_reference ?? "");
    setPickupReason(item.reason ?? "");
    setPickupKey(crypto.randomUUID());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
  const canCreatePreproductionSample = permissions.data?.permissions.includes("commercial.manage_preproduction_samples") === true;
  const canReviewQuality = permissions.data?.permissions.includes("commercial.quality_release") === true;
  // New preproduction assessments must target trial oil lots; keep a legacy lot selectable only while editing its existing assessment.
  const qualityOilLots = (lots.data ?? []).filter((lot) => lot.product_kind === "OIL" && ((lot.lot_purpose === "PREPRODUCTION_SAMPLE" && (lots.data ?? []).some((source) => source.id === lot.source_olive_lot_id && source.latest_preproduction_sample_id === lot.source_preproduction_sample_id)) || ((editingQualityAssessmentId || correctingQualityAssessmentId) && lot.id === qualityLotId)));
  const selectedQualityLot = qualityOilLots.find((lot) => lot.id === qualityLotId);
  const selectedQualitySourceLot = selectedQualityLot?.source_olive_lot_id
    ? (lots.data ?? []).find((lot) => lot.id === selectedQualityLot.source_olive_lot_id)
    : undefined;
  const qualitySampleReference = selectedQualitySourceLot?.batch_code ?? selectedQualityLot?.batch_code ?? sampleReference;
  const selectedOliveVariety = (varieties.data ?? []).find((variety) =>
    variety.id === (selectedQualitySourceLot?.variety_id ?? selectedQualityLot?.variety_id)
  );
  const selectedOliveType = selectedOliveVariety
    ? (lang === "ar" ? (selectedOliveVariety.name_ar || selectedOliveVariety.name_fr) : selectedOliveVariety.name_fr || selectedOliveVariety.name_ar)
    : (lang === "ar"
      ? (selectedQualitySourceLot?.variety_name_ar || selectedQualitySourceLot?.variety_name || selectedQualitySourceLot?.variety_name_fr || selectedQualityLot?.variety_name_ar || selectedQualityLot?.variety_name || selectedQualityLot?.variety_name_fr || "")
      : (selectedQualitySourceLot?.variety_name_fr || selectedQualitySourceLot?.variety_name || selectedQualitySourceLot?.variety_name_ar || selectedQualityLot?.variety_name_fr || selectedQualityLot?.variety_name || selectedQualityLot?.variety_name_ar || ""));
  const liveOilClassification = oilAcidity.trim() === "" || !Number.isFinite(Number(oilAcidity))
    ? ""
    : Number(oilAcidity) <= 0.8
      && (oilPeroxide === "" || (Number.isFinite(Number(oilPeroxide)) && Number(oilPeroxide) <= 20))
      && (oilK232 === "" || (Number.isFinite(Number(oilK232)) && Number(oilK232) <= 2.5))
      && (oilK270 === "" || (Number.isFinite(Number(oilK270)) && Number(oilK270) <= 0.22))
        ? "extra_vierge"
        : Number(oilAcidity) <= 2
          && (oilPeroxide === "" || (Number.isFinite(Number(oilPeroxide)) && Number(oilPeroxide) <= 20))
          && (oilK232 === "" || (Number.isFinite(Number(oilK232)) && Number(oilK232) <= 2.6))
          && (oilK270 === "" || (Number.isFinite(Number(oilK270)) && Number(oilK270) <= 0.25))
            ? "vierge" : "lampante";
  const liveOilClassificationLabel = liveOilClassification === "extra_vierge" ? l.extraVirgin
    : liveOilClassification === "vierge" ? l.virgin
      : liveOilClassification === "lampante" ? l.lampante : (lang === "ar" ? "بانتظار النتائج" : "En attente des résultats");

  const configuredMillName = String(millSettings.data?.mill_name ?? laboratoryName ?? "").trim();
  const configuredLaboratoryName = configuredMillName
    ? (/^labo\b/i.test(configuredMillName) ? configuredMillName : `Labo ${configuredMillName}`)
    : "Labo Oroverde";
  const canOpenQualityAssessment = (assessment: AnyRecord) => {
    const lot = (lots.data ?? []).find((item) => item.id === assessment.oil_lot_id);
    // Once an independent quality decision has been recorded, the assessment is immutable in the UI.
    return Boolean(canRecordLab && lot && lot.last_quality_assessment_id === assessment.id
      && assessment.status === "AWAITING_INDEPENDENT_REVIEW"
      && (assessment.created_by === me.data?.id || isAdmin));
  };
  const reviewableAssessments = (quality.data ?? []).filter((assessment) => {
    const lot = (lots.data ?? []).find((item) => item.id === assessment.oil_lot_id);
    return assessment.status === "AWAITING_INDEPENDENT_REVIEW"
      && lot?.status === "OPEN"
      && lot?.last_quality_assessment_id === assessment.id
      && ["PENDING", "REJECTED"].includes(String(lot?.quality_status));
  });
  const selectedReviewAssessment = (quality.data ?? []).find((assessment) => assessment.id === reviewAssessmentId);
  const handleQualityQrScan = useCallback((scannedValue: string) => {
    const scanned = scannedValue.trim();
    let certificateId = "";
    let purchaseCode = scanned;
    try {
      const parsed = new URL(scanned);
      const certificateMatch = parsed.pathname.match(/\/commercial\/certificate\/([^/]+)/i);
      if (certificateMatch) certificateId = decodeURIComponent(certificateMatch[1]);
      purchaseCode = parsed.searchParams.get("code")?.trim() || purchaseCode;
    } catch {
      // A printed QR may contain the raw purchase traceability code instead of a URL.
    }
    const match = reviewableAssessments.find((assessment) =>
      (certificateId && assessment.id === certificateId)
      || String(assessment.sample_reference ?? "").trim().toLowerCase() === purchaseCode.toLowerCase()
      || String(assessment.batch_code ?? "").trim().toLowerCase() === purchaseCode.toLowerCase()
      || String((lots.data ?? []).find((lot) => lot.id === assessment.oil_lot_id)?.batch_code ?? "").trim().toLowerCase() === purchaseCode.toLowerCase()
    );
    if (!match) {
      toast.error(lang === "ar" ? "لم يتم العثور على تحليل ينتظر قرار الجودة لهذا الرمز. تأكد من أن الشهادة تخص دفعة تنتظر المراجعة." : "Aucune analyse en attente de décision qualité ne correspond à ce QR code.");
      return;
    }
    setReviewAssessmentId(match.id);
    toast.success(lang === "ar" ? "تم العثور على التحليل واختياره للمراجعة." : "Analyse trouvée et sélectionnée pour la revue.");
  }, [reviewableAssessments, lots.data, lang]);

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

  const activeSaleTankIds = new Set((tanks.data ?? [])
    .filter((tank) => tank.active && (tank.role ?? "NORMAL") === "NORMAL")
    .map((tank) => tank.id));
  // Sale stock is based on every positive mill-owned oil balance in an
  // active normal tank. Lot status/purpose/quality restrictions are not applied.
  const saleTankBalances = (balances.data ?? []).filter((balance) =>
    balance.product_kind === "OIL" && balance.owner?.kind === "MILL"
    && Number(balance.quantity_kg) > 0 && activeSaleTankIds.has(balance.location_id)
  );
  const saleTankOptions = Array.from(new Set(saleTankBalances.map((balance) => balance.location_id)))
    .map((locationId) => ({
      locationId,
      tank: (tanks.data ?? []).find((item) => item.id === locationId),
      quantity: saleTankBalances.filter((balance) => balance.location_id === locationId)
        .reduce((sum, balance) => sum + Number(balance.quantity_kg ?? 0), 0),
    }))
    .filter((option) => option.tank);

  const availableOliveBalances: AnyRecord[] = (balances.data ?? []).filter((balance: AnyRecord) =>
    balance.product_kind === "OLIVE" && Number(balance.quantity_kg) > 0
    && (lots.data ?? []).some((lot: AnyRecord) => lot.id === balance.lot_id && lot.status === "OPEN")
  );
  const availableTrialBalances = availableOliveBalances.filter((balance) =>
    (locations.data ?? []).some((location) => location.id === balance.location_id && location.active && ["OLIVE_STORAGE", "STAGING"].includes(location.kind))
  );
  const eligibleProductionBalances = availableOliveBalances.filter((balance) =>
    (lots.data ?? []).some((lot) => lot.id === balance.lot_id && lot.preproduction_quality_status === "RELEASED"
      && !!lot.preproduction_sample_id && !!lot.preproduction_quality_assessment_id && lot.latest_preproduction_sample_id === lot.preproduction_sample_id)
  );

  const availableInternalBalances = (balances.data ?? []).filter((balance) => {
    if (balance.product_kind !== internalProductKind || Number(balance.quantity_kg) <= 0) return false;
    const lot = (lots.data ?? []).find((item) => item.id === balance.lot_id && item.status === "OPEN");
    if (!lot) return false;
    if (internalProductKind === "OIL") {
      if (lot.lot_purpose === "PREPRODUCTION_SAMPLE") return false;
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
    : (custodyClients.data ?? []).flatMap((client) => {
        const existingOwner = (custodyOwners.data ?? []).find((owner) => owner.client_phone === client.phone);
        if (existingOwner && existingOwner.active === false) return [];
        return [{
          key: existingOwner ? "CUSTOMER:" + existingOwner.id : "CLIENT:" + client.phone,
          label: l.customer + ": " + client.client_name + " · " + client.phone,
        }];
      });

  const availableCustomerOilBalances = (balances.data ?? []).filter((balance) =>
    balance.product_kind === "OIL" && Number(balance.quantity_kg) > 0
    && balance.owner?.kind === "CUSTOMER" && balance.owner?.customer_id === pickupCustomerId
    && (tanks.data ?? []).some((tank) => tank.id === balance.location_id && tank.active && (tank.role ?? "NORMAL") === "NORMAL")
    && (lots.data ?? []).some((lot) => lot.id === balance.lot_id && lot.status === "OPEN" && lot.quality_status === "RELEASED")
  );
  const selectedPickupBalance = availableCustomerOilBalances.find((balance) => balance.lot_id + "::" + balance.location_id === pickupBalanceKey);
  const productionInputTotal = productionInputs.reduce((sum, line) => {
    const rawQuantity = String(line.quantity_kg ?? "").trim().replace(",", ".");
    const quantity = rawQuantity === "" ? 0 : Number(rawQuantity);
    return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
  const productionRate = productionInputTotal > 0 && Number(productionOutputKg) >= 0
    ? (Number(productionOutputKg) / productionInputTotal) * 100 : 0;


  // Operational sequence: supplier → olive intake/purchase → lot tracking → pressing → oil storage → quality → movements → delivery/sale.
  const tabs: { id: TabKey; label: string; icon: typeof Warehouse }[] = [
    { id: "overview", label: l.overview, icon: Activity },
    { id: "reports", label: "Rapport", icon: FileText },
    { id: "suppliers", label: l.suppliers, icon: Truck },
    { id: "purchases", label: l.purchasesTab, icon: ShoppingBasket },
    { id: "lots", label: l.lots, icon: Boxes },
    { id: "quality", label: l.quality, icon: Beaker },
    { id: "production", label: l.productionTab, icon: Factory },
    { id: "movements", label: l.movements, icon: ArrowLeftRight },
    { id: "transfers", label: l.internalMovementsTab, icon: RefreshCw },
    { id: "custody", label: l.custodyTab, icon: Handshake },
    { id: "buyers", label: salesText.buyers, icon: UserRound },
    { id: "sales", label: salesText.sales, icon: ShoppingCart },
    { id: "factures", label: l.facturesTab, icon: FileText },
    // Supporting/setup sections are grouped after the operational flow.
  ];

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
        <button type="button" onClick={() => setShowTankLevels((open) => !open)} aria-expanded={showTankLevels} aria-controls="commercial-tank-levels" className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"><Card className="commercial-card commercial-card--blue transition-shadow hover:shadow-md"><CardHeader className="pb-1"><div className="flex items-center justify-between gap-2"><CardDescription>{l.tanksCount}</CardDescription><Warehouse className="commercial-card-icon size-6" /></div><CardTitle className="text-2xl">{status.data?.tanks_provisioned ?? "—"}/9</CardTitle><CardDescription className="text-xs">{showTankLevels ? (lang === "ar" ? "انقر لإخفاء مستويات الزيت" : "Cliquer pour masquer les niveaux") : (lang === "ar" ? "انقر لعرض مستويات الزيت" : "Cliquer pour afficher les niveaux")}</CardDescription></CardHeader></Card></button>
        <Card className="commercial-card commercial-card--teal"><CardHeader className="pb-1"><div className="flex items-center justify-between gap-2"><CardDescription>{l.locations}</CardDescription><MapPin className="commercial-card-icon size-6" /></div><CardTitle className="text-2xl">{status.data?.active_olive_locations ?? "—"}</CardTitle></CardHeader></Card>
        <Card className="commercial-card commercial-card--amber"><CardHeader className="pb-1"><div className="flex items-center justify-between gap-2"><CardDescription>{l.counters}</CardDescription><ClipboardList className="commercial-card-icon size-6" /></div><CardTitle className="text-2xl">{status.data?.season_counters_provisioned ?? "—"}/16</CardTitle></CardHeader></Card>
      </div>}

      {tab === "overview" && ready && showTankLevels && <div id="commercial-tank-levels"><Card className="commercial-card commercial-card--blue">
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
                  <div key={tank.id} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-2 pt-3 pb-2 dark:border-sky-900/60 dark:bg-slate-900/50" title={`${tankLabel}: ${number(quantity)} L${capacity > 0 ? ` / ${number(capacity)} L` : ""}`}>
                    <div className="flex h-36 w-full max-w-16 items-end overflow-hidden rounded-t-lg rounded-b-md border border-sky-200 bg-white shadow-inner dark:border-slate-700 dark:bg-slate-950">
                      <div className="w-full rounded-t-sm bg-gradient-to-t from-sky-700 via-cyan-500 to-cyan-300 transition-[height] duration-700 ease-out" style={{ height: `${fillPercent}%`, minHeight: quantity > 0 ? "4px" : "0" }} />
                    </div>
                    <span className="w-full truncate text-center text-sm font-bold text-slate-800 dark:text-slate-100">{lang === "ar" ? "خزان" : "Cuve"} {tankLabel}</span>
                    <span className="text-xs font-semibold tabular-nums text-sky-800 dark:text-sky-300">{number(quantity)} L</span>
                    {capacity > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(fillPercent)}%</span>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card></div>}

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

      

      <nav aria-label="GESTION COMMERCIALE" data-testid="commercial-bottom-nav" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-[#CFE3C4]/30 bg-[#1E2B20]/80 shadow-[0_-8px_24px_rgba(20,35,22,0.20)] backdrop-blur-none">
        <div className="mx-auto flex max-w-7xl items-stretch gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => selectTab(id)} aria-pressed={tab === id} className={`flex min-w-[5.4rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-1.5 text-xs font-semibold transition-colors ${tab === id ? "border-[#CFE3C4] bg-[#2C4A30] text-white" : "border-transparent text-[#D3DDCF] hover:bg-white/10 hover:text-white"}`}>
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
            <Card className="commercial-card commercial-card--violet"><CardHeader><div className="flex items-center justify-between gap-2"><CardDescription>{l.oil}</CardDescription><Beaker className="commercial-card-icon size-7" /></div><CardTitle className="text-3xl">{number(totalOil)} L</CardTitle></CardHeader></Card>
            <Card className="commercial-card commercial-card--rose"><CardHeader><div className="flex items-center justify-between gap-2"><CardDescription>{l.quality}</CardDescription><ShieldCheck className="commercial-card-icon size-7" /></div><CardTitle className="text-3xl">{ready ? qualityPending : "—"}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader></Card>
          </div>
          <Card><CardHeader><CardTitle>{l.readiness}</CardTitle><CardDescription>{ready ? l.ready : l.notReady}</CardDescription></CardHeader><CardContent className="flex items-center gap-2 text-sm">{ready ? <ShieldCheck className="size-5 text-emerald-600" /> : <AlertTriangle className="size-5 text-amber-600" />}{ready ? l.ready : l.warning}</CardContent></Card>
        </div>
      )}

      {tab === "overview" && ready && <Card className="commercial-card">
        <CardHeader><CardTitle>{lang === "ar" ? "متابعة عمليات شراء الزيتون" : "Suivi des achats d’olives"}</CardTitle>
          <CardDescription>{lang === "ar" ? "تتبع كود الشراء وموقعه في مراحل الإنتاج" : "Suivi du code d’achat et de son avancement dans le processus de production"}</CardDescription>
        </CardHeader>
        <CardContent><div className="overflow-x-auto"><Table>
          <TableHeader><TableRow>
            <TableHead>{lang === "ar" ? "كود الشراء" : "Code d’achat"}</TableHead>
            <TableHead>{lang === "ar" ? "تاريخ الشراء" : "Date d’achat"}</TableHead>
            <TableHead>{l.supplier}</TableHead>
            <TableHead>{lang === "ar" ? "صنف الزيتون" : "Variété d’olives"}</TableHead>
            <TableHead>{l.status}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{[...purchaseRows].sort((a, b) => String(b.purchase_date ?? b.created_at ?? "").localeCompare(String(a.purchase_date ?? a.created_at ?? ""))).map((purchase) => {
            const linkedLots = (lots.data ?? []).filter((lot) => lot.source_purchase_id === purchase.id || (purchase.batch_codes ?? [purchase.batch_code]).filter(Boolean).includes(lot.batch_code));
            const productionForPurchase = (productionRuns.data ?? []).filter((run) => linkedLots.some((lot) => lot.id === run.input_lot_id || lot.id === run.source_lot_id));
            const varietyIds = Array.from(new Set(linkedLots.map((lot) => lot.variety_id).concat((purchase.lines ?? []).map((line: AnyRecord) => line.variety_id)).filter(Boolean)));
            const varietyLabels = varietyIds.map((id) => {
              const variety = (varieties.data ?? []).find((item) => item.id === id);
              return variety ? (lang === "ar" ? variety.name_ar || variety.name_fr : variety.name_fr || variety.name_ar) : "";
            }).filter(Boolean);
            const availableOlives = linkedLots.some((lot) => (balances.data ?? []).some((balance) => balance.product_kind === "OLIVE" && balance.lot_id === lot.id && Number(balance.quantity_kg ?? 0) > 0));
            const stage = purchase.status === "DRAFT"
              ? (lang === "ar" ? "مسودة شراء" : "Brouillon d’achat")
              : purchase.status === "CANCELLED"
                ? (lang === "ar" ? "شراء ملغى" : "Achat annulé")
                : productionForPurchase.length
                  ? (lang === "ar" ? "تم تسجيل الإنتاج" : "Production enregistrée")
                  : availableOlives
                    ? (lang === "ar" ? "مخزون زيتون — بانتظار الإنتاج" : "Stock d’olives — en attente de production")
                    : linkedLots.length
                      ? (lang === "ar" ? "الدفعة موجودة — لا يوجد رصيد زيتون متبقٍ" : "Lot créé — olives consommées ou transférées")
                      : (lang === "ar" ? "شراء مصادق عليه — بانتظار الاستلام" : "Achat approuvé — réception à suivre");
            return <TableRow key={purchase.id}>
              <TableCell className="font-mono text-xs font-semibold">{value(purchase.batch_codes?.join(", ") || purchase.batch_code || purchase.lines?.map((line: AnyRecord) => line.batch_code).filter(Boolean).join(", "), purchase.document_number)}</TableCell>
              <TableCell>{date(purchase.purchase_date ?? purchase.created_at)}</TableCell>
              <TableCell>{value((supplierRows).find((supplier) => supplier.id === purchase.supplier_id)?.name)}</TableCell>
              <TableCell>{varietyLabels.join(" / ") || "—"}</TableCell>
              <TableCell><span className="inline-flex rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">{stage}</span></TableCell>
            </TableRow>;
          })}
          {(!purchases.isLoading && !purchaseRows.length) && <EmptyRow colSpan={5} text={l.noRows} />}
          </TableBody></Table></div></CardContent>
      </Card>}

      

      {tab === "lots" && <Card><CardHeader><CardTitle>{l.lots}</CardTitle><CardDescription>{l.owner}: MILL / CUSTOMER</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.product}</TableHead><TableHead>{lang === "ar" ? "أصل الدفعة" : "Origine du lot"}</TableHead><TableHead>{l.owner}</TableHead><TableHead>{l.currentStock}</TableHead><TableHead>{l.qualityStatus}</TableHead><TableHead>{l.status}</TableHead></TableRow></TableHeader><TableBody>{(lots.data ?? []).map((lot) => { const sourcePurchase = (purchaseRows).find((purchase) => purchase.id === lot.source_purchase_id); const sourceProduction = (productionRuns.data ?? []).find((run) => run.id === lot.source_production_id); const isAnalysisSample = lot.product_kind === "OIL" && lot.lot_purpose === "PREPRODUCTION_SAMPLE"; const originLabel = lot.product_kind === "OLIVE" ? (lang === "ar" ? "شراء زيتون" : "Achat d’olives") : isAnalysisSample ? (lang === "ar" ? "عينة تحليلية" : "Échantillon d’analyse") : sourceProduction ? `${lang === "ar" ? "إنتاج" : "Production"} · ${sourceProduction.document_number ?? "—"}` : (lang === "ar" ? "زيت — مصدر غير محدد" : "Huile — origine non précisée"); return <TableRow key={lot.id} className={qrBatchCode && lot.batch_code === qrBatchCode ? "bg-amber-100 ring-2 ring-inset ring-amber-500" : undefined}><TableCell className="font-mono text-xs">{lotCode(lot)}</TableCell><TableCell>{lot.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell><TableCell><div className="flex flex-col gap-1"><span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ${isAnalysisSample ? "bg-violet-100 text-violet-800" : lot.product_kind === "OLIVE" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{originLabel}</span>{lot.product_kind === "OLIVE" && sourcePurchase?.document_number && <span className="text-xs text-muted-foreground">{sourcePurchase.document_number}</span>}</div></TableCell><TableCell>{currentOwnersForLot(lot)}</TableCell><TableCell>{number(currentStockQuantityForLot(lot))} {lot.product_kind === "OIL" ? "L" : "kg"}</TableCell><TableCell>{lot.product_kind === "OIL" ? value(lot.quality_status, l.pending) : "—"}</TableCell><TableCell>{value(lot.status)}</TableCell></TableRow>; })}{(!lots.isLoading && !(lots.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody></Table></CardContent></Card>}

      {tab === "transfers" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>{l.internalMovementTitle}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader>
          <CardContent>
            {canPostStock && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); postInternalMovement.mutate(); }}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">{l.movementType}
                  <select value={internalMovementKind} onChange={(e) => { setInternalMovementKind(e.target.value as "TRANSFER" | "OWNERSHIP_TRANSFER"); setInternalDestinationLocationId(""); setInternalDestinationOwnerKey(""); setInternalMovementKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal">
                    <option value="TRANSFER">{l.transferType}</option>
                    <option value="OWNERSHIP_TRANSFER">{l.ownershipTransferType}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">{l.productKind}
                  <select value={internalProductKind} onChange={(e) => { setInternalProductKind(e.target.value as "OLIVE" | "OIL"); setInternalSourceBalanceKey(""); setInternalDestinationLocationId(""); setInternalDestinationOwnerKey(""); setInternalMovementKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal">
                    <option value="OIL">{l.oil}</option><option value="OLIVE">{l.olive}</option>
                  </select>
                </label>
              </div>
              <label className="grid max-w-2xl gap-1 text-sm font-medium">{l.sourceBalance}
                <select required value={internalSourceBalanceKey} onChange={(e) => { const selectedKey = e.target.value; const selected = availableInternalBalances.find((balance) => [balance.product_kind, balance.lot_id, balance.location_id, ownerIdentity(balance.owner)].join("::") === selectedKey); setInternalSourceBalanceKey(selectedKey); setInternalDestinationLocationId(""); setInternalDestinationOwnerKey(selected?.owner?.kind === "CUSTOMER" ? "MILL" : ""); setInternalMovementQuantity(""); setInternalMovementKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal">
                  <option value="">—</option>
                  {availableInternalBalances.map((balance) => {
                    const lot = (lots.data ?? []).find((item) => item.id === balance.lot_id);
                    const location = internalProductKind === "OIL"
                      ? (tanks.data ?? []).find((item) => item.id === balance.location_id)
                      : (locations.data ?? []).find((item) => item.id === balance.location_id);
                    const key = [balance.product_kind, balance.lot_id, balance.location_id, ownerIdentity(balance.owner)].join("::");
                    return <option key={key} value={key}>{lot?.batch_code ?? "—"} · {location?.code ?? balance.location_id} · {displayOwnerLabel(balance.owner)} · {number(balance.quantity_kg)} {internalProductKind === "OIL" ? "L" : "kg"}</option>;
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
                  <select required value={internalDestinationOwnerKey} onChange={(e) => { const selectedKey = e.target.value; setInternalDestinationOwnerKey(selectedKey); setInternalMovementKey(crypto.randomUUID()); if (selectedKey.startsWith("CLIENT:")) resolveInternalDestinationOwner.mutate(selectedKey.slice("CLIENT:".length)); }} disabled={!selectedInternalBalance || resolveInternalDestinationOwner.isPending} className="h-10 rounded-lg border bg-background px-3 font-normal">
                    <option value="">—</option>
                    {internalDestinationOwnerOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </label>}
                <label className="grid gap-1 text-sm font-medium">{l.quantity}
                  <input required type="number" min="0.001" step="0.001" max={selectedInternalBalance?.quantity_kg ?? undefined} value={internalMovementQuantity} onChange={(e) => { setInternalMovementQuantity(e.target.value); setInternalMovementKey(crypto.randomUUID()); }} disabled={!selectedInternalBalance} className="h-10 rounded-lg border bg-background px-3 font-normal" />
                  {selectedInternalBalance && <span className="text-xs text-muted-foreground">{l.quantity}: {number(selectedInternalBalance.quantity_kg)} {internalProductKind === "OIL" ? "L" : "kg"}</span>}
                </label>
              </div>
              <label className="grid max-w-2xl gap-1 text-sm font-medium">{l.movementReason}
                <input required minLength={3} maxLength={500} value={internalMovementReason} onChange={(e) => { setInternalMovementReason(e.target.value); setInternalMovementKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" />
              </label>
              {availableInternalBalances.length === 0 && <p className="text-sm text-amber-700">{l.noAvailableBalance}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={postInternalMovement.isPending || resolveInternalDestinationOwner.isPending || !selectedInternalBalance || !(Number(internalMovementQuantity) > 0) || Number(internalMovementQuantity) > Number(selectedInternalBalance?.quantity_kg ?? 0) || internalMovementReason.trim().length < 3 || (internalMovementKind === "TRANSFER" ? !internalDestinationLocationId : !internalDestinationOwnerKey || !internalDestinationOwnerOptions.some((item) => item.key === internalDestinationOwnerKey))}>
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
                <TableCell className="font-mono text-xs">{lotCode((lots.data ?? []).find((lot) => lot.id === movement.lot_id), movement.document_number)}</TableCell>
                <TableCell>{value(movement.movement_kind)}</TableCell>
                <TableCell>{movement.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell>
                <TableCell>{number(movement.quantity_kg)} {movement.product_kind === "OIL" ? "L" : "kg"}</TableCell>
                <TableCell>{value((movement.product_kind === "OIL" ? (tanks.data ?? []) : (locations.data ?? [])).find((item) => item.id === movement.source_location_id)?.code ?? movement.source_location_id)}</TableCell>
                <TableCell>{value((movement.product_kind === "OIL" ? (tanks.data ?? []) : (locations.data ?? [])).find((item) => item.id === movement.destination_location_id)?.code ?? movement.destination_location_id)}</TableCell>
                <TableCell>{displayOwnerLabel(movement.source_owner)} → {displayOwnerLabel(movement.destination_owner)}</TableCell>
                <TableCell>{date(movement.created_at)}</TableCell>
              </TableRow>;
            })}{(!internalMovementDocuments.isLoading && !(internalMovementDocuments.data?.length)) && <EmptyRow colSpan={8} text={l.noRows} />}</TableBody>
          </Table></CardContent>
        </Card>
      </div>}

      {tab === "movements" && <Card><CardHeader><CardTitle>{l.movements}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.movement}</TableHead><TableHead>{l.product}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{l.source}</TableHead><TableHead>{l.destination}</TableHead><TableHead>{l.created}</TableHead></TableRow></TableHeader><TableBody>{(movements.data ?? []).map((m) => <TableRow key={m.id}><TableCell className="font-mono text-xs">{lotCode((lots.data ?? []).find((lot) => lot.id === m.lot_id), m.document_number)}</TableCell><TableCell>{value(m.movement_kind)}</TableCell><TableCell>{m.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell><TableCell>{number(m.quantity_kg)} {m.product_kind === "OIL" ? "L" : "kg"}</TableCell><TableCell>{value(m.source_location_id)}</TableCell><TableCell>{value(m.destination_location_id)}</TableCell><TableCell>{date(m.created_at)}</TableCell></TableRow>)}{(!movements.isLoading && !(movements.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody></Table></CardContent></Card>}


      {tab === "quality" && <div className="space-y-4">
        {(editingQualityAssessmentId || correctingQualityAssessmentId || showNewQualityAssessment) && canRecordLab && <Card><CardHeader><CardTitle>{correctingQualityAssessmentId ? l.correctedAnalysis : (lang === "ar" ? "تعديل تحليل الزيت" : "Modifier l’analyse d’huile")}</CardTitle><CardDescription>{correctingQualityAssessmentId ? l.qualityCorrectionNote : l.qualityRule}</CardDescription></CardHeader><CardContent>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submitQualityAssessment.mutate(); }}>
            <label className="grid max-w-xl gap-1 text-sm font-medium">{l.qualityLot}
              <select required disabled value={qualityLotId} className="h-10 rounded-lg border bg-muted px-3 font-normal"><option value={qualityLotId}>{lotCode((lots.data ?? []).find((lot) => lot.id === qualityLotId), qualityLotId)}</option></select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">{l.sampleReference}<input required readOnly value={qualitySampleReference} className="h-10 rounded-lg border bg-muted px-3 font-mono font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{l.laboratory}<input required readOnly value={configuredLaboratoryName} className="h-10 rounded-lg border bg-muted px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{l.sampleDate}<input required type="date" value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{l.testedDate}<input required type="date" min={sampleDate} value={testedDate} onChange={(e) => setTestedDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            </div>
            <div className="space-y-3 rounded-xl border p-4">
              <h3 className="font-semibold">{l.oilAnalysis}</h3>
              <label className="mb-3 grid max-w-xl gap-1 text-sm font-medium">{l.specification}<input required minLength={2} maxLength={160} value={specificationReference} onChange={(e) => setSpecificationReference(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">{l.acidity}<input required type="number" min="0" step="0.01" value={oilAcidity} onChange={(e) => setOilAcidity(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.peroxide}<input type="number" min="0" step="0.01" value={oilPeroxide} onChange={(e) => setOilPeroxide(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.k232}<input type="number" min="0" step="0.001" value={oilK232} onChange={(e) => setOilK232(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.k270}<input type="number" min="0" step="0.001" value={oilK270} onChange={(e) => setOilK270(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.oilContent}<input type="number" min="0" step="0.1" value={oilContent} onChange={(e) => setOilContent(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.oliveType}<input readOnly value={selectedOliveType || "—"} className="h-10 rounded-lg border bg-muted px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium">{l.classification}<select value={qualityClassification || liveOilClassification} onChange={(e) => setQualityClassification(e.target.value as typeof qualityClassification)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="extra_vierge">{l.extraVirgin}</option><option value="vierge">{l.virgin}</option><option value="lampante">{l.lampante}</option></select></label>
                <label className="grid gap-1 text-sm font-medium">{l.oilType}<input maxLength={100} value={oilType} onChange={(e) => setOilType(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /><span className="inline-flex w-fit items-center rounded-md border border-amber-400/60 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/50 dark:text-amber-200" aria-live="polite">{lang === "ar" ? "التصنيف المحسوب آليًا: " : "Classification calculée automatiquement : "}{liveOilClassificationLabel}</span></label>
                <label className="grid gap-1 text-sm font-medium md:col-span-2">{l.analysisNotes}<textarea maxLength={2000} value={analysisNotes} onChange={(e) => setAnalysisNotes(e.target.value)} className="min-h-20 rounded-lg border bg-background px-3 py-2 font-normal" /></label>
              </div>
              <p className="text-xs text-muted-foreground">{l.qualityRule}</p>
            </div>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={submitQualityAssessment.isPending || millSettings.isLoading || millSettings.isError || !qualityLotId || !String(qualitySampleReference ?? "").trim() || !configuredLaboratoryName.trim() || !specificationReference.trim() || oilAcidity === ""}>{correctingQualityAssessmentId ? l.submitCorrection : (lang === "ar" ? "حفظ التعديلات" : "Enregistrer les modifications")}</Button><Button type="button" variant="outline" onClick={() => { setEditingQualityAssessmentId(""); setCorrectingQualityAssessmentId(""); setQualityLotId(""); setShowNewQualityAssessment(false); }}>{lang === "ar" ? "إلغاء" : "Annuler"}</Button></div>
          </form>
        </CardContent></Card>}
        {canReviewQuality && <Card><CardHeader><CardTitle>{l.reviewerPanel}</CardTitle><CardDescription>{l.qualityRule}</CardDescription></CardHeader><CardContent>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); releaseQualityAssessment.mutate(); }}>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <label className="grid gap-1 text-sm font-medium">{l.chooseAssessment}
                <select required value={reviewAssessmentId} onChange={(e) => setReviewAssessmentId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{reviewableAssessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{lotCode((lots.data ?? []).find((lot) => lot.id === assessment.oil_lot_id), assessment.oil_lot_id)} · {assessment.sample_reference} · {assessment.laboratory_name}</option>)}</select>
              </label>
              <Button type="button" variant="outline" onClick={() => setQualityQrScanOpen(true)} className="h-10 gap-2">
                <ScanLine className="size-4" />{lang === "ar" ? "مسح QR للشهادة" : "Scanner le QR du certificat"}
              </Button>
            </div>
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
        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "سجل تجارب العصر قبل الإنتاج" : "Historique des essais de trituration"}</CardTitle>
            <CardDescription>{lang === "ar" ? "سجل التجارب الفعلية فقط؛ عينات تحليل الشراء الآلية لا تظهر هنا لأنها لا تستهلك زيتونًا ولا تمثل عملية عصر." : "Essais physiques uniquement. Les échantillons automatiques d’analyse d’achat sont exclus car ils ne consomment pas d’olives et ne constituent pas un essai réel."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>{lang === "ar" ? "رقم التجربة" : "N° essai"}</TableHead>
                <TableHead>{lang === "ar" ? "كود الشراء" : "Code achat"}</TableHead>
                <TableHead>{lang === "ar" ? "دفعة الزيتون" : "Lot d’olives"}</TableHead>
                <TableHead>{lang === "ar" ? "تاريخ التجربة" : "Date de l’essai"}</TableHead>
                <TableHead>{lang === "ar" ? "كمية الزيتون المستهلكة (كغ)" : "Olives consommées (kg)"}</TableHead>
                <TableHead>{lang === "ar" ? "كمية عينة الزيت (لتر)" : "Huile échantillon (L)"}</TableHead>
                <TableHead>{lang === "ar" ? "الحالة" : "Statut"}</TableHead>
                <TableHead>{lang === "ar" ? "ملاحظات" : "Notes"}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(preproductionSamples.data ?? []).filter((sample) => !sample.auto_generated_for_purchase_analysis).map((sample) => {
                  const sourceLot = (lots.data ?? []).find((item) => item.id === sample.source_olive_lot_id);
                  return <TableRow key={sample.id}>
                    <TableCell className="font-mono text-xs">{value(sample.document_number)}</TableCell>
                    <TableCell className="font-mono text-xs">{value(sample.batch_code)}</TableCell>
                    <TableCell className="font-mono text-xs">{lotCode(sourceLot, sample.source_olive_lot_id)}</TableCell>
                    <TableCell>{date(sample.trial_date)}</TableCell>
                    <TableCell>{number(sample.input_olive_quantity_kg)}</TableCell>
                    <TableCell>{number(sample.sample_oil_quantity_kg)}</TableCell>
                    <TableCell><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${sample.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-700"}`}>{sample.status === "COMPLETED" ? (lang === "ar" ? "مكتملة" : "Terminée") : sample.status === "CANCELLED" ? (lang === "ar" ? "ملغاة" : "Annulée") : value(sample.status)}</span></TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-xs">{value(sample.notes)}</TableCell>
                  </TableRow>;
                })}
                {(!preproductionSamples.isLoading && !(preproductionSamples.data ?? []).some((sample) => !sample.auto_generated_for_purchase_analysis)) && <EmptyRow colSpan={8} text={l.noRows} />}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>{l.assessmentList}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{l.qualityLot}</TableHead><TableHead>{l.sampleReference}</TableHead><TableHead>{l.laboratory}</TableHead><TableHead>{l.submitter}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.created}</TableHead>{pumpSettings.data?.pump_system_enabled && <TableHead>{lang === "ar" ? "مضخّة التعبئة" : "Pompe de remplissage"}</TableHead>}<TableHead>{l.actions}</TableHead></TableRow></TableHeader>
            <TableBody>{(quality.data ?? []).map((assessment) => <TableRow key={assessment.id}>
              <TableCell className="font-mono text-xs"><button type="button" className={`underline underline-offset-2 ${canOpenQualityAssessment(assessment) ? "cursor-pointer text-emerald-700 font-semibold" : "cursor-default"}`} disabled={!canOpenQualityAssessment(assessment)} title={assessment.status === "REVIEWED" ? (lang === "ar" ? "تمت المصادقة على التحليل؛ لا يمكن تعديله" : "Analyse validée : modification impossible") : (lang === "ar" ? "انقر لتعديل التحليل المعلّق" : "Cliquer pour modifier l’analyse en attente")} onClick={() => { const lot = (lots.data ?? []).find((item) => item.id === assessment.oil_lot_id); if (!lot) { toast.error(l.warning); return; } const correcting = assessment.status === "REVIEWED"; setEditingQualityAssessmentId(correcting ? "" : assessment.id); setCorrectingQualityAssessmentId(correcting ? assessment.id : ""); setQualityLotId(assessment.oil_lot_id); setSampleReference(value(assessment.sample_reference, "")); setSampleDate(String(assessment.sample_date ?? "").slice(0,10)); setTestedDate(String(assessment.tested_date ?? "").slice(0,10)); setLaboratoryName(value(assessment.laboratory_name, "")); setSpecificationReference(value(assessment.specification_reference, "")); setOilAcidity(assessment.acidity == null ? "" : String(assessment.acidity)); setQualityClassification(["extra_vierge","vierge","lampante"].includes(assessment.classification) ? assessment.classification : ""); setOilPeroxide(assessment.peroxide == null ? "" : String(assessment.peroxide)); setOilK232(assessment.k232 == null ? "" : String(assessment.k232)); setOilK270(assessment.k270 == null ? "" : String(assessment.k270)); setOilContent(assessment.oil_content_pct == null ? "" : String(assessment.oil_content_pct)); setOilType(value(assessment.oil_type, "")); setAnalysisNotes(value(assessment.notes, "")); window.scrollTo({top:0,behavior:"smooth"}); }}>{lotCode((lots.data ?? []).find((lot) => lot.id === assessment.oil_lot_id), assessment.oil_lot_id)}</button></TableCell>
              <TableCell>{value(assessment.sample_reference)}</TableCell>
              <TableCell>{value(assessment.laboratory_name)}</TableCell>
              <TableCell className="font-mono text-xs">{value(assessment.created_by)}</TableCell>
              <TableCell>{assessment.status === "AWAITING_INDEPENDENT_REVIEW" ? l.awaitingReview : l.reviewed + " · " + value(assessment.decision)}</TableCell>
              <TableCell>{date(assessment.created_at)}</TableCell><TableCell><div className="flex flex-wrap items-center gap-2"><a href={`/commercial/certificate/${encodeURIComponent(assessment.id)}?from=quality`} className="text-sm font-medium text-emerald-700 underline">{l.viewCertificate}</a>{assessment.status === "AWAITING_INDEPENDENT_REVIEW" && canRecordLab && (assessment.created_by === me.data?.id || isAdmin) && !assessment.supersedes_assessment_id && <Button type="button" size="sm" variant="destructive" disabled={deleteQualityAssessment.isPending} onClick={() => { if (window.confirm(lang === "ar" ? "هل تؤكد حذف هذا التحليل؟ لا يمكن حذف تحليل تمت مراجعته." : "Confirmer la suppression de cette analyse ? Une analyse déjà revue ne peut pas être supprimée.")) deleteQualityAssessment.mutate(assessment); }}><Trash2 className="mr-1 size-4" />{lang === "ar" ? "حذف" : "Supprimer"}</Button>}</div></TableCell>
            </TableRow>)}{(!quality.isLoading && !(quality.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody>
          </Table>
        </CardContent></Card>
      </div>}

      {tab === "suppliers" && <div className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
            {isAdmin && <Button type="button" className="mb-3 w-full rounded-xl bg-teal-600 hover:bg-teal-700" onClick={() => { cancelSupplierEdit(); setShowSupplierForm((v) => !v); }}>
              <Plus className="mr-2 size-4"/>{lang === "ar" ? "إضافة مزوّد جديد" : "Nouveau fournisseur"}
            </Button>}
            {showSupplierForm && <form className="mb-4 space-y-3 rounded-xl border border-teal-200 bg-teal-50/60 p-3" onSubmit={(event) => { event.preventDefault(); if (supplierName.trim().length >= 2) editingSupplier ? updateSupplier.mutate() : addSupplier.mutate(); }}>
              <div className="font-semibold text-teal-900">{editingSupplier ? l.editSupplier : l.addSupplier}</div>
              <label className="grid gap-1 text-sm font-medium">{l.supplierName}<input required minLength={2} maxLength={160} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="h-10 rounded-xl border bg-white px-3 font-normal"/></label>
              <label className="grid gap-1 text-sm font-medium">{l.supplierPhone}<input maxLength={40} value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} className="h-10 rounded-xl border bg-white px-3 font-normal"/></label>
              <label className="grid gap-1 text-sm font-medium">{l.taxId}<input maxLength={80} value={supplierTaxId} onChange={(e) => setSupplierTaxId(e.target.value)} className="h-10 rounded-xl border bg-white px-3 font-normal"/></label>
              <label className="grid gap-1 text-sm font-medium">{l.notes}<input maxLength={1000} value={supplierNotes} onChange={(e) => setSupplierNotes(e.target.value)} className="h-10 rounded-xl border bg-white px-3 font-normal"/></label>
              <div className="flex gap-2"><Button type="submit" disabled={addSupplier.isPending || updateSupplier.isPending || supplierName.trim().length < 2} className="rounded-xl bg-teal-600 hover:bg-teal-700">{editingSupplier ? l.saveSupplierChanges : l.addSupplier}</Button><Button type="button" variant="outline" className="rounded-xl" onClick={() => { cancelSupplierEdit(); setShowSupplierForm(false); }}>{l.cancelSupplierEdit}</Button></div>
            </form>}
            <div className="relative mb-3"><Search className="absolute left-3 top-3 size-4 text-stone-400"/><input value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder={lang === "ar" ? "البحث عن مزوّد..." : "Rechercher un fournisseur..."} className="h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm"/></div>
            {supplierRows.filter((supplier) => String(supplier.name ?? "").toLowerCase().includes(supplierSearch.toLowerCase()) || String(supplier.phone ?? "").includes(supplierSearch)).length === 0 && <p className="py-10 text-center text-sm text-stone-500">{l.noRows}</p>}
            <ul className="max-h-[65vh] space-y-1 overflow-y-auto">
              {supplierRows.filter((supplier) => String(supplier.name ?? "").toLowerCase().includes(supplierSearch.toLowerCase()) || String(supplier.phone ?? "").includes(supplierSearch)).map((supplier) => {
                const count = purchaseRows.filter((purchase) => purchase.supplier_id === supplier.id).length;
                const kg = purchaseRows.filter((purchase) => purchase.supplier_id === supplier.id).reduce((sum, purchase) => sum + Number(purchase.total_quantity_kg ?? 0), 0);
                return <li key={supplier.id}><button type="button" onClick={() => { setSelectedSupplierId(supplier.id); setShowSupplierForm(false); cancelSupplierEdit(); }} className={`w-full rounded-xl px-3 py-2.5 text-start transition-colors duration-200 ${supplier.id === selectedSupplierId ? "bg-teal-50 ring-1 ring-teal-300" : "hover:bg-stone-50"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-medium text-stone-900">{value(supplier.name)}</span><span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">{count}×</span></div>
                  <div className="mt-0.5 flex justify-between gap-2 text-xs text-stone-500"><span dir="ltr">{value(supplier.phone)}</span><span>{number(kg)} kg</span></div>
                </button></li>;
              })}
            </ul>
          </div>
          <div>
            {!selectedSupplier && <div className="grid min-h-72 place-items-center rounded-2xl border-2 border-dashed border-stone-200 bg-white/60 p-8 text-center text-stone-500"><div><BookUser className="mx-auto mb-3 size-10 text-teal-400"/>{lang === "ar" ? "اختر مزوّداً لعرض ملفه وسجل معاملاته" : "Sélectionnez un fournisseur pour consulter son dossier"}</div></div>}
            {selectedSupplier && <div className="code-reveal space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div><div className="text-xs font-semibold uppercase tracking-wider text-stone-500">{lang === "ar" ? "المزوّد" : "Fournisseur"}</div><div className="font-heading text-3xl font-bold text-stone-900">{value(selectedSupplier.name)}</div><div className="mt-1 flex items-center gap-2 text-sm text-stone-600"><Phone className="size-4"/><span dir="ltr">{value(selectedSupplier.phone)}</span></div><div className="mt-1 text-xs text-stone-500">{l.taxId}: {value(selectedSupplier.tax_identifier)}</div></div>
                <div className="flex gap-2">{canEditRecords && <Button variant="outline" onClick={() => { beginSupplierEdit(selectedSupplier); setShowSupplierForm(true); }} className="rounded-xl border-teal-300 text-teal-800 hover:bg-teal-50"><Pencil className="size-4"/>{l.editSupplier}</Button>}{canDeleteRecords && <Button variant="outline" onClick={() => window.confirm(l.confirmDeleteSupplier) && deleteSupplier.mutate(selectedSupplier)} disabled={deleteSupplier.isPending} className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="size-4"/>{l.deleteSupplier}</Button>}</div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard tone="rose" label={lang === "ar" ? "عدد المشتريات" : "Achats"} value={supplierPurchaseCount} icon={<ShoppingCart />} />
                <StatCard tone="olive" label={lang === "ar" ? "الزيتون المشترى" : "Olives achetées"} value={number(supplierTotalKg)} unit="kg" icon={<Sprout />} />
                <StatCard tone="gold" label={lang === "ar" ? "المشتريات المعتمدة" : "Achats approuvés"} value={supplierApprovedPurchases.length} icon={<ShieldCheck />} />
                <StatCard tone="sky" label={lang === "ar" ? "مسودات" : "Brouillons"} value={supplierDraftPurchases.length} icon={<ClipboardList />} />
                <StatCard tone="violet" label={lang === "ar" ? "قيمة المشتريات" : "Montant des achats"} value={money(supplierTotalAmount)} icon={<Wallet />} />
              </div>
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                <div className="border-b border-stone-100 px-5 py-4 font-heading text-lg font-bold">{lang === "ar" ? "سجل عمليات المزوّد" : "Historique des opérations"}</div>
                <div className="overflow-x-auto"><Table><TableHeader className="bg-stone-50"><TableRow>
                  <TableHead className="text-start">{l.purchaseCode}</TableHead><TableHead className="text-start">{l.purchaseReference}</TableHead><TableHead className="text-start">{l.purchaseDate}</TableHead><TableHead className="text-end">{l.variety}</TableHead><TableHead className="text-end">{l.totalQuantity}</TableHead><TableHead className="text-end">{l.totalAmount}</TableHead><TableHead className="text-start">{l.status}</TableHead>
                </TableRow></TableHeader><TableBody>
                  {selectedSupplierPurchases.map((purchase) => <TableRow key={purchase.id}>
                    <TableCell className="font-mono text-xs font-semibold">{value(purchase.batch_codes?.join(", ") || purchase.batch_code || purchase.lines?.map((line: AnyRecord) => line.batch_code).filter(Boolean).join(", "), "—")}</TableCell>
                    <TableCell className="font-mono text-xs">{value(purchase.document_number)}</TableCell><TableCell className="text-xs text-stone-500" dir="ltr">{date(purchase.purchase_date)}</TableCell>
                    <TableCell className="text-end">{value(purchase.lines?.map((line: AnyRecord) => line.variety_name ?? line.variety_fr ?? line.variety_ar ?? (varieties.data ?? []).find((variety) => variety.id === line.variety_id)?.[lang === "ar" ? "name_ar" : "name_fr"] ?? (varieties.data ?? []).find((variety) => variety.id === line.variety_id)?.name_fr).filter(Boolean).join(", "), "—")}</TableCell>
                    <TableCell className="text-end font-semibold text-lime-800">{number(purchase.total_quantity_kg)}</TableCell><TableCell className="text-end font-semibold text-violet-700">{money(purchase.total_amount_dt)}</TableCell>
                    <TableCell>{purchase.status === "APPROVED" ? l.approved : purchase.status === "CANCELLED" ? (lang === "ar" ? "ملغى" : "Annulé") : l.draft}</TableCell>
                  </TableRow>)}
                  {!selectedSupplierPurchases.length && <EmptyRow colSpan={7} text={l.noRows}/>}
                </TableBody></Table></div>
              </div>
            </div>}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard tone="sky" label={lang === "ar" ? "عدد المزوّدين" : "Fournisseurs"} value={supplierRows.length} icon={<UserRound />} />
          <StatCard tone="violet" label={lang === "ar" ? "عدد عمليات الشراء" : "Opérations d’achat"} value={allSupplierPurchaseCount} icon={<ShoppingCart />} />
          <StatCard tone="emerald" label={lang === "ar" ? "إجمالي الزيتون (kg)" : "Olives achetées (kg)"} value={number(allSupplierPurchaseKg)} unit="kg" icon={<Sprout />} />
          <StatCard tone="gold" label={lang === "ar" ? "القيمة الإجمالية" : "Valeur totale"} value={money(allSupplierPurchaseAmount)} icon={<Wallet />} />
        </div>
      </div>}

      {tab === "purchases" && <div className="space-y-4">
        {(isAdmin || (editingPurchase && canEditRecords)) && <Card><CardHeader><CardTitle>{editingPurchase ? `${l.editPurchase} · ${value(editingPurchase.batch_codes?.join(", ") || editingPurchase.batch_code, editingPurchase.document_number)}` : l.newPurchase}</CardTitle><CardDescription>{l.bootstrapHint}</CardDescription></CardHeader><CardContent>
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
                <label className="grid gap-1 text-sm font-medium">{l.unitPrice}<input required type="number" min="0" step="1" value={line.unit_price_dt} onChange={(e) => setPurchaseLines((rows) => rows.map((row, i) => i === index ? { ...row, unit_price_dt: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <Button type="button" variant="outline" disabled={purchaseLines.length === 1} onClick={() => setPurchaseLines((rows) => rows.filter((_, i) => i !== index))}>{l.removeLine}</Button>
              </div>)}
              <Button type="button" variant="outline" onClick={() => setPurchaseLines((rows) => [...rows, { variety_id: "", quantity_kg: "", unit_price_dt: "" }])}>{l.addLine}</Button>
            </div>
            <label className="grid gap-1 text-sm font-medium">{l.notes}<input maxLength={1000} value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={createPurchase.isPending || updatePurchase.isPending || !purchaseSupplierId || !(varieties.data?.length) || purchaseLines.some((line) => !line.variety_id || !(Number(line.quantity_kg) > 0) || !(Number(line.unit_price_dt) >= 0))}>{editingPurchase ? l.updateDraft : l.createDraft}</Button>{editingPurchase && <Button type="button" variant="outline" onClick={cancelPurchaseEdit}>{l.cancelEdit}</Button>}</div>
          </form>
        </CardContent></Card>}
        {isAdmin && <Card><CardHeader><CardTitle>{l.receivingLocation}</CardTitle></CardHeader><CardContent><select value={receivingLocationId} onChange={(e) => setReceivingLocationId(e.target.value)} className="h-10 w-full max-w-xl rounded-lg border bg-background px-3"><option value="">—</option>{(locations.data ?? []).map((loc) => <option key={loc.id} value={loc.id}>{loc.code} · {loc.name}</option>)}</select></CardContent></Card>}
        {selectedPurchaseReceipt && <Card className="print-area code-reveal rounded-2xl border-2 border-dashed border-amber-300 bg-white p-8 text-stone-900 shadow-sm">
          <CardHeader className="no-print flex-row items-center justify-between p-0 pb-4">
            <CardTitle>{lang === "ar" ? "وصل استلام المزوّد" : "Bon de réception fournisseur"}</CardTitle>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedPurchaseReceipt(null)}>{lang === "ar" ? "إغلاق" : "Fermer"}</Button>
              <Button type="button" onClick={() => window.print()}><Printer className="mr-2 size-4" />{lang === "ar" ? "طباعة الوصل" : "Imprimer le reçu"}</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
              <div>
                <div className="font-heading text-lg font-bold text-stone-900">{purchaseMill.data?.mill_name || "Oro Verde"}</div>
                {purchaseMill.data?.mill_address && <div className="text-xs text-stone-500">{purchaseMill.data.mill_address}</div>}
                {purchaseMill.data?.mill_phone && <div className="text-xs text-stone-500" dir="ltr">{purchaseMill.data.mill_phone}</div>}
              </div>
              <div className="text-end">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">{lang === "ar" ? "وصل استلام المزوّد" : "Bon de réception fournisseur"}</div>
                <div className="mt-1 text-xs text-stone-500" dir="ltr">{date(selectedPurchaseReceipt.purchase_date)}</div>
                <div className="mt-1 text-xs text-stone-500" dir="ltr">{value(selectedPurchaseReceipt.document_number)}</div>
              </div>
            </div>
            <div className="my-6 flex flex-wrap items-center justify-center gap-8 text-center">
              <div>
                <div className="mb-2 text-xs text-stone-500">{lang === "ar" ? "كود التتبع الفريد" : "Code unique de traçabilité"}</div>
                <div className="inline-flex rounded-lg bg-amber-50 px-4 py-2 font-mono text-2xl font-bold text-amber-900" dir="ltr">{value(selectedPurchaseReceipt.batch_code || selectedPurchaseReceipt.batch_codes?.[0] || selectedPurchaseReceipt.lines?.[0]?.batch_code)}</div>
                <div className="mt-3 text-sm text-stone-500">{lang === "ar" ? "كود GS الواجب الاحتفاظ به لتتبع الدفعة" : "Code GS à conserver pour le suivi du lot"}</div>
              </div>
              <div data-testid="approved-purchase-ticket-qr" className="flex flex-col items-center gap-1">
                <QRCodeSVG value={window.location.origin + "/commercial?purchase=" + encodeURIComponent(selectedPurchaseReceipt.id ?? "") + "&batch=" + encodeURIComponent(selectedPurchaseReceipt.batch_code || selectedPurchaseReceipt.batch_codes?.[0] || selectedPurchaseReceipt.lines?.[0]?.batch_code || "")} size={112} level="M" marginSize={1} />
                <span className="text-[10px] text-stone-500">{lang === "ar" ? "امسح الرمز لفتح الدفعة في GS" : "Scanner pour ouvrir le lot dans GS"}</span>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t border-stone-200 pt-6 text-sm">
              <div><dt className="text-stone-500">{l.supplier}</dt><dd className="font-semibold text-stone-900">{value(supplierRows.find((s) => s.id === selectedPurchaseReceipt.supplier_id)?.name, selectedPurchaseReceipt.supplier_id)}</dd></div>
              <div><dt className="text-stone-500">{lang === "ar" ? "الهاتف" : "Téléphone"}</dt><dd className="font-semibold text-stone-900" dir="ltr">{value(supplierRows.find((s) => s.id === selectedPurchaseReceipt.supplier_id)?.phone)}</dd></div>
              {supplierRows.find((s) => s.id === selectedPurchaseReceipt.supplier_id)?.tax_id && <div><dt className="text-stone-500">{lang === "ar" ? "المعرّف الجبائي" : "Identifiant fiscal"}</dt><dd className="font-semibold text-stone-900" dir="ltr">{supplierRows.find((s) => s.id === selectedPurchaseReceipt.supplier_id)?.tax_id}</dd></div>}
              <div><dt className="text-stone-500">{lang === "ar" ? "كود الشراء" : "Code d’achat"}</dt><dd className="font-mono font-semibold text-stone-900" dir="ltr">{value(selectedPurchaseReceipt.batch_code || selectedPurchaseReceipt.batch_codes?.join(", ") || selectedPurchaseReceipt.lines?.map((line: AnyRecord) => line.batch_code).filter(Boolean).join(", "))}</dd></div>
              <div><dt className="text-stone-500">{lang === "ar" ? "تاريخ الشراء" : "Date d’achat"}</dt><dd className="font-semibold text-stone-900">{date(selectedPurchaseReceipt.purchase_date)}</dd></div>
              <div><dt className="text-stone-500">{lang === "ar" ? "مكان الاستلام" : "Lieu de réception"}</dt><dd className="font-semibold text-stone-900">{value(locations.data?.find((loc) => loc.id === selectedPurchaseReceipt.receiving_location_id)?.name || locations.data?.find((loc) => loc.id === selectedPurchaseReceipt.receiving_location_id)?.code, selectedPurchaseReceipt.receiving_location_id)}</dd></div>
            </dl>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead><tr className="border-y border-stone-200 bg-stone-50"><th className="p-2 text-left">{l.variety}</th><th className="p-2 text-right">{l.quantity} (kg)</th><th className="p-2 text-right">{l.unitPrice}</th><th className="p-2 text-right">{l.totalAmount}</th></tr></thead>
                <tbody>{(selectedPurchaseReceipt.lines ?? []).map((line: AnyRecord, index: number) => {
                  const variety = varieties.data?.find((v) => v.id === line.variety_id);
                  const quantity = Number(line.quantity_kg?.$numberDecimal ?? line.quantity_kg ?? 0);
                  const unitPrice = Number(line.unit_price_dt?.$numberDecimal ?? line.unit_price_dt ?? 0);
                  const lineTotal = Number(line.line_total_dt?.$numberDecimal ?? line.line_total_dt ?? quantity * unitPrice);
                  return <tr key={index} className="border-b border-stone-200"><td className="p-2 text-stone-900">{lang === "ar" ? (variety?.name_ar || variety?.name_fr || line.variety_id) : (variety?.name_fr || line.variety_id)}</td><td className="p-2 text-right text-stone-900">{number(quantity)}</td><td className="p-2 text-right text-stone-900">{money(unitPrice)}</td><td className="p-2 text-right font-semibold text-stone-900">{money(lineTotal)}</td></tr>;
                })}</tbody>
              </table>
            </div>
            <dl className="ml-auto mt-4 grid max-w-sm grid-cols-1 gap-2 border-t border-stone-200 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-stone-500">{l.totalQuantity}</dt><dd className="font-semibold text-stone-900">{number(Number(selectedPurchaseReceipt.total_quantity_kg?.$numberDecimal ?? selectedPurchaseReceipt.total_quantity_kg ?? 0))} kg</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">{l.totalAmount}</dt><dd className="font-heading text-xl font-bold text-stone-900">{money(Number(selectedPurchaseReceipt.total_amount_dt?.$numberDecimal ?? selectedPurchaseReceipt.total_amount_dt ?? 0))} TND</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">{lang === "ar" ? "الحالة" : "Statut"}</dt><dd className="font-semibold text-stone-900">{lang === "ar" ? "تم تسجيل الاستلام" : "Réception enregistrée"}</dd></div>
            </dl>
            {selectedPurchaseReceipt.notes && <div className="mt-4 border-t border-stone-200 pt-3 text-sm"><span className="text-stone-500">{l.notes}: </span><span className="text-stone-900">{selectedPurchaseReceipt.notes}</span></div>}
            <div className="no-print mt-8 flex flex-wrap gap-3 border-t border-stone-200 pt-4">
              <Button onClick={() => window.print()} variant="outline" className="rounded-xl"><Printer className="size-4" />{lang === "ar" ? "طباعة الوصل" : "Imprimer le reçu"}</Button>
            </div>
          </CardContent>
        </Card>}
        <Card><CardHeader><CardTitle>{l.purchasesTab}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>{l.purchaseCode}</TableHead><TableHead>{l.purchaseReference}</TableHead><TableHead>{l.supplier}</TableHead><TableHead>{l.purchaseDate}</TableHead><TableHead>{l.totalQuantity}</TableHead><TableHead>{l.totalAmount}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader><TableBody>
          {(purchases.data ?? []).map((purchase) => <TableRow key={purchase.id}>
            <TableCell className="font-mono text-xs font-semibold">{purchase.status === "DRAFT" && canEditRecords ? <button type="button" className="text-primary underline underline-offset-4 hover:opacity-80" onClick={() => startPurchaseEdit(purchase)} title={l.editPurchase}>{value(purchase.batch_codes?.join(", ") || purchase.batch_code || purchase.lines?.map((line: AnyRecord) => line.batch_code).filter(Boolean).join(", "), purchase.document_number)}</button> : value(purchase.batch_codes?.join(", ") || purchase.batch_code || purchase.lines?.map((line: AnyRecord) => line.batch_code).filter(Boolean).join(", "), purchase.document_number)}</TableCell>
            <TableCell className="font-mono text-xs">{purchase.status === "DRAFT" && canEditRecords ? <button type="button" className="text-primary underline underline-offset-4 hover:opacity-80" onClick={() => startPurchaseEdit(purchase)} title={l.editPurchase}>{value(purchase.document_number)}</button> : value(purchase.document_number)}</TableCell>
            <TableCell>{value((suppliers.data ?? []).find((s) => s.id === purchase.supplier_id)?.name, purchase.supplier_id)}</TableCell>
            <TableCell>{date(purchase.purchase_date)}</TableCell>
            <TableCell>{number(purchase.total_quantity_kg)}</TableCell>
            <TableCell>{money(purchase.total_amount_dt)}</TableCell>
            <TableCell>{purchase.status === "APPROVED" ? l.approved : purchase.status === "CANCELLED" ? (lang === "ar" ? "ملغى" : "Annulé") : l.draft}</TableCell>
            <TableCell>{purchase.status === "DRAFT" ? <div className="flex flex-wrap gap-2">{isAdmin && <Button size="sm" disabled={approvePurchase.isPending || !receivingLocationId} onClick={() => approvePurchase.mutate(purchase)}>{l.approve}</Button>}{canDeleteRecords && <Button size="sm" variant="destructive" disabled={cancelPurchase.isPending} onClick={() => { if (!window.confirm(lang === "ar" ? "سيتم إلغاء مسودة الشراء مع الاحتفاظ بها في سجل التدقيق. هل تؤكد؟" : "Annuler ce brouillon en conservant sa trace d’audit ?")) return; const reason = window.prompt(lang === "ar" ? "سبب الإلغاء (5 أحرف على الأقل):" : "Motif de l’annulation (5 caractères minimum) :"); if (reason && reason.trim().length >= 5) cancelPurchase.mutate({ purchase, reason: reason.trim() }); }}>{lang === "ar" ? "إلغاء" : "Annuler"}</Button>}</div> : purchase.status === "APPROVED" ? <Button size="sm" variant="outline" onClick={() => setSelectedPurchaseReceipt(purchase)}><Printer className="mr-1 size-4" />{lang === "ar" ? "طباعة / إعادة الطباعة" : "Imprimer / Réimprimer"}</Button> : "—"}</TableCell>
          </TableRow>)}
          {(!purchases.isLoading && !(purchases.data?.length)) && <EmptyRow colSpan={8} text={l.noRows} />}
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
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{l.inputLots}</h3><p className="text-xs text-muted-foreground">{lang === "ar" ? "عملية الإنتاج مرتبطة بدفعة واحدة فقط." : "Une production est liée à un seul lot."}</p></div>
                {productionInputs.map((line, index) => {
                  const key = (lotId: string, locationId: string, owner: AnyRecord | undefined) => [lotId, locationId, ownerIdentity(owner)].join("::");
                  const selectedBalance = eligibleProductionBalances.find((b) => key(b.lot_id, b.location_id, b.owner) === line.balance_key);
                  const selectedLot = (lots.data ?? []).find((lot) => lot.id === selectedBalance?.lot_id);
                  return <div key={index} className="grid items-end gap-3 rounded-xl border p-3 md:grid-cols-[2fr_1fr_auto]">
                    <label className="grid gap-1 text-sm font-medium">{l.chooseOliveBalance}
                      <select required value={line.balance_key} onChange={(e) => setProductionInputs((rows) => rows.map((row, i) => i === index ? { ...row, balance_key: e.target.value, quantity_kg: "" } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal">
                        <option value="">—</option>
                        {eligibleProductionBalances.map((balance) => {
                          const lot = (lots.data ?? []).find((item) => item.id === balance.lot_id);
                          const loc = (locations.data ?? []).find((item) => item.id === balance.location_id);
                          return <option key={key(balance.lot_id, balance.location_id, balance.owner)} value={key(balance.lot_id, balance.location_id, balance.owner)}>{lot?.batch_code ?? "—"} · {loc?.code ?? balance.location_id} · {displayOwnerLabel(balance.owner)} · {number(balance.quantity_kg)} kg</option>;
                        })}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium">{l.inputQuantity}
                      <input required type="number" min="0.001" step="0.001" max={selectedBalance?.quantity_kg ?? undefined} value={line.quantity_kg} disabled={!selectedBalance} onChange={(e) => setProductionInputs((rows) => rows.map((row, i) => i === index ? { ...row, quantity_kg: e.target.value } : row))} className="h-10 rounded-lg border bg-background px-3 font-normal" />
                      {selectedBalance && <span className="text-xs text-muted-foreground">{l.quantity}: {number(selectedBalance.quantity_kg)} kg</span>}
                    </label>
                    
                    {selectedBalance && <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm md:col-span-3 md:grid-cols-2 lg:grid-cols-4">
                      <div><span className="text-muted-foreground">{lang === "ar" ? "الدفعة" : "Lot"} : </span><strong>{lotCode(selectedLot, selectedBalance.lot_id)}</strong></div>
                      <div><span className="text-muted-foreground">{l.location} : </span><strong>{value((locations.data ?? []).find((item) => item.id === selectedBalance.location_id)?.name ?? (locations.data ?? []).find((item) => item.id === selectedBalance.location_id)?.code, selectedBalance.location_id)}</strong></div>
                      <div><span className="text-muted-foreground">{l.owner} : </span><strong>{displayOwnerLabel(selectedBalance.owner ?? selectedLot?.owner)}</strong></div>
                      <div><span className="text-muted-foreground">{l.oliveType} : </span><strong>{(() => { const variety = (varieties.data ?? []).find((item) => item.id === selectedLot?.variety_id); return value(lang === "ar" ? (variety?.name_ar || variety?.name_fr || selectedLot?.variety_name_ar || selectedLot?.variety_name || selectedLot?.variety_name_fr) : (variety?.name_fr || variety?.name_ar || selectedLot?.variety_name_fr || selectedLot?.variety_name || selectedLot?.variety_name_ar)); })()}</strong></div>
                    </div>}
                  </div>;
                })}
                {eligibleProductionBalances.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{lang === "ar" ? "لا توجد دفعات زيتون معتمدة مخبريًا للإنتاج الكامل." : "Aucun lot d’olives n’a encore reçu l’approbation qualité préalable."}</p>}
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
                <select required value={productionTankId} onChange={(e) => setProductionTankId(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(tanks.data ?? []).filter((tank) => tank.active && (tank.role ?? "NORMAL") === "NORMAL").map((tank) => {
                  const currentOil = (balances.data ?? [])
                    .filter((balance) => balance.product_kind === "OIL" && balance.location_id === tank.id)
                    .reduce((sum, balance) => sum + Number(balance.quantity_kg ?? 0), 0);
                  const maxCapacity = Number(tank.capacity_kg ?? 0);
                  return <option key={tank.id} value={tank.id}>
                    {tank.code} · {tank.name} — {lang === "ar" ? "الموجود" : "Stock"}: {number(currentOil)} L / {lang === "ar" ? "السعة القصوى" : "Capacité max."}: {maxCapacity > 0 ? `${number(maxCapacity)} L` : l.flexible}
                  </option>;
                })}</select>
              </label>
              <label className="grid gap-1 text-sm font-medium">{l.notes}
                <input maxLength={1000} value={productionNotes} onChange={(e) => setProductionNotes(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" />
              </label>
              <Button type="submit" disabled={completeProduction.isPending || !productionTankId || !productionInputs.every((line) => line.balance_key && Number(line.quantity_kg) > 0) || !(Number(productionOutputKg) > 0) || Number(productionOutputKg) > productionInputTotal || productionInputs.some((line) => { const b = availableOliveBalances.find((x) => [x.lot_id, x.location_id, ownerIdentity(x.owner)].join("::") === line.balance_key); return !b || Number(line.quantity_kg) > Number(b.quantity_kg); })}>
                <Factory className="size-4" /> {l.completeProduction}
              </Button>
            </form>
          </CardContent>
        </Card>}
        <Card id="ready-lots-adjustment">
          <CardHeader>
            <CardTitle>{lang === "ar" ? "دفعات جاهزة للإنتاج" : "Lots prêts pour production"}</CardTitle>
            <CardDescription>{lang === "ar" ? "تظهر هنا دفعات الزيتون التي اجتازت التحليل المسبق وما زالت لها كمية متاحة." : "Seuls les lots d’olives approuvés par le contrôle préalable et disposant d’un stock sont affichés."}</CardDescription>
          </CardHeader>
          <CardContent>
            {adjustingReadyBalance && <form className="mb-4 grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); if (readyBalanceReason.trim().length >= 5 && Number(readyBalanceTarget) >= 0) adjustReadyLotBalance.mutate({ balance: adjustingReadyBalance.balance, lot: adjustingReadyBalance.lot, target: readyBalanceTarget, reason: readyBalanceReason.trim() }); }}>
              <div className="md:col-span-3"><p className="font-semibold">{lang === "ar" ? "تعديل رصيد الدفعة" : "Modifier le stock du lot"} · <span className="font-mono">{lotCode(adjustingReadyBalance.lot, adjustingReadyBalance.balance.lot_id)}</span></p><p className="text-xs text-muted-foreground">{lang === "ar" ? "يُسجَّل الفرق كحركة مخزون مدققة. الكمية صفر تزيل الرصيد من قائمة الجاهز." : "L’écart est enregistré comme mouvement audité. Une quantité nulle retire le solde de la liste des lots prêts."}</p></div>
              <label className="grid gap-1 text-sm font-medium">{lang === "ar" ? "الكمية الجديدة (kg)" : "Nouvelle quantité (kg)"}<input required type="number" min="0" step="0.001" value={readyBalanceTarget} onChange={(e) => setReadyBalanceTarget(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium md:col-span-2">{l.notes}<input required minLength={5} maxLength={500} value={readyBalanceReason} onChange={(e) => setReadyBalanceReason(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <div className="md:col-span-3 flex gap-2"><Button type="submit" disabled={adjustReadyLotBalance.isPending || !(Number(readyBalanceTarget) >= 0) || readyBalanceReason.trim().length < 5}>{lang === "ar" ? "حفظ التعديل" : "Enregistrer"}</Button><Button type="button" variant="outline" onClick={() => { setAdjustingReadyBalance(null); setReadyBalanceTarget(""); setReadyBalanceReason(""); }}>{l.cancelEdit}</Button></div>
            </form>}
            <Table>
              <TableHeader><TableRow>
                <TableHead>{lang === "ar" ? "كود الدفعة" : "Code du lot"}</TableHead>
                <TableHead>{l.currentStock}</TableHead>
                <TableHead>{l.location}</TableHead>
                <TableHead>{l.owner}</TableHead>
                <TableHead>{l.qualityStatus}</TableHead>
                {canEditRecords && <TableHead>{lang === "ar" ? "إجراء" : "Action"}</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {eligibleProductionBalances.map((balance) => {
                  const lot = (lots.data ?? []).find((item) => item.id === balance.lot_id);
                  if (!lot) return null;
                  const location = (locations.data ?? []).find((item) => item.id === balance.location_id);
                  const balanceKey = [balance.lot_id, balance.location_id, ownerIdentity(balance.owner)].join("::");
                  return <TableRow key={balanceKey}>
                    <TableCell className="font-mono text-xs font-semibold">{canEditRecords ? <button type="button" className="text-primary underline underline-offset-2" title={lang === "ar" ? "انقر لتعديل رصيد الدفعة" : "Cliquer pour corriger le solde du lot"} onClick={() => { setAdjustingReadyBalance({ balance, lot }); setReadyBalanceTarget(String(balance.quantity_kg)); setReadyBalanceReason(""); document.getElementById("ready-lots-adjustment")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{lotCode(lot, balance.lot_id)}</button> : lotCode(lot, balance.lot_id)}</TableCell>
                    <TableCell>{number(balance.quantity_kg)} kg</TableCell>
                    <TableCell>{value(location?.name ?? location?.code, balance.location_id)}</TableCell>
                    <TableCell>{displayOwnerLabel(balance.owner ?? lot?.owner)}</TableCell>
                    <TableCell>{lang === "ar" ? "مقبولة" : "Approuvée"}</TableCell>
                    {canEditRecords && <TableCell><div className="flex flex-wrap gap-2">{isAdmin && <Button size="sm" variant="outline" onClick={() => setProductionInputs([{ balance_key: balanceKey, quantity_kg: "" }])}>{lang === "ar" ? "اختيار للإنتاج" : "Sélectionner"}</Button>}{canEditRecords && <Button size="sm" variant="outline" onClick={() => { setAdjustingReadyBalance({ balance, lot }); setReadyBalanceTarget(String(balance.quantity_kg)); setReadyBalanceReason(""); document.getElementById("ready-lots-adjustment")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{lang === "ar" ? "تعديل" : "Modifier"}</Button>}{canEditRecords && canDeleteRecords && <Button size="sm" variant="destructive" disabled={adjustReadyLotBalance.isPending} onClick={() => { if (!window.confirm(lang === "ar" ? "سيُصفّر هذا الإجراء رصيد الدفعة المتاح في هذا الموقع ويسجّل حركة مخزون عكسية. هل تؤكد؟" : "Cette action mettra à zéro le solde disponible à cet emplacement et enregistrera un mouvement compensatoire. Confirmer ?")) return; const reason = window.prompt(lang === "ar" ? "سبب إزالة الرصيد (5 أحرف على الأقل):" : "Motif de retrait (5 caractères minimum) :"); if (reason && reason.trim().length >= 5) adjustReadyLotBalance.mutate({ balance, lot, target: "0", reason: reason.trim() }); }}>{lang === "ar" ? "إزالة" : "Retirer"}</Button>}</div></TableCell>}
                  </TableRow>;
                })}
                {eligibleProductionBalances.length === 0 && <EmptyRow colSpan={canEditRecords ? 6 : 5} text={lang === "ar" ? "لا توجد دفعات جاهزة للإنتاج حاليًا." : "Aucun lot prêt pour la production pour le moment."} />}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>{l.productionHistory}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.productionDate}</TableHead><TableHead>{l.owner}</TableHead><TableHead>{l.totalInput}</TableHead><TableHead>{l.outputQuantity}</TableHead><TableHead>{l.extractionRate} (%)</TableHead><TableHead>{l.outputTank}</TableHead></TableRow></TableHeader>
            <TableBody>{(productionRuns.data ?? []).map((run) => <TableRow key={run.id}>
              <TableCell className="font-mono text-xs">{value(run.batch_code)}</TableCell>
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
        {(isAdmin || (editingCustodyReceipt && canEditRecords)) && <Card><CardHeader><CardTitle>{editingCustodyReceipt ? (lang === "ar" ? "تصحيح استلام الأمانة" : "Corriger la réception en garde") : l.custodyReceiptTitle}</CardTitle><CardDescription>{editingCustodyReceipt ? (lang === "ar" ? "سيُسجّل التصحيح بقيد عكسي مع الاحتفاظ بالمستند السابق." : "La correction crée une écriture inverse et conserve le document précédent.") : l.custodyReceiptNote}</CardDescription></CardHeader><CardContent>
          {(custodyClients.data?.length ?? 0) === 0 && <p className="mb-3 text-sm text-amber-700">{l.noCustodyClients}</p>}
          <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); if (editingCustodyReceipt) { const reason = window.prompt(lang === "ar" ? "سبب تصحيح المستند (5 أحرف على الأقل):" : "Motif de correction (5 caractères minimum) :"); if (reason && reason.trim().length >= 5) receiveCustomerCustody.mutate(reason.trim()); } else receiveCustomerCustody.mutate(undefined); }}>
            <label className="grid gap-1 text-sm font-medium">{l.custodyCustomer}<select required value={custodyCustomerPhone} onChange={(e) => { setCustodyCustomerPhone(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(custodyClients.data ?? []).map((client) => <option key={client.phone} value={client.phone}>{client.client_name} · {client.phone}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyDate}<input required type="date" value={custodyReceiptDate} onChange={(e) => { setCustodyReceiptDate(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyVariety}<select required value={custodyVarietyId} onChange={(e) => { setCustodyVarietyId(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(varieties.data ?? []).filter((variety) => variety.active).map((variety) => <option key={variety.id} value={variety.id}>{lang === "ar" ? (variety.name_ar || variety.name_fr) : variety.name_fr}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyQuantity}<input required type="number" min="0.001" step="0.001" value={custodyReceiptQuantity} onChange={(e) => { setCustodyReceiptQuantity(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyLocation}<select required value={custodyReceivingLocationId} onChange={(e) => { setCustodyReceivingLocationId(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(locations.data ?? []).filter((location) => location.active && ["OLIVE_STORAGE", "STAGING"].includes(location.kind)).map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyAck}<input required minLength={3} maxLength={120} value={custodyReceiptAck} onChange={(e) => { setCustodyReceiptAck(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium md:col-span-2">{l.custodySource}<input maxLength={120} value={custodySourceReference} onChange={(e) => { setCustodySourceReference(e.target.value); setCustodyReceiptKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <div className="flex items-end gap-2"><Button type="submit" disabled={receiveCustomerCustody.isPending || !custodyCustomerPhone || !custodyVarietyId || !custodyReceivingLocationId || !(Number(custodyReceiptQuantity) > 0) || custodyReceiptAck.trim().length < 3}>{editingCustodyReceipt ? (lang === "ar" ? "حفظ التصحيح" : "Enregistrer la correction") : l.receiveCustody}</Button>{editingCustodyReceipt && <Button type="button" variant="outline" onClick={() => { setEditingCustodyReceipt(null); setCustodyReceiptQuantity(""); setCustodyReceiptAck(""); setCustodySourceReference(""); }}>{l.cancelEdit}</Button>}</div>
          </form>
        </CardContent></Card>}

        {(isAdmin || (editingCustodyRelease && canEditRecords)) && <Card><CardHeader><CardTitle>{editingCustodyRelease ? (lang === "ar" ? "تصحيح تسليم الأمانة" : "Corriger la restitution en garde") : l.custodyReleaseTitle}</CardTitle><CardDescription>{editingCustodyRelease ? (lang === "ar" ? "سيُسجّل التصحيح بقيد عكسي مع الاحتفاظ بالمستند السابق." : "La correction crée une écriture inverse et conserve le document précédent.") : l.custodyReleaseNote}</CardDescription></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); if (editingCustodyRelease) { const reason = window.prompt(lang === "ar" ? "سبب تصحيح المستند (5 أحرف على الأقل):" : "Motif de correction (5 caractères minimum) :"); if (reason && reason.trim().length >= 5) releaseCustomerCustody.mutate(reason.trim()); } else if (window.confirm(lang === "ar" ? "هل تؤكد تسليم هذه الكمية إلى مالكها؟ سيتم خصمها من المخزون ولن تُسجّل كعملية بيع." : "Confirmer la restitution au propriétaire ? La quantité sera débitée du stock et ne sera pas enregistrée comme une vente.")) releaseCustomerCustody.mutate(undefined); }}>
            <label className="grid gap-1 text-sm font-medium">{l.custodyCustomer}<select required disabled={!!editingCustodyRelease} value={pickupCustomerId} onChange={(e) => { setPickupCustomerId(e.target.value); setPickupBalanceKey(""); setPickupQuantity(""); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(custodyOwners.data ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.client_name} · {owner.client_phone}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyDate}<input required type="date" value={pickupDate} onChange={(e) => { setPickupDate(e.target.value); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyOilLot}<select required disabled={!!editingCustodyRelease} value={pickupBalanceKey} onChange={(e) => { setPickupBalanceKey(e.target.value); setPickupQuantity(""); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{editingCustodyRelease && <option value={editingCustodyRelease.oil_lot_id + "::" + editingCustodyRelease.source_tank_id}>{editingCustodyRelease.batch_code ?? editingCustodyRelease.oil_lot_id} · {value((tanks.data ?? []).find((tank) => tank.id === editingCustodyRelease.source_tank_id)?.code, editingCustodyRelease.source_tank_id)}</option>}{availableCustomerOilBalances.map((balance) => { const lot = (lots.data ?? []).find((item) => item.id === balance.lot_id); const tank = (tanks.data ?? []).find((item) => item.id === balance.location_id); return <option key={balance.lot_id + "::" + balance.location_id} value={balance.lot_id + "::" + balance.location_id}>{lot?.batch_code ?? "—"} · {tank?.code ?? balance.location_id} · {number(balance.quantity_kg)} kg</option>; })}</select></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyQuantity}<input required type="number" min="0.001" step="0.001" max={editingCustodyRelease ? Number(editingCustodyRelease.quantity_kg) + Number(selectedPickupBalance?.quantity_kg ?? 0) : selectedPickupBalance?.quantity_kg ?? undefined} value={pickupQuantity} disabled={!selectedPickupBalance && !editingCustodyRelease} onChange={(e) => { setPickupQuantity(e.target.value); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyAck}<input required minLength={3} maxLength={120} value={pickupAck} onChange={(e) => { setPickupAck(e.target.value); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{l.custodyReason}<input required minLength={5} maxLength={500} value={pickupReason} onChange={(e) => { setPickupReason(e.target.value); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <div className="md:col-span-3 flex flex-wrap items-center gap-3"><Button type="submit" disabled={releaseCustomerCustody.isPending || !pickupCustomerId || !pickupBalanceKey || !(Number(pickupQuantity) > 0) || Number(pickupQuantity) > Number(editingCustodyRelease ? Number(editingCustodyRelease.quantity_kg) + Number(selectedPickupBalance?.quantity_kg ?? 0) : selectedPickupBalance?.quantity_kg ?? 0) || pickupAck.trim().length < 3 || pickupReason.trim().length < 5}>{editingCustodyRelease ? (lang === "ar" ? "حفظ التصحيح" : "Enregistrer la correction") : l.releaseCustody}</Button>{editingCustodyRelease && <Button type="button" variant="outline" onClick={() => { setEditingCustodyRelease(null); setPickupQuantity(""); setPickupAck(""); setPickupReason(""); setPickupBalanceKey(""); }}>{l.cancelEdit}</Button>}{!editingCustodyRelease && pickupCustomerId && availableCustomerOilBalances.length === 0 && <span className="text-xs text-amber-700">{l.noCustomerOil}</span>}</div>
          </form>
        </CardContent></Card>}

        <Card><CardHeader><CardTitle>{l.custodyStatementTitle}</CardTitle><CardDescription>{l.selectCustodyOwner}</CardDescription><label className="mt-2 grid max-w-xl gap-1 text-sm font-medium">{l.custodyCustomer}<select value={pickupCustomerId} onChange={(e) => { setPickupCustomerId(e.target.value); setPickupBalanceKey(""); setPickupQuantity(""); setPickupKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(custodyOwners.data ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.client_name} · {owner.client_phone}</option>)}</select></label></CardHeader><CardContent>
          {pickupCustomerId && custodyStatement.data ? <><div className="mb-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{l.olive}</p><p className="text-2xl font-semibold">{number(custodyStatement.data.current_balances_kg?.OLIVE)} kg</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{l.oil}</p><p className="text-2xl font-semibold">{number(custodyStatement.data.current_balances_kg?.OIL)} L</p></div></div><Table><TableHeader><TableRow><TableHead>{l.custodyRecordedAt}</TableHead><TableHead>{l.document}</TableHead><TableHead>{l.custodyProduct}</TableHead><TableHead>{l.custodyMovement}</TableHead><TableHead>{l.custodyQuantity}</TableHead><TableHead>{l.custodyDelta}</TableHead><TableHead>{l.custodyBalance}</TableHead></TableRow></TableHeader><TableBody>{(custodyStatement.data.movements ?? []).map((movement: AnyRecord) => <TableRow key={movement.id}><TableCell>{date(movement.created_at)}</TableCell><TableCell className="font-mono text-xs">{lotCode((lots.data ?? []).find((lot) => lot.id === movement.lot_id), movement.document_number)}</TableCell><TableCell>{movement.product_kind === "OLIVE" ? l.olive : l.oil}</TableCell><TableCell>{value(movement.movement_kind)}</TableCell><TableCell>{number(movement.quantity_kg)} {movement.product_kind === "OIL" ? "L" : "kg"}</TableCell><TableCell className={Number(movement.delta_kg) < 0 ? "text-red-700" : Number(movement.delta_kg) > 0 ? "text-emerald-700" : ""}>{Number(movement.delta_kg) > 0 ? "+" : ""}{number(movement.delta_kg)} {movement.product_kind === "OIL" ? "L" : "kg"}</TableCell><TableCell>{number(movement.balance_after_kg)} {movement.product_kind === "OIL" ? "L" : "kg"}</TableCell></TableRow>)}{(!custodyStatement.isLoading && !(custodyStatement.data.movements?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody></Table></> : <p className="text-sm text-muted-foreground">{pickupCustomerId ? (lang === "ar" ? "جار تحميل كشف الأمانة…" : "Chargement de l’état de garde…") : l.selectCustodyOwner}</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{l.custodyReceipts}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.custodyDate}</TableHead><TableHead>{l.custodyCustomer}</TableHead><TableHead>{l.custodyVariety}</TableHead><TableHead>{l.custodyQuantity}</TableHead><TableHead>{l.custodyLocation}</TableHead><TableHead>{l.custodyAck}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader><TableBody>
            {(custodyReceipts.data ?? []).map((item) => {
              const canCorrect = item.status === "RECEIVED";
              return <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{canCorrect && canEditRecords ? <button type="button" className="text-primary underline underline-offset-2" title={lang === "ar" ? "انقر لتعديل المستند" : "Cliquer pour corriger le document"} onClick={() => beginCustodyReceiptEdit(item)}>{value(item.document_number, item.batch_code)}</button> : value(item.document_number, item.batch_code)}<div className="text-muted-foreground">{value(item.batch_code)}</div></TableCell>
                <TableCell>{date(item.receipt_date)}</TableCell><TableCell>{value(item.customer_name, item.customer_phone)}</TableCell>
                <TableCell>{value((varieties.data ?? []).find((variety) => variety.id === item.variety_id)?.name_fr, item.variety_id)}</TableCell>
                <TableCell>{number(item.quantity_kg)} kg</TableCell><TableCell>{value((locations.data ?? []).find((location) => location.id === item.receiving_location_id)?.code, item.receiving_location_id)}</TableCell>
                <TableCell>{value(item.customer_acknowledgement_reference)}</TableCell>
                <TableCell>{item.status === "CANCELLED" ? (lang === "ar" ? "ملغى" : "Annulé") : (lang === "ar" ? "مسجل" : "Enregistré")}</TableCell>
                <TableCell><div className="flex gap-2">{canEditRecords && canCorrect && <Button size="sm" variant="outline" onClick={() => beginCustodyReceiptEdit(item)}>{lang === "ar" ? "تعديل" : "Modifier"}</Button>}{canDeleteRecords && canCorrect && <Button size="sm" variant="destructive" disabled={cancelCustodyReceipt.isPending} onClick={() => { const reason = window.prompt(lang === "ar" ? "سبب الإلغاء (5 أحرف على الأقل):" : "Motif de l’annulation (5 caractères minimum) :"); if (reason && reason.trim().length >= 5) cancelCustodyReceipt.mutate({ item, reason: reason.trim() }); }}>{lang === "ar" ? "إزالة" : "Annuler"}</Button>}</div></TableCell>
              </TableRow>;
            })}
            {(!custodyReceipts.isLoading && !(custodyReceipts.data?.length)) && <EmptyRow colSpan={9} text={l.noRows} />}
          </TableBody></Table>
        </CardContent></Card><Card><CardHeader><CardTitle>{l.custodyReleases}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{l.custodyDate}</TableHead><TableHead>{l.custodyCustomer}</TableHead><TableHead>{l.custodyOilLot}</TableHead><TableHead>{l.custodyQuantity}</TableHead><TableHead>{l.custodySourceTank}</TableHead><TableHead>{l.custodyAck}</TableHead><TableHead>{l.status}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader><TableBody>
            {(custodyReleases.data ?? []).map((item) => {
              const canCorrect = item.status === "APPROVED";
              return <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{canCorrect && canEditRecords ? <button type="button" className="text-primary underline underline-offset-2" title={lang === "ar" ? "انقر لتعديل المستند" : "Cliquer pour corriger le document"} onClick={() => beginCustodyReleaseEdit(item)}>{value(item.document_number)}</button> : value(item.document_number)}</TableCell>
                <TableCell>{date(item.release_date)}</TableCell><TableCell>{value(item.customer_name, item.customer_phone)}</TableCell>
                <TableCell>{lotCode((lots.data ?? []).find((lot) => lot.id === item.oil_lot_id), item.oil_lot_id)}</TableCell>
                <TableCell>{number(item.quantity_kg)} L</TableCell><TableCell>{value((tanks.data ?? []).find((tank) => tank.id === item.source_tank_id)?.code, item.source_tank_id)}</TableCell>
                <TableCell>{value(item.customer_acknowledgement_reference)}</TableCell>
                <TableCell>{item.status === "CANCELLED" ? (lang === "ar" ? "ملغى" : "Annulé") : (lang === "ar" ? "مسجل" : "Enregistré")}</TableCell>
                <TableCell><div className="flex gap-2">{canEditRecords && canCorrect && <Button size="sm" variant="outline" onClick={() => beginCustodyReleaseEdit(item)}>{lang === "ar" ? "تعديل" : "Modifier"}</Button>}{canDeleteRecords && canCorrect && <Button size="sm" variant="destructive" disabled={cancelCustodyRelease.isPending} onClick={() => { const reason = window.prompt(lang === "ar" ? "سبب الإلغاء (5 أحرف على الأقل):" : "Motif de l’annulation (5 caractères minimum) :"); if (reason && reason.trim().length >= 5) cancelCustodyRelease.mutate({ item, reason: reason.trim() }); }}>{lang === "ar" ? "إزالة" : "Annuler"}</Button>}</div></TableCell>
              </TableRow>;
            })}
            {(!custodyReleases.isLoading && !(custodyReleases.data?.length)) && <EmptyRow colSpan={9} text={l.noRows} />}
          </TableBody></Table>
        </CardContent></Card>
      </div>}

      {tab === "buyers" && <div className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
            {isAdmin && <Button type="button" className="mb-3 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700" onClick={() => { resetBuyerEditor(); setShowBuyerForm((v) => !v); }}>
              <Plus className="mr-2 size-4"/>{lang === "ar" ? "إضافة حريف جديد" : "Nouvel acheteur"}
            </Button>}
            {showBuyerForm && isAdmin && <form className="mb-4 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3" onSubmit={(event) => { event.preventDefault(); if (buyerName.trim().length >= 2) saveBuyer.mutate(); }}>
              <div className="font-semibold text-indigo-900">{editingBuyerId ? salesText.editBuyer : salesText.addBuyer}</div>
              <label className="grid gap-1 text-sm font-medium">{salesText.buyerName}<input required minLength={2} maxLength={160} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="h-10 rounded-xl border bg-white px-3 font-normal"/></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.buyerContact}<input maxLength={120} value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} className="h-10 rounded-xl border bg-white px-3 font-normal"/></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.buyerPhone}<input maxLength={40} value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} className="h-10 rounded-xl border bg-white px-3 font-normal"/></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.buyerTax}<input maxLength={80} value={buyerTaxId} onChange={(e) => setBuyerTaxId(e.target.value)} className="h-10 rounded-xl border bg-white px-3 font-normal"/></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.buyerEmail}<input type="email" maxLength={160} value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} className="h-10 rounded-xl border bg-white px-3 font-normal"/></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.buyerAddress}<input maxLength={500} value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} className="h-10 rounded-xl border bg-white px-3 font-normal"/></label>
              <div className="flex gap-2"><Button type="submit" disabled={saveBuyer.isPending || buyerName.trim().length < 2} className="rounded-xl bg-indigo-600 hover:bg-indigo-700">{editingBuyerId ? salesText.saveBuyer : salesText.addBuyer}</Button><Button type="button" variant="outline" className="rounded-xl" onClick={() => { resetBuyerEditor(); setShowBuyerForm(false); }}>{salesText.cancelEdit}</Button></div>
            </form>}
            <div className="relative mb-3"><Search className="absolute left-3 top-3 size-4 text-stone-400"/><input value={buyerSearch} onChange={(e) => setBuyerSearch(e.target.value)} placeholder={lang === "ar" ? "البحث عن حريف..." : "Rechercher un acheteur..."} className="h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm"/></div>
            {filteredBuyerRows.length === 0 && <p className="py-10 text-center text-sm text-stone-500">{l.noRows}</p>}
            <ul className="max-h-[65vh] space-y-1 overflow-y-auto">
              {filteredBuyerRows.map((buyer) => {
                const count = invoiceRows.filter((invoice) => invoice.buyer_id === buyer.id).length;
                const outstanding = invoiceRows.filter((invoice) => invoice.buyer_id === buyer.id).reduce((sum, invoice) => sum + Number(invoice.outstanding_amount_dt ?? 0), 0);
                return <li key={buyer.id}><button type="button" onClick={() => { setSelectedBuyerId(buyer.id); setSelectedBuyerAccountId(buyer.id); setShowBuyerForm(false); resetBuyerEditor(); }} className={`w-full rounded-xl px-3 py-2.5 text-start transition-colors duration-200 ${buyer.id === selectedBuyerId ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-stone-50"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-medium text-stone-900">{value(buyer.name)}</span><span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">{count}×</span></div>
                  <div className="mt-0.5 flex justify-between gap-2 text-xs text-stone-500"><span dir="ltr">{value(buyer.phone)}</span><span>{money(outstanding)}</span></div>
                  <div className="mt-1"><span className={buyer.active ? "text-xs font-medium text-emerald-700" : "text-xs font-medium text-stone-400"}>{buyer.active ? salesText.activeBuyer : salesText.inactiveBuyer}</span></div>
                </button></li>;
              })}
            </ul>
          </div>
          <div>
            {!selectedBuyer && <div className="grid min-h-72 place-items-center rounded-2xl border-2 border-dashed border-stone-200 bg-white/60 p-8 text-center text-stone-500"><div><BookUser className="mx-auto mb-3 size-10 text-indigo-400"/>{lang === "ar" ? "اختر حريفاً لعرض ملفه وسجل مبيعاته" : "Sélectionnez un acheteur pour consulter son dossier"}</div></div>}
            {selectedBuyer && <div className="code-reveal space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div><div className="text-xs font-semibold uppercase tracking-wider text-stone-500">{lang === "ar" ? "الحريف" : "Acheteur"}</div><div className="font-heading text-3xl font-bold text-stone-900">{value(selectedBuyer.name)}</div><div className="mt-1 flex items-center gap-2 text-sm text-stone-600"><Phone className="size-4"/><span dir="ltr">{value(selectedBuyer.phone)}</span></div><div className="mt-1 text-xs text-stone-500">{salesText.buyerContact}: {value(selectedBuyer.contact_name)} · {salesText.buyerTax}: {value(selectedBuyer.tax_identifier)}</div><div className="mt-1 text-xs text-stone-500">{salesText.buyerEmail}: {value(selectedBuyer.email)} · {salesText.buyerAddress}: {value(selectedBuyer.address)}</div></div>
                <div className="flex gap-2">{isAdmin && <Button variant="outline" onClick={() => { startBuyerEdit(selectedBuyer); setShowBuyerForm(true); }} className="rounded-xl border-indigo-300 text-indigo-800 hover:bg-indigo-50"><Pencil className="size-4"/>{salesText.editBuyer}</Button>}{isAdmin && (selectedBuyer.active ? <Button variant="outline" onClick={() => window.confirm(salesText.confirmDeleteBuyer) && changeBuyerStatus.mutate(selectedBuyer)} disabled={changeBuyerStatus.isPending} className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="size-4"/>{salesText.deleteBuyer}</Button> : <Button variant="outline" onClick={() => changeBuyerStatus.mutate(selectedBuyer)} disabled={changeBuyerStatus.isPending} className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"><UserCheck className="size-4"/>{salesText.reactivateBuyer}</Button>)}</div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard tone="rose" label={lang === "ar" ? "عدد الفواتير" : "Factures"} value={buyerInvoiceCount} icon={<FileText />} />
                <StatCard tone="olive" label={lang === "ar" ? "إجمالي المبيعات" : "Ventes brutes"} value={money(buyerGrossAmount)} icon={<ShoppingCart />} />
                <StatCard tone="gold" label={lang === "ar" ? "الإشعارات الدائنة" : "Avoirs" } value={money(buyerCreditedAmount)} icon={<ClipboardList />} />
                <StatCard tone="sky" label={lang === "ar" ? "المبالغ المسددة" : "Montant payé"} value={money(buyerPaidAmount)} icon={<ShieldCheck />} />
                <StatCard tone="violet" label={lang === "ar" ? "الرصيد المتبقي" : "Reste à recevoir"} value={money(buyerOutstandingAmount)} icon={<Wallet />} />
              </div>
              {selectedBuyerAccountId === selectedBuyer.id && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard tone="sky" label={salesText.accountInvoices} value={buyerAccountSummary.data?.summary?.invoice_count ?? "—"} icon={<FileText />} />
                <StatCard tone="violet" label={salesText.netReceivable} value={money(buyerAccountSummary.data?.summary?.total_amount_dt)} icon={<Wallet />} />
                <StatCard tone="emerald" label={salesText.settledAmount} value={money(buyerAccountSummary.data?.summary?.settled_amount_dt)} icon={<ShieldCheck />} />
                <StatCard tone="gold" label={salesText.buyerCreditBalance} value={money(buyerAccountSummary.data?.summary?.buyer_credit_balance_dt)} icon={<Activity />} />
              </div>}
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                <div className="border-b border-stone-100 px-5 py-4 font-heading text-lg font-bold">{lang === "ar" ? "سجل فواتير الحريف" : "Historique des factures"}</div>
                <div className="overflow-x-auto"><Table><TableHeader className="bg-stone-50"><TableRow>
                  <TableHead className="text-start">{salesText.invoiceNo}</TableHead><TableHead className="text-start">{l.purchaseDate}</TableHead><TableHead className="text-end">{salesText.saleQty}</TableHead><TableHead className="text-end">{salesText.salePrice}</TableHead><TableHead className="text-end">{salesText.total}</TableHead><TableHead className="text-end">{salesText.paidAmount}</TableHead><TableHead className="text-end">{salesText.outstanding}</TableHead><TableHead className="text-start">{salesText.paymentStatus}</TableHead><TableHead className="text-center">{lang === "ar" ? "الفاتورة" : "Facture"}</TableHead>
                </TableRow></TableHeader><TableBody>
                  {selectedBuyerInvoices.map((invoice) => <TableRow key={invoice.id}>
                    <TableCell className="font-mono text-xs font-semibold">{value(invoice.document_number)}</TableCell><TableCell className="text-xs text-stone-500" dir="ltr">{date(invoice.sale_date ?? invoice.created_at)}</TableCell><TableCell className="text-end font-semibold text-lime-800">{number(invoice.quantity_kg)} L</TableCell><TableCell className="text-end">{money(invoice.unit_price_dt)}</TableCell><TableCell className="text-end font-semibold text-violet-700">{money(invoice.total_amount_dt)}</TableCell><TableCell className="text-end text-emerald-700">{money(invoice.paid_amount_dt)}</TableCell><TableCell className="text-end font-semibold text-rose-700">{money(invoice.outstanding_amount_dt)}</TableCell><TableCell>{invoice.payment_status === "PAID" ? (lang === "ar" ? "مسددة" : "Payée") : invoice.payment_status === "PARTIALLY_PAID" ? (lang === "ar" ? "جزئية" : "Partielle") : invoice.payment_status === "CREDITED" ? (lang === "ar" ? "مغطاة بإشعار دائن" : "Créditée") : (lang === "ar" ? "غير مسددة" : "Impayée")}</TableCell><TableCell className="text-center"><Button type="button" size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => { setBuyerInvoiceToOpen(invoice.id); selectTab("factures"); }}><FileText className="mr-1 size-3.5" />Facture</Button></TableCell>
                  </TableRow>)}
                  {!selectedBuyerInvoices.length && <EmptyRow colSpan={9} text={l.noRows}/>}
                </TableBody></Table></div>
              </div>
            </div>}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard tone="sky" label={lang === "ar" ? "عدد الحرفاء" : "Acheteurs"} value={buyerRows.length} icon={<UserRound />} />
          <StatCard tone="violet" label={lang === "ar" ? "عدد الفواتير" : "Factures émises"} value={allBuyerInvoiceCount} icon={<FileText />} />
          <StatCard tone="emerald" label={lang === "ar" ? "إجمالي المبيعات" : "Ventes totales"} value={money(allBuyerGrossAmount)} icon={<ShoppingCart />} />
          <StatCard tone="gold" label={lang === "ar" ? "المبالغ غير المسددة" : "Reste à recevoir"} value={money(allBuyerOutstandingAmount)} icon={<Wallet />} />
        </div>
      </div>}

      {tab === "factures" && ready && <CommercialFactures initialInvoiceId={buyerInvoiceToOpen} />}
      {tab === "reports" && ready && <CommercialReports lang={lang} /> }

      {tab === "sales" && <div className="space-y-4">
        {isAdmin && <Card><CardHeader><CardTitle>{salesText.createSale}</CardTitle><CardDescription>{saleTankOptions.length ? salesText.saleDraftHint : salesText.noEligibleOil}</CardDescription></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); createSale.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{salesText.saleDate}<input required type="date" value={saleDate} onChange={(e) => { setSaleIdempotencyKey(crypto.randomUUID()); setSaleDate(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.selectBuyer}<select required value={saleBuyerId} onChange={(e) => { setSaleIdempotencyKey(crypto.randomUUID()); setSaleBuyerId(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(buyers.data ?? []).filter((buyer) => buyer.active).map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.selectTank}<select required value={saleTankId} onChange={(e) => { setSaleIdempotencyKey(crypto.randomUUID()); setSaleTankId(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">{saleTankOptions.length ? "—" : salesText.noSaleTank}</option>{saleTankOptions.map(({ locationId, tank, quantity }) => <option key={locationId} value={locationId}>{tank?.code ?? locationId} · {number(quantity)} L</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.saleQty}<input required type="number" min="0.001" step="0.001" max={saleTankOptions.find((option) => option.locationId === saleTankId)?.quantity ?? undefined} value={saleQuantity} onChange={(e) => { setSaleIdempotencyKey(crypto.randomUUID()); setSaleQuantity(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.salePrice}<input required type="number" min="1" step="1" value={saleUnitPrice} onChange={(e) => { setSaleIdempotencyKey(crypto.randomUUID()); setSaleUnitPrice(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium md:col-span-3">{l.notes}<input maxLength={1000} value={saleNotes} onChange={(e) => { setSaleIdempotencyKey(crypto.randomUUID()); setSaleNotes(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <p className="text-xs text-amber-700 md:col-span-3">{salesText.taxNotice}</p>
            <Button type="submit" disabled={createSale.isPending || !saleBuyerId || !saleTankId || !(Number(saleQuantity) > 0) || !(Number(saleUnitPrice) > 0)}><ShoppingCart className="size-4" />{salesText.createSale}</Button>
          </form>
        </CardContent></Card>}
        
        {isAdmin && <Card><CardHeader><CardTitle>{salesText.returnIntake}</CardTitle><CardDescription>{(tanks.data ?? []).some((tank) => tank.active && tank.role === "QUARANTINE") ? salesText.returnWarning : salesText.noQuarantineTank}</CardDescription></CardHeader><CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (window.confirm(salesText.returnConfirm)) receiveSaleReturn.mutate(); }}>
            <label className="grid gap-1 text-sm font-medium">{salesText.returnSale}<select required value={returnSaleId} onChange={(e) => { setReturnIdempotencyKey(crypto.randomUUID()); setReturnSaleId(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(sales.data ?? []).filter((sale) => sale.status === "APPROVED" && Number(sale.quantity_kg) - Number(sale.returned_quantity_kg ?? 0) > 0).map((sale) => <option key={sale.id} value={sale.id}>{sale.document_number ?? sale.batch_code ?? "—"} · {number(Number(sale.quantity_kg) - Number(sale.returned_quantity_kg ?? 0))} L</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.quarantineTank}<select required value={returnTankId} onChange={(e) => { setReturnIdempotencyKey(crypto.randomUUID()); setReturnTankId(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="">—</option>{(tanks.data ?? []).filter((tank) => tank.active && tank.role === "QUARANTINE").map((tank) => <option key={tank.id} value={tank.id}>{tank.code} · {tank.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.returnQty}<input required type="number" min="0.001" step="0.001" max={(sales.data ?? []).find((sale) => sale.id === returnSaleId) ? Number((sales.data ?? []).find((sale) => sale.id === returnSaleId)?.quantity_kg) - Number((sales.data ?? []).find((sale) => sale.id === returnSaleId)?.returned_quantity_kg ?? 0) : undefined} value={returnQuantity} onChange={(e) => { setReturnIdempotencyKey(crypto.randomUUID()); setReturnQuantity(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium md:col-span-2">{salesText.returnReason}<input required minLength={5} maxLength={500} value={returnReason} onChange={(e) => { setReturnIdempotencyKey(crypto.randomUUID()); setReturnReason(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">{salesText.ackRef}<input maxLength={120} value={returnAcknowledgement} onChange={(e) => { setReturnIdempotencyKey(crypto.randomUUID()); setReturnAcknowledgement(e.target.value); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
            <Button type="submit" disabled={receiveSaleReturn.isPending || !returnSaleId || !returnTankId || !(Number(returnQuantity) > 0) || returnReason.trim().length < 5 || !(tanks.data ?? []).some((tank) => tank.id === returnTankId && tank.role === "QUARANTINE")}>{salesText.returnIntake}</Button>
          </form>
        </CardContent></Card>}
<Card><CardHeader><CardTitle>{salesText.saleHistory}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{salesText.saleDate}</TableHead><TableHead>{salesText.buyerName}</TableHead><TableHead>{salesText.selectTank}</TableHead><TableHead>{l.quantity}</TableHead><TableHead>{salesText.total}</TableHead><TableHead>{l.status}</TableHead>{pumpSettings.data?.pump_system_enabled && <TableHead>{lang === "ar" ? "مضخّة التعبئة" : "Pompe de remplissage"}</TableHead>}<TableHead>{l.actions}</TableHead></TableRow></TableHeader>
            <TableBody>{(sales.data ?? []).map((sale) => <TableRow key={sale.id}><TableCell className="font-mono text-xs">{value(sale.batch_code ?? sale.document_number)}</TableCell><TableCell>{date(sale.sale_date)}</TableCell><TableCell>{value((buyers.data ?? []).find((b) => b.id === sale.buyer_id)?.name, sale.buyer_id)}</TableCell><TableCell>{value((tanks.data ?? []).find((tank) => tank.id === sale.source_tank_id)?.code, sale.source_tank_id)}</TableCell><TableCell>{number(sale.quantity_kg)}</TableCell><TableCell>{money(sale.total_amount_dt)}</TableCell><TableCell>{sale.status === "DRAFT" ? (lang === "ar" ? "مسودة" : "Brouillon") : value(sale.status)}</TableCell>{pumpSettings.data?.pump_system_enabled && <TableCell>{sale.status !== "APPROVED" ? "—" : sale.pump_selection?.pump_name ? <div className="flex min-w-40 flex-col items-start gap-2">{sale.pump_selection.status === "SELECTED" ? <select aria-label={lang === "ar" ? "تغيير مضخة التعبئة" : "Changer la pompe de remplissage"} value={sale.pump_selection.pump_id} disabled={selectFillingPump.isPending} onChange={(event) => { const pump = (pumpSettings.data?.pumps ?? []).find((item: AnyRecord) => item.id === event.target.value); if (pump && pump.active && (!pump.busy || pump.active_sale_id === sale.id)) selectFillingPump.mutate({ sale, pump }); }} className="h-9 min-w-44 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring">{(pumpSettings.data?.pumps ?? []).filter((pump: AnyRecord) => pump.active).map((pump: AnyRecord) => <option key={pump.id} value={pump.id} disabled={pump.busy && pump.active_sale_id !== sale.id}>{pump.name}{pump.busy && pump.active_sale_id !== sale.id ? (lang === "ar" ? " — مشغولة" : " — occupée") : ""}</option>)}</select> : <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">{sale.pump_selection.pump_name}</span>}<span className="text-xs text-muted-foreground">{sale.pump_selection.status === "SELECTED" ? (lang === "ar" ? "مختارة — يمكن تغييرها قبل بدء التعبئة" : "Sélectionnée — modifiable avant démarrage") : sale.pump_selection.status === "IN_PROGRESS" ? (lang === "ar" ? "قيد التعبئة" : "En cours") : sale.pump_selection.status === "COMPLETED" ? (lang === "ar" ? "مكتملة" : "Terminée") : (lang === "ar" ? "متوقفة" : "Interrompue")}</span>{sale.pump_selection.status === "SELECTED" && <div className="flex flex-wrap gap-1"><Button size="sm" disabled={updateFillingStatus.isPending} onClick={() => updateFillingStatus.mutate({ sale, status: "IN_PROGRESS" })}>{lang === "ar" ? "بدء التعبئة" : "Démarrer"}</Button><Button size="sm" variant="outline" disabled={updateFillingStatus.isPending} onClick={() => { const reason = window.prompt(lang === "ar" ? "سبب إيقاف التعبئة:" : "Motif de l’interruption :"); if (reason && reason.trim().length >= 3) updateFillingStatus.mutate({ sale, status: "INTERRUPTED", reason: reason.trim() }); else if (reason !== null) toast.error(lang === "ar" ? "أدخل سببًا من 3 أحرف على الأقل" : "Saisissez un motif d’au moins 3 caractères"); }}>{lang === "ar" ? "إيقاف" : "Interrompre"}</Button></div>}{sale.pump_selection.status === "IN_PROGRESS" && <div className="flex flex-wrap gap-1"><Button size="sm" disabled={updateFillingStatus.isPending} onClick={() => updateFillingStatus.mutate({ sale, status: "COMPLETED" })}>{lang === "ar" ? "إنهاء" : "Terminer"}</Button><Button size="sm" variant="outline" disabled={updateFillingStatus.isPending} onClick={() => { const reason = window.prompt(lang === "ar" ? "سبب إيقاف التعبئة:" : "Motif de l’interruption :"); if (reason && reason.trim().length >= 3) updateFillingStatus.mutate({ sale, status: "INTERRUPTED", reason: reason.trim() }); else if (reason !== null) toast.error(lang === "ar" ? "أدخل سببًا من 3 أحرف على الأقل" : "Saisissez un motif d’au moins 3 caractères"); }}>{lang === "ar" ? "إيقاف" : "Interrompre"}</Button></div>}</div> : <select aria-label={lang === "ar" ? "اختيار مضخة التعبئة" : "Choisir une pompe de remplissage"} defaultValue="" disabled={selectFillingPump.isPending || !(pumpSettings.data?.pumps ?? []).some((pump: AnyRecord) => pump.active && !pump.busy)} onChange={(event) => { const pump = (pumpSettings.data?.pumps ?? []).find((item: AnyRecord) => item.id === event.target.value); if (pump && pump.active && !pump.busy) selectFillingPump.mutate({ sale, pump }); event.currentTarget.value = ""; }} className="h-9 min-w-44 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"><option value="" disabled>{lang === "ar" ? "اختر المضخة…" : "Choisir une pompe…"}</option>{(pumpSettings.data?.pumps ?? []).filter((pump: AnyRecord) => pump.active).map((pump: AnyRecord) => <option key={pump.id} value={pump.id} disabled={pump.busy}>{pump.name}{pump.busy ? (lang === "ar" ? " — مشغولة" : " — occupée") : ""}</option>)}</select>}</TableCell>}<TableCell>{isAdmin && sale.status === "DRAFT" ? <div className="flex flex-wrap gap-1">
              <Button size="sm" disabled={approveSale.isPending || cancelSale.isPending} onClick={() => approveSale.mutate(sale)}>{salesText.approveSale}</Button>
              <Button size="sm" variant="outline" disabled={approveSale.isPending || cancelSale.isPending} onClick={() => { const reason = window.prompt(salesText.cancelSalePrompt); if (reason && reason.trim().length >= 5) cancelSale.mutate({ sale, reason: reason.trim() }); else if (reason !== null) toast.error(lang === "ar" ? "سبب الإلغاء يجب أن يكون 5 أحرف على الأقل" : "Le motif doit contenir au moins 5 caractères"); }}><Ban className="size-3.5" />{salesText.cancelSale}</Button>
            </div> : (() => { const invoice = (salesInvoices.data ?? []).find((item) => item.id === sale.invoice_id); return invoice ? <button type="button" className="font-mono text-xs font-semibold text-primary underline underline-offset-4 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm" title={lang === "ar" ? "فتح الفاتورة" : "Ouvrir la facture"} onClick={() => { setBuyerInvoiceToOpen(invoice.id); selectTab("factures"); }}>{value(invoice.document_number)}</button> : "—"; })()}</TableCell></TableRow>)}{(!sales.isLoading && !(sales.data?.length)) && <EmptyRow colSpan={pumpSettings.data?.pump_system_enabled ? 9 : 8} text={l.noRows} />}</TableBody>
          </Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{salesText.returnHistory}</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{salesText.returnSale}</TableHead><TableHead>{salesText.returnQty}</TableHead><TableHead>{salesText.quarantineTank}</TableHead><TableHead>{l.qualityStatus}</TableHead><TableHead>{l.status}</TableHead><TableHead>{salesText.creditNote}</TableHead><TableHead>{salesText.creditedAmount}</TableHead><TableHead>{salesText.returnRejection}</TableHead><TableHead>{l.actions}</TableHead></TableRow></TableHeader>
            <TableBody>{(saleReturns.data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{value(item.document_number)}</TableCell><TableCell>{value((sales.data ?? []).find((sale) => sale.id === item.sale_id)?.batch_code ?? (sales.data ?? []).find((sale) => sale.id === item.sale_id)?.document_number, item.sale_id)}</TableCell><TableCell>{number(item.quantity_kg)} L</TableCell><TableCell>{value((tanks.data ?? []).find((tank) => tank.id === item.quarantine_tank_id)?.code, item.quarantine_tank_id)}</TableCell><TableCell>{value((lots.data ?? []).find((lot) => lot.id === item.returned_oil_lot_id)?.quality_status, item.quality_status)}</TableCell><TableCell>{value(item.commercial_acceptance_status)}</TableCell><TableCell>{value((creditNotes.data ?? []).find((note) => note.id === item.credit_note_id)?.document_number)}</TableCell><TableCell>{money((creditNotes.data ?? []).find((note) => note.id === item.credit_note_id)?.amount_dt)}</TableCell><TableCell className="font-mono text-xs">{value(returnRejections.data?.find((doc) => doc.return_id === item.id)?.document_number)}</TableCell><TableCell>{isAdmin && item.status === "RECEIVED" && item.commercial_acceptance_status === "PENDING" ? <div className="flex flex-wrap gap-1"><Button size="sm" disabled={acceptSaleReturn.isPending || rejectSaleReturn.isPending} onClick={() => { const reason = window.prompt(salesText.returnAcceptancePrompt); if (reason && reason.trim().length >= 5) { const normalizedReason = reason.trim(); const previous = returnAcceptanceKeys[item.id]; const idempotencyKey = previous?.reason === normalizedReason ? previous.key : crypto.randomUUID(); setReturnAcceptanceKeys((current) => ({ ...current, [item.id]: { key: idempotencyKey, reason: normalizedReason } })); acceptSaleReturn.mutate({ item, reason: normalizedReason, idempotencyKey }); } else if (reason !== null) toast.error(lang === "ar" ? "يجب أن يحتوي السبب على 5 أحرف على الأقل" : "Le motif doit contenir au moins 5 caractères"); }}>{salesText.acceptReturn}</Button><Button size="sm" variant="destructive" disabled={acceptSaleReturn.isPending || rejectSaleReturn.isPending} onClick={() => { const reason = window.prompt(salesText.returnRejectionReason); if (reason === null) return; const normalizedReason = reason.trim(); if (normalizedReason.length < 5) { toast.error(lang === "ar" ? "يجب أن يحتوي السبب على 5 أحرف على الأقل" : "Le motif doit contenir au moins 5 caractères"); return; } const receiptReference = window.prompt(salesText.buyerReceiptReference); if (receiptReference === null) return; const normalizedReference = receiptReference.trim(); if (normalizedReference.length < 3) { toast.error(lang === "ar" ? "مرجع استلام الحريف مطلوب" : "La référence de réception par l’acheteur est obligatoire"); return; } if (!window.confirm(salesText.rejectReturnConfirm)) return; const previous = returnRejectionKeys[item.id]; const idempotencyKey = previous?.reason === normalizedReason && previous.receiptReference === normalizedReference ? previous.key : crypto.randomUUID(); setReturnRejectionKeys((current) => ({ ...current, [item.id]: { key: idempotencyKey, reason: normalizedReason, receiptReference: normalizedReference } })); rejectSaleReturn.mutate({ item, reason: normalizedReason, receiptReference: normalizedReference, idempotencyKey }); }}>{salesText.rejectReturn}</Button></div> : "—"}</TableCell></TableRow>)}{(!saleReturns.isLoading && !(saleReturns.data?.length)) && <EmptyRow colSpan={10} text={l.noRows} />}</TableBody>
          </Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{salesText.invoice}</CardTitle><CardDescription>{salesText.taxNotice}</CardDescription></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>{salesText.invoiceNo}</TableHead><TableHead>{salesText.buyerName}</TableHead><TableHead>{salesText.netTotal}</TableHead><TableHead>{salesText.paidAmount}</TableHead><TableHead>{salesText.appliedCredit}</TableHead><TableHead>{salesText.outstanding}</TableHead><TableHead>{salesText.paymentStatus}</TableHead></TableRow></TableHeader>
            <TableBody>{(salesInvoices.data ?? []).map((invoice) => <TableRow key={invoice.id} className={selectedInvoiceId === invoice.id ? "bg-muted/60" : ""} onClick={() => setSelectedInvoiceId(invoice.id)}><TableCell className="font-mono text-xs">{value(invoice.document_number)}{invoice.batch_code && <span className="ml-1 text-muted-foreground">· {invoice.batch_code}</span>}</TableCell><TableCell>{value((buyers.data ?? []).find((b) => b.id === invoice.buyer_id)?.name, invoice.buyer_id)}</TableCell><TableCell>{money(invoice.net_amount_dt ?? invoice.total_amount_dt)}</TableCell><TableCell>{money(invoice.paid_amount_dt)}</TableCell><TableCell>{money(invoice.applied_credit_amount_dt)}</TableCell><TableCell>{money(invoice.outstanding_amount_dt)}</TableCell><TableCell>{invoice.payment_status === "CREDITED" ? salesText.credited : invoice.payment_status === "PAID" ? salesText.paid : invoice.payment_status === "PARTIALLY_PAID" ? salesText.partial : salesText.unpaid}</TableCell></TableRow>)}{(!salesInvoices.isLoading && !(salesInvoices.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody>
          </Table>
          {selectedInvoiceId && <div className="mt-4 space-y-3 rounded-xl border p-4">
            {invoiceBuyerSummary.data?.summary && <div className="rounded-lg border p-3 text-sm"><span className="font-medium">{salesText.creditAvailable}: </span>{money(invoiceBuyerSummary.data.summary.buyer_credit_balance_dt ?? 0)}</div>}
            {isAdmin && selectedSalesInvoice && Number(invoiceBuyerSummary.data?.summary?.buyer_credit_balance_dt ?? 0) > 0 && Number(selectedSalesInvoice.outstanding_amount_dt) > 0 && <div className="rounded-lg border p-3">
              <h3 className="mb-2 font-semibold">{salesText.applyCredit}</h3>
              <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (window.confirm(salesText.creditApplyConfirm)) applyBuyerCredit.mutate(); }}>
                <label className="grid gap-1 text-sm font-medium">{salesText.creditAmount}<input required type="number" min="1" step="1" max={Math.round(Math.min(Number(invoiceBuyerSummary.data?.summary?.buyer_credit_balance_dt ?? 0), Number(selectedSalesInvoice.outstanding_amount_dt)) * 1000)} value={creditApplicationAmount} onChange={(e) => { setCreditApplicationAmount(e.target.value); setCreditApplicationKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <label className="grid gap-1 text-sm font-medium md:col-span-2">{salesText.creditReason}<input required minLength={5} maxLength={500} value={creditApplicationReason} onChange={(e) => { setCreditApplicationReason(e.target.value); setCreditApplicationKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
                <div className="md:col-span-3"><Button type="submit" disabled={applyBuyerCredit.isPending || !(millimesInputNumber(creditApplicationAmount) > 0) || millimesInputNumber(creditApplicationAmount) > Math.round(Math.min(Number(invoiceBuyerSummary.data?.summary?.buyer_credit_balance_dt ?? 0), Number(selectedSalesInvoice.outstanding_amount_dt)) * 1000) || creditApplicationReason.trim().length < 5}><Wallet className="size-4"/>{salesText.applyCredit}</Button></div>
              </form>
            </div>}
            <h3 className="font-semibold">{salesText.recordPayment}</h3>
            {isAdmin && <form className="grid gap-3 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); recordPayment.mutate(); }}>
              <label className="grid gap-1 text-sm font-medium">{salesText.paymentDate}<input required type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.paymentAmount}<input required type="number" min="1" step="1" max={Math.round(Math.max(0, Number(selectedSalesInvoice?.outstanding_amount_dt ?? 0)) * 1000)} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-medium">{salesText.paymentMethod}<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="h-10 rounded-lg border bg-background px-3 font-normal"><option value="CASH">{salesText.cash}</option><option value="BANK_TRANSFER">{salesText.bank}</option><option value="CHEQUE">{salesText.cheque}</option></select></label>
              <label className="grid gap-1 text-sm font-medium">{lang === "ar" ? "مرجع العملية" : "Référence du paiement"}<input maxLength={120} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label>
              <div className="flex items-end"><Button type="submit" disabled={recordPayment.isPending || !(millimesInputNumber(paymentAmount) > 0) || Number(selectedSalesInvoice?.outstanding_amount_dt ?? 0) <= 0 || millimesInputNumber(paymentAmount) > Math.round(Number(selectedSalesInvoice?.outstanding_amount_dt ?? 0) * 1000) || (paymentMethod !== "CASH" && !paymentReference.trim())}><Wallet className="size-4" />{salesText.recordPayment}</Button></div>
            </form>}
            <div className="pt-2"><h4 className="mb-2 text-sm font-semibold">{salesText.creditApplicationHistory}</h4><Table><TableHeader><TableRow><TableHead>{salesText.creditApplicationNumber}</TableHead><TableHead>{salesText.paymentDate}</TableHead><TableHead>{salesText.creditAmount}</TableHead><TableHead>{salesText.creditReason}</TableHead></TableRow></TableHeader><TableBody>{(creditApplications.data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{value(item.document_number)}</TableCell><TableCell>{date(item.created_at)}</TableCell><TableCell>{money(item.amount_dt)}</TableCell><TableCell>{value(item.reason)}</TableCell></TableRow>)}{(!creditApplications.isLoading && !(creditApplications.data?.length)) && <EmptyRow colSpan={4} text={l.noRows} />}</TableBody></Table></div>
            <Table><TableHeader><TableRow><TableHead>{l.document}</TableHead><TableHead>{salesText.paymentDate}</TableHead><TableHead>{salesText.paymentAmount}</TableHead><TableHead>{salesText.paymentMethod}</TableHead><TableHead>{lang === "ar" ? "المرجع" : "Référence"}</TableHead><TableHead>{salesText.remainingReversible}</TableHead><TableHead>{salesText.reversePayment}</TableHead></TableRow></TableHeader><TableBody>{(salePayments.data ?? []).map((payment) => { const remaining = Number(payment.remaining_reversible_dt ?? payment.amount_dt); return <TableRow key={payment.id}><TableCell>{value(payment.document_number)}</TableCell><TableCell>{date(payment.payment_date)}</TableCell><TableCell>{money(payment.amount_dt)}</TableCell><TableCell>{value(payment.method)}</TableCell><TableCell>{value(payment.reference)}</TableCell><TableCell>{money(remaining)}</TableCell><TableCell>{isAdmin && <Button type="button" size="sm" variant="outline" disabled={remaining <= 0} onClick={() => { setSelectedPaymentForReversal(payment.id); setReversalAmount(dinarsToMillimesInput(remaining)); setReversalReason(""); setReversalDate(new Date().toISOString().slice(0, 10)); setReversalEvidenceReference(payment.reference || ""); setReversalKey(crypto.randomUUID()); }}>{salesText.reversePayment}</Button>}</TableCell></TableRow>; })}{(!salePayments.isLoading && !(salePayments.data?.length)) && <EmptyRow colSpan={7} text={l.noRows} />}</TableBody></Table>
            {isAdmin && selectedPayment && <div className="rounded-lg border p-3"><h4 className="mb-2 font-semibold">{salesText.reversePayment} · {value(selectedPayment.document_number)}</h4><p className="mb-3 text-xs text-muted-foreground">{salesText.remainingReversible}: {money(Number(selectedPayment.remaining_reversible_dt ?? selectedPayment.amount_dt))}</p><form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); if (window.confirm(salesText.reverseConfirm)) reversePayment.mutate(); }}><label className="grid gap-1 text-sm font-medium">{salesText.reversalDate}<input required type="date" value={reversalDate} onChange={(e) => { setReversalDate(e.target.value); setReversalKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label><label className="grid gap-1 text-sm font-medium">{salesText.reverseAmount}<input required type="number" min="1" step="1" max={Math.round(Math.max(0, Number(selectedPayment.amount_dt) - (paymentReversals.data ?? []).filter((item) => item.payment_id === selectedPayment.id).reduce((sum, item) => sum + Number(item.amount_dt), 0)) * 1000)} value={reversalAmount} onChange={(e) => { setReversalAmount(e.target.value); setReversalKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label><label className="grid gap-1 text-sm font-medium">{salesText.reversalEvidence}<input maxLength={120} value={reversalEvidenceReference} onChange={(e) => { setReversalEvidenceReference(e.target.value); setReversalKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label><label className="grid gap-1 text-sm font-medium">{salesText.reverseReason}<input required minLength={5} maxLength={500} value={reversalReason} onChange={(e) => { setReversalReason(e.target.value); setReversalKey(crypto.randomUUID()); }} className="h-10 rounded-lg border bg-background px-3 font-normal" /></label><div className="md:col-span-4 flex gap-2"><Button type="submit" disabled={reversePayment.isPending || !(millimesInputNumber(reversalAmount) > 0) || millimesInputNumber(reversalAmount) > Math.round((Number(selectedPayment.amount_dt) - (paymentReversals.data ?? []).filter((item) => item.payment_id === selectedPayment.id).reduce((sum, item) => sum + Number(item.amount_dt), 0)) * 1000) || reversalReason.trim().length < 5}>{salesText.reversePayment}</Button><Button type="button" variant="outline" onClick={() => setSelectedPaymentForReversal("")}>{lang === "ar" ? "إلغاء" : "Annuler"}</Button></div></form></div>}
            <div className="pt-2"><h4 className="mb-2 text-sm font-semibold">{salesText.reversalHistory}</h4><Table><TableHeader><TableRow><TableHead>{salesText.reversalNumber}</TableHead><TableHead>{salesText.invoiceNo}</TableHead><TableHead>{salesText.paymentDate}</TableHead><TableHead>{salesText.reverseAmount}</TableHead><TableHead>{salesText.reverseReason}</TableHead><TableHead>{l.status}</TableHead></TableRow></TableHeader><TableBody>{(paymentReversals.data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs">{value(item.document_number)}</TableCell><TableCell>{value(item.original_payment_number)}</TableCell><TableCell>{date(item.created_at)}</TableCell><TableCell>{money(item.amount_dt)}</TableCell><TableCell>{value(item.reason)}</TableCell><TableCell>{value(item.status)}</TableCell></TableRow>)}{(!paymentReversals.isLoading && !(paymentReversals.data?.length)) && <EmptyRow colSpan={6} text={l.noRows} />}</TableBody></Table></div>
          </div>}
        </CardContent></Card>
      </div>}

      {tab === "quality" && <QrScanDialog open={qualityQrScanOpen} onClose={() => setQualityQrScanOpen(false)} onScan={handleQualityQrScan} />}

    </div>
  );
}
