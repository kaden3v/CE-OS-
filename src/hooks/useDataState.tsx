import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";

export function useDataState<T>(data: T[], loadingDelay = 600): {
  data: T[];
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
} {
  const { settings } = useApp();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (settings.loadingMode) {
      setIsLoading(true);
      timer = setTimeout(() => {
         // keep it loading indefinitely
      }, 100000);
    } else {
      setIsLoading(true);
      timer = setTimeout(() => setIsLoading(false), loadingDelay);
    }
    return () => clearTimeout(timer);
  }, [settings.loadingMode, loadingDelay]);

  const resultData: T[] = settings.emptyMode ? [] : data;

  return {
    data: resultData,
    isLoading,
    isError: settings.errorMode,
    isEmpty: settings.emptyMode || data.length === 0,
  };
}
