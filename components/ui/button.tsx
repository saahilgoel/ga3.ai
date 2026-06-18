import * as React from "react";

type Variant = "default" | "outline" | "ghost";
type Size = "default" | "sm" | "lg";

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
  }
>(function Button({ className = "", variant = "default", size = "default", ...props }, ref) {
  const base =
    "inline-flex items-center justify-center font-medium rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)] disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<Variant, string> = {
    default:
      "bg-[color:var(--neon)] text-white hover:bg-[color:var(--neon-bright)] neon-glow",
    outline:
      "border border-[color:var(--border)] bg-transparent text-[color:var(--foreground)] hover:bg-[color:var(--muted)]",
    ghost: "bg-transparent hover:bg-[color:var(--muted)] text-[color:var(--foreground)]",
  };
  const sizes: Record<Size, string> = {
    default: "h-10 px-4 text-sm",
    sm: "h-8 px-3 text-xs",
    lg: "h-12 px-6 text-base",
  };
  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});
