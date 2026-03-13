(function () {
  const C = window.RealworldPlannerConstants;
  const P = window.RealworldPlannerParsers;
  const G = window.RealworldPlannerCandidates;

  function missingRequirements(session) {
    const missing = C.REQUIRED_CONSTRAINT_KEYS.filter((key) => !session.constraints?.[key]);
    if (!session.preferences?.themes?.length && !session.themePromptResolved) missing.push("themes");
    return missing;
  }

  function persistChosenCandidate(session, candidate) {
    if (!candidate) return;
    session.selectedCandidateId = candidate.id;
    session.current_plan = C.clone(candidate);
    session.current_plan_node_ids = Array.from(candidate.usedNodeIds || []);
    session.selectedActivityIds = Array.from(candidate.selectedActivityIds || []);
    session.selectedStayId = candidate.selectedStayId || "";
    session.qa_context = {
      cityId: candidate.cityId,
      cityTitle: candidate.cityTitle,
      activityIds: Array.from(candidate.selectedActivityIds || []),
    };
  }

  function buildResponse(base) {
    return {
      answer: base.answer,
      stage: base.stage,
      mode: base.mode,
      recommendations: base.recommendations || [],
      alternatives: base.alternatives || [],
      next_question: base.next_question || "",
      question_reason: base.question_reason || "",
      candidate_plans: base.candidate_plans || [],
      current_plan: base.current_plan || null,
      explanations: base.explanations || [],
      focusNodeIds: base.focusNodeIds || [],
    };
  }

  function planNextStep(graph, session, query) {
    const index = G.buildIndex(graph);
    const missing = missingRequirements(session);
    const hasCurrentPlan = !!session.current_plan;

    if (missing.length && !hasCurrentPlan) {
      const key = missing[0];
      session.stage = "collect";
      session.mode = "collect";
      return G.buildCollectResponse(session, key);
    }

    const candidates = G.generateCandidatePlans(index, session);
    const candidatePlans = candidates.slice(0, 4).map(G.candidateToPlanOption);
    session.optionState.candidate_plan_options = candidatePlans;
    const currentCandidate = G.pickCurrentCandidate(session, candidates);
    const resolvedCandidate = currentCandidate || candidates[0] || session.current_plan;

    if (session.lastIntent === "factual_search") {
      const currentPlan = resolvedCandidate || session.current_plan;
      const explicitCityId = session.lastIntentData?.currentCityId || currentPlan?.cityId || "";
      const factualNodes = G.searchNodesForPlan(index, query, currentPlan, explicitCityId);
      if (currentPlan) persistChosenCandidate(session, currentPlan);
      session.stage = currentPlan ? "summary" : "collect";
      session.mode = currentPlan ? "explain" : "collect";
      return buildResponse({
        answer: G.buildFactualAnswer(index, session, currentPlan, query, factualNodes),
        stage: currentPlan ? "summary" : "collect",
        mode: currentPlan ? "explain" : "collect",
        recommendations: currentPlan ? [currentPlan] : [],
        alternatives: candidates.slice(1, 3),
        next_question: currentPlan ? "같은 도시 안에서 '여기도 가자' 또는 '이거 대신 저거 가자'로 바로 수정할 수 있다." : "핵심 제약을 더 넣어줘.",
        question_reason: currentPlan ? "현재 미니 플랜을 유지한 채 관련 지식만 보강했다." : "아직 실행 가능한 미니 플랜이 없어 사실 검색만 수행했다.",
        candidate_plans: candidatePlans,
        current_plan: currentPlan || null,
        explanations: currentPlan ? G.buildExplanationPoints(currentPlan) : [],
        focusNodeIds: C.dedupe([...(currentPlan?.usedNodeIds || []), ...factualNodes.map((node) => node.id)]),
      });
    }

    if ((session.lastIntent === "plan_edit_add" || session.lastIntent === "plan_edit_replace") && resolvedCandidate) {
      const matchedNode = session.lastIntentData?.matchedNode;
      if (matchedNode) {
        const edit = G.applyInlinePlanEdit(resolvedCandidate, matchedNode, session.lastIntent === "plan_edit_replace" ? "replace" : "add", index);
        if (edit.replanNeeded) {
          session.stage = "disambiguate";
          session.mode = "disambiguate";
          return buildResponse({
            answer: `${edit.reason}\n\n현재 제약 기준 후보를 다시 비교한다.`,
            stage: "disambiguate",
            mode: "disambiguate",
            recommendations: candidates.slice(0, 2),
            alternatives: candidates.slice(2, 4),
            next_question: "도시를 다시 고정하려면 도시명을 직접 말하거나 후보 번호를 골라줘.",
            question_reason: "현재 플랜과 다른 도시/권역이라 같은 skeleton 안에서 즉시 수정할 수 없다.",
            candidate_plans: candidatePlans,
            current_plan: candidates[0] || null,
            explanations: [],
            focusNodeIds: candidates.slice(0, 3).flatMap((item) => item.usedNodeIds),
          });
        }
        persistChosenCandidate(session, edit.candidate);
        session.inline_edits = Array.from(edit.candidate.inlineEdits || []);
        session.stage = "summary";
        session.mode = "summary";
        return buildResponse({
          answer: edit.answer,
          stage: "summary",
          mode: "summary",
          recommendations: [edit.candidate],
          alternatives: candidates.filter((item) => item.id !== edit.candidate.id).slice(0, 2),
          next_question: "더 바꾸려면 '여기도 가자' 또는 '이거 대신 저거 가자'라고 입력해도 된다.",
          question_reason: "현재 미니 플랜 내부에서 즉시 편집을 반영했다.",
          candidate_plans: candidatePlans,
          current_plan: edit.candidate,
          explanations: G.buildExplanationPoints(edit.candidate),
          focusNodeIds: edit.candidate.usedNodeIds,
        });
      }
    }

    if (!candidates.length) {
      return buildResponse({
        answer: "조건을 만족하는 기본 후보가 아직 없다. 출발지, 출발 가능 시각, 일본 출발 제한, 예산을 더 구체적으로 넣어줘.",
        stage: "collect",
        mode: "collect",
        recommendations: [],
        alternatives: [],
        next_question: "예: 인천에서 3/22 18시 이후 출발, 일본에서 3/24 19시 이전 출발, 최대 예산 60만원",
        question_reason: "현재 데이터로는 실행 가능한 skeleton 후보를 만들기 어렵다.",
        candidate_plans: [],
        current_plan: null,
        explanations: [],
        focusNodeIds: [],
      });
    }

    if (session.lastIntent === "explain" && resolvedCandidate) {
      persistChosenCandidate(session, resolvedCandidate);
      session.stage = "summary";
      session.mode = "explain";
      return buildResponse({
        answer: G.renderExplainAnswer(resolvedCandidate, session),
        stage: "summary",
        mode: "explain",
        recommendations: [resolvedCandidate],
        alternatives: candidates.slice(1, 3),
        next_question: "새 제약을 추가하면 이 안을 다시 조정할 수 있다.",
        question_reason: "현재 선택된 미니 플랜의 세부를 설명한다.",
        candidate_plans: candidatePlans,
        current_plan: resolvedCandidate,
        explanations: G.buildExplanationPoints(resolvedCandidate),
        focusNodeIds: resolvedCandidate.usedNodeIds,
      });
    }

    if (session.lastIntent === "finalize" && resolvedCandidate) {
      persistChosenCandidate(session, resolvedCandidate);
      session.stage = "summary";
      session.mode = "summary";
      return buildResponse({
        answer: G.renderPlanSummary(resolvedCandidate, session, candidates),
        stage: "summary",
        mode: "summary",
        recommendations: [resolvedCandidate],
        alternatives: candidates.slice(1, 3),
        next_question: "세부 설명이 필요하면 이동안, 숙소, 추천 이유를 물어봐도 된다.",
        question_reason: "현재 선택한 skeleton 안을 확정형 요약으로 정리했다.",
        candidate_plans: candidatePlans,
        current_plan: resolvedCandidate,
        explanations: G.buildExplanationPoints(resolvedCandidate),
        focusNodeIds: resolvedCandidate.usedNodeIds,
      });
    }

    const question = G.chooseDisambiguationQuestion(candidates, session);
    if (question && !currentCandidate && !(session.questionHistory || []).length) {
      persistChosenCandidate(session, candidates[0]);
      session.stage = "disambiguate";
      session.mode = "disambiguate";
      session.pendingQuestion = question;
      return buildResponse({
        answer: G.renderDisambiguationPrompt(candidates, question, session),
        stage: "disambiguate",
        mode: "disambiguate",
        recommendations: candidates.slice(0, 2),
        alternatives: candidates.slice(2, 4),
        next_question: question.question,
        question_reason: question.reason,
        candidate_plans: candidatePlans,
        current_plan: candidates[0],
        explanations: [],
        focusNodeIds: candidates.slice(0, 3).flatMap((item) => item.usedNodeIds),
      });
    }

    const chosen = resolvedCandidate;
    persistChosenCandidate(session, chosen);
    session.stage = "summary";
    session.mode = "summary";
    return buildResponse({
      answer: G.renderPlanSummary(chosen, session, candidates),
      stage: "summary",
      mode: "summary",
      recommendations: [chosen],
      alternatives: candidates.slice(1, 3),
      next_question: "세부 설명이 필요하면 이동안, 숙소, 추천 이유를 물어봐도 된다.",
      question_reason: "현재 제약 기준으로 가장 우세한 미니 플랜을 요약했다.",
      candidate_plans: candidatePlans,
      current_plan: chosen,
      explanations: G.buildExplanationPoints(chosen),
      focusNodeIds: chosen.usedNodeIds,
    });
  }

  function runPlanner(graph, session, query) {
    const nextSession = C.clone(session || P.createSession());
    if (query) P.updateSessionFromQuery(graph, nextSession, query);
    const result = planNextStep(graph, nextSession, query || "");
    result.session = nextSession;
    return result;
  }

  window.StaticPlanner = {
    createSession: P.createSession,
    runPlanner,
  };
})();
