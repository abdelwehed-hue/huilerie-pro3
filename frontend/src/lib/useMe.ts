import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { User } from "@/lib/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    // Consume React Query's AbortSignal so an obsolete startup request is cancelled
    // on unmount instead of being reused as a stale in-flight session check.
    queryFn: ({ signal }) => apiGet<User>("/auth/me", signal),
    retry: false,
    staleTime: 60_000,
  });
}
