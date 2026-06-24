import { Outlet } from "react-router";
import { FinanceTabs } from "./finances/FinanceTabs";
import { ExpenseCategoriesProvider } from "@/contexts/ExpenseCategoriesContext";

/**
 * Shell for the whole Finance section: one sidebar entry, with the sub-views
 * exposed as in-page tabs. The tab bar sticks to the top of the scrolling page
 * area; each child route renders its own content below. Wraps the section in
 * the expense-categories provider so pickers and the category manager share one
 * loaded list.
 */
export function FinancesLayout() {
  return (
    <ExpenseCategoriesProvider>
      <div>
        <FinanceTabs />
        <Outlet />
      </div>
    </ExpenseCategoriesProvider>
  );
}
