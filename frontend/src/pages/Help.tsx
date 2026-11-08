import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, CircleHelp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const sections = [
  {
    title: "تطبيق Oro Verde الأساسي",
    description: "إدارة العمل اليومي للمعصرة ومتابعة الحرفاء والحمولات والعصر.",
    items: [
      ["الرئيسية", "لوحة متابعة مختصرة تعرض نشاط المعصرة ومؤشرات العمل اليومية."],
      ["إضافة حمولة", "تسجيل وصول حمولة زيتون جديدة، وربطها بالحريف وبياناتها قبل بدء العصر."],
      ["البحث", "العثور على حمولة أو سجل سابق باستعمال المعلومات أو الرمز المتاح."],
      ["الحمولات", "متابعة الحمولات المسجلة وحالة كل حمولة ومراحل مرورها بالمعصرة."],
      ["المخبر", "تسجيل نتائج تحليل الزيتون أو الزيت ومتابعة التحاليل المسجلة."],
      ["الحرفاء", "إدارة بيانات الحرفاء والرجوع إلى معلوماتهم."],
      ["التقارير", "عرض ملخصات وتقارير نشاط المعصرة."],
      ["الفواتير", "عرض فواتير خدمات العصر ومتابعة المبالغ المسجلة."],
      ["الرسائل", "متابعة سجل الرسائل والإشعارات المرسلة."],
      ["الإلغاءات", "الاطلاع على العمليات التي أُلغيت وأسباب الإلغاء."],
      ["شاشة التلفاز", "إدارة المحتوى المعروض على شاشة المعصرة."],
      ["الإعدادات", "ضبط بيانات المعصرة والتعريفة والموسم والمستخدمين والإعدادات المتاحة."],
    ],
  },
  {
    title: "قسم GS — الإدارة التجارية",
    description: "إدارة شراء الزيتون والمخزون والإنتاج والجودة والتخزين والبيع والتتبع التجاري.",
    items: [
      ["Vue générale — النظرة العامة", "ملخص المخزون والكميات وحالة الوحدة التجارية. يمكن اختيار خزان لمراجعة الحركات المرتبطة به."],
      ["Fournisseurs — المزوّدون", "تسجيل المزوّدين وإدارة بياناتهم لاستخدامها في عمليات شراء الزيتون."],
      ["Achats d’olives — شراء الزيتون", "إنشاء عمليات شراء الزيتون من المزوّدين وتسجيل الكميات والأسعار واعتماد الاستلام."],
      ["Lots — الدفعات", "متابعة دفعات الزيتون والزيت وأكواد التتبع والمالك والموقع والرصيد."],
      ["Qualité — الجودة", "متابعة تحاليل الزيت وقرارات قبول الدفعات أو رفضها. لا تصبح دفعة الزيت جاهزة للبيع قبل اعتماد الجودة."],
      ["Production — الإنتاج", "تسجيل كمية الزيتون المستهلكة وكمية الزيت الناتجة والخزان الذي استقبل الإنتاج."],
      ["Mouvements — الحركات", "عرض حركات دخول المخزون وخروجه وتغيّر كمياته ومواقعه."],
      ["Transferts — التحويلات", "تسجيل نقل المخزون بين المواقع أو تغيير مالكه مع الاحتفاظ بسجل الحركة."],
      ["Acheteurs — المشترون", "إدارة المشترين وبياناتهم ومتابعة حساباتهم التجارية."],
      ["Rapport — التقارير", "عرض تقرير الحركات والعمليات التجارية لمراجعة ما حدث في المخزون."],
      ["Garde des clients — أمانات الحرفاء", "تسجيل زيتون يملكه الحريف ويضعه لدى المعصرة، ثم تسجيل الزيت الناتج الذي يبقى ملكًا له. تتيح متابعة الاستلام والتسليم وكشف رصيد الأمانة. هذه العملية ليست شراءً من الحريف ولا بيعًا له، ولا تنشئ فاتورة بيع."],
      ["Ventes — المبيعات", "تسجيل بيع الزيت للمشتري من مخزون المعصرة ومتابعة الكميات والفواتير والمدفوعات والمرتجعات."],
      ["Factures — الفواتير", "عرض فواتير GS ومتابعة المبالغ المدفوعة والمتبقية وكشوف حساب المشترين."],
      ["Cuves — الخزانات", "متابعة الخزانات وسعاتها ومخزون الزيت الموجود في كل خزان."],
      ["Audit — سجل التدقيق", "مراجعة سجل العمليات والتعديلات والإلغاءات لمعرفة من قام بالعملية ومتى."],
      ["Droits des employés — صلاحيات العمال", "تحديد ما يمكن لكل عامل الاطلاع عليه أو تسجيله أو تعديله أو اعتماده."],
    ],
  },
];

export default function Help() {
  const navigate = useNavigate();
  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-6 pb-8 text-right">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><CircleHelp className="size-7" /></div>
          <div>
            <h1 className="text-3xl font-bold text-stone-900">مركز المساعدة</h1>
            <p className="mt-1 text-sm text-stone-600">شرح مبسّط لوظائف صفحات Oro Verde وGS</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => navigate("/")}><ArrowLeft className="size-4" /> العودة إلى التطبيق</Button>
      </div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">
        <div className="mb-1 flex items-center gap-2 font-bold"><BookOpen className="size-5" /> كيف تستعمل هذه الصفحة؟</div>
        اختر اسم القسم الذي تريد فهمه واقرأ الشرح المقابل له. أسماء الصفحات الفرنسية مذكورة كما تظهر في التطبيق لتسهيل العثور عليها.
      </div>
      {sections.map((section) => (
        <section key={section.title} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 bg-stone-50 px-5 py-4">
            <h2 className="text-xl font-bold text-stone-900">{section.title}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">{section.description}</p>
          </div>
          <div className="divide-y divide-stone-100">
            {section.items.map(([name, description]) => (
              <div key={name} className="grid gap-1 px-5 py-3 md:grid-cols-[minmax(180px,0.8fr)_2fr] md:gap-5">
                <h3 className="font-semibold text-emerald-900">{name}</h3>
                <p className="text-sm leading-7 text-stone-700">{description}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="text-center text-xs leading-6 text-stone-500">إذا لم تجد وظيفة أو كان الشرح لا يطابق ما يظهر في التطبيق، لا تنفّذ عملية غير واضحة قبل مراجعة المسؤول.</p>
    </div>
  );
}
