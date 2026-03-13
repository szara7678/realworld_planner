from __future__ import annotations

import json
import re
import uuid
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

KST = timezone(timedelta(hours=9))
DEFAULT_YEAR = 2026

TYPE_WEIGHTS = {
    "City": 4.0,
    "TransitHub": 3.8,
    "ExperienceTheme": 3.3,
    "Attraction": 3.2,
    "Restaurant": 3.1,
    "Lodging": 2.9,
    "TransportOption": 3.4,
    "StayOption": 2.7,
    "ActivityOption": 2.7,
    "TravelRule": 2.2,
    "SeasonalEvent": 2.3,
    "CandidatePlan": 2.0,
    "Observation": 1.8,
    "Source": 1.4,
}

THEME_KEYWORDS = {
    "theme_food": ["미식", "먹방", "맛집", "음식", "food", "gourmet"],
    "theme_shopping": ["쇼핑", "shopping", "브랜드", "면세"],
    "theme_onsen": ["온천", "onsen", "스파"],
    "theme_history": ["역사", "사찰", "전통", "문화재", "historic"],
    "theme_nightlife": ["야경", "밤", "술", "나이트라이프", "nightlife"],
    "theme_nature": ["자연", "풍경", "등산", "하이킹", "nature"],
}

ORIGIN_KEYWORDS = {
    "hub_icn": ["인천", "icn", "incheon"],
    "hub_pus": ["부산", "김해", "pus", "busan", "gimhae"],
}

PACE_KEYWORDS = {
    "slow": ["여유", "천천히", "느긋", "힐링"],
    "balanced": ["적당", "균형", "무난"],
    "packed": ["빡빡", "최대한", "많이", "타이트"],
}

DISPLAY_LABELS = {
    "hub_icn": "인천(ICN)",
    "hub_pus": "부산/김해(PUS)",
    "theme_food": "미식",
    "theme_shopping": "쇼핑",
    "theme_onsen": "온천",
    "theme_history": "역사/전통",
    "theme_nightlife": "야경/밤거리",
    "theme_nature": "자연",
}

LEVEL_KEYWORDS = {
    "high": ["높게", "많이", "강하게", "최대한"],
    "medium": ["적당히", "중간", "무난"],
    "low": ["낮게", "적게", "조용히"],
}
THEME_SKIP_KEYWORDS = ["아무거나", "상관없어", "상관 없어", "무관", "없음", "노상관"]
REQUIRED_CONSTRAINT_KEYS = ["origin", "depart_after", "return_depart_before", "total_budget_max"]
FINALIZE_KEYWORDS = ["최종 정리", "정리해", "확정", "이걸로 가", "이걸로 해", "요약해"]
EXPLAIN_KEYWORDS = ["뭐야", "뭔데", "무슨 뜻", "설명", "자세히", "왜", "어떤", "알려줘"]
YES_KEYWORDS = ["괜찮", "가능", "좋아", "좋습니다", "okay", "ok", "예", "응", "yes"]
NO_KEYWORDS = ["싫", "안돼", "안 돼", "별로", "no", "아니", "안좋", "불가"]

PLANNER_HINTS = [
    "출발",
    "귀국",
    "복귀",
    "예산",
    "경비",
    "플랜",
    "일정",
    "추천",
    "1박",
    "2박",
    "도착",
    "테마",
    "온천",
    "쇼핑",
    "미식",
]


@dataclass
class GraphIndex:
    nodes_by_id: dict[str, dict[str, Any]]
    outgoing: dict[str, list[dict[str, Any]]]
    incoming: dict[str, list[dict[str, Any]]]
    schema: dict[str, Any]


def load_schema(base_dir: Path) -> dict[str, Any]:
    node_schema = json.loads((base_dir / "ontology" / "schema" / "node-types.json").read_text(encoding="utf-8"))
    edge_schema = json.loads((base_dir / "ontology" / "schema" / "edge-types.json").read_text(encoding="utf-8"))
    return {
        "version": node_schema.get("version", "2.0"),
        "common_fields": node_schema.get("common_fields", []),
        "promotion_policy": node_schema.get("promotion_policy", {}),
        "node_types": node_schema.get("node_types", {}),
        "edge_types": edge_schema.get("edge_types", []),
        "constraint_types": node_schema.get("constraint_types", []),
        "preference_types": node_schema.get("preference_types", []),
    }


def ensure_graph_defaults(graph: dict[str, Any], schema: dict[str, Any] | None = None) -> dict[str, Any]:
    graph = deepcopy(graph)
    meta = graph.setdefault("meta", {})
    meta.setdefault("title", "Realworld Planner Travel Graph")
    meta.setdefault("schema_version", (schema or {}).get("version", "2.0"))
    meta.setdefault("canonical_source", "json-cache")
    meta.setdefault("planner_ready", True)
    meta.setdefault("updatedAt", datetime.now(KST).isoformat())
    for node in graph.get("nodes", []):
        normalize_node(node)
    for edge in graph.get("edges", []):
        edge.setdefault("notes", "")
        edge.setdefault("confidence", 0.75)
    refresh_derived_values(graph)
    return graph


def normalize_node(node: dict[str, Any]) -> None:
    node.setdefault("aliases", [])
    node.setdefault("tags", [])
    node.setdefault("status", "active")
    node.setdefault("notes", "")
    node.setdefault("created_at", "")
    node.setdefault("updated_at", "")
    node.setdefault("confidence", 0.75)
    node.setdefault("ext", {})
    node.setdefault("properties", {})
    node.setdefault("latest_values", {})
    node.setdefault("evidence_summary", {})


def refresh_derived_values(graph: dict[str, Any]) -> None:
    index = build_index(graph, {"node_types": {}, "edge_types": []})
    observations_by_subject: dict[str, list[dict[str, Any]]] = {}
    for node in graph.get("nodes", []):
        if node.get("type") != "Observation":
            continue
        subject_ref = str(node.get("properties", {}).get("subject_ref") or node.get("subject_ref") or "")
        if not subject_ref:
            continue
        observations_by_subject.setdefault(subject_ref, []).append(node)
    for subject_ref, observations in observations_by_subject.items():
        subject = index.nodes_by_id.get(subject_ref)
        if not subject:
            continue
        latest_values: dict[str, Any] = {}
        last_observed_at = ""
        source_ids: set[str] = set()
        confidence_total = 0.0
        for observation in sorted(observations, key=observation_sort_key):
            props = observation.get("properties", {})
            metric = str(props.get("metric", "observation"))
            value = props.get("value")
            latest_values[metric] = value
            if isinstance(value, dict):
                for key, item in value.items():
                    latest_values[key] = item
            observed_at = str(props.get("observed_at", ""))
            if observed_at and observed_at > last_observed_at:
                last_observed_at = observed_at
            source_ids.add(str(props.get("source_ref", "")))
            confidence_total += float(observation.get("confidence", 0.75) or 0.75)
        subject["latest_values"] = latest_values
        trust_score = round(confidence_total / max(len(observations), 1), 3)
        subject["evidence_summary"] = {
            "observation_count": len(observations),
            "source_count": len({item for item in source_ids if item}),
            "trust_score": trust_score,
            "last_observed_at": last_observed_at,
        }


def build_index(graph: dict[str, Any], schema: dict[str, Any]) -> GraphIndex:
    nodes_by_id = {node["id"]: node for node in graph.get("nodes", [])}
    outgoing: dict[str, list[dict[str, Any]]] = {}
    incoming: dict[str, list[dict[str, Any]]] = {}
    for edge in graph.get("edges", []):
        outgoing.setdefault(edge.get("from", ""), []).append(edge)
        incoming.setdefault(edge.get("to", ""), []).append(edge)
    return GraphIndex(nodes_by_id=nodes_by_id, outgoing=outgoing, incoming=incoming, schema=schema)


def observation_sort_key(node: dict[str, Any]) -> tuple[str, float]:
    props = node.get("properties", {})
    return (str(props.get("observed_at", "")), float(node.get("confidence", 0.75) or 0.75))


