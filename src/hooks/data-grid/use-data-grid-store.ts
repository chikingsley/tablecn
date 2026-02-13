import * as React from "react";

import { useLazyRef } from "@/hooks/use-lazy-ref";
import { getCellKey, getRowHeightValue, parseCellKey } from "@/lib/data-grid";
import type { RowHeightValue } from "@/types/data-grid";

import type { DataGridState, DataGridStore } from "./types";

function useStore<T>(
  store: DataGridStore,
  selector: (state: DataGridState) => T
): T {
  const getSnapshot = React.useCallback(
    () => selector(store.getState()),
    [store, selector]
  );

  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

function useDataGridStore(
  initialState: import("@tanstack/react-table").InitialTableState | undefined,
  rowHeightProp: RowHeightValue
) {
  const listenersRef = useLazyRef(() => new Set<() => void>());

  const stateRef = useLazyRef<DataGridState>(() => {
    return {
      sorting: initialState?.sorting ?? [],
      columnFilters: initialState?.columnFilters ?? [],
      rowHeight: rowHeightProp,
      rowSelection: initialState?.rowSelection ?? {},
      selectionState: {
        selectedCells: new Set(),
        selectionRange: null,
        isSelecting: false,
      },
      focusedCell: null,
      editingCell: null,
      cutCells: new Set(),
      contextMenu: {
        open: false,
        x: 0,
        y: 0,
      },
      searchQuery: "",
      searchMatches: [],
      matchIndex: -1,
      searchOpen: false,
      lastClickedRowIndex: null,
      pasteDialog: {
        open: false,
        rowsNeeded: 0,
        clipboardText: "",
      },
    };
  });

  const store = React.useMemo<DataGridStore>(() => {
    let isBatching = false;
    let pendingNotification = false;

    return {
      subscribe: (callback) => {
        listenersRef.current.add(callback);
        return () => listenersRef.current.delete(callback);
      },
      getState: () => stateRef.current,
      setState: (key, value) => {
        if (Object.is(stateRef.current[key], value)) {
          return;
        }
        stateRef.current[key] = value;

        if (isBatching) {
          pendingNotification = true;
        } else if (!pendingNotification) {
          pendingNotification = true;
          queueMicrotask(() => {
            pendingNotification = false;
            store.notify();
          });
        }
      },
      notify: () => {
        for (const listener of listenersRef.current) {
          listener();
        }
      },
      batch: (fn) => {
        if (isBatching) {
          fn();
          return;
        }

        isBatching = true;
        const wasPending = pendingNotification;
        pendingNotification = false;

        try {
          fn();
        } finally {
          isBatching = false;
          if (pendingNotification || wasPending) {
            pendingNotification = false;
            store.notify();
          }
        }
      },
    };
  }, [listenersRef, stateRef]);

  const focusedCell = useStore(store, (state) => state.focusedCell);
  const editingCell = useStore(store, (state) => state.editingCell);
  const selectionState = useStore(store, (state) => state.selectionState);
  const searchQuery = useStore(store, (state) => state.searchQuery);
  const searchMatches = useStore(store, (state) => state.searchMatches);
  const matchIndex = useStore(store, (state) => state.matchIndex);
  const searchOpen = useStore(store, (state) => state.searchOpen);
  const sorting = useStore(store, (state) => state.sorting);
  const columnFilters = useStore(store, (state) => state.columnFilters);
  const rowSelection = useStore(store, (state) => state.rowSelection);
  const rowHeight = useStore(store, (state) => state.rowHeight);
  const contextMenu = useStore(store, (state) => state.contextMenu);
  const pasteDialog = useStore(store, (state) => state.pasteDialog);

  const rowHeightValue = getRowHeightValue(rowHeight);

  const prevCellSelectionMapRef = useLazyRef(
    () => new Map<number, Set<string>>()
  );

  const cellSelectionMap = React.useMemo(() => {
    const selectedCells = selectionState.selectedCells;

    if (selectedCells.size === 0) {
      prevCellSelectionMapRef.current.clear();
      return null;
    }

    const newRowCells = new Map<number, Set<string>>();

    for (const cellKey of selectedCells) {
      const { rowIndex } = parseCellKey(cellKey);
      let rowSet = newRowCells.get(rowIndex);
      if (!rowSet) {
        rowSet = new Set<string>();
        newRowCells.set(rowIndex, rowSet);
      }
      rowSet.add(cellKey);
    }

    const stableMap = new Map<number, Set<string>>();
    for (const [rowIndex, newSet] of newRowCells) {
      const prevSet = prevCellSelectionMapRef.current.get(rowIndex);
      if (
        prevSet &&
        prevSet.size === newSet.size &&
        [...newSet].every((key) => prevSet.has(key))
      ) {
        stableMap.set(rowIndex, prevSet);
      } else {
        stableMap.set(rowIndex, newSet);
      }
    }

    prevCellSelectionMapRef.current = stableMap;
    return stableMap;
  }, [selectionState.selectedCells, prevCellSelectionMapRef]);

  return {
    store,
    stateRef,
    listenersRef,
    focusedCell,
    editingCell,
    selectionState,
    searchQuery,
    searchMatches,
    matchIndex,
    searchOpen,
    sorting,
    columnFilters,
    rowSelection,
    rowHeight,
    rowHeightValue,
    contextMenu,
    pasteDialog,
    cellSelectionMap,
  };
}

export { useDataGridStore, useStore };
