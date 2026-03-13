(function () {
  const STORAGE_KEY = "realworld-planner-v2";
  const PLANNER_SESSION_KEY = "realworld-planner-session-v2";
  const STATIC_GRAPH = new URL("./graph-state.json", window.location.href).toString();
  const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
  const DEFAULT_SCHEMA = window.GRAPH_SCHEMA || { node_types: {}, edge_types: [], constraint_types: [], preference_types: [] };
  const GraphUtils = window.RealworldGraphUtils;
  const PlannerProfile = window.RealworldPlannerProfile;
  const ClusterView = window.RealworldClusterView;
  const ViewportController = window.RealworldViewportController;
  const StorageController = window.RealworldStorageController;
  const DetailPanel = window.RealworldDetailPanel;
  const ChatController = window.RealworldChatController;
  const AppShell = window.RealworldAppShell;

  const COLORS = {
    Country: { bg: "#f9e4b7", fg: "#8c5100" },
    Region: { bg: "#ffd7ba", fg: "#9a3412" },
    Prefecture: { bg: "#ffedd5", fg: "#9a3412" },
    City: { bg: "#bfe6dd", fg: "#0f766e" },
    District: { bg: "#d8f3dc", fg: "#166534" },
    Lodging: { bg: "#fde6c8", fg: "#b45309" },
    SeasonalEvent: { bg: "#f4d7ea", fg: "#a21caf" },
    ExperienceTheme: { bg: "#d3ddff", fg: "#3949ab" },
    TravelRule: { bg: "#dcfce7", fg: "#166534" },
    PassProduct: { bg: "#ece2d2", fg: "#5b4632" },
    Cuisine: { bg: "#ffe4c7", fg: "#c2410c" },
    Restaurant: { bg: "#ffd8a8", fg: "#9a3412" },
    Attraction: { bg: "#c7d2fe", fg: "#3730a3" },
    TransitHub: { bg: "#cde7ff", fg: "#1d4ed8" },
    PlannerSession: { bg: "#ede9fe", fg: "#5b21b6" },
    UserProfile: { bg: "#fde68a", fg: "#92400e" },
    Constraint: { bg: "#fee2e2", fg: "#b91c1c" },
    Preference: { bg: "#fae8ff", fg: "#86198f" },
    CandidatePlan: { bg: "#fef3c7", fg: "#92400e" },
    PlanDay: { bg: "#e0f2fe", fg: "#075985" },
    TransportOption: { bg: "#cde7ff", fg: "#1d4ed8" },
    StayOption: { bg: "#fde6c8", fg: "#b45309" },
    ActivityOption: { bg: "#c7d2fe", fg: "#3730a3" },
    BudgetSummary: { bg: "#d1fae5", fg: "#065f46" },
    Source: { bg: "#ded8cf", fg: "#5f5345" },
    Observation: { bg: "#f3f4f6", fg: "#374151" },
    Default: { bg: "#ece2d2", fg: "#5b4632" },
  };

  const state = {
    graph: null,
    seed: null,
    schema: DEFAULT_SCHEMA,
    selected: null,
    highlightedNodeIds: new Set(),
    highlightedEdgeIds: new Set(),
    mode: "select",
    connectSourceId: null,
    view: { x: 120, y: 80, scale: 0.62 },
    chatHeightVh: 36,
    chats: [],
    lastMatches: [],
    lastMatchedEdges: [],
    plannerSessionId: "",
    plannerSession: null,
    stickChatToBottom: true,
    detailDraft: null,
    detailOriginal: null,
    detailIsNew: false,
    runtime: { serverAvailable: false, source: "seed" },
    clusterView: { enabled: true, open: new Set(["planner", "activity"]), layout: null },
  };

  const el = {
    viewport: document.getElementById("viewport"),
    world: document.getElementById("world"),
    nodeLayer: document.getElementById("nodeLayer"),
    edgeLayer: document.getElementById("edgeLayer"),
    overlayLayer: document.getElementById("overlayLayer"),
    updatedStamp: document.getElementById("updatedStamp"),
    addNodeBtn: document.getElementById("addNodeBtn"),
    connectBtn: document.getElementById("connectBtn"),
    saveBtn: document.getElementById("saveBtn"),
    fitBtn: document.getElementById("fitBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    clusterBtn: document.getElementById("clusterBtn"),
    chatGrowBtn: document.getElementById("chatGrowBtn"),
    chatShrinkBtn: document.getElementById("chatShrinkBtn"),
    importInput: document.getElementById("importInput"),
    chatForm: document.getElementById("chatForm"),
    searchQuery: document.getElementById("searchQuery"),
    searchModel: document.getElementById("searchModel"),
    searchApiKey: document.getElementById("searchApiKey"),
    chatMessages: document.getElementById("chatMessages"),
    settingsModal: document.getElementById("settingsModal"),
    detailModal: document.getElementById("detailModal"),
    answerModal: document.getElementById("answerModal"),
    usedInfoModal: document.getElementById("ontologyUsedModal"),
    detailTitle: document.getElementById("detailTitle"),
    detailMeta: document.getElementById("detailMeta"),
    detailSummary: document.getElementById("detailSummary"),
    fieldTitle: document.getElementById("fieldTitle"),
    fieldType: document.getElementById("fieldType"),
    fieldNotes: document.getElementById("fieldNotes"),
    fieldEdgeLabel: document.getElementById("fieldEdgeLabel"),
    nodeFields: document.getElementById("nodeFields"),
    edgeFields: document.getElementById("edgeFields"),
    propertyTable: document.getElementById("propertyTable"),
    addPropertyBtn: document.getElementById("addPropertyBtn"),
    saveDetailBtn: document.getElementById("saveDetailBtn"),
    cancelDetailBtn: document.getElementById("cancelDetailBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    resetBtn: document.getElementById("resetBtn"),
    deleteBtn: document.getElementById("deleteBtn"),
  };

  const shell = AppShell.createAppShell({ state, el, formatDate });
  const viewport = ViewportController.createViewportController({ state, el, applyView, clamp });
  const storage = StorageController.createStorageController({
    state,
    GraphUtils,
    storageKey: STORAGE_KEY,
    plannerSessionKey: PLANNER_SESSION_KEY,
    staticGraphUrl: STATIC_GRAPH,
    seedProvider: () => state.seed || window.GRAPH_SEED,
    onSessionCleared: removePlannerProfileFromGraph,
    onGraphLoaded: () => {},
    render,
    fitGraphToView: () => viewport.fitGraphToView(),
  });
  const detailPanel = DetailPanel.createDetailPanel({ state, el, GraphUtils, getNode, getEdge, saveLocal: storage.saveLocal, render, escapeHtml });
  const chat = ChatController.createChatController({
    state,
    el,
    GraphUtils,
    composeAssistantText,
    onPlannerSessionUpdated(session) {
      syncPlannerProfileToGraph(session);
      storage.saveLocalPlannerSession();
      storage.saveLocal();
    },
    onPlannerSessionCleared() {
      storage.clearLocalPlannerSession();
      storage.saveLocal();
    },
    applySearchHighlight,
    openAnswerModal,
    render,
    callOpenRouterDirect,
  });

  boot();

  async function boot() {
    bindEvents();
    viewport.bindViewport();
    populateTypeOptions();
    state.graph = await storage.loadGraph();
    state.seed = structuredClone(state.graph);
    state.plannerSession = storage.loadLocalPlannerSession();
    state.plannerSessionId = state.plannerSession?.id || "";
    if (state.plannerSession) {
      syncPlannerProfileToGraph(state.plannerSession);
      storage.saveLocal();
    }
    viewport.fitGraphToView();
    render();
  }

  function bindEvents() {
    el.addNodeBtn.addEventListener("click", addNode);
    el.connectBtn.addEventListener("click", toggleConnectMode);
    el.saveBtn.addEventListener("click", () => {
      storage.savePages();
      shell.renderMeta();
    });
    el.fitBtn.addEventListener("click", () => viewport.fitGraphToView());
    el.settingsBtn.addEventListener("click", () => el.settingsModal.showModal());
    el.clusterBtn.addEventListener("click", () => {
      shell.toggleClusterView();
      render();
    });
    el.chatGrowBtn.addEventListener("click", () => chat.adjustChatHeight(6));
    el.chatShrinkBtn.addEventListener("click", () => chat.adjustChatHeight(-6));
    el.chatForm.addEventListener("submit", chat.submitQuery);
    el.chatMessages.addEventListener("scroll", chat.handleChatScroll);
    window.addEventListener("resize", () => {
      shell.renderChatHeight();
      render();
    });
    el.exportBtn.addEventListener("click", storage.exportGraph);
    el.importBtn.addEventListener("click", () => el.importInput.click());
    el.importInput.addEventListener("change", storage.importGraph);
    el.resetBtn.addEventListener("click", storage.resetGraph);
    el.deleteBtn.addEventListener("click", deleteSelection);
    el.addPropertyBtn.addEventListener("click", detailPanel.addPropertyRow);
    el.saveDetailBtn.addEventListener("click", detailPanel.saveDetailChanges);
    el.cancelDetailBtn.addEventListener("click", detailPanel.cancelDetailChanges);
    [el.settingsModal, el.detailModal, el.answerModal].forEach(detailPanel.bindBackdropClose);
    el.detailModal.addEventListener("close", detailPanel.resetDetailDraft);

    el.fieldTitle.addEventListener("input", () => {
      const draft = detailPanel.getDetailDraft();
      if (!draft) return;
      draft.title = el.fieldTitle.value;
      detailPanel.renderDetailSummary();
    });
    el.fieldType.addEventListener("change", () => {
      const draft = detailPanel.getDetailDraft();
      if (!draft) return;
      draft.type = el.fieldType.value;
      detailPanel.renderDetailSummary();
    });
    el.fieldNotes.addEventListener("input", () => {
      const draft = detailPanel.getDetailDraft();
      if (!draft) return;
      draft.notes = el.fieldNotes.value;
    });
    el.fieldEdgeLabel.addEventListener("input", () => {
      const draft = detailPanel.getDetailDraft();
      if (!draft || state.selected?.kind !== "edge") return;
      draft.label = el.fieldEdgeLabel.value;
      detailPanel.renderDetailSummary();
    });
  }

  function render() {
    if (!state.graph) return;
    applyView();
    shell.renderChatHeight();
    shell.renderMeta();
    if (state.clusterView.enabled) {
      const layout = ClusterView.buildClusterLayout(state.graph, state);
      state.clusterView.layout = layout;
      ClusterView.renderClusterEdges(layout, { el, state });
      ClusterView.renderCurrentPlanOverlay(layout, { el, state });
      ClusterView.renderClusterNodes(layout, { el, state, render, COLORS, escapeHtml, openDetailModal: detailPanel.openDetailModal });
    } else {
      state.clusterView.layout = null;
      renderEdges();
      renderPlanOverlay();
      renderNodes();
    }
    chat.renderChats();
  }

  function renderNodes() {
    el.nodeLayer.innerHTML = "";
    state.graph.nodes.forEach((node) => {
      const article = document.createElement("article");
      const isCurrentPlanNode = (state.plannerSession?.current_plan_node_ids || []).includes(node.id);
      article.className = `node${state.selected?.kind === "node" && state.selected.id === node.id ? " selected" : ""}${state.highlightedNodeIds.has(node.id) ? " search-hit" : ""}${state.mode === "connect" && state.connectSourceId === node.id ? " connect-source" : ""}${isCurrentPlanNode ? " current-plan-node" : ""}`;
      article.style.left = `${node.x}px`;
      article.style.top = `${node.y}px`;
      const palette = COLORS[node.type] || COLORS.Default;
      article.innerHTML = `<span class="node-type" style="background:${palette.bg}; color:${palette.fg};">${escapeHtml(node.type)}</span><h3>${escapeHtml(node.title || node.id)}</h3>`;
      article.addEventListener("pointerdown", (event) => onNodePointerDown(event, node.id));
      article.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.mode === "connect") handleConnectClick(node.id);
      });
      el.nodeLayer.appendChild(article);
    });
  }

  function renderEdges() {
    el.edgeLayer.innerHTML = "";
    const ns = "http://www.w3.org/2000/svg";
    state.graph.edges.forEach((edge) => {
      const fromNode = getNode(edge.from);
      const toNode = getNode(edge.to);
      if (!fromNode || !toNode) return;
      const startX = fromNode.x + 240;
      const startY = fromNode.y + 58;
      const endX = toNode.x;
      const endY = toNode.y + 58;
      const curve = Math.max(60, Math.abs(endX - startX) * 0.35);
      const d = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("class", `edge-line${state.selected?.kind === "edge" && state.selected.id === edge.id ? " selected" : ""}${state.highlightedEdgeIds.has(edge.id) ? " search-hit" : ""}`);
      el.edgeLayer.appendChild(path);
      const hit = document.createElementNS(ns, "path");
      hit.setAttribute("d", d);
      hit.setAttribute("fill", "none");
      hit.setAttribute("class", "edge-hit");
      hit.addEventListener("click", (event) => {
        event.stopPropagation();
        detailPanel.openDetailModal({ kind: "edge", id: edge.id });
      });
      el.edgeLayer.appendChild(hit);
      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", String((startX + endX) / 2));
      label.setAttribute("y", String((startY + endY) / 2 - 12));
      label.setAttribute("class", `edge-label${state.selected?.kind === "edge" && state.selected.id === edge.id ? " selected" : ""}${state.highlightedEdgeIds.has(edge.id) ? " search-hit" : ""}`);
      label.textContent = edge.label;
      label.addEventListener("click", (event) => {
        event.stopPropagation();
        detailPanel.openDetailModal({ kind: "edge", id: edge.id });
      });
      el.edgeLayer.appendChild(label);
    });
  }

  function renderPlanOverlay() {
    el.overlayLayer.innerHTML = "";
    const currentPlan = state.plannerSession?.current_plan;
    if (!currentPlan) return;
    const ids = [currentPlan.outbound?.transportId, currentPlan.selectedStayId, ...(currentPlan.selectedActivityIds || []), currentPlan.cityId].filter(Boolean);
    const points = ids.map((id) => {
      const node = getNode(id);
      if (!node) return null;
      return { x: node.x + 120, y: node.y + 40 };
    }).filter(Boolean);
    if (points.length < 2) return;
    const ns = "http://www.w3.org/2000/svg";
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      const curve = Math.max(52, Math.abs(to.x - from.x) * 0.25);
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `M ${from.x} ${from.y} C ${from.x + curve} ${from.y - 18}, ${to.x - curve} ${to.y - 18}, ${to.x} ${to.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("class", "plan-overlay-line");
      el.overlayLayer.appendChild(path);
    }
  }

  function applySearchHighlight(matches, matchedEdges) {
    const nodeIds = new Set(matches.map((item) => item.id));
    const edgeIds = new Set((matchedEdges || []).map((edge) => edge.id));
    state.graph.edges.forEach((edge) => {
      if (nodeIds.has(edge.from) || nodeIds.has(edge.to)) edgeIds.add(edge.id);
    });
    state.highlightedNodeIds = nodeIds;
    state.highlightedEdgeIds = edgeIds;
    render();
  }

  function openAnswerModal(chatIndex) {
    const chatEntry = state.chats[chatIndex];
    const matches = chatEntry?.matches || [];
    const matchedEdges = chatEntry?.matchedEdges || [];
    el.usedInfoModal.innerHTML = "";
    if (!matches.length && !matchedEdges.length) {
      el.usedInfoModal.innerHTML = '<div class="ontology-modal-item"><strong>매칭 없음</strong></div>';
    } else {
      matches.forEach((item) => {
        const div = document.createElement("div");
        div.className = "ontology-modal-item";
        div.innerHTML = `<strong>[${escapeHtml(item.type)}] ${escapeHtml(item.title)}</strong>`;
        div.addEventListener("click", () => {
          el.answerModal.close();
          detailPanel.openDetailModal({ kind: "node", id: item.id });
        });
        el.usedInfoModal.appendChild(div);
      });
      matchedEdges.forEach((item) => {
        const div = document.createElement("div");
        div.className = "ontology-modal-item";
        div.innerHTML = `<strong>[Edge] ${escapeHtml(item.label || item.id)}</strong>`;
        div.addEventListener("click", () => {
          el.answerModal.close();
          detailPanel.openDetailModal({ kind: "edge", id: item.id });
        });
        el.usedInfoModal.appendChild(div);
      });
    }
    el.answerModal.showModal();
  }

  function addNode() {
    const defaultType = Object.keys(state.schema?.node_types || {})[0] || "City";
    state.selected = { kind: "node", id: createId("node") };
    state.detailIsNew = true;
    state.detailOriginal = null;
    state.detailDraft = {
      id: state.selected.id,
      type: defaultType,
      title: "새 노드",
      x: 360 + state.graph.nodes.length * 12,
      y: 220 + state.graph.nodes.length * 12,
      aliases: [],
      tags: [],
      status: "draft",
      confidence: 0.5,
      ext: {},
      properties: {},
      notes: "새로 추가된 노드",
    };
    render();
    detailPanel.populateDetailFields();
    el.detailModal.showModal();
  }

  function toggleConnectMode() {
    if (state.mode === "connect") {
      state.mode = "select";
      state.connectSourceId = null;
    } else {
      state.mode = "connect";
      state.connectSourceId = state.selected?.kind === "node" ? state.selected.id : null;
    }
    el.connectBtn.textContent = state.mode === "connect" ? "🧷" : "🔗";
    render();
  }

  function handleConnectClick(nodeId) {
    if (!state.connectSourceId) {
      state.connectSourceId = nodeId;
      render();
      return;
    }
    if (state.connectSourceId === nodeId) return;
    state.graph.edges.push({ id: createId("edge"), from: state.connectSourceId, to: nodeId, label: "RELATES_TO" });
    state.mode = "select";
    state.connectSourceId = null;
    el.connectBtn.textContent = "🔗";
    storage.saveLocal();
    render();
  }

  function deleteSelection() {
    if (!state.selected) return;
    if (state.selected.kind === "node") {
      const id = state.selected.id;
      state.graph.nodes = state.graph.nodes.filter((node) => node.id !== id);
      state.graph.edges = state.graph.edges.filter((edge) => edge.from !== id && edge.to !== id);
    } else {
      state.graph.edges = state.graph.edges.filter((edge) => edge.id !== state.selected.id);
    }
    state.selected = null;
    storage.saveLocal();
    el.detailModal.close();
    render();
  }

  function onNodePointerDown(event, nodeId) {
    event.stopPropagation();
    if (state.mode === "connect") return;
    const node = getNode(nodeId);
    if (!node) return;
    const start = viewport.toWorldPoint(event.clientX, event.clientY);
    const originX = node.x;
    const originY = node.y;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let moved = false;

    function move(moveEvent) {
      if (Math.abs(moveEvent.clientX - startClientX) > 5 || Math.abs(moveEvent.clientY - startClientY) > 5) moved = true;
      const point = viewport.toWorldPoint(moveEvent.clientX, moveEvent.clientY);
      node.x = Math.round(originX + point.x - start.x);
      node.y = Math.round(originY + point.y - start.y);
      render();
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      storage.saveLocal();
      render();
      if (!moved) detailPanel.openDetailModal({ kind: "node", id: node.id });
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function syncPlannerProfileToGraph(session) {
    PlannerProfile.syncPlannerProfileToGraph(state.graph, session, createId);
  }

  function removePlannerProfileFromGraph() {
    PlannerProfile.removePlannerProfileFromGraph(state.graph);
  }

  function populateTypeOptions() {
    const nodeTypes = Object.keys(state.schema?.node_types || {});
    const values = nodeTypes.length ? nodeTypes : ["Country", "City", "TransitHub", "ExperienceTheme", "TransportOption", "Observation"];
    el.fieldType.innerHTML = "";
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      el.fieldType.appendChild(option);
    });
    const defaultOption = document.createElement("option");
    defaultOption.value = "Default";
    defaultOption.textContent = "Default";
    el.fieldType.appendChild(defaultOption);
  }

  function getNode(id) {
    return state.graph.nodes.find((node) => node.id === id);
  }

  function getEdge(id) {
    return state.graph.edges.find((edge) => edge.id === id);
  }

  function createId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "-";
    return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function applyView() {
    el.world.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
  }

  function composeAssistantText(result) {
    const base = result.answer || "답변 없음";
    const suffix = [];
    if (result.question_reason) suffix.push(`질문 이유: ${result.question_reason}`);
    if (result.next_question) suffix.push(`다음 입력: ${result.next_question}`);
    return suffix.length ? `${base}\n\n${suffix.join("\n")}` : base;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function callOpenRouterDirect(query, graph, matches, model, apiKey) {
    const payload = {
      model,
      messages: [
        { role: "system", content: "You are a travel graph search assistant. Use the provided graph context first, avoid inventing unavailable routes, and answer in concise Korean. Explicitly mention which matched items were used." },
        { role: "user", content: `Question: ${query}\n\nGraph context:\n${GraphUtils.buildGraphContext(graph, matches)}` },
      ],
      temperature: 0.2,
      max_tokens: 500,
    };
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "Realworld Planner",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenRouter HTTP ${response.status}: ${detail.slice(0, 200)}`);
    }
    const body = await response.json();
    return body.choices?.[0]?.message?.content || "답변 없음";
  }
})();
