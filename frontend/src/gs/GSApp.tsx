import { Routes, Route, Navigate } from "react-router-dom";
import { GSShell } from "./GSShell";
import { GSHomePage } from "./pages/HomePage";
import { GSCustomersPage } from "./pages/CustomersPage";
import { GSSuppliersPage } from "./pages/SuppliersPage";
import { GSPurchasesPage } from "./pages/PurchasesPage";
import { GSMaterialsPage } from "./pages/MaterialsPage";
import { GSTanksPage } from "./pages/TanksPage";
import { GSReceptionPage } from "./pages/ReceptionPage";
import { GSSalesPage } from "./pages/SalesPage";
import { GSInvoicesPage } from "./pages/InvoicesPage";

export function GSApp() {
  return (
    <GSShell>
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
    </GSShell>
  );
}
