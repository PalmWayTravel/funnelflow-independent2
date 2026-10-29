import React from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import FunctionDisplay from "./FunctionDisplay";

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
        isUser ? "gradient-brand text-white" : "border border-border bg-secondary/40"
      )}>
        {message.content && (isUser
          ? <p className="whitespace-pre-wrap">{message.content}</p>
          : <ReactMarkdown className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">{message.content}</ReactMarkdown>)}
        {message.tool_calls?.map((toolCall, idx) => <FunctionDisplay key={idx} toolCall={toolCall} />)}
      </div>
    </div>
  );
}