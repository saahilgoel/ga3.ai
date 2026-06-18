"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ComponentProps } from "react";
import { stripEmojis } from "@/lib/strip-emojis";

type CodeProps = ComponentProps<"code"> & { inline?: boolean };

export function MarkdownMessage({ content }: { content: string }) {
  const cleaned = stripEmojis(content);
  return (
    <div className="prose prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-[20px] font-semibold mt-6 mb-3 leading-tight text-[color:var(--text-primary)]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[17px] font-semibold mt-5 mb-2 leading-tight text-[color:var(--text-primary)]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[15px] font-semibold mt-4 mb-2 leading-snug text-[color:var(--text-primary)]">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-[15px] leading-[1.65] my-2.5 text-[color:var(--text-primary)]">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[color:var(--text-primary)]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[color:var(--text-primary)]">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="my-3 ml-5 space-y-1.5 list-disc marker:text-[color:var(--text-tertiary)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 ml-5 space-y-1.5 list-decimal marker:text-[color:var(--text-tertiary)]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-[15px] leading-[1.6] text-[color:var(--text-primary)]">
              {children}
            </li>
          ),
          hr: () => <hr className="my-6 border-[color:var(--border)]" />,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--accent)] hover:underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ inline, children, ...props }: CodeProps) => {
            if (inline) {
              return (
                <code
                  className="font-mono text-[13px] px-1.5 py-0.5 bg-[color:var(--surface-elevated)] rounded text-[color:var(--text-primary)]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className="font-mono text-[13px]" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-4 p-3 bg-[color:var(--surface-elevated)] border border-[color:var(--border)] rounded-md overflow-x-auto text-[13px] leading-[1.6]">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-md border border-[color:var(--border)]">
              <table className="w-full text-[13px] border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-medium text-[color:var(--text-secondary)] bg-[color:var(--surface-elevated)] border-b border-[color:var(--border)]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-[color:var(--border)] last:border-b-0 align-top">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 pl-4 border-l-2 border-[color:var(--accent)] text-[color:var(--text-secondary)]">
              {children}
            </blockquote>
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
