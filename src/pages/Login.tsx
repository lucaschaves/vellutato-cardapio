import { motion } from "framer-motion";
import { Loader2, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

// Componentes do Shadcn/ui (Sem o use-toast antigo)
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

// Importação direta e otimizada do Sonner
import { toast } from "sonner";

export function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !senha) {
      toast.warning(
        "Campos obrigatórios: Por favor, preencha o e-mail e a senha para continuar.",
      );
      return;
    }

    try {
      setCarregando(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (error) throw new Error(error.message);

      console.info(
        "[SUCESSO] Autenticação validada. Iniciando sessão administrativa.",
      );

      // O toast de sucesso agora sobrevive à mudança de rota
      toast.success("Acesso liberado. Bem-vindo ao painel!");
      navigate("/admin/pedidos");
    } catch (erro: any) {
      console.error(
        "[ERRO - LOGIN] Falha na validação de credenciais:",
        erro.message || erro,
      );
      toast.error(
        "Acesso Negado: E-mail ou senha incorretos. Verifique suas credenciais.",
      );
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background-light dark:bg-background-dark">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="border-gray-200 dark:border-gray-800 shadow-xl bg-surface-light dark:bg-surface-dark">
          <CardHeader className="text-center space-y-2 pt-8">
            <div className="w-16 h-16 bg-cookie-primary text-white rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-md">
              <Lock size={32} />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              Acesso Restrito
            </CardTitle>
            <CardDescription>
              Insira suas credenciais para gerenciar a operação.
            </CardDescription>
          </CardHeader>

          <CardContent className="pb-8">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail Administrativo</Label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                    size={16}
                  />
                  <Input
                    id="email"
                    type="email"
                    placeholder="gerente@vellutato.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 dark:bg-[#1a1815] h-12"
                    disabled={carregando}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                    size={16}
                  />
                  <Input
                    id="senha"
                    type="password"
                    placeholder="••••••••"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="pl-10 dark:bg-[#1a1815] h-12"
                    disabled={carregando}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-cookie-primary hover:bg-cookie-primary/90 text-white font-semibold text-md mt-2 transition-all"
                disabled={carregando}
              >
                {carregando ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  "Entrar no Sistema"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
