import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { listKBResources } from "@/lib/api/knowledgeBase";
import { FileItem } from "@/lib/types/file";
import { toast } from 'react-toastify';

interface UseKnowledgeBaseStatusProps {
  kbId: string | null;
  enabled?: boolean;
}

// Constants
const POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLL_DURATION = 2 * 60 * 1000; // 2 minutes

export function useKnowledgeBaseStatus({ kbId, enabled = true }: UseKnowledgeBaseStatusProps) {
  const [shouldPoll, setShouldPoll] = useState(true);
  const [pollingStartTime] = useState(Date.now());
  const [hasShownErrorToast, setHasShownErrorToast] = useState(false);

  // Poll KB resources
  const {
    data: kbResources,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["kb-resources", kbId],
    queryFn: () => listKBResources(kbId!),
    enabled: enabled && !!kbId && shouldPoll,
    refetchInterval: shouldPoll ? POLL_INTERVAL : false,
    refetchIntervalInBackground: true,
    staleTime: 0, // Always consider data stale for polling
  });

  // Determine if polling should continue
  useEffect(() => {
    if (!kbResources?.data) return;

    const resources = kbResources.data;

    // Stop if empty KB
    if (resources.length === 0) {
      setShouldPoll(false);
      return;
    }

    // Filter only files (directories are always "unknown")
    const files = resources.filter((item) => item.type === "file");

    if (files.length === 0) {
      setShouldPoll(false);
      return;
    }

    // Check for unsettled files (pending or pending_delete)
    const hasUnsettledFiles = files.some((file) => file.status === "pending" || file.status === "pending_delete");

    // Check for error files and show toast if not already shown
    const errorFiles = files.filter((file) => file.status === "error");
    if (errorFiles.length > 0 && !hasShownErrorToast) {
      setHasShownErrorToast(true);
      toast.error(
        `Failed to index ${errorFiles.length} file(s). The knowledge base may be corrupted. Please create a new knowledge base.`,
        {
          autoClose: 8000,
          toastId: 'kb-error-toast' // Prevent duplicate toasts
        }
      );
    }

    // Check polling timeout
    const pollingDuration = Date.now() - pollingStartTime;
    if (pollingDuration > MAX_POLL_DURATION) {
      setShouldPoll(false);
      return;
    }

    // Stop polling if all files are settled (indexed, error, or deleted)
    if (!hasUnsettledFiles) {
      setShouldPoll(false);
      return;
    }
  }, [kbResources, pollingStartTime, hasShownErrorToast]);

  // Build status map for quick lookups
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();
    kbResources?.data?.forEach((resource) => {
      map.set(resource.id, resource.status || "unknown");
    });
    return map;
  }, [kbResources?.data]);

  // Calculate if all files are settled (including error status)
  const allFilesSettled = useMemo(() => {
    if (!kbResources?.data) return false;

    return kbResources.data.every((file) => 
      file.status !== "pending" && 
      file.status !== "pending_delete"
    );
  }, [kbResources?.data]);

  // Count files by status (including error)
  const statusCounts = useMemo(() => {
    const counts = {
      indexed: 0,
      pending: 0,
      pending_delete: 0,
      error: 0,
      unknown: 0,
    };

    kbResources?.data?.forEach((resource) => {
      const status = resource.status || "unknown";
      if (status in counts) {
        counts[status as keyof typeof counts]++;
      }
    });

    return counts;
  }, [kbResources?.data]);

  return {
    kbResources: kbResources?.data || [],
    statusMap,
    statusCounts,
    allFilesSettled,
    isLoading,
    error,
    refetch,
  };
}
