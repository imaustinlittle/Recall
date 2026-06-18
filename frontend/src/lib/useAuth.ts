"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "./api";
import { User } from "./types";

type AuthMode = "local" | "proxy";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AuthMode>("local");
  const [logoutUrl, setLogoutUrl] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Auth state is determined by calling /me — in local mode the httpOnly
    // cookie is sent automatically; in proxy mode the forward-auth headers
    // injected by the upstream (e.g. Authentik) identify the user.
    auth
      .me()
      .then((u) => setUser(u as User))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    // Auth mode drives how the UI renders login / sign-out.
    auth
      .config()
      .then((c) => {
        setMode(c.mode);
        setLogoutUrl(c.logout_url);
      })
      .catch(() => {
        /* default to local */
      });
  }, []);

  const logout = async () => {
    if (mode === "proxy") {
      // Hand off to the proxy's own logout (clears the Authentik session).
      window.location.href = logoutUrl || "/outpost.goauthentik.io/sign_out";
      return;
    }
    await auth.logout();
    setUser(null);
    router.push("/login");
  };

  return { user, loading, logout, mode, logoutUrl };
}
