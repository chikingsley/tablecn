import * as React from "react";

import { getCellKey } from "@/lib/data-grid";
import type { CellPosition, SearchState } from "@/types/data-grid";

import type { DataGridContext } from "./types";
import { useStore } from "./use-data-grid-store";

function useDataGridSearch<TData>(
  ctx: DataGridContext<TData>,
  focusCell: (rowIndex: number, columnId: string) => void
) {
  const {
    store,
    propsRef,
    tableRef,
    rowVirtualizerRef,
    dataGridRef,
    columnIds,
  } = ctx;

  const searchMatches = useStore(store, (state) => state.searchMatches);
  const matchIndex = useStore(store, (state) => state.matchIndex);
  const searchOpen = useStore(store, (state) => state.searchOpen);
  const searchQuery = useStore(store, (state) => state.searchQuery);

  const onSearchOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) {
        store.setState("searchOpen", true);
        return;
      }

      const currentState = store.getState();
      const currentMatch =
        currentState.matchIndex >= 0 &&
        currentState.searchMatches[currentState.matchIndex];

      store.batch(() => {
        store.setState("searchOpen", false);
        store.setState("searchQuery", "");
        store.setState("searchMatches", []);
        store.setState("matchIndex", -1);

        if (currentMatch) {
          store.setState("focusedCell", {
            rowIndex: currentMatch.rowIndex,
            columnId: currentMatch.columnId,
          });
        }
      });

      if (
        dataGridRef.current &&
        document.activeElement !== dataGridRef.current
      ) {
        dataGridRef.current.focus();
      }
    },
    [store, dataGridRef]
  );

  const onSearch = React.useCallback(
    (query: string) => {
      if (!query.trim()) {
        store.batch(() => {
          store.setState("searchMatches", []);
          store.setState("matchIndex", -1);
        });
        return;
      }

      const matches: CellPosition[] = [];
      const currentTable = tableRef.current;
      const rows = currentTable?.getRowModel().rows ?? [];

      const lowerQuery = query.toLowerCase();

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (!row) {
          continue;
        }

        const cellById = new Map(
          row.getVisibleCells().map((c) => [c.column.id, c])
        );

        for (const columnId of columnIds) {
          const cell = cellById.get(columnId);
          if (!cell) {
            continue;
          }

          const value = cell.getValue();
          const stringValue = String(value ?? "").toLowerCase();

          if (stringValue.includes(lowerQuery)) {
            matches.push({ rowIndex, columnId });
          }
        }
      }

      store.batch(() => {
        store.setState("searchMatches", matches);
        store.setState("matchIndex", matches.length > 0 ? 0 : -1);
      });

      if (matches.length > 0 && matches[0]) {
        const firstMatch = matches[0];
        rowVirtualizerRef.current?.scrollToIndex(firstMatch.rowIndex, {
          align: "center",
        });
      }
    },
    [columnIds, store, tableRef, rowVirtualizerRef]
  );

  const onSearchQueryChange = React.useCallback(
    (query: string) => store.setState("searchQuery", query),
    [store]
  );

  const onNavigateToPrevMatch = React.useCallback(() => {
    const currentState = store.getState();
    if (currentState.searchMatches.length === 0) {
      return;
    }

    const prevIndex =
      currentState.matchIndex - 1 < 0
        ? currentState.searchMatches.length - 1
        : currentState.matchIndex - 1;
    const match = currentState.searchMatches[prevIndex];

    if (match) {
      rowVirtualizerRef.current?.scrollToIndex(match.rowIndex, {
        align: "center",
      });

      requestAnimationFrame(() => {
        store.setState("matchIndex", prevIndex);
        requestAnimationFrame(() => {
          focusCell(match.rowIndex, match.columnId);
        });
      });
    }
  }, [store, focusCell, rowVirtualizerRef]);

  const onNavigateToNextMatch = React.useCallback(() => {
    const currentState = store.getState();
    if (currentState.searchMatches.length === 0) {
      return;
    }

    const nextIndex =
      (currentState.matchIndex + 1) % currentState.searchMatches.length;
    const match = currentState.searchMatches[nextIndex];

    if (match) {
      rowVirtualizerRef.current?.scrollToIndex(match.rowIndex, {
        align: "center",
      });

      requestAnimationFrame(() => {
        store.setState("matchIndex", nextIndex);
        requestAnimationFrame(() => {
          focusCell(match.rowIndex, match.columnId);
        });
      });
    }
  }, [store, focusCell, rowVirtualizerRef]);

  const searchMatchSet = React.useMemo(() => {
    return new Set(
      searchMatches.map((m) => getCellKey(m.rowIndex, m.columnId))
    );
  }, [searchMatches]);

  const getIsSearchMatch = React.useCallback(
    (rowIndex: number, columnId: string) => {
      return searchMatchSet.has(getCellKey(rowIndex, columnId));
    },
    [searchMatchSet]
  );

  const getIsActiveSearchMatch = React.useCallback(
    (rowIndex: number, columnId: string) => {
      const currentState = store.getState();
      if (currentState.matchIndex < 0) {
        return false;
      }
      const currentMatch = currentState.searchMatches[currentState.matchIndex];
      return (
        currentMatch?.rowIndex === rowIndex &&
        currentMatch?.columnId === columnId
      );
    },
    [store]
  );

  const searchMatchesByRow = React.useMemo(() => {
    if (searchMatches.length === 0) {
      return null;
    }
    const rowMap = new Map<number, Set<string>>();
    for (const match of searchMatches) {
      let columnSet = rowMap.get(match.rowIndex);
      if (!columnSet) {
        columnSet = new Set<string>();
        rowMap.set(match.rowIndex, columnSet);
      }
      columnSet.add(match.columnId);
    }
    return rowMap;
  }, [searchMatches]);

  const activeSearchMatch = React.useMemo<CellPosition | null>(() => {
    if (matchIndex < 0 || searchMatches.length === 0) {
      return null;
    }
    return searchMatches[matchIndex] ?? null;
  }, [searchMatches, matchIndex]);

  const searchState = React.useMemo<SearchState | undefined>(() => {
    if (!propsRef.current.enableSearch) {
      return undefined;
    }

    return {
      searchMatches,
      matchIndex,
      searchOpen,
      onSearchOpenChange,
      searchQuery,
      onSearchQueryChange,
      onSearch,
      onNavigateToNextMatch,
      onNavigateToPrevMatch,
    };
  }, [
    propsRef,
    searchMatches,
    matchIndex,
    searchOpen,
    onSearchOpenChange,
    searchQuery,
    onSearchQueryChange,
    onSearch,
    onNavigateToNextMatch,
    onNavigateToPrevMatch,
  ]);

  return {
    onSearchOpenChange,
    onSearch,
    onSearchQueryChange,
    onNavigateToPrevMatch,
    onNavigateToNextMatch,
    getIsSearchMatch,
    getIsActiveSearchMatch,
    searchState,
    searchMatchesByRow,
    activeSearchMatch,
  };
}

export { useDataGridSearch };
