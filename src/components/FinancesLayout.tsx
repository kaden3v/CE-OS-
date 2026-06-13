import { Outlet } from "react-router";
import { FinanceTabs } from "./finances/FinanceTabs";

/**
 * Shell for the whole Finance section: one sidebar entry, with the sub-views
 * exposed as in-page tabs. The tab bar sticks to the top of the scrolling page
 * area; each child route renders its own content below.
 */
export function FinancesLayout() {
  return (
    <div>
      <FinanceTabs />
      <Outlet />
    </div>
  );
}
