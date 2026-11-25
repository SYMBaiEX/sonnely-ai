// The sign-in gate: what a signed-out visitor sees where a signed-in section would be.
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button, Card, CardTitle, Input } from "@repo/ui";
import { useWorkspaceSession } from "./frame.tsx";

/** Asks for a wallet where the section needs one; the session machine opens the workspace. */
export function SignInGate({ message }: { message: string }) {
  const session = useWorkspaceSession();
  const [wallet, setWallet] = useState("");
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <Card className="items-center gap-4 p-8">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock size={18} aria-hidden />
        </span>
        <CardTitle>Workspace sign-in</CardTitle>
        <p className="text-sm text-muted-foreground">{message}</p>
        <form
          className="flex w-full flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (wallet.trim()) void session.send({ type: "signIn", wallet: wallet.trim() });
          }}
        >
          <Input
            aria-label="Solana wallet address"
            placeholder="Solana wallet address"
            className="font-mono text-xs"
            value={wallet}
            onChange={(event) => setWallet(event.target.value)}
          />
          <Button type="submit" disabled={!wallet.trim()}>
            Connect a Solana wallet
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Signing in proves control of a Solana wallet. It never sends a transaction or moves funds.
        </p>
      </Card>
    </div>
  );
}
