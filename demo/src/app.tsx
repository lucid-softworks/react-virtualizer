import { useVirtualizer } from "@lucid-softworks/react-virtualizer";
import { useCallback, useState, type ReactElement } from "react";

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
    overscanPixels: 1_120,
  });

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

        <div ref={virtualizer.scrollElementRef} className="viewport">
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
      </section>
    </main>
  );
}
