import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useInstalarPwa } from "../hooks/useInstalarPwa";
import { type TipoPwa } from "../lib/pwaInstalacao";

const CLASSE_PADRAO =
  "flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-cookie-primary hover:bg-cookie-primary/10 dark:hover:bg-cookie-primary/20 transition-colors disabled:opacity-60";

const ROTULOS: Record<TipoPwa, string> = {
  cardapio: "Instalar cardápio",
  admin: "Instalar app admin",
};

const MENSAGENS_SUCESSO: Record<TipoPwa, string> = {
  cardapio: "Cardápio instalado neste dispositivo.",
  admin: "App admin instalado neste dispositivo.",
};

type Props = {
  tipo: TipoPwa;
  className?: string;
};

export function BotaoInstalarPwa({ tipo, className = CLASSE_PADRAO }: Props) {
  const { podeInstalar, instalado, instalando, instalar } =
    useInstalarPwa(tipo);

  if (instalado || !podeInstalar) return null;

  const handleInstalar = async () => {
    const aceito = await instalar();
    if (aceito) {
      toast.success(MENSAGENS_SUCESSO[tipo]);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleInstalar()}
      disabled={instalando}
      className={className}
      title="Instalar atalho na tela inicial (somente quando você quiser)"
    >
      {instalando ? (
        <Loader2 size={18} className="animate-spin shrink-0" />
      ) : (
        <Download size={18} className="shrink-0" />
      )}
      <span>{ROTULOS[tipo]}</span>
    </button>
  );
}
