import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import ChatPanel from "@/components/agent/ChatPanel";

export default function ComplaintAssistant() {
  return (
    <div>
      <PageHeader
        title="Panaszkezelő asszisztens"
        subtitle="Új panaszok feldolgozása, kategorizálás és válaszjavaslat"
        action={<Button asChild variant="outline"><Link to="/complaints">Vissza a panaszokhoz</Link></Button>}
      />
      <ChatPanel
        agentName="complaint_manager"
        intro="Kérdezz a panaszokról, vagy írd be: „Dolgozd fel a függő panaszokat”. Az asszisztens kategorizál, prioritást állapít meg, összefoglalót és válaszjavaslatot készít, szükség esetén utókövetési feladatot hoz létre."
        placeholder="Írj az asszisztensnek…"
      />
    </div>
  );
}