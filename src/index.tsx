import {
  createVirtualizer,
  type ScrollAlignment,
  type VirtualItem,
  type VirtualItemKey,
  type VirtualRange,
  type Virtualizer,
  type VirtualizerOptions,
} from "@lucid-softworks/virtualizer";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefCallback,
} from "react";
import { flushSync } from "react-dom";

export interface InitialRect {
  readonly height: number;
}

export interface UseVirtualizerOptions<
  TKey extends VirtualItemKey = number,
> extends Omit<
  VirtualizerOptions<TKey>,
  "initialOffset" | "initialViewportSize"
> {
  readonly initialOffset?: number;
  readonly initialRect?: InitialRect;
  /**
   * Keep the first visible keyed item anchored when options change.
   * Defaults to true.
   */
  readonly preserveAnchorOnChange?: boolean;
  /**
   * Render wheel and trackpad destinations before updating the element scroll
   * position. Prevents compositor checkerboarding at the cost of moving wheel
   * scrolling onto the main thread. Defaults to false.
   */
  readonly synchronousWheelScrolling?: boolean;
}

export interface ReactScrollToOptions {
  readonly behavior?: ScrollBehavior;
}

export interface ReactScrollToIndexOptions extends ReactScrollToOptions {
  readonly align?: ScrollAlignment;
}

export interface ReactVirtualizer<TKey extends VirtualItemKey = number> {
  readonly items: readonly VirtualItem<TKey>[];
  readonly measureElement: RefCallback<HTMLElement>;
  readonly resetMeasurements: () => void;
  readonly scrollElementRef: RefCallback<HTMLElement>;
  readonly scrollToIndex: (
    index: number,
    options?: ReactScrollToIndexOptions,
  ) => void;
  readonly scrollToOffset: (
    offset: number,
    options?: ReactScrollToOptions,
  ) => void;
  readonly totalSize: number;
  readonly visibleRange: VirtualRange | undefined;
}

interface RenderedBounds {
  readonly end: number;
  readonly start: number;
}

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function elementHeight(element: Element): number {
  return element.getBoundingClientRect().height;
}

function readIndex(element: HTMLElement): number {
  const value = element.dataset["index"];
  const index = Number(value);
  if (value === undefined || !Number.isSafeInteger(index) || index < 0) {
    throw new TypeError(
      "Measured virtual items need a non-negative integer data-index.",
    );
  }
  return index;
}

function setElementScroll(
  element: HTMLElement,
  offset: number,
  behavior: ScrollBehavior,
): void {
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ behavior, top: offset });
  } else {
    element.scrollTop = offset;
  }
}

/**
 * Connects the framework-neutral virtualizer to an element scroll container.
 */
