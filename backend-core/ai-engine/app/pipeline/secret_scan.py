"""High-confidence credential detection for raw requirement text."""
from __future__ import annotations

import re
import os
import logging

_PATTERNS = {
    "aws_access_key_id": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "github_pat": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{82,})\b"),
    "openai_api_key": re.compile(r"\bsk-(?:proj-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{48})\b"),
    "google_api_key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "slack_token": re.compile(r"\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[0-9A-Za-z]{24,34}\b"),
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----"),
}
_logger = logging.getLogger("sprintsmith.sensitive_data")
_PII_PATTERNS = {
    "email": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
    "us_ssn": re.compile(r"\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b"),
    "us_phone": re.compile(r"\b(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-][2-9]\d{2}[ .-]\d{4}\b"),
    "payment_card_candidate": re.compile(r"\b(?:\d[ -]*?){13,19}\b"),
}


def scan_for_secrets(text: str) -> list[str]:
    findings = []
    for name, pattern in _PATTERNS.items():
        for match in pattern.finditer(text):
            value = match.group(0)
            masked = value[:4] + "…" + value[-4:] if len(value) > 8 else "…"
            findings.append(f"{name} ({masked})")
    return findings


def scan_for_pii(text: str) -> list[str]:
    findings: list[str] = []
    for name, pattern in _PII_PATTERNS.items():
        for match in pattern.finditer(text):
            value = match.group(0)
            digits = re.sub(r"\D", "", value)
            if name == "payment_card_candidate" and not _passes_luhn(digits):
                continue
            findings.append(name)
    return sorted(set(findings))


def _passes_luhn(digits: str) -> bool:
    if not 13 <= len(digits) <= 19:
        return False
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char)
        if index % 2:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


def inspect_sensitive_text(text: str) -> dict[str, list[str]]:
    """Block credentials; apply configured policy to PII without retaining values."""
    secrets = scan_for_secrets(text)
    pii = scan_for_pii(text)
    if secrets:
        raise ValueError("Input contains high-confidence credentials; redact or rotate them before submission.")
    policy = os.environ.get("SPRINTSMITH_PII_POLICY", "block" if os.environ.get("RTIA_ENV") == "production" else "warn").lower()
    if pii and policy == "block":
        raise ValueError("Input contains personal data (" + ", ".join(pii) + "); remove it or configure an approved PII policy.")
    if pii and policy == "warn":
        _logger.warning("Requirement includes detected PII categories: %s", ", ".join(pii))
    return {"secrets": [], "pii": pii}


def raise_if_secrets_found(text: str) -> None:
    inspect_sensitive_text(text)