def node_haystack(node: dict[str, Any]) -> str:
    parts = [
        node.get("id", ""),
        node.get("type", ""),
        node.get("title", ""),
        " ".join(str(item) for item in node.get("aliases", [])),
        " ".join(str(item) for item in node.get("tags", [])),
        node.get("notes", ""),
        json.dumps(node.get("properties", {}), ensure_ascii=False),
        json.dumps(node.get("latest_values", {}), ensure_ascii=False),
        json.dumps(node.get("ext", {}), ensure_ascii=False),
    ]
    return " ".join(parts).lower()


def search_graph(graph: dict[str, Any], query: str, schema: dict[str, Any]) -> list[dict[str, Any]]:
    terms = [term.strip().lower() for term in re.split(r"\s+", query) if term.strip()]
    if not terms:
        return []
    index = build_index(graph, schema)
    results: list[dict[str, Any]] = []
    query_lower = query.lower()
    for node in graph.get("nodes", []):
        haystack = node_haystack(node)
        title = str(node.get("title", "")).lower()
        score = 0.0
        score += TYPE_WEIGHTS.get(str(node.get("type", "")), 1.0)
        for term in terms:
            score += haystack.count(term) * 2.1
            if term in title:
                score += 2.8
            if term in " ".join(str(item).lower() for item in node.get("aliases", [])):
                score += 2.0
        if title and title in query_lower:
            score += 5.5
        score += connected_match_bonus(index, node, terms)
        score += freshness_bonus(node)
        score += float(node.get("confidence", 0.75) or 0.75) * 1.8
        if score < 3.8:
            continue
        results.append(
            {
                "kind": "node",
                "id": node.get("id"),
                "title": node.get("title"),
                "type": node.get("type"),
                "notes": node.get("notes", ""),
                "properties": node.get("properties", {}),
                "latest_values": node.get("latest_values", {}),
                "score": round(score, 3),
            }
        )
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:10]


def connected_match_bonus(index: GraphIndex, node: dict[str, Any], terms: list[str]) -> float:
    bonus = 0.0
    for edge in index.outgoing.get(node.get("id", ""), []) + index.incoming.get(node.get("id", ""), []):
        other_id = edge.get("to") if edge.get("from") == node.get("id") else edge.get("from")
        other = index.nodes_by_id.get(other_id)
        if not other:
            continue
        haystack = node_haystack(other)
        for term in terms:
            if term in haystack:
                bonus += 0.65
    return min(bonus, 4.0)


def freshness_bonus(node: dict[str, Any]) -> float:
    last_observed_at = str(node.get("evidence_summary", {}).get("last_observed_at", ""))
    if not last_observed_at:
        return 0.0
    try:
        delta = datetime.now(KST) - datetime.fromisoformat(last_observed_at)
    except ValueError:
        return 0.0
    days = max(delta.total_seconds() / 86400, 0.0)
    if days <= 3:
        return 2.6
    if days <= 14:
        return 1.8
    if days <= 45:
        return 1.0
    return 0.2


def related_edges(graph: dict[str, Any], matches: list[dict[str, Any]], limit: int = 16) -> list[dict[str, Any]]:
    node_ids = {item.get("id") for item in matches}
    edges = []
    for edge in graph.get("edges", []):
        if edge.get("from") in node_ids or edge.get("to") in node_ids:
            edges.append(
                {
                    "kind": "edge",
                    "id": edge.get("id"),
                    "label": edge.get("label"),
                    "from": edge.get("from"),
                    "to": edge.get("to"),
                }
            )
    return edges[:limit]


def build_context(graph: dict[str, Any], matches: list[dict[str, Any]]) -> str:
    parts = [
        f"Graph title: {graph.get('meta', {}).get('title', '')}",
        "Top graph matches:",
    ]
    for item in matches:
        props = []
        for key, value in item.get("properties", {}).items():
            props.append(f"{key}={value}")
        for key, value in item.get("latest_values", {}).items():
            props.append(f"{key}={value}")
        parts.append(
            f"- [{item['type']}] {item['title']} ({item['id']}): {item.get('notes', '')} | {'; '.join(props)}"
        )
    return "\n".join(parts)


def is_planner_query(query: str, session_exists: bool = False) -> bool:
    query_lower = query.lower()
    if session_exists:
        return True
    if any(hint in query_lower for hint in PLANNER_HINTS):
        return True
    if re.search(r"\d+\s*번", query_lower):
        return True
    if re.search(r"\d{1,2}[/-]\d{1,2}", query_lower):
        return True
    return False


def create_session_payload(session_id: str | None = None) -> dict[str, Any]:
    now = datetime.now(KST).isoformat()
    return {
        "id": session_id or f"session_{uuid.uuid4().hex[:10]}",
        "status": "active",
        "mode": "collect",
        "stage": "collect",
        "constraints": {},
        "preferences": {},
        "theme_prompt_resolved": False,
        "destination_preference_ids": [],
        "activity_preference_ids": [],
        "selected_candidate_id": "",
        "pending_question": None,
        "question_history": [],
        "last_intent": "",
        "selected_city_id": "",
        "selected_transport_id": "",
        "selected_stay_id": "",
        "selected_activity_ids": [],
        "option_state": {},
        "messages": [],
        "created_at": now,
        "updated_at": now,
    }


def update_session_from_query(
    graph: dict[str, Any],
    schema: dict[str, Any],
    session: dict[str, Any],
    query: str,
) -> dict[str, Any]:
    session["updated_at"] = datetime.now(KST).isoformat()
    session["messages"].append({"role": "user", "text": query, "at": session["updated_at"]})
    intents = parse_intents(query)
    session["last_intent"] = next((name for name, active in intents.items() if active), "")
    normalized = parse_constraints_from_query(query, graph, schema)
    if normalized["reset"]:
        keep_id = session["id"]
        session.clear()
        session.update(create_session_payload(keep_id))
        normalized = parse_constraints_from_query(query.replace("새 플랜", "").replace("다시", ""), graph, schema)
    if normalized["constraints"] or normalized["preferences"]:
        reset_candidate_state(session)
    session["constraints"].update(normalized["constraints"])
    if normalized.get("theme_prompt_resolved"):
        session["theme_prompt_resolved"] = True
    merge_preferences(session["preferences"], normalized["preferences"])
    if session.get("preferences", {}).get("themes"):
        session["theme_prompt_resolved"] = True
    city_mentions = match_named_nodes(graph, query, {"City"})
    if city_mentions:
        session["destination_preference_ids"] = [node["id"] for node in city_mentions[:3]]
        reset_candidate_state(session)
    activity_mentions = match_named_nodes(graph, query, {"Attraction", "Restaurant", "ActivityOption"})
    if activity_mentions:
        session["activity_preference_ids"] = [node["id"] for node in activity_mentions[:4]]
    if current_question_answer(session, query):
        session["question_history"].append((session.get("pending_question") or {}).get("kind", ""))
        session["pending_question"] = None
    apply_selection_from_query(graph, session, query)
    return session


def merge_preferences(target: dict[str, Any], updates: dict[str, Any]) -> None:
    for key, value in updates.items():
        if key == "themes":
            existing = set(target.get("themes", []))
            existing.update(value)
            target["themes"] = sorted(existing)
        else:
            target[key] = value


