import { useCallback, useEffect, useState } from "react";
import { useDeliveryCliente } from "./useDeliveryCliente";
import {
  buscarClienteDeliveryPorCelular,
  garantirClienteCheckout,
  listarEnderecos,
  type ClienteDelivery,
} from "../lib/deliveryCliente";
import {
  lerGuestDeliveryLocal,
  salvarEnderecoDeliveryLocal,
  salvarGuestDeliveryLocal,
} from "../lib/deliveryGuestStorage";
import { salvarRascunhoEndereco } from "../pages/delivery/DeliveryEndereco";
import {
  formatarTelefoneBr,
  mensagemTelefoneInvalido,
  telefoneCelularValido,
} from "../lib/telefone";

/**
 * Cliente da sessão delivery: Auth (se houver) ou guest por telefone no localStorage.
 */
export function useClienteDeliverySessao() {
  const {
    cliente: clienteAuth,
    carregando: authLoading,
    sair: sairAuth,
  } = useDeliveryCliente();

  const [clienteLocal, setClienteLocal] = useState<ClienteDelivery | null>(
    null,
  );
  const [resolvendoGuest, setResolvendoGuest] = useState(true);

  const cliente = clienteAuth || clienteLocal;

  useEffect(() => {
    if (authLoading) return;
    if (clienteAuth) {
      setClienteLocal(null);
      setResolvendoGuest(false);
      return;
    }

    let ativo = true;
    void (async () => {
      try {
        const g = lerGuestDeliveryLocal();
        if (!g?.telefone || !telefoneCelularValido(g.telefone)) {
          if (ativo) setClienteLocal(null);
          return;
        }
        const c = await buscarClienteDeliveryPorCelular(g.telefone);
        if (ativo) setClienteLocal(c);
      } catch {
        if (ativo) setClienteLocal(null);
      } finally {
        if (ativo) setResolvendoGuest(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [authLoading, clienteAuth]);

  const identificarPorTelefone = useCallback(
    async (
      telefone: string,
      opts?: { criarSeAusente?: boolean; nome?: string },
    ) => {
      const erro = mensagemTelefoneInvalido(telefone);
      if (erro) throw new Error(erro);

      let encontrado = await buscarClienteDeliveryPorCelular(telefone);

      if (!encontrado) {
        if (!opts?.criarSeAusente) {
          throw new Error(
            "Não encontramos cadastro neste celular. Faça um pedido no checkout primeiro.",
          );
        }
        const digitos = telefone.replace(/\D/g, "");
        encontrado = await garantirClienteCheckout({
          nome:
            opts.nome?.trim() ||
            `Cliente ${digitos.slice(-4)}`,
          celular: telefone,
          email: null,
        });
      }

      setClienteLocal(encontrado);
      salvarGuestDeliveryLocal({
        nome: encontrado.nome,
        telefone: formatarTelefoneBr(telefone),
        email: encontrado.email,
        clienteId: encontrado.id,
      });

      try {
        const lista = await listarEnderecos(encontrado.id);
        const padrao = lista.find((e) => e.padrao) || lista[0];
        if (padrao) {
          salvarEnderecoDeliveryLocal({
            cep: padrao.cep,
            rua: padrao.rua,
            numero: padrao.numero,
            bairro: padrao.bairro,
            cidade: padrao.cidade,
            uf: padrao.uf,
            complemento: padrao.complemento || "",
            referencia: padrao.referencia || "",
            latitude: padrao.latitude,
            longitude: padrao.longitude,
          });
          salvarRascunhoEndereco({
            cep: padrao.cep,
            rua: padrao.rua,
            numero: padrao.numero,
            bairro: padrao.bairro,
            cidade: padrao.cidade,
            uf: padrao.uf,
            complemento: padrao.complemento || undefined,
            referencia: padrao.referencia || undefined,
            latitude: padrao.latitude,
            longitude: padrao.longitude,
          });
        }
      } catch {
        /* endereço opcional */
      }

      return encontrado;
    },
    [],
  );

  const limparSessaoLocal = useCallback(async () => {
    setClienteLocal(null);
    salvarGuestDeliveryLocal({
      nome: "",
      telefone: "",
      email: null,
      clienteId: null,
    });
    try {
      await sairAuth();
    } catch {
      /* sem sessão Auth */
    }
  }, [sairAuth]);

  return {
    cliente,
    carregando: authLoading || resolvendoGuest,
    precisaIdentificar: !authLoading && !resolvendoGuest && !cliente,
    identificarPorTelefone,
    limparSessaoLocal,
  };
}
