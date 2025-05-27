import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { createKnowledgeBase, syncKnowledgeBase } from "@/lib/api/knowledgeBase";
import { saveKBToStorage, getKBFromStorage, clearKBFromStorage } from "@/lib/utils/localStorage";
import { deduplicateResourceIds } from "@/lib/utils/resourceDeduplication";
import { useKnowledgeBaseStatus } from "./useKnowledgeBaseStatus";
import { useKnowledgeBaseDeletion } from "./useKnowledgeBaseDeletion";
import type { KnowledgeBase } from "@/lib/types/knowledgeBase";
import type { FileItem } from "@/lib/types/file";

export function useKnowledgeBaseOperations() {
  const [currentKB, setCurrentKB] = useState<KnowledgeBase | null>(() => {
    // Initialize from localStorage on mount
    const stored = getKBFromStorage();
    return stored ? { ...stored, is_empty: false } : null;
  });

  const [isCreating, setIsCreating] = useState(false);
  const hasKB = currentKB !== null;

  // Poll KB status after creation
  const {
    statusMap,
    statusCounts,
    allFilesSettled,
    isLoading: isPolling,
  } = useKnowledgeBaseStatus({
    kbId: currentKB?.id || null,
    enabled: hasKB && !isCreating, // Only poll when we have a KB and not creating
  });

  // Handle file deletion
  const { isDeleting, deleteSelectedFiles, isFileDeleting, canDeleteFile, canDeleteFolder } = useKnowledgeBaseDeletion(currentKB?.id || null);

  // Create KB mutation
  const createKBMutation = useMutation({
    mutationFn: async ({ resourceIds, files }: { resourceIds: string[]; files: FileItem[] }) => {
      // Deduplicate resource IDs before sending to backend
      const deduplicatedIds = deduplicateResourceIds(resourceIds, files);

      const kbData = {
        name: `Knowledge Base ${new Date().toLocaleString()}`,
        description: "Created from Google Drive files",
        resource_ids: deduplicatedIds,
      };

      const kb = await createKnowledgeBase(kbData);

      // Trigger sync immediately after creation
      await syncKnowledgeBase(kb.id);

      return kb;
    },
    onSuccess: (kb) => {
      // Save to localStorage
      saveKBToStorage({
        id: kb.id,
        name: kb.name,
        created_at: kb.created_at,
      });

      setCurrentKB(kb);
      setIsCreating(false);
    },
    onError: (error) => {
      console.error("Failed to create KB:", error);
      setIsCreating(false);
    },
  });

  const createKnowledgeBaseWithFiles = useCallback(
    (resourceIds: string[], files: FileItem[]) => {
      if (resourceIds.length === 0) {
        console.warn("No files selected for KB creation");
        return;
      }

      setIsCreating(true);
      createKBMutation.mutate({ resourceIds, files });
    },
    [createKBMutation]
  );

  const createNewKB = useCallback(() => {
    // Clear everything and refresh page
    clearKBFromStorage();
    window.location.reload();
  }, []);

  return {
    currentKB,
    hasKB,
    isCreating,
    createKnowledgeBaseWithFiles,
    createNewKB,
    statusMap,
    statusCounts,
    allFilesSettled,
    isPolling,
    // Deletion functions
    isDeleting,
    deleteSelectedFiles,
    isFileDeleting,
    canDeleteFile,
    canDeleteFolder,
    isError: createKBMutation.isError,
    error: createKBMutation.error,
  };
}
