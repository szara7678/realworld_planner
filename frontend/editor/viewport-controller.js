(function () {
  function createViewportController({ state, el, applyView, clamp }) {
    function bindViewport() {
      let dragState = null;
      const activePointers = new Map();
      let pinchState = null;

      const localPoint = (event) => {
        const rect = el.viewport.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      };

      const pointerPair = () => {
        const pointers = Array.from(activePointers.values());
        return pointers.length >= 2 ? [pointers[0], pointers[1]] : null;
      };

      const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const centerBetween = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

      el.viewport.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".node") || event.target.closest(".chat-shell")) return;
        const point = localPoint(event);
        activePointers.set(event.pointerId, point);
        if (event.pointerType === "touch") event.preventDefault();

        if (activePointers.size >= 2) {
          const pair = pointerPair();
          if (!pair) return;
          const [p1, p2] = pair;
          pinchState = {
            startDistance: Math.max(distanceBetween(p1, p2), 10),
            startCenter: centerBetween(p1, p2),
            startView: { ...state.view },
          };
          dragState = null;
          el.viewport.classList.remove("dragging");
          return;
        }

        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: state.view.x,
          originY: state.view.y,
        };
        el.viewport.classList.add("dragging");
      });

      window.addEventListener("pointermove", (event) => {
        if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, localPoint(event));

        if (pinchState && activePointers.size >= 2) {
          const pair = pointerPair();
          if (!pair) return;
          const [p1, p2] = pair;
          const currentDistance = Math.max(distanceBetween(p1, p2), 10);
          const currentCenter = centerBetween(p1, p2);
          const nextScale = clamp(pinchState.startView.scale * (currentDistance / pinchState.startDistance), 0.28, 1.8);
          const worldX = (pinchState.startCenter.x - pinchState.startView.x) / pinchState.startView.scale;
          const worldY = (pinchState.startCenter.y - pinchState.startView.y) / pinchState.startView.scale;
          state.view.scale = nextScale;
          state.view.x = currentCenter.x - worldX * nextScale;
          state.view.y = currentCenter.y - worldY * nextScale;
          applyView();
          return;
        }

        if (!dragState || dragState.pointerId !== event.pointerId) return;
        state.view.x = dragState.originX + (event.clientX - dragState.startX);
        state.view.y = dragState.originY + (event.clientY - dragState.startY);
        applyView();
      });

      const clearPointer = (event) => {
        activePointers.delete(event.pointerId);
        if (dragState?.pointerId === event.pointerId) dragState = null;
        if (activePointers.size < 2) pinchState = null;
        if (!dragState) el.viewport.classList.remove("dragging");
      };

      window.addEventListener("pointerup", clearPointer);
      window.addEventListener("pointercancel", clearPointer);

      el.viewport.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
          const delta = event.deltaY < 0 ? 1.08 : 0.92;
          const nextScale = clamp(state.view.scale * delta, 0.28, 1.8);
          const rect = el.viewport.getBoundingClientRect();
          const px = event.clientX - rect.left;
          const py = event.clientY - rect.top;
          state.view.x = px - ((px - state.view.x) / state.view.scale) * nextScale;
          state.view.y = py - ((py - state.view.y) / state.view.scale) * nextScale;
          state.view.scale = nextScale;
          applyView();
        },
        { passive: false }
      );
    }

    function fitGraphToView() {
      if (!state.graph?.nodes?.length) return;
      const minX = Math.min(...state.graph.nodes.map((node) => node.x));
      const minY = Math.min(...state.graph.nodes.map((node) => node.y));
      const maxX = Math.max(...state.graph.nodes.map((node) => node.x + 240));
      const maxY = Math.max(...state.graph.nodes.map((node) => node.y + 120));
      const rect = el.viewport.getBoundingClientRect();
      const width = maxX - minX + 240;
      const height = maxY - minY + 240;
      state.view.scale = clamp(Math.min(rect.width / width, rect.height / height, 1), 0.28, 1.2);
      state.view.x = 120 - minX * state.view.scale;
      state.view.y = 120 - minY * state.view.scale;
      applyView();
    }

    function toWorldPoint(clientX, clientY) {
      const rect = el.viewport.getBoundingClientRect();
      return {
        x: (clientX - rect.left - state.view.x) / state.view.scale,
        y: (clientY - rect.top - state.view.y) / state.view.scale,
      };
    }

    return {
      bindViewport,
      fitGraphToView,
      toWorldPoint,
    };
  }

  window.RealworldViewportController = { createViewportController };
})();
