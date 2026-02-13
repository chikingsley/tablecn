import type { Row } from "@tanstack/react-table";
import * as React from "react";
import { toast } from "sonner";

import {
  getCellKey,
  getEmptyCellValue,
  getIsFileCellData,
  matchSelectOption,
  parseCellKey,
} from "@/lib/data-grid";
import type { CellPosition, CellUpdate } from "@/types/data-grid";

import type { DataGridContext } from "./types";

const DOMAIN_REGEX = /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}.*)?$/;
const TRUTHY_BOOLEANS = new Set(["true", "1", "yes", "checked"]);
const VALID_BOOLEANS = new Set([
  "true",
  "false",
  "1",
  "0",
  "yes",
  "no",
  "checked",
  "unchecked",
]);

function useDataGridClipboard<TData>(
  ctx: DataGridContext<TData>,
  onDataUpdate: (updates: CellUpdate | CellUpdate[]) => void,
  selectRange: (start: CellPosition, end: CellPosition) => void,
  restoreFocus: (element: HTMLDivElement | null) => void
) {
  const { store, propsRef, tableRef, dataGridRef, navigableColumnIds } = ctx;

  const serializeCellsToTsv = React.useCallback(() => {
    const currentState = store.getState();

    let selectedCellsArray: string[];
    if (currentState.selectionState.selectedCells.size) {
      selectedCellsArray = Array.from(
        currentState.selectionState.selectedCells
      );
    } else {
      if (!currentState.focusedCell) {
        return null;
      }
      const focusedCellKey = getCellKey(
        currentState.focusedCell.rowIndex,
        currentState.focusedCell.columnId
      );
      selectedCellsArray = [focusedCellKey];
    }

    const currentTable = tableRef.current;
    const rows = currentTable?.getRowModel().rows;
    if (!rows) {
      return null;
    }

    const selectedColumnIds: string[] = [];
    const seenColumnIds = new Set<string>();
    const cellData = new Map<string, string>();
    const rowIndices = new Set<number>();
    const rowCellMaps = new Map<
      number,
      Map<string, ReturnType<Row<TData>["getVisibleCells"]>[number]>
    >();

    for (const cellKey of selectedCellsArray) {
      const { rowIndex, columnId } = parseCellKey(cellKey);

      if (columnId && !seenColumnIds.has(columnId)) {
        seenColumnIds.add(columnId);
        selectedColumnIds.push(columnId);
      }

      rowIndices.add(rowIndex);

      const row = rows[rowIndex];
      if (row) {
        let cellMap = rowCellMaps.get(rowIndex);
        if (!cellMap) {
          cellMap = new Map(row.getVisibleCells().map((c) => [c.column.id, c]));
          rowCellMaps.set(rowIndex, cellMap);
        }
        const cell = cellMap.get(columnId);
        if (cell) {
          const value = cell.getValue();
          const cellVariant = cell.column.columnDef?.meta?.cell?.variant;

          let serializedValue = "";
          if (cellVariant === "file" || cellVariant === "multi-select") {
            serializedValue = value ? JSON.stringify(value) : "";
          } else if (value instanceof Date) {
            serializedValue = value.toISOString();
          } else {
            serializedValue = String(value ?? "");
          }

          cellData.set(cellKey, serializedValue);
        }
      }
    }

    const colIndices = new Set<number>();
    for (const cellKey of selectedCellsArray) {
      const { columnId } = parseCellKey(cellKey);
      const colIndex = selectedColumnIds.indexOf(columnId);
      if (colIndex >= 0) {
        colIndices.add(colIndex);
      }
    }

    const sortedRowIndices = Array.from(rowIndices).sort((a, b) => a - b);
    const sortedColIndices = Array.from(colIndices).sort((a, b) => a - b);
    const sortedColumnIds = sortedColIndices.map((i) => selectedColumnIds[i]);

    const tsvData = sortedRowIndices
      .map((rowIndex) =>
        sortedColumnIds
          .map((columnId) => {
            const cellKey = `${rowIndex}:${columnId}`;
            return cellData.get(cellKey) ?? "";
          })
          .join("\t")
      )
      .join("\n");

    return { tsvData, selectedCellsArray };
  }, [store, tableRef]);

  const onCellsCopy = React.useCallback(async () => {
    const result = serializeCellsToTsv();
    if (!result) {
      return;
    }

    const { tsvData, selectedCellsArray } = result;

    try {
      await navigator.clipboard.writeText(tsvData);

      const currentState = store.getState();
      if (currentState.cutCells.size > 0) {
        store.setState("cutCells", new Set());
      }

      toast.success(
        `${selectedCellsArray.length} cell${
          selectedCellsArray.length !== 1 ? "s" : ""
        } copied`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to copy to clipboard"
      );
    }
  }, [store, serializeCellsToTsv]);

  const onCellsCut = React.useCallback(async () => {
    if (propsRef.current.readOnly) {
      return;
    }

    const result = serializeCellsToTsv();
    if (!result) {
      return;
    }

    const { tsvData, selectedCellsArray } = result;

    try {
      await navigator.clipboard.writeText(tsvData);

      store.setState("cutCells", new Set(selectedCellsArray));

      toast.success(
        `${selectedCellsArray.length} cell${
          selectedCellsArray.length !== 1 ? "s" : ""
        } cut`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to cut to clipboard"
      );
    }
  }, [store, propsRef, serializeCellsToTsv]);

  const onCellsPaste = React.useCallback(
    async (expandRows = false) => {
      if (propsRef.current.readOnly) {
        return;
      }

      const currentState = store.getState();
      if (!currentState.focusedCell) {
        return;
      }

      const currentTable = tableRef.current;
      const rows = currentTable?.getRowModel().rows;
      if (!rows) {
        return;
      }

      try {
        let clipboardText = currentState.pasteDialog.clipboardText;

        if (!clipboardText) {
          clipboardText = await navigator.clipboard.readText();
          if (!clipboardText) {
            return;
          }
        }

        const pastedRows = clipboardText
          .split("\n")
          .filter((row) => row.length > 0);
        const pastedData = pastedRows.map((row) => row.split("\t"));

        const startRowIndex = currentState.focusedCell.rowIndex;
        const startColIndex = navigableColumnIds.indexOf(
          currentState.focusedCell.columnId
        );

        if (startColIndex === -1) {
          return;
        }

        const rowCount = rows.length ?? propsRef.current.data.length;
        const rowsNeeded = startRowIndex + pastedData.length - rowCount;

        if (
          rowsNeeded > 0 &&
          !expandRows &&
          propsRef.current.onRowAdd &&
          !currentState.pasteDialog.clipboardText
        ) {
          store.setState("pasteDialog", {
            open: true,
            rowsNeeded,
            clipboardText,
          });
          return;
        }

        if (expandRows && rowsNeeded > 0) {
          const expectedRowCount = rowCount + rowsNeeded;

          if (propsRef.current.onRowsAdd) {
            await propsRef.current.onRowsAdd(rowsNeeded);
          } else if (propsRef.current.onRowAdd) {
            for (let i = 0; i < rowsNeeded; i++) {
              await propsRef.current.onRowAdd();
            }
          }

          let attempts = 0;
          const maxAttempts = 50;
          let currentTableRowCount =
            tableRef.current?.getRowModel().rows.length ?? 0;

          while (
            currentTableRowCount < expectedRowCount &&
            attempts < maxAttempts
          ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            currentTableRowCount =
              tableRef.current?.getRowModel().rows.length ?? 0;
            attempts++;
          }
        }

        const updates: CellUpdate[] = [];
        const tableColumns = currentTable?.getAllColumns() ?? [];
        let cellsUpdated = 0;
        let endRowIndex = startRowIndex;
        let endColIndex = startColIndex;

        const updatedTable = tableRef.current;
        const updatedRows = updatedTable?.getRowModel().rows;
        const currentRowCount = updatedRows?.length ?? 0;

        let cellsSkipped = 0;

        const columnMap = new Map(tableColumns.map((c) => [c.id, c]));

        for (
          let pasteRowIdx = 0;
          pasteRowIdx < pastedData.length;
          pasteRowIdx++
        ) {
          const pasteRow = pastedData[pasteRowIdx];
          if (!pasteRow) {
            continue;
          }

          const targetRowIndex = startRowIndex + pasteRowIdx;
          if (targetRowIndex >= currentRowCount) {
            break;
          }

          for (
            let pasteColIdx = 0;
            pasteColIdx < pasteRow.length;
            pasteColIdx++
          ) {
            const targetColIndex = startColIndex + pasteColIdx;
            if (targetColIndex >= navigableColumnIds.length) {
              break;
            }

            const targetColumnId = navigableColumnIds[targetColIndex];
            if (!targetColumnId) {
              continue;
            }

            const pastedValue = pasteRow[pasteColIdx] ?? "";
            const column = columnMap.get(targetColumnId);
            const cellOpts = column?.columnDef?.meta?.cell;
            const cellVariant = cellOpts?.variant;

            let processedValue: unknown = pastedValue;
            let shouldSkip = false;

            switch (cellVariant) {
              case "number": {
                if (pastedValue) {
                  const num = Number.parseFloat(pastedValue);
                  if (Number.isNaN(num)) {
                    shouldSkip = true;
                  } else {
                    processedValue = num;
                  }
                } else {
                  processedValue = null;
                }
                break;
              }

              case "checkbox": {
                if (pastedValue) {
                  const lower = pastedValue.toLowerCase();
                  if (VALID_BOOLEANS.has(lower)) {
                    processedValue = TRUTHY_BOOLEANS.has(lower);
                  } else {
                    shouldSkip = true;
                  }
                } else {
                  processedValue = false;
                }
                break;
              }

              case "date": {
                if (pastedValue) {
                  const date = new Date(pastedValue);
                  if (Number.isNaN(date.getTime())) {
                    shouldSkip = true;
                  } else {
                    processedValue = date;
                  }
                } else {
                  processedValue = null;
                }
                break;
              }

              case "select": {
                const options = cellOpts?.options ?? [];
                if (pastedValue) {
                  const matched = matchSelectOption(pastedValue, options);
                  if (matched) {
                    processedValue = matched;
                  } else {
                    shouldSkip = true;
                  }
                } else {
                  processedValue = "";
                }
                break;
              }

              case "multi-select": {
                const options = cellOpts?.options ?? [];
                let values: string[] = [];
                try {
                  const parsed = JSON.parse(pastedValue);
                  if (Array.isArray(parsed)) {
                    values = parsed.filter(
                      (v): v is string => typeof v === "string"
                    );
                  }
                } catch {
                  values = pastedValue
                    ? pastedValue.split(",").map((v) => v.trim())
                    : [];
                }

                const validated = values
                  .map((v) => matchSelectOption(v, options))
                  .filter(Boolean) as string[];

                if (values.length > 0 && validated.length === 0) {
                  shouldSkip = true;
                } else {
                  processedValue = validated;
                }
                break;
              }

              case "file": {
                if (pastedValue) {
                  try {
                    const parsed = JSON.parse(pastedValue);
                    if (Array.isArray(parsed)) {
                      const validFiles = parsed.filter(getIsFileCellData);
                      if (parsed.length > 0 && validFiles.length === 0) {
                        shouldSkip = true;
                      } else {
                        processedValue = validFiles;
                      }
                    } else {
                      shouldSkip = true;
                    }
                  } catch {
                    shouldSkip = true;
                  }
                } else {
                  processedValue = [];
                }
                break;
              }

              case "url": {
                if (pastedValue) {
                  const firstChar = pastedValue[0];
                  if (firstChar === "[" || firstChar === "{") {
                    shouldSkip = true;
                  } else {
                    try {
                      new URL(pastedValue);
                      processedValue = pastedValue;
                    } catch {
                      if (DOMAIN_REGEX.test(pastedValue)) {
                        processedValue = pastedValue;
                      } else {
                        shouldSkip = true;
                      }
                    }
                  }
                } else {
                  processedValue = "";
                }
                break;
              }

              default: {
                if (!pastedValue) {
                  processedValue = "";
                  break;
                }

                if (ISO_DATE_REGEX.test(pastedValue)) {
                  const date = new Date(pastedValue);
                  if (!Number.isNaN(date.getTime())) {
                    processedValue = date.toLocaleDateString();
                    break;
                  }
                }

                const firstChar = pastedValue[0];
                if (
                  firstChar === "[" ||
                  firstChar === "{" ||
                  firstChar === "t" ||
                  firstChar === "f"
                ) {
                  try {
                    const parsed = JSON.parse(pastedValue);

                    if (Array.isArray(parsed)) {
                      if (
                        parsed.length > 0 &&
                        parsed.every(getIsFileCellData)
                      ) {
                        processedValue = parsed.map((f) => f.name).join(", ");
                      } else if (parsed.every((v) => typeof v === "string")) {
                        processedValue = (parsed as string[]).join(", ");
                      }
                    } else if (typeof parsed === "boolean") {
                      processedValue = parsed ? "Checked" : "Unchecked";
                    }
                  } catch {
                    const lower = pastedValue.toLowerCase();
                    if (lower === "true" || lower === "false") {
                      processedValue =
                        lower === "true" ? "Checked" : "Unchecked";
                    }
                  }
                }
              }
            }

            if (shouldSkip) {
              cellsSkipped++;
              endRowIndex = Math.max(endRowIndex, targetRowIndex);
              endColIndex = Math.max(endColIndex, targetColIndex);
              continue;
            }

            updates.push({
              rowIndex: targetRowIndex,
              columnId: targetColumnId,
              value: processedValue,
            });
            cellsUpdated++;

            endRowIndex = Math.max(endRowIndex, targetRowIndex);
            endColIndex = Math.max(endColIndex, targetColIndex);
          }
        }

        if (updates.length > 0) {
          if (propsRef.current.onPaste) {
            await propsRef.current.onPaste(updates);
          }

          const allUpdates = [...updates];

          if (currentState.cutCells.size > 0) {
            const columnById = new Map(tableColumns.map((c) => [c.id, c]));

            for (const cellKey of currentState.cutCells) {
              const { rowIndex, columnId } = parseCellKey(cellKey);
              const column = columnById.get(columnId);
              const cellVariant = column?.columnDef?.meta?.cell?.variant;
              const emptyValue = getEmptyCellValue(cellVariant);
              allUpdates.push({ rowIndex, columnId, value: emptyValue });
            }

            store.setState("cutCells", new Set());
          }

          onDataUpdate(allUpdates);

          if (cellsSkipped > 0) {
            toast.success(
              `${cellsUpdated} cell${
                cellsUpdated !== 1 ? "s" : ""
              } pasted, ${cellsSkipped} skipped`
            );
          } else {
            toast.success(
              `${cellsUpdated} cell${cellsUpdated !== 1 ? "s" : ""} pasted`
            );
          }

          const endColumnId = navigableColumnIds[endColIndex];
          if (endColumnId) {
            selectRange(
              {
                rowIndex: startRowIndex,
                columnId: currentState.focusedCell.columnId,
              },
              { rowIndex: endRowIndex, columnId: endColumnId }
            );
          }

          restoreFocus(dataGridRef.current);
        } else if (cellsSkipped > 0) {
          toast.error(
            `${cellsSkipped} cell${
              cellsSkipped !== 1 ? "s" : ""
            } skipped pasting for invalid data`
          );
        }

        if (currentState.pasteDialog.open) {
          store.setState("pasteDialog", {
            open: false,
            rowsNeeded: 0,
            clipboardText: "",
          });
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to paste. Please try again."
        );
      }
    },
    [
      store,
      navigableColumnIds,
      propsRef,
      tableRef,
      dataGridRef,
      onDataUpdate,
      selectRange,
      restoreFocus,
    ]
  );

  return {
    serializeCellsToTsv,
    onCellsCopy,
    onCellsCut,
    onCellsPaste,
  };
}

export { useDataGridClipboard };
