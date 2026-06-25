import React from "react";
import type { PaginatedResponse } from "../types/trading";

const PAGE_SIZE = 5;

interface PaginatedHistoryState<T> {
  items: T[];
  hasMore: boolean;
  isLoading: boolean;
  loadMore: () => void;
}

export function usePaginatedHistory<T>(endpoint: string, resetKey?: string): PaginatedHistoryState<T> {
  const [items, setItems] = React.useState<T[]>([]);
  const [offset, setOffset] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);
  const requestIdRef = React.useRef(0);

  const loadPage = React.useCallback(async (pageOffset: number, mode: "replace" | "append") => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageOffset)
      });
      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) throw new Error(`History request failed: ${response.status}`);

      const payload = await response.json() as PaginatedResponse<T>;
      if (requestId !== requestIdRef.current) return;

      setItems((current) => mode === "replace" ? payload.items : [...current, ...payload.items]);
      setOffset(payload.nextOffset);
      setHasMore(payload.hasMore);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [endpoint]);

  React.useEffect(() => {
    setItems([]);
    setOffset(0);
    setHasMore(true);
    void loadPage(0, "replace");
  }, [loadPage, resetKey]);

  const loadMore = React.useCallback(() => {
    if (isLoading || !hasMore) return;
    void loadPage(offset, "append");
  }, [hasMore, isLoading, loadPage, offset]);

  return { items, hasMore, isLoading, loadMore };
}
