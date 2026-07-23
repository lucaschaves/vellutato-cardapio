import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function DeliveryAuthCallback() {
  const { sessao, carregando } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (carregando) return;
    if (sessao) navigate("/delivery/cadastro", { replace: true });
    else navigate("/delivery", { replace: true });
  }, [sessao, carregando, navigate]);

  if (!carregando && !sessao) {
    return <Navigate to="/delivery" replace />;
  }

  return (
    <div className="flex h-40 items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" />
    </div>
  );
}
