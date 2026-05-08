import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";

export function useDataState(data: any[], loadingDelay = 600) {
  const { settings } = useApp();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let timer: any;
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

  return {
    data: settings.emptyMode ? [] : data,
    isLoading,
    isError: settings.errorMode,
    isEmpty: settings.emptyMode || data.length === 0,
  };
}
