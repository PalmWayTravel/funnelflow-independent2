import React, { createContext, useContext } from "react";
import { useAuth } from "@/lib/AuthContext";

const AccountScopeContext = createContext(null);

// Admin az ügyfél nézetben egy konkrét account nevében nyitja meg ugyanezeket az oldalakat.
export function AccountScopeProvider({ accountId, children }) {
  return (
    <AccountScopeContext.Provider value={{ accountId: accountId || "", isClient: true }}>
      {children}
    </AccountScopeContext.Provider>
  );
}

// A bejelentkezett felhasználóhoz tartozó account, vagy — admin nézetben — a kiválasztott ügyfélé.
export function useAccountScope() {
  const { user } = useAuth();
  const preview = useContext(AccountScopeContext);
  if (preview) return preview;
  return { accountId: user?.account_id || "", isClient: user?.role !== "admin" };
}