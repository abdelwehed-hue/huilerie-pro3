import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Droplets, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import type { User } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { beginSession } from "@/lib/session";
import { useMe } from "@/lib/useMe";
import { LangToggle } from "@/components/AppShell";

const HERO =
  "https://images.unsplash.com/photo-1698775942613-3e9fc114b2a1?crop=entropy&cs=srgb&fm=jpg&q=80&w=1400";

export default function Login() {
  const { t, errMsg } = useI18n();
  const navigate = useNavigate();
  const me = useMe();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const m = useMutation({
    mutationFn: () => apiPost<User>("/auth/login", { username, password }),
    onSuccess: () => {
      beginSession();
      navigate("/", { replace: true });
    },
    onError: (e) => setError(errMsg(e)),
  });

  if (me.data) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-screen bg-[#F9F8F3] lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <img src={HERO} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1E291E] via-[#1E291E]/60 to-transparent" />
        <div className="absolute bottom-0 start-0 end-0 p-12 text-white">
          <div className="mb-6 flex gap-2">
            <span className="h-2 w-10 rounded-full bg-lime-400" />
            <span className="h-2 w-6 rounded-full bg-amber-400" />
            <span className="h-2 w-4 rounded-full bg-sky-400" />
            <span className="h-2 w-3 rounded-full bg-violet-400" />
          </div>
          <h2 className="font-heading text-5xl font-bold leading-tight">{t("app_name")}</h2>
          <p className="mt-3 max-w-md text-lg text-white/80">{t("app_tagline")}</p>
        </div>
      </div>
      <div className="flex flex-col p-6 md:p-12">
        <div className="flex justify-end">
          <LangToggle />
        </div>
        <div className="flex flex-1 items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              m.mutate();
            }}
            className="w-full max-w-sm space-y-6"
            data-testid="login-form"
          >
            <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-lime-500 to-amber-400 shadow-lg">
              <Droplets className="size-6 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-4xl font-bold tracking-tight text-stone-900">{t("login_title")}</h1>
              <p className="mt-1 text-stone-600">{t("login_sub")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="u">{t("username")}</Label>
              <Input id="u" data-testid="login-username-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="h-11 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p">{t("password")}</Label>
              <Input id="p" type="password" data-testid="login-password-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="h-11 rounded-xl bg-white" />
            </div>
            {error && (
              <div data-testid="login-error" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}
            <Button type="submit" disabled={m.isPending || !username || !password} data-testid="login-submit-button" className="h-11 w-full rounded-xl bg-lime-700 text-base hover:bg-lime-800 active:scale-[0.98] transition-transform">
              <LogIn className="size-4 rtl:rotate-180" />
              {t("sign_in")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
