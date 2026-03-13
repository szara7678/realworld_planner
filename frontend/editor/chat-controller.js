(function () {
  function createChatController({ state, el, GraphUtils, composeAssistantText, onPlannerSessionUpdated, onPlannerSessionCleared, applySearchHighlight, openAnswerModal, render, callOpenRouterDirect }) {
    function isNearChatBottom() {
      const remaining = el.chatMessages.scrollHeight - el.chatMessages.scrollTop - el.chatMessages.clientHeight;
      return remaining < 32;
    }

    function handleChatScroll() {
      state.stickChatToBottom = isNearChatBottom();
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
        if (chat.role === "assistant") bubble.addEventListener("click", () => openAnswerModal(index));
        el.chatMessages.appendChild(bubble);
      });
      if (shouldStick) {
        requestAnimationFrame(() => {
          el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
          state.stickChatToBottom = true;
        });
      }
    }

    function shouldUsePlanner(query) {
      if (state.plannerSessionId) return true;
      const lower = query.toLowerCase();
      return /(\d+\s*번|\d{1,2}[/-]\d{1,2}|예산|경비|출발|귀국|복귀|플랜|일정|추천|온천|쇼핑|미식|1박|2박|횟집|사시미|해산물)/.test(lower);
    }

    async function runStaticSearch(query) {
      const currentPlan = state.plannerSession?.current_plan || null;
      const cityId = currentPlan?.cityId || "";
      const preferredTypes = currentPlan ? ["Restaurant", "Attraction", "ActivityOption", "Lodging", "StayOption", "City"] : undefined;
      const matches = GraphUtils.searchGraphLocal(state.graph, query, { cityId, preferredTypes });
      const matchedEdges = GraphUtils.relatedEdgesLocal(state.graph, matches);
      const apiKey = el.searchApiKey.value.trim();
      const model = el.searchModel.value.trim() || "openai/gpt-4o-mini";
      let answer = GraphUtils.buildLocalAnswer(state.graph, matches, matchedEdges);
      let usedOpenRouter = false;

      if (apiKey) {
        try {
          answer = await callOpenRouterDirect(query, state.graph, matches, model, apiKey);
          usedOpenRouter = true;
        } catch (error) {
          answer = `${GraphUtils.buildLocalAnswer(state.graph, matches, matchedEdges)}\n\nOpenRouter 호출 실패: ${error}`;
        }
      }

      return { matches, matched_edges: matchedEdges, answer, used_openrouter: usedOpenRouter, model, graph_context: GraphUtils.buildGraphContext(state.graph, matches) };
    }

    async function runStaticPlanner(query) {
      const session = state.plannerSession || window.StaticPlanner?.createSession?.(state.plannerSessionId) || null;
      if (!window.StaticPlanner || !session) {
        const matches = GraphUtils.searchGraphLocal(state.graph, query);
        const matchedEdges = GraphUtils.relatedEdgesLocal(state.graph, matches);
        return {
          answer: "정적 플래너 모듈을 불러오지 못했다.\n\n" + `${GraphUtils.buildLocalAnswer(state.graph, matches, matchedEdges)}`,
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
      const matches = GraphUtils.buildMatchesFromNodeIds(state.graph, result.focusNodeIds || [], query);
      const matchedEdges = GraphUtils.relatedEdgesLocal(state.graph, matches);
      return {
        answer: result.answer,
        stage: result.stage,
        mode: result.mode,
        session: result.session,
        matches,
        matched_edges: matchedEdges,
        recommendations: result.recommendations || [],
        alternatives: result.alternatives || [],
        next_question: result.next_question || "",
        question_reason: result.question_reason || "",
        candidate_plans: result.candidate_plans || [],
        current_plan: result.current_plan || null,
        explanations: result.explanations || [],
      };
    }

    async function submitQuery(event) {
      event.preventDefault();
      const query = el.searchQuery.value.trim();
      if (!query) return;

      state.chats.push({ role: "user", text: query, createdAt: new Date().toISOString() });
      renderChats();
      el.searchQuery.value = "";

      const usePlanner = shouldUsePlanner(query);
      const placeholder = { role: "assistant", text: usePlanner ? "플랜 후보 계산 중..." : "검색 중...", createdAt: new Date().toISOString(), matches: [] };
      state.chats.push(placeholder);
      renderChats();

      try {
        const result = usePlanner ? await runStaticPlanner(query) : await runStaticSearch(query);
        state.runtime.serverAvailable = false;
        placeholder.text = composeAssistantText(result);
        placeholder.stage = result.stage || "";
        placeholder.mode = result.mode || result.stage || "";
        placeholder.nextQuestion = result.next_question || "";
        placeholder.questionReason = result.question_reason || "";
        placeholder.matches = result.matches || [];
        placeholder.matchedEdges = result.matched_edges || [];
        placeholder.recommendations = result.recommendations || [];
        placeholder.candidatePlans = result.candidate_plans || [];
        placeholder.currentPlan = result.current_plan || null;
        placeholder.explanations = result.explanations || [];

        if (result.session?.id) {
          state.plannerSessionId = result.session.id;
          state.plannerSession = result.session;
          onPlannerSessionUpdated(result.session);
        } else if (!usePlanner) {
          onPlannerSessionCleared();
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
      render();
    }

    function adjustChatHeight(delta) {
      state.chatHeightVh = Math.max(18, Math.min(60, state.chatHeightVh + delta));
      document.documentElement.style.setProperty("--chat-panel-height", `${Math.round(window.innerHeight * (state.chatHeightVh / 100))}px`);
      requestAnimationFrame(() => {
        if (state.stickChatToBottom) el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
      });
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function formatDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value || "-";
      return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }

    return {
      renderChats,
      handleChatScroll,
      submitQuery,
      adjustChatHeight,
    };
  }

  window.RealworldChatController = { createChatController };
})();
