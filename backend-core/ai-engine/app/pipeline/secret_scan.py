"""High-confidence credential detection for raw requirement text."""
from __future__ import annotations

import re

_PATTERNS = {
    "aws_access_key_id": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "github_pat": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{82,})\b"),
    "openai_api_key": re.compile(r"\bsk-(?:proj-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{48})\b"),
    "google_api_key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "slack_token": re.compile(r"\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[0-9A-Za-z]{24,34}\b"),
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----"),
}


def scan_for_secrets(text: str) -> list[str]:
    findings = []
    for name, pattern in _PATTERNS.items():
        for match in pattern.finditer(text):
            value = match.group(0)
            masked = value[:4] + "…" + value[-4:] if len(value) > 8 else "…"
            findings.append(f"{name} ({masked})")
    return findings


def raise_if_secrets_found(text: str) -> None:
    findings = scan_for_secrets(text)
    if findings:
        raise ValueError("Requirement contains possible secrets: " + ", ".join(findings) + ". Remove or rotate them before submission.")
