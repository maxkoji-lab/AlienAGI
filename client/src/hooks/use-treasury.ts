import { useQuery } from "@tanstack/react-query";

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
