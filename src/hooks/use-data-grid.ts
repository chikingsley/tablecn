import { useDirection } from "@radix-ui/react-direction";
import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type Row,
  type RowSelectionState,
  type SortingState,
  type TableMeta,
  type TableOptions,
  type TableState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import * as React from "react";

import { useAsRef } from "@/hooks/use-as-ref";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import {
  getCellKey,
  getIsInPopover,
  scrollCellIntoView,
} from "@/lib/data-grid";
import type {
  CellPosition,
  CellUpdate,
  Direction,
  FileCellData,
  NavigationDirection,
  RowHeightValue,
  SearchState,
} from "@/types/data-grid";

import type { DataGridContext } from "./data-grid/types";
import { useDataGridClipboard } from "./data-grid/use-data-grid-clipboard";
import { useDataGridEditing } from "./data-grid/use-data-grid-editing";
import { useDataGridFocus } from "./data-grid/use-data-grid-focus";
import { useDataGridKeyboard } from "./data-grid/use-data-grid-keyboard";
import { useDataGridNavigation } from "./data-grid/use-data-grid-navigation";
import { useDataGridSearch } from "./data-grid/use-data-grid-search";
import { useDataGridSelection } from "./data-grid/use-data-grid-selection";
import { useDataGridStore } from "./data-grid/use-data-grid-store";

const DEFAULT_ROW_HEIGHT = "short";
const OVERSCAN = 6;
const VIEWPORT_OFFSET = 1;
const SEARCH_SHORTCUT_KEY = "f";
const MIN_COLUMN_SIZE = 60;
const MAX_COLUMN_SIZE = 800;
const NON_NAVIGABLE_COLUMN_IDS = new Set(["select", "actions"]);

interface UseDataGridProps<TData>
  extends Omit<TableOptions<TData>, "pageCount" | "getCoreRowModel"> {
  onDataChange?: (data: TData[]) => void;
  onRowAdd?: (
    event?: React.MouseEvent<HTMLDivElement>
  ) => Partial<CellPosition> | Promise<Partial<CellPosition> | null> | null;
  onRowsAdd?: (count: number) => void | Promise<void>;
  onRowsDelete?: (rows: TData[], rowIndices: number[]) => void | Promise<void>;
  onPaste?: (updates: CellUpdate[]) => void | Promise<void>;
  onFilesUpload?: (params: {
    files: File[];
    rowIndex: number;
    columnId: string;
  }) => Promise<FileCellData[]>;
  onFilesDelete?: (params: {
    fileIds: string[];
    rowIndex: number;
    columnId: string;
  }) => void | Promise<void>;
  rowHeight?: RowHeightValue;
  onRowHeightChange?: (rowHeight: RowHeightValue) => void;
  overscan?: number;
  dir?: Direction;
  autoFocus?: boolean | Partial<CellPosition>;
  enableSingleCellSelection?: boolean;
  enableColumnSelection?: boolean;
  enableSearch?: boolean;
  enablePaste?: boolean;
  readOnly?: boolean;
}

