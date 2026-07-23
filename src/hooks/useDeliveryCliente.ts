import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  cadastroDeliveryCompleto,
  resolverClienteAposAuth,
  type ClienteDelivery,
} from "../lib/deliveryCliente";
import { lerGuestDeliveryLocal } from "../lib/deliveryGuestStorage";

export function useDeliveryCliente() {
  const {
    usuario,
    carregando: authCarregando,
    entrarComGoogle,
    sair,
    enviarOtpSms,
    verificarOtpSms,
  } = useAuth();
  const [cliente, setCliente] = useState<ClienteDelivery | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = async () => {
    if (!usuario?.id) {
      setCliente(null);
      setCarregando(false);
      return;
    }
    try {
      setCarregando(true);
      const guest = lerGuestDeliveryLocal();
      const c = await resolverClienteAposAuth({
        authUserId: usuario.id,
        phone: usuario.phone || null,
        nomeSugestao: guest?.nome || usuario.user_metadata?.full_name || null,
        emailSugestao: usuario.email || guest?.email || null,
      });
      setCliente(c);
    } catch (e) {
      console.error("[DELIVERY AUTH]", e);
      setCliente(null);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (authCarregando) return;
    void recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id, usuario?.phone, authCarregando]);

  return {
    usuario,
    cliente,
    carregando: authCarregando || carregando,
    logado: Boolean(usuario),
    cadastroCompleto: cadastroDeliveryCompleto(cliente),
    entrarComGoogle,
    enviarOtpSms,
    verificarOtpSms,
    sair,
    recarregar,
  };
}
