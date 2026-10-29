import React from "react";
import { Navigate } from "react-router-dom";

// Everyone lands on their own dashboard (admin: agency view, client: saját vezérlőpult).
export default function HomeRedirect() {
  return <Navigate to="/dashboard" replace />;
}