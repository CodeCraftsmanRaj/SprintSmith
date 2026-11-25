import csv
import io
import json
import re
from collections.abc import Callable
from xml.sax.saxutils import escape

from fastapi import Response

from app.domain.models import Artifact


def _download(artifact: Artifact, extension: str, body: str | bytes, media_type: str) -> Response:
    return Response(
        content=body,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{artifact.artifact_type}-{artifact.id}.{extension}"'
            )
        },
    )


def _export_json(artifact: Artifact) -> Response:
    body = json.dumps(
        {
            "id": artifact.id,
            "project_id": artifact.project_id,
            "artifact_type": artifact.artifact_type,
            "title": artifact.title,
            "version": artifact.version,
            "content": artifact.content,
        },
        indent=2,
    )
    return _download(artifact, "json", body, "application/json")


def _export_markdown(artifact: Artifact) -> Response:
    title = artifact.title or artifact.artifact_type
    lines = [f"# {title}", f"**Version:** {artifact.version}", f"**Type:** {artifact.artifact_type}", ""]
    if isinstance(artifact.content, dict):
        for key, value in artifact.content.items():
            lines.append(f"## {key.replace('_', ' ').title()}")
            lines.append(
                json.dumps(value, indent=2) if isinstance(value, (dict, list)) else str(value)
            )
    return _download(artifact, "md", "\n".join(lines), "text/markdown")


def _write_csv(artifact: Artifact) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    content = artifact.content
    if artifact.artifact_type == "user_story" and isinstance(content.get("stories"), list):
        writer.writerow([
            "Issue ID", "Summary", "Description", "Priority", "Category",
            "Story Points", "Sprint", "Issue Type",
        ])
        for index, story in enumerate(content["stories"], start=1):
            writer.writerow([
                story.get("id", f"US-{index}"),
                story.get("title", ""),
                story.get("story", ""),
                story.get("priority", ""),
                story.get("category", ""),
                story.get("story_points", ""),
                story.get("sprint_candidate", ""),
                "Story",
            ])
    elif artifact.artifact_type == "sprint_plan":
        writer.writerow([
            "Sprint", "Story Title", "Story Points", "Effort Estimate Hours", "Dependencies",
        ])
        for item in content.get("items", []):
            writer.writerow([
                item.get("sprint", ""),
                item.get("story_title", ""),
                item.get("story_points", ""),
                item.get("effort_estimate_hours", ""),
                "; ".join(item.get("dependencies", [])),
            ])
    elif artifact.artifact_type == "test_case":
        writer.writerow(["ID", "Title", "Category", "Steps", "Expected Result", "Traceability"])
        for case in content.get("cases", []):
            writer.writerow([
                case.get("id", ""),
                case.get("title", ""),
                case.get("category", ""),
                "\n".join(case.get("steps", [])),
                case.get("expected_result", ""),
                case.get("traceability", ""),
            ])
    elif artifact.artifact_type == "acceptance_criteria":
        writer.writerow(["User Story", "Title", "Given", "When", "Then", "Case Type"])
        for criterion in content.get("criteria", []):
            writer.writerow([
                content.get("user_story_title", ""),
                criterion.get("title", ""),
                criterion.get("given", ""),
                criterion.get("when", ""),
                criterion.get("then", ""),
                criterion.get("case_type", ""),
            ])
    else:
        writer.writerow(["id", "project_id", "artifact_type", "title", "version"])
        writer.writerow([
            artifact.id,
            artifact.project_id,
            artifact.artifact_type,
            artifact.title,
            artifact.version,
        ])
    return buffer.getvalue()


def _export_csv(artifact: Artifact) -> Response:
    return _download(artifact, "csv", _write_csv(artifact), "text/csv")


def _export_yaml(artifact: Artifact) -> Response:
    import yaml

    body = yaml.dump(
        {
            "id": artifact.id,
            "project_id": artifact.project_id,
            "artifact_type": artifact.artifact_type,
            "title": artifact.title,
            "version": artifact.version,
            "content": artifact.content,
        }
    )
    return _download(artifact, "yaml", body, "application/x-yaml")


def _export_pdf(artifact: Artifact) -> Response:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buffer = io.BytesIO()
    font_name = "Helvetica"
    try:
        import reportlab
        vera_font = __import__("os").path.join(__import__("os").path.dirname(reportlab.__file__),
                                                "fonts", "Vera.ttf")
        pdfmetrics.registerFont(TTFont("SprintSmithVera", vera_font))
        font_name = "SprintSmithVera"
    except (OSError, ValueError):
        pass

    doc = SimpleDocTemplate(buffer, pagesize=A4, title=artifact.title,
                            leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm)
    styles = getSampleStyleSheet()
    body_style = ParagraphStyle("ArtifactBody", parent=styles["BodyText"],
                                fontName=font_name, fontSize=9, leading=13,
                                textColor=colors.HexColor("#202124"), alignment=TA_LEFT,
                                wordWrap="CJK")
    heading_style = ParagraphStyle("ArtifactHeading", parent=styles["Heading2"],
                                   fontName=font_name, textColor=colors.HexColor("#174EA6"),
                                   spaceBefore=7, spaceAfter=4)
    title_style = ParagraphStyle("ArtifactTitle", parent=styles["Title"], fontName=font_name,
                                 textColor=colors.HexColor("#174EA6"))
    content = artifact.content or {}
    rendered = content.get("rendered_markdown") or content.get("markdown")
    if not rendered:
        rendered = json.dumps(content, ensure_ascii=False, indent=2)
    story = [Paragraph(escape(artifact.title or artifact.artifact_type), title_style), Spacer(1, 8)]
    for line in str(rendered).splitlines():
        clean = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", line).strip()
        if not clean:
            story.append(Spacer(1, 4))
            continue
        heading = re.match(r"^#{1,6}\s+(.*)$", clean)
        if heading:
            story.append(Paragraph(escape(heading.group(1)), heading_style))
            continue
        clean = re.sub(r"^\s*[-*+]\s+", "• ", clean)
        clean = re.sub(r"^\s*\d+[.)]\s+", "• ", clean)
        clean = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", escape(clean))
        clean = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", clean)
        story.append(Paragraph(clean, body_style))
    doc.build(story)
    return _download(artifact, "pdf", buffer.getvalue(), "application/pdf")


def _export_gherkin(artifact: Artifact) -> Response:
    lines = [f"Feature: {artifact.title or 'Generated Acceptance Criteria'}", ""]
    for index, criterion in enumerate(artifact.content.get("criteria", []), start=1):
        lines.append(f"  Scenario: {criterion.get('title', f'Criterion {index}')}")
        for key in ("given", "when", "then"):
            value = criterion.get(key, "")
            steps = value if isinstance(value, list) else [value]
            for step in steps:
                if step:
                    lines.append(f"    {key.title()} {step}")
        lines.append("")
    return Response(
        content="\n".join(lines),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{artifact.id}.feature"'},
    )


_EXPORTERS: dict[str, Callable[[Artifact], Response]] = {
    "json": _export_json,
    "markdown": _export_markdown,
    "md": _export_markdown,
    "csv": _export_csv,
    "yaml": _export_yaml,
    "yml": _export_yaml,
    "pdf": _export_pdf,
}


def render_artifact_export(artifact: Artifact, format: str) -> Response | None:
    normalized_format = format.lower()
    if normalized_format == "gherkin" and artifact.artifact_type == "acceptance_criteria":
        return _export_gherkin(artifact)
    exporter = _EXPORTERS.get(normalized_format)
    return exporter(artifact) if exporter else None
