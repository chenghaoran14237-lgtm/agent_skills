#!/usr/bin/env python3
"""Lightweight CHR document governance.

The checker is intentionally deterministic and path-based. It reports document
governance health and likely documentation impact from the current git state; it
does not prove semantic consistency between code and documents.
"""

from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import json
import pathlib
import re
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Any, Iterable

if sys.version_info < (3, 11):
    print("ERROR: CHR requires Python 3.11+ for standard-library TOML parsing.", file=sys.stderr)
    raise SystemExit(2)

import tomllib


STATUSES = {"draft", "active", "deprecated", "superseded", "archived"}
REQUIRED_FIELDS = {"status", "owner", "last_reviewed", "doc_type", "authority"}
AUTHORITY_VALUES = {"critical", "high", "medium", "low"}
DEFAULT_ENTRY_DOCS = ["AGENTS.md", "DOCS_POLICY.md"]
DEFAULT_DOC_ROOTS = ["docs", "openspec/specs", "openspec/changes", "skills"]
DEFAULT_BASE_BRANCHES = ["origin/main", "origin/master", "main", "master"]
DEFAULT_IGNORE_PATHS = [
    ".git/**",
    "node_modules/**",
    "dist/**",
    "build/**",
    "target/**",
    ".venv/**",
    "venv/**",
    "__pycache__/**",
]
GOVERNED_SUFFIXES = {".md", ".html"}
GOVERNED_NAMES = {"AGENTS.md", "DOCS_POLICY.md", "ARCHITECTURE.md", "CONVENTIONS.md"}
CONFIG_NAME = ".chr.toml"
WAIVERS_NAME = ".chr/waivers.toml"
README_POLICIES = {"portal", "authority", "ignored"}
LINK_RE = re.compile(r"\[[^\]]+\]\((?!https?://|mailto:|#)([^)]+)\)")
HTML_META_RE = re.compile(
    r"<meta\s+name=[\"']governance-([^\"']+)[\"']\s+content=[\"']([^\"']*)[\"']\s*/?>",
    re.IGNORECASE,
)


@dataclass
class Issue:
    level: str
    path: str
    message: str


@dataclass
class RiskRule:
    glob: str
    docs: list[str]
    triggers: list[str] = field(default_factory=list)
    enforce: bool = False
    suggest_decision: bool = False


@dataclass
class Config:
    present: bool = False
    version: int = 1
    readme_role: str = "portal"
    base_branches: list[str] = field(default_factory=lambda: list(DEFAULT_BASE_BRANCHES))
    entry_docs: list[str] = field(default_factory=lambda: list(DEFAULT_ENTRY_DOCS))
    doc_roots: list[str] = field(default_factory=lambda: list(DEFAULT_DOC_ROOTS))
    non_authoritative: list[str] = field(default_factory=list)
    ignore_paths: list[str] = field(default_factory=lambda: list(DEFAULT_IGNORE_PATHS))
    risk_paths: list[RiskRule] = field(default_factory=list)


@dataclass
class Waiver:
    id: str
    paths: list[str]
    docs: list[str]
    reason: str
    expires_on: str
    triggers: list[str] = field(default_factory=list)


@dataclass
class ChangePath:
    path: str
    status: str
    source: str


@dataclass
class GitState:
    inside_work_tree: bool = False
    branch: str = ""
    head: str = ""
    base_ref: str = ""
    base_commit: str = ""
    staged: list[ChangePath] = field(default_factory=list)
    unstaged: list[ChangePath] = field(default_factory=list)
    untracked: list[ChangePath] = field(default_factory=list)
    branch_diff: list[ChangePath] = field(default_factory=list)

    @property
    def local_changes(self) -> list[ChangePath]:
        return self.staged + self.unstaged + self.untracked

    @property
    def all_changes(self) -> list[ChangePath]:
        return self.local_changes + self.branch_diff

    @property
    def dirty(self) -> bool:
        return bool(self.local_changes)


