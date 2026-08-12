import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

interface ModalConfirmacaoProps {
  aberto: boolean;
  titulo: string;
  mensagem: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  carregando?: boolean;
  varianteConfirmar?: "default" | "destructive";
}

export function ModalConfirmacao({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = "Sim",
  textoCancelar = "Não",
  aoConfirmar,
  aoCancelar,
  carregando = false,
  varianteConfirmar = "destructive",
}: ModalConfirmacaoProps) {
  return (
    <AlertDialog
      open={aberto}
      onOpenChange={(open) => {
        if (!open && !carregando) aoCancelar();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{mensagem}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={carregando}>
            {textoCancelar}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={varianteConfirmar}
            disabled={carregando}
            onClick={(e) => {
              e.preventDefault();
              if (carregando) return;
              aoConfirmar();
            }}
          >
            {textoConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
