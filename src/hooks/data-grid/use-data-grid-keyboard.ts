import * as React from "react";

import {
  getCellKey,
  getEmptyCellValue,
  parseCellKey,
  scrollCellIntoView,
} from "@/lib/data-grid";
import type {
  CellPosition,
  CellUpdate,
  NavigationDirection,
} from "@/types/data-grid";
import type { DataGridContext } from "./types";

const SEARCH_SHORTCUT_KEY = "f";
const VIEWPORT_OFFSET = 1;

function useDataGridKeyboard<TData>(
  ctx: DataGridContext<TData>,
  handlers: {
    blurCell: () => void;
    navigateCell: (direction: NavigationDirection) => void;
    selectAll: () => void;
    selectRange: (start: CellPosition, end: CellPosition) => void;
    onCellsCopy: () => Promise<void>;
    onCellsCut: () => Promise<void>;
    onCellsPaste: (expandRows?: boolean) => Promise<void>;
    onDataUpdate: (updates: CellUpdate | CellUpdate[]) => void;
    onSelectionClear: () => void;
    onRowsDelete: (rowIndices: number[]) => Promise<void>;
    restoreFocus: (element: HTMLDivElement | null) => void;
    onSearchOpenChange: (open: boolean) => void;
    onNavigateToNextMatch: () => void;
    onNavigateToPrevMatch: () => void;
    onScrollToRow: (opts: Partial<CellPosition>) => Promise<void>;
  }
) {
  const {
    store,
    propsRef,
    tableRef,
    navigableColumnIds,
    dataGridRef,
    cellMapRef,
    rowMapRef,
    headerRef,
    footerRef,
    rowVirtualizerRef,
    dir,
  } = ctx;
  const {
    blurCell,
    navigateCell,
    selectAll,
    selectRange,
    onCellsCopy,
    onCellsCut,
    onCellsPaste,
    onDataUpdate,
    onSelectionClear,
    onRowsDelete,
    restoreFocus,
    onSearchOpenChange,
    onNavigateToNextMatch,
    onNavigateToPrevMatch,
    onScrollToRow,
  } = handlers;

  const onDataGridKeyDown = React.useCallback(
    (event: KeyboardEvent) => {
      const currentState = store.getState();
      const { key, ctrlKey, metaKey, shiftKey, altKey } = event;
      const isCtrlPressed = ctrlKey || metaKey;

      if (
        propsRef.current.enableSearch &&
        isCtrlPressed &&
        !shiftKey &&
        key === SEARCH_SHORTCUT_KEY
      ) {
        event.preventDefault();
        onSearchOpenChange(true);
        return;
      }

      if (
        propsRef.current.enableSearch &&
        currentState.searchOpen &&
        !currentState.editingCell
      ) {
        if (key === "Enter") {
          event.preventDefault();
          if (shiftKey) {
            onNavigateToPrevMatch();
          } else {
            onNavigateToNextMatch();
          }
          return;
        }
        if (key === "Escape") {
          event.preventDefault();
          onSearchOpenChange(false);
          return;
        }
        return;
      }

      if (currentState.editingCell) {
        return;
      }

      if (
        isCtrlPressed &&
        (key === "Backspace" || key === "Delete") &&
        !propsRef.current.readOnly &&
        propsRef.current.onRowsDelete
      ) {
        const rowIndices = new Set<number>();

        const selectedRowIds = Object.keys(currentState.rowSelection);
        if (selectedRowIds.length > 0) {
          const currentTable = tableRef.current;
          const rows = currentTable?.getRowModel().rows ?? [];
          for (const row of rows) {
            if (currentState.rowSelection[row.id]) {
              rowIndices.add(row.index);
            }
          }
        } else if (currentState.selectionState.selectedCells.size > 0) {
          for (const cellKey of currentState.selectionState.selectedCells) {
            const { rowIndex } = parseCellKey(cellKey);
            rowIndices.add(rowIndex);
          }
        } else if (currentState.focusedCell) {
          rowIndices.add(currentState.focusedCell.rowIndex);
        }

        if (rowIndices.size > 0) {
          event.preventDefault();
          onRowsDelete(Array.from(rowIndices));
        }
        return;
      }

      if (!currentState.focusedCell) {
        return;
      }

      let direction: NavigationDirection | null = null;

      if (isCtrlPressed && !shiftKey && key === "a") {
        event.preventDefault();
        selectAll();
        return;
      }

      if (isCtrlPressed && !shiftKey && key === "c") {
        event.preventDefault();
        onCellsCopy();
        return;
      }

      if (
        isCtrlPressed &&
        !shiftKey &&
        key === "x" &&
        !propsRef.current.readOnly
      ) {
        event.preventDefault();
        onCellsCut();
        return;
      }

      if (
        propsRef.current.enablePaste &&
        isCtrlPressed &&
        !shiftKey &&
        key === "v" &&
        !propsRef.current.readOnly
      ) {
        event.preventDefault();
        onCellsPaste();
        return;
      }

      if (
        (key === "Delete" || key === "Backspace") &&
        !isCtrlPressed &&
        !propsRef.current.readOnly
      ) {
        const cellsToClear =
          currentState.selectionState.selectedCells.size > 0
            ? Array.from(currentState.selectionState.selectedCells)
            : currentState.focusedCell
              ? [
                  getCellKey(
                    currentState.focusedCell.rowIndex,
                    currentState.focusedCell.columnId
                  ),
                ]
              : [];

        if (cellsToClear.length > 0) {
          event.preventDefault();

          const updates: Array<{
            rowIndex: number;
            columnId: string;
            value: unknown;
          }> = [];

          const currentTable = tableRef.current;
          const tableColumns = currentTable?.getAllColumns() ?? [];
          const columnById = new Map(tableColumns.map((c) => [c.id, c]));

          for (const cellKey of cellsToClear) {
            const { rowIndex, columnId } = parseCellKey(cellKey);
            const column = columnById.get(columnId);
            const cellVariant = column?.columnDef?.meta?.cell?.variant;
            const emptyValue = getEmptyCellValue(cellVariant);
            updates.push({ rowIndex, columnId, value: emptyValue });
          }

          onDataUpdate(updates);

          if (currentState.selectionState.selectedCells.size > 0) {
            onSelectionClear();
          }

          if (currentState.cutCells.size > 0) {
            store.setState("cutCells", new Set());
          }
        }
        return;
      }

      if (
        key === "Enter" &&
        shiftKey &&
        !propsRef.current.readOnly &&
        propsRef.current.onRowAdd
      ) {
        event.preventDefault();
        const initialRowCount = propsRef.current.data.length;
        const currentColumnId = currentState.focusedCell.columnId;

        Promise.resolve(propsRef.current.onRowAdd())
          .then(async (result) => {
            if (result === null) {
              return;
            }

            onSelectionClear();

            const targetRowIndex = result.rowIndex ?? initialRowCount;
            const targetColumnId = result.columnId ?? currentColumnId;

            onScrollToRow({
              rowIndex: targetRowIndex,
              columnId: targetColumnId,
            });
          })
          .catch(() => {});
        return;
      }

      switch (key) {
        case "ArrowUp":
          if (altKey && !isCtrlPressed && !shiftKey) {
            direction = "pageup";
          } else if (isCtrlPressed && shiftKey) {
            const selectionEdge =
              currentState.selectionState.selectionRange?.end ||
              currentState.focusedCell;
            const currentColIndex = navigableColumnIds.indexOf(
              selectionEdge.columnId
            );
            const selectionStart =
              currentState.selectionState.selectionRange?.start ||
              currentState.focusedCell;

            selectRange(selectionStart, {
              rowIndex: 0,
              columnId:
                navigableColumnIds[currentColIndex] ?? selectionEdge.columnId,
            });

            const rowVirtualizer = rowVirtualizerRef.current;
            if (rowVirtualizer) {
              rowVirtualizer.scrollToIndex(0, { align: "start" });
            }

            restoreFocus(dataGridRef.current);

            event.preventDefault();
            return;
          } else if (isCtrlPressed && !shiftKey) {
            direction = "ctrl+up";
          } else {
            direction = "up";
          }
          break;
        case "ArrowDown":
          if (altKey && !isCtrlPressed && !shiftKey) {
            direction = "pagedown";
          } else if (isCtrlPressed && shiftKey) {
            const rowCount =
              tableRef.current?.getRowModel().rows.length ||
              propsRef.current.data.length;
            const selectionEdge =
              currentState.selectionState.selectionRange?.end ||
              currentState.focusedCell;
            const currentColIndex = navigableColumnIds.indexOf(
              selectionEdge.columnId
            );
            const selectionStart =
              currentState.selectionState.selectionRange?.start ||
              currentState.focusedCell;

            selectRange(selectionStart, {
              rowIndex: Math.max(0, rowCount - 1),
              columnId:
                navigableColumnIds[currentColIndex] ?? selectionEdge.columnId,
            });

            const rowVirtualizer = rowVirtualizerRef.current;
            if (rowVirtualizer) {
              rowVirtualizer.scrollToIndex(Math.max(0, rowCount - 1), {
                align: "end",
              });
            }

            restoreFocus(dataGridRef.current);

            event.preventDefault();
            return;
          } else if (isCtrlPressed && !shiftKey) {
            direction = "ctrl+down";
          } else {
            direction = "down";
          }
          break;
        case "ArrowLeft":
          if (isCtrlPressed && shiftKey) {
            const selectionEdge =
              currentState.selectionState.selectionRange?.end ||
              currentState.focusedCell;
            const selectionStart =
              currentState.selectionState.selectionRange?.start ||
              currentState.focusedCell;
            const targetColumnId =
              dir === "rtl" ? navigableColumnIds.at(-1) : navigableColumnIds[0];

            if (targetColumnId) {
              selectRange(selectionStart, {
                rowIndex: selectionEdge.rowIndex,
                columnId: targetColumnId,
              });

              const container = dataGridRef.current;
              const cellKey = getCellKey(
                selectionEdge.rowIndex,
                targetColumnId
              );
              const targetCell = cellMapRef.current.get(cellKey);
              if (container && targetCell) {
                scrollCellIntoView({
                  container,
                  targetCell,
                  tableRef,
                  viewportOffset: VIEWPORT_OFFSET,
                  direction: "home",
                  isRtl: dir === "rtl",
                });
              }

              restoreFocus(container);
            }
            event.preventDefault();
            return;
          }
          if (isCtrlPressed && !shiftKey) {
            direction = "home";
          } else {
            direction = "left";
          }
          break;
        case "ArrowRight":
          if (isCtrlPressed && shiftKey) {
            const selectionEdge =
              currentState.selectionState.selectionRange?.end ||
              currentState.focusedCell;
            const selectionStart =
              currentState.selectionState.selectionRange?.start ||
              currentState.focusedCell;
            const targetColumnId =
              dir === "rtl" ? navigableColumnIds[0] : navigableColumnIds.at(-1);

            if (targetColumnId) {
              selectRange(selectionStart, {
                rowIndex: selectionEdge.rowIndex,
                columnId: targetColumnId,
              });

              const container = dataGridRef.current;
              const cellKey = getCellKey(
                selectionEdge.rowIndex,
                targetColumnId
              );
              const targetCell = cellMapRef.current.get(cellKey);
              if (container && targetCell) {
                scrollCellIntoView({
                  container,
                  targetCell,
                  tableRef,
                  viewportOffset: VIEWPORT_OFFSET,
                  direction: "end",
                  isRtl: dir === "rtl",
                });
              }

              restoreFocus(container);
            }
            event.preventDefault();
            return;
          }
          if (isCtrlPressed && !shiftKey) {
            direction = "end";
          } else {
            direction = "right";
          }
          break;
        case "Home":
          direction = isCtrlPressed ? "ctrl+home" : "home";
          break;
        case "End":
          direction = isCtrlPressed ? "ctrl+end" : "end";
          break;
        case "PageUp":
          direction = altKey ? "pageleft" : "pageup";
          break;
        case "PageDown":
          direction = altKey ? "pageright" : "pagedown";
          break;
        case "Escape":
          event.preventDefault();
          if (
            currentState.selectionState.selectedCells.size > 0 ||
            Object.keys(currentState.rowSelection).length > 0
          ) {
            onSelectionClear();
          } else {
            blurCell();
          }
          return;
        case "Tab":
          event.preventDefault();
          if (dir === "rtl") {
            direction = event.shiftKey ? "right" : "left";
          } else {
            direction = event.shiftKey ? "left" : "right";
          }
          break;
      }

      if (direction) {
        event.preventDefault();

        if (shiftKey && key !== "Tab" && currentState.focusedCell) {
          const selectionEdge =
            currentState.selectionState.selectionRange?.end ||
            currentState.focusedCell;

          const currentColIndex = navigableColumnIds.indexOf(
            selectionEdge.columnId
          );
          let newRowIndex = selectionEdge.rowIndex;
          let newColumnId = selectionEdge.columnId;

          const isRtl = dir === "rtl";

          const rowCount =
            tableRef.current?.getRowModel().rows.length ||
            propsRef.current.data.length;

          switch (direction) {
            case "up":
              newRowIndex = Math.max(0, selectionEdge.rowIndex - 1);
              break;
            case "down":
              newRowIndex = Math.min(rowCount - 1, selectionEdge.rowIndex + 1);
              break;
            case "left":
              if (isRtl) {
                if (currentColIndex < navigableColumnIds.length - 1) {
                  const nextColumnId = navigableColumnIds[currentColIndex + 1];
                  if (nextColumnId) {
                    newColumnId = nextColumnId;
                  }
                }
              } else if (currentColIndex > 0) {
                const prevColumnId = navigableColumnIds[currentColIndex - 1];
                if (prevColumnId) {
                  newColumnId = prevColumnId;
                }
              }
              break;
            case "right":
              if (isRtl) {
                if (currentColIndex > 0) {
                  const prevColumnId = navigableColumnIds[currentColIndex - 1];
                  if (prevColumnId) {
                    newColumnId = prevColumnId;
                  }
                }
              } else if (currentColIndex < navigableColumnIds.length - 1) {
                const nextColumnId = navigableColumnIds[currentColIndex + 1];
                if (nextColumnId) {
                  newColumnId = nextColumnId;
                }
              }
              break;
            case "home":
              if (navigableColumnIds.length > 0) {
                newColumnId = navigableColumnIds[0] ?? newColumnId;
              }
              break;
            case "end":
              if (navigableColumnIds.length > 0) {
                newColumnId = navigableColumnIds.at(-1) ?? newColumnId;
              }
              break;
          }

          const selectionStart =
            currentState.selectionState.selectionRange?.start ||
            currentState.focusedCell;

          selectRange(selectionStart, {
            rowIndex: newRowIndex,
            columnId: newColumnId,
          });

          const container = dataGridRef.current;
          const targetRow = rowMapRef.current.get(newRowIndex);
          const cellKey = getCellKey(newRowIndex, newColumnId);
          const targetCell = cellMapRef.current.get(cellKey);

          if (
            newRowIndex !== selectionEdge.rowIndex &&
            (direction === "up" || direction === "down")
          ) {
            if (container && targetRow) {
              const containerRect = container.getBoundingClientRect();
              const headerHeight =
                headerRef.current?.getBoundingClientRect().height ?? 0;
              const footerHeight =
                footerRef.current?.getBoundingClientRect().height ?? 0;

              const viewportTop =
                containerRect.top + headerHeight + VIEWPORT_OFFSET;
              const viewportBottom =
                containerRect.bottom - footerHeight - VIEWPORT_OFFSET;

              const rowRect = targetRow.getBoundingClientRect();
              const isFullyVisible =
                rowRect.top >= viewportTop && rowRect.bottom <= viewportBottom;

              if (!isFullyVisible) {
                const scrollNeeded =
                  direction === "down"
                    ? rowRect.bottom - viewportBottom
                    : viewportTop - rowRect.top;

                if (direction === "down") {
                  container.scrollTop += scrollNeeded;
                } else {
                  container.scrollTop -= scrollNeeded;
                }

                restoreFocus(container);
              }
            } else {
              const rowVirtualizer = rowVirtualizerRef.current;
              if (rowVirtualizer) {
                const align = direction === "up" ? "start" : "end";
                rowVirtualizer.scrollToIndex(newRowIndex, { align });

                restoreFocus(container);
              }
            }
          }

          if (
            newColumnId !== selectionEdge.columnId &&
            (direction === "left" ||
              direction === "right" ||
              direction === "home" ||
              direction === "end") &&
            container &&
            targetCell
          ) {
            scrollCellIntoView({
              container,
              targetCell,
              tableRef,
              viewportOffset: VIEWPORT_OFFSET,
              direction,
              isRtl,
            });
          }
        } else {
          if (currentState.selectionState.selectedCells.size > 0) {
            onSelectionClear();
          }
          navigateCell(direction);
        }
      }
    },
    [
      dir,
      store,
      propsRef,
      tableRef,
      navigableColumnIds,
      dataGridRef,
      cellMapRef,
      rowMapRef,
      headerRef,
      footerRef,
      rowVirtualizerRef,
      blurCell,
      navigateCell,
      selectAll,
      selectRange,
      onCellsCopy,
      onCellsCut,
      onCellsPaste,
      onDataUpdate,
      onSelectionClear,
      onRowsDelete,
      restoreFocus,
      onSearchOpenChange,
      onNavigateToNextMatch,
      onNavigateToPrevMatch,
      onScrollToRow,
    ]
  );

  return { onDataGridKeyDown };
}

export { useDataGridKeyboard };
