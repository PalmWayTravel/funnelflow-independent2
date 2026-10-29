import React from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import AccountPendingScreen from "@/components/AccountPendingScreen";

// A user without an assigned account only sees the waiting screen.
export default function AccountGate() {
  const { user } = useAuth();
  if (user && user.role !== "admin" && !user.account_id) return <AccountPendingScreen />;
  return <Outlet />;
}