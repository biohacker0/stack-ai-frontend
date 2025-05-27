import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteKBResource } from "@/lib/api/knowledgeBase";
import { FileItem } from "@/lib/types/file";

export function useKnowledgeBaseDeletion(kbId: string | null) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Delete multiple files mutation
  const deleteFilesMutation = useMutation({
    mutationFn: async (filesToDelete: FileItem[]) => {
      const results = [];

      for (const file of filesToDelete) {
        try {
          setDeletingFiles((prev) => new Set(prev).add(file.id));

          await deleteKBResource(kbId!, file.name);
          results.push({ file, success: true });
        } catch (error) {
          results.push({ file, success: false, error });
        } finally {
          setDeletingFiles((prev) => {
            const newSet = new Set(prev);
            newSet.delete(file.id);
            return newSet;
          });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.success).length;
      const totalCount = results.length;

      // Invalidate all KB-related queries to refresh status
      queryClient.invalidateQueries({ queryKey: ["kb-resources"] });
      queryClient.invalidateQueries({ queryKey: ["kb-file-status"] });

      // Clear all drive-files cache to force fresh status checks
      queryClient.removeQueries({ queryKey: ["drive-files"] });

      setIsDeleting(false);
    },
    onError: (error) => {
      console.error("Deletion process failed:", error);
      setIsDeleting(false);
    },
  });

  // Filter and process selected files for deletion
  const deleteSelectedFiles = useCallback(
    (selectedIds: string[], allFiles: FileItem[]) => {
      if (!kbId) {
        console.warn("No KB ID available for deletion");
        return;
      }

      // Create file map for quick lookup
      const fileMap = new Map<string, FileItem>();
      allFiles.forEach((file) => {
        fileMap.set(file.id, file);
      });

      // Process selection to find deletable files
      const filesToDelete: FileItem[] = [];

      selectedIds.forEach((id) => {
        const item = fileMap.get(id);
        if (!item) return;

        if (item.type === "file" && item.status === "indexed") {
          // Direct file selection - can delete if indexed
          filesToDelete.push(item);
        } else if (item.type === "directory") {
          // Folder selection - find all indexed files inside
          const indexedFilesInFolder = allFiles.filter((file) => file.type === "file" && file.status === "indexed" && file.name.startsWith(item.name + "/"));
          filesToDelete.push(...indexedFilesInFolder);
        }
      });

      // Remove duplicates
      const uniqueFiles = filesToDelete.filter((file, index, arr) => arr.findIndex((f) => f.id === file.id) === index);

      if (uniqueFiles.length === 0) {
        console.warn("No indexed files selected for deletion");
        return;
      }

      setIsDeleting(true);
      deleteFilesMutation.mutate(uniqueFiles);
    },
    [kbId, deleteFilesMutation]
  );

  // Check if a file is currently being deleted
  const isFileDeleting = useCallback(
    (fileId: string) => {
      return deletingFiles.has(fileId);
    },
    [deletingFiles]
  );

  // Check if a file can be deleted (indexed status)
  const canDeleteFile = useCallback((file: FileItem) => {
    return file.type === "file" && file.status === "indexed";
  }, []);

  // Check if a folder has any deletable files
  const canDeleteFolder = useCallback((folder: FileItem, allFiles: FileItem[]) => {
    if (folder.type !== "directory") return false;

    return allFiles.some((file) => file.type === "file" && file.status === "indexed" && file.name.startsWith(folder.name + "/"));
  }, []);

  return {
    isDeleting,
    deleteSelectedFiles,
    isFileDeleting,
    canDeleteFile,
    canDeleteFolder,
    isError: deleteFilesMutation.isError,
    error: deleteFilesMutation.error,
  };
}
