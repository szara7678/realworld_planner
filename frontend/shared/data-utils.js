(function () {
  function getNodeById(graph, id) {
    return (graph?.nodes || []).find((node) => node.id === id) || null;
  }

  function roundConfidence(value) {
    return Math.round(Number(value || 0) * 1000) / 1000;
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

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[()/_,-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactText(value) {
    return normalizeText(value).replace(/\s+/g, "");
  }

  function normalizedTokens(...values) {
    const tokens = new Set();
    values.forEach((value) => {
      const lower = normalizeText(value);
      if (!lower) return;
      tokens.add(lower);
      tokens.add(lower.replace(/\s+/g, ""));
      lower.split(/\s+/).forEach((part) => {
        if (part.length >= 2) tokens.add(part);
      });
      const inner = String(value || "").match(/\((.*?)\)/g) || [];
      inner.forEach((part) => {
        const innerValue = normalizeText(part.replace(/[()]/g, ""));
        if (!innerValue) return;
        tokens.add(innerValue);
        tokens.add(innerValue.replace(/\s+/g, ""));
      });
    });
    return Array.from(tokens).filter(Boolean);
  }

  function buildNodeTokens(node) {
    return normalizedTokens(
      node?.id,
      node?.title,
      node?.properties?.canonical_name,
      ...(Array.isArray(node?.aliases) ? node.aliases : []),
      ...(Array.isArray(node?.tags) ? node.tags : [])
    );
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

  function scoreNodeMatch(node, query, options) {
    const lower = normalizeText(query);
    const compact = compactText(query);
    const tokens = buildNodeTokens(node);
    let score = 0;
    tokens.forEach((token) => {
      if (!token || token.length < 2) return;
      if (lower.includes(token)) score += Math.max(2, token.length * 0.8);
      if (compact.includes(token.replace(/\s+/g, ""))) score += Math.max(2, token.length * 0.55);
    });
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
    lower.split(/\s+/).filter(Boolean).forEach((term) => {
      score += countOccurrences(haystack, term);
    });
    if (options?.preferredTypes?.has(node.type)) score += 5;
    if (options?.cityId && String(node.properties?.place_ref || "") === options.cityId) score += 7;
    score += Number(node.evidence_summary?.trust_score || node.confidence || 0) * 1.6;
    score += countFreshness(node.evidence_summary?.last_observed_at);
    return score;
  }

  function matchNodesByQuery(graph, query, options = {}) {
    const allowedTypes = options.types ? new Set(options.types) : null;
    const lower = normalizeText(query);
    if (!lower) return [];
    return (graph.nodes || [])
      .filter((node) => !allowedTypes || allowedTypes.has(node.type))
      .map((node) => ({ node, score: scoreNodeMatch(node, lower, options) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 12)
      .map((item) => item.node);
  }

  function searchGraphLocal(graph, query, options = {}) {
    const preferredTypes = options.preferredTypes ? new Set(options.preferredTypes) : null;
    const cityId = options.cityId || "";
    return matchNodesByQuery(graph, query, { types: options.types, preferredTypes, cityId, limit: 10 }).map((node) => ({
      kind: "node",
      id: node.id,
      title: node.title,
      type: node.type,
      notes: node.notes || "",
      properties: node.properties || {},
      latest_values: node.latest_values || {},
      score: scoreNodeMatch(node, query, { preferredTypes, cityId }),
    }));
  }

  function relatedEdgesLocal(graph, matches) {
    const nodeIds = new Set(matches.map((item) => item.id));
    return (graph.edges || [])
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

  function buildMatchesFromNodeIds(graph, nodeIds, fallbackQuery) {
    const uniqueIds = Array.from(new Set(nodeIds || []));
    const directMatches = uniqueIds
      .map((id) => getNodeById(graph, id))
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
    return directMatches.length ? directMatches : searchGraphLocal(graph, fallbackQuery);
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

  function buildLocalAnswer(graph, matches, matchedEdges) {
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
        const from = getNodeById(graph, edge.from)?.title || edge.from;
        const to = getNodeById(graph, edge.to)?.title || edge.to;
        lines.push(`- ${from} -> ${edge.label} -> ${to}`);
      });
    }
    lines.push("");
    lines.push("GitHub Pages 정적 모드에서는 로컬 매칭으로 답변을 만들고, 설정에 API 키를 넣으면 OpenRouter 직접 검색도 사용할 수 있다.");
    return lines.join("\n");
  }

  window.RealworldGraphUtils = {
    getNodeById,
    roundConfidence,
    countOccurrences,
    countFreshness,
    parsePropertyInput,
    normalizeText,
    compactText,
    normalizedTokens,
    buildNodeTokens,
    hydrateGraph,
    scoreNodeMatch,
    matchNodesByQuery,
    searchGraphLocal,
    relatedEdgesLocal,
    buildMatchesFromNodeIds,
    buildGraphContext,
    buildLocalAnswer,
  };
})();
