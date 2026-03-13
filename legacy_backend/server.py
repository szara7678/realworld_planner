from __future__ import annotations

import json
import os
import socket
import subprocess
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from planner_engine import (
    build_context,
    create_session_payload,
    ensure_graph_defaults,
    is_planner_query,
    load_schema,
    plan_next_step,
    refresh_derived_values,
    related_edges,
    search_graph,
    update_session_from_query,
)

BASE_DIR = Path(__file__).resolve().parent
GRAPH_PATH = BASE_DIR / "graph-state.json"
ENV_PATH = BASE_DIR / ".env"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
GRAPH_SCHEMA = load_schema(BASE_DIR)
SESSION_STORE: dict[str, dict] = {}


def load_env_file() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_env_file()


def load_graph() -> dict:
    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    return ensure_graph_defaults(graph, GRAPH_SCHEMA)


def save_graph(payload: dict) -> dict:
    graph = ensure_graph_defaults(payload, GRAPH_SCHEMA)
    graph.setdefault("meta", {})
    graph["meta"]["updatedAt"] = datetime.now(timezone.utc).isoformat()
    refresh_derived_values(graph)
    GRAPH_PATH.write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
    return graph


def build_local_search_answer(query: str, matches: list[dict], matched_edges: list[dict]) -> str:
    if not matches:
        return "직접 매칭된 노드가 아직 적다. 도시명, 테마, 공항, 예산 같은 키워드를 더 구체적으로 넣어줘."
    lines = [f"'{query}' 기준으로 연결이 강한 노드를 먼저 골랐다.", ""]
    for item in matches[:5]:
        props = item.get("latest_values") or item.get("properties") or {}
        summary = ", ".join(f"{key}={value}" for key, value in list(props.items())[:3])
        lines.append(f"- [{item['type']}] {item['title']} : {summary or item.get('notes', '')}")
    if matched_edges:
        lines.extend(["", "연결 정보:"])
        for edge in matched_edges[:6]:
            lines.append(f"- {edge['from']} -> {edge['label']} -> {edge['to']}")
    return "\n".join(lines)


def call_openrouter(query: str, graph: dict, matches: list[dict], model: str, api_key: str) -> str:
    context = build_context(graph, matches)
    system = (
        "You are a travel graph retrieval assistant. "
        "Use the provided graph context first, stay factual, and answer in concise Korean. "
        "Mention uncertainty when schedule or price evidence is incomplete."
    )
    user = f"Question: {query}\n\nGraph context:\n{context}"
    payload = {
        "model": model or "openai/gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": 500,
    }
    req = Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8765",
            "X-Title": "Realworld Planner",
        },
        method="POST",
    )
    with urlopen(req, timeout=45) as response:
        body = json.loads(response.read().decode("utf-8"))
        return ((body.get("choices") or [{}])[0].get("message") or {}).get("content", "")


class PlannerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self) -> None:
        if self.path == "/api/graph":
            self.respond_json(load_graph())
            return
        if self.path == "/api/schema":
            self.respond_json(GRAPH_SCHEMA)
            return
        if self.path == "/api/health":
            self.respond_json({"ok": True, "planner_sessions": len(SESSION_STORE)})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/graph":
            self.handle_save_graph()
            return
        if self.path == "/api/search":
            self.handle_search()
            return
        if self.path == "/api/plan/session":
            self.handle_plan_session()
            return
        if self.path == "/api/plan/step":
            self.handle_plan_step()
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def handle_save_graph(self) -> None:
        payload = self.read_json()
        if not isinstance(payload, dict) or "nodes" not in payload or "edges" not in payload:
            self.respond_json({"error": "Invalid graph payload"}, HTTPStatus.BAD_REQUEST)
            return
        graph = save_graph(payload)
        self.respond_json({"ok": True, "updatedAt": graph.get("meta", {}).get("updatedAt", "")})

    def handle_search(self) -> None:
        payload = self.read_json()
        query = (payload or {}).get("query", "").strip()
        model = (payload or {}).get("model", "").strip()
        api_key = ((payload or {}).get("apiKey") or os.environ.get("OPENROUTER_API_KEY", "")).strip()
        graph = load_graph()
        matches = search_graph(graph, query, GRAPH_SCHEMA)
        matched_edges = related_edges(graph, matches)
        response = {
            "matches": matches,
            "matched_edges": matched_edges,
            "answer": "",
            "used_openrouter": False,
            "model": model or "openai/gpt-4o-mini",
            "graph_context": build_context(graph, matches),
            "schema_version": GRAPH_SCHEMA.get("version", "2.0"),
        }
        if not query:
            self.respond_json(response)
            return
        response["answer"] = build_local_search_answer(query, matches, matched_edges)
        if is_planner_query(query):
            response["answer"] += "\n\n이 입력은 제약 기반 플래너로도 해석될 수 있다. 채팅 UI에서는 자동으로 플래너 단계 응답을 우선 사용한다."
        if not api_key:
            self.respond_json(response)
            return
        try:
            response["answer"] = call_openrouter(query, graph, matches, model, api_key)
            response["used_openrouter"] = True
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="ignore")
            response["answer"] = f"OpenRouter HTTP {error.code}: {detail[:300]}"
        except URLError as error:
            response["answer"] = f"OpenRouter 연결 실패: {error.reason}"
        except Exception as error:
            response["answer"] = f"OpenRouter 호출 실패: {error}"
        self.respond_json(response)

    def handle_plan_session(self) -> None:
        payload = self.read_json()
        graph = load_graph()
        session_id = (payload or {}).get("session_id") or ""
        query = (payload or {}).get("query", "").strip()
        session = SESSION_STORE.get(session_id) or create_session_payload(session_id or None)
        if query:
            update_session_from_query(graph, GRAPH_SCHEMA, session, query)
        constraints = (payload or {}).get("constraints") or {}
        preferences = (payload or {}).get("preferences") or {}
        session.setdefault("constraints", {}).update(constraints)
        session.setdefault("preferences", {}).update(preferences)
        SESSION_STORE[session["id"]] = session
        self.respond_json({"ok": True, "session": session, "schema": GRAPH_SCHEMA})

    def handle_plan_step(self) -> None:
        payload = self.read_json()
        graph = load_graph()
        query = (payload or {}).get("query", "").strip()
        session_id = (payload or {}).get("session_id") or ""
        session = SESSION_STORE.get(session_id) or create_session_payload(session_id or None)
        if query:
            update_session_from_query(graph, GRAPH_SCHEMA, session, query)
        result = plan_next_step(graph, GRAPH_SCHEMA, session)
        SESSION_STORE[session["id"]] = session
        self.respond_json(
            {
                "ok": True,
                "answer": result["answer"],
                "stage": result["stage"],
                "mode": result.get("mode", result["stage"]),
                "session": result["session"],
                "matches": result["matches"],
                "matched_edges": result["matched_edges"],
                "recommendations": result["recommendations"],
                "alternatives": result["alternatives"],
                "next_question": result["next_question"],
                "question_reason": result.get("question_reason", ""),
                "candidate_plans": result.get("candidate_plans", []),
                "current_plan": result.get("current_plan"),
                "explanations": result.get("explanations", []),
            }
        )

    def read_json(self) -> dict | None:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def respond_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def local_ip() -> str:
    windows_ip = windows_host_ip()
    if windows_ip:
        return windows_ip
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def windows_host_ip() -> str:
    if "microsoft" not in os.uname().release.lower():
        return ""
    command = [
        "powershell.exe",
        "-NoProfile",
        "-Command",
        (
            "Get-NetIPAddress -AddressFamily IPv4 | "
            "Where-Object { $_.IPAddress -like '10.*' -or $_.IPAddress -like '172.*' -or $_.IPAddress -like '192.168.*' } | "
            "Where-Object { $_.InterfaceAlias -notlike 'vEthernet*' -and $_.IPAddress -ne '127.0.0.1' } | "
            "Select-Object -ExpandProperty IPAddress"
        ),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        candidates = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        return candidates[0] if candidates else ""
    except Exception:
        return ""


def main() -> None:
    host = os.environ.get("VACATION_HOST", "0.0.0.0")
    port = int(os.environ.get("VACATION_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), PlannerHandler)
    print(f"Realworld Planner: http://127.0.0.1:{port}/graph-editor.html")
    print(f"Same network URL: http://{local_ip()}:{port}/graph-editor.html")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
