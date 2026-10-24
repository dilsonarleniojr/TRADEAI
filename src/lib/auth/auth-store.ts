import { create } from 'zustand';
import { UserPublicProfile } from './auth-service';

interface AuthState {
  user: UserPublicProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  checkSession: () => Promise<void>;
  login: (email: string, password: string, twoFactorCode?: string) => Promise<{ success: boolean; requiresTwoFactor?: boolean; error?: string }>;
  register: (name: string, email: string, password: string, enableTwoFactor?: boolean) => Promise<{ success: boolean; error?: string; twoFactorSecret?: string; otpauthUri?: string }>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isAuthModalOpen: false,

  openAuthModal: () => set({ isAuthModalOpen: true }),
  closeAuthModal: () => set({ isAuthModalOpen: false }),

  checkSession: async () => {
    try {
      set({ isLoading: true });
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          set({ user: data.user, isAuthenticated: true, isLoading: false });
          return;
        }
      }
      set({ user: null, isAuthenticated: false, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password, twoFactorCode) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, twoFactorCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Credenciais inválidas.' };
      }

      if (data.requiresTwoFactor) {
        return { success: false, requiresTwoFactor: true };
      }

      if (data.success && data.user) {
        set({ user: data.user, isAuthenticated: true, isAuthModalOpen: false });
        return { success: true };
      }

      return { success: false, error: 'Resposta inesperada do servidor.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro de rede ao conectar.' };
    }
  },

  register: async (name, email, password, enableTwoFactor = true) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, enableTwoFactor }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Falha ao registrar.' };
      }

      if (data.success && data.user) {
        set({ user: data.user, isAuthenticated: true });
        return {
          success: true,
          twoFactorSecret: data.twoFactorSecret,
          otpauthUri: data.otpauthUri,
        };
      }

      return { success: false, error: 'Resposta inesperada do servidor.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro de rede ao registrar.' };
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignora erro de rede no logout
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
