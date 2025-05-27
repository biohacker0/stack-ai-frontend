"use client";

import { useFileTree } from "@/hooks/useFileTree";
import { useKnowledgeBaseOperations } from "@/hooks/useKnowledgeBaseOperations";
import { FilePickerTable } from "./FilePickerTable";

export function FilePicker() {
  const {
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
  } = useKnowledgeBaseOperations();

  const { files, isLoading, error, toggleFolder, collapseAllFolders } = useFileTree({
    kbId: currentKB?.id || null,
    statusMap,
  });

  // Show error if any
  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-xl text-red-600">Error loading files</h2>
        <pre className="mt-2">{JSON.stringify(error, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-shrink-0 p-4 pb-2">
        <h1 className="text-2xl font-bold mb-2">Google Drive File Picker</h1>
      </div>

      <div className="flex-1 min-h-0 p-4">
        <FilePickerTable
          files={files}
          isLoading={isLoading || isCreating || isDeleting}
          toggleFolder={toggleFolder}
          onCreateKB={(resourceIds, files) => {
            createKnowledgeBaseWithFiles(resourceIds, files);
            // Collapse all folders after KB creation to force refresh
            setTimeout(() => collapseAllFolders(), 1000);
          }}
          onCreateNewKB={createNewKB}
          onDeleteFiles={(selectedIds) => {
            deleteSelectedFiles(selectedIds, files);
            // Collapse all folders after deletion to force refresh
            setTimeout(() => collapseAllFolders(), 1000);
          }}
          hasKB={hasKB}
          isCreatingKB={isCreating}
          isDeletingKB={isDeleting}
          statusMap={statusMap}
          canDeleteFile={canDeleteFile}
          canDeleteFolder={(folder) => canDeleteFolder(folder, files)}
          isFileDeleting={isFileDeleting}
        />
      </div>
    </div>
  );
}
