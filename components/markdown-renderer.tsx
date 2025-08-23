'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code: ({ className, children, ...props }: any) => {
            const inline = !className;
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          
          if (!inline && language) {
            return (
              <SyntaxHighlighter
                style={oneDark}
                language={language}
                PreTag="div"
                customStyle={{
                  margin: '0.5rem 0',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            );
          }
          
          return (
            <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>
              {children}
            </code>
          );
          },
        // Style tables
        table({ children }) {
          return (
            <div className="overflow-x-auto my-4">
              <table className="border-collapse border border-border">
                {children}
              </table>
            </div>
          );
        },
        thead({ children }) {
          return <thead className="bg-muted">{children}</thead>;
        },
        th({ children }) {
          return (
            <th className="border border-border px-3 py-2 text-left font-semibold">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="border border-border px-3 py-2">{children}</td>
          );
        },
        // Style blockquotes
        blockquote({ children }) {
          return (
            <blockquote className="border-l-4 border-primary pl-4 my-4 italic">
              {children}
            </blockquote>
          );
        },
        // Style links
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline"
            >
              {children}
            </a>
          );
        },
        // Style lists
        ul({ children }) {
          return <ul className="list-disc pl-6 my-2">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-6 my-2">{children}</ol>;
        },
        li({ children }) {
          return <li className="my-1">{children}</li>;
        },
        // Style headings
        h1({ children }) {
          return <h1 className="text-2xl font-bold mt-6 mb-3">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-xl font-semibold mt-5 mb-2">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>;
        },
        h4({ children }) {
          return <h4 className="text-base font-semibold mt-3 mb-1">{children}</h4>;
        },
        h5({ children }) {
          return <h5 className="text-sm font-semibold mt-2 mb-1">{children}</h5>;
        },
        h6({ children }) {
          return <h6 className="text-sm font-semibold mt-2 mb-1">{children}</h6>;
        },
        // Style paragraphs
        p({ children }) {
          return <p className="my-2 leading-relaxed">{children}</p>;
        },
        // Style horizontal rules
        hr() {
          return <hr className="my-6 border-border" />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}