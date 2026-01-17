import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserPublic } from "@shared/schema";
import { apiRequest } from "./queryClient";

interface AuthContextType {
  user: UserPublic | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  registerAnonymous: () => Promise<void>;
  convertAnonymous: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePublicKey: (publicKey: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<UserPublic | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      await apiRequest("POST", "/api/auth/login", { username, password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async ({ username, password, displayName }: { username: string; password: string; displayName?: string }) => {
      await apiRequest("POST", "/api/auth/register", { username, password, displayName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const registerAnonymousMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/register-anonymous", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const convertAnonymousMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      await apiRequest("POST", "/api/auth/convert-anonymous", { username, password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.clear();
    },
  });

  const updatePublicKeyMutation = useMutation({
    mutationFn: async (publicKey: string) => {
      await apiRequest("POST", "/api/auth/public-key", { publicKey });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        login: async (username, password) => {
          await loginMutation.mutateAsync({ username, password });
        },
        register: async (username, password, displayName) => {
          await registerMutation.mutateAsync({ username, password, displayName });
        },
        registerAnonymous: async () => {
          await registerAnonymousMutation.mutateAsync();
        },
        convertAnonymous: async (username, password) => {
          await convertAnonymousMutation.mutateAsync({ username, password });
        },
        logout: async () => {
          await logoutMutation.mutateAsync();
        },
        updatePublicKey: async (publicKey) => {
          await updatePublicKeyMutation.mutateAsync(publicKey);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
