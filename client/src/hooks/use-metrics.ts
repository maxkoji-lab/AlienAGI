import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useMetrics() {
  return useQuery({
    queryKey: [api.metrics.list.path],
    queryFn: async () => {
      const res = await fetch(api.metrics.list.path);
      if (!res.ok) throw new Error("Failed to fetch metrics");
      // Use z.array(...) defined in shared/routes
      return api.metrics.list.responses[200].parse(await res.json());
    },
    refetchInterval: 30000, // Refresh every 30s
  });
}

export function useLatestMetric() {
  return useQuery({
    queryKey: [api.metrics.latest.path],
    queryFn: async () => {
      const res = await fetch(api.metrics.latest.path);
      if (!res.ok) throw new Error("Failed to fetch latest metric");
      return api.metrics.latest.responses[200].parse(await res.json());
    },
    refetchInterval: 10000, // Fast refresh for current status
  });
}

export function useBrief() {
  return useQuery({
    queryKey: [api.brief.latest.path],
    queryFn: async () => {
      const res = await fetch(api.brief.latest.path);
      if (!res.ok) throw new Error("Failed to fetch brief");
      return api.brief.latest.responses[200].parse(await res.json());
    },
    refetchInterval: 10000,
  });
}
