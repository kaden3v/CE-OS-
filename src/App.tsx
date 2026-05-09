import { BrowserRouter, Routes, Route } from "react-router";
import { RouteSyncedErrorBoundary } from "./components/ErrorBoundary";
import { RequireAuth } from "./components/RequireAuth";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import QrGenerator from "./pages/QrGenerator";
import Receiving from "./pages/Receiving";
import Propagation from "./pages/Propagation";
import Cultivars from "./pages/Cultivars";
import Customers from "./pages/Customers";
import Shipping from "./pages/Shipping";
import PrintQueue from "./pages/PrintQueue";
import Listings from "./pages/Listings";
import Expenses from "./pages/Expenses";
import Supplies from "./pages/Supplies";
import Vendors from "./pages/Vendors";
import TaxReport from "./pages/TaxReport";
import Licenses from "./pages/Licenses";
import Settings from "./pages/Settings";
import DevCrash from "./pages/DevCrash";
import DevHistory from "./pages/DevHistory";
import { RequireDeveloperMode } from "./components/RequireDeveloperMode";
import Login from "./pages/Login";
import { AppProvider } from "./contexts/AppContext";
import { AuthProvider } from "./contexts/AuthContext";
import { Toasts } from "./components/ui/Toasts";

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <Toasts />
        <BrowserRouter>
          <RouteSyncedErrorBoundary>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<RequireAuth />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/inventory/qr-codes" element={<QrGenerator />} />
                  <Route path="/receiving" element={<Receiving />} />
                  <Route path="/propagation" element={<Propagation />} />
                  <Route path="/cultivars" element={<Cultivars />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/shipping" element={<Shipping />} />
                  <Route path="/shipping/print-queue" element={<PrintQueue />} />
                  <Route path="/listings" element={<Listings />} />
                  <Route path="/finances/expenses" element={<Expenses />} />
                  <Route path="/finances/supplies" element={<Supplies />} />
                  <Route path="/finances/vendors" element={<Vendors />} />
                  <Route path="/finances/tax-report" element={<TaxReport />} />
                  <Route path="/licenses" element={<Licenses />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route
                    path="/dev/history"
                    element={
                      <RequireDeveloperMode>
                        <DevHistory />
                      </RequireDeveloperMode>
                    }
                  />
                  {import.meta.env.DEV ? (
                    <Route path="/dev/crash" element={<DevCrash />} />
                  ) : null}
                </Route>
              </Route>
            </Routes>
          </RouteSyncedErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </AppProvider>
  );
}
