import * as React from "react";

import { getCellKey } from "@/lib/data-grid";

import type { DataGridContext } from "./types";

function useDataGridFocus<TData>(ctx: DataGridContext<TData>) {
  const { store, dataGridRef, cellMapRef, focusGuardRef } = ctx;

  const releaseFocusGuard = React.useCallback(
    (immediate = false) => {
      if (immediate) {
        focusGuardRef.current = false;
        return;
      }

      setTimeout(() => {
        focusGuardRef.current = false;
      }, 300);
    },
    [focusGuardRef]
  );

  const focusCellWrapper = React.useCallback(
    (rowIndex: number, columnId: string) => {
      focusGuardRef.current = true;

      requestAnimationFrame(() => {
        const cellKey = getCellKey(rowIndex, columnId);
        const cellWrapperElement = cellMapRef.current.get(cellKey);

        if (!cellWrapperElement) {
          const container = dataGridRef.current;
          if (container) {
            container.focus();
          }
          releaseFocusGuard();
          return;
        }

        cellWrapperElement.focus();
        releaseFocusGuard();
      });
    },
    [focusGuardRef, cellMapRef, dataGridRef, releaseFocusGuard]
  );

  const focusCell = React.useCallback(
    (rowIndex: number, columnId: string) => {
      store.batch(() => {
        store.setState("focusedCell", { rowIndex, columnId });
        store.setState("editingCell", null);
      });

      const currentState = store.getState();

      if (currentState.searchOpen) {
        return;
      }

      focusCellWrapper(rowIndex, columnId);
    },
    [store, focusCellWrapper]
  );

  const blurCell = React.useCallback(() => {
    const currentState = store.getState();
    if (
      currentState.editingCell &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }

    store.batch(() => {
      store.setState("focusedCell", null);
      store.setState("editingCell", null);
    });
  }, [store]);

  const restoreFocus = React.useCallback((element: HTMLDivElement | null) => {
    if (element && document.activeElement !== element) {
      requestAnimationFrame(() => {
        element.focus();
      });
    }
  }, []);

  return {
    releaseFocusGuard,
    focusCellWrapper,
    focusCell,
    blurCell,
    restoreFocus,
  };
}

export { useDataGridFocus };
