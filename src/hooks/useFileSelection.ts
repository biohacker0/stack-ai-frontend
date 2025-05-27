import { useState, useCallback, useMemo } from "react";
import { FileItem } from "@/lib/types/file";

interface UseFileSelectionProps {
  files: FileItem[];
}

export function useFileSelection({ files }: UseFileSelectionProps) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  // Build a map of parent-child relationships for efficient lookups
  const fileRelationships = useMemo(() => {
    const childrenMap = new Map<string, string[]>();
    const parentMap = new Map<string, string>();

    files.forEach((file) => {
      if (file.type === "directory") {
        // Find all children of this directory
        const children = files.filter((f) => f.name.startsWith(file.name + "/")).map((f) => f.id);

        childrenMap.set(file.id, children);

        // Map children to parent
        children.forEach((childId) => {
          parentMap.set(childId, file.id);
        });
      }
    });

    return { childrenMap, parentMap };
  }, [files]);

  // Helper function to get all descendant IDs recursively
  const getAllDescendantIds = useCallback(
    (fileId: string): string[] => {
      const descendants: string[] = [];
      const queue = [fileId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = fileRelationships.childrenMap.get(currentId) || [];

        children.forEach((childId) => {
          descendants.push(childId);
          queue.push(childId);
        });
      }

      return descendants;
    },
    [fileRelationships]
  );

  // Custom selection handler that maintains parent-child relationships
  const handleRowSelection = useCallback(
    (fileId: string, isSelected: boolean) => {
      const file = files.find((f) => f.id === fileId);
      if (!file) return;

      setRowSelection((prev) => {
        const newSelection = { ...prev };

        // Toggle the clicked item
        if (isSelected) {
          newSelection[fileId] = true;
        } else {
          delete newSelection[fileId];
        }

        // If it's a directory, handle all descendants
        if (file.type === "directory") {
          const descendantIds = getAllDescendantIds(fileId);

          descendantIds.forEach((id) => {
            if (isSelected) {
              newSelection[id] = true;
            } else {
              delete newSelection[id];
            }
          });
        }

        return newSelection;
      });
    },
    [files, getAllDescendantIds]
  );

  // Handle select all functionality
  const handleSelectAll = useCallback((isSelected: boolean, visibleRows: any[]) => {
    const newSelection: Record<string, boolean> = {};

    if (isSelected) {
      visibleRows.forEach((row) => {
        newSelection[row.original.id] = true;
      });
    }

    setRowSelection(newSelection);
  }, []);

  // Get selected files
  const selectedFiles = useMemo(() => {
    return files.filter((file) => rowSelection[file.id]);
  }, [files, rowSelection]);

  // Get selected resource IDs
  const selectedResourceIds = useMemo(() => {
    return selectedFiles.map((file) => file.id);
  }, [selectedFiles]);

  return {
    rowSelection,
    selectedFiles,
    selectedResourceIds,
    handleRowSelection,
    handleSelectAll,
    setRowSelection,
  };
} 