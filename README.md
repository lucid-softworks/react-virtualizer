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
    overscanPixels: 500,
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

`overscanPixels` keeps a scroll-axis buffer mounted around the viewport. A
buffer of one or two viewport lengths helps native scrolling stay inside the
committed DOM range. If a high-velocity scroll still escapes that range, the
React adapter synchronously commits the new range to minimize how long the
browser is ahead of the rendered content.

Browser-native threaded scrolling can outrun any finite JavaScript-rendered
range for a frame. Products that must never expose an empty surface should
give the spacer a lightweight placeholder background or layer; real rows can
cover it once committed. The bundled demo shows this pattern.

For applications that prefer guaranteed wheel and trackpad rendering over
threaded scrolling, enable the opt-in synchronous path:

```tsx
useVirtualizer({
  count: rows.length,
  estimateSize: () => 48,
  synchronousWheelScrolling: true,
});
```

This renders the target range before updating `scrollTop`. It intentionally
moves wheel input onto the main thread, so it should be selected as a product
tradeoff rather than enabled by default. Touch, keyboard, and scrollbar input
remain browser-native.

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

Automatic `scrollToOffset` and `scrollToIndex` calls commit their target range
before moving the element, preventing blank frames during programmatic jumps.
Smooth scrolling remains browser-native because it traverses intermediate
offsets over time.
