import * as React from "react";

import {
  getCellKey,
  getRowHeightValue,
  getScrollDirection,
  scrollCellIntoView,
} from "@/lib/data-grid";
import type { NavigationDirection } from "@/types/data-grid";

import type { DataGridContext } from "./types";

const VIEWPORT_OFFSET = 1;
const HORIZONTAL_PAGE_SIZE = 5;

function useDataGridNavigation<TData>(
  ctx: DataGridContext<TData>,
  focusCell: (rowIndex: number, columnId: string) => void
) {
  const {
    store,
    propsRef,
    tableRef,
    rowVirtualizerRef,
    dataGridRef,
    headerRef,
    footerRef,
    rowMapRef,
    cellMapRef,
    navigableColumnIds,
    dir,
  } = ctx;

  const navigateCell = React.useCallback(
    (direction: NavigationDirection) => {
      const currentState = store.getState();
      if (!currentState.focusedCell) {
        return;
      }

      const { rowIndex, columnId } = currentState.focusedCell;
      const currentColIndex = navigableColumnIds.indexOf(columnId);
      const rowVirtualizer = rowVirtualizerRef.current;
      const currentTable = tableRef.current;
      const rows = currentTable?.getRowModel().rows ?? [];
      const rowCount = rows.length ?? propsRef.current.data.length;
      const rowHeight = currentState.rowHeight;

      let newRowIndex = rowIndex;
      let newColumnId = columnId;

      const isRtl = dir === "rtl";

      switch (direction) {
        case "up":
          newRowIndex = Math.max(0, rowIndex - 1);
          break;
        case "down":
          newRowIndex = Math.min(rowCount - 1, rowIndex + 1);
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
            newColumnId = navigableColumnIds[0] ?? columnId;
          }
          break;
        case "end":
          if (navigableColumnIds.length > 0) {
            newColumnId = navigableColumnIds.at(-1) ?? columnId;
          }
          break;
        case "ctrl+home":
          newRowIndex = 0;
          if (navigableColumnIds.length > 0) {
            newColumnId = navigableColumnIds[0] ?? columnId;
          }
          break;
        case "ctrl+end":
          newRowIndex = Math.max(0, rowCount - 1);
          if (navigableColumnIds.length > 0) {
            newColumnId = navigableColumnIds.at(-1) ?? columnId;
          }
          break;
        case "ctrl+up":
          newRowIndex = 0;
          break;
        case "ctrl+down":
          newRowIndex = Math.max(0, rowCount - 1);
          break;
        case "pageup":
          if (rowVirtualizer) {
            const visibleRange = rowVirtualizer.getVirtualItems();
            const pageSize = visibleRange.length ?? 10;
            newRowIndex = Math.max(0, rowIndex - pageSize);
          } else {
            newRowIndex = Math.max(0, rowIndex - 10);
          }
          break;
        case "pagedown":
          if (rowVirtualizer) {
            const visibleRange = rowVirtualizer.getVirtualItems();
            const pageSize = visibleRange.length ?? 10;
            newRowIndex = Math.min(rowCount - 1, rowIndex + pageSize);
          } else {
            newRowIndex = Math.min(rowCount - 1, rowIndex + 10);
          }
          break;
        case "pageleft":
          if (currentColIndex > 0) {
            const targetIndex = Math.max(
              0,
              currentColIndex - HORIZONTAL_PAGE_SIZE
            );
            const targetColumnId = navigableColumnIds[targetIndex];
            if (targetColumnId) {
              newColumnId = targetColumnId;
            }
          }
          break;
        case "pageright":
          if (currentColIndex < navigableColumnIds.length - 1) {
            const targetIndex = Math.min(
              navigableColumnIds.length - 1,
              currentColIndex + HORIZONTAL_PAGE_SIZE
            );
            const targetColumnId = navigableColumnIds[targetIndex];
            if (targetColumnId) {
              newColumnId = targetColumnId;
            }
          }
          break;
      }

      if (newRowIndex !== rowIndex || newColumnId !== columnId) {
        focusCell(newRowIndex, newColumnId);

        const container = dataGridRef.current;
        if (!container) {
          return;
        }

        const targetRow = rowMapRef.current.get(newRowIndex);
        const cellKey = getCellKey(newRowIndex, newColumnId);
        const targetCell = cellMapRef.current.get(cellKey);

        if (!targetRow) {
          if (rowVirtualizer) {
            const align =
              direction === "up" ||
              direction === "pageup" ||
              direction === "ctrl+up" ||
              direction === "ctrl+home"
                ? "start"
                : direction === "down" ||
                    direction === "pagedown" ||
                    direction === "ctrl+down" ||
                    direction === "ctrl+end"
                  ? "end"
                  : "center";

            rowVirtualizer.scrollToIndex(newRowIndex, { align });

            if (newColumnId !== columnId) {
              requestAnimationFrame(() => {
                const cellKeyRetry = getCellKey(newRowIndex, newColumnId);
                const targetCellRetry = cellMapRef.current.get(cellKeyRetry);

                if (targetCellRetry) {
                  const scrollDirection = getScrollDirection(direction);

                  scrollCellIntoView({
                    container,
                    targetCell: targetCellRetry,
                    tableRef,
                    viewportOffset: VIEWPORT_OFFSET,
                    direction: scrollDirection,
                    isRtl: dir === "rtl",
                  });
                }
              });
            }
          } else {
            const rowHeightValue = getRowHeightValue(rowHeight);
            const estimatedScrollTop = newRowIndex * rowHeightValue;
            container.scrollTop = estimatedScrollTop;
          }

          return;
        }

        if (newRowIndex !== rowIndex && targetRow) {
          requestAnimationFrame(() => {
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
              const isVerticalNavigation =
                direction === "up" ||
                direction === "down" ||
                direction === "pageup" ||
                direction === "pagedown" ||
                direction === "ctrl+up" ||
                direction === "ctrl+down" ||
                direction === "ctrl+home" ||
                direction === "ctrl+end";

              if (isVerticalNavigation) {
                if (
                  direction === "down" ||
                  direction === "pagedown" ||
                  direction === "ctrl+down" ||
                  direction === "ctrl+end"
                ) {
                  container.scrollTop += rowRect.bottom - viewportBottom;
                } else {
                  container.scrollTop -= viewportTop - rowRect.top;
                }
              }
            }
          });
        }

        if (newColumnId !== columnId && targetCell) {
          requestAnimationFrame(() => {
            const scrollDirection = getScrollDirection(direction);

            scrollCellIntoView({
              container,
              targetCell,
              tableRef,
              viewportOffset: VIEWPORT_OFFSET,
              direction: scrollDirection,
              isRtl: dir === "rtl",
            });
          });
        }
      }
    },
    [
      dir,
      store,
      navigableColumnIds,
      focusCell,
      propsRef,
      dataGridRef,
      headerRef,
      footerRef,
      rowMapRef,
      cellMapRef,
      rowVirtualizerRef,
      tableRef,
    ]
  );

  return { navigateCell };
}

export { useDataGridNavigation };
