(function () {
  function createStorageController({ state, GraphUtils, storageKey, plannerSessionKey, staticGraphUrl, seedProvider, onSessionCleared, onGraphLoaded, render, fitGraphToView }) {
    async function loadGraph() {
      try {
        const response = await fetch(staticGraphUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const graph = GraphUtils.hydrateGraph(await response.json());
        state.runtime.serverAvailable = false;
        state.runtime.source = "pages";
        localStorage.setItem(storageKey, JSON.stringify(graph));
        return graph;
      } catch {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          state.runtime.source = "local";
          return GraphUtils.hydrateGraph(JSON.parse(raw));
        }
        state.runtime.source = "seed";
        return GraphUtils.hydrateGraph(structuredClone(seedProvider()));
      }
    }

    function loadLocalPlannerSession() {
      const raw = localStorage.getItem(plannerSessionKey);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    function saveLocalPlannerSession() {
      if (!state.plannerSession) {
        localStorage.removeItem(plannerSessionKey);
        return;
      }
      localStorage.setItem(plannerSessionKey, JSON.stringify(state.plannerSession));
    }

    function clearLocalPlannerSession() {
      state.plannerSession = null;
      state.plannerSessionId = "";
      localStorage.removeItem(plannerSessionKey);
      if (onSessionCleared) onSessionCleared();
    }

    function saveLocal() {
      state.graph.meta = state.graph.meta || {};
      state.graph.meta.updatedAt = new Date().toISOString();
      state.graph = GraphUtils.hydrateGraph(state.graph);
      localStorage.setItem(storageKey, JSON.stringify(state.graph));
    }

    function exportGraph() {
      const blob = new Blob([JSON.stringify(state.graph, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vacation-graph-data.json";
      a.click();
      URL.revokeObjectURL(url);
    }

    function importGraph(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const graph = JSON.parse(String(reader.result));
          if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error("invalid");
          state.graph = GraphUtils.hydrateGraph(graph);
          clearLocalPlannerSession();
          saveLocal();
          if (onGraphLoaded) onGraphLoaded(state.graph);
          fitGraphToView();
          render();
        } catch {
          alert("가져오기 파일 형식이 올바르지 않다.");
        }
      };
      reader.readAsText(file);
      event.target.value = "";
    }

    function resetGraph() {
      state.graph = GraphUtils.hydrateGraph(structuredClone(seedProvider()));
      state.selected = null;
      state.highlightedNodeIds = new Set();
      state.highlightedEdgeIds = new Set();
      clearLocalPlannerSession();
      saveLocal();
      if (onGraphLoaded) onGraphLoaded(state.graph);
      fitGraphToView();
      render();
    }

    function savePages() {
      saveLocal();
      alert("Pages 전용 모드에서는 브라우저 localStorage에 저장된다. 영구 보관이 필요하면 설정에서 JSON 내보내기를 사용하면 된다.");
    }

    return {
      loadGraph,
      loadLocalPlannerSession,
      saveLocalPlannerSession,
      clearLocalPlannerSession,
      saveLocal,
      exportGraph,
      importGraph,
      resetGraph,
      savePages,
    };
  }

  window.RealworldStorageController = { createStorageController };
})();
