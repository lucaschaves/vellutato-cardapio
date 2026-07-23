import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  telefoneDigitosCompleto,
  telefoneParaE164,
} from "../lib/telefone";

interface AuthContextType {
  sessao: Session | null;
  usuario: User | null;
  carregando: boolean;
  sair: () => Promise<void>;
  entrarComGoogle: (redirectTo?: string) => Promise<void>;
  enviarOtpSms: (telefoneBr: string) => Promise<void>;
  verificarOtpSms: (telefoneBr: string, token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
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
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - AUTENTICAÇÃO] Logout:", mensagem);
      alert("Ocorreu um erro ao sair do sistema.");
    }
  };

  const entrarComGoogle = async (redirectTo?: string) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          redirectTo || `${window.location.origin}/delivery/auth/callback`,
      },
    });
    if (error) throw new Error(error.message);
  };

  const enviarOtpSms = async (telefoneBr: string) => {
    if (!telefoneDigitosCompleto(telefoneBr)) {
      throw new Error("Informe um telefone válido com DDD (11 dígitos).");
    }
    const phone = telefoneParaE164(telefoneBr);
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: "sms" },
    });
    if (error) {
      const code = (error as { code?: string }).code || "";
      if (
        code === "phone_provider_disabled" ||
        /unsupported phone provider/i.test(error.message)
      ) {
        throw new Error(
          "SMS ainda não está configurado. No Supabase: Authentication → Providers → Phone (habilitar) e Authentication → Hooks → Send SMS apontando para a function send-sms (KingSMS). Veja supabase/functions/README.md.",
        );
      }
      throw new Error(error.message);
    }
  };

  const verificarOtpSms = async (telefoneBr: string, token: string) => {
    if (!telefoneDigitosCompleto(telefoneBr)) {
      throw new Error("Informe um telefone válido com DDD (11 dígitos).");
    }
    const codigo = token.replace(/\D/g, "");
    if (codigo.length < 6) {
      throw new Error("Informe o código de 6 dígitos.");
    }
    const phone = telefoneParaE164(telefoneBr);
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: codigo,
      type: "sms",
    });
    if (error) throw new Error(error.message);
  };

  return (
    <AuthContext.Provider
      value={{
        sessao,
        usuario: sessao?.user ?? null,
        carregando,
        sair,
        entrarComGoogle,
        enviarOtpSms,
        verificarOtpSms,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
