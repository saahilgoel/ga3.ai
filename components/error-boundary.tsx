"use client";

import { Component, type ReactNode } from "react";

// Generic client error boundary. Wrap any risky render (charts, generative-UI
// tool cards) so a single failure degrades to a fallback instead of taking
// down the whole page.
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; label?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: Error) {
    console.warn(
      `[error-boundary${this.props.label ? `:${this.props.label}` : ""}]`,
      err.message
    );
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
