import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import QrGenerator from "./pages/QrGenerator";
import Propagation from "./pages/Propagation";
import Cultivars from "./pages/Cultivars";
import CultivarProfit from "./pages/CultivarProfit";
import Customers from "./pages/Customers";
import Shipping from "./pages/Shipping";
import PrintQueue from "./pages/PrintQueue";
import Listings from "./pages/Listings";
import Expenses from "./pages/Expenses";
import Production from "./pages/Production";
import Supplies from "./pages/Supplies";
import Vendors from "./pages/Vendors";
import TaxReport from "./pages/TaxReport";
import Licenses from "./pages/Licenses";
import Team from "./pages/Team";
import Activity from "./pages/Activity";
import Import from "./pages/Import";
import Settings from "./pages/Settings";
import SignIn from "./pages/SignIn";
import ResetPassword from "./pages/ResetPassword";
import Welcome from "./pages/Welcome";
import AccessRequests from "./pages/AccessRequests";
import { AppProvider } from "./contexts/AppContext";
import { AuthProvider, RequireAuth, RequireAdmin, RequireManager } from "./contexts/AuthContext";
import { Toasts } from "./components/ui/Toasts";
import { CommandPalette } from "./components/ui/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppProvider>
          <Toasts />
          <BrowserRouter>
            <CommandPalette />
            <Routes>
              <Route path="/sign-in" element={<SignIn />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/welcome" element={<RequireAuth><Welcome /></RequireAuth>} />
              <Route element={<RequireAuth><Layout /></RequireAuth>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/inventory/qr-codes" element={<QrGenerator />} />
                <Route path="/propagation" element={<Propagation />} />
                <Route path="/cultivars" element={<Cultivars />} />
                <Route path="/cultivars/profit" element={<RequireManager><CultivarProfit /></RequireManager>} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/shipping" element={<Shipping />} />
                <Route path="/shipping/print-queue" element={<PrintQueue />} />
                <Route path="/listings" element={<Listings />} />
                <Route path="/finances/expenses" element={<RequireManager><Expenses /></RequireManager>} />
                <Route path="/finances/supplies" element={<RequireManager><Supplies /></RequireManager>} />
                <Route path="/finances/production" element={<RequireManager><Production /></RequireManager>} />
                <Route path="/finances/vendors" element={<RequireManager><Vendors /></RequireManager>} />
                <Route path="/finances/tax-report" element={<RequireManager><TaxReport /></RequireManager>} />
                <Route path="/licenses" element={<RequireManager><Licenses /></RequireManager>} />
                <Route path="/team" element={<Team />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/import" element={<RequireManager><Import /></RequireManager>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin/access-requests" element={<RequireAdmin><AccessRequests /></RequireAdmin>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
