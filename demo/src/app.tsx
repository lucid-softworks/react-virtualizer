import { useVirtualizer } from "@lucid-softworks/react-virtualizer";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type UIEvent,
} from "react";

interface Activity {
  readonly detail: string;
  readonly id: number;
  readonly title: string;
}

const initialCount = 100_000;
const initialRows: readonly Activity[] = Array.from(
  { length: initialCount },
  (_, index) => ({
    detail:
      index % 11 === 0
        ? "This row has a second line, so ResizeObserver supplies its real height after rendering."
        : "Measured activity row",
    id: index,
    title: `Activity ${index.toLocaleString()}`,
  }),
);

function estimateRowSize(): number {
  return 58;
}

export function App(): ReactElement {
  const [rows, setRows] = useState(initialRows);
  const getItemKey = useCallback(
    (index: number): number => rows[index]!.id,
    [rows],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: estimateRowSize,
    getItemKey,
    initialRect: { height: 560 },
    overscan: 6,
    overscanPixels: 4_480,
    synchronousWheelScrolling: true,
  });
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [viewportSize, setViewportSize] = useState(560);
  const scrollbarReference = useRef<HTMLInputElement | null>(null);
  const scrollElementRef = virtualizer.scrollElementRef;
  const connectViewport = useCallback(
    (element: HTMLDivElement | null): void => {
      scrollElementRef(element);
      setViewportElement(element);
    },
    [scrollElementRef],
  );

  useEffect(() => {
    if (viewportElement === null) {
      return;
    }
    const updateSize = (): void => {
      setViewportSize((current) =>
        current === viewportElement.clientHeight
          ? current
          : viewportElement.clientHeight,
      );
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewportElement);
    return () => observer.disconnect();
  }, [viewportElement]);

  function handleViewportScroll(event: UIEvent<HTMLDivElement>): void {
    if (scrollbarReference.current !== null) {
      scrollbarReference.current.value = String(event.currentTarget.scrollTop);
    }
  }

  function handleScrollbarInput(event: FormEvent<HTMLInputElement>): void {
    virtualizer.scrollToOffset(Number(event.currentTarget.value));
  }

  function prepend(): void {
    setRows((current) => {
      const firstId = current[0]?.id ?? 0;
      const added = Array.from({ length: 100 }, (_, index) => ({
        detail: "Prepended without moving the visible keyed row",
        id: firstId - 100 + index,
        title: `New activity ${(index + 1).toLocaleString()}`,
      }));
      return [...added, ...current];
    });
  }

  const start = virtualizer.visibleRange?.startIndex;
  const end = virtualizer.visibleRange?.endIndex;

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Headless · measured · anchored</p>
          <h1>One hundred thousand rows. A handful of elements.</h1>
          <p className="intro">
            Scroll through dynamically measured activity, jump by index, then
            prepend data without losing your place.
          </p>
        </div>
        <dl className="metrics">
          <div>
            <dt>Rows</dt>
            <dd>{rows.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Rendered</dt>
            <dd>{virtualizer.items.length}</dd>
          </div>
          <div>
            <dt>Visible</dt>
            <dd>
              {start === undefined || end === undefined
                ? "—"
                : `${start.toLocaleString()}–${end.toLocaleString()}`}
            </dd>
          </div>
        </dl>
      </header>

      <section aria-label="Virtualized activity" className="demo">
        <nav aria-label="List controls" className="toolbar">
          <button
            type="button"
            onClick={() => virtualizer.scrollToIndex(0, { align: "start" })}
          >
            First
          </button>
          <button
            type="button"
            onClick={() =>
              virtualizer.scrollToIndex(Math.floor(rows.length / 2), {
                align: "center",
              })
            }
          >
            Middle
          </button>
          <button
            type="button"
            onClick={() =>
              virtualizer.scrollToIndex(rows.length - 1, { align: "end" })
            }
          >
            Last
          </button>
          <button className="primary" type="button" onClick={prepend}>
            Prepend 100
          </button>
        </nav>

        <div className="column-labels" aria-hidden="true">
          <span>Index</span>
          <span>Activity</span>
          <span>Measured size</span>
        </div>

        <div className="viewport-shell">
          <div
            id="activity-viewport"
            ref={connectViewport}
            className="viewport"
            onScroll={handleViewportScroll}
          >
            <div className="spacer" style={{ height: virtualizer.totalSize }}>
              {virtualizer.items.map((item) => {
                const row = rows[item.index]!;
                return (
                  <article
                    data-index={item.index}
                    key={item.key}
                    ref={virtualizer.measureElement}
                    className="row"
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    <span className="index">{item.index.toLocaleString()}</span>
                    <span>
                      <strong>{row.title}</strong>
                      <small>{row.detail}</small>
                    </span>
                    <code>{Math.round(item.size)}px</code>
                  </article>
                );
              })}
            </div>
          </div>
          <input
            aria-controls="activity-viewport"
            aria-label="Activity scroll position"
            ref={scrollbarReference}
            className="scrollbar"
            defaultValue="0"
            max={Math.max(0, virtualizer.totalSize - viewportSize)}
            min="0"
            onInput={handleScrollbarInput}
            step="1"
            type="range"
          />
        </div>
      </section>
    </main>
  );
}
