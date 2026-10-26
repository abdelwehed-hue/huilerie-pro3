import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { User } from "@/lib/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      // Safety net: never leave the app on "Vérification de la session…" forever.
      return Promise.race([
        apiGet<User>("/auth/me"),
        new Promise<never>((_, reject) =>
          window.setTimeout(
            () => reject(new Error("Session verification timed out. Please sign in again.")),
            18000,
          ),
        ),
      ]);
    },
    retry: false,
    staleTime: 60_000,
  });
}
