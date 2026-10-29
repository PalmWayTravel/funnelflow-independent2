import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

// Admin-only screens. Client role is redirected to its own landing page,
// so these pages are unreachable by URL, not just hidden from the menu.
export default function AdminOnly({ children }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== "admin") return <Navigate to="/crm" replace />;
  return children;
}