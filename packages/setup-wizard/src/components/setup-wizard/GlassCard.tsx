import React from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassCard({ children, className = "" }: GlassCardProps) {
  return (
    <div
      className={`
        bg-white/50 dark:bg-primary/5 
        rounded-3xl p-6 
        border border-primary/5
        backdrop-blur-md
        shadow-sm hover:shadow-md transition-shadow
        ${className}
      `}
    >
      {children}
    </div>
  );
}
