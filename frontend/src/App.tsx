import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Intake from "@/pages/Intake";
import SearchPage from "@/pages/Search";
import Loads from "@/pages/Loads";
import Lab from "@/pages/Lab";
import SettingsPage from "@/pages/Settings";
import Clients from "@/pages/Clients";
import Reports from "@/pages/Reports";
import Certificate from "@/pages/Certificate";
import SmsLog from "@/pages/SmsLog";

export default function App() {
  return (
    <I18nProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/intake" element={<Intake />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/loads" element={<Loads />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/certificate/:id" element={<Certificate />} />
          <Route path="/sms" element={<SmsLog />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors />
    </I18nProvider>
  );
}
