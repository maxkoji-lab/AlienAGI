import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface TreasuryStats {
  totalBuybackSol: number;
  totalBuybackTokens: number;
  totalBurned: number;
  totalRewardsDistributed: number;
  activeCampaigns: number;
}

export function useTreasuryStats() {
  return useQuery<TreasuryStats>({
    queryKey: ["/api/treasury/stats"],
    refetchInterval: 30000,
  });
}

export function useBuybacks() {
  return useQuery({
    queryKey: ["/api/treasury/buybacks"],
    refetchInterval: 15000,
  });
}

export function useCreateBuyback() {
  return useMutation({
    mutationFn: async (data: { amountSol: number; amountTokens: number }) => {
      const res = await apiRequest("POST", "/api/treasury/buybacks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/buybacks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/stats"] });
    },
  });
}

export function useUpdateBuybackStatus() {
  return useMutation({
    mutationFn: async ({ id, status, txSignature }: { id: number; status: string; txSignature?: string }) => {
      const res = await apiRequest("PATCH", `/api/treasury/buybacks/${id}/status`, { status, txSignature });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/buybacks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/stats"] });
    },
  });
}

export function useBurns() {
  return useQuery({
    queryKey: ["/api/treasury/burns"],
    refetchInterval: 15000,
  });
}

export function useCreateBurn() {
  return useMutation({
    mutationFn: async (data: { amountTokens: number; source?: string }) => {
      const res = await apiRequest("POST", "/api/treasury/burns", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/burns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/stats"] });
    },
  });
}

export function useUpdateBurnStatus() {
  return useMutation({
    mutationFn: async ({ id, status, txSignature }: { id: number; status: string; txSignature?: string }) => {
      const res = await apiRequest("PATCH", `/api/treasury/burns/${id}/status`, { status, txSignature });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/burns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/stats"] });
    },
  });
}

export function useRewardCampaigns() {
  return useQuery({
    queryKey: ["/api/treasury/campaigns"],
    refetchInterval: 15000,
  });
}

export function useCreateRewardCampaign() {
  return useMutation({
    mutationFn: async (data: { name: string; minHoldingUsd: number; rewardUsd: number; totalBudgetUsd: number }) => {
      const res = await apiRequest("POST", "/api/treasury/campaigns", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/stats"] });
    },
  });
}

export function useToggleCampaign() {
  return useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/treasury/campaigns/${id}/toggle`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/campaigns"] });
    },
  });
}
