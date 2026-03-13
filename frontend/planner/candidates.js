(function () {
  const C = window.RealworldPlannerConstants;
  const GraphUtils = window.RealworldGraphUtils;

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
    return { nodesById, outgoing, incoming, graph };
  }

  function outgoing(index, nodeId) {
    return index.outgoing.get(nodeId) || [];
  }

  function incoming(index, nodeId) {
    return index.incoming.get(nodeId) || [];
  }

  function parseIsoDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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

  function subjectObservations(index, subjectId) {
    return outgoing(index, subjectId)
      .filter((edge) => edge.label === "SUPPORTED_BY")
      .map((edge) => index.nodesById.get(edge.to))
      .filter((node) => node?.type === "Observation")
      .sort((a, b) => String(b.properties?.observed_at || "").localeCompare(String(a.properties?.observed_at || "")));
  }

  function selectTransport(index, origin, hubIds, after, before, direction) {
    const options = [];
    for (const node of index.nodesById.values()) {
      if (node.type !== "TransportOption") continue;
      const props = node.properties || {};
      const fromRef = String(props.from_ref || "");
      const toRef = String(props.to_ref || "");
      const routeMatches = direction === "outbound" ? fromRef === origin && hubIds.includes(toRef) : toRef === origin && hubIds.includes(fromRef);
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
      observationIds: choice.observationIds || [],
    };
  }

  function cityScopeIds(index, cityId) {
    const validPlaces = new Set([cityId]);
    outgoing(index, cityId)
      .filter((edge) => edge.label === "CONTAINS")
      .forEach((edge) => validPlaces.add(edge.to));
    return validPlaces;
  }

  function selectStays(index, cityId) {
    const validPlaces = cityScopeIds(index, cityId);
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
        notes: node.notes || "",
      });
    }
    return results.sort((a, b) => (a.priceKrw - b.priceKrw) || a.title.localeCompare(b.title)).slice(0, 4);
  }

  function selectActivities(index, cityId, preferredThemes) {
    const validPlaces = cityScopeIds(index, cityId);
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
        score: overlap * 10 + confidence(node) + freshnessBonus(node),
        typicalBudgetKrw: Number(node.properties?.typical_budget_krw || node.properties?.meal_budget_krw || 0),
        notes: node.notes || "",
      });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  function cityHubs(index, cityId) {
    return C.dedupe(
      outgoing(index, cityId)
        .filter((edge) => edge.label === "HAS_TRANSIT_HUB" || edge.label === "NEAR" || edge.label === "CONNECTED_TO")
        .map((edge) => edge.to)
    );
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
      .map((edge) => C.displayLabel(edge.to));
  }

  function summarizeCandidateReason(city, themeScore, total, conflicts) {
    const parts = [`${city.title}는 기본 총액이 ${C.formatKrw(total)} 수준이다.`];
    if (themeScore > 0) parts.push("요청한 테마와 맞는 노드 연결이 있다.");
    if (conflicts.length) parts.push(`제약 충돌: ${conflicts.slice(0, 2).join(", ")}`);
    else parts.push("현재 제약 기준으로 큰 충돌이 없다.");
    return parts.join(" ");
  }

  function transportSummary(outbound, inbound) {
    if (!outbound || !inbound) return "이동 근거 부족";
    const mode = outbound?.node?.properties?.mode === "ferry" ? "배편" : "항공";
    return `${mode} 왕복 / 출발 ${C.formatShortDate(outbound.departAt)} / 귀국 ${C.formatShortDate(inbound.departAt)} / 교통 ${C.formatKrw((outbound.priceKrw || 0) + (inbound.priceKrw || 0))}`;
  }

  function ensureSelectedState(candidate) {
    candidate.selectedStayId = candidate.selectedStayId || candidate.stayOptions?.[0]?.stayId || "";
    candidate.selectedActivityIds = Array.isArray(candidate.selectedActivityIds) && candidate.selectedActivityIds.length
      ? C.dedupe(candidate.selectedActivityIds)
      : (candidate.activityOptions || []).slice(0, 2).map((item) => item.activityId);
    return candidate;
  }

  function resolveSelectedStay(candidate) {
    ensureSelectedState(candidate);
    return candidate.stayOptions.find((item) => item.stayId === candidate.selectedStayId) || candidate.stayOptions[0] || null;
  }

  function resolveSelectedActivities(candidate) {
    ensureSelectedState(candidate);
    const byId = new Map((candidate.activityOptions || []).map((item) => [item.activityId, item]));
    const resolved = candidate.selectedActivityIds.map((id) => byId.get(id)).filter(Boolean);
    return resolved.length ? resolved : (candidate.activityOptions || []).slice(0, 2);
  }

  function refreshCandidateSelections(candidate) {
    ensureSelectedState(candidate);
    const stay = resolveSelectedStay(candidate);
    const activities = resolveSelectedActivities(candidate);
    candidate.primaryStayTitle = stay?.title || "";
    candidate.stayPriceKrw = stay?.priceKrw || 0;
    candidate.activityTitles = activities.map((item) => item.title);
    candidate.selectedActivities = activities;
    const transportTotal = Number(candidate.outbound?.priceKrw || 0) + Number(candidate.returnTrip?.priceKrw || 0);
    const activityTotal = activities.reduce((sum, item) => sum + Number(item.typicalBudgetKrw || 0), 0);
    candidate.estimatedTotalKrw = transportTotal + Number(stay?.priceKrw || 0) + activityTotal;
    const usedNodeIds = new Set([candidate.cityId]);
    if (candidate.outbound?.transportId) usedNodeIds.add(candidate.outbound.transportId);
    (candidate.outbound?.observationIds || []).forEach((id) => usedNodeIds.add(id));
    if (candidate.returnTrip?.transportId) usedNodeIds.add(candidate.returnTrip.transportId);
    (candidate.returnTrip?.observationIds || []).forEach((id) => usedNodeIds.add(id));
    if (stay) {
      usedNodeIds.add(stay.stayId);
      (stay.observationIds || []).forEach((id) => usedNodeIds.add(id));
    }
    activities.forEach((item) => usedNodeIds.add(item.activityId));
    (candidate.evidenceNodeIds || []).forEach((id) => usedNodeIds.add(id));
    candidate.usedNodeIds = Array.from(usedNodeIds);
    return candidate;
  }

  function evaluateCityCandidate(index, city, origin, themes, departAfter, returnBefore, budget, destinationPreferences, activityPreferences, preferences) {
    const hubIds = cityHubs(index, city.id);
    const outbound = selectTransport(index, origin, hubIds, departAfter, null, "outbound");
    const inbound = selectTransport(index, origin, hubIds, null, returnBefore, "return");
    const stays = selectStays(index, city.id);
    const activities = selectActivities(index, city.id, themes);
    const conflicts = [];

    if (!outbound) conflicts.push("출발 조건을 만족하는 국제 이동편이 부족함");
    if (!inbound) conflicts.push("귀국 시각 조건을 만족하는 복귀편이 부족함");
    if (!stays.length) conflicts.push("숙소 가격 근거가 부족함");

    const draft = {
      id: `candidate_${city.id}`,
      cityId: city.id,
      cityTitle: city.title,
      title: `${city.title} 미니 플랜`,
      status: conflicts.length ? "partial" : "ready",
      conflicts,
      themes: cityThemeTitles(index, city.id),
      outbound: simplifyTransportChoice(outbound),
      returnTrip: simplifyTransportChoice(inbound),
      stayOptions: stays,
      activityOptions: activities,
      routeMode: outbound?.node?.properties?.mode || "",
      routeModeLabel: outbound?.node?.properties?.mode === "ferry" ? "배편" : "항공",
      travelMinutes: Number(outbound?.durationMinutes || 0) + Number(inbound?.durationMinutes || 0),
      evidenceNodeIds: [
        ...(outbound?.observationIds || []),
        ...(inbound?.observationIds || []),
        ...(stays[0]?.observationIds || []),
      ],
      selectedActivityIds: activities.slice(0, 2).map((item) => item.activityId),
      selectedStayId: stays[0]?.stayId || "",
      inlineEdits: [],
      reason: "",
    };
    refreshCandidateSelections(draft);

    if (budget !== null && draft.estimatedTotalKrw > budget) {
      conflicts.push(`총액 추정 ${C.formatKrw(draft.estimatedTotalKrw)}이 예산 상한 ${C.formatKrw(budget)}을 초과함`);
    }

    const themeScore = themeFitScore(index, city.id, themes);
    const trustScore = C.average([confidence(city), confidence(outbound?.node), confidence(inbound?.node), confidence(stays[0]?.node)].filter((item) => item > 0));
    const freshness = C.average([freshnessBonus(outbound?.node), freshnessBonus(inbound?.node), freshnessBonus(stays[0]?.node)].filter((item) => item > 0));
    let score = 100 + themeScore * 9 + trustScore * 8 + freshness * 4 - conflicts.length * 26;
    if (outbound) score -= (outbound.durationMinutes || 0) / 180;
    if (inbound) score -= (inbound.durationMinutes || 0) / 180;
    if (budget) score -= Math.max(draft.estimatedTotalKrw - budget, 0) / 30000;
    if (destinationPreferences.has(city.id)) score += 18;
    if (activityPreferences.size && draft.selectedActivities.some((item) => activityPreferences.has(item.activityId))) score += 8;
    if (preferences.ferry_ok === false && outbound?.node?.properties?.mode === "ferry") score -= 22;
    if (preferences.travel_priority === "time") score -= ((outbound?.durationMinutes || 0) + (inbound?.durationMinutes || 0)) / 60;
    if (preferences.travel_priority === "budget") score -= draft.estimatedTotalKrw / 120000;
    if (preferences.lodging_priority === "value" && stays[0]) score += Math.max(0, 60000 - stays[0].priceKrw) / 8000;
    if (preferences.theme_balance === "shopping" && cityThemeTitles(index, city.id).some((theme) => String(theme).includes("쇼핑"))) score += 7;
    if (preferences.theme_balance === "food" && cityThemeTitles(index, city.id).some((theme) => String(theme).includes("미식"))) score += 7;

    draft.score = C.round(score);
    draft.reason = summarizeCandidateReason(city, themeScore, draft.estimatedTotalKrw, conflicts);
    return draft;
  }

  function mergeCurrentPlanIntoCandidate(candidate, session) {
    if (!session.current_plan || session.current_plan.cityId !== candidate.cityId) return refreshCandidateSelections(candidate);
    const merged = C.clone(candidate);
    const previous = session.current_plan;
    const existingActivities = new Map(merged.activityOptions.map((item) => [item.activityId, item]));
    (previous.activityOptions || []).forEach((item) => {
      if (!existingActivities.has(item.activityId)) merged.activityOptions.push(item);
    });
    const existingStays = new Map(merged.stayOptions.map((item) => [item.stayId, item]));
    (previous.stayOptions || []).forEach((item) => {
      if (!existingStays.has(item.stayId)) merged.stayOptions.push(item);
    });
    merged.selectedActivityIds = (session.selectedActivityIds && session.selectedActivityIds.length)
      ? session.selectedActivityIds.slice()
      : (previous.selectedActivityIds || []).slice();
    merged.selectedStayId = session.selectedStayId || previous.selectedStayId || merged.selectedStayId;
    merged.inlineEdits = (session.inline_edits || []).slice();
    return refreshCandidateSelections(merged);
  }

  function generateCandidatePlans(index, session) {
    const origin = session.constraints.origin || "hub_icn";
    const avoidSet = new Set(session.constraints.must_avoid_area || []);
    const themes = session.preferences.themes || [];
    const destinationPreferences = new Set(session.destinationPreferenceIds || []);
    const activityPreferences = new Set(session.activityPreferenceIds || []);
    const departAfter = parseIsoDate(session.constraints.depart_after);
    const returnBefore = parseIsoDate(session.constraints.return_depart_before);
    const budget = session.constraints.total_budget_max || null;
    const preferences = session.preferences || {};

    return Array.from(index.nodesById.values())
      .filter((node) => node.type === "City" && !avoidSet.has(node.id))
      .map((city) => evaluateCityCandidate(index, city, origin, themes, departAfter, returnBefore, budget, destinationPreferences, activityPreferences, preferences))
      .filter(Boolean)
      .map((candidate) => mergeCurrentPlanIntoCandidate(candidate, session))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }

  function candidateToPlanOption(candidate) {
    return {
      id: candidate.id,
      title: candidate.title,
      cityId: candidate.cityId,
      cityTitle: candidate.cityTitle,
      aliases: Array.from(new Set([candidate.cityId, candidate.cityTitle.toLowerCase(), ...GraphUtils.normalizedTokens(candidate.cityTitle)])),
      estimatedTotalKrw: candidate.estimatedTotalKrw,
      routeMode: candidate.routeMode,
      score: candidate.score,
    };
  }

  function pickCurrentCandidate(session, candidates) {
    if (session.selectedCandidateId) return candidates.find((item) => item.id === session.selectedCandidateId) || null;
    if (session.current_plan?.cityId) return candidates.find((item) => item.cityId === session.current_plan.cityId) || null;
    const preferred = new Set(session.destinationPreferenceIds || []);
    if (preferred.size) return candidates.find((item) => preferred.has(item.cityId)) || null;
    return null;
  }

  function chooseDisambiguationQuestion(candidates, session) {
    const top = candidates.slice(0, 4);
    const questions = [];
    const modes = new Set(top.map((item) => item.routeMode).filter(Boolean));
    if (modes.size > 1 && !Object.prototype.hasOwnProperty.call(session.preferences, "ferry_ok")) {
      const ferryCount = top.filter((item) => item.routeMode === "ferry").length;
      const flightCount = top.filter((item) => item.routeMode === "flight").length;
      questions.push({ kind: "route_mode", question: "비행보다 배도 괜찮아요?", reason: `상위 후보가 항공 ${flightCount}개, 배편 ${ferryCount}개로 갈린다.`, impact: 40 + Math.abs(ferryCount - flightCount) * 6 });
    }
    const travelMinutes = top.map((item) => item.travelMinutes).filter(Boolean);
    const totals = top.map((item) => item.estimatedTotalKrw);
    if (travelMinutes.length && totals.length && !session.preferences.travel_priority) {
      const durationSpread = Math.max(...travelMinutes) - Math.min(...travelMinutes);
      const budgetSpread = Math.max(...totals) - Math.min(...totals);
      if (durationSpread >= 90 || budgetSpread >= 50000) {
        questions.push({ kind: "travel_priority", question: "이동 시간을 줄이는 게 제일 중요해요, 아니면 예산을 더 아끼는 게 중요해요?", reason: `상위 후보의 이동시간 차이가 ${durationSpread}분, 총액 차이가 ${C.formatKrw(budgetSpread)} 수준이다.`, impact: Math.max(durationSpread / 6, budgetSpread / 6000) });
      }
    }
    const stayPrices = top.map((item) => item.stayPriceKrw).filter(Boolean);
    if (stayPrices.length && !session.preferences.lodging_priority) {
      const staySpread = Math.max(...stayPrices) - Math.min(...stayPrices);
      if (staySpread >= 20000) {
        questions.push({ kind: "lodging_priority", question: "숙소는 가성비가 우선인가요, 위치가 우선인가요?", reason: `상위 후보의 숙소 1박 차이가 ${C.formatKrw(staySpread)} 수준이라 숙소 성향에 따라 순위가 달라진다.`, impact: staySpread / 4000 });
      }
    }
    if (!session.preferences.theme_balance && !(session.preferences.themes || []).length) {
      const food = top.filter((item) => item.themes.some((theme) => String(theme).includes("미식"))).length;
      const shopping = top.filter((item) => item.themes.some((theme) => String(theme).includes("쇼핑"))).length;
      if (food && shopping) questions.push({ kind: "theme_balance", question: "쇼핑보다 음식 비중이 더 높아요?", reason: "상위 후보가 미식형과 쇼핑형으로 갈려 있다.", impact: 24 + Math.abs(food - shopping) * 3 });
    }
    questions.sort((a, b) => b.impact - a.impact);
    return questions[0] || null;
  }

  function renderRequirementStatus(key, value) {
    if (key === "origin") return `출발지 ${C.displayLabel(value)}`;
    if (key === "depart_after") return `출발 가능 ${C.formatShortDate(value)} 이후`;
    if (key === "return_depart_before") return `일본 출발 ${C.formatShortDate(value)} 이전`;
    if (key === "total_budget_max") return `예산 상한 ${C.formatKrw(value)}`;
    return `${key} ${value}`;
  }

  function renderConstraintSummary(constraints, preferences) {
    const parts = [];
    if (constraints.origin) parts.push(`출발지 ${C.displayLabel(constraints.origin)}`);
    if (constraints.depart_after) parts.push(`출발 가능 ${C.formatShortDate(constraints.depart_after)} 이후`);
    if (constraints.return_depart_before) parts.push(`일본 출발 ${C.formatShortDate(constraints.return_depart_before)} 이전`);
    if (constraints.total_budget_max) parts.push(`예산 상한 ${C.formatKrw(constraints.total_budget_max)}`);
    if (preferences.themes?.length) parts.push(`테마 ${preferences.themes.map(C.displayLabel.bind(C)).join(", ")}`);
    return parts.join(" / ") || "아직 명시 제약이 적어서 일반 추천 폭이 넓다.";
  }

  function renderCandidateBlurb(candidate, index) {
    const prefix = index ? `${index}. ` : "- ";
    const route = candidate.routeMode === "ferry" ? "배편" : "항공";
    const stay = candidate.primaryStayTitle || "숙소 미정";
    const activities = (candidate.activityTitles || []).slice(0, 2).join(", ") || "현지 자유시간";
    return `${prefix}${candidate.cityTitle} · ${route} · ${stay} · ${activities} · 예상총액 ${C.formatKrw(candidate.estimatedTotalKrw)}`;
  }

  function renderDisambiguationPrompt(candidates, question, session) {
    const lines = ["현재 남은 상위 미니 플랜들을 먼저 비교했다.", renderConstraintSummary(session.constraints, session.preferences), ""];
    candidates.slice(0, 3).forEach((candidate, index) => lines.push(renderCandidateBlurb(candidate, index + 1)));
    lines.push("", `가장 크게 갈리는 질문: ${question.question}`, `이 질문을 묻는 이유: ${question.reason}`);
    return lines.join("\n");
  }

  function buildExplanationPoints(candidate) {
    const points = [`왕복 이동은 ${candidate.routeModeLabel || "이동안"} 기준이다.`, `예상 총액은 ${C.formatKrw(candidate.estimatedTotalKrw)}이다.`, `대표 숙소는 ${candidate.primaryStayTitle || "미지정"}이다.`];
    if ((candidate.activityTitles || []).length) points.push(`대표 활동은 ${candidate.activityTitles.slice(0, 3).join(", ")}이다.`);
    if ((candidate.inlineEdits || []).length) points.push(`최근 편집: ${(candidate.inlineEdits || []).slice(-2).map((item) => item.summary).join(" / ")}`);
    return points;
  }

  function renderPlanSummary(candidate, session, candidates) {
    const lines = [
      `현재 추천 미니 플랜: ${candidate.cityTitle}`,
      `- 이동: ${candidate.transportSummary || "기본 이동안"}`,
      `- 숙소: ${candidate.primaryStayTitle || "미지정"}`,
      `- 활동: ${(candidate.activityTitles || []).slice(0, 3).join(", ") || "현지 자유시간"}`,
      `- 예상 총액: ${C.formatKrw(candidate.estimatedTotalKrw)}`,
      `- 추천 이유: ${candidate.reason}`,
      `- ${candidate.conflicts.length ? `남은 충돌: ${candidate.conflicts.join(" / ")}` : "남은 하드 충돌 없음"}`,
    ];
    if ((candidate.inlineEdits || []).length) lines.push(`- 반영된 수정: ${(candidate.inlineEdits || []).slice(-3).map((item) => item.summary).join(" / ")}`);
    if ((session.destinationPreferenceIds || []).length && !session.destinationPreferenceIds.includes(candidate.cityId)) lines.push("- 참고: 사용자가 언급한 목적지와 다르지만 현재 제약 기준 점수는 이 안이 더 높다.");
    if (candidates[1]) lines.push("", "대안:", renderCandidateBlurb(candidates[1], 2));
    return lines.join("\n");
  }

  function renderExplainAnswer(candidate, session) {
    const lines = [
      `${candidate.cityTitle} 안의 상세 설명이다.`,
      `- 기본 이동안: ${candidate.transportSummary || "정보 부족"}`,
      `- 왕복 이동시간: ${candidate.travelMinutes || 0}분`,
      `- 숙소: ${candidate.primaryStayTitle || "미지정"} / 1박 ${C.formatKrw(candidate.stayPriceKrw || 0)}`,
      `- 대표 활동: ${(candidate.activityTitles || []).slice(0, 3).join(", ") || "현지 자유시간"}`,
      `- 왜 추천했나: ${candidate.reason}`,
    ];
    if ((session.destinationPreferenceIds || []).length) lines.push(`- 현재 반영된 목적지 선호: ${session.destinationPreferenceIds.join(", ")}`);
    return lines.join("\n");
  }

  function buildCollectResponse(session, missingKey) {
    const summaries = [];
    C.REQUIRED_CONSTRAINT_KEYS.forEach((key) => {
      if (session.constraints?.[key]) summaries.push(renderRequirementStatus(key, session.constraints[key]));
    });
    if (session.preferences?.themes?.length) summaries.push(`테마 ${session.preferences.themes.map(C.displayLabel.bind(C)).join(", ")}`);
    else if (session.themePromptResolved) summaries.push("테마는 자유 선택");
    const statusLine = summaries.length ? `현재까지 반영: ${summaries.join(" / ")}` : "현재까지 반영된 핵심 제약이 아직 없다.";
    return {
      answer: `${statusLine}\n\n${renderMissingQuestion(missingKey)}`,
      stage: "collect",
      mode: "collect",
      recommendations: [],
      alternatives: [],
      next_question: collectPromptExample(missingKey),
      question_reason: "실행 가능 경로를 만들기 위한 최소 하드 제약이 아직 부족하다.",
      candidate_plans: [],
      current_plan: null,
      explanations: [],
      focusNodeIds: [],
    };
  }

  function renderMissingQuestion(key) {
    if (key === "origin") return "플랜을 시작하려면 먼저 한국 출발지를 알아야 한다. 인천(ICN)인지 부산/김해(PUS)인지 알려줘.";
    if (key === "depart_after") return "한국에서 언제 이후에 출발 가능한지 알려줘. 날짜와 시각이 있어야 출발편을 걸러낼 수 있다.";
    if (key === "return_depart_before") return "일본에서 언제 이전에 출발해야 하는지 알려줘. 귀국편 제한이 있어야 후보를 줄일 수 있다.";
    if (key === "total_budget_max") return "총 예산 상한을 알려줘. 항공, 숙소, 활동을 예산 안에서 조합해야 한다.";
    if (key === "themes") return "선호 테마를 알려줘. 예를 들면 미식, 온천, 쇼핑, 자연이다. 상관없으면 '아무거나'라고 입력하면 된다.";
    return "추가 제약을 알려줘.";
  }

  function collectPromptExample(key) {
    if (key === "origin") return "예: 인천 출발";
    if (key === "depart_after") return "예: 3/22 18시 이후 출발";
    if (key === "return_depart_before") return "예: 일본에서 3/24 19시 이전 출발";
    if (key === "total_budget_max") return "예: 최대 예산 60만원";
    if (key === "themes") return "예: 미식+온천, 또는 아무거나";
    return "예: 최대 예산 60만원";
  }

  function inferNodeCityId(index, node) {
    if (!node) return "";
    if (node.type === "City") return node.id;
    const placeRef = String(node.properties?.place_ref || node.properties?.city_ref || "");
    if (placeRef) {
      const placeNode = index.nodesById.get(placeRef);
      if (placeNode?.type === "City") return placeNode.id;
      const incomingContains = incoming(index, placeRef).find((edge) => edge.label === "CONTAINS");
      if (incomingContains) return incomingContains.from;
    }
    const incomingContains = incoming(index, node.id).find((edge) => edge.label === "CONTAINS");
    if (incomingContains) return incomingContains.from;
    return "";
  }

  function createActivityOptionFromNode(index, node) {
    const matchedThemes = outgoing(index, node.id).filter((edge) => edge.label === "MATCHES_THEME").map((edge) => edge.to);
    return {
      activityId: node.id,
      title: node.title,
      node,
      matchedThemes,
      score: confidence(node) * 10 + freshnessBonus(node),
      typicalBudgetKrw: Number(node.properties?.typical_budget_krw || node.properties?.meal_budget_krw || 0),
      notes: node.notes || "",
    };
  }

  function createStayOptionFromNode(index, node) {
    const firstObservation = subjectObservations(index, node.id)[0];
    const value = firstObservation?.properties?.value || {};
    return {
      stayId: node.id,
      title: node.title,
      priceKrw: Number(value.price_krw || node.latest_values?.price_krw || 0),
      node,
      observationIds: firstObservation ? [firstObservation.id] : [],
      budgetLevel: node.properties?.price_band_krw || "",
      notes: node.notes || "",
    };
  }

  function searchNodesForPlan(index, query, currentPlan, explicitCityId) {
    const cityId = explicitCityId || currentPlan?.cityId || "";
    const validPlaces = cityId ? cityScopeIds(index, cityId) : new Set();
    const preferredTypes = new Set(["Restaurant", "Attraction", "ActivityOption", "Lodging", "StayOption", "City"]);
    return Array.from(index.nodesById.values())
      .filter((node) => preferredTypes.has(node.type))
      .filter((node) => !cityId || node.type === "City" || validPlaces.has(String(node.properties?.place_ref || node.properties?.city_ref || "")) || node.id === cityId)
      .map((node) => ({ node, score: GraphUtils.scoreNodeMatch(node, query, { preferredTypes, cityId }) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((item) => item.node);
  }

  function summarizePlaceNode(node) {
    const props = node.properties || {};
    if (node.type === "Restaurant") {
      const menu = props.signature_menu ? `대표 메뉴 ${props.signature_menu}` : "대표 메뉴 정보 없음";
      const budget = props.meal_budget_krw ? `예상 식비 ${C.formatKrw(props.meal_budget_krw)}` : "식비 근거 부족";
      const time = props.best_time ? `권장 시간 ${props.best_time}` : "시간대 자유";
      return `${node.title}: ${menu} / ${budget} / ${time}`;
    }
    if (["Attraction", "ActivityOption"].includes(node.type)) {
      const budget = props.typical_budget_krw ? `예상 소비 ${C.formatKrw(props.typical_budget_krw)}` : "예상 소비 낮음";
      return `${node.title}: ${budget}`;
    }
    if (["Lodging", "StayOption"].includes(node.type)) {
      const price = node.latest_values?.price_krw || props.price_band_krw || 0;
      return `${node.title}: ${price ? `예상 숙박 ${C.formatKrw(price)}` : "숙박 가격 근거 부족"}`;
    }
    return `${node.title}: ${node.notes || node.type}`;
  }

  function buildFactualAnswer(index, session, candidate, query, matchedNodes) {
    const currentCityTitle = candidate?.cityTitle || "현재 플랜";
    if (!matchedNodes.length) {
      return `${currentCityTitle} 기준으로 바로 답할 만한 노드가 아직 부족하다. 다른 식당명이나 테마를 더 구체적으로 말해줘.\n\n현재 미니 플랜은 유지한다.`;
    }
    const lines = [`현재 ${currentCityTitle} 미니 플랜은 유지한 채로 답한다.`];
    const explicitCity = matchedNodes.find((node) => node.type === "City");
    const anchorTitle = explicitCity?.title || currentCityTitle;
    lines.push(`${anchorTitle}에서 바로 참고할 만한 항목:`);
    matchedNodes.slice(0, 4).forEach((node) => lines.push(`- ${summarizePlaceNode(node)}`));
    if (candidate) lines.push("", `지금 선택된 플랜 활동: ${(candidate.activityTitles || []).slice(0, 3).join(", ") || "현지 자유시간"}`);
    return lines.join("\n");
  }

  function buildPlanEditAnswer(candidate, matchedNode, mode) {
    const action = mode === "replace" ? "교체" : "추가";
    const subject = matchedNode.type === "Restaurant" ? "식당" : matchedNode.type === "Lodging" || matchedNode.type === "StayOption" ? "숙소" : "활동";
    return `${candidate.cityTitle} 미니 플랜에 ${matchedNode.title} ${subject}를 ${action} 반영했다.\n현재 활동: ${(candidate.activityTitles || []).slice(0, 3).join(", ") || "현지 자유시간"} / 숙소: ${candidate.primaryStayTitle || "미지정"} / 예상 총액 ${C.formatKrw(candidate.estimatedTotalKrw)}`;
  }

  function applyInlinePlanEdit(currentPlan, matchedNode, mode, index) {
    const candidate = C.clone(currentPlan);
    const nodeCityId = inferNodeCityId(index, matchedNode);
    if (matchedNode.type === "City" && matchedNode.id !== candidate.cityId) {
      return { replanNeeded: true, reason: `${matchedNode.title}는 현재 ${candidate.cityTitle} 플랜과 다른 도시라 재계획이 필요하다.` };
    }
    if (nodeCityId && candidate.cityId && nodeCityId !== candidate.cityId) {
      return { replanNeeded: true, reason: `${matchedNode.title}는 현재 ${candidate.cityTitle} 권역이 아니라 재계획이 필요하다.` };
    }

    if (["Restaurant", "Attraction", "ActivityOption"].includes(matchedNode.type)) {
      const option = candidate.activityOptions.find((item) => item.activityId === matchedNode.id) || createActivityOptionFromNode(index, matchedNode);
      if (!candidate.activityOptions.some((item) => item.activityId === option.activityId)) candidate.activityOptions.push(option);
      if (mode === "replace") {
        candidate.selectedActivityIds = candidate.selectedActivityIds.length ? [option.activityId, ...candidate.selectedActivityIds.slice(1)] : [option.activityId];
      } else if (!candidate.selectedActivityIds.includes(option.activityId)) {
        candidate.selectedActivityIds.push(option.activityId);
      }
    } else if (["Lodging", "StayOption"].includes(matchedNode.type)) {
      const stay = candidate.stayOptions.find((item) => item.stayId === matchedNode.id) || createStayOptionFromNode(index, matchedNode);
      if (!candidate.stayOptions.some((item) => item.stayId === stay.stayId)) candidate.stayOptions.unshift(stay);
      candidate.selectedStayId = stay.stayId;
    } else {
      return { replanNeeded: false, candidate: refreshCandidateSelections(candidate), answer: `${matchedNode.title}는 참고 정보로만 유지한다. 현재 플랜은 그대로 둔다.` };
    }

    candidate.inlineEdits = Array.isArray(candidate.inlineEdits) ? candidate.inlineEdits : [];
    candidate.inlineEdits.push({ at: new Date().toISOString(), mode, nodeId: matchedNode.id, summary: `${matchedNode.title} ${mode === "replace" ? "교체" : "추가"}` });
    refreshCandidateSelections(candidate);
    return { replanNeeded: false, candidate, answer: buildPlanEditAnswer(candidate, matchedNode, mode) };
  }

  window.RealworldPlannerCandidates = {
    buildIndex,
    parseIsoDate,
    generateCandidatePlans,
    candidateToPlanOption,
    pickCurrentCandidate,
    chooseDisambiguationQuestion,
    buildCollectResponse,
    renderDisambiguationPrompt,
    renderPlanSummary,
    renderExplainAnswer,
    buildExplanationPoints,
    refreshCandidateSelections,
    searchNodesForPlan,
    buildFactualAnswer,
    applyInlinePlanEdit,
    inferNodeCityId,
  };
})();