function useDataGrid<TData>({
  data,
  columns,
  rowHeight: rowHeightProp = DEFAULT_ROW_HEIGHT,
  overscan = OVERSCAN,
  dir: dirProp,
  initialState,
  ...props
}: UseDataGridProps<TData>) {
  const dir = useDirection(dirProp);
  const dataGridRef = React.useRef<HTMLDivElement>(null);
  const tableRef = React.useRef<ReturnType<typeof useReactTable<TData>>>(null);
  const rowVirtualizerRef =
    React.useRef<Virtualizer<HTMLDivElement, Element>>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const rowMapRef = React.useRef<Map<number, HTMLDivElement>>(new Map());
  const cellMapRef = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const footerRef = React.useRef<HTMLDivElement>(null);
  const focusGuardRef = React.useRef(false);

  const propsRef = useAsRef({
    ...props,
    data,
    columns,
    initialState,
  });

  const {
    store,
    stateRef,
    focusedCell,
    editingCell,
    sorting,
    columnFilters,
    rowSelection,
    rowHeight,
    rowHeightValue,
    contextMenu,
    pasteDialog,
    cellSelectionMap,
  } = useDataGridStore(initialState, rowHeightProp);

  const visualRowIndexCacheRef = React.useRef<{
    rows: Row<TData>[] | null;
    map: Map<string, number>;
  } | null>(null);

  // Pre-compute visual row index map for O(1) lookups (used by select column)
  // Cache is invalidated when row model identity changes (sorting/filtering)
  const getVisualRowIndex = React.useCallback(
    (rowId: string): number | undefined => {
      const rows = tableRef.current?.getRowModel().rows;
      if (!rows) {
        return undefined;
      }

      if (visualRowIndexCacheRef.current?.rows !== rows) {
        const map = new Map<string, number>();
        for (const [i, row] of rows.entries()) {
          map.set(row.id, i + 1);
        }
        visualRowIndexCacheRef.current = { rows, map };
      }

      return visualRowIndexCacheRef.current.map.get(rowId);
    },
    []
  );

  const columnIds = React.useMemo(() => {
    return columns
      .map((c) => {
        if (c.id) {
          return c.id;
        }
        if ("accessorKey" in c) {
          return c.accessorKey as string;
        }
        return undefined;
      })
      .filter((id): id is string => Boolean(id));
  }, [columns]);

  const navigableColumnIds = React.useMemo(() => {
    return columnIds.filter((c) => !NON_NAVIGABLE_COLUMN_IDS.has(c));
  }, [columnIds]);

  const ctx: DataGridContext<TData> = {
    store,
    stateRef,
    propsRef,
    tableRef,
    rowVirtualizerRef,
    dataGridRef,
    headerRef,
    footerRef,
    cellMapRef,
    rowMapRef,
    focusGuardRef,
    navigableColumnIds,
    columnIds,
    dir,
  };

  const {
    releaseFocusGuard,
    focusCellWrapper,
    focusCell,
    blurCell,
    restoreFocus,
  } = useDataGridFocus(ctx);
  const {
    getIsCellSelected,
    onSelectionClear,
    selectAll,
    selectColumn,
    selectRange,
  } = useDataGridSelection(ctx);
  const { navigateCell } = useDataGridNavigation(ctx, focusCell);
  const {
    onDataUpdate,
    onRowsDelete,
    onCellEditingStart,
    onCellEditingStop,
    onScrollToRow,
    onRowAdd,
  } = useDataGridEditing(
    ctx,
    focusCell,
    focusCellWrapper,
    navigateCell,
    onSelectionClear,
    releaseFocusGuard
  );
  const { onCellsCopy, onCellsCut, onCellsPaste } = useDataGridClipboard(
    ctx,
    onDataUpdate,
    selectRange,
    restoreFocus
  );
  const {
    searchState,
    searchMatchesByRow,
    activeSearchMatch,
    onSearchOpenChange,
    onNavigateToNextMatch,
    onNavigateToPrevMatch,
    getIsSearchMatch,
    getIsActiveSearchMatch,
  } = useDataGridSearch(ctx, focusCell);
  const { onDataGridKeyDown } = useDataGridKeyboard(ctx, {
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
  });

  const onCellClick = React.useCallback(
    (rowIndex: number, columnId: string, event?: React.MouseEvent) => {
      if (event?.button === 2) {
        return;
      }

      const currentState = store.getState();
      const currentFocused = currentState.focusedCell;

      function scrollToCell() {
        requestAnimationFrame(() => {
          const container = dataGridRef.current;
          const cellKey = getCellKey(rowIndex, columnId);
          const targetCell = cellMapRef.current.get(cellKey);

          if (container && targetCell) {
            scrollCellIntoView({
              container,
              targetCell,
              tableRef,
              viewportOffset: VIEWPORT_OFFSET,
              isRtl: dir === "rtl",
            });
          }
        });
      }

      if (event) {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const cellKey = getCellKey(rowIndex, columnId);
          const newSelectedCells = new Set(
            currentState.selectionState.selectedCells
          );

          if (newSelectedCells.has(cellKey)) {
            newSelectedCells.delete(cellKey);
          } else {
            newSelectedCells.add(cellKey);
          }

          store.setState("selectionState", {
            selectedCells: newSelectedCells,
            selectionRange: null,
            isSelecting: false,
          });
          focusCell(rowIndex, columnId);
          scrollToCell();
          return;
        }

        if (event.shiftKey && currentState.focusedCell) {
          event.preventDefault();
          selectRange(currentState.focusedCell, { rowIndex, columnId });
          scrollToCell();
          return;
        }
      }

      const hasSelectedCells =
        currentState.selectionState.selectedCells.size > 0;
      const hasSelectedRows = Object.keys(currentState.rowSelection).length > 0;

      if (hasSelectedCells && !currentState.selectionState.isSelecting) {
        const cellKey = getCellKey(rowIndex, columnId);
        const isClickingSelectedCell =
          currentState.selectionState.selectedCells.has(cellKey);

        if (isClickingSelectedCell) {
          focusCell(rowIndex, columnId);
          scrollToCell();
          return;
        }
        onSelectionClear();
      } else if (hasSelectedRows && columnId !== "select") {
        onSelectionClear();
      }

      if (
        currentFocused?.rowIndex === rowIndex &&
        currentFocused?.columnId === columnId
      ) {
        onCellEditingStart(rowIndex, columnId);
      } else {
        focusCell(rowIndex, columnId);
        scrollToCell();
      }
    },
    [store, focusCell, onCellEditingStart, selectRange, onSelectionClear, dir]
  );

  const onCellDoubleClick = React.useCallback(
    (rowIndex: number, columnId: string, event?: React.MouseEvent) => {
      if (event?.defaultPrevented) {
        return;
      }

      onCellEditingStart(rowIndex, columnId);
    },
    [onCellEditingStart]
  );

  const onCellMouseDown = React.useCallback(
    (rowIndex: number, columnId: string, event: React.MouseEvent) => {
      if (event.button === 2) {
        return;
      }

      event.preventDefault();

      if (!(event.ctrlKey || event.metaKey || event.shiftKey)) {
        const cellKey = getCellKey(rowIndex, columnId);
        store.batch(() => {
          store.setState("selectionState", {
            selectedCells: propsRef.current.enableSingleCellSelection
              ? new Set([cellKey])
              : new Set(),
            selectionRange: {
              start: { rowIndex, columnId },
              end: { rowIndex, columnId },
            },
            isSelecting: true,
          });
          store.setState("rowSelection", {});
        });
      }
    },
    [store, propsRef]
  );

  const onCellMouseEnter = React.useCallback(
    (rowIndex: number, columnId: string) => {
      const currentState = store.getState();
      if (
        currentState.selectionState.isSelecting &&
        currentState.selectionState.selectionRange
      ) {
        const start = currentState.selectionState.selectionRange.start;
        const end = { rowIndex, columnId };

        if (
          currentState.focusedCell?.rowIndex !== start.rowIndex ||
          currentState.focusedCell?.columnId !== start.columnId
        ) {
          focusCell(start.rowIndex, start.columnId);
        }

        selectRange(start, end, true);
      }
    },
    [store, selectRange, focusCell]
  );

  const onCellMouseUp = React.useCallback(() => {
    const currentState = store.getState();
    store.setState("selectionState", {
      ...currentState.selectionState,
      isSelecting: false,
    });
  }, [store]);

  const onCellContextMenu = React.useCallback(
    (rowIndex: number, columnId: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const currentState = store.getState();
      const cellKey = getCellKey(rowIndex, columnId);
      const isTargetCellSelected =
        currentState.selectionState.selectedCells.has(cellKey);

      if (!isTargetCellSelected) {
        store.batch(() => {
          store.setState("selectionState", {
            selectedCells: new Set([cellKey]),
            selectionRange: {
              start: { rowIndex, columnId },
              end: { rowIndex, columnId },
            },
            isSelecting: false,
          });
          store.setState("focusedCell", { rowIndex, columnId });
        });
      }

      store.setState("contextMenu", {
        open: true,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [store]
  );

  const onContextMenuOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        const currentMenu = store.getState().contextMenu;
        store.setState("contextMenu", {
          open: false,
          x: currentMenu.x,
          y: currentMenu.y,
        });
      }
    },
    [store]
  );

  const onSortingChange = React.useCallback(
    (updater: Updater<SortingState>) => {
      const currentState = store.getState();
      const newSorting =
        typeof updater === "function" ? updater(currentState.sorting) : updater;
      store.setState("sorting", newSorting);

      propsRef.current.onSortingChange?.(newSorting);
    },
    [store, propsRef]
  );

  const onColumnFiltersChange = React.useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      const currentState = store.getState();
      const newColumnFilters =
        typeof updater === "function"
          ? updater(currentState.columnFilters)
          : updater;
      store.setState("columnFilters", newColumnFilters);

      propsRef.current.onColumnFiltersChange?.(newColumnFilters);
    },
    [store, propsRef]
  );

  const onRowSelectionChange = React.useCallback(
    (updater: Updater<RowSelectionState>) => {
      const currentState = store.getState();
      const newRowSelection =
        typeof updater === "function"
          ? updater(currentState.rowSelection)
          : updater;

      const selectedRows = Object.keys(newRowSelection).filter(
        (key) => newRowSelection[key]
      );

      const selectedCells = new Set<string>();
      const rows = tableRef.current?.getRowModel().rows ?? [];

      for (const rowId of selectedRows) {
        const rowIndex = rows.findIndex((r) => r.id === rowId);
        if (rowIndex === -1) {
          continue;
        }

        for (const columnId of columnIds) {
          selectedCells.add(getCellKey(rowIndex, columnId));
        }
      }

      store.batch(() => {
        store.setState("rowSelection", newRowSelection);
        store.setState("selectionState", {
          selectedCells,
          selectionRange: null,
          isSelecting: false,
        });
        store.setState("focusedCell", null);
        store.setState("editingCell", null);
      });
    },
    [store, columnIds]
  );

  const onRowSelect = React.useCallback(
    (rowIndex: number, selected: boolean, shiftKey: boolean) => {
      const currentState = store.getState();
      const rows = tableRef.current?.getRowModel().rows ?? [];
      const currentRow = rows[rowIndex];
      if (!currentRow) {
        return;
      }

      if (shiftKey && currentState.lastClickedRowIndex !== null) {
        const startIndex = Math.min(currentState.lastClickedRowIndex, rowIndex);
        const endIndex = Math.max(currentState.lastClickedRowIndex, rowIndex);

        const newRowSelection: RowSelectionState = {
          ...currentState.rowSelection,
        };

        for (let i = startIndex; i <= endIndex; i++) {
          const row = rows[i];
          if (row) {
            newRowSelection[row.id] = selected;
          }
        }

        onRowSelectionChange(newRowSelection);
      } else {
        onRowSelectionChange({
          ...currentState.rowSelection,
          [currentRow.id]: selected,
        });
      }

      store.setState("lastClickedRowIndex", rowIndex);
    },
    [store, onRowSelectionChange]
  );

  const onRowHeightChange = React.useCallback(
    (updater: Updater<RowHeightValue>) => {
      const currentState = store.getState();
      const newRowHeight =
        typeof updater === "function"
          ? updater(currentState.rowHeight)
          : updater;
      store.setState("rowHeight", newRowHeight);
      propsRef.current.onRowHeightChange?.(newRowHeight);
    },
    [store, propsRef]
  );

  const onColumnClick = React.useCallback(
    (columnId: string) => {
      if (!propsRef.current.enableColumnSelection) {
        onSelectionClear();
        return;
      }

      selectColumn(columnId);
    },
    [propsRef, selectColumn, onSelectionClear]
  );

  const onPasteDialogOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        store.setState("pasteDialog", {
          open: false,
          rowsNeeded: 0,
          clipboardText: "",
        });
      }
    },
    [store]
  );

  const defaultColumn: Partial<ColumnDef<TData>> = React.useMemo(
    () => ({
      // Note: cell is rendered directly in DataGridRow to bypass flexRender's
      // unstable cell.getContext() (see TanStack Table issue #4794)
      minSize: MIN_COLUMN_SIZE,
      maxSize: MAX_COLUMN_SIZE,
    }),
    []
  );

  const tableMeta = React.useMemo<TableMeta<TData>>(() => {
    return {
      ...propsRef.current.meta,
      dataGridRef,
      cellMapRef,
      get focusedCell() {
        return store.getState().focusedCell;
      },
      get editingCell() {
        return store.getState().editingCell;
      },
      get selectionState() {
        return store.getState().selectionState;
      },
      get searchOpen() {
        return store.getState().searchOpen;
      },
      get contextMenu() {
        return store.getState().contextMenu;
      },
      get pasteDialog() {
        return store.getState().pasteDialog;
      },
      get rowHeight() {
        return store.getState().rowHeight;
      },
      get readOnly() {
        return propsRef.current.readOnly;
      },
      getIsCellSelected,
      getIsSearchMatch,
      getIsActiveSearchMatch,
      getVisualRowIndex,
      onRowHeightChange,
      onRowSelect,
      onDataUpdate,
      onRowsDelete: propsRef.current.onRowsDelete ? onRowsDelete : undefined,
      onColumnClick,
      onCellClick,
      onCellDoubleClick,
      onCellMouseDown,
      onCellMouseEnter,
      onCellMouseUp,
      onCellContextMenu,
      onCellEditingStart,
      onCellEditingStop,
      onCellsCopy,
      onCellsCut,
      onCellsPaste,
      onSelectionClear,
      onFilesUpload: propsRef.current.onFilesUpload
        ? propsRef.current.onFilesUpload
        : undefined,
      onFilesDelete: propsRef.current.onFilesDelete
        ? propsRef.current.onFilesDelete
        : undefined,
      onContextMenuOpenChange,
      onPasteDialogOpenChange,
    };
  }, [
    propsRef,
    store,
    getIsCellSelected,
    getIsSearchMatch,
    getIsActiveSearchMatch,
    getVisualRowIndex,
    onRowHeightChange,
    onRowSelect,
    onDataUpdate,
    onRowsDelete,
    onColumnClick,
    onCellClick,
    onCellDoubleClick,
    onCellMouseDown,
    onCellMouseEnter,
    onCellMouseUp,
    onCellContextMenu,
    onCellEditingStart,
    onCellEditingStop,
    onCellsCopy,
    onCellsCut,
    onCellsPaste,
    onSelectionClear,
    onContextMenuOpenChange,
    onPasteDialogOpenChange,
  ]);

  const getMemoizedCoreRowModel = React.useMemo(() => getCoreRowModel(), []);
  const getMemoizedFilteredRowModel = React.useMemo(
    () => getFilteredRowModel(),
    []
  );
  const getMemoizedSortedRowModel = React.useMemo(
    () => getSortedRowModel(),
    []
  );

  // Memoize state object to reduce shallow equality checks
  const tableState = React.useMemo<Partial<TableState>>(
    () => ({
      ...propsRef.current.state,
      sorting,
      columnFilters,
      rowSelection,
    }),
    [propsRef, sorting, columnFilters, rowSelection]
  );

  const tableOptions = React.useMemo<TableOptions<TData>>(() => {
    return {
      ...propsRef.current,
      data,
      columns,
      defaultColumn,
      initialState: propsRef.current.initialState,
      state: tableState,
      onRowSelectionChange,
      onSortingChange,
      onColumnFiltersChange,
      columnResizeMode: "onChange",
      columnResizeDirection: dir,
      getCoreRowModel: getMemoizedCoreRowModel,
      getFilteredRowModel: getMemoizedFilteredRowModel,
      getSortedRowModel: getMemoizedSortedRowModel,
      meta: tableMeta,
    };
  }, [
    propsRef,
    data,
    columns,
    defaultColumn,
    tableState,
    dir,
    onRowSelectionChange,
    onSortingChange,
    onColumnFiltersChange,
    getMemoizedCoreRowModel,
    getMemoizedFilteredRowModel,
    getMemoizedSortedRowModel,
    tableMeta,
  ]);

  const table = useReactTable(tableOptions);

  if (!tableRef.current) {
    tableRef.current = table;
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: columnSizingInfo and columnSizing are used for calculating the column size vars
  const columnSizeVars = React.useMemo(() => {
    const headers = table.getFlatHeaders();
    const colSizes: { [key: string]: number } = {};
    for (const header of headers) {
      colSizes[`--header-${header.id}-size`] = header.getSize();
      colSizes[`--col-${header.column.id}-size`] = header.column.getSize();
    }
    return colSizes;
  }, [table.getState().columnSizingInfo, table.getState().columnSizing]);

  const isFirefox = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    React.useCallback(() => {
      if (typeof window === "undefined" || typeof navigator === "undefined") {
        return false;
      }
      return navigator.userAgent.indexOf("Firefox") !== -1;
    }, []),
    React.useCallback(() => false, [])
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: columnPinning is used for calculating the adjustLayout
  const adjustLayout = React.useMemo(() => {
    const columnPinning = table.getState().columnPinning;
    return (
      isFirefox &&
      ((columnPinning.left?.length ?? 0) > 0 ||
        (columnPinning.right?.length ?? 0) > 0)
    );
  }, [isFirefox, table.getState().columnPinning]);

  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => dataGridRef.current,
    estimateSize: () => rowHeightValue,
    overscan,
    measureElement: isFirefox
      ? undefined
      : (element) => element?.getBoundingClientRect().height,
  });

  if (!rowVirtualizerRef.current) {
    rowVirtualizerRef.current = rowVirtualizer;
  }

  React.useEffect(() => {
    const dataGridElement = dataGridRef.current;
    if (!dataGridElement) {
      return;
    }

    dataGridElement.addEventListener("keydown", onDataGridKeyDown);
    return () => {
      dataGridElement.removeEventListener("keydown", onDataGridKeyDown);
    };
  }, [onDataGridKeyDown]);

  React.useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      const dataGridElement = dataGridRef.current;
      if (!dataGridElement) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const { key, ctrlKey, metaKey, shiftKey } = event;
      const isCommandPressed = ctrlKey || metaKey;

      if (
        propsRef.current.enableSearch &&
        isCommandPressed &&
        !shiftKey &&
        key === SEARCH_SHORTCUT_KEY
      ) {
        const isInInput =
          target.tagName === "INPUT" || target.tagName === "TEXTAREA";
        const isInDataGrid = dataGridElement.contains(target);
        const isInSearchInput = target.closest('[role="search"]') !== null;

        if (isInDataGrid || isInSearchInput || !isInInput) {
          event.preventDefault();
          event.stopPropagation();

          const nextSearchOpen = !store.getState().searchOpen;
          onSearchOpenChange(nextSearchOpen);

          if (nextSearchOpen && !isInDataGrid && !isInSearchInput) {
            requestAnimationFrame(() => {
              dataGridElement.focus();
            });
          }
          return;
        }
      }

      const isInDataGrid = dataGridElement.contains(target);
      if (!isInDataGrid) {
        return;
      }

      if (key === "Escape") {
        const currentState = store.getState();
        const hasSelections =
          currentState.selectionState.selectedCells.size > 0 ||
          Object.keys(currentState.rowSelection).length > 0;

        if (hasSelections) {
          event.preventDefault();
          event.stopPropagation();
          onSelectionClear();
        }
      }
    }

    window.addEventListener("keydown", onGlobalKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onGlobalKeyDown, true);
    };
  }, [propsRef, onSearchOpenChange, store, onSelectionClear]);

  React.useEffect(() => {
    const currentState = store.getState();
    const autoFocus = propsRef.current.autoFocus;

    if (
      autoFocus &&
      data.length > 0 &&
      columns.length > 0 &&
      !currentState.focusedCell &&
      navigableColumnIds.length > 0
    ) {
      const rafId = requestAnimationFrame(() => {
        if (typeof autoFocus === "object") {
          const { rowIndex, columnId } = autoFocus;
          if (columnId) {
            focusCell(rowIndex ?? 0, columnId);
          }
          return;
        }

        const firstColumnId = navigableColumnIds[0];
        if (firstColumnId) {
          focusCell(0, firstColumnId);
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [store, propsRef, data, columns, navigableColumnIds, focusCell]);

  // Restore focus to container when virtualized cells are unmounted
  React.useEffect(() => {
    const container = dataGridRef.current;
    if (!container) {
      return;
    }

    function onFocusOut(event: FocusEvent) {
      if (focusGuardRef.current) {
        return;
      }

      const currentContainer = dataGridRef.current;
      if (!currentContainer) {
        return;
      }

      const currentState = store.getState();

      if (!currentState.focusedCell || currentState.editingCell) {
        return;
      }

      const relatedTarget = event.relatedTarget;

      const isFocusMovingOutsideGrid = !(
        relatedTarget && currentContainer.contains(relatedTarget as Node)
      );

      const isFocusMovingToPopover = getIsInPopover(relatedTarget);

      if (isFocusMovingOutsideGrid && !isFocusMovingToPopover) {
        const { rowIndex, columnId } = currentState.focusedCell;
        const cellKey = getCellKey(rowIndex, columnId);
        const cellElement = cellMapRef.current.get(cellKey);

        requestAnimationFrame(() => {
          if (focusGuardRef.current) {
            return;
          }

          if (cellElement && document.body.contains(cellElement)) {
            cellElement.focus();
          } else {
            currentContainer.focus();
          }
        });
      }
    }

    container.addEventListener("focusout", onFocusOut);

    return () => {
      container.removeEventListener("focusout", onFocusOut);
    };
  }, [store]);

  React.useEffect(() => {
    function onOutsideClick(event: MouseEvent) {
      if (event.button === 2) {
        return;
      }

      if (
        dataGridRef.current &&
        !dataGridRef.current.contains(event.target as Node)
      ) {
        const elements = document.elementsFromPoint(
          event.clientX,
          event.clientY
        );

        // Compensate for event.target bubbling up
        const isInsidePopover = elements.some((element) =>
          getIsInPopover(element)
        );

        if (!isInsidePopover) {
          blurCell();
          const currentState = store.getState();
          if (
            currentState.selectionState.selectedCells.size > 0 ||
            Object.keys(currentState.rowSelection).length > 0
          ) {
            onSelectionClear();
          }
        }
      }
    }

    document.addEventListener("mousedown", onOutsideClick);
    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
    };
  }, [store, blurCell, onSelectionClear]);

  React.useEffect(() => {
    function onSelectStart(event: Event) {
      event.preventDefault();
    }

    function onContextMenu(event: Event) {
      event.preventDefault();
    }

    function onCleanup() {
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("contextmenu", onContextMenu);
      document.body.style.userSelect = "";
    }

    const onUnsubscribe = store.subscribe(() => {
      const currentState = store.getState();
      if (currentState.selectionState.isSelecting) {
        document.addEventListener("selectstart", onSelectStart);
        document.addEventListener("contextmenu", onContextMenu);
        document.body.style.userSelect = "none";
      } else {
        onCleanup();
      }
    });

    return () => {
      onCleanup();
      onUnsubscribe();
    };
  }, [store]);

  useIsomorphicLayoutEffect(() => {
    const rafId = requestAnimationFrame(() => {
      rowVirtualizer.measure();
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    rowHeight,
    table.getState().columnFilters,
    table.getState().columnOrder,
    table.getState().columnPinning,
    table.getState().columnSizing,
    table.getState().columnVisibility,
    table.getState().expanded,
    table.getState().globalFilter,
    table.getState().grouping,
    table.getState().rowSelection,
    table.getState().sorting,
  ]);

  // Calculate virtual values outside of child render to avoid flushSync issues
  const virtualTotalSize = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();
  const measureElement = rowVirtualizer.measureElement;

  return React.useMemo(
    () => ({
      dataGridRef,
      headerRef,
      rowMapRef,
      footerRef,
      dir,
      table,
      tableMeta,
      virtualTotalSize,
      virtualItems,
      measureElement,
      columns,
      columnSizeVars,
      searchState,
      searchMatchesByRow,
      activeSearchMatch,
      cellSelectionMap,
      focusedCell,
      editingCell,
      rowHeight,
      contextMenu,
      pasteDialog,
      onRowAdd: propsRef.current.onRowAdd ? onRowAdd : undefined,
      adjustLayout,
    }),
    [
      propsRef,
      dir,
      table,
      tableMeta,
      virtualTotalSize,
      virtualItems,
      measureElement,
      columns,
      columnSizeVars,
      searchState,
      searchMatchesByRow,
      activeSearchMatch,
      cellSelectionMap,
      focusedCell,
      editingCell,
      rowHeight,
      contextMenu,
      pasteDialog,
      onRowAdd,
      adjustLayout,
    ]
  );
}

export {
  useDataGrid,
  //
  type UseDataGridProps,
};
