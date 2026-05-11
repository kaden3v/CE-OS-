import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import QrGenerator from "./pages/QrGenerator";
import QrAnalytics from "./pages/QrAnalytics";
import MortalityDetail from "./pages/MortalityDetail";
import Receiving from "./pages/Receiving";
import Propagation from "./pages/Propagation";
import Cultivars from "./pages/Cultivars";
import BreedingTracker from "./pages/BreedingTracker";
import CultivarProfit from "./pages/CultivarProfit";
import Customers from "./pages/Customers";
import CustomerThread from "./pages/CustomerThread";
import Shipping from "./pages/Shipping";
import PrintQueue from "./pages/PrintQueue";
import Listings from "./pages/Listings";
import Expenses from "./pages/Expenses";
import Supplies from "./pages/Supplies";
import Vendors from "./pages/Vendors";
import TaxReport from "./pages/TaxReport";
import YearEndSnapshot from "./pages/YearEndSnapshot";
import Form1099K from "./pages/Form1099K";
import Licenses from "./pages/Licenses";
import AuditLog from "./pages/AuditLog";
import Settings from "./pages/Settings";
import { AppProvider } from "./contexts/AppContext";
import { Toaster } from "./components/ui/Toaster";

export default function App() {
  return (
    <AppProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventory/qr-codes" element={<QrGenerator />} />
            <Route path="/inventory/qr-codes/analytics" element={<QrAnalytics />} />
            <Route path="/inventory/:id/mortality" element={<MortalityDetail />} />
            <Route path="/receiving" element={<Receiving />} />
            <Route path="/propagation" element={<Propagation />} />
            <Route path="/cultivars" element={<Cultivars />} />
            <Route path="/cultivars/breeding" element={<BreedingTracker />} />
            <Route path="/cultivars/profit" element={<CultivarProfit />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id/thread" element={<CustomerThread />} />
            <Route path="/shipping" element={<Shipping />} />
            <Route path="/shipping/print-queue" element={<PrintQueue />} />
            <Route path="/listings" element={<Listings />} />
            <Route path="/finances/expenses" element={<Expenses />} />
            <Route path="/finances/supplies" element={<Supplies />} />
            <Route path="/finances/vendors" element={<Vendors />} />
            <Route path="/finances/tax-report" element={<TaxReport />} />
            <Route path="/finances/tax-report/year-end" element={<YearEndSnapshot />} />
            <Route path="/finances/tax-report/year-end/:year" element={<YearEndSnapshot />} />
            <Route path="/finances/tax-report/1099k" element={<Form1099K />} />
            <Route path="/licenses" element={<Licenses />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
