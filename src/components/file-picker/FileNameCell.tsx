import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Folder, File, FolderOpen } from "lucide-react";
import { FileItem } from "@/lib/types/file";

interface FileNameCellProps {
  file: FileItem;
  isFiltering: boolean | string;
  toggleFolder?: (folderId: string) => void;
}

export function FileNameCell({ file, isFiltering, toggleFolder }: FileNameCellProps) {
  const level = file.level || 0;
  const isDirectory = file.type === "directory";
  const isExpanded = file.isExpanded;
  const isLoading = file.isLoading;

  // Function to truncate path intelligently
  const truncatePath = (path: string, maxLength: number = 40) => {
    if (path.length <= maxLength) return path;

    const parts = path.split("/");
    if (parts.length <= 2) return path;

    const fileName = parts[parts.length - 1];
    const firstFolder = parts[0];

    if (firstFolder.length + fileName.length + 5 <= maxLength) {
      return `${firstFolder}/.../${fileName}`;
    }

    return `.../${fileName}`;
  };

  return (
    <div className="flex items-center space-x-1" style={{ paddingLeft: isFiltering ? "0px" : `${level * 20}px` }}>
      {/* Expand/Collapse Button */}
      {!isFiltering && isDirectory && (
        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0 hover:bg-gray-100"
          onClick={(e) => {
            e.stopPropagation();
            toggleFolder?.(file.id);
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-blue-600" />
          ) : isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      )}

      {/* Spacer for files when not filtering */}
      {!isFiltering && !isDirectory && <div className="w-4" />}

      {/* File/Folder Icon */}
      {isDirectory ? isExpanded ? <FolderOpen className="h-4 w-4 text-blue-500" /> : <Folder className="h-4 w-4 text-blue-500" /> : <File className="h-4 w-4 text-gray-500" />}

      {/* File Name */}
      {isLoading ? (
        <Skeleton className="h-4 w-32" />
      ) : (
        <span className="truncate cursor-default" title={isFiltering ? file.name : file.name.split("/").pop()}>
          {isFiltering ? truncatePath(file.name) : file.name.split("/").pop()}
        </span>
      )}
    </div>
  );
}