def parse_constraints_from_query(query: str, graph: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    query_lower = query.lower()
    result = {"constraints": {}, "preferences": {}, "reset": False, "theme_prompt_resolved": False}
    if any(keyword in query_lower for keyword in ["새 플랜", "처음부터", "다시 시작", "reset"]):
        result["reset"] = True
    for origin_ref, keywords in ORIGIN_KEYWORDS.items():
        if any(keyword in query_lower for keyword in keywords):
            result["constraints"]["origin"] = origin_ref
            break
    depart_after = parse_datetime_constraint(query, after=True, return_context=False)
    if depart_after:
        result["constraints"]["depart_after"] = depart_after.isoformat()
    return_before = parse_datetime_constraint(query, after=False, return_context=True)
    if return_before:
        result["constraints"]["return_depart_before"] = return_before.isoformat()
    budget = parse_budget(query)
    if budget is not None:
        result["constraints"]["total_budget_max"] = budget
    night_count = parse_nights(query)
    if night_count:
        result["constraints"]["nights_min"] = night_count
        result["constraints"]["nights_max"] = night_count
    must_avoid = parse_avoid_areas(query, graph)
    if must_avoid:
        result["constraints"]["must_avoid_area"] = must_avoid
    if "공항" in query_lower and "반드시" in query_lower:
        match = re.search(r"([A-Za-z]{3})", query)
        if match:
            result["constraints"]["must_use_airport"] = match.group(1).upper()
    themes = parse_themes(query_lower)
    if themes:
        result["preferences"]["themes"] = themes
    if themes or any(keyword in query_lower for keyword in THEME_SKIP_KEYWORDS):
        result["theme_prompt_resolved"] = True
    pace = parse_keyword_value(query_lower, PACE_KEYWORDS)
    if pace:
        result["preferences"]["pace"] = pace
    if "쇼핑" in query_lower:
        result["preferences"]["shopping_level"] = parse_level(query_lower)
    if "온천" in query_lower:
        result["preferences"]["onsen_level"] = parse_level(query_lower)
    if any(keyword in query_lower for keyword in ["야경", "나이트", "밤"]):
        result["preferences"]["nightlife_level"] = parse_level(query_lower)
    if any(keyword in query_lower for keyword in ["자연", "풍경", "하이킹"]):
        result["preferences"]["nature_level"] = parse_level(query_lower)
    if any(keyword in query_lower for keyword in ["먹방", "미식", "맛집", "음식"]):
        result["preferences"]["food_budget_level"] = parse_level(query_lower)
    if any(keyword in query_lower for keyword in ["기차", "환승", "이동"]):
        result["preferences"]["transport_tolerance"] = "medium"
    return result


def parse_datetime_constraint(query: str, after: bool, return_context: bool) -> datetime | None:
    query_lower = query.lower()
    if after and "이후" not in query_lower:
        return None
    if not after and "이전" not in query_lower:
        return None
    if return_context and not any(keyword in query_lower for keyword in ["귀국", "복귀", "일본에서", "돌아"]):
        return None
    if not return_context and any(keyword in query_lower for keyword in ["귀국", "복귀", "일본에서"]):
        pass
    patterns = [
        re.compile(r"(?P<month>\d{1,2})\s*[/-]\s*(?P<day>\d{1,2})\s*(?:일)?\s*(?P<hour>\d{1,2})\s*시"),
        re.compile(r"(?P<month>\d{1,2})\s*월\s*(?P<day>\d{1,2})\s*일?\s*(?P<hour>\d{1,2})\s*시"),
        re.compile(r"(?P<day>\d{1,2})\s*일\s*(?P<hour>\d{1,2})\s*시"),
    ]
    segments = [segment.strip() for segment in re.split(r"[,\n]| 그리고 | and ", query) if segment.strip()]
    if not segments:
        segments = [query]
    for segment in segments:
        segment_lower = segment.lower()
        has_return_keyword = any(keyword in segment_lower for keyword in ["귀국", "복귀", "일본에서", "돌아"])
        if return_context and not has_return_keyword:
            continue
        if not return_context and has_return_keyword:
            continue
        if after and "이후" not in segment_lower:
            continue
        if not after and "이전" not in segment_lower:
            continue
        for pattern in patterns:
            match = pattern.search(segment)
            if not match:
                continue
            month = int(match.groupdict().get("month") or 3)
            day = int(match.group("day"))
            hour = int(match.group("hour"))
            return datetime(DEFAULT_YEAR, month, day, hour, 0, tzinfo=KST)
    return None


def parse_budget(query: str) -> int | None:
    patterns = [
        re.compile(r"(?:최대\s*(?:경비|예산)|예산\s*최대|총\s*예산\s*상한|총\s*예산|예산|경비)\s*(?:은|은요|은데|이|가)?\s*([0-9][0-9,]*)\s*(만원|만|원)?"),
        re.compile(r"(?:한\s*명당|1인당|인당)\s*([0-9][0-9,]*)\s*(만원|만|원)?"),
        re.compile(r"(?:약|대충|정도|쯤)?\s*([0-9][0-9,]*)\s*(만원|만|원)\s*(?:정도|쯤|이하|까지|내)?"),
    ]
    for pattern in patterns:
        match = pattern.search(query)
        if not match:
            continue
        raw = int(match.group(1).replace(",", ""))
        unit = match.group(2) or ""
        if unit in {"만원", "만"}:
            return raw * 10000
        if unit == "원":
            return raw
        if raw < 1000:
            return raw * 10000
        return raw
    return None


def parse_nights(query: str) -> int | None:
    match = re.search(r"(\d+)\s*박", query)
    return int(match.group(1)) if match else None


def parse_avoid_areas(query: str, graph: dict[str, Any]) -> list[str]:
    results: list[str] = []
    lower_query = query.lower()
    if "제외" not in lower_query and "피하고" not in lower_query and "avoid" not in lower_query:
        return results
    for node in graph.get("nodes", []):
        if node.get("type") not in {"City", "Region", "District"}:
            continue
        title = str(node.get("title", "")).lower()
        if title and title in lower_query:
            results.append(node["id"])
    return results


def parse_themes(query_lower: str) -> list[str]:
    themes: list[str] = []
    for theme_id, keywords in THEME_KEYWORDS.items():
        if any(keyword in query_lower for keyword in keywords):
            themes.append(theme_id)
    return themes


def parse_keyword_value(query_lower: str, mapping: dict[str, list[str]]) -> str:
    for value, keywords in mapping.items():
        if any(keyword in query_lower for keyword in keywords):
            return value
    return ""


def parse_level(query_lower: str) -> str:
    for level, keywords in LEVEL_KEYWORDS.items():
        if any(keyword in query_lower for keyword in keywords):
            return level
    return "medium"


def parse_intents(query: str) -> dict[str, bool]:
    lower = query.lower()
    return {
        "finalize": any(keyword in lower for keyword in FINALIZE_KEYWORDS),
        "explain": any(keyword in lower for keyword in EXPLAIN_KEYWORDS),
    }


def normalized_tokens(*values: str) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        if not value:
            continue
        lower = str(value).lower()
        cleaned = re.sub(r"[()/_,-]", " ", lower)
        compact = re.sub(r"\s+", "", cleaned)
        if lower:
            tokens.add(lower)
        if cleaned:
            tokens.add(cleaned.strip())
        if compact:
            tokens.add(compact)
        if "(" in lower and ")" in lower:
            inner = re.findall(r"\((.*?)\)", lower)
            for part in inner:
                tokens.add(part.strip())
                tokens.add(re.sub(r"\s+", "", part.strip()))
        for part in re.split(r"\s+", cleaned):
            if len(part.strip()) >= 2:
                tokens.add(part.strip())
    return {token for token in tokens if token}


def match_named_nodes(graph: dict[str, Any], query: str, allowed_types: set[str]) -> list[dict[str, Any]]:
    lower = query.lower()
    compact_query = re.sub(r"\s+", "", lower)
    results: list[tuple[int, dict[str, Any]]] = []
    for node in graph.get("nodes", []):
        if node.get("type") not in allowed_types:
            continue
        aliases = node.get("aliases", []) or []
        canonical = str(node.get("properties", {}).get("canonical_name", ""))
        tokens = normalized_tokens(str(node.get("title", "")), canonical, *[str(item) for item in aliases])
        best = 0
        for token in tokens:
            if len(token) < 2:
                continue
            if token in lower or token in compact_query:
                best = max(best, len(token))
        if best:
            results.append((best, node))
    results.sort(key=lambda item: item[0], reverse=True)
    seen: set[str] = set()
    ordered: list[dict[str, Any]] = []
    for _, node in results:
        if node["id"] in seen:
            continue
        seen.add(node["id"])
        ordered.append(node)
    return ordered


def current_question_answer(session: dict[str, Any], query: str) -> bool:
    pending = session.get("pending_question") or {}
    kind = pending.get("kind") or ""
    if not kind:
        return False
    lower = query.lower()
    if kind == "route_mode":
        if any(keyword in lower for keyword in NO_KEYWORDS):
            session.setdefault("preferences", {})["ferry_ok"] = False
            return True
        if any(keyword in lower for keyword in YES_KEYWORDS):
            session.setdefault("preferences", {})["ferry_ok"] = True
            return True
    if kind == "travel_priority":
        if any(keyword in lower for keyword in ["시간", "짧", "피로", "빨리", "이동 적게"]):
            session.setdefault("preferences", {})["travel_priority"] = "time"
            return True
        if any(keyword in lower for keyword in ["예산", "돈", "저렴", "가성비", "싸게"]):
            session.setdefault("preferences", {})["travel_priority"] = "budget"
            return True
    if kind == "lodging_priority":
        if any(keyword in lower for keyword in ["위치", "역세권", "중심", "접근"]):
            session.setdefault("preferences", {})["lodging_priority"] = "location"
            return True
        if any(keyword in lower for keyword in ["가성비", "저렴", "싸게", "예산"]):
            session.setdefault("preferences", {})["lodging_priority"] = "value"
            return True
    if kind == "theme_balance":
        if any(keyword in lower for keyword in ["음식", "미식", "맛집", "먹"]):
            session.setdefault("preferences", {})["theme_balance"] = "food"
            return True
        if any(keyword in lower for keyword in ["쇼핑", "브랜드", "면세"]):
            session.setdefault("preferences", {})["theme_balance"] = "shopping"
            return True
        if any(keyword in lower for keyword in ["둘 다", "반반", "균형", "적당"]):
            session.setdefault("preferences", {})["theme_balance"] = "balanced"
            return True
    return False


def reset_candidate_state(session: dict[str, Any]) -> None:
    session["selected_candidate_id"] = ""
    session["pending_question"] = None


def apply_selection_from_query(graph: dict[str, Any], session: dict[str, Any], query: str) -> None:
    option_state = session.setdefault("option_state", {})
    choice = parse_choice(query)
    if choice is not None:
        candidate_options = option_state.get("candidate_plan_options", [])
        if 1 <= choice <= len(candidate_options):
            session["selected_candidate_id"] = candidate_options[choice - 1]["id"]
            session["pending_question"] = None
            return
    if session.get("stage") in {"city", "transport", "stay", "activity"} and choice is not None:
        key = f"{session['stage']}_options"
        options = option_state.get(key, [])
        if 1 <= choice <= len(options):
            selected = options[choice - 1]
            if session["stage"] == "city":
                session["selected_city_id"] = selected["city_id"]
            elif session["stage"] == "transport":
                session["selected_transport_id"] = selected["transport_bundle_id"]
            elif session["stage"] == "stay":
                session["selected_stay_id"] = selected["stay_id"]
            elif session["stage"] == "activity":
                activity_ids = session.get("selected_activity_ids", [])
                if selected["activity_id"] not in activity_ids:
                    activity_ids.append(selected["activity_id"])
                session["selected_activity_ids"] = activity_ids
    lower_query = query.lower()
    for option in option_state.get("candidate_plan_options", []):
        title = str(option.get("title", "")).lower()
        aliases = [str(item).lower() for item in option.get("aliases", [])]
        if (title and title in lower_query) or any(alias and alias in lower_query for alias in aliases):
            session["selected_candidate_id"] = option["id"]
            session["pending_question"] = None
            break


def parse_choice(query: str) -> int | None:
    match = re.search(r"(\d+)\s*번", query)
    if match:
        return int(match.group(1))
    stripped = query.strip()
    if stripped.isdigit():
        return int(stripped)
    return None


def plan_next_step(graph: dict[str, Any], schema: dict[str, Any], session: dict[str, Any]) -> dict[str, Any]:
    index = build_index(graph, schema)
    missing = missing_requirements(session)
    matches = search_graph(graph, session_summary_query(session), schema)
    edge_matches = related_edges(graph, matches)
    if missing:
        session["stage"] = "collect"
        session["mode"] = "collect"
        answer, next_question = build_collect_prompt(session, missing[0])
        return {
            "answer": answer,
            "stage": "collect",
            "mode": "collect",
            "session": session,
            "matches": matches,
            "matched_edges": edge_matches,
            "recommendations": [],
            "alternatives": [],
            "next_question": next_question,
            "question_reason": "실행 가능 경로를 만들기 위한 최소 하드 제약이 아직 부족하다.",
            "candidate_plans": [],
            "current_plan": None,
            "explanations": [],
        }
    candidates = generate_candidate_plans(graph, index, session)

    if not candidates:
        answer = "조건을 만족하는 기본 후보를 아직 만들지 못했다. 출발 공항, 출발 가능 시각, 귀국 제한, 예산 중 최소 2개를 더 알려줘."
        return {
            "answer": answer,
            "stage": "collect",
            "mode": "collect",
            "session": session,
            "matches": matches,
            "matched_edges": edge_matches,
            "recommendations": [],
            "alternatives": [],
            "next_question": "예: 인천에서 3/22 18시 이후 출발, 일본에서 3/24 19시 이전 출발, 최대 예산 60만원",
            "question_reason": "현재 데이터로는 실행 가능한 skeleton 후보를 아직 만들지 못했다.",
            "candidate_plans": [],
            "current_plan": None,
            "explanations": [],
        }
    candidate_plans = [candidate_to_plan_option(item) for item in candidates[:4]]
    session["option_state"]["candidate_plan_options"] = candidate_plans
    current_candidate = pick_current_candidate(session, candidates)
    if current_candidate:
        session["selected_candidate_id"] = current_candidate["id"]

    resolved_candidate = current_candidate or candidates[0]

    if session.get("last_intent") == "explain" and resolved_candidate:
        session["stage"] = "summary"
        session["mode"] = "explain"
        answer = render_explain_answer(resolved_candidate, session)
        return {
            "answer": answer,
            "stage": "summary",
            "mode": "explain",
            "session": session,
            "matches": collect_used_matches(matches, [resolved_candidate]),
            "matched_edges": edge_matches,
            "recommendations": [resolved_candidate],
            "alternatives": candidates[1:3],
            "next_question": "새 제약을 추가하면 이 안을 다시 조정할 수 있다.",
            "question_reason": "현재 선택된 미니 플랜의 세부를 설명한다.",
            "candidate_plans": candidate_plans,
            "current_plan": resolved_candidate,
            "explanations": build_explanation_points(resolved_candidate),
        }

    if session.get("last_intent") == "finalize" and resolved_candidate:
        session["stage"] = "summary"
        session["mode"] = "summary"
        answer = render_plan_summary(resolved_candidate, session, candidates)
        return {
            "answer": answer,
            "stage": "summary",
            "mode": "summary",
            "session": session,
            "matches": collect_used_matches(matches, [resolved_candidate]),
            "matched_edges": edge_matches,
            "recommendations": [resolved_candidate],
            "alternatives": candidates[1:3],
            "next_question": "세부 설명이 필요하면 이동안, 숙소, 추천 이유를 물어봐도 된다.",
            "question_reason": "현재 선택한 skeleton 안을 확정형 요약으로 정리했다.",
            "candidate_plans": candidate_plans,
            "current_plan": resolved_candidate,
            "explanations": build_explanation_points(resolved_candidate),
        }

    question = choose_disambiguation_question(candidates, session)
    if question and not current_candidate and not session.get("question_history"):
        session["stage"] = "disambiguate"
        session["mode"] = "disambiguate"
        session["pending_question"] = question
        answer = render_disambiguation_prompt(candidates, question, session)
        return {
            "answer": answer,
            "stage": "disambiguate",
            "mode": "disambiguate",
            "session": session,
            "matches": collect_used_matches(matches, candidates[:3]),
            "matched_edges": edge_matches,
            "recommendations": candidates[:2],
            "alternatives": candidates[2:4],
            "next_question": question["question"],
            "question_reason": question["reason"],
            "candidate_plans": candidate_plans,
            "current_plan": candidates[0],
            "explanations": [],
        }

    chosen = current_candidate or candidates[0]
    session["selected_candidate_id"] = chosen["id"]
    session["stage"] = "summary"
    session["mode"] = "summary"
    answer = render_plan_summary(chosen, session, candidates)
    return {
        "answer": answer,
        "stage": "summary",
        "mode": "summary",
        "session": session,
        "matches": collect_used_matches(matches, [chosen]),
        "matched_edges": edge_matches,
        "recommendations": [chosen],
        "alternatives": candidates[1:3],
        "next_question": "세부 설명이 필요하면 이동안, 숙소, 추천 이유를 물어봐도 된다.",
        "question_reason": "현재 제약 기준으로 가장 우세한 미니 플랜을 요약했다.",
        "candidate_plans": candidate_plans,
        "current_plan": chosen,
        "explanations": build_explanation_points(chosen),
    }


def session_summary_query(session: dict[str, Any]) -> str:
    parts = []
    if session.get("constraints", {}).get("origin"):
        parts.append(session["constraints"]["origin"])
    parts.extend(session.get("preferences", {}).get("themes", []))
    parts.extend(session.get("destination_preference_ids", []))
    if session.get("selected_candidate_id"):
        parts.append(session["selected_candidate_id"])
    return " ".join(parts) or "japan travel"


def missing_requirements(session: dict[str, Any]) -> list[str]:
    constraints = session.get("constraints", {})
    missing = [key for key in REQUIRED_CONSTRAINT_KEYS if not constraints.get(key)]
    if not session.get("preferences", {}).get("themes") and not session.get("theme_prompt_resolved"):
        missing.append("themes")
    return missing


def build_collect_prompt(session: dict[str, Any], missing_key: str) -> tuple[str, str]:
    parts: list[str] = []
    constraints = session.get("constraints", {})
    for key in REQUIRED_CONSTRAINT_KEYS:
        value = constraints.get(key)
        if value:
            parts.append(render_requirement_status(key, value))
    preferences = session.get("preferences", {})
    themes = preferences.get("themes", [])
    if themes:
        parts.append("테마 " + ", ".join(display_label(item) for item in themes))
    elif session.get("theme_prompt_resolved"):
        parts.append("테마는 자유 선택")
    status_line = f"현재까지 반영: {' / '.join(parts)}" if parts else "현재까지 반영된 핵심 제약이 아직 없다."
    answer = f"{status_line}\n\n{render_missing_question(missing_key)}"
    return answer, collect_prompt_example(missing_key)


def render_requirement_status(key: str, value: Any) -> str:
    if key == "origin":
        return f"출발지 {display_label(str(value))}"
    if key == "depart_after":
        return f"출발 가능 {format_short_dt(str(value))} 이후"
    if key == "return_depart_before":
        return f"일본 출발 {format_short_dt(str(value))} 이전"
    if key == "total_budget_max":
        return f"예산 상한 {format_krw(int(value))}"
    return f"{key} {value}"


def render_missing_question(key: str) -> str:
    if key == "origin":
        return "플랜을 시작하려면 먼저 한국 출발지를 알아야 한다. 인천(ICN)인지 부산/김해(PUS)인지 알려줘."
    if key == "depart_after":
        return "한국에서 언제 이후에 출발 가능한지 알려줘. 날짜와 시각이 있어야 출발편을 걸러낼 수 있다."
    if key == "return_depart_before":
        return "일본에서 언제 이전에 출발해야 하는지 알려줘. 귀국편 제한이 있어야 후보를 줄일 수 있다."
    if key == "total_budget_max":
        return "총 예산 상한을 알려줘. 항공, 숙소, 활동을 예산 안에서 조합해야 한다."
    if key == "themes":
        return "선호 테마를 알려줘. 예를 들면 미식, 온천, 쇼핑, 자연이다. 상관없으면 '아무거나'라고 입력하면 된다."
    return "추가 제약을 알려줘."


def collect_prompt_example(key: str) -> str:
    if key == "origin":
        return "예: 인천 출발"
    if key == "depart_after":
        return "예: 3/22 18시 이후 출발"
    if key == "return_depart_before":
        return "예: 일본에서 3/24 19시 이전 출발"
    if key == "total_budget_max":
        return "예: 최대 예산 60만원"
    if key == "themes":
        return "예: 미식+온천, 또는 아무거나"
    return "예: 최대 예산 60만원"


def pick_current_candidate(session: dict[str, Any], candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    selected_id = session.get("selected_candidate_id", "")
    if selected_id:
        return next((item for item in candidates if item["id"] == selected_id), None)
    destination_ids = set(session.get("destination_preference_ids", []))
    if destination_ids:
        return next((item for item in candidates if item["city_id"] in destination_ids), None)
    return None


def candidate_to_plan_option(candidate: dict[str, Any]) -> dict[str, Any]:
    city_tokens = normalized_tokens(candidate["city_title"])
    aliases = list(city_tokens | {candidate["city_id"]})
    return {
        "id": candidate["id"],
        "title": candidate["title"],
        "city_id": candidate["city_id"],
        "city_title": candidate["city_title"],
        "aliases": aliases,
        "estimated_total_krw": candidate["estimated_total_krw"],
        "route_mode": candidate.get("route_mode", ""),
        "score": candidate["score"],
    }


def choose_disambiguation_question(candidates: list[dict[str, Any]], session: dict[str, Any]) -> dict[str, Any] | None:
    top = candidates[:4]
    questions: list[dict[str, Any]] = []
    modes = {item.get("route_mode") for item in top if item.get("route_mode")}
    if len(modes) > 1 and "ferry_ok" not in session.get("preferences", {}):
        ferry_count = sum(1 for item in top if item.get("route_mode") == "ferry")
        flight_count = sum(1 for item in top if item.get("route_mode") == "flight")
        questions.append(
            {
                "kind": "route_mode",
                "question": "비행보다 배도 괜찮아요?",
                "reason": f"상위 후보가 항공 {flight_count}개, 배편 {ferry_count}개로 갈린다.",
                "impact": 40 + abs(ferry_count - flight_count) * 6,
            }
        )
    travel_minutes = [item.get("travel_minutes", 0) for item in top if item.get("travel_minutes", 0)]
    totals = [item.get("estimated_total_krw", 0) for item in top]
    if travel_minutes and totals and "travel_priority" not in session.get("preferences", {}):
        duration_spread = max(travel_minutes) - min(travel_minutes)
        budget_spread = max(totals) - min(totals)
        if duration_spread >= 90 or budget_spread >= 50000:
            questions.append(
                {
                    "kind": "travel_priority",
                    "question": "이동 시간을 줄이는 게 제일 중요해요, 아니면 예산을 더 아끼는 게 중요해요?",
                    "reason": f"상위 후보의 이동시간 차이가 {duration_spread}분, 총액 차이가 {format_krw(budget_spread)} 수준이다.",
                    "impact": max(duration_spread / 6, budget_spread / 6000),
                }
            )
    stay_prices = [item.get("stay_price_krw", 0) for item in top if item.get("stay_price_krw", 0)]
    if stay_prices and "lodging_priority" not in session.get("preferences", {}):
        stay_spread = max(stay_prices) - min(stay_prices)
        if stay_spread >= 20000:
            questions.append(
                {
                    "kind": "lodging_priority",
                    "question": "숙소는 가성비가 우선인가요, 위치가 우선인가요?",
                    "reason": f"상위 후보의 숙소 1박 차이가 {format_krw(stay_spread)} 수준이라 숙소 성향에 따라 순위가 달라진다.",
                    "impact": stay_spread / 4000,
                }
            )
    if "theme_balance" not in session.get("preferences", {}) and not session.get("preferences", {}).get("themes"):
        food = sum(1 for item in top if any("미식" in theme for theme in item.get("themes", [])))
        shopping = sum(1 for item in top if any("쇼핑" in theme for theme in item.get("themes", [])))
        if food and shopping:
            questions.append(
                {
                    "kind": "theme_balance",
                    "question": "쇼핑보다 음식 비중이 더 높아요?",
                    "reason": "상위 후보가 미식형과 쇼핑형으로 갈려 있다.",
                    "impact": 24 + abs(food - shopping) * 3,
                }
            )
    if not questions:
        return None
    questions.sort(key=lambda item: item["impact"], reverse=True)
    return questions[0]


def render_candidate_blurb(candidate: dict[str, Any], index: int | None = None) -> str:
    prefix = f"{index}. " if index is not None else "- "
    route = "배편" if candidate.get("route_mode") == "ferry" else "항공"
    stay = candidate.get("primary_stay_title") or "숙소 미정"
    activities = ", ".join(candidate.get("activity_titles", [])[:2]) or "현지 자유시간"
    return (
        f"{prefix}{candidate['city_title']} · {route} · {stay} · {activities} · "
        f"예상총액 {format_krw(candidate['estimated_total_krw'])}"
    )


def render_disambiguation_prompt(candidates: list[dict[str, Any]], question: dict[str, Any], session: dict[str, Any]) -> str:
    lines = [
        "현재 남은 상위 미니 플랜들을 먼저 비교했다.",
        render_constraint_summary(session.get("constraints", {}), session.get("preferences", {})),
        "",
    ]
    for index, candidate in enumerate(candidates[:3], start=1):
        lines.append(render_candidate_blurb(candidate, index))
    lines.extend(["", f"가장 크게 갈리는 질문: {question['question']}", f"이 질문을 묻는 이유: {question['reason']}"])
    return "\n".join(lines)


def build_explanation_points(candidate: dict[str, Any]) -> list[str]:
    points = [
        f"왕복 이동은 {candidate.get('route_mode_label', '이동안')} 기준이다.",
        f"예상 총액은 {format_krw(candidate['estimated_total_krw'])}이다.",
        f"대표 숙소는 {candidate.get('primary_stay_title') or '미지정'}이다.",
    ]
    if candidate.get("activity_titles"):
        points.append("대표 활동은 " + ", ".join(candidate["activity_titles"][:2]) + "이다.")
    return points


def render_plan_summary(candidate: dict[str, Any], session: dict[str, Any], candidates: list[dict[str, Any]]) -> str:
    lines = [
        f"현재 추천 미니 플랜: {candidate['city_title']}",
        f"- 이동: {candidate.get('transport_summary', '기본 이동안')}",
        f"- 숙소: {candidate.get('primary_stay_title') or '미지정'}",
        f"- 활동: {', '.join(candidate.get('activity_titles', [])[:2]) or '현지 자유시간'}",
        f"- 예상 총액: {format_krw(candidate['estimated_total_krw'])}",
        f"- 추천 이유: {candidate['reason']}",
    ]
    if candidate.get("conflicts"):
        lines.append(f"- 남은 충돌: {' / '.join(candidate['conflicts'])}")
    else:
        lines.append("- 남은 하드 충돌 없음")
    if session.get("destination_preference_ids") and candidate["city_id"] not in session.get("destination_preference_ids", []):
        lines.append("- 참고: 사용자가 언급한 목적지와 다르지만 현재 제약 기준 점수는 이 안이 더 높다.")
    if len(candidates) > 1:
        lines.extend(["", "대안:", render_candidate_blurb(candidates[1], 2)])
    return "\n".join(lines)


def render_explain_answer(candidate: dict[str, Any], session: dict[str, Any]) -> str:
    lines = [
        f"{candidate['city_title']} 안의 상세 설명이다.",
        f"- 기본 이동안: {candidate.get('transport_summary', '정보 부족')}",
        f"- 왕복 이동시간: {candidate.get('travel_minutes', 0)}분",
        f"- 숙소: {candidate.get('primary_stay_title') or '미지정'} / 1박 {format_krw(candidate.get('stay_price_krw', 0))}",
        f"- 대표 활동: {', '.join(candidate.get('activity_titles', [])[:2]) or '현지 자유시간'}",
        f"- 왜 추천했나: {candidate['reason']}",
    ]
    if session.get("destination_preference_ids"):
        lines.append(f"- 현재 반영된 목적지 선호: {', '.join(session['destination_preference_ids'])}")
    return "\n".join(lines)


def collect_used_matches(matches: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    used_ids: set[str] = set()
    for candidate in candidates:
        used_ids.update(candidate.get("used_node_ids", []))
    return [item for item in matches if item.get("id") in used_ids][:10] or matches[:10]


def generate_candidate_plans(graph: dict[str, Any], index: GraphIndex, session: dict[str, Any]) -> list[dict[str, Any]]:
    origin_ref = session.get("constraints", {}).get("origin", "hub_icn")
    avoid_ids = set(session.get("constraints", {}).get("must_avoid_area", []))
    preferred_themes = session.get("preferences", {}).get("themes", [])
    destination_preferences = set(session.get("destination_preference_ids", []))
    activity_preferences = set(session.get("activity_preference_ids", []))
    depart_after = parse_iso_datetime(session.get("constraints", {}).get("depart_after"))
    return_before = parse_iso_datetime(session.get("constraints", {}).get("return_depart_before"))
    total_budget_max = session.get("constraints", {}).get("total_budget_max")
    cities = [node for node in graph.get("nodes", []) if node.get("type") == "City" and node["id"] not in avoid_ids]
    candidates = []
    for city in cities:
        candidate = evaluate_city_candidate(
            index,
            city,
            origin_ref,
            preferred_themes,
            depart_after,
            return_before,
            total_budget_max,
            destination_preferences,
            activity_preferences,
            session.get("preferences", {}),
        )
        if candidate:
            candidates.append(candidate)
    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates[:6]


def evaluate_city_candidate(
    index: GraphIndex,
    city: dict[str, Any],
    origin_ref: str,
    preferred_themes: list[str],
    depart_after: datetime | None,
    return_before: datetime | None,
    total_budget_max: int | None,
    destination_preferences: set[str],
    activity_preferences: set[str],
    preferences: dict[str, Any],
) -> dict[str, Any] | None:
    hub_ids = city_hubs(index, city["id"])
    outbound = select_transport(index, origin_ref, hub_ids, after=depart_after, before=None, direction="outbound")
    inbound = select_transport(index, origin_ref, hub_ids, after=None, before=return_before, direction="return")
    stays = select_stays(index, city["id"])
    activities = select_activities(index, city["id"], preferred_themes)

    conflicts: list[str] = []
    if not outbound:
        conflicts.append("출발 조건을 만족하는 국제 이동편이 부족함")
    if not inbound:
        conflicts.append("귀국 시각 조건을 만족하는 복귀편이 부족함")
    if not stays:
        conflicts.append("숙소 가격 근거가 부족함")

    outbound_price = int(outbound["price_krw"]) if outbound else 0
    inbound_price = int(inbound["price_krw"]) if inbound else 0
    stay_price = int(stays[0]["price_krw"]) if stays else 0
    activity_budget = sum(int(item.get("typical_budget_krw", 0)) for item in activities[:2])
    total_estimated = outbound_price + inbound_price + stay_price + activity_budget
    if total_budget_max is not None and total_estimated > total_budget_max:
        conflicts.append(f"총액 추정 {format_krw(total_estimated)}이 예산 상한 {format_krw(total_budget_max)}을 초과함")

    theme_score = theme_fit_score(index, city["id"], preferred_themes)
    trust_score = average_confidence([city] + [item["node"] for item in [outbound, inbound] if item] + [item["node"] for item in stays[:1]])
    freshness = average_freshness([item["node"] for item in [outbound, inbound] if item] + [item["node"] for item in stays[:1]])
    score = 100.0
    score += theme_score * 9.0
    score += trust_score * 8.0
    score += freshness * 4.0
    score -= len(conflicts) * 26.0
    if outbound:
        score -= outbound.get("duration_minutes", 0) / 180.0
    if inbound:
        score -= inbound.get("duration_minutes", 0) / 180.0
    if total_budget_max:
        budget_gap = max(total_estimated - total_budget_max, 0)
        score -= budget_gap / 30000.0
    if city["id"] in destination_preferences:
        score += 18.0
    if activity_preferences and any(item["activity_id"] in activity_preferences for item in activities[:3]):
        score += 8.0
    if preferences.get("ferry_ok") is False and (outbound or {}).get("node", {}).get("properties", {}).get("mode") == "ferry":
        score -= 22.0
    if preferences.get("travel_priority") == "time":
        score -= ((outbound.get("duration_minutes", 0) if outbound else 0) + (inbound.get("duration_minutes", 0) if inbound else 0)) / 60.0
    if preferences.get("travel_priority") == "budget":
        score -= total_estimated / 120000.0
    if preferences.get("lodging_priority") == "value" and stays:
        score += max(0.0, 60000.0 - float(stays[0]["price_krw"])) / 8000.0
    if preferences.get("theme_balance") == "shopping" and any("쇼핑" in theme for theme in city_theme_titles(index, city["id"])):
        score += 7.0
    if preferences.get("theme_balance") == "food" and any("미식" in theme for theme in city_theme_titles(index, city["id"])):
        score += 7.0

    used_node_ids = {city["id"]}
    if outbound:
        used_node_ids.add(outbound["node"]["id"])
        used_node_ids.update(outbound["observation_ids"])
    if inbound:
        used_node_ids.add(inbound["node"]["id"])
        used_node_ids.update(inbound["observation_ids"])
    if stays:
        used_node_ids.add(stays[0]["node"]["id"])
        used_node_ids.update(stays[0]["observation_ids"])
    used_node_ids.update(item["node"]["id"] for item in activities[:2])

    return {
        "id": f"candidate_{city['id']}",
        "title": f"{city['title']} 미니 플랜",
        "city_id": city["id"],
        "city_title": city["title"],
        "score": round(score, 2),
        "status": "ready" if not conflicts else "partial",
        "estimated_total_krw": total_estimated,
        "conflicts": conflicts,
        "themes": city_theme_titles(index, city["id"]),
        "outbound": simplify_transport_choice(outbound),
        "return": simplify_transport_choice(inbound),
        "stay_options": stays,
        "activity_options": activities,
        "route_mode": (outbound or {}).get("node", {}).get("properties", {}).get("mode", ""),
        "route_mode_label": "배편" if (outbound or {}).get("node", {}).get("properties", {}).get("mode", "") == "ferry" else "항공",
        "travel_minutes": int((outbound or {}).get("duration_minutes", 0)) + int((inbound or {}).get("duration_minutes", 0)),
        "stay_price_krw": int(stays[0]["price_krw"]) if stays else 0,
        "primary_stay_title": stays[0]["title"] if stays else "",
        "activity_titles": [item["title"] for item in activities[:2]],
        "transport_summary": transport_summary(outbound, inbound),
        "used_node_ids": sorted(used_node_ids),
        "reason": summarize_candidate_reason(city, theme_score, total_estimated, conflicts),
    }


def city_hubs(index: GraphIndex, city_id: str) -> list[str]:
    hub_ids = [edge["to"] for edge in index.outgoing.get(city_id, []) if edge.get("label") == "HAS_TRANSIT_HUB"]
    nearby = [edge["to"] for edge in index.outgoing.get(city_id, []) if edge.get("label") in {"NEAR", "CONNECTED_TO"}]
    return list(dict.fromkeys(hub_ids + nearby))


def select_transport(
    index: GraphIndex,
    origin_ref: str,
    hub_ids: list[str],
    after: datetime | None,
    before: datetime | None,
    direction: str,
) -> dict[str, Any] | None:
    options = []
    for node in index.nodes_by_id.values():
        if node.get("type") != "TransportOption":
            continue
        props = node.get("properties", {})
        from_ref = str(props.get("from_ref", ""))
        to_ref = str(props.get("to_ref", ""))
        route_match = from_ref == origin_ref and to_ref in hub_ids if direction == "outbound" else to_ref == origin_ref and from_ref in hub_ids
        if not route_match:
            continue
        observations = subject_observations(index, node["id"])
        for observation in observations:
            value = observation.get("properties", {}).get("value", {})
            depart_at = parse_iso_datetime(value.get("depart_at"))
            if after and (not depart_at or depart_at < after):
                continue
            if before and (not depart_at or depart_at > before):
                continue
            price_krw = int(value.get("price_krw", 0) or 0)
            duration_minutes = int(value.get("duration_minutes", node.get("latest_values", {}).get("duration_minutes", 0) or 0))
            options.append(
                {
                    "node": node,
                    "observation": observation,
                    "price_krw": price_krw,
                    "duration_minutes": duration_minutes,
                    "depart_at": value.get("depart_at", ""),
                    "arrive_at": value.get("arrive_at", ""),
                    "label": value.get("label") or node.get("title"),
                    "observation_ids": [observation["id"]],
                }
            )
    options.sort(key=lambda item: (item["price_krw"], item["depart_at"] or ""))
    return options[0] if options else None


def simplify_transport_choice(choice: dict[str, Any] | None) -> dict[str, Any] | None:
    if not choice:
        return None
    node = choice["node"]
    return {
        "transport_id": node["id"],
        "title": node["title"],
        "label": choice.get("label", node["title"]),
        "mode": node.get("properties", {}).get("mode", ""),
        "price_krw": choice.get("price_krw", 0),
        "depart_at": choice.get("depart_at", ""),
        "arrive_at": choice.get("arrive_at", ""),
        "duration_minutes": choice.get("duration_minutes", 0),
    }


def select_stays(index: GraphIndex, city_id: str) -> list[dict[str, Any]]:
    options = []
    valid_places = {city_id}
    for edge in index.outgoing.get(city_id, []):
        if edge.get("label") == "CONTAINS":
            valid_places.add(edge.get("to"))
    for node in index.nodes_by_id.values():
        if node.get("type") not in {"Lodging", "StayOption"}:
            continue
        props = node.get("properties", {})
        place_ref = str(props.get("place_ref", ""))
        if place_ref not in valid_places:
            continue
        price = latest_numeric_value(node, "price_krw")
        options.append(
            {
                "stay_id": node["id"],
                "title": node["title"],
                "price_krw": price,
                "node": node,
                "observation_ids": [item["id"] for item in subject_observations(index, node["id"])[:1]],
                "budget_level": props.get("budget_level") or props.get("price_band_krw", ""),
            }
        )
    options.sort(key=lambda item: (item["price_krw"] or 999999999, item["title"]))
    return options[:3]


def select_activities(index: GraphIndex, city_id: str, preferred_themes: list[str]) -> list[dict[str, Any]]:
    activity_nodes = []
    valid_places = {city_id}
    for edge in index.outgoing.get(city_id, []):
        if edge.get("label") == "CONTAINS":
            valid_places.add(edge.get("to"))
    for node in index.nodes_by_id.values():
        if node.get("type") not in {"Attraction", "Restaurant", "ActivityOption"}:
            continue
        place_ref = str(node.get("properties", {}).get("place_ref", ""))
        if place_ref not in valid_places:
            continue
        matched_themes = [edge["to"] for edge in index.outgoing.get(node["id"], []) if edge.get("label") == "MATCHES_THEME"]
        theme_score = len(set(matched_themes) & set(preferred_themes))
        activity_nodes.append(
            {
                "activity_id": node["id"],
                "title": node["title"],
                "node": node,
                "matched_themes": matched_themes,
                "score": theme_score * 10 + float(node.get("confidence", 0.75) or 0.75),
                "typical_budget_krw": int(node.get("properties", {}).get("typical_budget_krw", node.get("properties", {}).get("meal_budget_krw", 0)) or 0),
            }
        )
    activity_nodes.sort(key=lambda item: item["score"], reverse=True)
    return activity_nodes[:5]


def subject_observations(index: GraphIndex, subject_id: str) -> list[dict[str, Any]]:
    items = []
    for edge in index.outgoing.get(subject_id, []):
        if edge.get("label") != "SUPPORTED_BY":
            continue
        node = index.nodes_by_id.get(edge.get("to"))
        if node and node.get("type") == "Observation":
            items.append(node)
    items.sort(key=observation_sort_key, reverse=True)
    return items


def latest_numeric_value(node: dict[str, Any], key: str) -> int:
    latest_values = node.get("latest_values", {})
    if key in latest_values:
        try:
            return int(latest_values[key])
        except (TypeError, ValueError):
            return 0
    return int(node.get("properties", {}).get(key, 0) or 0)


def theme_fit_score(index: GraphIndex, city_id: str, preferred_themes: list[str]) -> float:
    if not preferred_themes:
        return 1.0
    matched = set()
    for edge in index.outgoing.get(city_id, []):
        if edge.get("label") == "MATCHES_THEME":
            matched.add(edge.get("to"))
    for edge in index.outgoing.get(city_id, []):
        if edge.get("label") in {"HAS_ATTRACTION", "HAS_RESTAURANT", "HAS_EVENT", "HAS_LODGING"}:
            for sub_edge in index.outgoing.get(edge.get("to"), []):
                if sub_edge.get("label") == "MATCHES_THEME":
                    matched.add(sub_edge.get("to"))
    return len(matched & set(preferred_themes)) / max(len(preferred_themes), 1)


def city_theme_titles(index: GraphIndex, city_id: str) -> list[str]:
    titles = []
    for edge in index.outgoing.get(city_id, []):
        if edge.get("label") != "MATCHES_THEME":
            continue
        theme = index.nodes_by_id.get(edge.get("to"))
        if theme:
            titles.append(theme["title"])
    return titles


def average_confidence(nodes: list[dict[str, Any]]) -> float:
    if not nodes:
        return 0.0
    return round(sum(float(node.get("confidence", 0.75) or 0.75) for node in nodes) / len(nodes), 3)


def average_freshness(nodes: list[dict[str, Any]]) -> float:
    if not nodes:
        return 0.0
    return round(sum(freshness_bonus(node) for node in nodes) / len(nodes), 3)


def summarize_candidate_reason(city: dict[str, Any], theme_score: float, total_estimated: int, conflicts: list[str]) -> str:
    parts = [f"{city['title']}는 기본 총액이 {format_krw(total_estimated)} 수준이다."]
    if theme_score > 0:
        parts.append("요청한 테마와 맞는 노드 연결이 있다.")
    if conflicts:
        parts.append("제약 충돌: " + ", ".join(conflicts[:2]))
    else:
        parts.append("현재 제약 기준으로 큰 충돌이 없다.")
    return " ".join(parts)


def transport_summary(outbound: dict[str, Any] | None, inbound: dict[str, Any] | None) -> str:
    if not outbound or not inbound:
        return "이동 근거 부족"
    mode = "배편" if outbound.get("node", {}).get("properties", {}).get("mode") == "ferry" else "항공"
    return (
        f"{mode} 왕복 / 출발 {format_short_dt(outbound.get('depart_at'))} / "
        f"귀국 {format_short_dt(inbound.get('depart_at'))} / "
        f"교통 {format_krw(int(outbound.get('price_krw', 0)) + int(inbound.get('price_krw', 0)))}"
    )


def candidate_to_city_option(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "city_id": candidate["city_id"],
        "title": candidate["city_title"],
        "estimated_total_krw": candidate["estimated_total_krw"],
        "conflicts": candidate["conflicts"],
        "score": candidate["score"],
    }


def build_transport_options(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    outbound = candidate.get("outbound")
    inbound = candidate.get("return")
    if not outbound or not inbound:
        return []
    total = int(outbound.get("price_krw", 0)) + int(inbound.get("price_krw", 0))
    return [
        {
            "transport_bundle_id": f"bundle_{candidate['city_id']}",
            "title": f"{candidate['city_title']} 기본 이동안",
            "outbound": outbound,
            "return": inbound,
            "transport_total_krw": total,
        }
    ]


def build_stay_options(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    return candidate.get("stay_options", [])


def build_activity_options(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    return candidate.get("activity_options", [])


def render_city_prompt(session: dict[str, Any], city_options: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> str:
    constraints = session.get("constraints", {})
    lines = [
        "현재 제약을 반영해 먼저 도시 후보를 좁혔다.",
        render_constraint_summary(constraints, session.get("preferences", {})),
        "",
    ]
    for index, option in enumerate(city_options, start=1):
        conflict_text = " / ".join(option["conflicts"]) if option["conflicts"] else "하드 제약 충돌 없음"
        lines.append(
            f"{index}. {option['title']} · 예상총액 {format_krw(option['estimated_total_krw'])} · score {option['score']} · {conflict_text}"
        )
    if candidates:
        lines.extend(["", f"현재 추천: {candidates[0]['city_title']} - {candidates[0]['reason']}"])
    return "\n".join(lines)


def render_transport_prompt(candidate: dict[str, Any], transport_options: list[dict[str, Any]]) -> str:
    lines = [f"{candidate['city_title']}로 좁혔다. 이제 이동 조합을 고른다.", ""]
    for index, option in enumerate(transport_options, start=1):
        lines.append(
            f"{index}. 왕복 이동 {format_krw(option['transport_total_krw'])} / "
            f"출발 {format_short_dt(option['outbound'].get('depart_at'))} / "
            f"귀국 {format_short_dt(option['return'].get('depart_at'))}"
        )
    lines.append("")
    lines.append(f"현재 추천: {candidate['city_title']} 기본 이동안")
    return "\n".join(lines)


def render_stay_prompt(candidate: dict[str, Any], stay_options: list[dict[str, Any]]) -> str:
    lines = [f"{candidate['city_title']} 이동안이 잡혔다. 숙소 후보를 고른다.", ""]
    for index, option in enumerate(stay_options, start=1):
        lines.append(f"{index}. {option['title']} · 1박 추정 {format_krw(option['price_krw'])}")
    lines.append("")
    lines.append("현재 추천: 가장 최신 가격 관측값이 있는 가성비 숙소")
    return "\n".join(lines)


def render_activity_prompt(candidate: dict[str, Any], activity_options: list[dict[str, Any]]) -> str:
    lines = [f"{candidate['city_title']}에서 마지막으로 활동 축을 정한다.", ""]
    for index, option in enumerate(activity_options[:4], start=1):
        lines.append(
            f"{index}. {option['title']} · 예상소비 {format_krw(option.get('typical_budget_krw', 0))} · "
            f"테마 {', '.join(display_label(item) for item in option['matched_themes']) or '일반'}"
        )
    lines.append("")
    lines.append("현재 추천: 상위 2개 활동을 묶어 하루 동선으로 구성")
    return "\n".join(lines)


def render_summary(candidate: dict[str, Any], session: dict[str, Any]) -> str:
    transport = next(
        (
            item
            for item in session.get("option_state", {}).get("transport_options", [])
            if item.get("transport_bundle_id") == session.get("selected_transport_id")
        ),
        None,
    )
    stay = next(
        (
            item
            for item in session.get("option_state", {}).get("stay_options", [])
            if item.get("stay_id") == session.get("selected_stay_id")
        ),
        None,
    )
    selected_activity_ids = set(session.get("selected_activity_ids", []))
    activities = [
        item["title"]
        for item in session.get("option_state", {}).get("activity_options", [])
        if item.get("activity_id") in selected_activity_ids
    ]
    lines = [
        f"현재 플랜 요약: {candidate['city_title']}",
        f"- 이동: {transport['title'] if transport else '기본 이동안'}",
        f"- 숙소: {stay['title'] if stay else '미선택'}",
        f"- 활동: {', '.join(activities) if activities else '현지 자유시간 중심'}",
        f"- 예상 총액: {format_krw(candidate['estimated_total_krw'])}",
        f"- 테마: {', '.join(candidate['themes']) or '일반 단기여행'}",
    ]
    if candidate["conflicts"]:
        lines.append(f"- 남은 충돌: {' / '.join(candidate['conflicts'])}")
    else:
        lines.append("- 남은 하드 충돌 없음")
    lines.append("")
    lines.append("대안 비교는 채팅에 새 제약을 추가하거나 '새 플랜'으로 다시 시작하면 된다.")
    return "\n".join(lines)


def render_constraint_summary(constraints: dict[str, Any], preferences: dict[str, Any]) -> str:
    parts = []
    if constraints.get("origin"):
        parts.append(f"출발지 {display_label(constraints['origin'])}")
    if constraints.get("depart_after"):
        parts.append(f"출발 가능 {format_short_dt(constraints['depart_after'])} 이후")
    if constraints.get("return_depart_before"):
        parts.append(f"일본 출발 {format_short_dt(constraints['return_depart_before'])} 이전")
    if constraints.get("total_budget_max"):
        parts.append(f"예산 상한 {format_krw(int(constraints['total_budget_max']))}")
    if preferences.get("themes"):
        parts.append(f"테마 {', '.join(display_label(item) for item in preferences['themes'])}")
    return " / ".join(parts) if parts else "아직 명시 제약이 적어서 일반 추천 폭이 넓다."


def format_krw(value: int) -> str:
    return f"{value:,}원"


def format_short_dt(value: str) -> str:
    dt = parse_iso_datetime(value)
    if not dt:
        return value or "-"
    return dt.strftime("%m/%d %H:%M")


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def display_label(value: str) -> str:
    return DISPLAY_LABELS.get(value, value)
