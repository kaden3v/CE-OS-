import { Link } from "react-router";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  ComposedChart, BarChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Modal } from "@/components/ui/Modal";
import { RechartsChart } from "@/components/ui/RechartsChart";
import { EmptyState } from "@/components/ui/StateRenderer";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BreakdownRow } from "./BreakdownRow";
import { NetProfitWaterfall } from "./NetProfitWaterfall";
import type { StatDetail, ChartSpec } from "@/lib/financeStatDetails";
import type { FinanceKpiWindow, ExpenseBreakdownRow } from "@/hooks/useFinanceOverview";

interface StatDetailModalProps {
  open: boolean;
  onClose: () => void;
  detail: StatDetail | null;
  /** Orders/expenses still fetching — the line-item section shows a skeleton. */
  loadingLineItems: boolean;
  /** Passthrough for the Net Profit waterfall (used when detail.useWaterfall). */
  waterfall?: { win: FinanceKpiWindow | undefined; breakdown: ExpenseBreakdownRow[] };
}

const yTick = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
const barFill = (c?: "brand" | "alert") => (c === "alert" ? "var(--color-status-alert)" : "var(--color-accent-brand)");

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-xs uppercase tracking-wide text-text-secondary mb-2">{children}</h3>;
}

function TrendChart({ chart, title }: { chart: ChartSpec; title: string }) {
  return (
    <div className="h-56">
      <RechartsChart>
        <ResponsiveContainer width="100%" height="100%">
          {chart.kind === "inout" ? (
            <ComposedChart data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
              <XAxis dataKey="label" stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={yTick} />
              <Tooltip cursor={{ fill: "var(--color-bg-hover)", opacity: 0.4 }} formatter={(v: number, name: string) => [formatMoney(Number(v)), name]} />
              <Bar dataKey="in" name="Money in" fill="var(--color-accent-brand)" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="out" name="Money out" fill="var(--color-status-alert)" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Line type="monotone" dataKey="net" name="Net" stroke="var(--color-text-primary)" strokeWidth={2} dot={false} />
            </ComposedChart>
          ) : (
            <BarChart data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
              <XAxis dataKey="label" stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-text-secondary)" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={yTick} />
              <Tooltip cursor={{ fill: "var(--color-bg-hover)", opacity: 0.4 }} formatter={(v: number) => [formatMoney(Number(v)), title]} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28}>
                {chart.data.map((d, i) => (
                  <Cell key={i} fill={(d.value ?? 0) < 0 ? "var(--color-status-alert)" : barFill(chart.barColor)} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </RechartsChart>
    </div>
  );
}

function LineItems({ detail, loading }: { detail: StatDetail; loading: boolean }) {
  const { lineItems } = detail;
  const heading = lineItems.kind === "orders" ? "Orders in this period" : "Expenses in this period";

  if (loading) {
    return (
      <section>
        <SectionTitle>{heading}</SectionTitle>
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 rounded bg-bg-base animate-pulse" />)}</div>
      </section>
    );
  }

  if (lineItems.rows.length === 0) {
    return (
      <section>
        <SectionTitle>{heading}</SectionTitle>
        <EmptyState title="Nothing here yet" description={lineItems.emptyText} />
      </section>
    );
  }

  const lastCol = lineItems.columns.length - 1;
  return (
    <section>
      <SectionTitle>{heading}</SectionTitle>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-border-subtle">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-elevated z-10">
            <tr className="text-[11px] uppercase tracking-wide text-text-secondary">
              {lineItems.columns.map((c, i) => (
                <th key={i} className={cn("px-3 py-2 font-medium", c.align === "right" ? "text-right" : "text-left")}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineItems.rows.map((r) => (
              <tr key={r.id} className={cn("border-t border-border-subtle/50", r.muted && "text-text-tertiary")}>
                {r.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-3 py-2",
                      lineItems.columns[i].align === "right" ? "text-right tabular-nums" : "text-left",
                      i === 0 && "whitespace-nowrap",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {lineItems.footer && (
            <tfoot className="sticky bottom-0 bg-bg-elevated">
              <tr className="border-t border-border-strong font-medium">
                <td className="px-3 py-2 text-text-secondary" colSpan={Math.max(1, lastCol)}>{lineItems.footer.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text-primary">{lineItems.footer.value}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {lineItems.truncatedNote && <p className="text-[11px] text-text-tertiary mt-2">{lineItems.truncatedNote}</p>}
      {lineItems.caveat && <p className="text-[11px] text-text-tertiary mt-2 leading-relaxed">{lineItems.caveat}</p>}
    </section>
  );
}

/**
 * Drill-down for a single Finances Overview stat: the headline + period delta,
 * how the figure is built (composition rows, or the Net Profit waterfall), a
 * trend chart where one exists, and the underlying order/expense line items.
 */
export function StatDetailModal({ open, onClose, detail, loadingLineItems, waterfall }: StatDetailModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={detail?.title ?? ""} size="lg">
      {detail && (
        <div className="p-4 sm:p-5 space-y-6">
          {/* Headline + delta */}
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-semibold tabular-nums text-text-primary">{detail.headline}</span>
              {detail.delta && (
                <span className={cn("flex items-center gap-1 text-xs", detail.delta.direction === "up" ? "text-status-ok" : "text-status-alert")}>
                  {detail.delta.direction === "up" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {detail.delta.value}
                  <span className="text-text-tertiary">· {detail.delta.label}</span>
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-2">{detail.intro}</p>
          </div>

          {/* How it's built */}
          <section>
            <SectionTitle>How it's built</SectionTitle>
            {detail.useWaterfall && waterfall ? (
              <NetProfitWaterfall win={waterfall.win} breakdown={waterfall.breakdown} loading={false} />
            ) : (
              <div className="text-sm">
                {detail.composition.map((r) => (
                  <BreakdownRow
                    key={r.label}
                    label={r.label}
                    sub={r.sub}
                    amount={r.amount}
                    valueText={r.valueText}
                    outflow={r.outflow}
                    bold={r.bold}
                    result={r.result}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Trend */}
          <section>
            <SectionTitle>Trend</SectionTitle>
            {detail.chart.kind === "none" ? (
              <p className="text-xs text-text-tertiary">{detail.chart.emptyHint}</p>
            ) : (
              <>
                <TrendChart chart={detail.chart} title={detail.title} />
                {detail.chart.caption && <p className="text-[11px] text-text-tertiary mt-2">{detail.chart.caption}</p>}
              </>
            )}
          </section>

          {/* Line items */}
          {detail.lineItems.kind !== "none" && <LineItems detail={detail} loading={loadingLineItems} />}

          {/* Full-tab link */}
          {detail.fullTab && (
            <div className="pt-2 border-t border-border-subtle">
              <Link to={detail.fullTab.to} onClick={onClose} className="text-sm text-accent-brand hover:underline">
                {detail.fullTab.label} →
              </Link>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
