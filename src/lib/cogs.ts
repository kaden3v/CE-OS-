/**
 * Client wrappers for the atomic cost-of-goods RPCs. Each call runs server-side
 * in one transaction (one event → one entry → many rollups). rpcCall throws on
 * failure, so callers use try/catch.
 */
import { rpcCall } from "./supabase";

export interface SupplyPurchaseInput {
  supplyId: string;
  qty: number;
  totalCost: number;
  vendorId: string | null;
  purchaseDate: string;
}

export async function logSupplyPurchase(p: SupplyPurchaseInput): Promise<string> {
  return rpcCall<string>("log_supply_purchase", {
    p_supply_id: p.supplyId,
    p_qty: p.qty,
    p_total_cost: p.totalCost,
    p_vendor_id: p.vendorId,
    p_purchase_date: p.purchaseDate,
  });
}

export async function updateSupplyPurchase(purchaseId: string, p: SupplyPurchaseInput): Promise<void> {
  await rpcCall("update_supply_purchase", {
    p_purchase_id: purchaseId,
    p_qty: p.qty,
    p_total_cost: p.totalCost,
    p_vendor_id: p.vendorId,
    p_purchase_date: p.purchaseDate,
  });
}

export async function deleteSupplyPurchase(purchaseId: string): Promise<void> {
  await rpcCall("delete_supply_purchase", { p_purchase_id: purchaseId });
}

export interface ProductionRunInput {
  orgId: string;
  cultivarId: string | null;
  description: string | null;
  quantity: number;
  laborHours: number;
  laborRate: number;
  laborType: "owner" | "hired";
  runOn: string;
  supplies: { supply_id: string; qty: number }[];
}

export async function logProductionRun(p: ProductionRunInput): Promise<string> {
  return rpcCall<string>("log_production_run", {
    p_org_id: p.orgId,
    p_cultivar_id: p.cultivarId,
    p_description: p.description,
    p_quantity: p.quantity,
    p_labor_hours: p.laborHours,
    p_labor_rate: p.laborRate,
    p_labor_type: p.laborType,
    p_run_on: p.runOn,
    p_supplies: p.supplies,
  });
}

export async function deleteProductionRun(runId: string): Promise<void> {
  await rpcCall("delete_production_run", { p_run_id: runId });
}
