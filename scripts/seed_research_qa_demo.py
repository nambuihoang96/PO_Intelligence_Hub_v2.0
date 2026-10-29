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
GOLDEN_REPORT_TITLE = "[QA DEMO] Puzzle Research — Full Product Walkthrough"
GOLDEN_URLS = [f"https://example.invalid/qa/puzzle-walkthrough/{index}" for index in range(1, 6)]


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


def golden_report_data() -> dict[str, Any]:
    entities = [
        {"key": "walkthrough-alpha", "entity_type": "game concept", "name": "[QA DEMO] Khái niệm Alpha", "attributes": {"description": "Khái niệm puzzle tổng hợp chỉ dùng để kiểm thử giao diện."}, "evidence_references": [GOLDEN_URLS[0], GOLDEN_URLS[1]]},
        {"key": "walkthrough-beta", "entity_type": "game concept", "name": "[QA DEMO] Khái niệm Beta", "attributes": {"description": "Khái niệm puzzle tổng hợp với cách trình bày tiến độ khác."}, "evidence_references": [GOLDEN_URLS[2]]},
        {"key": "walkthrough-gamma", "entity_type": "game concept", "name": "[QA DEMO] Khái niệm Gamma", "attributes": {"description": "Khái niệm puzzle tổng hợp có nội dung mở rộng theo chủ đề."}, "evidence_references": [GOLDEN_URLS[3]]},
        {"key": "walkthrough-delta", "entity_type": "game concept", "name": "[QA DEMO] Khái niệm Delta", "attributes": {"description": "Khái niệm puzzle tổng hợp dùng để kiểm tra trạng thái thiếu dữ liệu."}, "evidence_references": [GOLDEN_URLS[4]]},
    ]
    findings = [
        {"key": "walkthrough-finding-1", "finding_type": "qualitative_pattern", "title": "[QA DEMO] Phản hồi ngay sau một bước giải", "description": "Báo cáo mô phỏng mô tả mỗi lượt bắt đầu bằng một thao tác đơn giản, sau đó trò chơi phản hồi rõ ràng để người chơi biết bước vừa làm đã có tác dụng. Đây là nội dung tổng hợp cho QA, không phải quan sát người chơi thật.", "related_entities": ["walkthrough-alpha"], "evidence_references": [GOLDEN_URLS[0]], "source_locations": ["line:23"], "scope": {"geo": "US", "environment": "Android", "research_period": "2026 · QA fixture"}, "evidence_status": "unverified", "confidence": None, "uncertainty": "Không có phiên chơi, mẫu người dùng hoặc phép đo hành vi thật.", "po_implications": "Nếu hướng này phù hợp với sản phẩm, PO có thể yêu cầu kiểm tra mức độ dễ hiểu bằng nghiên cứu người dùng thật."},
        {"key": "walkthrough-finding-2", "finding_type": "qualitative_pattern", "title": "[QA DEMO] Tiến độ dễ nhìn được nhắc tới", "description": "Nội dung fixture mô tả dấu hiệu tiến độ xuất hiện giữa các thử thách, giúp người đọc hình dung người chơi đang ở đâu trong một chuỗi nhiệm vụ. Mô tả này không chứng minh rằng tiến độ khiến người chơi quay lại.", "related_entities": ["walkthrough-alpha", "walkthrough-beta"], "evidence_references": [GOLDEN_URLS[1], GOLDEN_URLS[2]], "source_locations": ["line:29"], "scope": {"geo": "US", "environment": "Android", "research_period": "2026 · QA fixture"}, "evidence_status": "unverified", "confidence": None, "uncertainty": "Chưa có thử nghiệm khả năng hiểu tiến độ hoặc dữ liệu quay lại theo thời gian.", "po_implications": "PO có thể cân nhắc kiểm tra xem người chơi có hiểu trạng thái và mục tiêu tiếp theo hay không."},
        {"key": "walkthrough-finding-3", "finding_type": "qualitative_pattern", "title": "[QA DEMO] Chủ đề nội dung được tách khỏi độ khó", "description": "Một khái niệm trong báo cáo mô phỏng thay đổi bối cảnh hình ảnh nhưng giữ nguyên thao tác giải. Đây là cách fixture minh họa một khác biệt về nội dung; không có dữ liệu cho thấy chủ đề nào được ưa thích hơn.", "related_entities": ["walkthrough-gamma"], "evidence_references": [GOLDEN_URLS[3]], "source_locations": ["line:35"], "scope": {"geo": "US", "environment": "Android", "research_period": "2026 · QA fixture"}, "evidence_status": "unverified", "confidence": None, "uncertainty": "Không có so sánh phản hồi người dùng giữa các chủ đề.", "po_implications": "Nếu cần ra quyết định về nội dung, PO có thể tách câu hỏi chủ đề khỏi câu hỏi cơ chế chơi."},
        {"key": "walkthrough-finding-4", "finding_type": "research_gap", "title": "[QA DEMO] Chưa có căn cứ về nhịp nội dung dài hạn", "description": "Fixture không mô tả lịch phát hành, độ dài vòng đời nội dung hoặc cách các thử thách được làm mới. Đây là khoảng trống có chủ đích để kiểm tra cách ứng dụng trình bày điều chưa biết.", "related_entities": ["walkthrough-delta"], "evidence_references": [GOLDEN_URLS[4]], "source_locations": ["line:41"], "scope": {"geo": "US", "environment": "Android", "research_period": "2026 · QA fixture"}, "evidence_status": "unverified", "confidence": None, "uncertainty": "Thông tin về lịch nội dung không được cung cấp.", "po_implications": "PO có thể yêu cầu bổ sung nguồn hoặc giữ câu hỏi này ở trạng thái chưa quyết định."},
        {"key": "walkthrough-finding-5", "finding_type": "qualitative_pattern", "title": "[QA DEMO] Chia sẻ chỉ là lựa chọn được mô tả", "description": "Báo cáo fixture nêu một hành động chia sẻ tùy chọn sau khi hoàn tất thử thách. Không có bằng chứng về số người sử dụng hoặc ảnh hưởng của hành động đó tới mức độ gắn bó.", "related_entities": ["walkthrough-beta"], "evidence_references": [GOLDEN_URLS[2]], "source_locations": ["line:29"], "scope": {"geo": "US", "environment": "Android", "research_period": "2026 · QA fixture"}, "evidence_status": "unverified", "confidence": None, "uncertainty": "Chưa có hành vi sử dụng hoặc tác động được đo lường.", "po_implications": "Chỉ đưa nội dung này vào thảo luận nếu chia sẻ là một lựa chọn sản phẩm đang được cân nhắc."},
    ]
    evidence_lines = (23, 29, 29, 35, 41)
    evidence = [{"url": url, "title": f"[QA DEMO] Nguồn fixture {index}", "source_location": f"line:{evidence_lines[index - 1]}", "verified": False} for index, url in enumerate(GOLDEN_URLS, 1)]
    dimensions = [
        {"key": "walkthrough-loop", "name": "Mô tả lượt chơi", "related_entities": ["walkthrough-alpha", "walkthrough-beta"], "evidence_references": [GOLDEN_URLS[0], GOLDEN_URLS[2]], "observations": [
            {"entity_key": "walkthrough-alpha", "value": "Fixture mô tả thao tác rồi phản hồi ngay.", "evidence_references": [GOLDEN_URLS[0]], "source_locations": ["line:23"], "evidence_status": "unverified", "uncertainty": "Mô phỏng QA, chưa có quan sát thật."},
            {"entity_key": "walkthrough-beta", "value": "Fixture mô tả chuỗi bước có chỉ báo tiến độ.", "evidence_references": [GOLDEN_URLS[2]], "source_locations": ["line:29"], "evidence_status": "unverified", "uncertainty": "Không có dữ liệu kiểm thử khả năng hiểu."},
        ], "po_notes": None},
        {"key": "walkthrough-progression", "name": "Thông tin tiến độ được nêu", "related_entities": ["walkthrough-alpha", "walkthrough-beta"], "evidence_references": [GOLDEN_URLS[1], GOLDEN_URLS[2]], "observations": [
            {"entity_key": "walkthrough-alpha", "value": "Fixture nêu dấu hiệu cho biết bước tiếp theo.", "evidence_references": [GOLDEN_URLS[1]], "source_locations": ["line:29"], "evidence_status": "unverified", "uncertainty": "Chưa đo mức độ hiểu."},
            {"entity_key": "walkthrough-beta", "value": "Fixture nêu mốc tiến độ giữa chuỗi thử thách.", "evidence_references": [GOLDEN_URLS[2]], "source_locations": ["line:29"], "evidence_status": "unverified", "uncertainty": "Không suy ra tác động retention."},
        ], "po_notes": None},
        {"key": "walkthrough-content", "name": "Cách trình bày nội dung", "related_entities": ["walkthrough-gamma"], "evidence_references": [GOLDEN_URLS[3]], "observations": [
            {"entity_key": "walkthrough-gamma", "value": "Fixture thay bối cảnh hình ảnh, giữ nguyên thao tác giải.", "evidence_references": [GOLDEN_URLS[3]], "source_locations": ["line:35"], "evidence_status": "unverified", "uncertainty": "Không có so sánh sở thích."},
        ], "po_notes": None},
        {"key": "walkthrough-content-cadence", "name": "Nhịp cập nhật nội dung", "related_entities": ["walkthrough-delta"], "evidence_references": [GOLDEN_URLS[4]], "observations": [], "po_notes": None},
    ]
    return {
        "executive_summary": "[QA DEMO — DỮ LIỆU MÔ PHỎNG] Báo cáo này minh họa cách một nghiên cứu định tính có thể nối phát hiện, đối tượng, nguồn tham khảo, khoảng trống và câu hỏi dành cho PO. Các đoạn mô tả không đến từ sản phẩm hoặc người dùng thật; không có số liệu định lượng và không được dùng làm bằng chứng ra quyết định.",
        "key_takeaways": ["Fixture mô tả phản hồi sau thao tác và cách thể hiện tiến độ.", "Các ví dụ gắn với bốn khái niệm tổng hợp, không phải game thật.", "Tác động lên hành vi người chơi chưa được đo.", "Mọi liên kết nguồn đều là fixture .invalid, chưa xác minh và không thể truy cập."],
        "sections": [], "entities": entities, "findings": findings, "evidence_references": evidence,
        "benchmark_dimensions": dimensions,
        "research_gaps": ["Không có nghiên cứu người dùng hoặc mẫu quan sát thật.", "Không có dữ liệu về retention, tải xuống, doanh thu hay tăng trưởng.", "Chưa biết người chơi có hiểu dấu hiệu tiến độ hay không.", "Chưa có lịch cập nhật nội dung cho các khái niệm được mô tả."],
        "po_recommendations": ["Dùng báo cáo này để kiểm tra điều hướng, traceability, Benchmark và lưu ghi chú trong QA; thay bằng báo cáo thật trước khi đưa ra quyết định sản phẩm."],
        "quantitative_observations": [],
    }


