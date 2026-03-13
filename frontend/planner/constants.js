(function () {
  window.RealworldPlannerConstants = {
    DISPLAY_LABELS: {
      hub_icn: "인천(ICN)",
      hub_pus: "부산/김해(PUS)",
      theme_food: "미식",
      theme_shopping: "쇼핑",
      theme_onsen: "온천",
      theme_history: "역사/전통",
      theme_nightlife: "야경/밤거리",
      theme_nature: "자연",
    },
    THEME_KEYWORDS: {
      theme_food: ["미식", "먹방", "맛집", "음식", "food", "gourmet"],
      theme_shopping: ["쇼핑", "shopping", "브랜드", "면세"],
      theme_onsen: ["온천", "onsen", "스파"],
      theme_history: ["역사", "사찰", "전통", "문화재", "historic"],
      theme_nightlife: ["야경", "밤", "술", "나이트", "nightlife"],
      theme_nature: ["자연", "풍경", "등산", "하이킹", "nature"],
    },
    ORIGIN_KEYWORDS: {
      hub_icn: ["인천", "icn", "incheon"],
      hub_pus: ["부산", "김해", "pus", "busan", "gimhae"],
    },
    PACE_KEYWORDS: {
      slow: ["여유", "천천히", "느긋", "힐링"],
      balanced: ["적당", "균형", "무난"],
      packed: ["빡빡", "최대한", "많이", "타이트"],
    },
    LEVEL_KEYWORDS: {
      high: ["높게", "많이", "강하게", "최대한"],
      medium: ["적당히", "중간", "무난"],
      low: ["낮게", "적게", "조용히"],
    },
    DEFAULT_YEAR: 2026,
    THEME_SKIP_KEYWORDS: ["아무거나", "상관없어", "상관 없어", "무관", "없음", "노상관"],
    REQUIRED_CONSTRAINT_KEYS: ["origin", "depart_after", "return_depart_before", "total_budget_max"],
    FINALIZE_KEYWORDS: ["최종 정리", "정리해", "확정", "이걸로 가", "이걸로 해", "요약해"],
    EXPLAIN_KEYWORDS: ["뭐야", "뭔데", "무슨 뜻", "설명", "자세히", "왜", "어떤", "알려줘"],
    YES_KEYWORDS: ["괜찮", "가능", "좋아", "예", "응", "yes", "ok"],
    NO_KEYWORDS: ["싫", "안돼", "안 돼", "별로", "no", "아니"],
    displayLabel(value) {
      return this.DISPLAY_LABELS[value] || value;
    },
    formatKrw(value) {
      return `${Number(value || 0).toLocaleString("ko-KR")}원`;
    },
    round(value) {
      return Math.round(value * 100) / 100;
    },
    average(values) {
      return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;
    },
    dedupe(values) {
      return Array.from(new Set(values));
    },
    clone(value) {
      return JSON.parse(JSON.stringify(value));
    },
    formatShortDate(value) {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return value || "-";
      return new Intl.DateTimeFormat("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Seoul",
      }).format(date);
    },
  };
})();
