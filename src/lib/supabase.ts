import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { registrarErroSupabase } from "./errorLogger";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[ERRO CRÍTICO] As variáveis de ambiente do Supabase não foram encontradas. Verifique o arquivo .env",
  );
}

type ResultadoSupabase = { error?: unknown };

function envolverThenable<T extends object>(alvo: T, contexto: string): T {
  return new Proxy(alvo, {
    get(target, prop, receiver) {
      const valor = Reflect.get(target, prop, receiver);

      if (prop === "then" && typeof valor === "function") {
        return (
          onFulfilled?: (value: ResultadoSupabase) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) =>
          valor.call(
            target,
            (resultado: ResultadoSupabase) => {
              if (resultado?.error) {
                registrarErroSupabase(contexto, resultado.error);
              }
              return onFulfilled ? onFulfilled(resultado) : resultado;
            },
            onRejected,
          );
      }

      if (typeof valor === "function") {
        return (...args: unknown[]) => {
          const retorno = valor.apply(target, args);
          if (
            retorno &&
            typeof retorno === "object" &&
            "then" in retorno &&
            typeof (retorno as { then?: unknown }).then === "function"
          ) {
            return envolverThenable(retorno as object, contexto);
          }
          return retorno;
        };
      }

      return valor;
    },
  }) as T;
}

function envolverAuth(auth: SupabaseClient["auth"]) {
  return new Proxy(auth, {
    get(target, prop, receiver) {
      const valor = Reflect.get(target, prop, receiver);

      if (typeof valor !== "function" || prop === "onAuthStateChange") {
        return valor;
      }

      return (...args: unknown[]) => {
        const retorno = valor.apply(target, args);
        if (
          retorno &&
          typeof retorno === "object" &&
          "then" in retorno &&
          typeof (retorno as { then?: unknown }).then === "function"
        ) {
          return (retorno as Promise<ResultadoSupabase>).then((resultado) => {
            if (resultado?.error) {
              registrarErroSupabase(`auth:${String(prop)}`, resultado.error);
            }
            return resultado;
          });
        }
        return retorno;
      };
    },
  });
}

function envolverStorage(storage: SupabaseClient["storage"]) {
  return new Proxy(storage, {
    get(target, prop, receiver) {
      const valor = Reflect.get(target, prop, receiver);

      if (prop === "from" && typeof valor === "function") {
        return (bucket: string) =>
          envolverThenable(
            valor.call(target, bucket) as object,
            `storage:${bucket}`,
          );
      }

      return valor;
    },
  });
}

function criarFetchComInterceptacao(): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const metodo = init?.method ?? "GET";

    try {
      return await fetch(input, init);
    } catch (erro) {
      registrarErroSupabase("rede", erro, { url, metodo });
      throw erro;
    }
  };
}

function aplicarInterceptadores(cliente: SupabaseClient): SupabaseClient {
  return new Proxy(cliente, {
    get(target, prop, receiver) {
      const valor = Reflect.get(target, prop, receiver);

      if (prop === "from" && typeof valor === "function") {
        return (relacao: string) =>
          envolverThenable(
            valor.call(target, relacao) as object,
            `from:${relacao}`,
          );
      }

      if (prop === "rpc" && typeof valor === "function") {
        return (fn: string, args?: unknown, options?: unknown) =>
          envolverThenable(
            valor.call(target, fn, args, options) as object,
            `rpc:${fn}`,
          );
      }

      if (prop === "auth") {
        return envolverAuth(valor as SupabaseClient["auth"]);
      }

      if (prop === "storage") {
        return envolverStorage(valor as SupabaseClient["storage"]);
      }

      return valor;
    },
  });
}

const clienteBase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  global: {
    fetch: criarFetchComInterceptacao(),
  },
});

export const supabase = aplicarInterceptadores(clienteBase);

export const tratarErroSupabase = (modulo: string, erro: unknown) => {
  registrarErroSupabase(modulo, erro);
  return {
    sucesso: false,
    mensagem:
      (typeof erro === "object" &&
      erro !== null &&
      "message" in erro &&
      typeof (erro as { message: unknown }).message === "string"
        ? (erro as { message: string }).message
        : null) || "Ocorreu um erro inesperado na comunicação com o servidor.",
  };
};