def normalize_path(value: str) -> str:
    value = value.strip().replace("\\", "/")
    while value.startswith("./"):
        value = value[2:]
    return value.rstrip("/")


def parse_date(value: str) -> dt.date | None:
    value = value.strip()
    if not value:
        return None
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        return None


def path_matches(path: str, pattern: str) -> bool:
    return fnmatch.fnmatchcase(normalize_path(path), normalize_path(pattern))


def any_match(path: str, patterns: Iterable[str]) -> bool:
    return any(path_matches(path, pattern) for pattern in patterns)


def rel_path(root: pathlib.Path, path: pathlib.Path) -> str:
    return normalize_path(str(path.relative_to(root)))


def parse_frontmatter(text: str) -> tuple[dict[str, str], bool]:
    if not text.startswith("---\n"):
        return {}, False
    end = text.find("\n---", 4)
    if end == -1:
        return {}, False
    data: dict[str, str] = {}
    for line in text[4:end].strip().splitlines():
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data, True


def parse_html_metadata(text: str) -> tuple[dict[str, str], bool]:
    data: dict[str, str] = {}
    for key, value in HTML_META_RE.findall(text):
        data[key.strip().replace("-", "_")] = value.strip()
    return data, bool(data)


def parse_governance_metadata(path: pathlib.Path, text: str) -> tuple[dict[str, str], bool]:
    if path.suffix == ".html":
        return parse_html_metadata(text)
    return parse_frontmatter(text)


def load_toml(path: pathlib.Path) -> tuple[dict[str, Any], Issue | None]:
    if not path.exists():
        return {}, None
    try:
        return tomllib.loads(path.read_text(encoding="utf-8")), None
    except tomllib.TOMLDecodeError as exc:
        return {}, Issue("error", rel_path(path.parent, path) if path.parent.exists() else str(path), f"invalid TOML: {exc}")


def ensure_string_list(value: Any, field_name: str, path: str, issues: list[Issue]) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        issues.append(Issue("error", path, f"{field_name} must be a list of strings"))
        return []
    return [normalize_path(item) for item in value]


def load_config(root: pathlib.Path) -> tuple[Config, list[Issue]]:
    path = root / CONFIG_NAME
    config = Config(present=path.exists())
    issues: list[Issue] = []
    raw, parse_issue = load_toml(path)
    if parse_issue:
        issues.append(Issue(parse_issue.level, CONFIG_NAME, parse_issue.message))
        return config, issues
    if not raw:
        return config, issues

    allowed = {
        "version",
        "readme_role",
        "base_branches",
        "entry_docs",
        "doc_roots",
        "non_authoritative",
        "ignore_paths",
        "risk_paths",
    }
    for key in sorted(set(raw) - allowed):
        issues.append(Issue("warning", CONFIG_NAME, f"unknown top-level key: {key}"))

    version = raw.get("version")
    if not isinstance(version, int):
        issues.append(Issue("error", CONFIG_NAME, "version must be an integer"))
    elif version != 1:
        issues.append(Issue("error", CONFIG_NAME, f"unsupported version: {version}"))
    else:
        config.version = version

    readme_role = raw.get("readme_role", config.readme_role)
    if not isinstance(readme_role, str) or readme_role not in README_POLICIES:
        issues.append(Issue("error", CONFIG_NAME, "readme_role must be one of: portal, authority, ignored"))
    else:
        config.readme_role = readme_role

    for key in ["base_branches", "entry_docs", "doc_roots", "non_authoritative", "ignore_paths"]:
        if key in raw:
            values = ensure_string_list(raw.get(key), key, CONFIG_NAME, issues)
            if values or raw.get(key) == []:
                setattr(config, key, values)

    risk_paths = raw.get("risk_paths", [])
    if risk_paths is None:
        risk_paths = []
    if not isinstance(risk_paths, list):
        issues.append(Issue("error", CONFIG_NAME, "risk_paths must be an array of tables"))
        risk_paths = []
    for index, item in enumerate(risk_paths, start=1):
        rule_path = f"{CONFIG_NAME}:risk_paths[{index}]"
        if not isinstance(item, dict):
            issues.append(Issue("error", rule_path, "risk path entry must be a table"))
            continue
        unknown = set(item) - {"glob", "docs", "triggers", "enforce", "suggest_decision"}
        for key in sorted(unknown):
            issues.append(Issue("warning", rule_path, f"unknown key: {key}"))
        glob_value = item.get("glob")
        if not isinstance(glob_value, str) or not glob_value.strip():
            issues.append(Issue("error", rule_path, "glob is required"))
            continue
        docs = ensure_string_list(item.get("docs"), "docs", rule_path, issues)
        if not docs:
            issues.append(Issue("error", rule_path, "docs must name at least one affected document"))
        triggers = ensure_string_list(item.get("triggers", []), "triggers", rule_path, issues)
        enforce = item.get("enforce", False)
        suggest_decision = item.get("suggest_decision", False)
        if not isinstance(enforce, bool):
            issues.append(Issue("error", rule_path, "enforce must be a boolean"))
            enforce = False
        if not isinstance(suggest_decision, bool):
            issues.append(Issue("error", rule_path, "suggest_decision must be a boolean"))
            suggest_decision = False
        if docs:
            config.risk_paths.append(
                RiskRule(
                    glob=normalize_path(glob_value),
                    docs=docs,
                    triggers=triggers,
                    enforce=enforce,
                    suggest_decision=suggest_decision,
                )
            )
    return config, issues


