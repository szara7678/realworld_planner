(function () {
  function createAppShell({ state, el, formatDate }) {
    function renderChatHeight() {
      document.documentElement.style.setProperty("--chat-panel-height", `${Math.round(window.innerHeight * (state.chatHeightVh / 100))}px`);
    }

    function renderMeta() {
      const stamp = state.graph?.meta?.updatedAt || "";
      const sourceLabel = { server: "legacy-server", static: "pages", pages: "pages", local: "local", seed: "seed" }[state.runtime.source] || state.runtime.source;
      const plannerLabel = state.plannerSessionId ? ` · planner ${state.plannerSessionId.slice(-6)}` : "";
      el.updatedStamp.textContent = `최근 저장: ${formatDate(stamp)} · ${sourceLabel}${plannerLabel}`;
      el.clusterBtn.classList.toggle("active", state.clusterView.enabled);
    }

    function toggleClusterView() {
      state.clusterView.enabled = !state.clusterView.enabled;
    }

    return { renderChatHeight, renderMeta, toggleClusterView };
  }

  window.RealworldAppShell = { createAppShell };
})();
