# `@lucid-softworks/react-virtualizer`

React bindings for headless list virtualization.

## Usage

```tsx
import { useVirtualizer } from "@lucid-softworks/react-virtualizer";

export function ActivityList({ rows }: { rows: readonly Activity[] }) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 48,
    getItemKey: (index) => rows[index]!.id,
    overscan: 5,
  });

  return (
    <div
      ref={virtualizer.scrollElementRef}
      style={{ height: 500, overflow: "auto" }}
    >
      <div
        style={{
          height: virtualizer.totalSize,
          position: "relative",
        }}
      >
        {virtualizer.items.map((item) => (
          <div
            data-index={item.index}
            key={item.key}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              transform: `translateY(${item.start}px)`,
              width: "100%",
            }}
          >
            {rows[item.index]!.title}
          </div>
        ))}
      </div>
    </div>
  );
}
```

The scroll container is observed for scrolling and resizing. Measured items use
`ResizeObserver`, so dynamic content can change height without invalidating the
rest of the list. A stable `getItemKey` allows measurements and the visible
anchor to survive prepends or reordering.

`initialRect` supplies an initial viewport height for server rendering:

```tsx
useVirtualizer({
  count: rows.length,
  estimateSize: () => 48,
  initialRect: { height: 500 },
});
```

## Scrolling

Scroll by item or pixel offset:

```ts
virtualizer.scrollToIndex(10_000, { align: "center" });
virtualizer.scrollToOffset(0, { behavior: "smooth" });
```

Item alignment can be `start`, `center`, `end`, or `auto`.