def load_waivers(root: pathlib.Path, ci: bool) -> tuple[list[Waiver], list[Issue]]:
    path = root / WAIVERS_NAME
    issues: list[Issue] = []
    if not path.exists():
        return [], issues
    raw, parse_issue = load_toml(path)
    if parse_issue:
        issues.append(Issue(parse_issue.level, WAIVERS_NAME, parse_issue.message))
        return [], issues
    waivers_raw = raw.get("waivers", [])
    if not isinstance(waivers_raw, list):
        issues.append(Issue("error", WAIVERS_NAME, "waivers must be an array of tables"))
        return [], issues
    today = dt.date.today()
    waivers: list[Waiver] = []
    for index, item in enumerate(waivers_raw, start=1):
        waiver_path = f"{WAIVERS_NAME}:waivers[{index}]"
        if not isinstance(item, dict):
            issues.append(Issue("error", waiver_path, "waiver entry must be a table"))
            continue
        unknown = set(item) - {"id", "paths", "docs", "reason", "expires_on", "triggers"}
        for key in sorted(unknown):
            issues.append(Issue("warning", waiver_path, f"unknown key: {key}"))
        waiver_id = item.get("id")
        reason = item.get("reason")
        expires_on = item.get("expires_on")
        if not isinstance(waiver_id, str) or not waiver_id.strip():
            issues.append(Issue("error", waiver_path, "id is required"))
            continue
        if not isinstance(reason, str) or not reason.strip():
            issues.append(Issue("error", waiver_path, "reason is required"))
            continue
        if not isinstance(expires_on, str) or parse_date(expires_on) is None:
            issues.append(Issue("error", waiver_path, "expires_on must be YYYY-MM-DD"))
            continue
        paths = ensure_string_list(item.get("paths"), "paths", waiver_path, issues)
        docs = ensure_string_list(item.get("docs"), "docs", waiver_path, issues)
        triggers = ensure_string_list(item.get("triggers", []), "triggers", waiver_path, issues)
        if not paths:
            issues.append(Issue("error", waiver_path, "paths must name at least one path or glob"))
        if not docs:
            issues.append(Issue("error", waiver_path, "docs must name at least one affected document"))
        expiry = parse_date(expires_on)
        if expiry and expiry < today:
            level = "error" if ci else "warning"
            issues.append(Issue(level, waiver_path, f"waiver expired on {expiry}: {waiver_id}"))
        if paths and docs:
            waivers.append(
                Waiver(
                    id=waiver_id.strip(),
                    paths=paths,
                    docs=docs,
                    reason=reason.strip(),
                    expires_on=expires_on.strip(),
                    triggers=triggers,
                )
            )
            if not triggers:
                issues.append(Issue("warning", waiver_path, f"waiver has no triggers: {waiver_id}"))
    return waivers, issues


