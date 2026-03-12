(function () {
  const DISPLAY_LABELS = {
    hub_icn: "인천(ICN)",
    hub_pus: "부산/김해(PUS)",
    theme_food: "미식",
    theme_shopping: "쇼핑",
    theme_onsen: "온천",
    theme_history: "역사/전통",
    theme_nightlife: "야경/밤거리",
    theme_nature: "자연",
  };

  const THEME_KEYWORDS = {
    theme_food: ["미식", "먹방", "맛집", "음식", "food", "gourmet"],
    theme_shopping: ["쇼핑", "shopping", "브랜드", "면세"],
    theme_onsen: ["온천", "onsen", "스파"],
    theme_history: ["역사", "사찰", "전통", "문화재", "historic"],
    theme_nightlife: ["야경", "밤", "술", "나이트", "nightlife"],
    theme_nature: ["자연", "풍경", "등산", "하이킹", "nature"],
  };

  const ORIGIN_KEYWORDS = {
    hub_icn: ["인천", "icn", "incheon"],
    hub_pus: ["부산", "김해", "pus", "busan", "gimhae"],
  };

  const PACE_KEYWORDS = {
    slow: ["여유", "천천히", "느긋", "힐링"],
    balanced: ["적당", "균형", "무난"],
    packed: ["빡빡", "최대한", "많이", "타이트"],
  };

  const LEVEL_KEYWORDS = {
    high: ["높게", "많이", "강하게", "최대한"],
    medium: ["적당히", "중간", "무난"],
    low: ["낮게", "적게", "조용히"],
  };

  const DEFAULT_YEAR = 2026;

  function createSession(sessionId) {
    const now = new Date().toISOString();
    return {
      id: sessionId || `local_session_${Math.random().toString(36).slice(2, 10)}`,
      status: "active",
      stage: "city",
      constraints: {},
      preferences: {},
      selectedCityId: "",
      selectedTransportId: "",
      selectedStayId: "",
      selectedActivityIds: [],
      optionState: {},
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  function runPlanner(graph, session, query) {
    const nextSession = clone(session || createSession());
    if (query) {
      updateSessionFromQuery(graph, nextSession, query);
    }
    const result = planNextStep(graph, nextSession);
    result.session = nextSession;
    return result;
  }

  function updateSessionFromQuery(graph, session, query) {
    const now = new Date().toISOString();
    session.updatedAt = now;
    session.messages.push({ role: "user", text: query, at: now });
    const normalized = parseConstraintsFromQuery(query, graph);
    if (normalized.reset) {
      const fresh = createSession(session.id);
      Object.keys(session).forEach((key) => delete session[key]);
      Object.assign(session, fresh);
      const cleaned = query.replaceAll("새 플랜", "").replaceAll("다시", "").trim();
      if (cleaned) {
        const afterReset = parseConstraintsFromQuery(cleaned, graph);
        mergeNormalizedIntoSession(session, afterReset);
      }
      return;
    }
    mergeNormalizedIntoSession(session, normalized);
    applySelectionFromQuery(session, query);
  }

  function mergeNormalizedIntoSession(session, normalized) {
    Object.assign(session.constraints, normalized.constraints);
    Object.entries(normalized.preferences).forEach(([key, value]) => {
      if (key === "themes") {
        const merged = new Set(session.preferences.themes || []);
        value.forEach((item) => merged.add(item));
        session.preferences.themes = Array.from(merged);
      } else {
        session.preferences[key] = value;
      }
    });
  }

  function parseConstraintsFromQuery(query, graph) {
    const lower = query.toLowerCase();
    const result = {
      constraints: {},
      preferences: {},
      reset: ["새 플랜", "처음부터", "다시 시작", "reset"].some((item) => lower.includes(item)),
    };

    Object.entries(ORIGIN_KEYWORDS).some(([origin, keywords]) => {
      if (keywords.some((item) => lower.includes(item))) {
        result.constraints.origin = origin;
        return true;
      }
      return false;
    });

    const departAfter = parseDateTimeConstraint(query, true, false);
    if (departAfter) result.constraints.depart_after = departAfter;
    const returnBefore = parseDateTimeConstraint(query, false, true);
    if (returnBefore) result.constraints.return_depart_before = returnBefore;

    const budget = parseBudget(query);
    if (budget !== null) result.constraints.total_budget_max = budget;
    const nights = parseNights(query);
    if (nights) {
      result.constraints.nights_min = nights;
      result.constraints.nights_max = nights;
    }
    const avoidAreas = parseAvoidAreas(query, graph);
    if (avoidAreas.length) result.constraints.must_avoid_area = avoidAreas;

    const themes = parseThemes(lower);
    if (themes.length) result.preferences.themes = themes;
    const pace = parseKeywordValue(lower, PACE_KEYWORDS);
    if (pace) result.preferences.pace = pace;
    if (lower.includes("쇼핑")) result.preferences.shopping_level = parseLevel(lower);
    if (lower.includes("온천")) result.preferences.onsen_level = parseLevel(lower);
    if (["야경", "밤", "나이트"].some((item) => lower.includes(item))) result.preferences.nightlife_level = parseLevel(lower);
    if (["자연", "풍경", "하이킹"].some((item) => lower.includes(item))) result.preferences.nature_level = parseLevel(lower);
    if (["미식", "먹방", "맛집", "음식"].some((item) => lower.includes(item))) result.preferences.food_budget_level = parseLevel(lower);
    return result;
  }

  function parseDateTimeConstraint(query, isAfter, isReturnContext) {
    const lower = query.toLowerCase();
    if (isAfter && !lower.includes("이후")) return "";
    if (!isAfter && !lower.includes("이전")) return "";
    const segments = query.split(/,|\n| 그리고 | and /).map((item) => item.trim()).filter(Boolean);
    const patterns = [
      /(?<month>\d{1,2})\s*[/-]\s*(?<day>\d{1,2})\s*(?:일)?\s*(?<hour>\d{1,2})\s*시/,
      /(?<month>\d{1,2})\s*월\s*(?<day>\d{1,2})\s*일?\s*(?<hour>\d{1,2})\s*시/,
      /(?<day>\d{1,2})\s*일\s*(?<hour>\d{1,2})\s*시/,
    ];

    for (const segment of segments.length ? segments : [query]) {
      const segmentLower = segment.toLowerCase();
      const hasReturnContext = ["귀국", "복귀", "일본에서", "돌아"].some((item) => segmentLower.includes(item));
      if (isReturnContext && !hasReturnContext) continue;
      if (!isReturnContext && hasReturnContext) continue;
      if (isAfter && !segmentLower.includes("이후")) continue;
      if (!isAfter && !segmentLower.includes("이전")) continue;
      for (const pattern of patterns) {
        const match = segment.match(pattern);
        if (!match || !match.groups) continue;
        const month = Number(match.groups.month || 3);
        const day = Number(match.groups.day);
        const hour = Number(match.groups.hour);
        return new Date(Date.UTC(DEFAULT_YEAR, month - 1, day, hour - 9, 0, 0)).toISOString();
      }
    }
    return "";
  }

  function parseBudget(query) {
    const match =
      query.match(/(?:최대\s*(?:경비|예산)|예산\s*최대|예산|경비)\s*([0-9][0-9,]*)\s*(만원|원)?/) ||
      query.match(/([0-9][0-9,]*)\s*(만원|원)\s*(?:이하|까지|내)/);
    if (!match) return null;
    const raw = Number(String(match[1]).replaceAll(",", ""));
    return match[2] === "만원" ? raw * 10000 : raw;
  }

  function parseNights(query) {
    const match = query.match(/(\d+)\s*박/);
    return match ? Number(match[1]) : 0;
  }

  function parseAvoidAreas(query, graph) {
    const lower = query.toLowerCase();
    if (!["제외", "피하고", "avoid"].some((item) => lower.includes(item))) return [];
    return graph.nodes
      .filter((node) => ["City", "Region", "District"].includes(node.type))
      .filter((node) => lower.includes(String(node.title || "").toLowerCase()))
      .map((node) => node.id);
  }

  function parseThemes(lower) {
    return Object.entries(THEME_KEYWORDS)
      .filter(([, keywords]) => keywords.some((item) => lower.includes(item)))
      .map(([theme]) => theme);
  }

  function parseKeywordValue(lower, source) {
    return Object.entries(source).find(([, keywords]) => keywords.some((item) => lower.includes(item)))?.[0] || "";
  }

  function parseLevel(lower) {
    return parseKeywordValue(lower, LEVEL_KEYWORDS) || "medium";
  }

  function applySelectionFromQuery(session, query) {
    const choice = parseChoice(query);
    if (choice !== null) {
      const key = `${session.stage}_options`;
      const options = session.optionState[key] || [];
      const selected = options[choice - 1];
      if (selected) {
        if (session.stage === "city") session.selectedCityId = selected.cityId;
        if (session.stage === "transport") session.selectedTransportId = selected.transportBundleId;
        if (session.stage === "stay") session.selectedStayId = selected.stayId;
        if (session.stage === "activity" && !session.selectedActivityIds.includes(selected.activityId)) {
          session.selectedActivityIds.push(selected.activityId);
        }
      }
    }
    const lower = query.toLowerCase();
    if (session.stage === "city") {
      for (const option of session.optionState.city_options || []) {
        if (option.title && lower.includes(option.title.toLowerCase())) {
          session.selectedCityId = option.cityId;
          break;
        }
      }
    }
    if (session.stage === "stay") {
      for (const option of session.optionState.stay_options || []) {
        if (option.title && lower.includes(option.title.toLowerCase())) {
          session.selectedStayId = option.stayId;
          break;
        }
      }
    }
  }

  function parseChoice(query) {
    const indexed = query.match(/(\d+)\s*번/);
    if (indexed) return Number(indexed[1]);
    if (/^\d+$/.test(query.trim())) return Number(query.trim());
    return null;
  }

  function planNextStep(graph, session) {
    const index = buildIndex(graph);
    const candidates = generateCandidatePlans(index, session);
    if (!candidates.length) {
      return {
        answer: "조건을 만족하는 기본 후보가 아직 없다. 출발지, 출발 가능 시각, 일본 출발 제한, 예산을 더 구체적으로 넣어줘.",
        stage: "collect",
        recommendations: [],
        alternatives: [],
        next_question: "예: 인천에서 3/22 18시 이후 출발, 일본에서 3/24 19시 이전 출발, 최대 예산 60만원",
        focusNodeIds: [],
      };
    }

    if (!session.selectedCityId) {
      session.stage = "city";
      const cityOptions = candidates.slice(0, 3).map((candidate) => ({
        cityId: candidate.cityId,
        title: candidate.cityTitle,
        estimatedTotalKrw: candidate.estimatedTotalKrw,
        conflicts: candidate.conflicts,
        score: candidate.score,
      }));
      session.optionState.city_options = cityOptions;
      return {
        answer: renderCityPrompt(session, cityOptions, candidates),
        stage: "city",
        recommendations: candidates.slice(0, 2),
        alternatives: candidates.slice(2, 4),
        next_question: "도시 번호를 골라줘. 추가 제약이나 테마를 더 넣어도 된다.",
        focusNodeIds: candidates.slice(0, 3).flatMap((item) => item.usedNodeIds),
      };
    }

    const selectedCandidate = candidates.find((item) => item.cityId === session.selectedCityId) || candidates[0];
    const transportOptions = buildTransportOptions(selectedCandidate);
    session.optionState.transport_options = transportOptions;
    if (!session.selectedTransportId) {
      session.stage = "transport";
      if (transportOptions.length <= 1) {
        session.selectedTransportId = transportOptions[0]?.transportBundleId || "";
      } else {
        return {
          answer: renderTransportPrompt(selectedCandidate, transportOptions),
          stage: "transport",
          recommendations: [selectedCandidate],
          alternatives: candidates.slice(1, 3),
          next_question: "이동 조합 번호를 골라줘.",
          focusNodeIds: selectedCandidate.usedNodeIds,
        };
      }
    }

    const stayOptions = buildStayOptions(selectedCandidate);
    session.optionState.stay_options = stayOptions;
    if (!session.selectedStayId) {
      session.stage = "stay";
      if (stayOptions.length <= 1) {
        session.selectedStayId = stayOptions[0]?.stayId || "";
      } else {
        return {
          answer: renderStayPrompt(selectedCandidate, stayOptions),
          stage: "stay",
          recommendations: [selectedCandidate],
          alternatives: candidates.slice(1, 3),
          next_question: "숙소 번호를 골라줘.",
          focusNodeIds: selectedCandidate.usedNodeIds,
        };
      }
    }

    const activityOptions = buildActivityOptions(selectedCandidate);
    session.optionState.activity_options = activityOptions;
    if (!session.selectedActivityIds.length) {
      session.stage = "activity";
      return {
        answer: renderActivityPrompt(selectedCandidate, activityOptions),
        stage: "activity",
        recommendations: [selectedCandidate],
        alternatives: candidates.slice(1, 3),
        next_question: "활동 번호를 하나 이상 골라줘. 바로 정리하려면 '최종 정리'라고 입력해도 된다.",
        focusNodeIds: selectedCandidate.usedNodeIds,
      };
    }

    session.stage = "summary";
    return {
      answer: renderSummary(selectedCandidate, session),
      stage: "summary",
      recommendations: [selectedCandidate],
      alternatives: candidates.slice(1, 3),
      next_question: "새 제약을 추가하거나 '새 플랜'으로 다시 시작할 수 있다.",
      focusNodeIds: selectedCandidate.usedNodeIds,
    };
  }

  function buildIndex(graph) {
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const outgoing = new Map();
    const incoming = new Map();
    for (const edge of graph.edges) {
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      if (!incoming.has(edge.to)) incoming.set(edge.to, []);
      outgoing.get(edge.from).push(edge);
      incoming.get(edge.to).push(edge);
    }
    return { nodesById, outgoing, incoming };
  }

  function generateCandidatePlans(index, session) {
    const origin = session.constraints.origin || "hub_icn";
    const avoidSet = new Set(session.constraints.must_avoid_area || []);
    const themes = session.preferences.themes || [];
    const departAfter = parseIsoDate(session.constraints.depart_after);
    const returnBefore = parseIsoDate(session.constraints.return_depart_before);
    const budget = session.constraints.total_budget_max || null;

    const cities = Array.from(index.nodesById.values()).filter((node) => node.type === "City" && !avoidSet.has(node.id));
    const candidates = cities
      .map((city) => evaluateCityCandidate(index, city, origin, themes, departAfter, returnBefore, budget))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return candidates.slice(0, 6);
  }

  function evaluateCityCandidate(index, city, origin, themes, departAfter, returnBefore, budget) {
    const hubIds = cityHubs(index, city.id);
    const outbound = selectTransport(index, origin, hubIds, departAfter, null, "outbound");
    const inbound = selectTransport(index, origin, hubIds, null, returnBefore, "return");
    const stays = selectStays(index, city.id);
    const activities = selectActivities(index, city.id, themes);
    const conflicts = [];

    if (!outbound) conflicts.push("출발 조건을 만족하는 국제 이동편이 부족함");
    if (!inbound) conflicts.push("귀국 시각 조건을 만족하는 복귀편이 부족함");
    if (!stays.length) conflicts.push("숙소 가격 근거가 부족함");

    const outboundPrice = outbound?.priceKrw || 0;
    const inboundPrice = inbound?.priceKrw || 0;
    const stayPrice = stays[0]?.priceKrw || 0;
    const activityBudget = activities.slice(0, 2).reduce((sum, item) => sum + (item.typicalBudgetKrw || 0), 0);
    const total = outboundPrice + inboundPrice + stayPrice + activityBudget;
    if (budget !== null && total > budget) {
      conflicts.push(`총액 추정 ${formatKrw(total)}이 예산 상한 ${formatKrw(budget)}을 초과함`);
    }

    const themeScore = themeFitScore(index, city.id, themes);
    const trustScore = average([confidence(city), confidence(outbound?.node), confidence(inbound?.node), confidence(stays[0]?.node)].filter((item) => item > 0));
    const freshness = average([freshnessBonus(outbound?.node), freshnessBonus(inbound?.node), freshnessBonus(stays[0]?.node)].filter((item) => item > 0));
    let score = 100 + themeScore * 9 + trustScore * 8 + freshness * 4 - conflicts.length * 26;
    if (outbound) score -= (outbound.durationMinutes || 0) / 180;
    if (inbound) score -= (inbound.durationMinutes || 0) / 180;
    if (budget) score -= Math.max(total - budget, 0) / 30000;

    const usedNodeIds = new Set([city.id]);
    if (outbound) {
      usedNodeIds.add(outbound.node.id);
      outbound.observationIds.forEach((item) => usedNodeIds.add(item));
    }
    if (inbound) {
      usedNodeIds.add(inbound.node.id);
      inbound.observationIds.forEach((item) => usedNodeIds.add(item));
    }
    if (stays[0]) {
      usedNodeIds.add(stays[0].node.id);
      stays[0].observationIds.forEach((item) => usedNodeIds.add(item));
    }
    activities.slice(0, 2).forEach((item) => usedNodeIds.add(item.node.id));

    return {
      id: `candidate_${city.id}`,
      cityId: city.id,
      cityTitle: city.title,
      title: city.title,
      score: round(score),
      status: conflicts.length ? "partial" : "ready",
      estimatedTotalKrw: total,
      conflicts,
      themes: cityThemeTitles(index, city.id),
      outbound: simplifyTransportChoice(outbound),
      returnTrip: simplifyTransportChoice(inbound),
      stayOptions: stays,
      activityOptions: activities,
      usedNodeIds: Array.from(usedNodeIds),
      reason: summarizeCandidateReason(city, themeScore, total, conflicts),
    };
  }

  function cityHubs(index, cityId) {
    return dedupe(
      outgoing(index, cityId)
        .filter((edge) => edge.label === "HAS_TRANSIT_HUB" || edge.label === "NEAR" || edge.label === "CONNECTED_TO")
        .map((edge) => edge.to)
    );
  }

  function selectTransport(index, origin, hubIds, after, before, direction) {
    const options = [];
    for (const node of index.nodesById.values()) {
      if (node.type !== "TransportOption") continue;
      const props = node.properties || {};
      const fromRef = String(props.from_ref || "");
      const toRef = String(props.to_ref || "");
      const routeMatches =
        direction === "outbound" ? fromRef === origin && hubIds.includes(toRef) : toRef === origin && hubIds.includes(fromRef);
      if (!routeMatches) continue;
      const observations = subjectObservations(index, node.id);
      for (const observation of observations) {
        const value = observation?.properties?.value || {};
        const departAt = parseIsoDate(value.depart_at);
        if (after && (!departAt || departAt < after)) continue;
        if (before && (!departAt || departAt > before)) continue;
        options.push({
          node,
          observation,
          priceKrw: Number(value.price_krw || 0),
          durationMinutes: Number(value.duration_minutes || 0),
          departAt: value.depart_at || "",
          arriveAt: value.arrive_at || "",
          label: value.label || node.title,
          observationIds: observation ? [observation.id] : [],
        });
      }
    }
    options.sort((a, b) => (a.priceKrw - b.priceKrw) || String(a.departAt).localeCompare(String(b.departAt)));
    return options[0] || null;
  }

  function simplifyTransportChoice(choice) {
    if (!choice) return null;
    return {
      transportId: choice.node.id,
      title: choice.node.title,
      label: choice.label,
      mode: choice.node.properties?.mode || "",
      priceKrw: choice.priceKrw,
      departAt: choice.departAt,
      arriveAt: choice.arriveAt,
      durationMinutes: choice.durationMinutes,
    };
  }

  function selectStays(index, cityId) {
    const validPlaces = new Set([cityId]);
    outgoing(index, cityId)
      .filter((edge) => edge.label === "CONTAINS")
      .forEach((edge) => validPlaces.add(edge.to));
    const results = [];
    for (const node of index.nodesById.values()) {
      if (!["Lodging", "StayOption"].includes(node.type)) continue;
      const placeRef = String(node.properties?.place_ref || "");
      if (!validPlaces.has(placeRef)) continue;
      const firstObservation = subjectObservations(index, node.id)[0];
      const value = firstObservation?.properties?.value || {};
      results.push({
        stayId: node.id,
        title: node.title,
        priceKrw: Number(value.price_krw || node.latest_values?.price_krw || 0),
        node,
        observationIds: firstObservation ? [firstObservation.id] : [],
        budgetLevel: node.properties?.price_band_krw || "",
      });
    }
    return results.sort((a, b) => (a.priceKrw - b.priceKrw) || a.title.localeCompare(b.title)).slice(0, 3);
  }

  function selectActivities(index, cityId, preferredThemes) {
    const validPlaces = new Set([cityId]);
    outgoing(index, cityId)
      .filter((edge) => edge.label === "CONTAINS")
      .forEach((edge) => validPlaces.add(edge.to));
    const results = [];
    for (const node of index.nodesById.values()) {
      if (!["Attraction", "Restaurant", "ActivityOption"].includes(node.type)) continue;
      const placeRef = String(node.properties?.place_ref || "");
      if (!validPlaces.has(placeRef)) continue;
      const matchedThemes = outgoing(index, node.id).filter((edge) => edge.label === "MATCHES_THEME").map((edge) => edge.to);
      const overlap = matchedThemes.filter((item) => preferredThemes.includes(item)).length;
      results.push({
        activityId: node.id,
        title: node.title,
        node,
        matchedThemes,
        score: overlap * 10 + confidence(node),
        typicalBudgetKrw: Number(node.properties?.typical_budget_krw || node.properties?.meal_budget_krw || 0),
      });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  function subjectObservations(index, subjectId) {
    return outgoing(index, subjectId)
      .filter((edge) => edge.label === "SUPPORTED_BY")
      .map((edge) => index.nodesById.get(edge.to))
      .filter((node) => node?.type === "Observation")
      .sort((a, b) => String(b.properties?.observed_at || "").localeCompare(String(a.properties?.observed_at || "")));
  }

  function themeFitScore(index, cityId, preferredThemes) {
    if (!preferredThemes.length) return 1;
    const matched = new Set();
    outgoing(index, cityId)
      .filter((edge) => edge.label === "MATCHES_THEME")
      .forEach((edge) => matched.add(edge.to));
    outgoing(index, cityId)
      .filter((edge) => ["HAS_ATTRACTION", "HAS_RESTAURANT", "HAS_EVENT", "HAS_LODGING"].includes(edge.label))
      .forEach((edge) => {
        outgoing(index, edge.to)
          .filter((subEdge) => subEdge.label === "MATCHES_THEME")
          .forEach((subEdge) => matched.add(subEdge.to));
      });
    return preferredThemes.filter((item) => matched.has(item)).length / Math.max(preferredThemes.length, 1);
  }

  function cityThemeTitles(index, cityId) {
    return outgoing(index, cityId)
      .filter((edge) => edge.label === "MATCHES_THEME")
      .map((edge) => displayLabel(edge.to));
  }

  function buildTransportOptions(candidate) {
    if (!candidate.outbound || !candidate.returnTrip) return [];
    return [{
      transportBundleId: `bundle_${candidate.cityId}`,
      title: `${candidate.cityTitle} 기본 이동안`,
      outbound: candidate.outbound,
      returnTrip: candidate.returnTrip,
      transportTotalKrw: Number(candidate.outbound.priceKrw || 0) + Number(candidate.returnTrip.priceKrw || 0),
    }];
  }

  function buildStayOptions(candidate) {
    return candidate.stayOptions || [];
  }

  function buildActivityOptions(candidate) {
    return candidate.activityOptions || [];
  }

  function renderCityPrompt(session, cityOptions, candidates) {
    const lines = [
      "현재 제약을 반영해 먼저 도시 후보를 좁혔다.",
      renderConstraintSummary(session.constraints, session.preferences),
      "",
    ];
    cityOptions.forEach((option, index) => {
      lines.push(
        `${index + 1}. ${option.title} · 예상총액 ${formatKrw(option.estimatedTotalKrw)} · score ${option.score} · ${option.conflicts.length ? option.conflicts.join(" / ") : "하드 제약 충돌 없음"}`
      );
    });
    lines.push("");
    lines.push(`현재 추천: ${candidates[0].cityTitle} - ${candidates[0].reason}`);
    return lines.join("\n");
  }

  function renderTransportPrompt(candidate, transportOptions) {
    const lines = [`${candidate.cityTitle}로 좁혔다. 이제 이동 조합을 고른다.`, ""];
    transportOptions.forEach((option, index) => {
      lines.push(
        `${index + 1}. 왕복 이동 ${formatKrw(option.transportTotalKrw)} / 출발 ${formatShortDate(option.outbound.departAt)} / 귀국 ${formatShortDate(option.returnTrip.departAt)}`
      );
    });
    lines.push("");
    lines.push(`현재 추천: ${candidate.cityTitle} 기본 이동안`);
    return lines.join("\n");
  }

  function renderStayPrompt(candidate, stayOptions) {
    const lines = [`${candidate.cityTitle} 이동안이 잡혔다. 숙소 후보를 고른다.`, ""];
    stayOptions.forEach((option, index) => {
      lines.push(`${index + 1}. ${option.title} · 1박 추정 ${formatKrw(option.priceKrw)}`);
    });
    lines.push("");
    lines.push("현재 추천: 최신 관측값이 있는 가성비 숙소");
    return lines.join("\n");
  }

  function renderActivityPrompt(candidate, activityOptions) {
    const lines = [`${candidate.cityTitle}에서 마지막으로 활동 축을 정한다.`, ""];
    activityOptions.slice(0, 4).forEach((option, index) => {
      lines.push(
        `${index + 1}. ${option.title} · 예상소비 ${formatKrw(option.typicalBudgetKrw)} · 테마 ${option.matchedThemes.map(displayLabel).join(", ") || "일반"}`
      );
    });
    lines.push("");
    lines.push("현재 추천: 상위 2개 활동을 묶어 하루 동선으로 구성");
    return lines.join("\n");
  }

  function renderSummary(candidate, session) {
    const transport = (session.optionState.transport_options || []).find((item) => item.transportBundleId === session.selectedTransportId);
    const stay = (session.optionState.stay_options || []).find((item) => item.stayId === session.selectedStayId);
    const activities = (session.optionState.activity_options || [])
      .filter((item) => session.selectedActivityIds.includes(item.activityId))
      .map((item) => item.title);
    const lines = [
      `현재 플랜 요약: ${candidate.cityTitle}`,
      `- 이동: ${transport?.title || "기본 이동안"}`,
      `- 숙소: ${stay?.title || "미선택"}`,
      `- 활동: ${activities.length ? activities.join(", ") : "현지 자유시간 중심"}`,
      `- 예상 총액: ${formatKrw(candidate.estimatedTotalKrw)}`,
      `- 테마: ${candidate.themes.length ? candidate.themes.join(", ") : "일반 단기여행"}`,
      `- ${candidate.conflicts.length ? `남은 충돌: ${candidate.conflicts.join(" / ")}` : "남은 하드 충돌 없음"}`,
      "",
      "대안 비교는 채팅에 새 제약을 추가하거나 '새 플랜'으로 다시 시작하면 된다.",
    ];
    return lines.join("\n");
  }

  function renderConstraintSummary(constraints, preferences) {
    const parts = [];
    if (constraints.origin) parts.push(`출발지 ${displayLabel(constraints.origin)}`);
    if (constraints.depart_after) parts.push(`출발 가능 ${formatShortDate(constraints.depart_after)} 이후`);
    if (constraints.return_depart_before) parts.push(`일본 출발 ${formatShortDate(constraints.return_depart_before)} 이전`);
    if (constraints.total_budget_max) parts.push(`예산 상한 ${formatKrw(constraints.total_budget_max)}`);
    if (preferences.themes?.length) parts.push(`테마 ${preferences.themes.map(displayLabel).join(", ")}`);
    return parts.join(" / ") || "아직 명시 제약이 적어서 일반 추천 폭이 넓다.";
  }

  function summarizeCandidateReason(city, themeScore, total, conflicts) {
    const parts = [`${city.title}는 기본 총액이 ${formatKrw(total)} 수준이다.`];
    if (themeScore > 0) parts.push("요청한 테마와 맞는 노드 연결이 있다.");
    if (conflicts.length) {
      parts.push(`제약 충돌: ${conflicts.slice(0, 2).join(", ")}`);
    } else {
      parts.push("현재 제약 기준으로 큰 충돌이 없다.");
    }
    return parts.join(" ");
  }

  function outgoing(index, nodeId) {
    return index.outgoing.get(nodeId) || [];
  }

  function confidence(node) {
    return Number(node?.evidence_summary?.trust_score || node?.confidence || 0.75);
  }

  function freshnessBonus(node) {
    const lastObservedAt = node?.evidence_summary?.last_observed_at || "";
    if (!lastObservedAt) return 0;
    const date = parseIsoDate(lastObservedAt);
    if (!date) return 0;
    const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 3) return 2.6;
    if (diffDays <= 14) return 1.8;
    if (diffDays <= 45) return 1.0;
    return 0.2;
  }

  function parseIsoDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatShortDate(value) {
    const date = parseIsoDate(value);
    if (!date) return value || "-";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }).format(date);
  }

  function formatKrw(value) {
    return `${Number(value || 0).toLocaleString("ko-KR")}원`;
  }

  function displayLabel(value) {
    return DISPLAY_LABELS[value] || value;
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function average(values) {
    return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;
  }

  function dedupe(values) {
    return Array.from(new Set(values));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  window.StaticPlanner = {
    createSession,
    runPlanner,
  };
})();
