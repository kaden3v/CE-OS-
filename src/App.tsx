import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { lazy, Suspense } from "react";
import { Layout } from "./components/Layout";

// Routes are code-split: each page is its own chunk, fetched on first visit.
// Keeps the initial bundle small (recharts/qrcode/etc. no longer load up front).
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Orders = lazy(() => import("./pages/Orders"));
const Inventory = lazy(() => import("./pages/Inventory"));
const QrGenerator = lazy(() => import("./pages/QrGenerator"));
const Propagation = lazy(() => import("./pages/Propagation"));
const Capacity = lazy(() => import("./pages/Capacity"));
const Cultivars = lazy(() => import("./pages/Cultivars"));
const CultivarProfit = lazy(() => import("./pages/CultivarProfit"));
const Customers = lazy(() => import("./pages/Customers"));
const Shipping = lazy(() => import("./pages/Shipping"));
const PrintQueue = lazy(() => import("./pages/PrintQueue"));
const Listings = lazy(() => import("./pages/Listings"));
const FinancesOverview = lazy(() => import("./pages/FinancesOverview"));
const FinancesManage = lazy(() => import("./pages/FinancesManage"));
const Revenue = lazy(() => import("./pages/Revenue"));
const Mileage = lazy(() => import("./pages/Mileage"));
const Reports = lazy(() => import("./pages/Reports"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Production = lazy(() => import("./pages/Production"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const Supplies = lazy(() => import("./pages/Supplies"));
const Vendors = lazy(() => import("./pages/Vendors"));
const VendorDetail = lazy(() => import("./pages/VendorDetail"));
const Licenses = lazy(() => import("./pages/Licenses"));
const Team = lazy(() => import("./pages/Team"));
const Activity = lazy(() => import("./pages/Activity"));
const Import = lazy(() => import("./pages/Import"));
const Settings = lazy(() => import("./pages/Settings"));
const SignIn = lazy(() => import("./pages/SignIn"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AccessRequests = lazy(() => import("./pages/AccessRequests"));
import { FinancesLayout } from "./components/FinancesLayout";
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
            <Suspense fallback={<div className="h-dvh w-full bg-bg-base" />}>
            <Routes>
              <Route path="/sign-in" element={<SignIn />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<RequireAuth><Layout /></RequireAuth>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/inventory/qr-codes" element={<QrGenerator />} />
                <Route path="/propagation" element={<Propagation />} />
                <Route path="/propagation/capacity" element={<Capacity />} />
                <Route path="/cultivars" element={<Cultivars />} />
                <Route path="/cultivars/profit" element={<RequireManager><CultivarProfit /></RequireManager>} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/shipping" element={<Shipping />} />
                <Route path="/shipping/print-queue" element={<PrintQueue />} />
                <Route path="/listings" element={<Listings />} />
                {/* One sidebar entry; all finance sub-views are in-page tabs under FinancesLayout. */}
                <Route path="/finances" element={<RequireManager><FinancesLayout /></RequireManager>}>
                  <Route index element={<FinancesOverview />} />
                  <Route path="revenue" element={<Revenue />} />
                  <Route path="expenses" element={<Expenses />} />
                  <Route path="production" element={<Production />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="manage" element={<FinancesManage />} />
                  <Route path="subscriptions" element={<Subscriptions />} />
                  <Route path="supplies" element={<Supplies />} />
                  <Route path="vendors" element={<Vendors />} />
                  <Route path="vendors/:id" element={<VendorDetail />} />
                  <Route path="mileage" element={<Mileage />} />
                  <Route path="tax-report" element={<Navigate to="/finances/reports?tab=tax" replace />} />
                </Route>
                <Route path="/licenses" element={<RequireManager><Licenses /></RequireManager>} />
                <Route path="/team" element={<Team />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/import" element={<RequireManager><Import /></RequireManager>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin/access-requests" element={<RequireAdmin><AccessRequests /></RequireAdmin>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
