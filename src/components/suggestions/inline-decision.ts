"use client";

import { createContext, useContext } from "react";
import type { FormState } from "@/lib/auth/form-state";

export const InlineDecisionContext = createContext<((warning?: string) => void) | null>(null);

export function useInlineDecision<T extends FormState, Payload>(action: (previous: T, payload: Payload) => Promise<T & { warning?: string }>) {
  const onDecision = useContext(InlineDecisionContext);
  return async (previous: T, payload: Payload) => {
    const result = await action(previous, payload);
    if (result.message && !result.error) onDecision?.(result.warning);
    return result;
  };
}
