import { useState, useRef, useEffect } from "react";

/**
 * SortableList — iOS Safari compatible drag-to-reorder.
 *
 * Strategy: pure touch events. No HTML5 drag API (broken on iOS).
 * A floating clone follows the finger. Items shift to make room.
 * onOrderChange(newItems) fires on drop.
 */
export default function SortableList({ items, onOrderChange, renderItem, keyExtractor }) {
  const [localItems, setLocalItems] = useState(items);
  const [draggingId, setDraggingId] = useState(null);
  const [overIndex,  setOverIndex]  = useState(null);

  // Sync when parent changes
  useEffect(() => { setLocalItems(items); }, [items.length]);

  const containerRef = useRef(null);
  const cloneRef     = useRef(null);
  const stateRef     = useRef({ fromIndex:-1, startY:0, startScrollY:0 });

  function getItemRects() {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.children).map(el => el.getBoundingClientRect());
  }

  function getIndexAtY(y) {
    const rects = getItemRects();
    for (let i = 0; i < rects.length; i++) {
      const mid = rects[i].top + rects[i].height / 2;
      if (y < mid) return i;
    }
    return rects.length - 1;
  }

  function onHandleTouchStart(e, itemId) {
    const touch    = e.touches[0];
    const idx      = localItems.findIndex(it => keyExtractor(it) === itemId);
    const el       = containerRef.current?.children[idx];
    if (!el) return;

    e.stopPropagation();

    const rect = el.getBoundingClientRect();

    // Create floating clone
    const clone = el.cloneNode(true);
    clone.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top:  ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      z-index: 9999;
      pointer-events: none;
      opacity: 0.9;
      border-radius: 13px;
      box-shadow: 0 12px 40px rgba(0,0,0,.2);
      background: #fff;
      transform: scale(1.02);
      transition: transform .1s;
    `;
    document.body.appendChild(clone);
    cloneRef.current = clone;

    stateRef.current = {
      fromIndex:   idx,
      offsetY:     touch.clientY - rect.top,
      startY:      touch.clientY,
    };

    setDraggingId(itemId);
    setOverIndex(idx);

    // Prevent page scroll
    document.body.style.overflowY = "hidden";
    document.documentElement.style.overflowY = "hidden";
  }

  function onContainerTouchMove(e) {
    if (!cloneRef.current || draggingId === null) return;
    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    const newTop = touch.clientY - stateRef.current.offsetY;
    cloneRef.current.style.top = `${newTop}px`;

    const newOver = getIndexAtY(touch.clientY);
    if (newOver !== overIndex) setOverIndex(newOver);
  }

  function onContainerTouchEnd() {
    if (!cloneRef.current || draggingId === null) return;

    // Remove clone
    document.body.removeChild(cloneRef.current);
    cloneRef.current = null;

    // Restore scroll
    document.body.style.overflowY = "";
    document.documentElement.style.overflowY = "";

    // Reorder
    const from = stateRef.current.fromIndex;
    const to   = overIndex ?? from;

    if (from !== to) {
      const next = [...localItems];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setLocalItems(next);
      onOrderChange(next);
    }

    setDraggingId(null);
    setOverIndex(null);
  }

  return (
    <div
      ref={containerRef}
      onTouchMove={onContainerTouchMove}
      onTouchEnd={onContainerTouchEnd}
      style={{ touchAction:"none", userSelect:"none", WebkitUserSelect:"none" }}
    >
      {localItems.map((item, idx) => {
        const id        = keyExtractor(item);
        const isDragging = draggingId === id;
        const isOver    = overIndex === idx && draggingId !== null && draggingId !== id;

        return (
          <div
            key={id}
            style={{
              opacity:    isDragging ? 0.25 : 1,
              background: isOver ? "#EFF6FF" : "#fff",
              border:     `1.5px solid ${isOver ? "#1D4ED8" : "#E4E9F0"}`,
              borderRadius: 13,
              padding: "11px 12px",
              marginBottom: 7,
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: isDragging ? "none" : "0 1px 2px rgba(0,0,0,.04)",
              transition: "opacity .15s, background .15s, border-color .15s",
            }}
          >
            {/* Drag handle — 6-dot grid */}
            <div
              onTouchStart={e => onHandleTouchStart(e, id)}
              style={{
                display:"flex", flexDirection:"column", gap:3,
                padding:"6px 8px", cursor:"grab", flexShrink:0,
                touchAction:"none",
              }}
            >
              {[0,1,2].map(row => (
                <div key={row} style={{ display:"flex", gap:3 }}>
                  <div style={{ width:4, height:4, borderRadius:"50%", background:"#9CA3AF" }}/>
                  <div style={{ width:4, height:4, borderRadius:"50%", background:"#9CA3AF" }}/>
                </div>
              ))}
            </div>

            {/* Order number */}
            <div style={{ width:24, height:24, borderRadius:"50%", background:"#EFF6FF", color:"#1D4ED8", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {idx + 1}
            </div>

            {/* Content */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, color:"#0F172A", fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {item.place}
              </div>
              <div style={{ fontSize:11, color:"#6B7280", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {item.address}
              </div>
            </div>

            {/* Action slot */}
            {renderItem(item)}
          </div>
        );
      })}
    </div>
  );
}
