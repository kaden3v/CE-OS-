import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Target, TrendingUp, Info, Check, AlertTriangle, Gauge } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { EmptyState, ErrorState } from "@/components/ui/StateRenderer";
import { PeriodToggle } from "@/components/finances/PeriodToggle";
import { PaceBar, PACE_STATUS_LABEL, PACE_SEV_TEXT, PACE_SEV_BAR } from "@/components/finances/PaceBar";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { formatMoney } from "@/lib/format";
import { businessMonthShort, todayISO } from "@/lib/dates";
import type { FinancePeriod } from "@/lib/financeReports";
import { useRevenueGoals } from "@/hooks/useRevenueGoals";
import {
  computeGoalPace, paceSeverity, periodBounds, periodStartFor, periodTypeFor,
} from "@/lib/revenueGoals";

const n = (v: unknown) => Number(v ?? 0);
const yTick = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);

export default function Goals() {
  const [period, setPeriod] = useState<FinancePeriod>("month");
  const { addToast } = useApp();
  const {
    series, current, prior, loadingKpis, loadingSeries, kpiError, seriesError, goalFor, saveGoal, refresh,
  } = useRevenueGoals(period);

  const periodType = periodTypeFor(period);
  const periodStart = periodStartFor(period);
  const periodLabel = period === "ytd" ? "this year" : period === "quarter" ? "this quarter" : "this month";
  const goal = goalFor(periodType, periodStart);
  // All three targets, surfaced together so it's clear which exist and that a
  // broader target pro-rates (quarterly ÷3, annual ÷12) onto months without their own.
  const monthlyGoal = goalFor("monthly", periodStartFor("month"));
  const quarterGoal = goalFor("quarterly", periodStartFor("quarter"));
  const annualGoal = goalFor("annual", periodStartFor("ytd"));

  // Draft target for the editor; reset whenever the active goal or period changes,
  // but never while the user is actively typing (a teammate's edit could otherwise
  // refetch and clobber the in-progress value).
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const editingRef = useRef(false);
  useEffect(() => {
    if (editingRef.current) return;
    setDraft(goal ? String(goal.target_amount) : "");
  }, [goal?.id, goal?.target_amount, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const bounds = periodBounds(period);
  const actuals = {
    actualNet: n(current?.net_revenue),
    actualGross: n(current?.gross_sales),
    priorNet: prior ? n(prior.net_revenue) : null,
    periodStartISO: bounds.startISO,
    periodEndISO: bounds.endISO,
    todayISO: todayISO(),
  };

  const pace = computeGoalPace({ target: goal?.target_amount ?? null, ...actuals });
  const draftNum = Number(draft) || 0;
  const draftPace = computeGoalPace({ target: draftNum || null, ...actuals });
  const sev = paceSeverity(pace);
  const dirty = draft.trim() !== "" && draftNum !== (goal?.target_amount ?? 0);

  const chartData = useMemo(
    () => series.map((p, i, arr) => ({
      label: businessMonthShort(p.month),
      net: n(p.actual_net),
      gross: n(p.actual_gross),
      goal: p.goal == null ? null : n(p.goal),
      isCurrent: i === arr.length - 1, // most recent month = current (month-to-date)
    })),
    [series],
  );
  const hasSeries = chartData.some((d) => d.net !== 0 || d.gross !== 0 || d.goal != null);
  const tableRows = useMemo(() => [...series].reverse(), [series]);

  const loading = loadingKpis;
  const money = (x: number) => (loading ? "—" : formatMoney(x));
  // Early in a period the linear projection is too noisy (and seasonally
  // misleading) to assert ahead/behind, so hold the headline neutral.
  const earlyUnconfident = pace.hasGoal && !pace.confident;
  // While KPIs load, also keep the hero neutral so it never flashes a red
  // "Behind pace" derived from not-yet-loaded (zeroed) actuals.
  const displaySev = loading || earlyUnconfident ? "none" : sev;
  const showPace = !loading && pace.hasGoal;

  async function onSave() {
    setSaving(true);
    const res = await saveGoal(periodType, periodStart, draftNum);
    setSaving(false);
    addToast(
      res.ok
        ? { title: "Goal saved", description: `${period === "ytd" ? "Annual" : period === "quarter" ? "Quarterly" : "Monthly"} target set to ${formatMoney(draftNum)}`, status: "ok" }
        : { title: "Couldn't save goal", description: "Please try again.", status: "alert" },
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2"><Target className="w-6 h-6 text-text-secondary" /> Revenue Goals</h1>
          <p className="text-sm text-text-secondary">Set targets, track your pace, and see what it takes to finish {periodLabel} on goal.</p>
        </div>
        <PeriodToggle<FinancePeriod>
          period={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "This month" },
            { value: "quarter", label: "This quarter" },
            { value: "ytd", label: "Year to date" },
          ]}
        />
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 mb-6 text-sm text-text-secondary">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-status-info" />
        <span>Goals track <span className="text-text-primary">net revenue</span> — product sales after estimated marketplace fees. Gross sales are shown alongside.</span>
      </div>

      {kpiError && !loading && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-status-alert/30 bg-status-alert/10 px-4 py-3 mb-6 text-sm">
          <span className="flex items-center gap-2 text-text-primary"><AlertTriangle className="w-4 h-4 text-status-alert shrink-0" /> Couldn't load the latest revenue data.</span>
          <Button size="sm" variant="outline" onClick={refresh}>Retry</Button>
        </div>
      )}

      {/* Pace hero + KPI tiles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-6 mb-6">
        <Card className="lg:col-span-1 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {displaySev === "ok" ? <Check className={cn("w-5 h-5", PACE_SEV_TEXT[displaySev])} />
                : displaySev === "none" ? <Gauge className="w-5 h-5 text-text-secondary" />
                : <AlertTriangle className={cn("w-5 h-5", PACE_SEV_TEXT[displaySev])} />}
              <span className={cn("text-lg font-semibold", PACE_SEV_TEXT[displaySev])}>
                {loading ? "Calculating pace…" : earlyUnconfident ? "Tracking" : PACE_STATUS_LABEL[pace.status]}
              </span>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              {loading
                ? "Pulling your latest revenue…"
                : !pace.hasGoal
                  ? `Set a target for ${periodLabel} to start tracking pace.`
                  : earlyUnconfident
                    ? `Early in ${periodLabel}: you're at ${formatMoney(pace.actualNet)} of your ${formatMoney(pace.target)} goal (${(pace.goalFraction * 100).toFixed(0)}%). A run-rate projection firms up as ${periodLabel} progresses.`
                    : pace.projectedDelta >= 0
                      ? `On pace to finish ${periodLabel} about ${formatMoney(pace.projectedDelta)} over your ${formatMoney(pace.target)} goal.`
                      : pace.daysRemaining > 0
                        ? `On pace to finish about ${formatMoney(Math.abs(pace.projectedDelta))} short — you'd need ${formatMoney(pace.neededPerDay)}/day over the last ${pace.daysRemaining} day${pace.daysRemaining === 1 ? "" : "s"} to hit ${formatMoney(pace.target)}.`
                        : `Finished ${periodLabel} about ${formatMoney(Math.abs(pace.projectedDelta))} short of your ${formatMoney(pace.target)} goal.`}
            </p>
          </div>
          {showPace && (
            <div>
              <PaceBar fillPct={pace.goalFraction * 100} markerPct={pace.timeFraction * 100} barClass={PACE_SEV_BAR[displaySev]} />
              <div className="mt-2 flex items-center justify-between text-xs text-text-secondary tabular-nums">
                <span>{(pace.goalFraction * 100).toFixed(0)}% of goal</span>
                <span className="text-text-tertiary">marker = {(pace.timeFraction * 100).toFixed(0)}% of {periodLabel} elapsed</span>
              </div>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 grid grid-cols-2 gap-3 md:gap-6">
          <StatTile label="Target" value={pace.hasGoal ? money(pace.target) : "Not set"} hint={period === "ytd" ? "Annual net revenue" : period === "quarter" ? "This quarter, net" : "This month, net"} />
          <StatTile label="Net so far" value={money(pace.actualNet)} hint={`Gross ${money(pace.actualGross)}`} />
          <StatTile
            label="Projected"
            value={money(pace.projectedNet)}
            hint="at current run-rate"
            // Only the YTD "vs last year" comparison is shown: month-over-month is
            // seasonal noise for a nursery (spring always dwarfs winter), and the
            // projection is only trustworthy once enough of the period has elapsed.
            trend={loading || !pace.confident || period !== "ytd" || pace.vsPriorPct == null ? undefined : {
              value: `${pace.vsPriorPct >= 0 ? "+" : ""}${(pace.vsPriorPct * 100).toFixed(0)}%`,
              direction: pace.vsPriorPct >= 0 ? "up" : "down",
              label: "vs last year",
            }}
          />
          <StatTile
            label="Needed pace"
            value={!pace.hasGoal ? "—" : pace.neededTotal <= 0 ? "Goal met" : pace.daysRemaining > 0 ? `${money(pace.neededPerDay)}/day` : "Period over"}
            hint={!pace.hasGoal ? "Set a target" : pace.neededTotal <= 0 ? "Nice work 🎉" : `${formatMoney(pace.neededTotal)} left · ${pace.daysRemaining}d`}
          />
        </div>
      </div>

      {/* Target editor + what's-needed calculator */}
      <Card className="p-6 mb-6">
        <h2 className="text-base font-medium mb-1">Set your {period === "ytd" ? "annual" : period === "quarter" ? "quarterly" : "monthly"} target</h2>
        <p className="text-sm text-text-secondary mb-3">Switch the toggle above to set monthly, quarterly, or annual targets. A broader target spreads evenly onto months without their own (quarterly ÷3, annual ÷12).</p>
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <span className={cn("rounded-full border px-2.5 py-1", periodType === "monthly" ? "border-accent-brand/40 text-text-primary" : "border-border-subtle text-text-secondary")}>
            This month: <span className="tabular-nums text-text-primary">{monthlyGoal ? formatMoney(monthlyGoal.target_amount) : "not set"}</span>
          </span>
          <span className={cn("rounded-full border px-2.5 py-1", periodType === "quarterly" ? "border-accent-brand/40 text-text-primary" : "border-border-subtle text-text-secondary")}>
            This quarter: <span className="tabular-nums text-text-primary">{quarterGoal ? formatMoney(quarterGoal.target_amount) : "not set"}</span>
          </span>
          <span className={cn("rounded-full border px-2.5 py-1", periodType === "annual" ? "border-accent-brand/40 text-text-primary" : "border-border-subtle text-text-secondary")}>
            This year: <span className="tabular-nums text-text-primary">{annualGoal ? formatMoney(annualGoal.target_amount) : "not set"}</span>
          </span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="sm:w-64">
            <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">Net revenue goal · {periodLabel}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
              <Input
                type="number"
                min="0"
                step="100"
                className="w-full pl-7"
                placeholder="0"
                value={draft}
                onFocus={() => { editingRef.current = true; }}
                onBlur={() => { editingRef.current = false; }}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>
          </div>
          <Button variant={dirty ? "brand" : "ghost"} disabled={!dirty || saving} onClick={onSave} className="sm:mb-0.5">
            {saving ? "Saving…" : goal ? "Update goal" : "Set goal"}
          </Button>
        </div>
        {draftNum > 0 && (
          <div className="mt-4 rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm">
            <div className="flex items-center gap-2 mb-1 text-text-primary">
              <Gauge className="w-4 h-4 text-status-info" />
              <span className="font-medium">What it takes to hit {formatMoney(draftNum)}</span>
            </div>
            <p className="text-text-secondary">
              You're at <span className="text-text-primary tabular-nums">{formatMoney(pace.actualNet)}</span> with{" "}
              <span className="text-text-primary tabular-nums">{draftPace.daysRemaining}</span> day{draftPace.daysRemaining === 1 ? "" : "s"} left.{" "}
              {draftPace.neededTotal <= 0
                ? "You've already cleared this target. 🎉"
                : draftPace.daysRemaining > 0
                  ? <>Need <span className="text-text-primary tabular-nums">{formatMoney(draftPace.neededTotal)}</span> more — about{" "}
                      <span className="text-text-primary tabular-nums">{formatMoney(draftPace.neededPerDay)}</span>/day.{" "}
                      {draftPace.projectedNet >= draftNum
                        ? <span className="text-status-ok">Your current pace gets you there.</span>
                        : <span className="text-status-warn">That's above your current pace of {formatMoney(draftPace.projectedNet)} projected.</span>}
                    </>
                  : "The period is complete."}
            </p>
          </div>
        )}
      </Card>

      {/* Progression vs goal + month detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h2 className="text-base font-medium mb-4">Net revenue vs goal · trailing 12 months</h2>
          {loadingSeries ? (
            <div className="h-72 rounded-lg bg-bg-elevated animate-pulse" />
          ) : seriesError && !hasSeries ? (
            <ErrorState title="Couldn't load revenue history" description="There was a problem loading your monthly revenue." onRetry={refresh} />
          ) : !hasSeries ? (
            <EmptyState icon={TrendingUp} title="No revenue yet" description="Monthly revenue will chart here against your goals as orders come in." />
          ) : (
            <>
              <div className="h-72">
                <RechartsChart>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
                      <XAxis dataKey="label" stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={yTick} />
                      <Tooltip
                        cursor={{ fill: "var(--color-bg-hover)", opacity: 0.4 }}
                        formatter={(val: number, name: string) => [formatMoney(Number(val)), name === "net" ? "Net" : name === "gross" ? "Gross" : "Goal"]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="net" name="Net" radius={[3, 3, 0, 0]} maxBarSize={28}>
                        {chartData.map((d, i) => (
                          <Cell key={i} fill="var(--color-accent-brand)" fillOpacity={d.isCurrent ? 0.4 : 1} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="gross" name="Gross" stroke="var(--color-status-info)" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="goal" name="Goal" stroke="var(--color-status-warn)" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </RechartsChart>
              </div>
              <p className="mt-3 text-[11px] text-text-tertiary">
                The current month is month-to-date (shown faded), so its bar is naturally partial. The goal line uses your monthly targets, or a broader target spread evenly (1/3 of a quarterly, 1/12 of an annual) for any month without one.
              </p>
            </>
          )}
        </Card>

        <Card className="p-6 overflow-auto">
          <h2 className="text-base font-medium mb-4">Month by month</h2>
          {!hasSeries ? (
            <p className="text-sm text-text-secondary">No revenue history yet.</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-[11px] uppercase tracking-wide text-text-secondary border-b border-border-subtle">
                <tr>
                  <th className="py-2 font-medium">Month</th>
                  <th className="py-2 font-medium text-right">Net</th>
                  <th className="py-2 font-medium text-right">Goal</th>
                  <th className="py-2 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((p, i) => {
                  const net = n(p.actual_net);
                  const g = p.goal == null ? null : n(p.goal);
                  const pct = g && g > 0 ? (net / g) * 100 : null;
                  const isCurrent = i === 0;
                  const derived = p.goal_is_derived === true; // annual ÷12 — a flat seasonal proxy
                  const hit = g != null && net >= g;
                  return (
                    <tr key={p.month} className="border-b border-border-subtle/50 last:border-0">
                      <td className="py-2">
                        {businessMonthShort(p.month)} {p.month.slice(0, 4)}
                        {isCurrent && <span className="ml-1 text-[10px] text-text-tertiary">(MTD)</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">{formatMoney(net)}</td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {g == null ? "—" : derived ? `~${formatMoney(g)}` : formatMoney(g)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {isCurrent ? (
                          // Partial MTD net against a full-month goal would read misleadingly low.
                          <span className="text-text-tertiary">in progress</span>
                        ) : pct == null ? (
                          <span className="text-text-tertiary">—</span>
                        ) : derived ? (
                          // Annual-derived (÷12) goal is a flat, seasonally-naive proxy — show the
                          // % informationally, with no hard hit/miss verdict.
                          <span className="text-text-secondary">{pct.toFixed(0)}%</span>
                        ) : (
                          <span className={cn("inline-flex items-center justify-end gap-1", hit ? "text-status-ok" : "text-status-alert")}>
                            {hit ? <Check className="w-3 h-3 shrink-0" aria-label="hit" /> : <AlertTriangle className="w-3 h-3 shrink-0" aria-label="missed" />}
                            {`${pct.toFixed(0)}%`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
