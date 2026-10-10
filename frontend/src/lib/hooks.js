import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiError, get } from "@/lib/api";

export function useApi(key, url, opts = {}) {
  return useQuery({ queryKey: Array.isArray(key) ? key : [key], queryFn: () => get(url), enabled: !!url, staleTime: 5000, ...opts });
}

export function useAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const run = async (name, fn, success) => {
    setBusy(name);
    try {
      const res = await fn();
      if (success) toast.success(typeof success === "function" ? success(res) : success);
      await qc.invalidateQueries();
      return res;
    } catch (e) {
      toast.error(apiError(e));
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { run, busy };
}
