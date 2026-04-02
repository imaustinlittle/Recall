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
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }
    auth
      .me()
      .then((u) => setUser(u as User))
      .catch(() => {
        localStorage.removeItem("access_token");
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    auth.logout();
    setUser(null);
    router.push("/login");
  };

  return { user, loading, logout };
}