def iter_governed(root: pathlib.Path, config: Config) -> Iterable[pathlib.Path]:
    yielded: set[pathlib.Path] = set()

    def emit(path: pathlib.Path) -> Iterable[pathlib.Path]:
        if path.exists() and path.suffix in GOVERNED_SUFFIXES and path not in yielded:
            yielded.add(path)
            yield path

    for doc in config.entry_docs:
        yield from emit(root / doc)
    if config.readme_role == "authority":
        yield from emit(root / "README.md")

    roots = [normalize_path(item) for item in config.doc_roots]
    for doc_root in roots:
        base = root / doc_root
        if not base.exists():
            continue
        for suffix in GOVERNED_SUFFIXES:
            for path in base.rglob(f"*{suffix}"):
                rel = rel_path(root, path)
                if any_match(rel, config.ignore_paths):
                    continue
                if path not in yielded:
                    yielded.add(path)
                    yield path


def is_governed_target(root: pathlib.Path, target: pathlib.Path, statuses: dict[str, str], config: Config) -> bool:
    try:
        rel = rel_path(root, target)
    except ValueError:
        return False
    return rel in statuses


def normalize_link(base: pathlib.Path, href: str) -> pathlib.Path:
    href = href.split("#", 1)[0].strip().strip("<>").replace("%20", " ")
    return (base.parent / href).resolve()


def check_file(
    root: pathlib.Path,
    path: pathlib.Path,
    statuses: dict[str, str],
    config: Config,
    today: dt.date,
    ci: bool,
) -> list[Issue]:
    rel = rel_path(root, path)
    text = path.read_text(encoding="utf-8", errors="replace")
    metadata, has_metadata = parse_governance_metadata(path, text)
    issues: list[Issue] = []

    if not has_metadata:
        issues.append(Issue("error", rel, "missing governance metadata"))
    else:
        missing = sorted(field for field in REQUIRED_FIELDS if field not in metadata)
        if missing:
            issues.append(Issue("error", rel, f"missing metadata fields: {', '.join(missing)}"))
        status = metadata.get("status", "")
        if status and status not in STATUSES:
            issues.append(Issue("error", rel, f"invalid status '{status}'"))
        authority = metadata.get("authority", "")
        if authority and authority not in AUTHORITY_VALUES:
            issues.append(Issue("warning", rel, f"unknown authority '{authority}'"))
        last_reviewed = parse_date(metadata.get("last_reviewed", ""))
        review_after = parse_date(metadata.get("review_after", ""))
        expires_on = parse_date(metadata.get("expires_on", ""))
        if metadata.get("last_reviewed") and last_reviewed is None:
            issues.append(Issue("error", rel, "invalid last_reviewed date; use YYYY-MM-DD"))
        if metadata.get("review_after") and review_after is None:
            issues.append(Issue("error", rel, "invalid review_after date; use YYYY-MM-DD"))
        if metadata.get("expires_on") and expires_on is None:
            issues.append(Issue("error", rel, "invalid expires_on date; use YYYY-MM-DD"))
        if status == "active" and review_after and review_after < today:
            issues.append(Issue("warning", rel, f"active document is past review_after ({review_after})"))
        if status == "draft":
            if not metadata.get("expires_on"):
                issues.append(Issue("warning", rel, "draft document should set expires_on"))
            elif expires_on and expires_on < today:
                level = "error" if ci else "warning"
                issues.append(Issue(level, rel, f"draft document expired on {expires_on}"))
        if status == "superseded" and not metadata.get("superseded_by"):
            issues.append(Issue("error", rel, "superseded document must set superseded_by"))

    if path.name == "AGENTS.md":
        lines = len(text.splitlines())
        if lines > 300:
            issues.append(Issue("error", rel, f"AGENTS.md is too long ({lines} lines); keep it as an entry map"))
        elif lines > 220:
            issues.append(Issue("warning", rel, f"AGENTS.md is getting long ({lines} lines); move details into docs"))

    for href in LINK_RE.findall(text):
        href = href.strip()
        if not href:
            continue
        target = normalize_link(path, href)
        if not target.exists():
            issues.append(Issue("error", rel, f"broken relative link: {href}"))
            continue
        if is_governed_target(root, target, statuses, config):
            target_rel = rel_path(root, target)
            target_status = statuses.get(target_rel)
            if path.name == "AGENTS.md" and target_status in {"archived", "superseded"}:
                issues.append(Issue("error", rel, f"AGENTS.md links to non-current document: {href} ({target_status})"))
            elif target_status == "archived":
                issues.append(Issue("warning", rel, f"links to archived document: {href}"))
            elif target_status == "superseded":
                issues.append(Issue("warning", rel, f"links to superseded document: {href}"))
    return issues


