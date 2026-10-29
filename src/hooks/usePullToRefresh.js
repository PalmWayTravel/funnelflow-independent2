import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 70;
const MAX_PULL = 110;

// Touch-only pull-to-refresh for a page whose scroll happens in an ancestor container.
// Attach the returned `ref` to the page root; `pull` drives the indicator height.
export default function usePullToRefresh(onRefresh) {
  const [node, setNode] = useState(null);
  const startY = useRef(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const update = useCallback((value) => {
    pullRef.current = value;
    setPull(value);
  }, []);

  useEffect(() => {
    if (!node) return undefined;
    const touchDevice = window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window;
    if (!touchDevice) return undefined;

    const scrollParent = () => {
      let parent = node.parentElement;
      while (parent) {
        const overflowY = window.getComputedStyle(parent).overflowY;
        if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) return parent;
        parent = parent.parentElement;
      }
      return null;
    };
    const atTop = () => {
      const parent = scrollParent();
      return parent ? parent.scrollTop <= 0 : window.scrollY <= 0;
    };

    const onTouchStart = (event) => {
      if (refreshingRef.current || !atTop()) {
        startY.current = null;
        return;
      }
      startY.current = event.touches[0].clientY;
    };

    const onTouchMove = (event) => {
      if (startY.current == null || refreshingRef.current) return;
      const delta = event.touches[0].clientY - startY.current;
      if (delta <= 0) {
        startY.current = null;
        update(0);
        return;
      }
      update(Math.min(delta * 0.5, MAX_PULL));
    };

    const onTouchEnd = async () => {
      if (startY.current == null) {
        update(0);
        return;
      }
      startY.current = null;
      if (pullRef.current < THRESHOLD) {
        update(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      update(THRESHOLD * 0.5);
      try {
        await onRefresh();
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
        update(0);
      }
    };

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: true });
    node.addEventListener("touchend", onTouchEnd);
    node.addEventListener("touchcancel", onTouchEnd);
    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [node, onRefresh, update]);

  return { ref: setNode, pull, refreshing, ready: pull >= THRESHOLD };
}