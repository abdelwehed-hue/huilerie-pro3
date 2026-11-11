import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, ChartColumnIncreasing, Clock3, Droplets, FileText, FlaskConical, Leaf, PackagePlus, Search, ShoppingBasket, Sun, UserRound, Warehouse, ScanLine, ReceiptText, Users, Calculator, Tv, Cog } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AppSettings, Load, Stats } from "@/lib/types";
import { fmtMoney, fmtNum, useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { CodeBadge, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import IntakePanel from "@/components/IntakePanel";
import QrScanDialog from "@/components/QrScanDialog";

function Metric({ title, value, unit, icon, tone, note }: { title: string; value: React.ReactNode; unit?: string; icon: React.ReactNode; tone: string; note: string }) {
  return <article className={`home-metric home-metric--${tone}`}>
    <div className="home-metric__icon">{icon}</div>
    <div className="min-w-0 flex-1">
      <div className="home-metric__label">{title}</div>
      <div className="home-metric__value" dir="ltr">{value}{unit && <small> {unit}</small>}</div>
      <div className="home-metric__note">{note}</div>
    </div>
    <ChartColumnIncreasing className="home-metric__watermark" />
  </article>;
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const me = useMe();
  const navigate = useNavigate();
  const isAdmin = me.data?.role === "admin";
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [code, setCode] = useState("");
  const closeScan = useCallback(() => setScanOpen(false), []);
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => apiGet<Stats>("/stats") });
  const loads = useQuery({ queryKey: ["loads", "", ""], queryFn: () => apiGet<Load[]>("/loads") });
  const mill = useQuery({ queryKey: ["mill"], queryFn: () => apiGet<AppSettings>("/settings") });
  const invoices = useQuery({ queryKey: ["invoices", "load-links"], queryFn: () => apiGet<Array<{ id: string; load_id: string; number: string }>>("/invoices") });
  const s = stats.data;
  const allLoads = loads.data ?? [];
  const todayLoads = useMemo(() => allLoads.filter((l) => s && l.day === s.today), [allLoads, s?.today]);
  const invoiceByLoad = useMemo(() => new Map((invoices.data ?? []).map((invoice) => [invoice.load_id, invoice])), [invoices.data]);
  const recent = useMemo(() => [...allLoads].sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,5), [allLoads]);
  const daily = (s?.daily ?? []).slice(-7);
  const maxDaily = Math.max(1, ...daily.map(p => p.oil_kg));
  const heroImage = mill.data?.login_image || mill.data?.tv_image || "";
  const millName = mill.data?.mill_name || "Oro Verde";
  const dateLabel = new Intl.DateTimeFormat(lang === "ar" ? "ar-TN" : "fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());

  return <div className="mx-auto max-w-[1600px] dashboard-home dashboard-home--premium home-redesign">
    <section className="home-hero" style={heroImage ? { backgroundImage: `linear-gradient(90deg,rgba(17,43,18,.83),rgba(20,47,20,.30) 58%,rgba(20,47,20,.04)),url("${heroImage}")` } : undefined}>
      <div className="home-brand">
        <div className="home-brand__mark"><Leaf /></div>
        <div><div className="home-brand__name">{millName}</div><div className="home-brand__tag">Huilerie Moderne</div></div>
      </div>
      <div className="home-hero__tools">
        <span className="home-date"><CalendarDays size={18}/>{dateLabel}</span>
        <Link to="/settings" aria-label="Paramètres" className="home-round-tool"><Sun size={22}/></Link>
        <span className="home-round-tool"><UserRound size={22}/></span>
      </div>
      <div className="home-hero__message">
        <h1>Bienvenue sur <em>{millName}</em></h1>
        <p>Tradition et qualité<br/>au service de votre huile d’olive</p>
        <div className="home-hero__actions"><Button onClick={() => setIntakeOpen(true)} className="home-hero__cta"><PackagePlus size={19}/>{t("new_reception")}</Button><form className="home-hero__search" onSubmit={(e) => { e.preventDefault(); const value = code.trim(); if (value) navigate(/^\\d{10}$/.test(value) ? `/search?code=${value}` : `/search?q=${encodeURIComponent(value)}`); }}><Input value={code} onChange={e => setCode(e.target.value)} placeholder={lang === "ar" ? "ابحث عن كود أو حريف" : "Code ou nom du client"} aria-label="Recherche rapide"/><button type="submit" aria-label="Rechercher"><Search size={18}/></button><button type="button" onClick={() => setScanOpen(true)} aria-label={t("scan_qr")}><ScanLine size={18}/></button></form></div>
      </div>
      {!heroImage && <div className="home-hero__olive-art" aria-hidden="true"><span>🌿</span><span>🫒</span></div>}
    </section>

    <section className="home-metrics" aria-label="Indicateurs">
      <Metric title={t("olive_today")} value={fmtNum(s?.olive_kg_today)} unit="kg" icon={<Leaf/>} tone="green" note={`${fmtNum(s?.loads_today)} ${t("today_arrivals").toLowerCase()}`}/>
      <Metric title={t("oil_today")} value={fmtNum(s?.oil_kg_today)} unit="L" icon={<Droplets/>} tone="gold" note={`${fmtNum(s?.avg_yield)}% rendement moyen`}/>
      <Metric title={lang === "ar" ? "حمولات قيد الانتظار" : "Réceptions en attente"} value={fmtNum(s?.pending)} icon={<ShoppingBasket/>} tone="forest" note={`${fmtNum(s?.non_terminated)} ${lang === "ar" ? "عملية غير منتهية" : "opérations en cours"}`}/>
      <Metric title={lang === "ar" ? "المداخيل اليوم" : "Revenus du jour"} value={isAdmin ? fmtMoney(s?.revenue_today) : "—"} unit={isAdmin ? "TND" : undefined} icon={<ReceiptText/>} tone="olive" note={isAdmin ? (lang === "ar" ? "حسب الفواتير المسجلة" : "Selon les factures enregistrées") : t("admin_only")}/>
    </section>

    <section className="home-lower-grid">
      <article className="home-panel home-activity">
        <header className="home-panel__header"><div className="home-panel__title"><Leaf/><h2>{lang === "ar" ? "النشاط الأخير" : "Activité récente"}</h2></div><Link to="/loads" className="home-view-all">{lang === "ar" ? "عرض الكل" : "Voir tout"} <ArrowRight size={16}/></Link></header>
        <div className="home-activity__list">
          {recent.length === 0 && <p className="home-empty">{t("no_data")}</p>}
          {recent.map((load, index) => {
            const invoice = invoiceByLoad.get(load.id);
            const label = load.lab ? (lang === "ar" ? "تحليل الجودة" : "Analyse qualité") : load.oil_kg != null ? (lang === "ar" ? "إنتاج الزيت" : "Production d’huile") : (lang === "ar" ? "استلام زيتون" : "Réception d’olives");
            const Icon = load.lab ? FlaskConical : load.oil_kg != null ? Droplets : ShoppingBasket;
            return <Link to={`/search?code=${encodeURIComponent(load.code)}`} key={load.id} className="home-activity__item">
              <span className={`home-activity__icon home-activity__icon--${index % 4}`}><Icon size={20}/></span>
              <span className="home-activity__body"><strong>{label}</strong><small>{load.code} — {load.oil_kg != null ? `${fmtNum(load.oil_kg)} L` : `${fmtNum(load.olive_kg)} kg`}</small></span>
              <span className="home-activity__time">{new Intl.DateTimeFormat(lang === "ar" ? "ar-TN" : "fr-FR", {hour:"2-digit",minute:"2-digit"}).format(new Date(load.created_at))}{invoice && <small>{invoice.number}</small>}</span>
            </Link>;
          })}
        </div>
      </article>

      <article className="home-panel home-charts">
        <header className="home-panel__header"><div className="home-panel__title"><ChartColumnIncreasing/><h2>{lang === "ar" ? "الإحصائيات" : "Graphiques"}</h2></div><span className="home-season">{lang === "ar" ? "هذا الموسم" : "Cette saison"} · {s?.season ?? "—"}</span></header>
        <div className="home-chart-content">
          <div className="home-bar-chart">
            <h3>{lang === "ar" ? "إنتاج الزيت (L)" : "Production d’huile (L)"}</h3>
            <div className="home-bars">
              {daily.length ? daily.map((point) => <div className="home-bar-col" key={point.day}><span className="home-bar-value">{fmtNum(point.oil_kg)}</span><div className="home-bar" style={{height:`${Math.max(5, point.oil_kg/maxDaily*100)}%`}}/><small>{new Intl.DateTimeFormat(lang === "ar" ? "ar-TN" : "fr-FR", {day:"2-digit",month:"short"}).format(new Date(point.day+"T12:00:00"))}</small></div>) : <p className="home-empty">{t("no_data")}</p>}
            </div>
          </div>
          <div className="home-season-summary">
            <h3>{lang === "ar" ? "ملخص الموسم" : "Bilan de la saison"}</h3>
            <div className="home-donut"><div><strong>{fmtNum(s?.loads_total)}</strong><small>{lang === "ar" ? "حمولة" : "réceptions"}</small></div></div>
            <div className="home-legend"><span><i/> {lang === "ar" ? "الزيتون" : "Olives reçues"} <b>{fmtNum(s?.olive_kg_total)} kg</b></span><span><i/> {lang === "ar" ? "الزيت" : "Huile produite"} <b>{fmtNum(s?.oil_kg_total)} L</b></span></div>
          </div>
        </div>
      </article>
    </section>

    <section className="home-shortcuts">
      <Link to="/clients"><Users/><span>Clients</span></Link>
      <Link to="/factures"><FileText/><span>Factures</span></Link>
      <Link to="/reports"><Calculator/><span>Comptabilité</span></Link>
      <button onClick={() => setIntakeOpen(true)}><ShoppingBasket/><span>Achat d’olives</span></button>
      <Link to="/loads"><Droplets/><span>Production</span></Link>
      <Link to="/commercial"><Warehouse/><span>GS</span></Link>
      <Link to="/tv-admin"><Tv/><span>Écran TV</span></Link>
      <Link to="/settings"><Cog/><span>Paramètres</span></Link>
    </section>

    <h2 className="dashboard-home__section-title sr-only">{t("today_arrivals")}</h2>
    <div className="home-today-table">
      <div className="home-panel__header"><div className="home-panel__title"><Clock3/><h2>{t("today_arrivals")}</h2></div><span className="home-season">{fmtNum(todayLoads.length)} {lang === "ar" ? "اليوم" : "aujourd’hui"}</span></div>
      <div className="overflow-x-auto"><Table data-testid="today-arrivals-table"><TableHeader><TableRow><TableHead>{t("code")}</TableHead><TableHead>{t("client")}</TableHead><TableHead>{t("olive_kg")}</TableHead><TableHead>{t("oil_kg")}</TableHead><TableHead>{t("status")}</TableHead></TableRow></TableHeader><TableBody>
        {todayLoads.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center">{t("no_data")}</TableCell></TableRow>}
        {todayLoads.slice(0,5).map(load => <TableRow key={load.id}><TableCell><Link to={`/search?code=${load.code}`}><CodeBadge code={load.code}/></Link></TableCell><TableCell>{load.client_name}</TableCell><TableCell>{fmtNum(load.olive_kg)} kg</TableCell><TableCell>{load.oil_kg == null ? "—" : `${fmtNum(load.oil_kg)} L`}</TableCell><TableCell><StatusPill status={load.status} size="large"/></TableCell></TableRow>)}
      </TableBody></Table></div>
    </section>

    <Sheet open={intakeOpen} onOpenChange={setIntakeOpen}><SheetContent side="right" className="w-full overflow-y-auto bg-[#F9F8F3] p-4 sm:max-w-lg" data-testid="new-reception-sheet"><SheetTitle className="mb-2 font-heading text-lg">{t("new_reception")}</SheetTitle><div className="origin-top-left" style={{zoom:0.82}}><IntakePanel stacked/></div></SheetContent></Sheet>
    <QrScanDialog open={scanOpen} onClose={closeScan}/>
  </div>;
}