def golden_report_content() -> str:
    return """# [QA DEMO] Puzzle Research — Full Product Walkthrough

> **QA DEMO — DỮ LIỆU MÔ PHỎNG.** Báo cáo tổng hợp này chỉ để kiểm thử giao diện và luồng lưu trữ. Không mô tả game, người chơi, thị trường hay nguồn thật. Không dùng làm bằng chứng hoặc quyết định sản phẩm.

## Câu hỏi nghiên cứu

Làm thế nào một báo cáo puzzle định tính có thể giúp PO đọc kết luận, xem điều hỗ trợ, nhận biết khoảng trống và ghi lại bước tiếp theo mà không nhầm nội dung mô phỏng với nghiên cứu thật?

## Phạm vi

US · Android · kỳ tham chiếu 2026 (fixture QA). Không có dữ liệu đo lường, khảo sát hoặc quan sát người dùng.

## Kết luận tổng quan

Fixture dùng bốn khái niệm puzzle tổng hợp để minh họa một vòng thao tác có phản hồi, cách biểu diễn tiến độ, một biến thể nội dung và một trường hợp thiếu thông tin về lịch làm mới. Các mô tả được nối với nguồn minh họa nội bộ dành riêng cho QA. Chúng không xác nhận chất lượng sản phẩm, nhu cầu thị trường hoặc tác động lên hành vi.

## Phát hiện và nội dung hỗ trợ

### Phản hồi sau thao tác — khái niệm Alpha

Đoạn mô phỏng mô tả một thao tác giải đơn giản, phản hồi ngay sau thao tác và cho người đọc thấy bước vừa thực hiện đã được ghi nhận. Ví dụ này giúp kiểm tra cách màn hình ưu tiên mô tả finding rồi mới trình bày nguồn và điều chưa rõ.

Nguồn fixture: {0}

### Tiến độ giữa các thử thách — Alpha và Beta

Một ví dụ nêu dấu hiệu tiến độ sau mỗi chặng; ví dụ còn lại mô tả mục tiêu kế tiếp trong chuỗi bước. Hai nội dung chỉ minh họa các observation định tính khác nhau. Không có phép thử để kết luận cách nào dễ hiểu hơn hoặc khiến người chơi quay lại.

Nguồn fixture: {1} · {2}

### Bối cảnh hình ảnh — khái niệm Gamma

Fixture thay bối cảnh hình ảnh nhưng giữ nguyên thao tác giải. Đây là một thuộc tính được nêu trong nội dung mô phỏng; không phải so sánh mức độ yêu thích và không đại diện cho một thương hiệu hay game đang phát hành.

Nguồn fixture: {3}

### Nhịp nội dung — khái niệm Delta

Không có thông tin về lịch cập nhật, số lượng thử thách hoặc cách nội dung được làm mới. Hệ thống cần giữ nguyên điều này như một khoảng trống, không tự suy luận cadence.

Nguồn fixture: {4}

## Đối tượng trong fixture

- **Khái niệm Alpha:** phản hồi được mô tả sau thao tác.
- **Khái niệm Beta:** chuỗi bước và tín hiệu tiến độ được mô tả.
- **Khái niệm Gamma:** đổi bối cảnh hình ảnh trong ví dụ mô phỏng.
- **Khái niệm Delta:** dùng để thể hiện trường hợp chưa có thông tin về nhịp nội dung.

Đây là các nhãn giả lập dành cho QA, không phải entity sản phẩm thực.

## Khoảng trống và độ không chắc chắn

- Không có dữ liệu từ người chơi hoặc thử nghiệm usability.
- Không có retention, downloads, revenue, growth hay market sizing.
- Không biết người chơi có hiểu trạng thái tiến độ hay không.
- Không có lịch phát hành nội dung để so sánh.
- Các URL `example.invalid` là địa chỉ fixture không thể truy cập và không xác minh bất kỳ kết luận nào.

## Gợi ý dành cho PO trong báo cáo

Nếu những câu hỏi này có liên quan tới một quyết định thật, PO có thể yêu cầu nghiên cứu người dùng phù hợp để kiểm tra độ dễ hiểu của phản hồi và tiến độ. Gợi ý này thuộc fixture; nó không phải Project Decision đã được phê duyệt.

## Dữ liệu so sánh định tính

Các khía cạnh được cung cấp trong structured data: mô tả lượt chơi, tín hiệu tiến độ, cách trình bày nội dung và nhịp cập nhật. Observation chỉ xuất hiện khi fixture nêu rõ một mô tả; trường còn thiếu phải hiển thị là chưa có dữ liệu.

## Bước tiếp theo trong QA

Kiểm tra PO có mở được Evidence liên quan, chọn đối tượng vào Benchmark, ghi chú báo cáo, xem quyết định Project riêng tại Tracking, refresh và mở lại mà không mất dữ liệu hay không.
""".format(*GOLDEN_URLS)


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
        ("golden", GOLDEN_REPORT_TITLE, golden_report_content(), golden_report_data()),
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

    # Give the richer walkthrough its own report-level note and two explicit
    # subjects in the report comparison. Preserve any existing entries/selections.
    golden = reports["golden"]
    golden_id = golden["id"]
    golden_entries = golden.get("benchmark_workspace", {}).get("entries", [])
    golden_entries_by_key = {(entry["item_type"], entry["item_key"]): entry for entry in golden_entries}
    note_key = ("finding", "walkthrough-finding-1")
    if note_key not in golden_entries_by_key:
        golden_entries_by_key[note_key] = {
            "item_type": "finding", "item_key": note_key[1],
            "po_assessment": "", "notes": "[QA DEMO] Ghi chú của PO trên báo cáo walkthrough; không phải quyết định Project.",
            "next_action": "", "dimension_assessments": {}, "observation_finding_links": {},
        }
    golden_selections = list(golden.get("benchmark_selections", []))
    golden_selection_ids = {(item["item_type"], item["item_key"]) for item in golden_selections}
    for entity_key in ("walkthrough-alpha", "walkthrough-beta"):
        if ("entity", entity_key) not in golden_selection_ids:
            golden_selections.append({"item_type": "entity", "item_key": entity_key})
    response_json(client.put(f"/api/v1/reports/{golden_id}/benchmark-state", json={
        "custom_dimensions": golden.get("benchmark_workspace", {}).get("custom_dimensions", []),
        "entries": list(golden_entries_by_key.values()), "selections": golden_selections,
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
    reports["golden"] = response_json(client.get(f"/api/v1/reports/{golden_id}"))
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
    for key, label in (("golden", "Golden product walkthrough"), ("structured", "Structured report"), ("single", "Single-item report"), ("text", "Text-only report")):
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
