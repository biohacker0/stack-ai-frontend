import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { listKBResources } from "@/lib/api/knowledgeBase";
import { FileItem } from "@/lib/types/file";

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

    // Check for unsettled files
    const hasUnsettledFiles = files.some((file) => file.status === "pending" || file.status === "pending_delete");

    // Check polling timeout
    const pollingDuration = Date.now() - pollingStartTime;
    if (pollingDuration > MAX_POLL_DURATION) {
      setShouldPoll(false);
      return;
    }

    // Continue polling even if root files are settled (for nested files)
    if (!hasUnsettledFiles && pollingDuration < MAX_POLL_DURATION) {
      // Keep polling for potential nested files
    }
  }, [kbResources, pollingStartTime]);

  // Build status map for quick lookups
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();
    kbResources?.data?.forEach((resource) => {
      map.set(resource.id, resource.status || "unknown");
    });
    return map;
  }, [kbResources?.data]);

  // Calculate if all files are settled
  const allFilesSettled = useMemo(() => {
    if (!kbResources?.data) return false;

    return kbResources.data.every((file) => file.status !== "pending" && file.status !== "pending_delete");
  }, [kbResources?.data]);

  // Count files by status
  const statusCounts = useMemo(() => {
    const counts = {
      indexed: 0,
      pending: 0,
      pending_delete: 0,
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
