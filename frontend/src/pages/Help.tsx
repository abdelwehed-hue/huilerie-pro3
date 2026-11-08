import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";

const sections = [
  {
    ar: "تطبيق Oro Verde الأساسي", fr: "Application Oro Verde — gestion de la maâsra",
    arDescription: "إدارة العمل اليومي للمعصرة ومتابعة الحرفاء والحمولات والعصر.",
    frDescription: "Gérer l’activité quotidienne de la maâsra, les clients, les réceptions d’olives et le pressage.",
    items: [
      ["الرئيسية", "Accueil", "لوحة متابعة مختصرة تعرض نشاط المعصرة ومؤشرات العمل اليومية.", "Tableau de bord présentant l’activité de la maâsra et les principaux indicateurs du jour."],
      ["إضافة حمولة", "Ajouter une réception", "تسجيل وصول حمولة زيتون جديدة وربطها بالحريف وبياناتها قبل بدء العصر.", "Enregistrer l’arrivée d’une nouvelle charge d’olives et l’associer au client avant le pressage."],
      ["البحث", "Recherche", "العثور على حمولة أو سجل سابق باستعمال المعلومات أو الرمز المتاح.", "Retrouver une réception ou un ancien dossier à l’aide des informations ou du code disponible."],
      ["الحمولات", "Réceptions", "متابعة الحمولات المسجلة وحالة كل حمولة ومراحل مرورها بالمعصرة.", "Consulter les réceptions enregistrées, leur statut et les étapes de leur traitement."],
      ["المخبر", "Laboratoire", "تسجيل نتائج التحاليل ومتابعة تحاليل الزيتون أو الزيت.", "Saisir les résultats et suivre les analyses des olives ou de l’huile."],
      ["الحرفاء", "Clients", "إدارة بيانات الحرفاء والرجوع إلى معلوماتهم.", "Gérer les fiches clients et consulter leurs informations."],
      ["التقارير", "Rapports", "عرض ملخصات وتقارير نشاط المعصرة.", "Consulter les synthèses et les rapports d’activité de la maâsra."],
      ["الفواتير", "Factures", "عرض فواتير خدمات العصر ومتابعة المبالغ المسجلة.", "Consulter les factures des prestations de pressage et suivre les montants."],
      ["الرسائل", "Messages", "متابعة سجل الرسائل والإشعارات المرسلة.", "Consulter l’historique des messages et notifications envoyés."],
      ["الإلغاءات", "Annulations", "الاطلاع على العمليات الملغاة وأسباب الإلغاء.", "Consulter les opérations annulées et leurs motifs."],
      ["شاشة التلفاز", "Écran TV", "إدارة المحتوى المعروض على شاشة المعصرة.", "Gérer les contenus affichés sur l’écran de la maâsra."],
      ["الإعدادات", "Paramètres", "ضبط بيانات المعصرة والتعريفة والموسم والمستخدمين والإعدادات المتاحة.", "Configurer les informations de la maâsra, les tarifs, la campagne, les utilisateurs et les autres paramètres."],
    ],
  },
  {
    ar: "قسم GS — الإدارة التجارية", fr: "Module GS — Gestion commerciale",
    arDescription: "إدارة شراء الزيتون والمخزون والإنتاج والجودة والتخزين والبيع والتتبع التجاري.",
    frDescription: "Gérer les achats d’olives, les stocks, la production, la qualité, le stockage, les ventes et la traçabilité.",
    items: [
      ["نظرة عامة", "Vue générale", "ملخص المخزون والكميات وحالة الوحدة التجارية. يمكن اختيار خزان لمراجعة الحركات المرتبطة به.", "Vue synthétique des stocks, des quantités et de l’état du module. Sélectionnez une cuve pour consulter les opérations qui lui sont liées."],
      ["المزوّدون", "Fournisseurs", "تسجيل المزوّدين وإدارة بياناتهم لعمليات شراء الزيتون.", "Enregistrer les fournisseurs et gérer leurs coordonnées pour les achats d’olives."],
      ["شراء الزيتون", "Achats d’olives", "إنشاء عمليات شراء الزيتون وتسجيل الكميات والأسعار واعتماد الاستلام.", "Créer les achats d’olives, saisir les quantités et les prix, puis valider la réception."],
      ["الدفعات", "Lots", "متابعة دفعات الزيتون والزيت وأكواد التتبع والمالك والموقع والرصيد.", "Suivre les lots d’olives et d’huile, leurs codes de traçabilité, propriétaires, emplacements et soldes."],
      ["الجودة", "Qualité", "متابعة التحاليل وقرارات قبول الدفعات أو رفضها. لا تصبح دفعة الزيت جاهزة للبيع قبل اعتماد الجودة.", "Suivre les analyses et les décisions d’acceptation ou de rejet. Un lot d’huile ne devient disponible à la vente qu’après validation qualité."],
      ["الإنتاج", "Production", "تسجيل كمية الزيتون المستهلكة وكمية الزيت الناتجة والخزان الذي استقبل الإنتاج.", "Enregistrer la quantité d’olives consommée, l’huile obtenue et la cuve de réception."],
      ["الحركات", "Mouvements", "عرض حركات دخول المخزون وخروجه وتغيّر كمياته ومواقعه.", "Consulter les entrées, sorties et changements de quantités ou d’emplacements du stock."],
      ["التحويلات", "Transferts", "تسجيل نقل المخزون بين المواقع أو تغيير مالكه مع الاحتفاظ بسجل الحركة.", "Enregistrer le déplacement du stock entre emplacements ou un changement de propriétaire, avec conservation de l’historique."],
      ["المشترون", "Acheteurs", "إدارة المشترين وبياناتهم ومتابعة حساباتهم التجارية.", "Gérer les acheteurs, leurs coordonnées et leurs comptes commerciaux."],
      ["التقارير", "Rapport", "عرض تقرير الحركات والعمليات التجارية لمراجعة ما حدث في المخزون.", "Consulter les mouvements et opérations commerciales pour vérifier l’historique du stock."],
      ["أمانة الحرفاء", "Garde des clients", "تسجيل زيتون يملكه الحريف ويضعه لدى المعصرة، ثم تسجيل الزيت الناتج الذي يبقى ملكًا له. تتيح متابعة الاستلام والتسليم وكشف رصيد الأمانة. ليست عملية شراء ولا بيع ولا تنشئ فاتورة بيع.", "Enregistrer les olives appartenant au client et confiées à la maâsra, puis l’huile obtenue qui reste sa propriété. Suivre les réceptions, les restitutions et le solde en garde. Ce n’est ni un achat ni une vente et aucune facture de vente n’est créée."],
      ["المبيعات", "Ventes", "تسجيل بيع الزيت للمشتري من مخزون المعصرة ومتابعة الكميات والفواتير والمدفوعات والمرتجعات.", "Enregistrer la vente d’huile issue du stock de la maâsra et suivre les quantités, factures, paiements et retours."],
      ["الفواتير", "Factures", "عرض فواتير GS ومتابعة المبالغ المدفوعة والمتبقية وكشوف حساب المشترين.", "Consulter les factures GS, les montants payés ou restants et les relevés des acheteurs."],
      ["الخزانات", "Cuves", "متابعة الخزانات وسعاتها ومخزون الزيت الموجود في كل خزان.", "Suivre les cuves, leurs capacités et les quantités d’huile stockées dans chacune."],
      ["سجل التدقيق", "Audit", "مراجعة سجل العمليات والتعديلات والإلغاءات لمعرفة من قام بالعملية ومتى.", "Consulter l’historique des opérations, modifications et annulations pour savoir qui a effectué chaque action et à quel moment."],
      ["صلاحيات العمال", "Droits des employés", "تحديد ما يمكن لكل عامل الاطلاع عليه أو تسجيله أو تعديله أو اعتماده.", "Définir les informations que chaque employé peut consulter, saisir, modifier ou valider."],
    ],
  },
];

