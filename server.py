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

BASE_DIR = Path(__file__).resolve().parent
GRAPH_PATH = BASE_DIR / "graph-state.json"
ENV_PATH = BASE_DIR / ".env"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


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
    return json.loads(GRAPH_PATH.read_text(encoding="utf-8"))


def save_graph(payload: dict) -> None:
    payload.setdefault("meta", {})
    payload["meta"]["updatedAt"] = datetime.now(timezone.utc).isoformat()
    GRAPH_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def search_graph(graph: dict, query: str) -> list[dict]:
    terms = [term.strip().lower() for term in query.split() if term.strip()]
    query_lower = query.lower()
    if not terms:
        return []

    results: list[dict] = []
    for node in graph.get("nodes", []):
        haystack = " ".join(
            [
                node.get("id", ""),
                node.get("type", ""),
                node.get("title", ""),
                node.get("notes", ""),
                json.dumps(node.get("properties", {}), ensure_ascii=False),
            ]
        ).lower()
        title = str(node.get("title", "")).lower()
        score = sum(haystack.count(term) for term in terms)
        if any(term in title for term in terms):
            score += 3
        if title and title in query_lower:
            score += 6
        if node.get("type") in {"Scenario", "Transport", "PriceEvidence"}:
            score += 1
        if score:
            results.append(
                {
                    "kind": "node",
                    "id": node.get("id"),
                    "title": node.get("title"),
                    "type": node.get("type"),
                    "notes": node.get("notes", ""),
                    "properties": node.get("properties", {}),
                    "score": score,
                }
            )

    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:8]


def related_edges(graph: dict, matches: list[dict]) -> list[dict]:
    node_ids = {item["id"] for item in matches}
    edges: list[dict] = []
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
    return edges[:12]


def build_context(graph: dict, matches: list[dict]) -> str:
    parts = [
        f"Graph title: {graph.get('meta', {}).get('title', '')}",
        "Top graph matches:",
    ]
    for item in matches:
        props = ", ".join(f"{k}={v}" for k, v in item.get("properties", {}).items())
        parts.append(
            f"- [{item['type']}] {item['title']} ({item['id']}): {item.get('notes', '')} | {props}"
        )
    return "\n".join(parts)


def call_openrouter(query: str, graph: dict, matches: list[dict], model: str, api_key: str) -> str:
    context = build_context(graph, matches)
    system = (
        "You are a travel graph search assistant. "
        "Use the provided graph context first, avoid inventing unavailable routes, "
        "and answer in concise Korean. "
        "Explicitly mention which matched items were used."
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
            "X-Title": "Vacation Graph Workspace",
        },
        method="POST",
    )
    with urlopen(req, timeout=45) as response:
        body = json.loads(response.read().decode("utf-8"))
        return ((body.get("choices") or [{}])[0].get("message") or {}).get("content", "")


class VacationHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self) -> None:
        if self.path == "/api/graph":
            self.respond_json(load_graph())
            return
        if self.path == "/api/health":
            self.respond_json({"ok": True})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/graph":
            self.handle_save_graph()
            return
        if self.path == "/api/search":
            self.handle_search()
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def handle_save_graph(self) -> None:
        payload = self.read_json()
        if not isinstance(payload, dict) or "nodes" not in payload or "edges" not in payload:
            self.respond_json({"error": "Invalid graph payload"}, HTTPStatus.BAD_REQUEST)
            return
        save_graph(payload)
        self.respond_json({"ok": True, "updatedAt": payload.get("meta", {}).get("updatedAt", "")})

    def handle_search(self) -> None:
        payload = self.read_json()
        query = (payload or {}).get("query", "").strip()
        model = (payload or {}).get("model", "").strip()
        api_key = ((payload or {}).get("apiKey") or os.environ.get("OPENROUTER_API_KEY", "")).strip()
        graph = load_graph()
        matches = search_graph(graph, query)
        response = {
            "matches": matches,
            "matched_edges": related_edges(graph, matches),
            "answer": "",
            "used_openrouter": False,
            "model": model or "openai/gpt-4o-mini",
            "graph_context": build_context(graph, matches),
        }
        if not query:
            self.respond_json(response)
            return
        if not api_key:
            response["answer"] = "OPENROUTER_API_KEY가 없어서 로컬 그래프 검색 결과만 보여준다."
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
    server = ThreadingHTTPServer((host, port), VacationHandler)
    print(f"Vacation Graph Workspace: http://127.0.0.1:{port}/graph-editor.html")
    print(f"Same network URL: http://{local_ip()}:{port}/graph-editor.html")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
