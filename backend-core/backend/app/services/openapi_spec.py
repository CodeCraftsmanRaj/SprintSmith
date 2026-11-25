"""Normalize generated API artifact payloads into checked OpenAPI 3.0 documents."""
from __future__ import annotations

import re
from typing import Any


_METHODS = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}
_TYPES = {"string", "integer", "number", "boolean", "object", "array"}


class OpenAPIValidationError(ValueError):
    pass


def _schema(fields: list[dict[str, Any]]) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    required: list[str] = []
    for field in fields:
        name = str(field.get("name", "")).strip()
        if not name:
            raise OpenAPIValidationError("API fields must include a name")
        kind = str(field.get("type", "string")).lower()
        if kind not in _TYPES:
            kind = "string"
        prop: dict[str, Any] = {"type": kind}
        if field.get("description"):
            prop["description"] = str(field["description"])
        if kind == "array":
            prop["items"] = {"type": "string"}
        properties[name] = prop
        if field.get("required", False):
            required.append(name)
    result: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        result["required"] = required
    return result


def _validate_openapi(spec: dict[str, Any]) -> dict[str, Any]:
    version = spec.get("openapi")
    if not isinstance(version, str) or not re.fullmatch(r"3\.0\.\d+", version):
        raise OpenAPIValidationError("OpenAPI version must be 3.0.x")
    info = spec.get("info")
    paths = spec.get("paths")
    if not isinstance(info, dict) or not info.get("title") or not info.get("version"):
        raise OpenAPIValidationError("OpenAPI info.title and info.version are required")
    if not isinstance(paths, dict):
        raise OpenAPIValidationError("OpenAPI paths must be an object")
    for path, operations in paths.items():
        if not isinstance(path, str) or not path.startswith("/") or not isinstance(operations, dict):
            raise OpenAPIValidationError("OpenAPI paths must map slash-prefixed paths to operations")
        if path.count("{") != path.count("}"):
            raise OpenAPIValidationError(f"Malformed path template: {path}")
        path_names = set(re.findall(r"\{([^{}]+)\}", path))
        for method, operation in operations.items():
            if method not in _METHODS:
                raise OpenAPIValidationError(f"Unsupported OpenAPI operation: {method}")
            if not isinstance(operation, dict) or not isinstance(operation.get("responses"), dict):
                raise OpenAPIValidationError(f"Operation {method.upper()} {path} must define responses")
            response_codes = operation["responses"]
            if not response_codes or any(code != "default" and
                    (not str(code).isdigit() or not 100 <= int(code) <= 599)
                    for code in response_codes):
                raise OpenAPIValidationError(f"Operation {method.upper()} {path} has invalid responses")
            declared = {parameter.get("name") for parameter in operation.get("parameters", [])
                        if isinstance(parameter, dict) and parameter.get("in") == "path" and
                        parameter.get("required") is True}
            if not path_names.issubset(declared):
                raise OpenAPIValidationError(f"Operation {method.upper()} {path} is missing required path parameters")
    return spec


def to_openapi_spec(payload: dict[str, Any], title: str = "Generated API") -> dict[str, Any]:
    """Accept native OpenAPI or convert the legacy endpoints schema to OpenAPI 3.0."""
    if "openapi" in payload:
        return _validate_openapi(payload)
    endpoints = payload.get("endpoints")
    if not isinstance(endpoints, list) or not endpoints:
        raise OpenAPIValidationError("API specification must contain an endpoints array or OpenAPI document")

    paths: dict[str, dict[str, Any]] = {}
    for endpoint in endpoints:
        if not isinstance(endpoint, dict):
            raise OpenAPIValidationError("Each API endpoint must be an object")
        method = str(endpoint.get("method", "")).lower()
        path = str(endpoint.get("path", ""))
        description = str(endpoint.get("description", ""))
        if method not in _METHODS or not path.startswith("/"):
            raise OpenAPIValidationError("Each endpoint needs a supported HTTP method and slash-prefixed path")
        if method in paths.setdefault(path, {}):
            raise OpenAPIValidationError(f"Duplicate operation: {method.upper()} {path}")
        operation: dict[str, Any] = {
            "operationId": re.sub(r"[^A-Za-z0-9]+", "_", f"{method}_{path}").strip("_"),
            "summary": description[:200] or f"{method.upper()} {path}",
            "description": description,
            "responses": {},
        }
        path_parameters = re.findall(r"\{([^{}]+)\}", path)
        if path_parameters:
            operation["parameters"] = [
                {"name": name, "in": "path", "required": True,
                 "schema": {"type": "string"}}
                for name in path_parameters
            ]
        request_schema = _schema(endpoint.get("request_schema") or [])
        if request_schema["properties"]:
            operation["requestBody"] = {
                "required": bool(request_schema.get("required")),
                "content": {"application/json": {"schema": request_schema}},
            }
        success_code = "201" if method == "post" else "200"
        operation["responses"][success_code] = {
            "description": "Successful response",
            "content": {"application/json": {"schema": _schema(endpoint.get("response_schema") or [])}},
        }
        for error in endpoint.get("error_codes") or []:
            code = str(error.get("code", ""))
            if not code.isdigit() or not 100 <= int(code) <= 599:
                raise OpenAPIValidationError("Error response codes must be HTTP status codes")
            operation["responses"][code] = {"description": str(error.get("reason") or "Error")}
        paths[path][method] = operation

    spec = {"openapi": "3.0.3", "info": {"title": title, "version": "1.0.0"}, "paths": paths}
    return _validate_openapi(spec)
