import { useMemo, useState, FormEvent } from "react";
import { Car, Plus, Trash2, Check, Pencil, MapPin, Bookmark } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { EmptyState, LoadingTable } from "@/components/ui/StateRenderer";
import { useEntity } from "@/hooks/useEntity";
import { useApp } from "@/contexts/AppContext";
import { friendlyDbError } from "@/lib/dbErrors";
import { formatBusinessDate, todayISO, isoYear, currentYear } from "@/lib/dates";
import type { Tables } from "@/lib/database.types";

type Trip = Tables<"mileage_log">;
type Route = Tables<"mileage_routes">;
type Settings = Tables<"finance_settings">;

const PURPOSE_PRESETS = ["Post office run", "Supply pickup", "Other"];

export default function Mileage() {
  const { addToast } = useApp();
  const { data: trips, add: addTrip, remove: removeTrip, isLoading } = useEntity<Trip>("mileage_log", [], { orderBy: "trip_date" });
  const { data: routes, add: addRoute, remove: removeRoute } = useEntity<Route>("mileage_routes", [], { orderBy: "created_at", ascending: true });
  const { data: settingsRows, update: updateSettings } = useEntity<Settings>("finance_settings", []);
  const settings = settingsRows[0];
  const rateCents = settings?.mileage_rate_cents ?? 70;

  const [tripOpen, setTripOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [rateDraft, setRateDraft] = useState(String(rateCents));

  const [tripForm, setTripForm] = useState({ trip_date: todayISO(), miles: "", purpose: "Post office run", round_trip: true });
  const [routeForm, setRouteForm] = useState({ name: "", miles: "", round_trip: true });

  const stats = useMemo(() => {
    const yr = currentYear();
    const ytdMiles = trips.filter((t) => isoYear(t.trip_date) === yr).reduce((s, t) => s + Number(t.miles), 0);
    return { ytdMiles, deduction: (ytdMiles * rateCents) / 100 };
  }, [trips, rateCents]);

  const logTrip = async (trip_date: string, miles: number, purpose: string, round_trip: boolean) => {
    if (!(miles > 0)) { addToast({ title: "Miles required", status: "warn" }); return false; }
    const r = await addTrip({
      id: crypto.randomUUID(), trip_date, miles, purpose: purpose.trim() || null, round_trip,
      created_at: new Date().toISOString(),
    } as Trip);
    if (r.ok === false) { addToast({ title: "Couldn't log trip", description: friendlyDbError({ code: r.code } as any), status: "alert" }); return false; }
    return true;
  };

  const submitTrip = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await logTrip(tripForm.trip_date, Number(tripForm.miles), tripForm.purpose, tripForm.round_trip);
    if (!ok) return;
    setTripOpen(false);
    setTripForm({ trip_date: todayISO(), miles: "", purpose: "Post office run", round_trip: true });
    addToast({ title: "Trip logged", description: `${tripForm.miles} mi`, status: "ok" });
  };

  const logRoute = async (route: Route) => {
    const ok = await logTrip(todayISO(), Number(route.miles), route.name, route.round_trip);
    if (ok) addToast({ title: "Logged", description: `${route.name} · ${route.miles} mi`, status: "ok" });
  };

  const submitRoute = async (e: FormEvent) => {
    e.preventDefault();
    const name = routeForm.name.trim();
    const miles = Number(routeForm.miles);
    if (!name || !(miles > 0)) { addToast({ title: "Name and miles required", status: "warn" }); return; }
    const r = await addRoute({ id: crypto.randomUUID(), name, miles, round_trip: routeForm.round_trip, created_at: new Date().toISOString() } as Route);
    if (r.ok === false) { addToast({ title: "Couldn't save route", description: friendlyDbError({ code: r.code } as any), status: "alert" }); return; }
    setRouteOpen(false);
    setRouteForm({ name: "", miles: "", round_trip: true });
    addToast({ title: "Route saved", description: name, status: "ok" });
  };

  const saveRate = async () => {
    if (!settings) { addToast({ title: "Settings not found", status: "warn" }); return; }
    const cents = Math.round(Number(rateDraft));
    if (!(cents > 0)) return;
    const r = await updateSettings(settings.id, { mileage_rate_cents: cents } as Partial<Settings>);
    if (!r.ok) { addToast({ title: "Couldn't save rate", status: "alert" }); return; }
    setEditingRate(false);
    addToast({ title: "Mileage rate updated", description: `${cents}¢/mi`, status: "ok" });
  };

  const deleteTrip = async (t: Trip) => {
    if (!confirm("Delete this trip?")) return;
    await removeTrip(t.id);
    addToast({ title: "Trip deleted", status: "info" });
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2"><Car className="w-6 h-6 text-text-secondary" /> Mileage</h1>
          <p className="text-sm text-text-secondary">Log deductible business trips for your Schedule C.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRouteOpen(true)}><Bookmark className="w-4 h-4" /> Add Route</Button>
          <Button variant="brand" onClick={() => setTripOpen(true)}><Plus className="w-4 h-4" /> Log Miles</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6 mb-6">
        <StatTile label="Miles YTD" value={stats.ytdMiles.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
        <StatTile label="Deduction estimate YTD" value={`$${stats.deduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        <Card className="bg-bg-elevated backdrop-blur-md rounded-[16px] border border-border-subtle p-6 flex flex-col">
          <div className="flex items-start justify-between mb-2">
            {editingRate ? (
              <div className="flex items-center gap-2">
                <Input type="number" min="0" className="w-20" value={rateDraft} onChange={(e) => setRateDraft(e.target.value)} />
                <span className="text-sm text-text-secondary">¢/mi</span>
                <button onClick={saveRate} aria-label="Save" className="p-1 rounded text-status-ok hover:bg-bg-active"><Check className="w-4 h-4" /></button>
              </div>
            ) : (
              <h3 className="text-4xl font-semibold tabular-nums">{rateCents}¢<span className="text-lg text-text-secondary">/mi</span></h3>
            )}
            {!editingRate && (
              <button onClick={() => { setRateDraft(String(rateCents)); setEditingRate(true); }} aria-label="Edit rate" className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-active"><Pencil className="w-4 h-4" /></button>
            )}
          </div>
          <p className="text-xs text-text-secondary uppercase tracking-wide">IRS rate · changes yearly</p>
        </Card>
      </div>

      {/* Saved routes */}
      {routes.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wide text-text-secondary"><MapPin className="w-3.5 h-3.5" /> Saved routes · one tap to log</div>
          <div className="flex gap-2 flex-wrap">
            {routes.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated pl-3 pr-1.5 py-1.5">
                <button onClick={() => logRoute(r)} className="text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-text-secondary ml-2 tabular-nums">{Number(r.miles)} mi{r.round_trip ? " ↺" : ""}</span>
                </button>
                <button onClick={() => removeRoute(r.id)} aria-label="Delete route" className="p-1 rounded text-text-tertiary hover:text-status-alert"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Card className="flex-1 overflow-auto flex flex-col mb-12">
        {isLoading ? (
          <LoadingTable cols={5} rows={6} />
        ) : trips.length === 0 ? (
          <EmptyState icon={Car} title="No trips logged" description="Log a business trip or save a route for one-tap logging." action={<Button variant="outline" onClick={() => setTripOpen(true)}>Log Miles</Button>} />
        ) : (
          <table className="w-full min-w-max text-sm text-left">
            <thead className="text-[12px] uppercase tracking-wide text-text-secondary sticky top-0 bg-bg-base/95 backdrop-blur-md z-10 border-b border-border-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium text-right">Miles</th>
                <th className="px-3 py-2 font-medium">Trip</th>
                <th className="px-3 py-2 font-medium text-right">Est. deduction</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className="border-b border-border-subtle/50 last:border-0 hover:bg-bg-hover/50">
                  <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatBusinessDate(t.trip_date)}</td>
                  <td className="px-3 py-2">{t.purpose ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{Number(t.miles)}</td>
                  <td className="px-3 py-2">{t.round_trip ? <Badge variant="outline">Round trip</Badge> : <span className="text-text-tertiary text-xs">One way</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">${((Number(t.miles) * rateCents) / 100).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => deleteTrip(t)} aria-label="Delete" className="p-1.5 rounded text-text-secondary hover:text-status-alert hover:bg-bg-active"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Log trip modal */}
      <Modal open={tripOpen} onClose={() => setTripOpen(false)} title="Log Miles" size="sm">
        <form onSubmit={submitTrip} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Date</label>
              <Input type="date" value={tripForm.trip_date} onChange={(e) => setTripForm({ ...tripForm, trip_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Miles *</label>
              <Input type="number" step="0.1" min="0" required placeholder="0" value={tripForm.miles} onChange={(e) => setTripForm({ ...tripForm, miles: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Purpose</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PURPOSE_PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setTripForm({ ...tripForm, purpose: p })} className={`text-xs px-2 py-1 rounded border transition-colors ${tripForm.purpose === p ? "border-accent-brand text-accent-brand bg-accent-brand-dim" : "border-border-subtle text-text-secondary hover:bg-bg-hover"}`}>{p}</button>
              ))}
            </div>
            <Input placeholder="Purpose" value={tripForm.purpose} onChange={(e) => setTripForm({ ...tripForm, purpose: e.target.value })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5">
            <span className="text-sm">Round trip</span>
            <Toggle checked={tripForm.round_trip} onChange={(v) => setTripForm({ ...tripForm, round_trip: v })} ariaLabel="Round trip" />
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
            <Button variant="ghost" type="button" onClick={() => setTripOpen(false)}>Cancel</Button>
            <Button type="submit">Log Trip</Button>
          </div>
        </form>
      </Modal>

      {/* Add route modal */}
      <Modal open={routeOpen} onClose={() => setRouteOpen(false)} title="Save a Route" size="sm">
        <form onSubmit={submitRoute} className="p-4 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Route name *</label>
            <Input required placeholder="e.g. Post office" value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Miles *</label>
            <Input type="number" step="0.1" min="0" required placeholder="4.2" value={routeForm.miles} onChange={(e) => setRouteForm({ ...routeForm, miles: e.target.value })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5">
            <span className="text-sm">Round trip</span>
            <Toggle checked={routeForm.round_trip} onChange={(v) => setRouteForm({ ...routeForm, round_trip: v })} ariaLabel="Round trip" />
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle">
            <Button variant="ghost" type="button" onClick={() => setRouteOpen(false)}>Cancel</Button>
            <Button type="submit">Save Route</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
