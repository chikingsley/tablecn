import * as React from "react";

import { getCellKey } from "@/lib/data-grid";
import type {
  CellPosition,
  CellUpdate,
  NavigationDirection,
} from "@/types/data-grid";

import type { DataGridContext } from "./types";

const NON_NAVIGABLE_COLUMN_IDS = new Set(["select", "actions"]);
const SCROLL_SYNC_RETRY_COUNT = 16;

function useDataGridEditing<TData>(
  ctx: DataGridContext<TData>,
  focusCell: (rowIndex: number, columnId: string) => void,
  focusCellWrapper: (rowIndex: number, columnId: string) => void,
  navigateCell: (direction: NavigationDirection) => void,
  onSelectionClear: () => void,
  releaseFocusGuard: (immediate?: boolean) => void
) {
  const {
    store,
    propsRef,
    tableRef,
    dataGridRef,
    headerRef,
    footerRef,
    rowMapRef,
    cellMapRef,
    rowVirtualizerRef,
    focusGuardRef,
    navigableColumnIds,
  } = ctx;

  const onDataUpdate = React.useCallback(
    (updates: CellUpdate | CellUpdate[]) => {
      if (propsRef.current.readOnly) {
        return;
      }

      const updateArray = Array.isArray(updates) ? updates : [updates];

      if (updateArray.length === 0) {
        return;
      }

      const currentTable = tableRef.current;
      const currentData = propsRef.current.data;
      const rows = currentTable?.getRowModel().rows;

      const rowUpdatesMap = new Map<number, Omit<CellUpdate, "rowIndex">[]>();

      for (const update of updateArray) {
        if (rows && currentTable) {
          const row = rows[update.rowIndex];
          if (!row) {
            continue;
          }

          const originalData = row.original;
          const originalRowIndex = currentData.indexOf(originalData);

          const targetIndex =
            originalRowIndex !== -1 ? originalRowIndex : update.rowIndex;

          const existingUpdates = rowUpdatesMap.get(targetIndex) ?? [];
          existingUpdates.push({
            columnId: update.columnId,
            value: update.value,
          });
          rowUpdatesMap.set(targetIndex, existingUpdates);
        } else {
          const existingUpdates = rowUpdatesMap.get(update.rowIndex) ?? [];
          existingUpdates.push({
            columnId: update.columnId,
            value: update.value,
          });
          rowUpdatesMap.set(update.rowIndex, existingUpdates);
        }
      }

      const tableRowCount = rows?.length ?? currentData.length;
      const newData: TData[] = new Array(tableRowCount);

      for (let i = 0; i < tableRowCount; i++) {
        const updates = rowUpdatesMap.get(i);
        const existingRow = currentData[i];
        const tableRow = rows?.[i];

        if (updates) {
          const baseRow = existingRow ?? tableRow?.original ?? ({} as TData);
          const updatedRow = { ...baseRow } as Record<string, unknown>;
          for (const { columnId, value } of updates) {
            updatedRow[columnId] = value;
          }
          newData[i] = updatedRow as TData;
        } else {
          newData[i] = existingRow ?? tableRow?.original ?? ({} as TData);
        }
      }

      propsRef.current.onDataChange?.(newData);
    },
    [propsRef, tableRef]
  );

  const onRowsDelete = React.useCallback(
    async (rowIndices: number[]) => {
      if (
        propsRef.current.readOnly ||
        !propsRef.current.onRowsDelete ||
        rowIndices.length === 0
      ) {
        return;
      }

      const currentTable = tableRef.current;
      const rows = currentTable?.getRowModel().rows;

      if (!rows || rows.length === 0) {
        return;
      }

      const currentState = store.getState();
      const currentFocusedColumn =
        currentState.focusedCell?.columnId ?? navigableColumnIds[0];

      const minDeletedRowIndex = Math.min(...rowIndices);

      const rowsToDelete: TData[] = [];
      for (const rowIndex of rowIndices) {
        const row = rows[rowIndex];
        if (row) {
          rowsToDelete.push(row.original);
        }
      }

      await propsRef.current.onRowsDelete(rowsToDelete, rowIndices);

      store.batch(() => {
        store.setState("selectionState", {
          selectedCells: new Set(),
          selectionRange: null,
          isSelecting: false,
        });
        store.setState("rowSelection", {});
        store.setState("editingCell", null);
      });

      requestAnimationFrame(() => {
        const currentTable = tableRef.current;
        const currentRows = currentTable?.getRowModel().rows ?? [];
        const newRowCount = currentRows.length ?? propsRef.current.data.length;

        if (newRowCount > 0 && currentFocusedColumn) {
          const targetRowIndex = Math.min(minDeletedRowIndex, newRowCount - 1);
          focusCell(targetRowIndex, currentFocusedColumn);
        }
      });
    },
    [propsRef, store, navigableColumnIds, focusCell, tableRef]
  );

  const onCellEditingStart = React.useCallback(
    (rowIndex: number, columnId: string) => {
      if (propsRef.current.readOnly) {
        return;
      }

      store.batch(() => {
        store.setState("focusedCell", { rowIndex, columnId });
        store.setState("editingCell", { rowIndex, columnId });
      });
    },
    [store, propsRef]
  );

  const onCellEditingStop = React.useCallback(
    (opts?: { moveToNextRow?: boolean; direction?: NavigationDirection }) => {
      const currentState = store.getState();
      const currentEditing = currentState.editingCell;

      store.setState("editingCell", null);

      if (opts?.moveToNextRow && currentEditing) {
        const { rowIndex, columnId } = currentEditing;
        const currentTable = tableRef.current;
        const rows = currentTable?.getRowModel().rows ?? [];
        const rowCount = rows.length ?? propsRef.current.data.length;

        const nextRowIndex = rowIndex + 1;
        if (nextRowIndex < rowCount) {
          requestAnimationFrame(() => {
            focusCell(nextRowIndex, columnId);
          });
        }
      } else if (opts?.direction && currentEditing) {
        const { rowIndex, columnId } = currentEditing;
        focusCell(rowIndex, columnId);
        requestAnimationFrame(() => {
          navigateCell(opts.direction ?? "right");
        });
      } else if (currentEditing) {
        const { rowIndex, columnId } = currentEditing;
        focusCellWrapper(rowIndex, columnId);
      }
    },
    [store, propsRef, focusCell, navigateCell, focusCellWrapper, tableRef]
  );

  const onScrollToRow = React.useCallback(
    async (opts: Partial<CellPosition>) => {
      const rowIndex = opts?.rowIndex ?? 0;
      const columnId = opts?.columnId;

      focusGuardRef.current = true;

      const navigableIds = propsRef.current.columns
        .map((c) => {
          if (c.id) {
            return c.id;
          }
          if ("accessorKey" in c) {
            return c.accessorKey as string;
          }
          return undefined;
        })
        .filter((id): id is string => Boolean(id))
        .filter((c) => !NON_NAVIGABLE_COLUMN_IDS.has(c));

      const targetColumnId = columnId ?? navigableIds[0];

      if (!targetColumnId) {
        releaseFocusGuard(true);
        return;
      }

      const rowVirtualizer = rowVirtualizerRef.current;
      if (!rowVirtualizer) {
        releaseFocusGuard(true);
        return;
      }

      async function onScrollAndFocus(retryCount: number) {
        if (!(targetColumnId && rowVirtualizer)) {
          return;
        }
        const currentRowCount = propsRef.current.data.length;

        if (rowIndex >= currentRowCount && retryCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          await onScrollAndFocus(retryCount - 1);
          return;
        }

        const safeRowIndex = Math.min(
          rowIndex,
          Math.max(0, currentRowCount - 1)
        );

        const isBottomHalf = safeRowIndex > currentRowCount / 2;
        rowVirtualizer.scrollToIndex(safeRowIndex, {
          align: isBottomHalf ? "end" : "start",
        });

        await new Promise((resolve) => requestAnimationFrame(resolve));

        const container = dataGridRef.current;
        const targetRow = rowMapRef.current.get(safeRowIndex);

        if (container && targetRow) {
          const containerRect = container.getBoundingClientRect();
          const headerHeight =
            headerRef.current?.getBoundingClientRect().height ?? 0;
          const footerHeight =
            footerRef.current?.getBoundingClientRect().height ?? 0;

          const viewportTop = containerRect.top + headerHeight + 1;
          const viewportBottom = containerRect.bottom - footerHeight - 1;

          const rowRect = targetRow.getBoundingClientRect();
          const isFullyVisible =
            rowRect.top >= viewportTop && rowRect.bottom <= viewportBottom;

          if (!isFullyVisible) {
            if (rowRect.top < viewportTop) {
              container.scrollTop -= viewportTop - rowRect.top;
            } else if (rowRect.bottom > viewportBottom) {
              container.scrollTop += rowRect.bottom - viewportBottom;
            }
          }
        }

        store.batch(() => {
          store.setState("focusedCell", {
            rowIndex: safeRowIndex,
            columnId: targetColumnId,
          });
          store.setState("editingCell", null);
        });

        const cellKey = getCellKey(safeRowIndex, targetColumnId);
        const cellElement = cellMapRef.current.get(cellKey);

        if (cellElement) {
          cellElement.focus();
          releaseFocusGuard();
        } else if (retryCount > 0) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          await onScrollAndFocus(retryCount - 1);
        } else {
          dataGridRef.current?.focus();
          releaseFocusGuard();
        }
      }

      await onScrollAndFocus(SCROLL_SYNC_RETRY_COUNT);
    },
    [
      rowVirtualizerRef,
      propsRef,
      store,
      releaseFocusGuard,
      focusGuardRef,
      dataGridRef,
      headerRef,
      footerRef,
      rowMapRef,
      cellMapRef,
    ]
  );

  const onRowAdd = React.useCallback(
    async (event?: React.MouseEvent<HTMLDivElement>) => {
      if (propsRef.current.readOnly || !propsRef.current.onRowAdd) {
        return;
      }

      const initialRowCount = propsRef.current.data.length;

      let result: Partial<CellPosition> | null;
      try {
        result = await propsRef.current.onRowAdd(event);
      } catch {
        return;
      }

      if (result === null || event?.defaultPrevented) {
        return;
      }

      onSelectionClear();

      const targetRowIndex = result.rowIndex ?? initialRowCount;
      const targetColumnId = result.columnId;

      onScrollToRow({
        rowIndex: targetRowIndex,
        columnId: targetColumnId,
      });
    },
    [propsRef, onScrollToRow, onSelectionClear]
  );

  return {
    onDataUpdate,
    onRowsDelete,
    onCellEditingStart,
    onCellEditingStop,
    onScrollToRow,
    onRowAdd,
  };
}

export { useDataGridEditing };
