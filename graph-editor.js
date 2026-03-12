(function () {
  const STORAGE_KEY = "realworld-planner-v2";
  const PLANNER_SESSION_KEY = "realworld-planner-session-v2";
  const API_GRAPH = new URL("./api/graph", window.location.href).toString();
  const API_SCHEMA = new URL("./api/schema", window.location.href).toString();
  const API_SEARCH = new URL("./api/search", window.location.href).toString();
  const API_PLAN_SESSION = new URL("./api/plan/session", window.location.href).toString();
  const API_PLAN_STEP = new URL("./api/plan/step", window.location.href).toString();
  const STATIC_GRAPH = new URL("./graph-state.json", window.location.href).toString();
  const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
  const DEFAULT_SCHEMA = window.GRAPH_SCHEMA || { node_types: {}, edge_types: [], constraint_types: [], preference_types: [] };

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
    runtime: {
      serverAvailable: false,
      source: "seed",
    },
  };

  const el = {
    viewport: document.getElementById("viewport"),
    world: document.getElementById("world"),
    nodeLayer: document.getElementById("nodeLayer"),
    edgeLayer: document.getElementById("edgeLayer"),
    updatedStamp: document.getElementById("updatedStamp"),
    addNodeBtn: document.getElementById("addNodeBtn"),
    connectBtn: document.getElementById("connectBtn"),
    saveBtn: document.getElementById("saveBtn"),
    fitBtn: document.getElementById("fitBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
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

  boot();

  async function boot() {
    bindEvents();
    bindViewport();
    state.schema = await loadSchema();
    populateTypeOptions();
    state.graph = await loadGraph();
    state.seed = structuredClone(state.graph);
    state.plannerSession = loadLocalPlannerSession();
    state.plannerSessionId = state.plannerSession?.id || "";
    if (state.plannerSession) {
      syncPlannerProfileToGraph(state.plannerSession);
      saveLocal();
    }
    fitGraphToView();
    render();
  }

  async function loadSchema() {
    try {
      const response = await fetch(API_SCHEMA, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch {
      return DEFAULT_SCHEMA;
    }
  }

  async function loadGraph() {
    try {
      const response = await fetch(API_GRAPH, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const graph = hydrateGraph(await response.json());
      state.runtime.serverAvailable = true;
      state.runtime.source = "server";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
      return graph;
    } catch {
      try {
        const response = await fetch(STATIC_GRAPH, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const graph = hydrateGraph(await response.json());
        state.runtime.serverAvailable = false;
        state.runtime.source = "static";
        localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
        return graph;
      } catch {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          state.runtime.source = "local";
          return hydrateGraph(JSON.parse(raw));
        }
        state.runtime.source = "seed";
        return hydrateGraph(structuredClone(window.GRAPH_SEED));
      }
    }
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

  function loadLocalPlannerSession() {
    const raw = localStorage.getItem(PLANNER_SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveLocalPlannerSession() {
    if (!state.plannerSession) {
      localStorage.removeItem(PLANNER_SESSION_KEY);
      return;
    }
    localStorage.setItem(PLANNER_SESSION_KEY, JSON.stringify(state.plannerSession));
  }

  function clearLocalPlannerSession() {
    state.plannerSession = null;
    state.plannerSessionId = "";
    removePlannerProfileFromGraph();
    localStorage.removeItem(PLANNER_SESSION_KEY);
  }

  function syncPlannerProfileToGraph(session) {
    if (!state.graph || !session) return;
    removePlannerProfileFromGraph();
    const profileId = "current_user_profile";
    const baseX = -220;
    const baseY = 80;
    state.graph.nodes.push({
      id: profileId,
      type: "UserProfile",
      title: "현재 사용자 프로필",
      x: baseX,
      y: baseY,
      aliases: ["traveler-profile"],
      tags: ["planner", "profile"],
      status: "active",
      confidence: 0.9,
      ext: {},
      properties: {
        session_ref: session.id,
        planner_stage: session.stage || "collect",
        origin: displayPlannerValue(session.constraints?.origin || ""),
        depart_after: session.constraints?.depart_after || "",
        return_depart_before: session.constraints?.return_depart_before || "",
        total_budget_max: session.constraints?.total_budget_max || "",
        themes: (session.preferences?.themes || []).map(displayPlannerValue).join(", "),
      },
      notes: buildProfileSummary(session),
    });

    let row = 1;
    Object.entries(session.constraints || {}).forEach(([key, value]) => {
      const nodeId = `${profileId}_constraint_${key}`;
      state.graph.nodes.push({
        id: nodeId,
        type: "Constraint",
        title: buildConstraintTitle(key, value),
        x: baseX + 280,
        y: baseY + row * 88,
        aliases: [],
        tags: ["planner", "constraint"],
        status: "active",
        confidence: 0.82,
        ext: {},
        properties: {
          constraint_kind: key,
          operator: constraintOperator(key),
          value,
          normalized_value: value,
        },
        notes: "플래너 대화에서 수집된 사용자 제약.",
      });
      state.graph.edges.push({
        id: createId("edge"),
        from: profileId,
        to: nodeId,
        label: "HAS_CONSTRAINT",
        notes: "",
        confidence: 0.82,
      });
      row += 1;
    });

    Object.entries(session.preferences || {}).forEach(([key, value]) => {
      const nodeId = `${profileId}_preference_${key}`;
      const valueText = Array.isArray(value) ? value.map(displayPlannerValue).join(", ") : displayPlannerValue(value);
      state.graph.nodes.push({
        id: nodeId,
        type: "Preference",
        title: `${preferenceLabel(key)}: ${valueText || "미지정"}`,
        x: baseX - 280,
        y: baseY + row * 88,
        aliases: [],
        tags: ["planner", "preference"],
        status: "active",
        confidence: 0.8,
        ext: {},
        properties: {
          preference_kind: key,
          value,
          weight: 0.8,
        },
        notes: "플래너 대화에서 수집된 사용자 선호.",
      });
      state.graph.edges.push({
        id: createId("edge"),
        from: profileId,
        to: nodeId,
        label: "HAS_PREFERENCE",
        notes: "",
        confidence: 0.8,
      });
      row += 1;
    });
  }

  function removePlannerProfileFromGraph() {
    if (!state.graph) return;
    const removableIds = new Set(
      state.graph.nodes
        .filter((node) => node.id === "current_user_profile" || node.id.startsWith("current_user_profile_"))
        .map((node) => node.id)
    );
    if (!removableIds.size) return;
    state.graph.nodes = state.graph.nodes.filter((node) => !removableIds.has(node.id));
    state.graph.edges = state.graph.edges.filter(
      (edge) => !removableIds.has(edge.from) && !removableIds.has(edge.to) && edge.from !== "current_user_profile"
    );
  }

  function buildProfileSummary(session) {
    const parts = [];
    if (session.constraints?.origin) parts.push(`출발지 ${displayPlannerValue(session.constraints.origin)}`);
    if (session.constraints?.depart_after) parts.push(`출발 가능 ${session.constraints.depart_after}`);
    if (session.constraints?.return_depart_before) parts.push(`일본 출발 ${session.constraints.return_depart_before} 이전`);
    if (session.constraints?.total_budget_max) parts.push(`예산 ${Number(session.constraints.total_budget_max).toLocaleString("ko-KR")}원`);
    if (session.preferences?.themes?.length) parts.push(`테마 ${session.preferences.themes.map(displayPlannerValue).join(", ")}`);
    return parts.join(" / ") || "아직 수집 중인 사용자 프로필.";
  }

  function buildConstraintTitle(key, value) {
    const labels = {
      origin: `출발지: ${displayPlannerValue(value)}`,
      depart_after: `출발 가능: ${value}`,
      return_depart_before: `일본 출발 제한: ${value}`,
      total_budget_max: `최대 예산: ${Number(value || 0).toLocaleString("ko-KR")}원`,
      nights_min: `최소 숙박: ${value}박`,
      nights_max: `최대 숙박: ${value}박`,
      must_use_airport: `필수 공항: ${value}`,
      must_avoid_area: `제외 지역: ${Array.isArray(value) ? value.join(", ") : value}`,
    };
    return labels[key] || `${key}: ${value}`;
  }

  function preferenceLabel(key) {
    const labels = {
      themes: "테마",
      pace: "속도감",
      food_budget_level: "미식 강도",
      shopping_level: "쇼핑 강도",
      nature_level: "자연 선호",
      onsen_level: "온천 선호",
      nightlife_level: "야경/밤거리 선호",
      transport_tolerance: "이동 허용도",
    };
    return labels[key] || key;
  }

  function constraintOperator(key) {
    if (key === "depart_after") return ">=";
    if (key === "return_depart_before" || key === "total_budget_max" || key === "nights_max") return "<=";
    return "=";
  }

  function displayPlannerValue(value) {
    if (Array.isArray(value)) return value.map(displayPlannerValue).join(", ");
    const labels = {
      hub_icn: "인천(ICN)",
      hub_pus: "부산/김해(PUS)",
      theme_food: "미식",
      theme_shopping: "쇼핑",
      theme_onsen: "온천",
      theme_history: "역사/전통",
      theme_nightlife: "야경/밤거리",
      theme_nature: "자연",
      low: "낮음",
      medium: "중간",
      high: "높음",
      slow: "여유롭게",
      balanced: "균형형",
      packed: "빡빡하게",
    };
    return labels[value] || String(value || "");
  }

  function bindEvents() {
    el.addNodeBtn.addEventListener("click", addNode);
    el.connectBtn.addEventListener("click", toggleConnectMode);
    el.saveBtn.addEventListener("click", saveServer);
    el.fitBtn.addEventListener("click", fitGraphToView);
    el.settingsBtn.addEventListener("click", () => el.settingsModal.showModal());
    el.chatGrowBtn.addEventListener("click", () => adjustChatHeight(6));
    el.chatShrinkBtn.addEventListener("click", () => adjustChatHeight(-6));
    el.chatForm.addEventListener("submit", submitQuery);
    el.chatMessages.addEventListener("scroll", handleChatScroll);
    window.addEventListener("resize", renderChatHeight);
    el.exportBtn.addEventListener("click", exportGraph);
    el.importBtn.addEventListener("click", () => el.importInput.click());
    el.importInput.addEventListener("change", importGraph);
    el.resetBtn.addEventListener("click", resetGraph);
    el.deleteBtn.addEventListener("click", deleteSelection);
    el.addPropertyBtn.addEventListener("click", addPropertyRow);
    el.saveDetailBtn.addEventListener("click", saveDetailChanges);
    el.cancelDetailBtn.addEventListener("click", cancelDetailChanges);

    el.fieldTitle.addEventListener("input", () => {
      const draft = getDetailDraft();
      if (!draft) return;
      draft.title = el.fieldTitle.value;
      renderDetailSummary();
    });
    el.fieldType.addEventListener("change", () => {
      const draft = getDetailDraft();
      if (!draft) return;
      draft.type = el.fieldType.value;
      renderDetailSummary();
    });
    el.fieldNotes.addEventListener("input", () => {
      const draft = getDetailDraft();
      if (!draft) return;
      draft.notes = el.fieldNotes.value;
    });
    el.fieldEdgeLabel.addEventListener("input", () => {
      const draft = getDetailDraft();
      if (!draft || state.selected?.kind !== "edge") return;
      draft.label = el.fieldEdgeLabel.value;
      renderDetailSummary();
    });

    [el.settingsModal, el.detailModal, el.answerModal].forEach(bindBackdropClose);
    el.detailModal.addEventListener("close", resetDetailDraft);
  }

  function bindBackdropClose(dialog) {
    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) dialog.close();
    });
  }

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

    const centerBetween = (a, b) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });

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
      if (activePointers.has(event.pointerId)) {
        activePointers.set(event.pointerId, localPoint(event));
      }

      if (pinchState && activePointers.size >= 2) {
        const pair = pointerPair();
        if (!pair) return;
        const [p1, p2] = pair;
        const currentDistance = Math.max(distanceBetween(p1, p2), 10);
        const currentCenter = centerBetween(p1, p2);
        const nextScale = clamp(
          pinchState.startView.scale * (currentDistance / pinchState.startDistance),
          0.28,
          1.8
        );
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
      if (dragState?.pointerId === event.pointerId) {
        dragState = null;
      }

      if (activePointers.size < 2) {
        pinchState = null;
      }

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

  function render() {
    if (!state.graph) return;
    applyView();
    renderChatHeight();
    renderMeta();
    renderNodes();
    renderEdges();
    renderChats();
  }

  function renderChatHeight() {
    document.documentElement.style.setProperty("--chat-panel-height", `${Math.round(window.innerHeight * (state.chatHeightVh / 100))}px`);
  }

  function renderMeta() {
    const stamp = state.graph?.meta?.updatedAt || "";
    const sourceLabel = {
      server: "server",
      static: "pages",
      local: "local",
      seed: "seed",
    }[state.runtime.source] || state.runtime.source;
    const plannerLabel = state.plannerSessionId ? ` · planner ${state.plannerSessionId.slice(-6)}` : "";
    el.updatedStamp.textContent = `최근 저장: ${formatDate(stamp)} · ${sourceLabel}${plannerLabel}`;
  }

  function renderNodes() {
    el.nodeLayer.innerHTML = "";
    state.graph.nodes.forEach((node) => {
      const article = document.createElement("article");
      article.className = "node";
      if (state.selected?.kind === "node" && state.selected.id === node.id) article.classList.add("selected");
      if (state.highlightedNodeIds.has(node.id)) article.classList.add("search-hit");
      if (state.mode === "connect" && state.connectSourceId === node.id) article.classList.add("connect-source");
      article.style.left = `${node.x}px`;
      article.style.top = `${node.y}px`;

      const palette = COLORS[node.type] || COLORS.Default;
      article.innerHTML = `
        <span class="node-type" style="background:${palette.bg}; color:${palette.fg};">${escapeHtml(node.type)}</span>
        <h3>${escapeHtml(node.title || node.id)}</h3>
      `;

      article.addEventListener("pointerdown", (event) => onNodePointerDown(event, node.id));
      article.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.mode === "connect") {
          handleConnectClick(node.id);
        }
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
      path.setAttribute(
        "class",
        `edge-line${state.selected?.kind === "edge" && state.selected.id === edge.id ? " selected" : ""}${state.highlightedEdgeIds.has(edge.id) ? " search-hit" : ""}`
      );
      el.edgeLayer.appendChild(path);

      const hit = document.createElementNS(ns, "path");
      hit.setAttribute("d", d);
      hit.setAttribute("fill", "none");
      hit.setAttribute("class", "edge-hit");
      hit.addEventListener("click", (event) => {
        event.stopPropagation();
        openDetailModal({ kind: "edge", id: edge.id });
      });
      el.edgeLayer.appendChild(hit);

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", String((startX + endX) / 2));
      label.setAttribute("y", String((startY + endY) / 2 - 12));
      label.setAttribute(
        "class",
        `edge-label${state.selected?.kind === "edge" && state.selected.id === edge.id ? " selected" : ""}${state.highlightedEdgeIds.has(edge.id) ? " search-hit" : ""}`
      );
      label.textContent = edge.label;
      label.addEventListener("click", (event) => {
        event.stopPropagation();
        openDetailModal({ kind: "edge", id: edge.id });
      });
      el.edgeLayer.appendChild(label);
    });
  }

  function renderChats() {
    const shouldStick = state.stickChatToBottom || isNearChatBottom();
    el.chatMessages.innerHTML = "";
    state.chats.forEach((chat, index) => {
      const bubble = document.createElement("article");
      bubble.className = `chat-bubble ${chat.role}`;
      bubble.innerHTML = `
        <div class="chat-bubble-head">
          <span>${chat.role === "user" ? "질문" : "답변"}</span>
          <span>${formatDate(chat.createdAt)}</span>
        </div>
        <div class="chat-bubble-body">${escapeHtml(chat.text)}</div>
      `;
      if (chat.role === "assistant") {
        bubble.addEventListener("click", () => openAnswerModal(index));
      }
      el.chatMessages.appendChild(bubble);
    });
    if (shouldStick) {
      requestAnimationFrame(() => {
        el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
        state.stickChatToBottom = true;
      });
    }
  }

  async function submitQuery(event) {
    event.preventDefault();
    const query = el.searchQuery.value.trim();
    if (!query) return;

    state.chats.push({ role: "user", text: query, createdAt: new Date().toISOString() });
    renderChats();
    el.searchQuery.value = "";

    const usePlanner = shouldUsePlanner(query);
    const placeholder = {
      role: "assistant",
      text: usePlanner ? "플랜 후보 계산 중..." : "검색 중...",
      createdAt: new Date().toISOString(),
      matches: [],
    };
    state.chats.push(placeholder);
    renderChats();

    try {
      let result;
      try {
        const endpoint = usePlanner ? API_PLAN_STEP : API_SEARCH;
        const body = usePlanner
          ? JSON.stringify({
              query,
              session_id: state.plannerSessionId,
            })
          : JSON.stringify({
              query,
              model: el.searchModel.value.trim(),
              apiKey: el.searchApiKey.value.trim(),
            });
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        result = await response.json();
        state.runtime.serverAvailable = true;
      } catch {
        result = usePlanner ? await runStaticPlanner(query) : await runStaticSearch(query);
        state.runtime.serverAvailable = false;
      }
      placeholder.text = composeAssistantText(result);
      placeholder.stage = result.stage || "";
      placeholder.nextQuestion = result.next_question || "";
      placeholder.matches = result.matches || [];
      placeholder.matchedEdges = result.matched_edges || [];
      placeholder.recommendations = result.recommendations || [];
      if (result.session?.id) {
        state.plannerSessionId = result.session.id;
        state.plannerSession = result.session;
        syncPlannerProfileToGraph(result.session);
        saveLocalPlannerSession();
        saveLocal();
      } else if (!usePlanner) {
        clearLocalPlannerSession();
        saveLocal();
      }
      state.lastMatches = placeholder.matches;
      state.lastMatchedEdges = placeholder.matchedEdges;
      applySearchHighlight(placeholder.matches, placeholder.matchedEdges);
    } catch (error) {
      placeholder.text = `검색 실패: ${error}`;
      placeholder.matches = [];
      placeholder.matchedEdges = [];
      applySearchHighlight([], []);
    }
    renderChats();
  }

  function shouldUsePlanner(query) {
    if (state.plannerSessionId) return true;
    const lower = query.toLowerCase();
    return (
      /(\d+\s*번|\d{1,2}[/-]\d{1,2}|예산|경비|출발|귀국|복귀|플랜|일정|추천|온천|쇼핑|미식|1박|2박)/.test(lower)
    );
  }

  function composeAssistantText(result) {
    const base = result.answer || "답변 없음";
    if (!result.next_question) return base;
    return `${base}\n\n다음 입력: ${result.next_question}`;
  }

  function openAnswerModal(chatIndex) {
    const chat = state.chats[chatIndex];
    const matches = chat?.matches || [];
    const matchedEdges = chat?.matchedEdges || [];
    el.usedInfoModal.innerHTML = "";
    if (!matches.length && !matchedEdges.length) {
      el.usedInfoModal.innerHTML = '<div class="ontology-modal-item"><strong>매칭 없음</strong></div>';
    } else {
      matches.forEach((item) => {
        const div = document.createElement("div");
        div.className = "ontology-modal-item";
        div.innerHTML = `
          <strong>[${escapeHtml(item.type)}] ${escapeHtml(item.title)}</strong>
        `;
        div.addEventListener("click", () => {
          el.answerModal.close();
          openDetailModal({ kind: "node", id: item.id });
        });
        el.usedInfoModal.appendChild(div);
      });
      matchedEdges.forEach((item) => {
        const div = document.createElement("div");
        div.className = "ontology-modal-item";
        div.innerHTML = `
          <strong>[Edge] ${escapeHtml(item.label || item.id)}</strong>
        `;
        div.addEventListener("click", () => {
          el.answerModal.close();
          openDetailModal({ kind: "edge", id: item.id });
        });
        el.usedInfoModal.appendChild(div);
      });
    }
    el.answerModal.showModal();
  }

  function adjustChatHeight(delta) {
    state.chatHeightVh = clamp(state.chatHeightVh + delta, 18, 60);
    renderChatHeight();
    requestAnimationFrame(() => {
      if (state.stickChatToBottom) el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    });
  }

  function openDetailModal(selection) {
    if (state.mode === "connect" && selection.kind === "node") return;
    state.selected = selection;
    state.detailIsNew = false;
    state.detailOriginal = structuredClone(selection.kind === "node" ? getNode(selection.id) : getEdge(selection.id));
    state.detailDraft = structuredClone(state.detailOriginal);
    render();
    if (selection.kind === "node") {
      const node = getDetailDraft();
      if (!node) return;
      el.detailTitle.textContent = node.title || node.id;
      el.detailMeta.textContent = `${node.type} · ${node.id}`;
      renderDetailSummary();
      el.fieldTitle.value = node.title || "";
      el.fieldType.value = node.type || "Default";
      el.fieldNotes.value = node.notes || "";
      el.nodeFields.hidden = false;
      el.edgeFields.hidden = true;
      renderPropertyTable(node);
    } else {
      const edge = getDetailDraft();
      if (!edge) return;
      el.detailTitle.textContent = edge.label || edge.id;
      el.detailMeta.textContent = `Edge · ${edge.id}`;
      renderDetailSummary();
      el.fieldNotes.value = edge.notes || "";
      el.fieldEdgeLabel.value = edge.label || "";
      el.nodeFields.hidden = true;
      el.edgeFields.hidden = false;
    }
    el.detailModal.showModal();
  }

  function buildNodeSummary(node) {
    const connected = state.graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).length;
    return [
      summaryCard("Type", node.type || "-"),
      summaryCard("Connections", String(connected)),
      summaryCard("Properties", String(Object.keys(node.properties || {}).length)),
      summaryCard("Position", `${node.x}, ${node.y}`),
    ].join("");
  }

  function buildEdgeSummary(edge) {
    return [
      summaryCard("From", getNode(edge.from)?.title || edge.from),
      summaryCard("To", getNode(edge.to)?.title || edge.to),
      summaryCard("Label", edge.label || "-"),
      summaryCard("Edge ID", edge.id),
    ].join("");
  }

  function summaryCard(label, value) {
    return `<div class="summary-card"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`;
  }

  function renderPropertyTable(node) {
    const entries = Object.entries(node.properties || {});
    el.propertyTable.innerHTML = "";
    if (!entries.length) {
      el.propertyTable.innerHTML = '<div class="summary-card"><span>속성이 없다. 아래에서 추가할 수 있다.</span></div>';
      return;
    }
    entries.forEach(([key, value]) => {
      const row = document.createElement("div");
      row.className = "property-row";
      const keyInput = document.createElement("input");
      keyInput.value = key;
      const valueInput = document.createElement("input");
      valueInput.value = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "icon-btn";
      removeBtn.textContent = "×";
      keyInput.addEventListener("change", () => updatePropertyKey(key, keyInput.value));
      valueInput.addEventListener("input", () => updatePropertyValue(keyInput.value, valueInput.value, key));
      removeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeProperty(keyInput.value || key);
      });
      row.appendChild(keyInput);
      row.appendChild(valueInput);
      row.appendChild(removeBtn);
      el.propertyTable.appendChild(row);
    });
  }

  function applySearchHighlight(matches, matchedEdges) {
    const nodeIds = new Set(matches.map((item) => item.id));
    const edgeIds = new Set((matchedEdges || []).map((edge) => edge.id));
    state.graph.edges.forEach((edge) => {
      if (nodeIds.has(edge.from) || nodeIds.has(edge.to)) edgeIds.add(edge.id);
    });
    state.highlightedNodeIds = nodeIds;
    state.highlightedEdgeIds = edgeIds;
    renderNodes();
    renderEdges();
  }

  function onNodePointerDown(event, nodeId) {
    event.stopPropagation();
    if (state.mode === "connect") return;
    const node = getNode(nodeId);
    if (!node) return;
    const start = toWorldPoint(event.clientX, event.clientY);
    const originX = node.x;
    const originY = node.y;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let moved = false;

    function move(moveEvent) {
      if (Math.abs(moveEvent.clientX - startClientX) > 5 || Math.abs(moveEvent.clientY - startClientY) > 5) {
        moved = true;
      }
      const point = toWorldPoint(moveEvent.clientX, moveEvent.clientY);
      node.x = Math.round(originX + point.x - start.x);
      node.y = Math.round(originY + point.y - start.y);
      renderNodes();
      renderEdges();
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      saveLocal();
      render();
      if (!moved) {
        openDetailModal({ kind: "node", id: node.id });
      }
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function handleChatScroll() {
    state.stickChatToBottom = isNearChatBottom();
  }

  function isNearChatBottom() {
    const remaining =
      el.chatMessages.scrollHeight - el.chatMessages.scrollTop - el.chatMessages.clientHeight;
    return remaining < 32;
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
    populateDetailFields();
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
  }

  function handleConnectClick(nodeId) {
    if (!state.connectSourceId) {
      state.connectSourceId = nodeId;
      renderNodes();
      return;
    }
    if (state.connectSourceId === nodeId) return;
    const edge = {
      id: createId("edge"),
      from: state.connectSourceId,
      to: nodeId,
      label: "RELATES_TO",
    };
    state.graph.edges.push(edge);
    state.mode = "select";
    state.connectSourceId = null;
    el.connectBtn.textContent = "🔗";
    saveLocal();
    render();
  }

  async function saveServer() {
    saveLocal();
    if (!state.runtime.serverAvailable) {
      alert("정적 모드에서는 브라우저에만 저장된다. GitHub Pages에서는 JSON 내보내기로 백업하거나 서버 모드에서 저장해야 한다.");
      renderMeta();
      return;
    }
    try {
      await fetch(API_GRAPH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.graph),
      });
    } catch {
      state.runtime.serverAvailable = false;
      alert("서버 저장에 실패했다. 현재 변경 내용은 브라우저에만 저장되어 있다.");
    }
    renderMeta();
  }

  function saveLocal() {
    state.graph.meta = state.graph.meta || {};
    state.graph.meta.updatedAt = new Date().toISOString();
    state.graph = hydrateGraph(state.graph);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.graph));
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
        state.graph = hydrateGraph(graph);
        clearLocalPlannerSession();
        saveLocal();
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
    state.graph = hydrateGraph(structuredClone(state.seed || window.GRAPH_SEED));
    state.selected = null;
    state.highlightedNodeIds = new Set();
    state.highlightedEdgeIds = new Set();
    clearLocalPlannerSession();
    saveLocal();
    fitGraphToView();
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
    saveLocal();
    el.detailModal.close();
    render();
  }

  function addPropertyRow() {
    const node = getDetailDraft();
    if (!node) return;
    let key = "new_property";
    let index = 1;
    while (Object.prototype.hasOwnProperty.call(node.properties || {}, key)) key = `new_property_${index++}`;
    node.properties = node.properties || {};
    node.properties[key] = "";
    renderPropertyTable(node);
    renderDetailSummary();
  }

  function updatePropertyKey(oldKey, newKey) {
    const node = getDetailDraft();
    if (!node) return;
    const trimmed = newKey.trim();
    if (!trimmed || trimmed === oldKey) {
      renderPropertyTable(node);
      return;
    }
    const next = {};
    Object.entries(node.properties || {}).forEach(([key, value]) => {
      next[key === oldKey ? trimmed : key] = value;
    });
    node.properties = next;
    renderPropertyTable(node);
    renderDetailSummary();
  }

  function updatePropertyValue(key, value, fallbackKey) {
    const node = getDetailDraft();
    if (!node) return;
    const targetKey = key.trim() || fallbackKey;
    const parsedValue = parsePropertyInput(value);
    node.properties = node.properties || {};
    if (targetKey !== fallbackKey && Object.prototype.hasOwnProperty.call(node.properties, fallbackKey)) {
      const oldValue = node.properties[fallbackKey];
      delete node.properties[fallbackKey];
      node.properties[targetKey] = value ? parsedValue : oldValue;
    } else {
      node.properties[targetKey] = parsedValue;
    }
    renderDetailSummary();
  }

  function removeProperty(key) {
    const node = getDetailDraft();
    if (!node || !node.properties) return;
    delete node.properties[key];
    renderPropertyTable(node);
    renderDetailSummary();
  }

  function populateDetailFields() {
    const draft = getDetailDraft();
    if (!draft || !state.selected) return;
    if (state.selected.kind === "node") {
      el.detailTitle.textContent = draft.title || draft.id;
      el.detailMeta.textContent = `${draft.type} · ${draft.id}`;
      el.fieldTitle.value = draft.title || "";
      el.fieldType.value = draft.type || "Default";
      el.fieldNotes.value = draft.notes || "";
      el.nodeFields.hidden = false;
      el.edgeFields.hidden = true;
      renderPropertyTable(draft);
    } else {
      el.detailTitle.textContent = draft.label || draft.id;
      el.detailMeta.textContent = `Edge · ${draft.id}`;
      el.fieldNotes.value = draft.notes || "";
      el.fieldEdgeLabel.value = draft.label || "";
      el.nodeFields.hidden = true;
      el.edgeFields.hidden = false;
    }
    renderDetailSummary();
  }

  function renderDetailSummary() {
    const draft = getDetailDraft();
    if (!draft || !state.selected) {
      el.detailSummary.innerHTML = "";
      return;
    }
    if (state.selected.kind === "node") {
      el.detailTitle.textContent = draft.title || draft.id;
      el.detailMeta.textContent = `${draft.type} · ${draft.id}`;
      el.detailSummary.innerHTML = buildNodeSummary(draft);
      return;
    }
    el.detailTitle.textContent = draft.label || draft.id;
    el.detailMeta.textContent = `Edge · ${draft.id}`;
    el.detailSummary.innerHTML = buildEdgeSummary(draft);
  }

  function saveDetailChanges() {
    const draft = getDetailDraft();
    if (!draft || !state.selected) return;
    if (state.selected.kind === "node") {
      if (state.detailIsNew) {
        state.graph.nodes.push(structuredClone(draft));
      } else {
        const node = getNode(state.selected.id);
        if (!node) return;
        Object.assign(node, structuredClone(draft));
      }
    } else {
      const edge = getEdge(state.selected.id);
      if (!edge) return;
      Object.assign(edge, structuredClone(draft));
    }
    saveLocal();
    render();
    el.detailModal.close();
  }

  function cancelDetailChanges() {
    if (state.detailIsNew) {
      state.selected = null;
      render();
    } else if (state.selected) {
      render();
    }
    el.detailModal.close();
  }

  function resetDetailDraft() {
    state.detailDraft = null;
    state.detailOriginal = null;
    state.detailIsNew = false;
  }

  function getDetailDraft() {
    return state.detailDraft;
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

  function applyView() {
    el.world.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
  }

  function getNode(id) {
    return state.graph.nodes.find((node) => node.id === id);
  }

  function getEdge(id) {
    return state.graph.edges.find((edge) => edge.id === id);
  }

  function getSelectedNode() {
    return state.selected?.kind === "node" ? getNode(state.selected.id) : null;
  }

  function getSelectedEdge() {
    return state.selected?.kind === "edge" ? getEdge(state.selected.id) : null;
  }

  function toWorldPoint(clientX, clientY) {
    const rect = el.viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.view.x) / state.view.scale,
      y: (clientY - rect.top - state.view.y) / state.view.scale,
    };
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function runStaticSearch(query) {
    const matches = searchGraphLocal(state.graph, query);
    const matchedEdges = relatedEdgesLocal(state.graph, matches);
    const apiKey = el.searchApiKey.value.trim();
    const model = el.searchModel.value.trim() || "openai/gpt-4o-mini";
    let answer = buildLocalAnswer(matches, matchedEdges);
    let usedOpenRouter = false;

    if (apiKey) {
      try {
        answer = await callOpenRouterDirect(query, state.graph, matches, model, apiKey);
        usedOpenRouter = true;
      } catch (error) {
        answer = `${buildLocalAnswer(matches, matchedEdges)}\n\nOpenRouter 호출 실패: ${error}`;
      }
    }

    return {
      matches,
      matched_edges: matchedEdges,
      answer,
      used_openrouter: usedOpenRouter,
      model,
      graph_context: buildGraphContext(state.graph, matches),
    };
  }

  async function runStaticPlanner(query) {
    const session = state.plannerSession || window.StaticPlanner?.createSession?.(state.plannerSessionId) || null;
    if (!window.StaticPlanner || !session) {
      const matches = searchGraphLocal(state.graph, query);
      const matchedEdges = relatedEdgesLocal(state.graph, matches);
      return {
        answer:
          "정적 플래너 모듈을 불러오지 못했다.\n\n" +
          `${buildLocalAnswer(matches, matchedEdges)}`,
        stage: "static",
        session: null,
        matches,
        matched_edges: matchedEdges,
        recommendations: [],
        alternatives: [],
        next_question: "페이지를 새로고침한 뒤 다시 시도해줘.",
      };
    }
    const result = window.StaticPlanner.runPlanner(state.graph, session, query);
    const matches = buildMatchesFromNodeIds(result.focusNodeIds || [], query);
    const matchedEdges = relatedEdgesLocal(state.graph, matches);
    return {
      answer: result.answer,
      stage: result.stage,
      session: result.session,
      matches,
      matched_edges: matchedEdges,
      recommendations: result.recommendations || [],
      alternatives: result.alternatives || [],
      next_question: result.next_question || "",
    };
  }

  function buildMatchesFromNodeIds(nodeIds, fallbackQuery) {
    const uniqueIds = Array.from(new Set(nodeIds || []));
    const directMatches = uniqueIds
      .map((id) => getNode(id))
      .filter(Boolean)
      .slice(0, 10)
      .map((node) => ({
        kind: "node",
        id: node.id,
        title: node.title,
        type: node.type,
        notes: node.notes || "",
        properties: node.properties || {},
        latest_values: node.latest_values || {},
        score: 999,
      }));
    return directMatches.length ? directMatches : searchGraphLocal(state.graph, fallbackQuery);
  }

  function hydrateGraph(graph) {
    const cloned = structuredClone(graph);
    const nodesById = new Map((cloned.nodes || []).map((node) => [node.id, node]));
    (cloned.nodes || []).forEach((node) => {
      node.aliases = Array.isArray(node.aliases) ? node.aliases : [];
      node.tags = Array.isArray(node.tags) ? node.tags : [];
      node.properties = node.properties || {};
      node.ext = node.ext || {};
      node.latest_values = node.latest_values || {};
      node.evidence_summary = node.evidence_summary || {};
      if (node.confidence == null) node.confidence = 0.75;
      if (!node.status) node.status = "active";
      if (!node.notes) node.notes = "";
    });
    const outgoing = new Map();
    (cloned.edges || []).forEach((edge) => {
      edge.notes = edge.notes || "";
      if (edge.confidence == null) edge.confidence = 0.75;
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      outgoing.get(edge.from).push(edge);
    });
    (cloned.nodes || [])
      .filter((node) => node.type === "Observation")
      .forEach((observation) => {
        const subjectRef = String(observation.properties?.subject_ref || "");
        const subject = nodesById.get(subjectRef);
        if (!subject) return;
        const value = observation.properties?.value || {};
        const latestValues = subject.latest_values || {};
        const observedAt = observation.properties?.observed_at || "";
        Object.entries(value).forEach(([key, item]) => {
          latestValues[key] = item;
        });
        if (!latestValues[observation.properties?.metric || "metric"]) {
          latestValues[observation.properties?.metric || "metric"] = value;
        }
        subject.latest_values = latestValues;
        const summary = subject.evidence_summary || {};
        const count = Number(summary.observation_count || 0) + 1;
        summary.observation_count = count;
        summary.last_observed_at = [summary.last_observed_at || "", observedAt].sort().pop();
        summary.trust_score = roundConfidence(((Number(summary.trust_score || 0) * (count - 1)) + Number(observation.confidence || 0.75)) / count);
        const linkedSources = (outgoing.get(observation.id) || []).filter((edge) => edge.label === "OBSERVED_FROM");
        summary.source_count = Math.max(Number(summary.source_count || 0), linkedSources.length);
        subject.evidence_summary = summary;
      });
    return cloned;
  }

  function searchGraphLocal(graph, query) {
    const terms = query
      .split(/\s+/)
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);
    const queryLower = query.toLowerCase();
    if (!terms.length) return [];

    const results = [];
    graph.nodes.forEach((node) => {
      const haystack = [
        node.id || "",
        node.type || "",
        node.title || "",
        (node.aliases || []).join(" "),
        (node.tags || []).join(" "),
        node.notes || "",
        JSON.stringify(node.properties || {}),
        JSON.stringify(node.latest_values || {}),
        JSON.stringify(node.ext || {}),
      ]
        .join(" ")
        .toLowerCase();
      const title = String(node.title || "").toLowerCase();
      let score = terms.reduce((sum, term) => sum + countOccurrences(haystack, term), 0);
      if (terms.some((term) => title.includes(term))) score += 3;
      if (title && queryLower.includes(title)) score += 6;
      if (["City", "TransitHub", "ExperienceTheme", "TransportOption", "Attraction", "Restaurant", "Lodging", "Observation"].includes(node.type)) score += 1.5;
      const trust = Number(node.evidence_summary?.trust_score || node.confidence || 0);
      const freshness = countFreshness(node.evidence_summary?.last_observed_at);
      score += trust * 1.6 + freshness;
      if (!score) return;
      results.push({
        kind: "node",
        id: node.id,
        title: node.title,
        type: node.type,
        notes: node.notes || "",
        properties: node.properties || {},
        latest_values: node.latest_values || {},
        score,
      });
    });
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 10);
  }

  function relatedEdgesLocal(graph, matches) {
    const nodeIds = new Set(matches.map((item) => item.id));
    return graph.edges
      .filter((edge) => nodeIds.has(edge.from) || nodeIds.has(edge.to))
      .slice(0, 12)
      .map((edge) => ({
        kind: "edge",
        id: edge.id,
        label: edge.label,
        from: edge.from,
        to: edge.to,
      }));
  }

  function buildLocalAnswer(matches, matchedEdges) {
    if (!matches.length && !matchedEdges.length) {
      return "관련된 정보가 아직 매칭되지 않았다. 다른 키워드로 다시 질문해줘.";
    }
    const lines = [];
    if (matches.length) {
      lines.push("사용된 정보:");
      matches.forEach((item) => {
        lines.push(`- [${item.type}] ${item.title}`);
      });
    }
    if (matchedEdges.length) {
      lines.push("");
      lines.push("연결 정보:");
      matchedEdges.slice(0, 6).forEach((edge) => {
        const from = getNode(edge.from)?.title || edge.from;
        const to = getNode(edge.to)?.title || edge.to;
        lines.push(`- ${from} -> ${edge.label} -> ${to}`);
      });
    }
    lines.push("");
    lines.push("GitHub Pages 정적 모드에서는 로컬 매칭으로 답변을 만들고, 설정에 API 키를 넣으면 OpenRouter 직접 검색도 사용할 수 있다.");
    return lines.join("\n");
  }

  function buildGraphContext(graph, matches) {
    const parts = [`Graph title: ${graph.meta?.title || ""}`, "Top graph matches:"];
    matches.forEach((item) => {
      const props = Object.entries(item.properties || {})
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
      parts.push(`- [${item.type}] ${item.title} (${item.id}): ${item.notes || ""} | ${props}`);
    });
    return parts.join("\n");
  }

  async function callOpenRouterDirect(query, graph, matches, model, apiKey) {
    const payload = {
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a travel graph search assistant. Use the provided graph context first, avoid inventing unavailable routes, and answer in concise Korean. Explicitly mention which matched items were used.",
        },
        {
          role: "user",
          content: `Question: ${query}\n\nGraph context:\n${buildGraphContext(graph, matches)}`,
        },
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

  function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    let index = 0;
    let count = 0;
    while (true) {
      index = haystack.indexOf(needle, index);
      if (index === -1) return count;
      count += 1;
      index += needle.length;
    }
  }

  function countFreshness(value) {
    if (!value) return 0;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 0;
    const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 3) return 2.6;
    if (diffDays <= 14) return 1.8;
    if (diffDays <= 45) return 1.0;
    return 0.2;
  }

  function roundConfidence(value) {
    return Math.round(Number(value || 0) * 1000) / 1000;
  }

  function parsePropertyInput(value) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return "";
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    return trimmed;
  }
})();
