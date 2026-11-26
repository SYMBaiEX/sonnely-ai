// spec/app/admin/index.md, "What the admin reads elsewhere": the machines the admin
// views read and the session the operator signs in with.
import type { Registry } from "../../../../gen/app__admin.ts";
import { useSession as useCookieSession } from "../../session.ts";
import { useRemote } from "../../remote.ts";

export function useAdmin() {
  return useRemote<Registry>("admin");
}

export function useSession() {
  return useCookieSession();
}
