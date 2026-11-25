"""Output sanitisation applied at the artifact rendering boundary.

Ported from rtia's 3-pass sanitiser so hostile bytes, arbitrary code-fence
language tags, and unbounded length cannot reach downstream consumers:
1. Strip control & invisible formatting chars (Trojan Source / bidi overrides).
2. Normalize non-allowlisted code-fence language tags to bare fences.
3. Enforce a hard character cap with an in-band truncation notice.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

DEFAULT_MAX_CHARS = 16_384

_ALLOWED_CONTROL_CHARS = frozenset({"\t", "\n", "\r"})

_INVISIBLE_FORMATTING_CHARS = frozenset(
    [
        "\u200b",  # zero-width space
        "\u200c",  # zero-width non-joiner
        "\u200d",  # zero-width joiner
        "\u200e",  # left-to-right mark
        "\u200f",  # right-to-left mark
        "\u202a",  # LRE
        "\u202b",  # RLE
        "\u202c",  # PDF
        "\u202d",  # LRO
        "\u202e",  # RLO
        "\ufeff",  # BOM / zero-width no-break space
    ]
)

DEFAULT_ALLOWED_LANGS = frozenset(
    [
        "text",
        "plaintext",
        "bash",
        "sh",
        "sql",
        "json",
        "yaml",
        "yml",
        "python",
        "py",
        "js",
        "javascript",
        "ts",
        "typescript",
        "gherkin",
        "markdown",
        "md",
        "http",
    ]
)

_FENCE_OPENER_RE = re.compile(
    r"^(?P<fence>`{3,})(?P<lang>[A-Za-z0-9_\-]+)\s*$",
    re.MULTILINE,
)


@dataclass(frozen=True)
class SanitizeReport:
    control_chars_stripped: int = 0
    invisible_chars_stripped: int = 0
    fences_rewritten: list[str] = field(default_factory=list)
    truncated_at: int | None = None

    @property
    def is_clean(self) -> bool:
        return (
            self.control_chars_stripped == 0
            and self.invisible_chars_stripped == 0
            and not self.fences_rewritten
            and self.truncated_at is None
        )


def strip_control_chars(text: str) -> tuple[str, int, int]:
    if not text:
        return text, 0, 0

    out_chars: list[str] = []
    control_count = 0
    invisible_count = 0
    for ch in text:
        codepoint = ord(ch)
        if codepoint < 0x20 and ch not in _ALLOWED_CONTROL_CHARS:
            control_count += 1
            continue
        if codepoint == 0x7F:
            control_count += 1
            continue
        if ch in _INVISIBLE_FORMATTING_CHARS:
            invisible_count += 1
            continue
        out_chars.append(ch)
    return "".join(out_chars), control_count, invisible_count


def normalize_code_fences(
    text: str, allowed: frozenset[str] = DEFAULT_ALLOWED_LANGS
) -> tuple[str, list[str]]:
    rewritten: list[str] = []

    def _replace(match: re.Match[str]) -> str:
        lang = match.group("lang").lower()
        if lang in allowed:
            return match.group(0)
        rewritten.append(lang)
        return match.group("fence")

    cleaned = _FENCE_OPENER_RE.sub(_replace, text)
    return cleaned, rewritten


def enforce_length_cap(text: str, max_chars: int = DEFAULT_MAX_CHARS) -> tuple[str, int | None]:
    if len(text) <= max_chars:
        return text, None
    original_length = len(text)
    marker = f"\n\n_[...truncated at {max_chars} chars; original length {original_length}]_"
    body = text[: max_chars - len(marker)]
    return body + marker, original_length


def sanitize_artifact(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    allowed_langs: frozenset[str] = DEFAULT_ALLOWED_LANGS,
) -> tuple[str, SanitizeReport]:
    cleaned, control_count, invisible_count = strip_control_chars(text)
    cleaned, fences_rewritten = normalize_code_fences(cleaned, allowed_langs)
    cleaned, truncated_at = enforce_length_cap(cleaned, max_chars)
    report = SanitizeReport(
        control_chars_stripped=control_count,
        invisible_chars_stripped=invisible_count,
        fences_rewritten=fences_rewritten,
        truncated_at=truncated_at,
    )
    return cleaned, report
