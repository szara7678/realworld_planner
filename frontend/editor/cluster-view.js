(function () {
  const CLUSTER_DEFS = {
    country: { label: "Country", types: ["Country", "Region", "Prefecture", "District", "TravelRule", "PassProduct"] },
    city: { label: "City", types: ["City", "ExperienceTheme", "Cuisine"] },
    transport: { label: "Transport", types: ["TransitHub", "TransportOption"] },
    lodging: { label: "Lodging", types: ["Lodging", "StayOption"] },
    activity: { label: "Activity", types: ["Attraction", "Restaurant", "SeasonalEvent", "ActivityOption"] },
    evidence: { label: "Evidence", types: ["Source", "Observation"] },
    planner: { label: "Planner", types: ["PlannerSession", "UserProfile", "Constraint", "Preference", "CandidatePlan", "PlanDay", "BudgetSummary"] },
  };
  const TYPE_TO_CLUSTER = Object.fromEntries(Object.entries(CLUSTER_DEFS).flatMap(([clusterId, info]) => info.types.map((type) => [type, clusterId])));

  function buildClusterLayout(graph, state) {
    const activeNodeIds = new Set([
      ...state.highlightedNodeIds,
      ...(state.selected?.kind === "node" ? [state.selected.id] : []),
      ...((state.plannerSession?.current_plan_node_ids || []).slice(0, 32)),
    ]);
    const groups = {};
    graph.nodes.forEach((node) => {
      const clusterId = TYPE_TO_CLUSTER[node.type] || "planner";
      if (!groups[clusterId]) groups[clusterId] = [];
      groups[clusterId].push(node);
    });
    const clusterItems = [];
    const visibleNodes = new Map();
    const centers = {};

    Object.entries(CLUSTER_DEFS).forEach(([clusterId, info], index) => {
      const nodes = groups[clusterId] || [];
      if (!nodes.length) return;
      const avgX = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
      const avgY = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length;
      const center = { x: avgX + index * 10, y: avgY };
      centers[clusterId] = center;
      const size = Math.max(180, Math.min(290, 160 + nodes.length * 9));
      const expanded = state.clusterView.open.has(clusterId);
      const poppedNodes = nodes.filter((node) => activeNodeIds.has(node.id));
      clusterItems.push({
        id: clusterId,
        label: info.label,
        center,
        size,
        count: nodes.length,
        expanded,
        nodes,
        chips: nodes.slice(0, 3).map((node) => node.title),
        active: poppedNodes.length > 0,
      });

      const renderNodesForCluster = expanded ? nodes : poppedNodes;
      renderNodesForCluster.forEach((node, nodeIndex) => {
        const angle = ((Math.PI * 2) / Math.max(renderNodesForCluster.length, 1)) * nodeIndex - Math.PI / 2;
        const radius = expanded ? 120 + Math.floor(nodeIndex / 6) * 92 : size / 2 + 48 + (nodeIndex % 3) * 28;
        visibleNodes.set(node.id, {
          node,
          x: Math.round(center.x + Math.cos(angle) * radius),
          y: Math.round(center.y + Math.sin(angle) * radius),
          popped: !expanded,
        });
      });
    });

    const clusterEdges = [];
    const seen = new Set();
    graph.edges.forEach((edge) => {
      const fromNode = graph.nodes.find((node) => node.id === edge.from);
      const toNode = graph.nodes.find((node) => node.id === edge.to);
      if (!fromNode || !toNode) return;
      const fromCluster = TYPE_TO_CLUSTER[fromNode.type] || "planner";
      const toCluster = TYPE_TO_CLUSTER[toNode.type] || "planner";
      if (fromCluster === toCluster) return;
      const key = [fromCluster, toCluster].sort().join(":");
      const existing = clusterEdges.find((item) => item.key === key);
      if (existing) existing.count += 1;
      else if (!seen.has(key)) {
        seen.add(key);
        clusterEdges.push({ key, fromCluster, toCluster, count: 1 });
      }
    });

    return { clusterItems, visibleNodes, clusterEdges, centers };
  }

  function renderClusterNodes(layout, deps) {
    const { el, state, COLORS, escapeHtml, openDetailModal } = deps;
    el.nodeLayer.innerHTML = "";
    layout.clusterItems.forEach((cluster) => {
      const bubble = document.createElement("article");
      bubble.className = `cluster-bubble${cluster.expanded ? " expanded" : ""}${cluster.active ? " search-hit" : ""}`;
      bubble.style.width = `${cluster.size}px`;
      bubble.style.height = `${cluster.size}px`;
      bubble.style.left = `${cluster.center.x - cluster.size / 2}px`;
      bubble.style.top = `${cluster.center.y - cluster.size / 2}px`;
      bubble.innerHTML = `
        <strong>${escapeHtml(cluster.label)}</strong>
        <span>${cluster.count} nodes</span>
        <div class="cluster-meta">${cluster.chips.map((chip) => `<span class="cluster-chip">${escapeHtml(chip)}</span>`).join("")}</div>
      `;
      bubble.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.clusterView.open.has(cluster.id)) state.clusterView.open.delete(cluster.id);
        else state.clusterView.open.add(cluster.id);
        deps.render();
      });
      el.nodeLayer.appendChild(bubble);
    });

    layout.visibleNodes.forEach((item) => {
      const node = item.node;
      const article = document.createElement("article");
      const isCurrentPlanNode = (state.plannerSession?.current_plan_node_ids || []).includes(node.id);
      article.className = `node cluster-node${state.selected?.kind === "node" && state.selected.id === node.id ? " selected" : ""}${state.highlightedNodeIds.has(node.id) ? " search-hit" : ""}${isCurrentPlanNode ? " current-plan-node" : ""}`;
      article.style.left = `${item.x}px`;
      article.style.top = `${item.y}px`;
      const palette = COLORS[node.type] || COLORS.Default;
      article.innerHTML = `
        <span class="node-type" style="background:${palette.bg}; color:${palette.fg};">${escapeHtml(node.type)}</span>
        <h3>${escapeHtml(node.title || node.id)}</h3>
      `;
      article.addEventListener("click", (event) => {
        event.stopPropagation();
        openDetailModal({ kind: "node", id: node.id });
      });
      el.nodeLayer.appendChild(article);
    });
  }

  function renderClusterEdges(layout, deps) {
    const { el, state } = deps;
    el.edgeLayer.innerHTML = "";
    const ns = "http://www.w3.org/2000/svg";
    layout.clusterEdges.forEach((edge) => {
      const from = layout.centers[edge.fromCluster];
      const to = layout.centers[edge.toCluster];
      if (!from || !to) return;
      const path = document.createElementNS(ns, "path");
      const curve = Math.max(80, Math.abs(to.x - from.x) * 0.3);
      path.setAttribute("d", `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("class", "edge-line");
      path.style.strokeWidth = String(Math.min(5, 1.5 + edge.count * 0.12));
      el.edgeLayer.appendChild(path);
    });

    deps.state.graph.edges.forEach((edge) => {
      const from = layout.visibleNodes.get(edge.from);
      const to = layout.visibleNodes.get(edge.to);
      if (!from || !to) return;
      const startX = from.x + 212;
      const startY = from.y + 48;
      const endX = to.x;
      const endY = to.y + 48;
      const curve = Math.max(40, Math.abs(endX - startX) * 0.25);
      const d = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("class", `edge-line${state.highlightedEdgeIds.has(edge.id) ? " search-hit" : ""}`);
      el.edgeLayer.appendChild(path);
    });
  }

  function buildCurrentPlanOverlay(layout, currentPlan) {
    if (!currentPlan) return [];
    const ids = [];
    if (currentPlan.outbound?.transportId) ids.push(currentPlan.outbound.transportId);
    if (currentPlan.selectedStayId) ids.push(currentPlan.selectedStayId);
    (currentPlan.selectedActivityIds || []).forEach((id) => ids.push(id));
    ids.push(currentPlan.cityId);
    return ids
      .map((id) => {
        const visible = layout.visibleNodes.get(id);
        return visible ? { id, x: visible.x + 106, y: visible.y + 38 } : null;
      })
      .filter(Boolean);
  }

  function renderCurrentPlanOverlay(layout, deps) {
    const { el, state } = deps;
    el.overlayLayer.innerHTML = "";
    const currentPlan = state.plannerSession?.current_plan || null;
    const points = buildCurrentPlanOverlay(layout, currentPlan);
    if (points.length < 2) return;
    const ns = "http://www.w3.org/2000/svg";
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      const curve = Math.max(46, Math.abs(to.x - from.x) * 0.24);
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `M ${from.x} ${from.y} C ${from.x + curve} ${from.y - 18}, ${to.x - curve} ${to.y - 18}, ${to.x} ${to.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("class", "plan-overlay-line");
      el.overlayLayer.appendChild(path);
    }
    points.forEach((point) => {
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", "6");
      circle.setAttribute("class", "plan-overlay-dot");
      el.overlayLayer.appendChild(circle);
    });
  }

  window.RealworldClusterView = {
    CLUSTER_DEFS,
    TYPE_TO_CLUSTER,
    buildClusterLayout,
    renderClusterNodes,
    renderClusterEdges,
    buildCurrentPlanOverlay,
    renderCurrentPlanOverlay,
  };
})();
