import { useState, useRef, useCallback, useEffect } from "react";
import { C, btn } from "./constants";

/**
 * iOS-safe drag-to-reorder list.
 * Uses raw touch events + a floating ghost clone — works on iOS Safari.
 * onReorder(newOrderedArray) is called when user lifts finger.
 */
export default function DragList({ items, onReorder, renderItem }) {
  const [order, setOrder]       = useState(items.map((_, i) => i));
  const [dragging, setDragging] = useState(null);   // index being dragged
  const [over, setOver]         = useState(null);    // index being hovered
  const [saving, setSaving]     = useState(false);

  const listRef   = useRef(null);
  const ghostRef  = useRef(null);
  const dragState = useRef({});   // mutable drag state (avoids stale closures)

  // Sync order when items prop changes
  useEffect(() => {
    setOrder(items.map((_, i) => i));
  }, [items.length]);

  // ── Ghost element (floating clone under finger) ──────────────────────────
  function createGhost(el, clientX, clientY) {
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      opacity: 0.85;
      pointer-events: none;
      z-index: 9999;
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,.18);
      background: #fff;
      transform: scale(1.02);
      transition: none;
    `;
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
    dragState.current.offsetY = clientY - rect.top;
    dragState.current.offsetX = clientX - rect.left;
    dragState.current.ghostWidth = rect.width;
    dragState.current.ghostLeft = rect.left;
  }

  function moveGhost(clientY) {
    if (!ghostRef.current) return;
    const y = clientY - dragState.current.offsetY;
    ghostRef.current.style.top = `${y}px`;
  }

  function removeGhost() {
    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current);
      ghostRef.current = null;
    }
  }

  // ── Find which item index is under a Y coordinate ────────────────────────
  function getIndexAtY(clientY) {
    if (!listRef.current) return null;
    const children = Array.from(listRef.current.children);
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return i;
    }
    // Above first
    if (clientY < children[0]?.getBoundingClientRect().top) return 0;
    // Below last
    return children.length - 1;
  }

  // ── Apply reorder ─────────────────────────────────────────────────────────
  async function applyReorder(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    const newOrder = [...order];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    setOrder(newOrder);
    setSaving(true);
    const reordered = newOrder.map(i => items[i]);
    await onReorder(reordered);
    setSaving(false);
  }

  // ── Touch handlers ────────────────────────────────────────────────────────
  function onTouchStart(e, visualIdx) {
    // Only trigger from the handle
    const touch = e.touches[0];
    dragState.current = { fromIdx: visualIdx, lastY: touch.clientY };
    setDragging(visualIdx);
    setOver(visualIdx);

    const el = listRef.current?.children[visualIdx];
    if (el) createGhost(el, touch.clientX, touch.clientY);

    // Prevent page scroll while dragging
    document.body.style.overflow = "hidden";
  }

  function onTouchMove(e) {
    if (dragging === null) return;
    e.preventDefault(); // Critical — stops iOS scroll interference
    const touch = e.touches[0];
    moveGhost(touch.clientY);
    const idx = getIndexAtY(touch.clientY);
    if (idx !== null && idx !== over) setOver(idx);
    dragState.current.lastY = touch.clientY;
  }

  function onTouchEnd() {
    if (dragging === null) return;
    document.body.style.overflow = "";
    removeGhost();
    const toIdx = over ?? dragging;
    applyReorder(dragging, toIdx);
    setDragging(null);
    setOver(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const visualItems = order.map(i => items[i]);

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1 }}>
          Pendientes esta semana ({items.length})
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {saving && <div style={{ fontSize:11, color:C.primary, fontWeight:600 }}>Guardando...</div>}
          <div style={{ fontSize:11, color:C.subtle }}>
            Arrastra <span style={{ fontSize:13 }}>⠿</span> para ordenar
          </div>
        </div>
      </div>

      {/* List */}
      <div
        ref={listRef}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction:"none" }}
      >
        {visualItems.map((item, visualIdx) => {
          const isDragging = dragging === visualIdx;
          const isOver     = over === visualIdx && dragging !== null && dragging !== visualIdx;

          return (
            <div
              key={item.id}
              style={{
                background: isOver ? "#EFF6FF" : "#fff",
                borderRadius: 13,
                padding: "11px 12px",
                marginBottom: 7,
                border: `1.5px solid ${isOver ? C.primary : isDragging ? "#CBD5E1" : "#E4E9F0"}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: isDragging ? "none" : "0 1px 2px rgba(0,0,0,.05)",
                opacity: isDragging ? 0.3 : 1,
                transition: "opacity .15s, border-color .15s, background .15s",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}>

              {/* Drag handle — touch starts here */}
              <div
                onTouchStart={e => onTouchStart(e, visualIdx)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "6px 8px",
                  cursor: "grab",
                  flexShrink: 0,
                  touchAction: "none",
                }}>
                {[0,1,2].map(l => (
                  <div key={l} style={{ display:"flex", gap:3 }}>
                    <div style={{ width:4, height:4, borderRadius:"50%", background:"#9CA3AF" }}/>
                    <div style={{ width:4, height:4, borderRadius:"50%", background:"#9CA3AF" }}/>
                  </div>
                ))}
              </div>

              {/* Order badge */}
              <div style={{
                width:24, height:24, borderRadius:"50%",
                background: C.primaryLight, color: C.primary,
                fontSize:11, fontWeight:700,
                display:"flex", alignItems:"center", justifyContent:"center",
                flexShrink:0
              }}>
                {visualIdx + 1}
              </div>

              {/* Content */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, color:"#0F172A", fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {item.place}
                </div>
                <div style={{ fontSize:11, color:"#6B7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {item.address}
                </div>
              </div>

              {/* Action button */}
              {renderItem && renderItem(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
