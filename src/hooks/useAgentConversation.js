import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export default function useAgentConversation(agentName) {
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const open = useCallback(async (id) => {
    const list = await base44.agents.listConversations({ agent_name: agentName });
    setConversations(list || []);
    const target = id ? (list || []).find((c) => c.id === id) : (list || [])[0];
    if (!target) { setConversation(null); setMessages([]); return; }
    const full = await base44.agents.getConversation(target.id);
    setConversation(full);
    setMessages(full.messages || []);
  }, [agentName]);

  useEffect(() => {
    let active = true;
    (async () => {
      try { await open(); } catch (e) { /* üres állapot */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!conversation?.id) return undefined;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      setSending(false);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  const startNew = async () => {
    const created = await base44.agents.createConversation({
      agent_name: agentName,
      metadata: { name: `Panaszkezelés — ${new Date().toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" })}` },
    });
    setConversation(created);
    setMessages(created.messages || []);
    await open(created.id);
  };

  const send = async (content) => {
    const value = content.trim();
    if (!value) return;
    let target = conversation;
    if (!target) {
      target = await base44.agents.createConversation({ agent_name: agentName, metadata: { name: "Panaszkezelés" } });
      setConversation(target);
    }
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: value }]);
    try {
      await base44.agents.addMessage(target, { role: "user", content: value });
    } finally {
      if (!target?.id) setSending(false);
    }
  };

  return { conversations, conversation, messages, loading, sending, send, select: open, startNew };
}