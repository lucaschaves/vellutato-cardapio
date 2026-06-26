import { AlertTriangle, ArrowLeft, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  limparErros,
  obterErros,
  type ErroRegistrado,
} from "../../lib/errorLogger";

function formatarData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ListaErros() {
  const navigate = useNavigate();
  const location = useLocation();
  const [erros, setErros] = useState<ErroRegistrado[]>(() => obterErros());

  const totalErros = useMemo(() => erros.length, [erros]);

  const voltar = () => navigate(`/cardapio${location.search}`);

  const handleLimpar = () => {
    limparErros();
    setErros([]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-[#181a1b] text-gray-900 dark:text-gray-200 font-sans transition-colors duration-300 flex flex-col overflow-hidden">
      <header className="sticky top-0 z-30 bg-white dark:bg-[#181a1b] border-b border-gray-200 dark:border-[#2a2c30] shadow-sm px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={voltar}
            className="p-2.5 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white active:scale-95 transition-transform"
            aria-label="Voltar ao cardápio"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Registro de Erros
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {totalErros} {totalErros === 1 ? "registro" : "registros"}
            </p>
          </div>

          <button
            onClick={handleLimpar}
            disabled={totalErros === 0}
            className="p-2.5 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-600 dark:text-gray-300 hover:text-red-500 disabled:opacity-40 disabled:hover:text-gray-600 dark:disabled:hover:text-gray-300 active:scale-95 transition-all"
            aria-label="Limpar todos os erros"
            title="Limpar todos"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto max-w-3xl w-full mx-auto p-5 space-y-4 hide-scrollbar">
        {erros.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-600">
            <AlertTriangle size={56} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">Nenhum erro registrado.</p>
            <p className="text-sm mt-1 text-center max-w-xs">
              Os erros capturados pelo sistema aparecerão aqui automaticamente.
            </p>
          </div>
        ) : (
          erros.map((erro) => (
            <article
              key={erro.id}
              className="bg-white dark:bg-[#242629] border border-gray-100 dark:border-[#323438] rounded-2xl p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-500 shrink-0">
                  <AlertTriangle size={18} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {formatarData(erro.timestamp)}
                  </p>
                  <p className="font-semibold text-gray-900 dark:text-white break-words">
                    {erro.mensagem}
                  </p>

                  {erro.detalhes && (
                    <pre className="mt-3 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-[#181a1b] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words border border-gray-100 dark:border-[#323438]">
                      {erro.detalhes}
                    </pre>
                  )}

                  <p className="mt-3 text-[0.6875rem] text-gray-400 dark:text-gray-500 truncate">
                    {erro.url}
                  </p>
                </div>
              </div>
            </article>
          ))
        )}
      </main>
    </div>
  );
}
