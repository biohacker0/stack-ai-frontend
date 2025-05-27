import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listResources } from "@/lib/api/connections";
import { listKBResourcesSafe } from "@/lib/api/knowledgeBase";
import { FileItem } from "@/lib/types/file";
import { toast } from 'react-toastify';

interface UseFileTreeProps {
  kbId?: string | null;
  statusMap?: Map<string, string>;
}

// Constants
const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL = 3000; // 3 seconds

export function useFileTree({ kbId, statusMap }: UseFileTreeProps = {}) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [errorToastShown, setErrorToastShown] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Fetch root files
  const {
    data: rootData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["drive-files", "root"],
    queryFn: () => listResources(),
    staleTime: STALE_TIME,
  });

  // Fetch folder contents with caching
  const fetchFolderContents = useCallback(
    async (folderId: string) => {
      const result = await queryClient.fetchQuery({
        queryKey: ["drive-files", folderId],
        queryFn: () => listResources(folderId),
        staleTime: STALE_TIME,
      });
      return result?.data || [];
    },
    [queryClient]
  );

  // Fetch KB status for a folder path
  const fetchKBStatusForFolder = useCallback(
    async (folderPath: string) => {
      if (!kbId) return new Map<string, string>();

      try {
        // Force fresh fetch
        await queryClient.invalidateQueries({
          queryKey: ["kb-file-status", kbId, folderPath],
        });

        const kbData = await listKBResourcesSafe(kbId, folderPath);
        const statusMap = new Map<string, string>();

        if (kbData?.data) {
          kbData.data.forEach((resource: any) => {
            statusMap.set(resource.id, resource.status || "unknown");
          });
        }

        return statusMap;
      } catch (error) {
        console.error("Failed to fetch KB status:", error);
        return new Map<string, string>();
      }
    },
    [kbId, queryClient]
  );

  // Extract folder path from file list
  const getFolderPath = useCallback((files: FileItem[]) => {
    if (!files.length) return "";

    const firstFile = files[0];
    const pathParts = firstFile.name.split("/");
    pathParts.pop(); // Remove filename
    return "/" + pathParts.join("/");
  }, []);

  // Update cached files with KB status
  const updateCachedFilesWithStatus = useCallback(
    (folderId: string, kbStatusMap: Map<string, string>) => {
      const cacheKey = ["drive-files", folderId];
      const cachedData = queryClient.getQueryData<{ data: FileItem[] }>(cacheKey);

      if (!cachedData?.data) return { updatedFiles: [], hasPending: false, hasErrors: false };

      const updatedFiles = cachedData.data.map((file) => ({
        ...file,
        status: (kbStatusMap.get(file.id) as FileItem["status"]) || file.status,
      }));

      queryClient.setQueryData(cacheKey, { data: updatedFiles });

      const hasPending = updatedFiles.some((file) => file.type === "file" && file.status === "pending");
      const hasErrors = updatedFiles.some((file) => file.type === "file" && file.status === "error");

      return { updatedFiles, hasPending, hasErrors };
    },
    [queryClient]
  );

  // Poll folder status for pending files
  const pollFolderStatus = useCallback(
    async (folderPath: string, folderId: string) => {
      try {
        const freshStatus = await fetchKBStatusForFolder(folderPath);
        const stillPending = Array.from(freshStatus.values()).some((status) => status === "pending");

        if (stillPending) {
          // Continue polling
          setTimeout(() => pollFolderStatus(folderPath, folderId), POLL_INTERVAL);
        } else {
          // Final update and check for errors
          const { hasErrors } = updateCachedFilesWithStatus(folderId, freshStatus);
          
          // Show error toast if errors found and not already shown for this folder
          if (hasErrors && !errorToastShown.has(folderId)) {
            setErrorToastShown(prev => new Set(prev).add(folderId));
            toast.error(
              `Some files in this folder failed to index. The knowledge base may be corrupted. Please create a new knowledge base.`,
              {
                autoClose: 8000,
                toastId: `folder-error-${folderId}`
              }
            );
          }
        }
      } catch (error) {
        console.error(`Error polling folder ${folderPath}:`, error);
      }
    },
    [fetchKBStatusForFolder, updateCachedFilesWithStatus, errorToastShown]
  );

  // Toggle folder expansion
  const toggleFolder = useCallback(
    async (folderId: string) => {
      const isExpanded = expandedFolders.has(folderId);

      if (isExpanded) {
        // Collapse folder
        setExpandedFolders((prev) => {
          const newSet = new Set(prev);
          newSet.delete(folderId);
          return newSet;
        });
        return;
      }

      // Expand folder
      setLoadingFolders((prev) => new Set(prev).add(folderId));

      try {
        // Fetch Google Drive contents
        const driveFiles = await fetchFolderContents(folderId);

        // Fetch and merge KB status if available
        if (kbId && driveFiles.length > 0) {
          const folderPath = getFolderPath(driveFiles);
          const kbStatusMap = await fetchKBStatusForFolder(folderPath);

          const { hasPending, hasErrors } = updateCachedFilesWithStatus(folderId, kbStatusMap);

          // Show error toast immediately if errors found and not already shown
          if (hasErrors && !errorToastShown.has(folderId)) {
            setErrorToastShown(prev => new Set(prev).add(folderId));
            toast.error(
              `Some files in this folder failed to index. The knowledge base may be corrupted. Please create a new knowledge base.`,
              {
                autoClose: 8000,
                toastId: `folder-error-${folderId}`
              }
            );
          }

          // Start polling if there are pending files
          if (hasPending) {
            setTimeout(() => pollFolderStatus(folderPath, folderId), POLL_INTERVAL);
          }
        }

        setExpandedFolders((prev) => new Set(prev).add(folderId));
      } catch (error) {
        console.error("Failed to load folder contents:", error);
      } finally {
        setLoadingFolders((prev) => {
          const newSet = new Set(prev);
          newSet.delete(folderId);
          return newSet;
        });
      }
    },
    [expandedFolders, fetchFolderContents, kbId, getFolderPath, fetchKBStatusForFolder, updateCachedFilesWithStatus, pollFolderStatus, errorToastShown]
  );

  // Build hierarchical file tree
  const buildFileTree = useCallback(
    (files: FileItem[], level = 0, parentPath = ""): FileItem[] => {
      return files.map((file) => {
        const isExpanded = expandedFolders.has(file.id);
        const isLoading = loadingFolders.has(file.id);
        let children: FileItem[] = [];

        if (file.type === "directory" && isExpanded && !isLoading) {
          const folderData = queryClient.getQueryData<{ data: FileItem[] }>(["drive-files", file.id]);

          if (folderData?.data) {
            const currentPath = parentPath ? `${parentPath}/${file.name.split("/").pop()}` : file.name.split("/").pop() || "";
            children = buildFileTree(folderData.data, level + 1, currentPath);
          }
        }

        // Apply KB status - root level uses statusMap, children use cached status
        const kbStatus = level === 0 ? (statusMap?.get(file.id) as FileItem["status"]) : file.status;

        return {
          ...file,
          isExpanded,
          isLoading,
          children,
          level,
          status: kbStatus || file.status,
        };
      });
    },
    [expandedFolders, loadingFolders, queryClient, statusMap]
  );

  // Build file tree from root data
  const fileTree = useMemo(() => {
    return rootData?.data ? buildFileTree(rootData.data) : [];
  }, [rootData?.data, buildFileTree]);

  // Flatten tree for table display
  const flattenTree = useCallback((tree: FileItem[]): FileItem[] => {
    const result: FileItem[] = [];

    const traverse = (items: FileItem[]) => {
      items.forEach((item) => {
        result.push(item);
        if (item.children?.length) {
          traverse(item.children);
        }
      });
    };

    traverse(tree);
    return result;
  }, []);

  const flatFiles = useMemo(() => flattenTree(fileTree), [fileTree, flattenTree]);

  // Collapse all folders - useful after deletion
  const collapseAllFolders = useCallback(() => {
    setExpandedFolders(new Set());
    setLoadingFolders(new Set());
    setErrorToastShown(new Set()); // Reset error toast tracking
  }, []);

  return {
    files: flatFiles,
    isLoading,
    error,
    expandedFolders,
    toggleFolder,
    collapseAllFolders,
    refetch,
  };
}
