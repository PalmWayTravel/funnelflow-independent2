import React, { useEffect, useRef, useState } from "react";
import { Bot, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import useAgentConversation from "@/hooks/useAgentConversation";
import MessageBubble from "./MessageBubble";

export default function ChatPanel({ agentName, intro, placeholder = "Írj üzenetet…" }) {
  const { conversations, conversation, messages, loading, sending, send, select, startNew } = useAgentConversation(agentName);
  const [text, setText] = useState("");
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const submit = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setText("");
    await send(value);
  };

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[26rem] flex-col rounded-2xl border border-border bg-card shadow-card supports-[height:100dvh]:h-[calc(100dvh_-_13rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-brand text-white"><Bot className="h-4 w-4" /></div>
        <div className="mr-auto text-sm font-semibold">Panaszkezelő asszisztens</div>
        {conversations.length > 0 && (
          <Select value={conversation?.id || ""} onValueChange={(v) => select(v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Beszélgetés" /></SelectTrigger>
            <SelectContent>
              {conversations.map((c) => <SelectItem key={c.id} value={c.id}>{c.metadata?.name || "Beszélgetés"}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" onClick={startNew}><Plus className="mr-1 h-3.5 w-3.5" /> Új</Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin p-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>
        ) : messages.length === 0 ? (
          <p className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">{intro}</p>
        ) : (
          messages.map((message, idx) => <MessageBubble key={message.id || idx} message={message} />)
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 border-t border-border p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={placeholder}
          disabled={sending}
        />
        <Button onClick={submit} disabled={sending || !text.trim()} className="gradient-brand text-white hover:opacity-90">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}