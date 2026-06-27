import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useInstalarPwa } from "../hooks/useInstalarPwa";

export function BotaoInstalarPwa() {
  const { podeInstalar, instalado, instalando, instalar } = useInstalarPwa();

  if (instalado || !podeInstalar) return null;

  const handleInstalar = async () => {
    const aceito = await instalar();
    if (aceito) {
      toast.success("App instalado neste dispositivo.");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleInstalar()}
      disabled={instalando}
      className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-cookie-primary hover:bg-cookie-primary/10 dark:hover:bg-cookie-primary/20 transition-colors disabled:opacity-60"
      title="Instalar atalho na tela inicial (somente quando você quiser)"
    >
      {instalando ? (
        <Loader2 size={18} className="animate-spin shrink-0" />
      ) : (
        <Download size={18} className="shrink-0" />
      )}
      <span>Instalar app</span>
    </button>
  );
}
