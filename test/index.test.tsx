import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVirtualizer, type UseVirtualizerOptions } from "../src/index.js";

const flushSyncMock = vi.hoisted(() =>
  vi.fn<(callback: () => void) => void>((callback) => callback()),
);

vi.mock("react-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-dom")>();
  return { ...original, flushSync: flushSyncMock };
});

class ResizeObserverMock implements ResizeObserver {
  static readonly instances: ResizeObserverMock[] = [];
  readonly #callback: ResizeObserverCallback;
  readonly disconnect = vi.fn<ResizeObserver["disconnect"]>();
  readonly observe = vi.fn<ResizeObserver["observe"]>();
  readonly unobserve = vi.fn<ResizeObserver["unobserve"]>();

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  trigger(...elements: Element[]): void {
    this.#callback(
      elements.map(
        (target) =>
          ({
            target,
          }) as ResizeObserverEntry,
      ),
      this,
    );
  }
}

function createElement(height: number, index?: number): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: height,
  });
  element.getBoundingClientRect = () =>
    ({
      bottom: height,
      height,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }) as DOMRect;
  if (index !== undefined) {
    element.dataset["index"] = String(index);
  }
  return element;
}

function observerFor(element: Element): ResizeObserverMock {
  return ResizeObserverMock.instances.find((observer) =>
    observer.observe.mock.calls.some(([target]) => target === element),
  )!;
}

const baseOptions: UseVirtualizerOptions = {
  count: 100,
  estimateSize: fixedSize,
  initialRect: { height: 100 },
  overscan: 0,
};

function fixedSize(): number {
  return 20;
}

