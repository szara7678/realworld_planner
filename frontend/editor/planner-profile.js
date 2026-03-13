(function () {
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
      ferry_ok: "배편 허용",
      travel_priority: "이동 우선순위",
      lodging_priority: "숙소 우선순위",
      theme_balance: "테마 비중",
    };
    return labels[key] || key;
  }

  function constraintOperator(key) {
    if (key === "depart_after") return ">=";
    if (["return_depart_before", "total_budget_max", "nights_max"].includes(key)) return "<=";
    return "=";
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

  function buildProfileSummary(session) {
    const parts = [];
    if (session.constraints?.origin) parts.push(`출발지 ${displayPlannerValue(session.constraints.origin)}`);
    if (session.constraints?.depart_after) parts.push(`출발 가능 ${session.constraints.depart_after}`);
    if (session.constraints?.return_depart_before) parts.push(`일본 출발 ${session.constraints.return_depart_before} 이전`);
    if (session.constraints?.total_budget_max) parts.push(`예산 ${Number(session.constraints.total_budget_max).toLocaleString("ko-KR")}원`);
    if (session.preferences?.themes?.length) parts.push(`테마 ${session.preferences.themes.map(displayPlannerValue).join(", ")}`);
    if (session.destinationPreferenceIds?.length) parts.push(`목적지 선호 ${session.destinationPreferenceIds.join(", ")}`);
    return parts.join(" / ") || "아직 수집 중인 사용자 프로필.";
  }

  function removePlannerProfileFromGraph(graph) {
    if (!graph) return graph;
    const removableIds = new Set(
      graph.nodes
        .filter((node) => node.id === "current_user_profile" || node.id.startsWith("current_user_profile_"))
        .map((node) => node.id)
    );
    if (!removableIds.size) return graph;
    graph.nodes = graph.nodes.filter((node) => !removableIds.has(node.id));
    graph.edges = graph.edges.filter(
      (edge) => !removableIds.has(edge.from) && !removableIds.has(edge.to) && edge.from !== "current_user_profile"
    );
    return graph;
  }

  function syncPlannerProfileToGraph(graph, session, createId) {
    if (!graph || !session) return graph;
    removePlannerProfileFromGraph(graph);
    const profileId = "current_user_profile";
    const baseX = -220;
    const baseY = 80;
    graph.nodes.push({
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
        planner_mode: session.mode || session.stage || "collect",
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
      graph.nodes.push({
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
      graph.edges.push({ id: createId("edge"), from: profileId, to: nodeId, label: "HAS_CONSTRAINT", notes: "", confidence: 0.82 });
      row += 1;
    });

    Object.entries(session.preferences || {}).forEach(([key, value]) => {
      const nodeId = `${profileId}_preference_${key}`;
      const valueText = Array.isArray(value) ? value.map(displayPlannerValue).join(", ") : displayPlannerValue(value);
      graph.nodes.push({
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
      graph.edges.push({ id: createId("edge"), from: profileId, to: nodeId, label: "HAS_PREFERENCE", notes: "", confidence: 0.8 });
      row += 1;
    });

    return graph;
  }

  window.RealworldPlannerProfile = {
    displayPlannerValue,
    preferenceLabel,
    constraintOperator,
    buildConstraintTitle,
    buildProfileSummary,
    removePlannerProfileFromGraph,
    syncPlannerProfileToGraph,
  };
})();
