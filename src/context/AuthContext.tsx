import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface AuthContextType {
  sessao: Session | null;
  carregando: boolean;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    // Busca a sessão inicial ao abrir o app
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error(
          "[ERRO - AUTENTICAÇÃO] Falha ao recuperar sessão ativa:",
          error.message,
        );
      }
      setSessao(session);
      setCarregando(false);
    });

    // Escuta mudanças (ex: usuário fez login ou logout em outra aba)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessao(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const sair = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      console.info("[AUTENTICAÇÃO] Sessão encerrada com sucesso.");
    } catch (erro: any) {
      console.error(
        "[ERRO - AUTENTICAÇÃO] Falha ao realizar logout:",
        erro.message || erro,
      );
      alert("Ocorreu um erro ao sair do sistema.");
    }
  };

  return (
    <AuthContext.Provider value={{ sessao, carregando, sair }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
