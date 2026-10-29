import React from "react";
import { useAuth } from "@/lib/AuthContext";

// Renders a different screen for the admin and the client role on the same route.
export default function RoleView({ admin, client }) {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "admin" ? admin : client;
}