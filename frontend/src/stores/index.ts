import { create } from 'zustand';

interface AuthState {
  user: any | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('airos_token') : false,
  login: async (email, password) => {
    const { api } = await import('@/services/api/client');
    await api.login(email, password);
    set({ isAuthenticated: true });
  },
  logout: () => { localStorage.removeItem('airos_token'); set({ user: null, isAuthenticated: false }); },
}));
