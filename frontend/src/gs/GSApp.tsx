/**
 * GS frontend — isolated shell. Mount in App.tsx:
 *   import { GSApp } from "@/gs/GSApp";
 *   <Route path="/gs/*" element={<GSApp />} />
 */
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { GSHomePage } from "./pages/HomePage";
import { GSCustomersPage } from "./pages/CustomersPage";
import { GSSuppliersPage } from "./pages/SuppliersPage";
import { GSPurchasesPage } from "./pages/PurchasesPage";
import { GSMaterialsPage } from "./pages/MaterialsPage";
import { GSTanksPage } from "./pages/TanksPage";
import { GSReceptionPage } from "./pages/ReceptionPage";
import { GSSalesPage } from "./pages/SalesPage";
import { GSInvoicesPage } from "./pages/InvoicesPage";

const NAV = [
  { to: "/gs", label: "Accueil", end: true },
  { to: "/gs/purchases", label: "Achats" },
  { to: "/gs/reception", label: "Réception" },
  { to: "/gs/materials", label: "Matériaux" },
  { to: "/gs/tanks", label: "Citernes" },
  { to: "/gs/sales", label: "Ventes" },
  { to: "/gs/invoices", label: "Factures" },
  { to: "/gs/customers", label: "Clients" },
  { to: "/gs/suppliers", label: "Fournisseurs" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Oro Verde · GS</div>
            <div className="text-lg font-bold">Gestion Commerciale</div>
          </div>
          <Link to="/" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-100">Quitter GS</Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map((item) => {
            const active = item.end
              ? loc.pathname === "/gs" || loc.pathname === "/gs/"
              : loc.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to}
                className={"whitespace-nowrap rounded-full px-3 py-1.5 text-sm " + (active ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

export function GSApp() {
  return (
    <Shell>
      <Routes>
        <Route index element={<GSHomePage />} />
        <Route path="customers" element={<GSCustomersPage />} />
        <Route path="suppliers" element={<GSSuppliersPage />} />
        <Route path="purchases" element={<GSPurchasesPage />} />
        <Route path="reception" element={<GSReceptionPage />} />
        <Route path="materials" element={<GSMaterialsPage />} />
        <Route path="tanks" element={<GSTanksPage />} />
        <Route path="sales" element={<GSSalesPage />} />
        <Route path="invoices" element={<GSInvoicesPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </Shell>
  );
}
