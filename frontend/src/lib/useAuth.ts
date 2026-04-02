"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "./api";
import { User } from "./types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Auth state is determined by calling /me — the httpOnly cookie is sent
    // automatically. No token in JavaScript storage.
    auth
      .me()
      .then((u) => setUser(u as User))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await auth.logout();
    setUser(null);
    router.push("/login");
  };

  return { user, loading, logout };
}
