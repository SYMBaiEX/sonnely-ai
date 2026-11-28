// The sign-in gate: what a signed-out visitor sees where a signed-in section would be.
import { Lock } from "lucide-react";
import { useConsoleShell } from "./frame.tsx";
import { useBillingCluster, WalletControl } from "../../shell/wallet.tsx";

/** Asks for a wallet where the section needs one; wallet authentication opens the workspace. */
export function SignInGate({ message }: { message: string }) {
  const shell = useConsoleShell();
  const cluster = useBillingCluster();
  return (
    <div className="empty panel workspace-signin">
      <span className="empty-icon">
        <Lock size={20} aria-hidden />
      </span>
      <h2>Workspace sign-in</h2>
      <p>{message}</p>
      <WalletControl cluster={cluster} onSignIn={shell.signIn} onSignOut={shell.signOut} />
      <p className="caption">Signing in proves control of a Solana wallet. It never sends a transaction or moves funds.</p>
    </div>
  );
}
