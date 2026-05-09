import { useEffect, useState } from "react";
import * as storage from "@/lib/storage";
import {
  CHANGELOG_RESOURCE_KEY,
  loadChangeLogs,
} from "@/lib/changeLog";
import type { ChangeLog } from "@/lib/schemas";

export function useChangeLogs(): ChangeLog[] {
  const [entries, setEntries] = useState<ChangeLog[]>(() =>
    loadChangeLogs()
  );

  useEffect(() => {
    const refresh = () => setEntries(loadChangeLogs());
    refresh();
    const onLocal = () => refresh();
    window.addEventListener("ce-os:changelog", onLocal);
    const unsubStorage = storage.subscribe(CHANGELOG_RESOURCE_KEY, refresh);
    return () => {
      window.removeEventListener("ce-os:changelog", onLocal);
      unsubStorage();
    };
  }, []);

  return entries;
}