def run_git(root: pathlib.Path, args: list[str]) -> tuple[int, str]:
    proc = subprocess.run(
        ["git", *args],
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return proc.returncode, proc.stdout.strip()


def parse_name_status(output: str, source: str) -> list[ChangePath]:
    changes: list[ChangePath] = []
    for line in output.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        status = parts[0]
        if (status.startswith("R") or status.startswith("C")) and len(parts) >= 3:
            changes.append(ChangePath(normalize_path(parts[1]), status, source))
            changes.append(ChangePath(normalize_path(parts[2]), status, source))
        elif len(parts) >= 2:
            changes.append(ChangePath(normalize_path(parts[1]), status, source))
    return changes


def load_git_state(root: pathlib.Path, config: Config, base: str | None = None) -> GitState:
    state = GitState()
    code, output = run_git(root, ["rev-parse", "--is-inside-work-tree"])
    if code != 0 or output != "true":
        return state
    state.inside_work_tree = True

    _, branch = run_git(root, ["branch", "--show-current"])
    state.branch = branch or "(detached)"
    code, head = run_git(root, ["rev-parse", "--short", "HEAD"])
    state.head = head if code == 0 else "(no commits)"

    _, staged = run_git(root, ["diff", "--name-status", "--cached"])
    _, unstaged = run_git(root, ["diff", "--name-status"])
    _, untracked = run_git(root, ["ls-files", "--others", "--exclude-standard"])
    state.staged = parse_name_status(staged, "staged")
    state.unstaged = parse_name_status(unstaged, "unstaged")
    state.untracked = [ChangePath(normalize_path(path), "??", "untracked") for path in untracked.splitlines() if path.strip()]

    candidates = [base] if base else []
    candidates.extend(config.base_branches)
    for candidate in [item for item in candidates if item]:
        code, _ = run_git(root, ["rev-parse", "--verify", "--quiet", candidate])
        if code != 0:
            continue
        code, merge_base = run_git(root, ["merge-base", "HEAD", candidate])
        if code != 0 or not merge_base:
            continue
        code, diff = run_git(root, ["diff", "--name-status", merge_base, "HEAD"])
        if code == 0:
            state.base_ref = candidate
            state.base_commit = merge_base[:12]
            state.branch_diff = parse_name_status(diff, "branch")
            break
    return state


def changed_path_set(changes: Iterable[ChangePath]) -> set[str]:
    return {change.path for change in changes}


def waiver_matches(waiver: Waiver, path: str, doc: str, triggers: list[str]) -> bool:
    if not any_match(path, waiver.paths):
        return False
    if doc not in waiver.docs and "*" not in waiver.docs:
        return False
    if waiver.triggers and triggers and not (set(waiver.triggers) & set(triggers)):
        return False
    return True


def check_impacts(root: pathlib.Path, config: Config, git_state: GitState, waivers: list[Waiver], ci: bool) -> list[Issue]:
    issues: list[Issue] = []
    if not git_state.inside_work_tree:
        issues.append(Issue("warning", "git", "not a git work tree; git-aware impact checks skipped"))
        return issues
    if not config.present:
        issues.append(Issue("warning", CONFIG_NAME, "missing .chr.toml; git-aware impact checks disabled"))
        return issues
    if not config.risk_paths:
        issues.append(Issue("info", CONFIG_NAME, "no risk_paths configured; no doc-impact matching performed"))
        return issues

    all_changes = [
        change for change in git_state.all_changes if not any_match(change.path, config.ignore_paths)
    ]
    all_changed_paths = changed_path_set(all_changes)
    for change in all_changes:
        for rule in config.risk_paths:
            if not path_matches(change.path, rule.glob):
                continue
            for doc in rule.docs:
                doc_path = normalize_path(doc)
                if not (root / doc_path).exists():
                    issues.append(Issue("warning", doc_path, f"affected document is missing for changed path {change.path}"))
                    continue
                if doc_path in all_changed_paths:
                    issues.append(
                        Issue(
                            "info",
                            doc_path,
                            f"affected document was touched; {change.path} matched {rule.glob}",
                        )
                    )
                    continue
                waiver = next((item for item in waivers if waiver_matches(item, change.path, doc_path, rule.triggers)), None)
                if waiver:
                    issues.append(
                        Issue(
                            "info",
                            doc_path,
                            f"impact waived by {waiver.id}; {change.path} matched {rule.glob}",
                        )
                    )
                    continue
                level = "error" if ci and rule.enforce else "warning"
                message = f"may need review; {change.path} matched {rule.glob}"
                if rule.suggest_decision:
                    message += "; consider a decision record if rationale changed"
                issues.append(Issue(level, doc_path, message))
    return dedupe_issues(issues)


def dedupe_issues(issues: list[Issue]) -> list[Issue]:
    seen: set[tuple[str, str, str]] = set()
    result: list[Issue] = []
    for issue in issues:
        key = (issue.level, issue.path, issue.message)
        if key not in seen:
            result.append(issue)
            seen.add(key)
    return result


def inventory(root: pathlib.Path, config: Config) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(iter_governed(root, config)):
        text = path.read_text(encoding="utf-8", errors="replace")
        metadata, has_metadata = parse_governance_metadata(path, text)
        items.append(
            {
                "path": rel_path(root, path),
                "has_metadata": has_metadata,
                "status": metadata.get("status", ""),
                "doc_type": metadata.get("doc_type", ""),
                "authority": metadata.get("authority", ""),
                "owner": metadata.get("owner", ""),
                "last_reviewed": metadata.get("last_reviewed", ""),
                "review_after": metadata.get("review_after", ""),
                "expires_on": metadata.get("expires_on", ""),
                "superseded_by": metadata.get("superseded_by", ""),
                "lines": len(text.splitlines()),
            }
        )
    return items


def project_status(root: pathlib.Path, config: Config) -> str:
    has_agents = (root / "AGENTS.md").exists()
    has_policy = (root / "DOCS_POLICY.md").exists()
    if config.present and has_agents and has_policy:
        return "initialized"
    if not config.present and not has_agents and not has_policy:
        return "not_initialized"
    return "partial"


def check(
    root: pathlib.Path,
    ci: bool = False,
    base: str | None = None,
    as_json: bool = False,
    strict_warnings: bool = False,
) -> int:
    root = root.resolve()
    today = dt.date.today()
    config, config_issues = load_config(root)
    waivers, waiver_issues = load_waivers(root, ci)
    git_state = load_git_state(root, config, base)
    files = sorted(iter_governed(root, config))
    statuses: dict[str, str] = {}
    for path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        metadata, _ = parse_governance_metadata(path, text)
        statuses[rel_path(root, path)] = metadata.get("status", "")

    lifecycle_issues: list[Issue] = []
    status = project_status(root, config)
    if status == "not_initialized":
        lifecycle_issues.append(
            Issue("warning", ".", "CHR is not initialized; run chr.py init or let Codex create the minimal governance files")
        )
    elif status == "partial":
        if not config.present:
            lifecycle_issues.append(Issue("warning", CONFIG_NAME, "missing .chr.toml"))
        if not (root / "AGENTS.md").exists():
            lifecycle_issues.append(Issue("error", "AGENTS.md", "root AGENTS.md is missing"))
        if not (root / "DOCS_POLICY.md").exists():
            lifecycle_issues.append(Issue("warning", "DOCS_POLICY.md", "DOCS_POLICY.md is missing; governance policy should be explicit"))

    for path in files:
        lifecycle_issues.extend(check_file(root, path, statuses, config, today, ci))

    impact_issues = check_impacts(root, config, git_state, waivers, ci)
    all_issues = dedupe_issues(config_issues + waiver_issues + lifecycle_issues + impact_issues)
    errors = [issue for issue in all_issues if issue.level == "error"]
    warnings = [issue for issue in all_issues if issue.level == "warning"]
    infos = [issue for issue in all_issues if issue.level == "info"]

    if as_json:
        print(
            json.dumps(
                {
                    "root": str(root),
                    "status": status,
                    "config_present": config.present,
                    "files_checked": len(files),
                    "git": {
                        "inside_work_tree": git_state.inside_work_tree,
                        "branch": git_state.branch,
                        "head": git_state.head,
                        "workspace": "dirty" if git_state.dirty else "clean",
                        "staged": len(git_state.staged),
                        "unstaged": len(git_state.unstaged),
                        "untracked": len(git_state.untracked),
                        "base_ref": git_state.base_ref,
                        "base_commit": git_state.base_commit,
                        "branch_diff": len(git_state.branch_diff),
                    },
                    "errors": [issue.__dict__ for issue in errors],
                    "warnings": [issue.__dict__ for issue in warnings],
                    "infos": [issue.__dict__ for issue in infos],
                },
                indent=2,
            )
        )
    else:
        print("CHR Governance Check")
        print(f"Root: {root}")
        print(f"Project status: {status}")
        print(f"Governance files checked: {len(files)}")
        if git_state.inside_work_tree:
            print("Version anchor:")
            print(f"- branch: {git_state.branch}")
            print(f"- head: {git_state.head}")
            print(f"- workspace: {'dirty' if git_state.dirty else 'clean'}")
            print(f"- staged: {len(git_state.staged)}")
            print(f"- unstaged: {len(git_state.unstaged)}")
            print(f"- untracked: {len(git_state.untracked)}")
            if git_state.base_ref:
                print(f"- base: {git_state.base_ref} ({git_state.base_commit})")
                print(f"- branch_diff: {len(git_state.branch_diff)}")
        else:
            print("Version anchor: unavailable; not a git work tree")
        print(f"Errors: {len(errors)}")
        print(f"Warnings: {len(warnings)}")
        print(f"Info: {len(infos)}")
        for issue in all_issues:
            print(f"{issue.level.upper()}: {issue.path}: {issue.message}")
    return 1 if errors or (strict_warnings and warnings) else 0


def write_if_missing(path: pathlib.Path, content: str, force: bool, created: list[str], skipped: list[str]) -> None:
    if path.exists() and not force:
        skipped.append(str(path))
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    created.append(str(path))


def init_project(root: pathlib.Path, force: bool = False) -> int:
    root = root.resolve()
    today = dt.date.today().isoformat()
    created: list[str] = []
    skipped: list[str] = []

    agents = f"""---
status: active
owner: engineering
last_reviewed: {today}
review_after:
expires_on:
superseded_by:
doc_type: agent-entry
authority: critical
---

# Agent Entry

This repository uses CHR-governed documentation.

Current implementation authority is limited to active governed documents.
Draft, deprecated, superseded, and archived documents are not current
implementation authority.

Start with:

- [DOCS_POLICY.md](DOCS_POLICY.md)
- [.chr.toml](.chr.toml)

Use the CHR skill for document governance. Treat `README.md` as a human portal
unless `.chr.toml` explicitly says otherwise.
"""

    policy = f"""---
status: active
owner: engineering
last_reviewed: {today}
review_after:
expires_on:
superseded_by:
doc_type: policy
authority: high
---

# Documentation Governance Policy

## Trust Rules

- Code and tests are the first source of implementation truth.
- Only `status: active` governed documents are current implementation authority.
- `draft` documents are discussion material.
- `deprecated` documents should not gain new dependencies.
- `superseded` and `archived` documents are historical background only.
- If code/tests and docs conflict, report the conflict before treating the doc
  as truth.

## Governed Documents

- `AGENTS.md`
- `DOCS_POLICY.md`
- active documents under `docs/`
- active OpenSpec documents under `openspec/specs/` and `openspec/changes/`

## Git-Aware Governance

CHR checks are anchored to `HEAD` plus staged, unstaged, and untracked local
changes. A document being touched is a weak signal that it may have been
reviewed; it is not proof that document contents are semantically synchronized.
"""

    docs_index = f"""---
status: active
owner: engineering
last_reviewed: {today}
review_after:
expires_on:
superseded_by:
doc_type: index
authority: high
---

# Project Documentation Index

This folder contains CHR-governed project documentation.

Only documents with `status: active` are current implementation authority.
Archived, superseded, deprecated, and draft documents are not authoritative.
"""

    config = """version = 1

readme_role = "portal"
base_branches = ["origin/main", "origin/master", "main", "master"]
entry_docs = ["AGENTS.md", "DOCS_POLICY.md"]
doc_roots = ["docs", "openspec/specs", "openspec/changes"]
non_authoritative = ["README.md", "docs/archive/**", "openspec/changes/archive/**"]
ignore_paths = ["dist/**", "build/**", "target/**", "node_modules/**", ".venv/**", "venv/**"]

# Add project-specific impact rules as the architecture becomes clear.
# [[risk_paths]]
# glob = "src/services/**"
# docs = ["docs/architecture.md"]
# triggers = ["architecture_boundary"]
# enforce = false
# suggest_decision = true
"""

    write_if_missing(root / "AGENTS.md", agents, force, created, skipped)
    write_if_missing(root / "DOCS_POLICY.md", policy, force, created, skipped)
    write_if_missing(root / ".chr.toml", config, force, created, skipped)
    write_if_missing(root / "docs" / "README.md", docs_index, force, created, skipped)

    print("CHR initialization")
    for path in created:
        print(f"CREATED: {path}")
    for path in skipped:
        print(f"SKIPPED: {path}")
    return 0


def inventory_command(root: pathlib.Path) -> int:
    config, issues = load_config(root.resolve())
    for issue in issues:
        print(f"{issue.level.upper()}: {issue.path}: {issue.message}", file=sys.stderr)
    print(json.dumps(inventory(root.resolve(), config), ensure_ascii=False, indent=2))
    return 1 if any(issue.level == "error" for issue in issues) else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="CHR document governance")
    subparsers = parser.add_subparsers(dest="command")

    check_parser = subparsers.add_parser("check", help="check governance health")
    check_parser.add_argument("--root", default=".", help="repository root")
    check_parser.add_argument("--base", help="optional git base ref")
    check_parser.add_argument("--ci", action="store_true", help="CI mode: enforce deterministic failures")
    check_parser.add_argument("--json", action="store_true", help="emit JSON")
    check_parser.add_argument("--strict-warnings", action="store_true", help="return non-zero on warnings")

    init_parser = subparsers.add_parser("init", help="create minimal CHR governance files")
    init_parser.add_argument("--root", default=".", help="repository root")
    init_parser.add_argument("--force", action="store_true", help="overwrite existing files")

    inventory_parser = subparsers.add_parser("inventory", help="print governed document inventory as JSON")
    inventory_parser.add_argument("--root", default=".", help="repository root")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "check":
        return check(
            pathlib.Path(args.root),
            ci=args.ci,
            base=args.base,
            as_json=args.json,
            strict_warnings=args.strict_warnings,
        )
    if args.command == "init":
        return init_project(pathlib.Path(args.root), force=args.force)
    if args.command == "inventory":
        return inventory_command(pathlib.Path(args.root))
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
