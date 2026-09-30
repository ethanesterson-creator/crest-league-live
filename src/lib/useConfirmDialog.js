"use client";

import { useCallback, useRef, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";

// Drop-in async replacement for the native confirm() dialog, backed by the
// app's own dark-themed ConfirmModal instead of the unstylable browser one.
//
// Usage (mirrors confirm() almost exactly):
//   const { confirmAsync, confirmModal } = useConfirmDialog();
//   ...
//   if (!(await confirmAsync("Delete this game?"))) return;
//   ...
//   return (<>{confirmModal}{/* rest of page */}</>);
export function useConfirmDialog() {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirmAsync = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        message,
        title: opts.title || "Are you sure?",
        danger: opts.danger !== false,
        confirmLabel: opts.confirmLabel || "Confirm",
        cancelLabel: opts.cancelLabel || "Cancel",
      });
    });
  }, []);

  function resolveWith(result) {
    setState(null);
    resolverRef.current?.(result);
    resolverRef.current = null;
  }

  const confirmModal = state ? (
    <ConfirmModal
      open
      title={state.title}
      message={state.message}
      danger={state.danger}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      onConfirm={() => resolveWith(true)}
      onCancel={() => resolveWith(false)}
    />
  ) : null;

  return { confirmAsync, confirmModal };
}
