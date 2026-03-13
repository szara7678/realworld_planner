(function () {
  const C = window.RealworldPlannerConstants;
  const GraphUtils = window.RealworldGraphUtils;

  function createSession(sessionId) {
    const now = new Date().toISOString();
    return {
      id: sessionId || `local_session_${Math.random().toString(36).slice(2, 10)}`,
      status: "active",
      mode: "collect",
      stage: "collect",
      constraints: {},
      preferences: {},
      themePromptResolved: false,
      destinationPreferenceIds: [],
      activityPreferenceIds: [],
      selectedCandidateId: "",
      selectedActivityIds: [],
      selectedStayId: "",
      current_plan: null,
      current_plan_node_ids: [],
      inline_edits: [],
      qa_context: {},
      pendingQuestion: null,
      questionHistory: [],
      lastIntent: "",
      lastIntentData: null,
      lastUserAction: "",
      optionState: {},
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  function parseIntents(query) {
    const lower = query.toLowerCase();
    return {
      finalize: C.FINALIZE_KEYWORDS.some((item) => lower.includes(item)),
      explain: C.EXPLAIN_KEYWORDS.some((item) => lower.includes(item)),
      replace: ["대신", "바꾸", "교체", "말고"].some((item) => lower.includes(item)),
      add: ["여기도", "추가", "같이 가", "같이가", "넣자", "끼워", "가자"].some((item) => lower.includes(item)),
      question: /\?|뭐|어디|추천|알려줘|있어|있나|어때|괜찮아/.test(lower),
    };
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
        return new Date(Date.UTC(C.DEFAULT_YEAR, month - 1, day, hour - 9, 0, 0)).toISOString();
      }
    }
    return "";
  }

  function parseBudget(query) {
    const patterns = [
      /(?:최대\s*(?:경비|예산)|예산\s*최대|총\s*예산\s*상한|총\s*예산|예산|경비)\s*(?:은|은요|은데|이|가)?\s*([0-9][0-9,]*)\s*(만원|만|원)?/,
      /(?:한\s*명당|1인당|인당)\s*([0-9][0-9,]*)\s*(만원|만|원)?/,
      /(?:약|대충|정도|쯤)?\s*([0-9][0-9,]*)\s*(만원|만|원)\s*(?:정도|쯤|이하|까지|내)?/,
    ];
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (!match) continue;
      const raw = Number(String(match[1]).replaceAll(",", ""));
      const unit = match[2] || "";
      if (unit === "만원" || unit === "만") return raw * 10000;
      if (unit === "원") return raw;
      if (raw < 1000) return raw * 10000;
      return raw;
    }
    return null;
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
    return Object.entries(C.THEME_KEYWORDS)
      .filter(([, keywords]) => keywords.some((item) => lower.includes(item)))
      .map(([theme]) => theme);
  }

  function parseKeywordValue(lower, source) {
    return Object.entries(source).find(([, keywords]) => keywords.some((item) => lower.includes(item)))?.[0] || "";
  }

  function parseLevel(lower) {
    return parseKeywordValue(lower, C.LEVEL_KEYWORDS) || "medium";
  }

  function normalizedTokens(...values) {
    return GraphUtils.normalizedTokens(...values);
  }

  function matchNamedNodes(graph, query, allowedTypes, options = {}) {
    const lower = GraphUtils.normalizeText(query);
    const compact = GraphUtils.compactText(query);
    return graph.nodes
      .filter((node) => allowedTypes.has(node.type))
      .map((node) => {
        const canonical = String(node.properties?.canonical_name || "");
        const aliases = Array.isArray(node.aliases) ? node.aliases : [];
        const tokens = normalizedTokens(node.title || "", canonical, ...aliases);
        let score = tokens.reduce((best, token) => {
          if (!token || token.length < 2) return best;
          if (lower.includes(token) || compact.includes(token.replace(/\s+/g, ""))) return Math.max(best, token.length);
          return best;
        }, 0);
        if (options.cityId && String(node.properties?.place_ref || "") === options.cityId) score += 8;
        if (options.preferredTypes?.has(node.type)) score += 4;
        return { node, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.node);
  }

  function currentQuestionAnswer(session, query) {
    const pending = session.pendingQuestion || {};
    const lower = query.toLowerCase();
    if (!pending.kind) return false;
    if (pending.kind === "route_mode") {
      if (C.NO_KEYWORDS.some((item) => lower.includes(item))) {
        session.preferences.ferry_ok = false;
        return true;
      }
      if (C.YES_KEYWORDS.some((item) => lower.includes(item))) {
        session.preferences.ferry_ok = true;
        return true;
      }
    }
    if (pending.kind === "travel_priority") {
      if (["시간", "짧", "피로", "빨리"].some((item) => lower.includes(item))) {
        session.preferences.travel_priority = "time";
        return true;
      }
      if (["예산", "돈", "저렴", "가성비", "싸게"].some((item) => lower.includes(item))) {
        session.preferences.travel_priority = "budget";
        return true;
      }
    }
    if (pending.kind === "lodging_priority") {
      if (["위치", "역세권", "중심", "접근"].some((item) => lower.includes(item))) {
        session.preferences.lodging_priority = "location";
        return true;
      }
      if (["가성비", "저렴", "예산", "싸게"].some((item) => lower.includes(item))) {
        session.preferences.lodging_priority = "value";
        return true;
      }
    }
    if (pending.kind === "theme_balance") {
      if (["음식", "미식", "맛집", "먹"].some((item) => lower.includes(item))) {
        session.preferences.theme_balance = "food";
        return true;
      }
      if (["쇼핑", "면세", "브랜드"].some((item) => lower.includes(item))) {
        session.preferences.theme_balance = "shopping";
        return true;
      }
      if (["둘 다", "반반", "균형", "적당"].some((item) => lower.includes(item))) {
        session.preferences.theme_balance = "balanced";
        return true;
      }
    }
    return false;
  }

  function resetCandidateState(session) {
    session.selectedCandidateId = "";
    session.pendingQuestion = null;
    session.current_plan = null;
    session.current_plan_node_ids = [];
    session.selectedActivityIds = [];
    session.selectedStayId = "";
    session.qa_context = {};
  }

  function mergeNormalizedIntoSession(session, normalized) {
    Object.assign(session.constraints, normalized.constraints);
    if (normalized.themePromptResolved) session.themePromptResolved = true;
    Object.entries(normalized.preferences).forEach(([key, value]) => {
      if (key === "themes") {
        const merged = new Set(session.preferences.themes || []);
        value.forEach((item) => merged.add(item));
        session.preferences.themes = Array.from(merged);
        session.themePromptResolved = true;
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
      themePromptResolved: false,
      reset: ["새 플랜", "처음부터", "다시 시작", "reset"].some((item) => lower.includes(item)),
    };

    Object.entries(C.ORIGIN_KEYWORDS).some(([origin, keywords]) => {
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
    if (themes.length || C.THEME_SKIP_KEYWORDS.some((item) => lower.includes(item))) result.themePromptResolved = true;
    const pace = parseKeywordValue(lower, C.PACE_KEYWORDS);
    if (pace) result.preferences.pace = pace;
    if (lower.includes("쇼핑")) result.preferences.shopping_level = parseLevel(lower);
    if (lower.includes("온천")) result.preferences.onsen_level = parseLevel(lower);
    if (["야경", "밤", "나이트"].some((item) => lower.includes(item))) result.preferences.nightlife_level = parseLevel(lower);
    if (["자연", "풍경", "하이킹"].some((item) => lower.includes(item))) result.preferences.nature_level = parseLevel(lower);
    if (["미식", "먹방", "맛집", "음식", "횟집", "사시미", "해산물", "스시"].some((item) => lower.includes(item))) result.preferences.food_budget_level = parseLevel(lower);
    return result;
  }

  function parseChoice(query) {
    const indexed = query.match(/(\d+)\s*번/);
    if (indexed) return Number(indexed[1]);
    if (/^\d+$/.test(query.trim())) return Number(query.trim());
    return null;
  }

  function applySelectionFromQuery(session, query) {
    const choice = parseChoice(query);
    if (choice !== null) {
      const candidateOptions = session.optionState.candidate_plan_options || [];
      const candidateSelected = candidateOptions[choice - 1];
      if (candidateSelected) {
        session.selectedCandidateId = candidateSelected.id;
        session.pendingQuestion = null;
        return true;
      }
    }
    const lower = query.toLowerCase();
    for (const option of session.optionState.candidate_plan_options || []) {
      const aliases = option.aliases || [];
      if ((option.title && lower.includes(option.title.toLowerCase())) || aliases.some((alias) => lower.includes(String(alias).toLowerCase()))) {
        session.selectedCandidateId = option.id;
        session.pendingQuestion = null;
        return true;
      }
    }
    return false;
  }

  function extractNodeMentions(graph, query, session) {
    const currentCityId = session.current_plan?.cityId || "";
    const cityMentions = matchNamedNodes(graph, query, new Set(["City"]));
    const activityMentions = matchNamedNodes(
      graph,
      query,
      new Set(["Attraction", "Restaurant", "ActivityOption"]),
      { cityId: currentCityId, preferredTypes: new Set(["Restaurant", "Attraction", "ActivityOption"]) }
    );
    const stayMentions = matchNamedNodes(graph, query, new Set(["Lodging", "StayOption"]), { cityId: currentCityId });
    const transitMentions = matchNamedNodes(graph, query, new Set(["TransitHub", "TransportOption"]));
    return {
      cityMentions,
      activityMentions,
      stayMentions,
      transitMentions,
      primaryNode: activityMentions[0] || stayMentions[0] || cityMentions[0] || transitMentions[0] || null,
    };
  }

  function classifyIntent(query, session, graph, context = {}) {
    const lower = query.toLowerCase();
    const intents = parseIntents(query);
    const mentions = context.mentions || extractNodeMentions(graph, query, session);
    const allowDirectSelection = !intents.question && !intents.add && !intents.replace && !intents.explain && GraphUtils.normalizeText(query).length < 32;
    const selected = allowDirectSelection ? applySelectionFromQuery(session, query) : false;
    if (selected) return { intent: "constraint_update", data: { mentions, selection: true } };
    if (intents.finalize) return { intent: "finalize", data: { mentions } };
    if (intents.explain && !context.hasConstraintChange) return { intent: "explain", data: { mentions } };
    if (session.current_plan && intents.replace && mentions.primaryNode) {
      return { intent: "plan_edit_replace", data: { mentions, matchedNode: mentions.primaryNode } };
    }
    if (session.current_plan && intents.add && mentions.primaryNode) {
      return { intent: "plan_edit_add", data: { mentions, matchedNode: mentions.primaryNode } };
    }
    const hardConstraintChange = Boolean(Object.keys(context.normalized?.constraints || {}).length);
    if (!hardConstraintChange && !context.answeredPendingQuestion) {
      const looksFactual = intents.question || ["횟집", "사시미", "해산물", "스시", "뭐 먹", "맛집", "뭐 있어", "어디 가"].some((item) => lower.includes(item));
      if (looksFactual) {
        return {
          intent: "factual_search",
          data: {
            mentions,
            currentCityId: session.current_plan?.cityId || mentions.cityMentions[0]?.id || session.qa_context?.currentCityId || "",
            useCurrentPlanContext: !!session.current_plan,
          },
        };
      }
    }
    return { intent: "constraint_update", data: { mentions } };
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
      session.lastIntent = "constraint_update";
      session.lastIntentData = null;
      session.lastUserAction = "constraint_update";
      return;
    }

    const mentions = extractNodeMentions(graph, query, session);
    const answeredPendingQuestion = currentQuestionAnswer(session, query);
    if (answeredPendingQuestion) {
      session.questionHistory.push((session.pendingQuestion || {}).kind || "");
      session.pendingQuestion = null;
    }

    const hasConstraintChange = Boolean(Object.keys(normalized.constraints).length || Object.keys(normalized.preferences).length);
    const classified = classifyIntent(query, session, graph, { mentions, hasConstraintChange, answeredPendingQuestion, normalized });
    const shouldApplyNormalized = classified.intent === "constraint_update";

    if (shouldApplyNormalized && hasConstraintChange) {
      resetCandidateState(session);
      mergeNormalizedIntoSession(session, normalized);
    }

    if (mentions.cityMentions.length) {
      if (classified.intent === "constraint_update") session.destinationPreferenceIds = mentions.cityMentions.slice(0, 3).map((node) => node.id);
      session.qa_context = { ...(session.qa_context || {}), currentCityId: mentions.cityMentions[0].id };
    }
    if (mentions.activityMentions.length) {
      if (classified.intent === "constraint_update") session.activityPreferenceIds = mentions.activityMentions.slice(0, 4).map((node) => node.id);
      session.qa_context = { ...(session.qa_context || {}), lastMentionedActivityId: mentions.activityMentions[0].id };
    }

    session.lastIntent = classified.intent;
    session.lastIntentData = classified.data;
    session.lastUserAction = classified.intent;
  }

  window.RealworldPlannerParsers = {
    createSession,
    parseIntents,
    parseConstraintsFromQuery,
    parseDateTimeConstraint,
    parseBudget,
    parseNights,
    parseAvoidAreas,
    parseThemes,
    parseKeywordValue,
    parseLevel,
    normalizedTokens,
    matchNamedNodes,
    currentQuestionAnswer,
    resetCandidateState,
    mergeNormalizedIntoSession,
    parseChoice,
    applySelectionFromQuery,
    extractNodeMentions,
    classifyIntent,
    updateSessionFromQuery,
  };
})();