export function useVirtualizer<TKey extends VirtualItemKey = number>(
  options: UseVirtualizerOptions<TKey>,
): ReactVirtualizer<TKey> {
  const instanceReference = useRef<Virtualizer<TKey> | null>(null);
  if (instanceReference.current === null) {
    instanceReference.current = createVirtualizer({
      ...options,
      initialViewportSize: options.initialRect?.height ?? 0,
    });
  }
  const instance = instanceReference.current;
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const scrollElementReference = useRef<HTMLElement | null>(null);
  const itemResizeObserverReference = useRef<ResizeObserver | null>(null);
  const observedItemsReference = useRef(new Map<number, HTMLElement>());
  const preparingScrollReference = useRef(false);
  const renderedBoundsReference = useRef<RenderedBounds | undefined>(undefined);

  const snapshot = useSyncExternalStore(
    instance.subscribe,
    instance.getSnapshot,
    instance.getSnapshot,
  );

  const renderScrollTarget = useCallback(
    (
      element: HTMLElement,
      target: number,
      updateScrollPosition: boolean,
    ): void => {
      preparingScrollReference.current = true;
      try {
        flushSync(() => instance.setViewport(target, element.clientHeight));
      } finally {
        preparingScrollReference.current = false;
      }
      if (updateScrollPosition) {
        setElementScroll(element, instance.scrollOffset, "auto");
      }
    },
    [instance],
  );

  const applyAdjustment = useCallback(
    (adjustment: number): void => {
      if (adjustment === 0 || preparingScrollReference.current) {
        return;
      }
      const element = scrollElementReference.current;
      if (element === null) {
        return;
      }
      element.scrollTop += adjustment;
      instance.setViewport(element.scrollTop, element.clientHeight);
    },
    [instance],
  );

  const measureEntries = useCallback(
    (entries: readonly ResizeObserverEntry[]): void => {
      const measurements = entries.flatMap((entry) => {
        const element = entry.target as HTMLElement;
        const index = readIndex(element);
        return index < instance.count
          ? [{ index, size: elementHeight(element) }]
          : [];
      });
      applyAdjustment(instance.measureMany(measurements));
    },
    [applyAdjustment, instance],
  );

  const measureElement = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      if (element === null) {
        return;
      }
      const index = readIndex(element);
      if (index >= instance.count) {
        return;
      }
      applyAdjustment(instance.measure(index, elementHeight(element)));

      if (typeof ResizeObserver !== "undefined") {
        itemResizeObserverReference.current ??= new ResizeObserver(
          measureEntries,
        );
        const previousElement = observedItemsReference.current.get(index);
        if (previousElement !== undefined && previousElement !== element) {
          itemResizeObserverReference.current.unobserve(previousElement);
        }
        observedItemsReference.current.set(index, element);
        itemResizeObserverReference.current.observe(element);
      }
    },
    [applyAdjustment, instance, measureEntries],
  );

  const scrollElementRef = useCallback<RefCallback<HTMLElement>>((element) => {
    setScrollElement(element);
  }, []);

  useBrowserLayoutEffect(() => {
    const adjustment = instance.setOptions(options, {
      preserveAnchor: options.preserveAnchorOnChange !== false,
    });
    applyAdjustment(adjustment);
  }, [
    applyAdjustment,
    instance,
    options.count,
    options.estimateSize,
    options.getItemKey,
    options.overscan,
    options.overscanPixels,
    options.paddingEnd,
    options.paddingStart,
    options.preserveAnchorOnChange,
  ]);

  useBrowserLayoutEffect(() => {
    const firstItem = snapshot.items[0];
    const lastItem = snapshot.items.at(-1);
    renderedBoundsReference.current =
      firstItem === undefined || lastItem === undefined
        ? undefined
        : { end: lastItem.end, start: firstItem.start };
  }, [snapshot.items]);

  useBrowserLayoutEffect(() => {
    scrollElementReference.current = scrollElement;
    if (scrollElement === null) {
      return;
    }

    if (scrollElement.scrollTop === 0 && instance.scrollOffset !== 0) {
      scrollElement.scrollTop = instance.scrollOffset;
    }
    instance.setViewport(scrollElement.scrollTop, scrollElement.clientHeight);
    const onScroll = (): void => {
      const offset = scrollElement.scrollTop;
      const viewportSize = scrollElement.clientHeight;
      const renderedBounds = renderedBoundsReference.current;
      const escapedRenderedBounds =
        renderedBounds === undefined ||
        offset < renderedBounds.start ||
        offset + viewportSize > renderedBounds.end;

      if (escapedRenderedBounds) {
        flushSync(() => instance.setViewport(offset, viewportSize));
      } else {
        instance.setViewport(offset, viewportSize);
      }
    };
    const onWheel = (event: WheelEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.deltaY === 0) {
        return;
      }
      const delta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * scrollElement.clientHeight
            : event.deltaY;
      const target = instance.clampOffset(
        Math.max(0, scrollElement.scrollTop + delta),
      );
      if (target === scrollElement.scrollTop) {
        return;
      }

      const controlsScrollPosition = event.cancelable;
      if (controlsScrollPosition) {
        event.preventDefault();
      }
      renderScrollTarget(scrollElement, target, controlsScrollPosition);
    };
    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    if (options.synchronousWheelScrolling === true) {
      scrollElement.addEventListener("wheel", onWheel, { passive: false });
    }
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(onScroll);
    observer?.observe(scrollElement);

    return () => {
      scrollElement.removeEventListener("scroll", onScroll);
      scrollElement.removeEventListener("wheel", onWheel);
      observer?.disconnect();
      scrollElementReference.current = null;
    };
  }, [
    instance,
    options.synchronousWheelScrolling,
    renderScrollTarget,
    scrollElement,
  ]);

  useBrowserLayoutEffect(() => {
    const observer = itemResizeObserverReference.current;
    if (observer === null) {
      return;
    }
    for (const [index, element] of observedItemsReference.current) {
      if (!element.isConnected) {
        observer.unobserve(element);
        observedItemsReference.current.delete(index);
      }
    }
  });

  useBrowserLayoutEffect(
    () => () => {
      itemResizeObserverReference.current?.disconnect();
      observedItemsReference.current.clear();
    },
    [],
  );

  const scrollToOffset = useCallback(
    (offset: number, scrollOptions: ReactScrollToOptions = {}): void => {
      if (scrollElement === null) {
        return;
      }
      const target = instance.clampOffset(offset);
      const behavior = scrollOptions.behavior ?? "auto";
      if (behavior === "auto") {
        renderScrollTarget(scrollElement, target, true);
      } else {
        setElementScroll(scrollElement, target, behavior);
      }
    },
    [instance, renderScrollTarget, scrollElement],
  );

  const scrollToIndex = useCallback(
    (index: number, scrollOptions: ReactScrollToIndexOptions = {}): void => {
      scrollToOffset(
        instance.getOffsetForIndex(index, scrollOptions),
        scrollOptions.behavior === undefined
          ? {}
          : { behavior: scrollOptions.behavior },
      );
    },
    [instance, scrollToOffset],
  );

  const resetMeasurements = useCallback((): void => {
    applyAdjustment(instance.resetMeasurements());
  }, [applyAdjustment, instance]);

  return {
    items: snapshot.items,
    measureElement,
    resetMeasurements,
    scrollElementRef,
    scrollToIndex,
    scrollToOffset,
    totalSize: snapshot.totalSize,
    visibleRange: snapshot.visibleRange,
  };
}

export type {
  ScrollAlignment,
  VirtualItem,
  VirtualItemKey,
  VirtualRange,
} from "@lucid-softworks/virtualizer";
