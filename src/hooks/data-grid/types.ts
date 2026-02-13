import type { ColumnDef, Row, Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";

import type {
  CellPosition,
  CellUpdate,
  Direction,
  NavigationDirection,
  RowHeightValue,
  SearchState,
} from "@/types/data-grid";

export interface DataGridState {
  sorting: import("@tanstack/react-table").SortingState;
  columnFilters: import("@tanstack/react-table").ColumnFiltersState;
  rowHeight: RowHeightValue;
  rowSelection: import("@tanstack/react-table").RowSelectionState;
  selectionState: import("@/types/data-grid").SelectionState;
  focusedCell: CellPosition | null;
  editingCell: CellPosition | null;
  cutCells: Set<string>;
  contextMenu: import("@/types/data-grid").ContextMenuState;
  searchQuery: string;
  searchMatches: CellPosition[];
  matchIndex: number;
  searchOpen: boolean;
  lastClickedRowIndex: number | null;
  pasteDialog: import("@/types/data-grid").PasteDialogState;
}

export interface DataGridStore {
  subscribe: (callback: () => void) => () => void;
  getState: () => DataGridState;
  setState: <K extends keyof DataGridState>(
    key: K,
    value: DataGridState[K]
  ) => void;
  notify: () => void;
  batch: (fn: () => void) => void;
}

export interface DataGridContext<TData> {
  store: DataGridStore;
  stateRef: React.MutableRefObject<DataGridState>;
  propsRef: React.MutableRefObject<{
    data: TData[];
    columns: ColumnDef<TData, unknown>[];
    readOnly?: boolean;
    enableSingleCellSelection?: boolean;
    enableColumnSelection?: boolean;
    enableSearch?: boolean;
    enablePaste?: boolean;
    onDataChange?: (data: TData[]) => void;
    onRowAdd?: (
      event?: React.MouseEvent<HTMLDivElement>
    ) => Partial<CellPosition> | Promise<Partial<CellPosition> | null> | null;
    onRowsAdd?: (count: number) => void | Promise<void>;
    onRowsDelete?: (
      rows: TData[],
      rowIndices: number[]
    ) => void | Promise<void>;
    onPaste?: (updates: CellUpdate[]) => void | Promise<void>;
    onFilesUpload?: (params: {
      files: File[];
      rowIndex: number;
      columnId: string;
    }) => Promise<import("@/types/data-grid").FileCellData[]>;
    onFilesDelete?: (params: {
      fileIds: string[];
      rowIndex: number;
      columnId: string;
    }) => void | Promise<void>;
    onRowHeightChange?: (rowHeight: RowHeightValue) => void;
    onSortingChange?: (
      sorting: import("@tanstack/react-table").SortingState
    ) => void;
    onColumnFiltersChange?: (
      filters: import("@tanstack/react-table").ColumnFiltersState
    ) => void;
    autoFocus?: boolean | Partial<CellPosition>;
    meta?: import("@tanstack/react-table").TableMeta<TData>;
    initialState?: import("@tanstack/react-table").InitialTableState;
    state?: Partial<import("@tanstack/react-table").TableState>;
  }>;
  tableRef: React.MutableRefObject<Table<TData> | null>;
  rowVirtualizerRef: React.MutableRefObject<Virtualizer<
    HTMLDivElement,
    Element
  > | null>;
  dataGridRef: React.RefObject<HTMLDivElement | null>;
  headerRef: React.RefObject<HTMLDivElement | null>;
  footerRef: React.RefObject<HTMLDivElement | null>;
  cellMapRef: React.RefObject<Map<string, HTMLDivElement>>;
  rowMapRef: React.RefObject<Map<number, HTMLDivElement>>;
  focusGuardRef: React.MutableRefObject<boolean>;
  navigableColumnIds: string[];
  columnIds: string[];
  dir: Direction;
}