describe("useVirtualizer", () => {
  beforeEach(() => {
    ResizeObserverMock.instances.length = 0;
    flushSyncMock.mockClear();
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("observes scrolling and exposes virtual items", () => {
    const { result } = renderHook(() => useVirtualizer(baseOptions));
    const scrollElement = createElement(100);
    act(() => result.current.scrollElementRef(scrollElement));

    expect(result.current.items.map((item) => item.index)).toEqual([
      0, 1, 2, 3, 4,
    ]);

    act(() => {
      scrollElement.scrollTop = 200;
      scrollElement.dispatchEvent(new Event("scroll"));
    });

    expect(flushSyncMock).toHaveBeenCalledOnce();
    expect(result.current.visibleRange).toEqual({
      endIndex: 14,
      startIndex: 10,
    });
    expect(result.current.totalSize).toBe(2000);
  });

  it("does not force a commit while scrolling inside rendered overscan", () => {
    const { result } = renderHook(() =>
      useVirtualizer({
        ...baseOptions,
        overscanPixels: 100,
      }),
    );
    const scrollElement = createElement(100);
    act(() => result.current.scrollElementRef(scrollElement));

    act(() => {
      scrollElement.scrollTop = 40;
      scrollElement.dispatchEvent(new Event("scroll"));
    });

    expect(flushSyncMock).not.toHaveBeenCalled();
    expect(result.current.visibleRange?.startIndex).toBe(2);
  });

  it("forces a new range when fast scrolling escapes in either direction", () => {
    const { result } = renderHook(() => useVirtualizer(baseOptions));
    const scrollElement = createElement(100);
    act(() => result.current.scrollElementRef(scrollElement));

    act(() => {
      scrollElement.scrollTop = 1_000;
      scrollElement.dispatchEvent(new Event("scroll"));
    });
    act(() => {
      scrollElement.scrollTop = 0;
      scrollElement.dispatchEvent(new Event("scroll"));
    });

    expect(flushSyncMock).toHaveBeenCalledTimes(2);
    expect(result.current.visibleRange?.startIndex).toBe(0);
  });

  it("applies its initial offset when the container attaches", () => {
    const { result } = renderHook(() =>
      useVirtualizer({
        ...baseOptions,
        initialOffset: 240,
      }),
    );
    const scrollElement = createElement(100);
    act(() => result.current.scrollElementRef(scrollElement));

    expect(scrollElement.scrollTop).toBe(240);
    expect(result.current.visibleRange).toEqual({
      endIndex: 16,
      startIndex: 12,
    });
  });

  it("measures items and reacts to later resizes", () => {
    const { result } = renderHook(() => useVirtualizer(baseOptions));
    const scrollElement = createElement(100);
    const item = createElement(30, 0);
    act(() => {
      result.current.scrollElementRef(scrollElement);
      result.current.measureElement(item);
    });

    expect(result.current.items[0]).toMatchObject({ index: 0, size: 30 });
    expect(result.current.totalSize).toBe(2010);

    item.getBoundingClientRect = () => ({ height: 45 }) as DOMRect;
    act(() => observerFor(item).trigger(item));

    expect(result.current.items[0]).toMatchObject({ size: 45 });
    expect(result.current.totalSize).toBe(2025);
  });

  it("stops observing replaced and detached item elements", () => {
    const { result, rerender } = renderHook(() => useVirtualizer(baseOptions));
    const firstItem = createElement(30, 0);
    const replacementItem = createElement(30, 0);
    document.body.append(firstItem);

    act(() => result.current.measureElement(firstItem));
    const observer = observerFor(firstItem);
    document.body.append(replacementItem);
    act(() => result.current.measureElement(replacementItem));

    expect(observer.unobserve).toHaveBeenCalledWith(firstItem);

    firstItem.remove();
    replacementItem.remove();
    rerender();
    expect(observer.unobserve).toHaveBeenCalledWith(replacementItem);
  });

  it("applies corrections from an observer created before container attachment", () => {
    const { result } = renderHook(() =>
      useVirtualizer({
        ...baseOptions,
        initialRect: { height: 40 },
      }),
    );
    const item = createElement(20, 0);
    act(() => result.current.measureElement(item));

    const scrollElement = createElement(40);
    act(() => result.current.scrollElementRef(scrollElement));
    act(() => {
      scrollElement.scrollTop = 40;
      scrollElement.dispatchEvent(new Event("scroll"));
    });

    item.getBoundingClientRect = () => ({ height: 30 }) as DOMRect;
    act(() => observerFor(item).trigger(item));

    expect(scrollElement.scrollTop).toBe(50);
    expect(result.current.visibleRange?.startIndex).toBe(2);
  });

  it("applies measurement and prepend scroll corrections", () => {
    let keys = ["a", "b", "c", "d", "e", "f"];
    const getItemKey = (index: number): string => keys[index]!;
    const { result, rerender } = renderHook(() =>
      useVirtualizer({
        count: keys.length,
        estimateSize: fixedSize,
        getItemKey,
        initialRect: { height: 40 },
        overscan: 0,
      }),
    );
    const scrollElement = createElement(40);
    scrollElement.scrollTop = 40;
    act(() => result.current.scrollElementRef(scrollElement));

    const first = createElement(35, 0);
    act(() => result.current.measureElement(first));
    expect(scrollElement.scrollTop).toBe(55);

    keys = ["x", "y", ...keys];
    rerender();
    expect(scrollElement.scrollTop).toBe(95);
    expect(result.current.items[0]?.key).toBe("c");
  });

  it("can change data without preserving its anchor", () => {
    let count = 10;
    const { result, rerender } = renderHook(() =>
      useVirtualizer({
        count,
        estimateSize: fixedSize,
        initialRect: { height: 40 },
        preserveAnchorOnChange: false,
      }),
    );
    const scrollElement = createElement(40);
    scrollElement.scrollTop = 40;
    act(() => result.current.scrollElementRef(scrollElement));

    count = 12;
    rerender();

    expect(scrollElement.scrollTop).toBe(40);
  });

  it("scrolls to offsets and indexes", () => {
    const { result } = renderHook(() => useVirtualizer(baseOptions));
    const scrollElement = createElement(100);
    const scrollTo = vi.fn<(options?: ScrollToOptions) => void>((options) => {
      if (typeof options === "object") {
        scrollElement.scrollTop = Number(options.top);
      }
    });
    scrollElement.scrollTo = scrollTo as HTMLElement["scrollTo"];
    act(() => result.current.scrollElementRef(scrollElement));

    act(() => result.current.scrollToOffset(250));
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: "auto",
      top: 250,
    });
    expect(result.current.visibleRange?.startIndex).toBe(12);

    act(() =>
      result.current.scrollToIndex(20, {
        align: "center",
        behavior: "smooth",
      }),
    );
    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: "smooth",
      top: 360,
    });
  });

  it("falls back to scrollTop when scrollTo is unavailable", () => {
    const { result } = renderHook(() => useVirtualizer(baseOptions));
    const scrollElement = createElement(100);
    Object.defineProperty(scrollElement, "scrollTo", {
      configurable: true,
      value: undefined,
    });
    act(() => result.current.scrollElementRef(scrollElement));
    act(() => result.current.scrollToOffset(80));
    expect(scrollElement.scrollTop).toBe(80);
  });

  it("resets measurements", () => {
    const { result } = renderHook(() => useVirtualizer(baseOptions));
    const scrollElement = createElement(100);
    const item = createElement(50, 0);
    act(() => {
      result.current.scrollElementRef(scrollElement);
      result.current.measureElement(item);
    });
    expect(result.current.totalSize).toBe(2030);

    act(() => result.current.resetMeasurements());
    expect(result.current.totalSize).toBe(2000);
  });

  it("handles detached elements and unavailable observers", () => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "ResizeObserver");
    const { result, unmount } = renderHook(() =>
      useVirtualizer({
        count: 1,
        estimateSize: fixedSize,
      }),
    );
    const scrollElement = createElement(20);
    const item = createElement(20, 0);
    const staleItem = createElement(30, 1);
    act(() => {
      result.current.scrollElementRef(null);
      result.current.measureElement(null);
      result.current.measureElement(item);
      result.current.measureElement(staleItem);
      result.current.scrollToOffset(10);
      result.current.scrollElementRef(scrollElement);
    });
    expect(result.current.items).toHaveLength(1);
    unmount();
  });

  it("updates the viewport when its container resizes", () => {
    const { result } = renderHook(() => useVirtualizer(baseOptions));
    const scrollElement = createElement(100);
    act(() => result.current.scrollElementRef(scrollElement));

    Object.defineProperty(scrollElement, "clientHeight", {
      configurable: true,
      value: 40,
    });
    act(() => observerFor(scrollElement).trigger(scrollElement));

    expect(result.current.visibleRange).toEqual({
      endIndex: 1,
      startIndex: 0,
    });

    act(() => {
      result.current.scrollElementRef(null);
      observerFor(scrollElement).trigger(scrollElement);
    });
  });

  it("rejects measured elements without a valid data index", () => {
    const { result } = renderHook(() => useVirtualizer(baseOptions));

    expect(() => result.current.measureElement(createElement(20))).toThrow(
      "need a non-negative integer data-index",
    );
    expect(() => result.current.measureElement(createElement(20, -1))).toThrow(
      "need a non-negative integer data-index",
    );
    const fractional = createElement(20);
    fractional.dataset["index"] = "1.5";
    expect(() => result.current.measureElement(fractional)).toThrow(
      "need a non-negative integer data-index",
    );
  });

  it("ignores stale resize entries after the collection shrinks", () => {
    let count = 2;
    const { result, rerender } = renderHook(() =>
      useVirtualizer({
        count,
        estimateSize: fixedSize,
        initialRect: { height: 40 },
      }),
    );
    const staleItem = createElement(30, 1);
    act(() => result.current.measureElement(staleItem));

    count = 1;
    rerender();
    act(() => observerFor(staleItem).trigger(staleItem));

    expect(result.current.totalSize).toBe(20);
  });

  it("uses automatic behavior when scrolling to an index by default", () => {
    const { result } = renderHook(() => useVirtualizer(baseOptions));
    const scrollElement = createElement(100);
    const scrollTo = vi.fn<(options?: ScrollToOptions) => void>();
    scrollElement.scrollTo = scrollTo as HTMLElement["scrollTo"];
    act(() => result.current.scrollElementRef(scrollElement));
    act(() => result.current.scrollToIndex(10));

    expect(scrollTo).toHaveBeenCalledWith({
      behavior: "auto",
      top: 120,
    });
  });
});