export default function Help() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><CircleHelp className="size-7" /></div>
          <div>
            <h1 className="text-3xl font-bold text-stone-900">مركز المساعدة <span className="text-stone-400">/</span> Centre d’aide</h1>
            <p className="mt-1 text-sm text-stone-600">شرح وظائف التطبيق بالعربية والفرنسية · Guide des fonctions en arabe et en français</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="size-4" /> العودة إلى التطبيق / Retour à l’application
        </Button>
      </div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">
        <div className="mb-1 flex items-center gap-2 font-bold"><BookOpen className="size-5" /> كيف تستعمل هذه الصفحة؟ / Comment utiliser cette page ?</div>
        <p dir="rtl">اختر اسم القسم الذي تريد فهمه واقرأ الشرح بالعربية أو بالفرنسية. أسماء الصفحات مذكورة كما تظهر في التطبيق.</p>
        <p className="mt-1" dir="ltr">Choisissez la rubrique souhaitée et lisez son explication dans la langue de votre choix. Les noms des pages sont repris tels qu’ils apparaissent dans l’application.</p>
      </div>
      {sections.map((section) => (
        <section key={section.ar} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 bg-stone-50 px-5 py-4">
            <h2 className="text-xl font-bold text-stone-900">{section.ar} <span className="text-stone-400">/</span> {section.fr}</h2>
            <p dir="rtl" className="mt-1 text-sm leading-6 text-stone-600">{section.arDescription}</p>
            <p dir="ltr" className="mt-1 text-sm leading-6 text-stone-600">{section.frDescription}</p>
          </div>
          <div className="divide-y divide-stone-100">
            {section.items.map(([arName, frName, arDescription, frDescription]) => (
              <div key={frName} className="grid gap-3 px-5 py-4 md:grid-cols-2 md:gap-6">
                <div dir="rtl" className="text-right">
                  <h3 className="font-semibold text-emerald-900">{arName}</h3>
                  <p className="mt-1 text-sm leading-7 text-stone-700">{arDescription}</p>
                </div>
                <div dir="ltr" className="text-left">
                  <h3 className="font-semibold text-sky-900">{frName}</h3>
                  <p className="mt-1 text-sm leading-7 text-stone-700">{frDescription}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="text-center text-xs leading-6 text-stone-500" dir="rtl">إذا لم تجد وظيفة أو كان الشرح لا يطابق ما يظهر في التطبيق، لا تنفّذ عملية غير واضحة قبل مراجعة المسؤول.</p>
      <p className="text-center text-xs leading-6 text-stone-500" dir="ltr">Si une fonction n’est pas expliquée ou si le comportement affiché est différent, demandez confirmation au responsable avant d’effectuer une opération incertaine.</p>
    </div>
  );
}
