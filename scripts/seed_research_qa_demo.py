"""Create persistent, explicitly synthetic Research QA demo records via the app API.

Run only with APP_DATA_ROOT pointed at an isolated QA directory and
PO_HUB_QA_DEMO_CONFIRM=1. This script never clears or resets records.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

# Running this file as ``python scripts/seed_research_qa_demo.py`` places the
# scripts directory, rather than the repository root, on sys.path. Keep the
# documented one-command entry point working without changing app imports.
REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

import httpx

from backend.app.config import WORKSPACE_ROOT
from backend.app.db import get_database_path


PROJECT_NAME = "[QA DEMO] Puzzle Research — US Android 2026"
COLLECTION_NAME = "[QA DEMO] Report-linked puzzle comparison"
QA_MARKER = "[QA DEMO]"
QA_URLS = [f"https://example.invalid/qa/puzzle-fixture-{index}" for index in range(1, 6)]


def ensure_isolated_qa_database() -> Path:
    root = Path(os.environ.get("APP_DATA_ROOT", "")).expanduser().resolve()
    database = get_database_path().resolve()
    try:
        root.relative_to(WORKSPACE_ROOT.resolve())
    except ValueError as exc:
        raise SystemExit("Refusing to seed: APP_DATA_ROOT must be inside this repository's isolated QA directory.") from exc
    if not any(token in root.name.casefold() for token in ("qa", "demo", "uat", "test")):
        raise SystemExit("Refusing to seed: APP_DATA_ROOT directory name must identify QA/demo/UAT/test data.")
    if database == (WORKSPACE_ROOT / "data" / "po_intelligence_hub.sqlite3").resolve():
        raise SystemExit("Refusing to seed the default application database.")
    if os.environ.get("PO_HUB_QA_DEMO_CONFIRM") != "1":
        raise SystemExit("Set PO_HUB_QA_DEMO_CONFIRM=1 after verifying APP_DATA_ROOT is an isolated QA database.")
    if not database.is_file():
        raise SystemExit(f"Refusing to create a new database implicitly; isolated QA database not found: {database}")
    return database


def response_json(response, expected: tuple[int, ...] = (200, 201)) -> dict[str, Any]:
    if response.status_code not in expected:
        raise RuntimeError(f"API {response.request.method} {response.request.url} returned {response.status_code}: {response.text[:2000]}")
    return response.json()


def pages(client: TestClient, endpoint: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        params: dict[str, Any] = {"limit": 100}
        if cursor:
            params["cursor"] = cursor
        page = response_json(client.get(endpoint, params=params))
        result.extend(page["items"])
        cursor = page.get("next_cursor")
        if not cursor:
            return result


def finding(key: str, title: str, description: str, entity_keys: list[str], refs: list[str], implication: str, uncertainty: str) -> dict[str, Any]:
    return {
        "key": key,
        "finding_type": "qualitative_pattern",
        "title": f"{QA_MARKER} {title}",
        "description": description,
        "related_entities": entity_keys,
        "evidence_references": refs,
        "source_locations": [f"line:{9 + int(key[-1])}"],
        "scope": {"geo": "US", "environment": "Android", "research_period": "2026 · QA fixture"},
        "evidence_status": "unverified",
        "confidence": None,
        "uncertainty": uncertainty,
        "po_implications": implication,
    }


def rich_report_data() -> dict[str, Any]:
    entities = [
        {"key": "puzzle-alpha", "entity_type": "game concept", "name": "[QA DEMO] Puzzle Alpha", "attributes": {"description": "Synthetic QA entity; not a real product."}, "evidence_references": [QA_URLS[0], QA_URLS[1]]},
        {"key": "puzzle-beta", "entity_type": "game concept", "name": "[QA DEMO] Puzzle Beta", "attributes": {"description": "Synthetic QA entity; not a real product."}, "evidence_references": [QA_URLS[2], QA_URLS[3]]},
        {"key": "puzzle-gamma", "entity_type": "game concept", "name": "[QA DEMO] Puzzle Gamma", "attributes": {"description": "Synthetic QA entity; not a real product."}, "evidence_references": [QA_URLS[4]]},
    ]
    findings = [
        finding("finding-01", "A short play loop is described", "The fixture describes a compact puzzle turn followed by immediate feedback. This is invented fixture prose for interface testing only.", ["puzzle-alpha"], [QA_URLS[0]], "The PO may decide whether to investigate the described loop; this fixture is not a product recommendation.", "No real user observation or measurement is represented."),
        finding("finding-02", "Progress cues are discussed", "The fixture mentions visible progress between puzzle sessions and distinguishes that description from measured retention.", ["puzzle-alpha", "puzzle-beta"], [QA_URLS[1], QA_URLS[2]], "If relevant, validate progress comprehension with real users before making a product decision.", "No experiment, sample size, or outcome measurement is supplied."),
        finding("finding-03", "A social feature is only described for one concept", "A fixture note describes optional sharing for Puzzle Beta; it does not establish an effect on engagement.", ["puzzle-beta"], [QA_URLS[3]], "Consider whether the feature fits the product direction; do not infer impact from this example.", "No comparative user evidence is supplied."),
        finding("finding-04", "Content cadence remains unspecified", "The fixture does not describe an update schedule for Puzzle Gamma.", ["puzzle-gamma"], [QA_URLS[4]], "Decide whether to ask for a real content plan in a later research round.", "Cadence is unknown in this fixture."),
    ]
    return {
        "executive_summary": "[QA DEMO] Dữ liệu tổng hợp để kiểm tra luồng Research. Không phải báo cáo nghiên cứu thật; mọi kết luận, đối tượng và nguồn dưới đây chỉ là fixture.",
        "key_takeaways": ["[QA DEMO] Bốn phát hiện mẫu có liên kết tường minh.", "[QA DEMO] Nguồn fixture chưa xác minh.", "[QA DEMO] Không có metric hoặc kết luận định lượng."],
        "sections": [],
        "entities": entities,
        "findings": findings,
        "evidence_references": [
            {"url": url, "title": f"[QA DEMO] Fixture source {index}", "source_location": f"line:{8 + index}", "verified": False}
            for index, url in enumerate(QA_URLS, 1)
        ],
        "benchmark_dimensions": [
            {"key": "core-loop", "name": "Mô tả vòng chơi", "related_entities": ["puzzle-alpha", "puzzle-beta"], "evidence_references": [QA_URLS[0], QA_URLS[2]], "observations": [
                {"entity_key": "puzzle-alpha", "value": "Fixture: lượt ngắn và phản hồi ngay", "evidence_references": [QA_URLS[0]], "source_locations": ["line:10"], "evidence_status": "unverified", "uncertainty": "Văn bản mô phỏng."},
                {"entity_key": "puzzle-beta", "value": "Fixture: thử thách theo từng bước", "evidence_references": [QA_URLS[2]], "source_locations": ["line:11"], "evidence_status": "unverified", "uncertainty": "Văn bản mô phỏng."},
            ], "po_notes": None},
            {"key": "progress-cues", "name": "Tín hiệu tiến độ", "related_entities": ["puzzle-alpha", "puzzle-beta"], "evidence_references": [QA_URLS[1], QA_URLS[2]], "observations": [
                {"entity_key": "puzzle-alpha", "value": "Fixture: tiến độ hiển thị giữa lượt", "evidence_references": [QA_URLS[1]], "source_locations": ["line:11"], "evidence_status": "unverified", "uncertainty": "Chưa có thử nghiệm người dùng."},
            ], "po_notes": None},
            {"key": "social-features", "name": "Tính năng xã hội được nêu", "related_entities": ["puzzle-beta"], "evidence_references": [QA_URLS[3]], "observations": [
                {"entity_key": "puzzle-beta", "value": "Fixture: chia sẻ tùy chọn", "evidence_references": [QA_URLS[3]], "source_locations": ["line:12"], "evidence_status": "unverified", "uncertainty": "Không đo tác động."},
            ], "po_notes": None},
        ],
        "research_gaps": ["[QA DEMO] Không có dữ liệu người dùng thật.", "[QA DEMO] Không có chỉ số retention hoặc doanh thu.", "[QA DEMO] Lịch nội dung của Puzzle Gamma chưa được cung cấp."],
        "po_recommendations": ["[QA DEMO] Dùng fixture để kiểm tra điều hướng và lưu ghi chú; không dùng làm quyết định sản phẩm."],
        "quantitative_observations": [],
    }


def report_content(title: str, url_list: list[str], extra: str = "") -> str:
    source_lines = "\n".join(f"- Fixture nguồn {index}: {url}" for index, url in enumerate(url_list, 1))
    return (
        f"# {QA_MARKER} {title}\n\n"
        "> DỮ LIỆU MÔ PHỎNG CHỈ DÙNG CHO QA. Không phải nghiên cứu thật, không được dùng làm bằng chứng sản phẩm.\n\n"
        "## Phạm vi\n\nUS · Android · 2026 · Fixture QA.\n\n"
        "## Nội dung hỗ trợ\n\n"
        "Các mô tả dưới đây được tạo để kiểm tra liên kết finding, entity, nguồn và trạng thái chưa xác minh. "
        "Chúng không đại diện cho game, người dùng, thị trường hay dữ liệu đo lường có thật.\n\n"
        f"{extra}\n\n## Nguồn fixture chưa xác minh\n\n{source_lines}\n"
    )


def seed(client: httpx.Client) -> dict[str, Any]:
    projects = pages(client, "/api/v1/projects")
    matches = [item for item in projects if item["name"] == PROJECT_NAME]
    if len(matches) > 1:
        raise RuntimeError("More than one matching QA project exists; refusing to guess which project to reuse.")
    project = matches[0] if matches else response_json(client.post("/api/v1/projects", json={"name": PROJECT_NAME, "owner": "QA fixture", "category": "Puzzle · synthetic QA data"}))
    project_id = project["id"]

    rich = rich_report_data()
    report_specs = [
        ("structured", "[QA DEMO] Puzzle research — structured", report_content("Structured rich research fixture", QA_URLS, "### Report-supplied findings\n\nFour synthetic findings and three synthetic entities are linked in the structured payload."), rich),
        ("single", "[QA DEMO] Puzzle research — one finding", report_content("Single finding fixture", QA_URLS[:2], "### One finding\n\nOne synthetic finding linked to one synthetic entity."), {
            **rich,
            "executive_summary": "[QA DEMO] Fixture một finding và một entity; không phải nghiên cứu thật.",
            "key_takeaways": [],
            "entities": [rich["entities"][0]],
            "findings": [rich["findings"][0]],
            "evidence_references": rich["evidence_references"][:2],
            "benchmark_dimensions": [],
            "research_gaps": [],
            "po_recommendations": [],
        }),
    ]
    reports: dict[str, dict[str, Any]] = {}
    for key, question, content, data in report_specs:
        result = response_json(client.post("/api/v1/reports", json={
            "question": question, "geo": "US", "os": "Android", "research_period": "2026 · QA fixture",
            "project_id": project_id, "content": content,
            "structured_json": json.dumps({"schema_version": "po_research_v1", "research_data": data}, ensure_ascii=False),
        }))
        reports[key] = result

    text_content = report_content("Text-only research fixture", [], "This plain text report intentionally has no structured findings, entities, metrics, or evidence references.")
    reports["text"] = response_json(client.post("/api/v1/reports", json={
        "question": "[QA DEMO] Text-only research — structure needed", "geo": "US", "os": "Android",
        "research_period": "2026 · QA fixture", "project_id": project_id, "content": text_content,
    }))

    report_a = reports["structured"]
    report_id = report_a["id"]
    existing_entries = report_a.get("benchmark_workspace", {}).get("entries", [])
    entries_by_key = {(entry["item_type"], entry["item_key"]): entry for entry in existing_entries}
    if ("finding", "finding-02") not in entries_by_key:
        entries_by_key[("finding", "finding-02")] = {"item_type": "finding", "item_key": "finding-02", "po_assessment": "", "notes": "[QA DEMO] Ghi chú gắn với báo cáo, không phải quyết định chính thức của dự án.", "next_action": "", "dimension_assessments": {}, "observation_finding_links": {}}
    selections = list(report_a.get("benchmark_selections", []))
    selection_ids = {(item["item_type"], item["item_key"]) for item in selections}
    for entity_key in ("puzzle-alpha", "puzzle-beta"):
        if ("entity", entity_key) not in selection_ids:
            selections.append({"item_type": "entity", "item_key": entity_key})
    response_json(client.put(f"/api/v1/reports/{report_id}/benchmark-state", json={
        "custom_dimensions": report_a.get("benchmark_workspace", {}).get("custom_dimensions", []),
        "entries": list(entries_by_key.values()), "selections": selections,
    }))

    # Create project-scoped subjects/collection explicitly from report entity keys.
    subjects = pages(client, f"/api/v1/projects/{project_id}/subjects")
    subject_by_name = {item["name"]: item for item in subjects}
    subject_for_entity: dict[str, dict[str, Any]] = {}
    for entity in rich["entities"][:2]:
        subject = subject_by_name.get(entity["name"])
        if subject is None:
            subject = response_json(client.post(f"/api/v1/projects/{project_id}/subjects", json={
                "name": entity["name"], "subject_type": entity["entity_type"], "aliases": [], "external_ids": [],
                "provenance": {"origin": "qa_demo_seed", "demo": True, "report_id": report_id, "source_key": entity["key"]},
            }))
        subject_for_entity[entity["key"]] = subject

    source_rows = pages(client, f"/api/v1/projects/{project_id}/subject-sources")
    source_by_identity = {(row["source_kind"], row["source_id"], row["source_key"]): row for row in source_rows}
    for entity_key, subject in subject_for_entity.items():
        identity = ("report_entity", report_id, entity_key)
        mapped = source_by_identity.get(identity)
        if mapped and mapped.get("mapped_subject_id") not in (None, subject["id"]):
            continue  # Preserve an existing explicit mapping; never silently remap it.
        if not mapped or mapped.get("mapped_subject_id") is None:
            response_json(client.put(f"/api/v1/projects/{project_id}/subject-sources", json={
                "source_kind": "report_entity", "source_id": report_id, "source_key": entity_key,
                "subject_id": subject["id"], "expected_subject_id": mapped.get("mapped_subject_id") if mapped else None,
            }))

    collections = pages(client, f"/api/v1/projects/{project_id}/benchmark-collections")
    collection_matches = [item for item in collections if item["name"] == COLLECTION_NAME]
    if len(collection_matches) > 1:
        raise RuntimeError("More than one matching QA collection exists; refusing to guess which collection to reuse.")
    collection = collection_matches[0] if collection_matches else response_json(client.post(f"/api/v1/projects/{project_id}/benchmark-collections", json={
        "name": COLLECTION_NAME, "description": "[QA DEMO] Project-scoped collection. Distinct from the report-level comparison selections.",
    }))
    current_member_ids = {member["subject_id"] for member in collection.get("members", [])}
    for subject in subject_for_entity.values():
        if subject["id"] not in current_member_ids:
            collection = response_json(client.put(f"/api/v1/projects/{project_id}/benchmark-collections/{collection['id']}/subjects/{subject['id']}", json={"subject_id": subject["id"]}))
            current_member_ids.add(subject["id"])

    opportunities = response_json(client.get(f"/api/v1/projects/{project_id}/opportunities"))
    decision_target = {"kind": "project", "target_id": project_id}
    candidate_id = "context:" + hashlib.sha256(f"project|{project_id}|||".encode("utf-8")).hexdigest()
    saved_project_decision = next((item for item in opportunities["candidates"] if item["candidate_id"] == candidate_id and item.get("decision")), None)
    if not saved_project_decision:
        response_json(client.put(f"/api/v1/projects/{project_id}/opportunities/decisions", json={
            "expected_revision": 0, "candidate_id": candidate_id, "decision_target": decision_target,
            "decision_status": "hold", "rationale": "[QA DEMO] Tạm hoãn quyết định cho tới khi có nghiên cứu thật.",
            "priority": "medium", "review_date": "2026-11-07",
            "next_action": "Thay fixture bằng báo cáo nghiên cứu thật rồi xem lại quyết định.",
            "supporting_evidence": [], "contradictory_evidence": [], "open_questions": [], "assessments": [],
        }))

    reports["structured"] = response_json(client.get(f"/api/v1/reports/{report_id}"))
    return {"project": project, "reports": reports, "collection": collection, "subjects": list(subject_for_entity.values())}


def main() -> None:
    parser = argparse.ArgumentParser(description="Idempotently seed clearly labeled Research QA demo data through the local PO Hub API.")
    parser.add_argument("--qa-root", required=True, help="Existing isolated QA data directory inside this repository")
    parser.add_argument("--confirm-qa", action="store_true", help="Confirm this is an isolated QA database")
    parser.add_argument("--api-base", default="http://127.0.0.1:15312", help="Local QA API URL")
    parser.add_argument("--frontend-url", default="http://127.0.0.1:15313", help="QA frontend URL used in printed links")
    args = parser.parse_args()
    if not args.confirm_qa:
        raise SystemExit("Refusing to seed without --confirm-qa and an explicit --qa-root.")
    os.environ["APP_DATA_ROOT"] = str(Path(args.qa_root).expanduser().resolve())
    os.environ["PO_HUB_QA_DEMO_CONFIRM"] = "1"
    database = ensure_isolated_qa_database()
    api_base = args.api_base.rstrip("/")
    if not api_base.startswith(("http://127.0.0.1:", "http://localhost:")):
        raise SystemExit("Refusing to seed a non-local API; QA demo seeding must target this Windows host.")
    with httpx.Client(base_url=api_base, timeout=30.0) as client:
        health = client.get("/health")
        response_json(health)
        result = seed(client)
    base = args.frontend_url.rstrip("/")
    project_id = result["project"]["id"]
    print("QA DEMO records created or safely reused. No existing records were deleted or reset.")
    print(f"Database: {database}")
    print(f"Project ID: {project_id}")
    print(f"Project Home: {base}/research?projectId={project_id}")
    for key, label in (("structured", "Structured report"), ("single", "Single-item report"), ("text", "Text-only report")):
        report = result["reports"][key]
        print(f"{label}: {base}/reports/{report['id']}")
    print(f"Findings: {base}/reports/{result['reports']['structured']['id']}?section=insights")
    print(f"Entity: {base}/reports/{result['reports']['structured']['id']}?section=entities")
    print(f"Report Benchmark: {base}/reports/{result['reports']['structured']['id']}?section=benchmark")
    print(f"Report Notes: {base}/reports/{result['reports']['structured']['id']}?section=decisions")
    print(f"Project Decision: {base}/research?projectId={project_id}&view=opportunities")
    print(f"Tracking: {base}/tracking?projectId={project_id}")
    print(f"Project Benchmark Collection ID: {result['collection']['id']}")


if __name__ == "__main__":
    main()
