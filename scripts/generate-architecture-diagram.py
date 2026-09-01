#!/usr/bin/env python3
"""Generate the polished one-page ScopedRun architecture deliverables.

The diagram is intentionally maintained as code so the PDF and PNG stay in
sync with the architecture source of truth under docs/.

Requirements: Python 3, reportlab, and pypdf. A PNG rasterizer is selected in
this order: ReportLab renderPM, Poppler pdftoppm, macOS Quick Look, then sips.
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Circle, Drawing, Line, Path as ShapePath, Polygon, Rect, String
from reportlab.lib.colors import Color, HexColor


PAGE_WIDTH = 960
PAGE_HEIGHT = 540

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "docs" / "assets" / "architecture-trusted-sequence.pdf"
PNG_PATH = ROOT / "docs" / "assets" / "architecture-trusted-sequence.png"

COLORS = {
    "background": HexColor("#07111F"),
    "surface": HexColor("#0B1727"),
    "card": HexColor("#102238"),
    "card_alt": HexColor("#0D1D31"),
    "text": HexColor("#F7FAFC"),
    "muted": HexColor("#A9B8CB"),
    "faint": HexColor("#6E829B"),
    "line": HexColor("#2A405A"),
    "cyan": HexColor("#37C8F3"),
    "cyan_soft": HexColor("#0F2B3A"),
    "purple": HexColor("#A78BFA"),
    "purple_soft": HexColor("#1C1934"),
    "green": HexColor("#4ADEA6"),
    "green_soft": HexColor("#102A25"),
    "red": HexColor("#FB7185"),
    "red_soft": HexColor("#2A1720"),
    "amber": HexColor("#F7C75D"),
    "amber_soft": HexColor("#2B2417"),
    "indigo": HexColor("#8BA4FF"),
    "indigo_soft": HexColor("#181F3B"),
    "white_10": Color(1, 1, 1, alpha=0.10),
}


def add_text(
    drawing: Drawing,
    x: float,
    y: float,
    value: str,
    *,
    size: float = 8,
    color=COLORS["text"],
    font: str = "Helvetica",
    anchor: str = "start",
    angle: float = 0,
) -> None:
    drawing.add(
        String(
            x,
            y,
            value,
            fontName=font,
            fontSize=size,
            fillColor=color,
            textAnchor=anchor,
            angle=angle,
        )
    )


def rounded_rect(
    drawing: Drawing,
    x: float,
    y: float,
    width: float,
    height: float,
    *,
    fill,
    stroke,
    stroke_width: float = 1,
    radius: float = 9,
    dash: list[int] | None = None,
) -> None:
    drawing.add(
        Rect(
            x,
            y,
            width,
            height,
            rx=radius,
            ry=radius,
            fillColor=fill,
            strokeColor=stroke,
            strokeWidth=stroke_width,
            strokeDashArray=dash,
        )
    )


def arrow(
    drawing: Drawing,
    points: list[tuple[float, float]],
    *,
    color=COLORS["cyan"],
    width: float = 1.6,
    dashed: bool = False,
    head: float = 5.5,
) -> None:
    path = ShapePath()
    path.moveTo(*points[0])
    for point in points[1:]:
        path.lineTo(*point)
    path.fillColor = None
    path.strokeColor = color
    path.strokeWidth = width
    if dashed:
        path.strokeDashArray = [4, 3]
    drawing.add(path)

    (x0, y0), (x1, y1) = points[-2], points[-1]
    angle = math.atan2(y1 - y0, x1 - x0)
    wing = 0.62
    drawing.add(
        Polygon(
            [
                x1,
                y1,
                x1 - head * math.cos(angle - wing),
                y1 - head * math.sin(angle - wing),
                x1 - head * math.cos(angle + wing),
                y1 - head * math.sin(angle + wing),
            ],
            fillColor=color,
            strokeColor=None,
        )
    )


def region(
    drawing: Drawing,
    x: float,
    y: float,
    width: float,
    height: float,
    *,
    label: str,
    fill,
    stroke,
) -> None:
    rounded_rect(
        drawing,
        x,
        y,
        width,
        height,
        fill=fill,
        stroke=stroke,
        stroke_width=1.2,
        radius=12,
    )
    add_text(
        drawing,
        x + 12,
        y + height - 18,
        label,
        size=7.4,
        color=stroke,
        font="Helvetica-Bold",
    )


def number_badge(drawing: Drawing, x: float, y: float, number: str, color) -> None:
    drawing.add(Circle(x, y, 8.2, fillColor=color, strokeColor=None))
    add_text(
        drawing,
        x,
        y - 2.7,
        number,
        size=7.4,
        color=COLORS["background"],
        font="Helvetica-Bold",
        anchor="middle",
    )


def policy_card(
    drawing: Drawing,
    x: float,
    y: float,
    width: float,
    height: float,
    *,
    number: str,
    title: str,
    lines: list[str],
    accent=COLORS["cyan"],
) -> None:
    rounded_rect(
        drawing,
        x,
        y,
        width,
        height,
        fill=COLORS["card"],
        stroke=COLORS["line"],
        radius=8,
    )
    number_badge(drawing, x + 15, y + height - 16, number, accent)
    add_text(
        drawing,
        x + 28,
        y + height - 19,
        title,
        size=8.2,
        font="Helvetica-Bold",
    )
    start_y = y + height - 37
    for index, line in enumerate(lines):
        add_text(
            drawing,
            x + 12,
            start_y - index * 11,
            line,
            size=6.9,
            color=COLORS["muted"],
        )


def bullet(drawing: Drawing, x: float, y: float, text_value: str, color) -> None:
    drawing.add(Circle(x, y + 2.2, 2.2, fillColor=color, strokeColor=None))
    add_text(drawing, x + 8, y, text_value, size=7.2, color=COLORS["muted"])


def build_diagram() -> Drawing:
    drawing = Drawing(PAGE_WIDTH, PAGE_HEIGHT)
    drawing.add(
        Rect(
            0,
            0,
            PAGE_WIDTH,
            PAGE_HEIGHT,
            fillColor=COLORS["background"],
            strokeColor=None,
        )
    )

    # Header
    rounded_rect(
        drawing,
        24,
        508,
        191,
        18,
        fill=COLORS["cyan_soft"],
        stroke=COLORS["cyan"],
        radius=9,
    )
    add_text(
        drawing,
        119.5,
        513.5,
        "SCOPEDRUN / ONE-PAGE ARCHITECTURE",
        size=7.2,
        color=COLORS["cyan"],
        font="Helvetica-Bold",
        anchor="middle",
    )
    add_text(
        drawing,
        24,
        478,
        "Run-scoped Resource Capsule",
        size=24,
        font="Helvetica-Bold",
    )
    add_text(
        drawing,
        24,
        459,
        "Only a Protected Resource explicitly authorized for this Run enters its container namespace.",
        size=9.4,
        color=COLORS["muted"],
    )
    rounded_rect(
        drawing,
        721,
        471,
        215,
        38,
        fill=COLORS["surface"],
        stroke=COLORS["line"],
        radius=10,
    )
    add_text(
        drawing,
        733,
        493,
        "MVP SCOPE",
        size=6.7,
        color=COLORS["amber"],
        font="Helvetica-Bold",
    )
    add_text(
        drawing,
        733,
        480,
        "0 or 1 directory  |  read-only  |  local container",
        size=7.6,
        color=COLORS["text"],
        font="Helvetica-Bold",
    )

    # Trust regions.
    region(
        drawing,
        24,
        192,
        174,
        250,
        label="BROWSER / UNTRUSTED REQUEST INPUT",
        fill=COLORS["purple_soft"],
        stroke=COLORS["purple"],
    )
    region(
        drawing,
        216,
        192,
        468,
        250,
        label="FASTIFY CONTROL PLANE / TRUSTED POLICY BOUNDARY",
        fill=COLORS["cyan_soft"],
        stroke=COLORS["cyan"],
    )
    region(
        drawing,
        700,
        192,
        158,
        250,
        label="DISPOSABLE CONTAINER",
        fill=COLORS["green_soft"],
        stroke=COLORS["green"],
    )
    region(
        drawing,
        870,
        192,
        66,
        250,
        label="ARK API",
        fill=COLORS["indigo_soft"],
        stroke=COLORS["indigo"],
    )
    drawing.add(
        Line(
            205,
            201,
            205,
            433,
            strokeColor=COLORS["purple"],
            strokeWidth=1,
            strokeDashArray=[4, 4],
        )
    )

    # Browser input and explicit human approval.
    rounded_rect(
        drawing,
        36,
        361,
        150,
        51,
        fill=COLORS["card_alt"],
        stroke=COLORS["line"],
        radius=8,
    )
    add_text(drawing, 48, 392, "Task text", size=9.2, font="Helvetica-Bold")
    add_text(
        drawing,
        48,
        377,
        "Intent before a Run; never mount authority.",
        size=6.8,
        color=COLORS["muted"],
    )

    rounded_rect(
        drawing,
        36,
        291,
        150,
        56,
        fill=COLORS["card_alt"],
        stroke=COLORS["purple"],
        radius=8,
    )
    add_text(
        drawing,
        48,
        328,
        "Optional Suggest UI",
        size=8.8,
        font="Helvetica-Bold",
    )
    add_text(
        drawing,
        48,
        313,
        "Requests a candidate from the server.",
        size=6.8,
        color=COLORS["muted"],
    )
    add_text(
        drawing,
        48,
        302,
        "Never delegates or submits a Run.",
        size=6.8,
        color=COLORS["muted"],
    )

    rounded_rect(
        drawing,
        36,
        210,
        150,
        65,
        fill=COLORS["purple_soft"],
        stroke=COLORS["purple"],
        stroke_width=1.3,
        radius=8,
    )
    add_text(
        drawing,
        48,
        252,
        "Explicit Run Delegation",
        size=9,
        font="Helvetica-Bold",
    )
    add_text(
        drawing,
        48,
        237,
        "Human chooses 0 or 1 Resource ID.",
        size=6.8,
        color=COLORS["muted"],
    )
    add_text(
        drawing,
        48,
        222,
        "0 = baseline  |  1 = Capsule path shown",
        size=6.6,
        color=COLORS["purple"],
        font="Helvetica-Bold",
    )
    arrow(
        drawing,
        [(111, 361), (111, 348)],
        color=COLORS["purple"],
        width=1.2,
        dashed=True,
    )
    add_text(
        drawing,
        174,
        352,
        "optional",
        size=6.1,
        color=COLORS["purple"],
        font="Helvetica-Bold",
        anchor="end",
    )
    # The manual picker remains a complete path when Suggest is not used.
    arrow(
        drawing,
        [(36, 386), (29, 386), (29, 242), (36, 242)],
        color=COLORS["purple"],
        width=1.2,
    )
    arrow(
        drawing,
        [(111, 291), (111, 276)],
        color=COLORS["purple"],
        width=1.2,
        dashed=True,
    )
    add_text(
        drawing,
        171,
        282,
        "approve",
        size=6.1,
        color=COLORS["purple"],
        font="Helvetica-Bold",
        anchor="end",
    )
    # Suggest is a separate call into the server-owned Advisor. It returns a
    # candidate to the UI but never creates the Run Delegation.
    arrow(
        drawing,
        [(186, 319), (228, 350)],
        color=COLORS["purple"],
        width=1.2,
        dashed=True,
    )
    arrow(
        drawing,
        [(228, 341), (186, 310)],
        color=COLORS["purple"],
        width=1.2,
        dashed=True,
    )

    # Trusted policy pipeline connectors are drawn under the cards.
    arrow(drawing, [(360, 380), (370, 380)], width=1.4)
    arrow(drawing, [(503, 380), (513, 380)], width=1.4)
    arrow(
        drawing,
        [(582, 338), (582, 330), (297, 330), (297, 320)],
        width=1.4,
    )
    arrow(drawing, [(360, 281), (370, 281)], width=1.4)
    arrow(drawing, [(503, 281), (513, 281)], width=1.4)
    arrow(drawing, [(582, 242), (582, 233)], width=1.4)

    policy_card(
        drawing,
        228,
        338,
        132,
        82,
        number="1",
        title="Request + Advisor APIs",
        lines=["Optional demo bearer + schemas", "Suggest: safe metadata -> UI", "Run only: no path, mode or principal"],
    )
    policy_card(
        drawing,
        371,
        338,
        132,
        82,
        number="2",
        title="Mock principal + Agent",
        lines=["Resolve X-Demo-Session", "Ownership-scoped Agent lookup", "Uniform 404 before admission"],
    )
    policy_card(
        drawing,
        514,
        338,
        132,
        82,
        number="3",
        title="Authorize scope",
        lines=["Current Agent ownership", "Entitlement + explicit Delegation", "Advisor cannot authorize or submit"],
    )
    policy_card(
        drawing,
        228,
        242,
        132,
        78,
        number="4",
        title="Runtime profile gate",
        lines=["Container: continue", "local-process Capsule: deny", "Baseline behavior unchanged"],
        accent=COLORS["amber"],
    )
    policy_card(
        drawing,
        371,
        242,
        132,
        78,
        number="5",
        title="Server-only path checks",
        lines=["Registry + realpath containment", "Root, overlap and collision checks", "Fresh Entitlement generation"],
    )
    policy_card(
        drawing,
        514,
        242,
        132,
        78,
        number="6",
        title="ValidatedRunMountPlan",
        lines=["Immutable  |  readOnly: true", "Target: /resources/<id>", "Admission accepts compiler plan"],
        accent=COLORS["green"],
    )

    rounded_rect(
        drawing,
        228,
        201,
        418,
        32,
        fill=COLORS["card"],
        stroke=COLORS["cyan"],
        radius=8,
    )
    number_badge(drawing, 243, 217, "7", COLORS["cyan"])
    add_text(
        drawing,
        257,
        219,
        "ATOMIC ADMISSION",
        size=7.3,
        color=COLORS["cyan"],
        font="Helvetica-Bold",
    )
    add_text(
        drawing,
        334,
        219,
        "Run + Message + Agent state + Receipt",
        size=6.9,
        color=COLORS["text"],
        font="Helvetica-Bold",
    )
    add_text(
        drawing,
        257,
        207,
        "runnerStarted starts false; pre-Runner failures restore false; final rechecks precede Runner.",
        size=6.1,
        color=COLORS["muted"],
    )

    # Cross the browser trust boundary with only task content and an opaque ID.
    arrow(
        drawing,
        [(186, 243), (208, 243), (208, 380), (228, 380)],
        color=COLORS["purple"],
        width=1.7,
    )
    # Authorized Runtime handoff.
    arrow(
        drawing,
        [(646, 217), (675, 217), (675, 386), (712, 386)],
        color=COLORS["green"],
        width=2,
    )
    # Runtime capability: the security result is the namespace, not a prompt.
    rounded_rect(
        drawing,
        712,
        354,
        134,
        64,
        fill=COLORS["card"],
        stroke=COLORS["green"],
        radius=8,
    )
    add_text(
        drawing,
        724,
        397,
        "ContainerCodexRunner",
        size=8.8,
        font="Helvetica-Bold",
    )
    add_text(
        drawing,
        724,
        381,
        "Settled true means Runner",
        size=6.7,
        color=COLORS["muted"],
    )
    add_text(
        drawing,
        724,
        370,
        "handoff was attempted.",
        size=6.7,
        color=COLORS["muted"],
    )

    rounded_rect(
        drawing,
        712,
        247,
        134,
        91,
        fill=COLORS["card_alt"],
        stroke=COLORS["green"],
        radius=8,
    )
    add_text(
        drawing,
        724,
        319,
        "PER-RUN NAMESPACE",
        size=7.2,
        color=COLORS["green"],
        font="Helvetica-Bold",
    )
    add_text(drawing, 724, 300, "/workspace", size=7.3, font="Helvetica-Bold")
    add_text(drawing, 795, 300, "RW, this Agent", size=6.5, color=COLORS["muted"])
    add_text(drawing, 724, 284, "/codex-home", size=7.3, font="Helvetica-Bold")
    add_text(drawing, 795, 284, "RW, this Agent", size=6.5, color=COLORS["muted"])
    add_text(drawing, 724, 268, "/resources/<id>", size=7.3, font="Helvetica-Bold")
    add_text(drawing, 805, 268, "read-only", size=6.5, color=COLORS["green"], font="Helvetica-Bold")
    add_text(
        drawing,
        724,
        255,
        "Undelegated Resources are absent.",
        size=6.4,
        color=COLORS["muted"],
    )

    rounded_rect(
        drawing,
        712,
        204,
        134,
        28,
        fill=COLORS["card"],
        stroke=COLORS["line"],
        radius=7,
    )
    add_text(
        drawing,
        779,
        214,
        "Codex CLI",
        size=8.2,
        font="Helvetica-Bold",
        anchor="middle",
    )
    arrow(drawing, [(779, 354), (779, 339)], color=COLORS["green"], width=1.4)
    arrow(drawing, [(779, 247), (779, 233)], color=COLORS["green"], width=1.4)

    add_text(
        drawing,
        903,
        399,
        "NETWORK",
        size=7.1,
        color=COLORS["indigo"],
        font="Helvetica-Bold",
        anchor="middle",
    )
    add_text(drawing, 903, 383, "is outside", size=6.5, color=COLORS["muted"], anchor="middle")
    add_text(drawing, 903, 371, "this file-", size=6.5, color=COLORS["muted"], anchor="middle")
    add_text(drawing, 903, 359, "system", size=6.5, color=COLORS["muted"], anchor="middle")
    add_text(drawing, 903, 347, "control.", size=6.5, color=COLORS["muted"], anchor="middle")
    rounded_rect(
        drawing,
        878,
        204,
        50,
        66,
        fill=COLORS["card_alt"],
        stroke=COLORS["indigo"],
        radius=8,
    )
    add_text(drawing, 903, 251, "ARK", size=8.2, font="Helvetica-Bold", anchor="middle")
    add_text(drawing, 903, 237, "Responses", size=6.4, color=COLORS["muted"], anchor="middle")
    add_text(drawing, 903, 225, "API", size=6.4, color=COLORS["muted"], anchor="middle")
    arrow(drawing, [(846, 218), (878, 218)], color=COLORS["indigo"], width=1.4)
    arrow(
        drawing,
        [(878, 230), (846, 230)],
        color=COLORS["indigo"],
        width=1,
        dashed=True,
        head=4.5,
    )

    # Evidence and failure outcomes. These are deliberately distinct from the
    # authorization flow so the diagram does not conflate Decision and start.
    rounded_rect(
        drawing,
        24,
        64,
        285,
        108,
        fill=COLORS["red_soft"],
        stroke=COLORS["red"],
        radius=11,
    )
    add_text(
        drawing,
        38,
        151,
        "FAIL CLOSED BEFORE RUNTIME",
        size=9.3,
        color=COLORS["red"],
        font="Helvetica-Bold",
    )
    rounded_rect(
        drawing,
        219,
        143,
        76,
        18,
        fill=COLORS["red"],
        stroke=COLORS["red"],
        radius=9,
    )
    add_text(
        drawing,
        257,
        149,
        "0 RUNNER CALLS",
        size=6.5,
        color=COLORS["background"],
        font="Helvetica-Bold",
        anchor="middle",
    )
    bullet(drawing, 40, 129, "400 malformed: no Run or Receipt", COLORS["red"])
    bullet(drawing, 40, 111, "404 missing / non-owned Agent: no artifacts", COLORS["red"])
    bullet(drawing, 40, 93, "403 policy, profile, path or stale: denied Run", COLORS["red"])
    bullet(drawing, 40, 75, "Safe deny Receipt; no source path or secret", COLORS["red"])

    rounded_rect(
        drawing,
        321,
        64,
        300,
        108,
        fill=COLORS["card_alt"],
        stroke=COLORS["cyan"],
        radius=11,
    )
    add_text(
        drawing,
        335,
        151,
        "PERSISTED END-TO-END PROOF",
        size=9.3,
        color=COLORS["cyan"],
        font="Helvetica-Bold",
    )
    bullet(drawing, 337, 129, "API: 202/403 -> Run / Receipt polling -> Web UI", COLORS["cyan"])
    bullet(drawing, 337, 111, "Atomic store: Run | Message | Agent state | Receipt", COLORS["cyan"])
    bullet(drawing, 337, 93, "Receipt: principal | Agent | Resource | generation | start", COLORS["cyan"])
    bullet(drawing, 337, 75, "UI proof: Delegated -> Decided -> Executed", COLORS["cyan"])

    rounded_rect(
        drawing,
        633,
        64,
        303,
        108,
        fill=COLORS["green_soft"],
        stroke=COLORS["green"],
        radius=11,
    )
    add_text(
        drawing,
        647,
        151,
        "OBJECTIVE RELEASE PROOF",
        size=9.3,
        color=COLORS["green"],
        font="Helvetica-Bold",
    )
    bullet(drawing, 649, 129, "Delegated Resource is readable", COLORS["green"])
    bullet(drawing, 649, 111, "Undelegated and unentitled Resources are absent", COLORS["green"])
    bullet(drawing, 649, 93, "Writes fail; host bytes, SHA-256 and mtime unchanged", COLORS["green"])
    bullet(drawing, 649, 75, "Real-container proof is independent of model wording", COLORS["green"])

    # Admission facts flow into the persisted proof, and the API projects the
    # correlated Run/Receipt back to the browser rather than ending at Ark.
    arrow(
        drawing,
        [(520, 201), (520, 172)],
        color=COLORS["cyan"],
        width=1.1,
        dashed=True,
    )
    # Denials converge to evidence, never to the Runtime handoff.
    arrow(
        drawing,
        [(450, 192), (450, 181), (167, 181), (167, 172)],
        color=COLORS["red"],
        width=1.3,
        dashed=True,
    )
    add_text(
        drawing,
        357,
        183,
        "any deny / invalid / stale",
        size=6.2,
        color=COLORS["red"],
        font="Helvetica-Bold",
        anchor="middle",
    )

    # Stable architecture seams and deliberately narrow boundary.
    add_text(
        drawing,
        24,
        43,
        "STABLE EXTENSION SEAMS",
        size=6.7,
        color=COLORS["amber"],
        font="Helvetica-Bold",
    )
    add_text(
        drawing,
        123,
        43,
        "Resource Registry  |  AgentRunner provider  |  Decision Receipt evidence  |  Entitlement / Delegation",
        size=6.8,
        color=COLORS["muted"],
    )
    add_text(
        drawing,
        24,
        24,
        "BOUNDARY",
        size=6.7,
        color=COLORS["red"],
        font="Helvetica-Bold",
    )
    add_text(
        drawing,
        75,
        24,
        "Mock identity; prospective revoke; registered filesystem mounts only. Network, generic tools, DLP and hardened multi-tenancy are out of scope.",
        size=6.8,
        color=COLORS["faint"],
    )

    return drawing


def write_pdf_with_metadata(drawing: Drawing) -> None:
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    raw_path = PDF_PATH.with_suffix(".raw.pdf")
    renderPDF.drawToFile(drawing, str(raw_path))

    reader = PdfReader(str(raw_path))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.add_metadata(
        {
            "/Title": "ScopedRun - Run-scoped Resource Capsule Architecture",
            "/Author": "Starlove Butterfly TechJam team",
            "/Subject": "One-page trusted-sequence architecture and evidence boundary",
            "/Keywords": "ScopedRun, Resource Capsule, Fastify, container, authorization, least privilege",
            "/Creator": "scripts/generate-architecture-diagram.py",
        }
    )
    with PDF_PATH.open("wb") as output:
        writer.write(output)
    raw_path.unlink()


def write_png_preview(drawing: Drawing) -> None:
    """Render a 2560 x 1440 companion preview with an available backend."""

    try:
        from reportlab.graphics import renderPM

        renderPM.drawToFile(drawing, str(PNG_PATH), fmt="PNG", dpi=192)
        return
    except Exception:
        # ReportLab installs without a raster backend on some platforms. The
        # PDF is already the vector source of truth, so render that directly.
        pass

    with tempfile.TemporaryDirectory(prefix="scopedrun-architecture-") as temp:
        temp_dir = Path(temp)
        if shutil.which("pdftoppm"):
            prefix = temp_dir / "architecture"
            subprocess.run(
                [
                    "pdftoppm",
                    "-png",
                    "-r",
                    "192",
                    "-singlefile",
                    str(PDF_PATH),
                    str(prefix),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            os.replace(prefix.with_suffix(".png"), PNG_PATH)
            return

        if shutil.which("qlmanage"):
            subprocess.run(
                [
                    "qlmanage",
                    "-t",
                    "-s",
                    "2560",
                    "-o",
                    str(temp_dir),
                    str(PDF_PATH),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            os.replace(temp_dir / f"{PDF_PATH.name}.png", PNG_PATH)
            return

        if shutil.which("sips"):
            preview = temp_dir / "architecture.png"
            subprocess.run(
                ["sips", "-s", "format", "png", str(PDF_PATH), "--out", str(preview)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(
                ["sips", "-z", "1440", "2560", str(preview), "--out", str(PNG_PATH)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return

    raise RuntimeError(
        "No PDF rasterizer available. Install rlPyCairo or Poppler (pdftoppm)."
    )


def main() -> None:
    drawing = build_diagram()
    write_pdf_with_metadata(drawing)
    write_png_preview(drawing)
    print(f"Wrote {PDF_PATH.relative_to(ROOT)}")
    print(f"Wrote {PNG_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
