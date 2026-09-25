"""Render the versioned Agent Control operator guide with ReportLab."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

NAVY = colors.HexColor("#13253f")
CYAN = colors.HexColor("#16a6b6")
PALE = colors.HexColor("#edf7f8")
INK = colors.HexColor("#202b38")
MUTED = colors.HexColor("#64748b")
CODE = colors.HexColor("#f3f5f7")


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(text: str) -> str:
    value = esc(text)
    value = re.sub(r"`([^`]+)`", r'<font name="Courier" color="#0f6674">\1</font>', value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    return value


class GuideDoc(BaseDocTemplate):
    def __init__(self, filename: str, title: str, version: str):
        self.guide_version = version
        super().__init__(filename, pagesize=A4, leftMargin=19 * mm, rightMargin=19 * mm, topMargin=19 * mm, bottomMargin=18 * mm, title=title, author="Agent Control Project")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        self.addPageTemplates(PageTemplate(id="guide", frames=frame, onPage=self.decorate))

    def decorate(self, canvas, doc):
        canvas.saveState()
        width, height = A4
        if doc.page == 1:
            canvas.setFillColor(NAVY)
            canvas.rect(0, 0, width, height, fill=1, stroke=0)
            canvas.setFillColor(CYAN)
            canvas.rect(0, height - 12 * mm, width, 12 * mm, fill=1, stroke=0)
        else:
            canvas.setStrokeColor(colors.HexColor("#d7e0e7"))
            canvas.line(19 * mm, 14 * mm, width - 19 * mm, 14 * mm)
            canvas.setFont("Helvetica", 8)
            canvas.setFillColor(MUTED)
            canvas.drawString(19 * mm, 9 * mm, f"AGENT CONTROL {self.guide_version} - OPERATOR GUIDE")
            canvas.drawRightString(width - 19 * mm, 9 * mm, str(doc.page))
        canvas.restoreState()


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle("cover_title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=31, leading=35, textColor=colors.white, alignment=TA_CENTER, spaceAfter=10 * mm),
        "cover_sub": ParagraphStyle("cover_sub", parent=base["Normal"], fontName="Helvetica", fontSize=14, leading=21, textColor=colors.HexColor("#d9edf0"), alignment=TA_CENTER),
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=NAVY, spaceBefore=5 * mm, spaceAfter=3 * mm, keepWithNext=True),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13.5, leading=17, textColor=colors.HexColor("#0b7285"), spaceBefore=4 * mm, spaceAfter=2 * mm, keepWithNext=True),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.7, leading=14.3, textColor=INK, spaceAfter=2.2 * mm),
        "table_head": ParagraphStyle("table_head", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=9.7, leading=14.3, textColor=colors.white, spaceAfter=0),
        "bullet": ParagraphStyle("bullet", parent=base["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=INK, leftIndent=6 * mm, bulletIndent=1.2 * mm, bulletFontName="Helvetica", bulletFontSize=9.5, spaceAfter=1.2 * mm),
        "code": ParagraphStyle("code", parent=base["Code"], fontName="Courier", fontSize=7.6, leading=10.4, textColor=colors.HexColor("#243444"), backColor=CODE, borderColor=colors.HexColor("#d6dde3"), borderWidth=0.5, borderPadding=5, spaceBefore=1.5 * mm, spaceAfter=3 * mm),
        "callout": ParagraphStyle("callout", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=10, leading=15, textColor=NAVY, backColor=PALE, borderColor=CYAN, borderWidth=0.8, borderPadding=8, spaceBefore=2 * mm, spaceAfter=4 * mm),
        "toc": ParagraphStyle("toc", parent=base["BodyText"], fontName="Helvetica", fontSize=10.5, leading=17, textColor=INK, leftIndent=4 * mm),
    }


def parse_markdown(source: str, style, version: str):
    lines = source.splitlines()
    story = []
    paragraph = []
    code = []
    table = []
    in_code = False
    seen_title = False

    def flush_paragraph():
        if paragraph:
            text = " ".join(part.strip() for part in paragraph)
            story.append(Paragraph(inline(text), style["body"]))
            paragraph.clear()

    def flush_table():
        if not table:
            return
        raw_rows = [row for row in table if not re.match(r"^\s*\|?\s*:?-+", row)]
        rows = [
            [Paragraph(inline(cell.strip()), style["table_head"] if index == 0 else style["body"]) for cell in row.strip().strip("|").split("|")]
            for index, row in enumerate(raw_rows)
        ]
        if rows:
            widths = [38 * mm, 132 * mm] if len(rows[0]) == 2 else None
            value = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
            value.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5df")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
            story.extend([value, Spacer(1, 3 * mm)])
        table.clear()

    for line in lines:
        if line.startswith("```"):
            flush_paragraph()
            if in_code:
                story.append(Paragraph("<br/>".join(esc(item).replace(" ", "&nbsp;") for item in code), style["code"]))
                code.clear()
            in_code = not in_code
            continue
        if in_code:
            code.append(line)
            continue
        if line.startswith("|"):
            flush_paragraph()
            table.append(line)
            continue
        flush_table()
        if not line.strip():
            flush_paragraph()
        elif line.startswith("# "):
            flush_paragraph()
            if not seen_title:
                story.extend([Spacer(1, 50 * mm), Paragraph(inline(line[2:]), style["cover_title"]), Paragraph("Infrastructure-neutral installation, dashboard, scheduling, operation and recovery", style["cover_sub"]), Spacer(1, 20 * mm), Paragraph(f"<b>Release {version}</b><br/>24 August 2026<br/><br/>Execution may be delegated. Authority is not.", style["cover_sub"]), PageBreak()])
                seen_title = True
            else:
                story.append(Paragraph(inline(line[2:]), style["h1"]))
        elif line.startswith("## "):
            flush_paragraph()
            story.append(Paragraph(inline(line[3:]), style["h1"]))
        elif line.startswith("### "):
            flush_paragraph()
            story.append(Paragraph(inline(line[4:]), style["h2"]))
        elif line.startswith("- "):
            flush_paragraph()
            story.append(Paragraph(inline(line[2:]), style["bullet"], bulletText="-"))
        elif re.match(r"^\d+\. ", line):
            flush_paragraph()
            story.append(Paragraph(inline(line), style["bullet"]))
        else:
            paragraph.append(line)
    flush_paragraph()
    flush_table()
    return story


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: generate-operator-guide.py SOURCE.md OUTPUT.pdf")
    source, output = map(Path, sys.argv[1:])
    source_bytes = source.read_bytes()
    markdown = source_bytes.decode("utf-8")
    heading = next((line[2:].strip() for line in markdown.splitlines() if line.startswith("# ")), "Agent Control Operator Guide")
    match = re.search(r"Agent Control\s+([0-9]+(?:\.[0-9]+)+)", heading)
    version = match.group(1) if match else "current"
    output.parent.mkdir(parents=True, exist_ok=True)
    markdown_output = output.with_suffix(".md")
    markdown_output.write_bytes(source_bytes)
    document = GuideDoc(str(output), heading, version)
    document.build(parse_markdown(markdown, styles(), version))
    print(markdown_output)
    print(output)


if __name__ == "__main__":
    main()
