#!/usr/bin/env python3
"""Submit new or meaningfully changed production pages through IndexNow.

The production sitemap is the allowlist. The first automatic run verifies the
deployed key file and initializes a baseline without submitting existing URLs.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html.parser
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Callable, Iterable, Mapping, Sequence


DEFAULT_ENDPOINT = "https://api.indexnow.org/indexnow"
DEFAULT_SITE_ROOT = "https://www.vch-tech.com"
PAGES_WORKFLOW_NAME = "pages build and deployment"
PAGES_WORKFLOW_PATH = "dynamic/pages/pages-build-deployment"
INDEXNOW_WORKFLOW_FILE = "indexnow.yml"
USER_AGENT = "VChTech-IndexNow/1.0 (+https://www.vch-tech.com/)"
DISALLOWED_PATHS = {"/404.html", "/llms.txt", "/robots.txt", "/sitemap.xml"}
KEY_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,128}$")
TRANSIENT_STATUS = {429, 500, 502, 503, 504}
ACCEPTED_STATUS = {200, 202}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def normalize_space(value: str) -> str:
    return " ".join(value.split())


class SemanticHTMLParser(html.parser.HTMLParser):
    """Extract only indexable/semantic signals, ignoring source formatting."""

    EXCLUDED = {"style", "noscript", "template"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_body = False
        self.in_title = False
        self.excluded_depth = 0
        self.ld_json_depth = 0
        self.title_parts: list[str] = []
        self.body_parts: list[str] = []
        self.ld_json_parts: list[list[str]] = []
        self.metadata: list[tuple[str, str]] = []
        self.canonicals: list[str] = []
        self.links: list[str] = []
        self.images: list[tuple[str, str]] = []

    @staticmethod
    def _attrs(attrs: Sequence[tuple[str, str | None]]) -> dict[str, str]:
        return {key.lower(): (value or "") for key, value in attrs}

    def handle_starttag(
        self, tag: str, attrs: Sequence[tuple[str, str | None]]
    ) -> None:
        tag = tag.lower()
        values = self._attrs(attrs)
        if tag == "body":
            self.in_body = True
        elif tag == "title":
            self.in_title = True
        elif tag == "meta":
            key = (values.get("name") or values.get("property") or "").lower()
            if key:
                self.metadata.append((key, normalize_space(values.get("content", ""))))
        elif tag == "link" and "canonical" in values.get("rel", "").lower().split():
            self.canonicals.append(values.get("href", "").strip())
        elif tag == "a" and self.in_body:
            self.links.append(values.get("href", "").strip())
        elif tag == "img" and self.in_body:
            self.images.append(
                (values.get("src", "").strip(), normalize_space(values.get("alt", "")))
            )

        if tag == "script":
            if values.get("type", "").lower() == "application/ld+json":
                self.ld_json_depth += 1
                self.ld_json_parts.append([])
            else:
                self.excluded_depth += 1
        elif tag in self.EXCLUDED:
            self.excluded_depth += 1

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "body":
            self.in_body = False
        elif tag == "title":
            self.in_title = False
        elif tag == "script":
            if self.ld_json_depth:
                self.ld_json_depth -= 1
            elif self.excluded_depth:
                self.excluded_depth -= 1
        elif tag in self.EXCLUDED and self.excluded_depth:
            self.excluded_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
        if self.ld_json_depth and self.ld_json_parts:
            self.ld_json_parts[-1].append(data)
        elif self.in_body and not self.excluded_depth:
            cleaned = normalize_space(data)
            if cleaned:
                self.body_parts.append(cleaned)


def _normalized_json_ld(parts: Sequence[Sequence[str]]) -> list[str]:
    normalized: list[str] = []
    for chunks in parts:
        raw = "".join(chunks).strip()
        if not raw:
            continue
        try:
            value = json.loads(raw)
            normalized.append(
                json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            )
        except json.JSONDecodeError:
            normalized.append(normalize_space(raw))
    return normalized


def semantic_document(source: str) -> dict[str, object]:
    parser = SemanticHTMLParser()
    parser.feed(source)
    parser.close()
    return {
        "title": normalize_space(" ".join(parser.title_parts)),
        "metadata": sorted(parser.metadata),
        "canonical": parser.canonicals,
        "json_ld": _normalized_json_ld(parser.ld_json_parts),
        "body": parser.body_parts,
        "links": parser.links,
        "images": parser.images,
    }


def semantic_fingerprint(source: str) -> str:
    serialized = json.dumps(
        semantic_document(source), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def page_directives(source: str) -> tuple[list[str], set[str]]:
    parser = SemanticHTMLParser()
    parser.feed(source)
    parser.close()
    directives: set[str] = set()
    for key, content in parser.metadata:
        if key in {"robots", "googlebot", "bingbot", "yandex", "yandexbot"}:
            directives.update(item.lower() for item in re.split(r"[,\s]+", content) if item)
    return parser.canonicals, directives


def parse_sitemap(data: bytes) -> set[str]:
    root = ET.fromstring(data)
    urls: set[str] = set()
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] == "loc" and element.text:
            urls.add(element.text.strip())
    return urls


def normalize_site_root(site_root: str) -> str:
    return site_root.rstrip("/")


def eligible_canonical_url(url: str, site_root: str = DEFAULT_SITE_ROOT) -> bool:
    site = urllib.parse.urlsplit(normalize_site_root(site_root))
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.netloc.lower() != site.netloc.lower():
        return False
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        return False
    if parsed.path in DISALLOWED_PATHS or not parsed.path.startswith("/"):
        return False
    if urllib.parse.unquote(parsed.path) != parsed.path:
        return False
    path = PurePosixPath(parsed.path)
    if any(part in {".", ".."} for part in path.parts):
        return False
    if parsed.path == "/":
        return True
    if parsed.path.endswith("/"):
        return True
    return parsed.path.lower().endswith(".html")


def url_to_repo_path(url: str, site_root: str = DEFAULT_SITE_ROOT) -> str | None:
    if not eligible_canonical_url(url, site_root):
        return None
    path = urllib.parse.urlsplit(url).path
    if path == "/":
        return "index.html"
    if path.endswith("/"):
        return f"{path.lstrip('/')}index.html"
    return path.lstrip("/")


def detect_changed_urls(
    current_urls: Iterable[str],
    previous_urls: Iterable[str],
    current_loader: Callable[[str], str | None],
    previous_loader: Callable[[str], str | None],
    site_root: str = DEFAULT_SITE_ROOT,
) -> list[str]:
    current = set(current_urls)
    previous = set(previous_urls)
    selected: set[str] = set()
    for url in sorted(current):
        repo_path = url_to_repo_path(url, site_root)
        if not repo_path:
            continue
        current_html = current_loader(repo_path)
        if current_html is None:
            continue
        if url not in previous:
            selected.add(url)
            continue
        previous_html = previous_loader(repo_path)
        if previous_html is None:
            selected.add(url)
            continue
        if semantic_fingerprint(current_html) != semantic_fingerprint(previous_html):
            selected.add(url)
    return sorted(selected)


def git_show(sha: str, path: str) -> str | None:
    result = subprocess.run(
        ["git", "show", f"{sha}:{path}"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    if result.returncode:
        return None
    return result.stdout.decode("utf-8", errors="replace")


def sitemap_at_commit(sha: str) -> set[str]:
    source = git_show(sha, "sitemap.xml")
    if source is None:
        return set()
    return parse_sitemap(source.encode("utf-8"))


@dataclass(frozen=True)
class DeploymentContext:
    current_sha: str
    previous_sha: str | None
    deployment_id: int | None
    baseline: bool


def _github_json(path: str, query: Mapping[str, object] | None = None) -> object:
    api_url = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    repository = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN")
    if not repository or not token:
        raise RuntimeError("GITHUB_REPOSITORY and GITHUB_TOKEN are required")
    url = f"{api_url}/repos/{repository}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def _successful_pages_runs() -> list[dict[str, object]]:
    payload = _github_json(
        "/actions/runs",
        {"branch": "main", "status": "success", "per_page": 100},
    )
    assert isinstance(payload, dict)
    runs = payload.get("workflow_runs", [])
    return [
        run
        for run in runs
        if isinstance(run, dict)
        and run.get("name") == PAGES_WORKFLOW_NAME
        and run.get("path") == PAGES_WORKFLOW_PATH
        and run.get("head_branch") == "main"
        and run.get("conclusion") == "success"
    ]


def _has_successful_automatic_indexnow_run() -> bool:
    payload = _github_json(
        f"/actions/workflows/{INDEXNOW_WORKFLOW_FILE}/runs",
        {
            "branch": "main",
            "event": "deployment_status",
            "status": "success",
            "per_page": 10,
        },
    )
    assert isinstance(payload, dict)
    return bool(payload.get("workflow_runs", []))


def resolve_deployment_context(
    github_event: str,
    current_sha: str | None,
    deployment_id: int | None,
) -> DeploymentContext:
    runs = _successful_pages_runs()
    if github_event == "deployment_status":
        if not current_sha or not deployment_id:
            raise RuntimeError("deployment_status requires current SHA and deployment ID")
        baseline = not _has_successful_automatic_indexnow_run()
        previous_sha: str | None = None
        found_current = False
        for run in runs:
            sha = str(run.get("head_sha", ""))
            if sha == current_sha:
                found_current = True
                continue
            if found_current and sha and sha != current_sha:
                previous_sha = sha
                break
        if not found_current:
            raise RuntimeError(
                f"No successful Pages workflow run found for deployment SHA {current_sha}"
            )
        return DeploymentContext(current_sha, previous_sha, deployment_id, baseline)

    distinct: list[dict[str, object]] = []
    seen: set[str] = set()
    for run in runs:
        sha = str(run.get("head_sha", ""))
        if sha and sha not in seen:
            seen.add(sha)
            distinct.append(run)
    if not distinct:
        raise RuntimeError("No successful production Pages deployment was found")
    latest = distinct[0]
    previous = distinct[1] if len(distinct) > 1 else None
    return DeploymentContext(
        str(latest["head_sha"]),
        str(previous["head_sha"]) if previous else None,
        None,
        previous is None,
    )


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


@dataclass(frozen=True)
class FetchResult:
    status: int
    body: bytes
    headers: Mapping[str, str]


def fetch(url: str, timeout: int = 25) -> FetchResult:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Cache-Control": "no-cache"},
    )
    opener = urllib.request.build_opener(NoRedirectHandler())
    try:
        with opener.open(request, timeout=timeout) as response:
            headers = {
                key: ", ".join(response.headers.get_all(key, []))
                for key in set(response.headers.keys())
            }
            return FetchResult(response.status, response.read(), headers)
    except urllib.error.HTTPError as error:
        headers = {
            key: ", ".join(error.headers.get_all(key, []))
            for key in set(error.headers.keys())
        }
        return FetchResult(error.code, error.read(), headers)


def _decode_html(result: FetchResult) -> str:
    content_type = result.headers.get("Content-Type", "")
    match = re.search(r"charset=([^;\s]+)", content_type, re.IGNORECASE)
    encoding = match.group(1).strip('"\'') if match else "utf-8"
    try:
        return result.body.decode(encoding, errors="replace")
    except LookupError:
        return result.body.decode("utf-8", errors="replace")


def _header_has_noindex(headers: Mapping[str, str]) -> bool:
    values = [value for key, value in headers.items() if key.lower() == "x-robots-tag"]
    return any(
        "noindex" in value.lower()
        or "none" in {item for item in re.split(r"[,\s]+", value.lower()) if item}
        for value in values
    )


def html_exclusion_reason(
    expected_url: str, source: str, headers: Mapping[str, str] | None = None
) -> str | None:
    headers = headers or {}
    if _header_has_noindex(headers):
        return "X-Robots-Tag contains noindex"
    canonicals, directives = page_directives(source)
    if "noindex" in directives or "none" in directives:
        return "meta robots contains noindex"
    if canonicals != [expected_url]:
        return f"canonical mismatch: {canonicals or 'missing'}"
    return None


def _robots_allows(robots_text: str, url: str) -> bool:
    parser = urllib.robotparser.RobotFileParser()
    parser.parse(robots_text.splitlines())
    return all(
        parser.can_fetch(agent, url)
        for agent in ("*", "Bingbot", "YandexBot")
    )


@dataclass
class VerificationResult:
    eligible: list[str]
    excluded: dict[str, str]
    transient: list[str]


def verify_production_once(
    candidates: Sequence[str],
    current_sha: str,
    site_root: str,
    key: str,
    key_filename: str,
) -> VerificationResult:
    site_root = normalize_site_root(site_root)
    transient: list[str] = []
    excluded: dict[str, str] = {}

    sitemap_result = fetch(f"{site_root}/sitemap.xml")
    if sitemap_result.status != 200:
        return VerificationResult([], {}, [f"production sitemap returned {sitemap_result.status}"])
    try:
        production_sitemap = parse_sitemap(sitemap_result.body)
    except ET.ParseError as error:
        return VerificationResult([], {}, [f"production sitemap is invalid XML: {error}"])

    repo_sitemap = sitemap_at_commit(current_sha)
    if production_sitemap != repo_sitemap:
        transient.append("production sitemap URL set does not match the deployed commit")

    key_result = fetch(f"{site_root}/{key_filename}")
    if key_result.status != 200 or key_result.body.decode("utf-8", errors="replace").strip() != key:
        transient.append("IndexNow verification file is not current in production")

    robots_result = fetch(f"{site_root}/robots.txt")
    if robots_result.status != 200:
        transient.append(f"production robots.txt returned {robots_result.status}")
        return VerificationResult([], excluded, transient)
    robots_text = robots_result.body.decode("utf-8", errors="replace")

    eligible: list[str] = []
    for url in candidates:
        if url not in production_sitemap:
            excluded[url] = "absent from production sitemap"
            continue
        if not _robots_allows(robots_text, url):
            excluded[url] = "disallowed by production robots.txt"
            continue
        result = fetch(url)
        if result.status != 200:
            transient.append(f"{url}: direct response was {result.status}, expected 200")
            continue
        html_source = _decode_html(result)
        exclusion_reason = html_exclusion_reason(url, html_source, result.headers)
        if exclusion_reason:
            excluded[url] = exclusion_reason
            continue
        repo_path = url_to_repo_path(url, site_root)
        expected = git_show(current_sha, repo_path) if repo_path else None
        if expected is None:
            excluded[url] = "no source HTML at the deployed commit"
            continue
        if semantic_fingerprint(html_source) != semantic_fingerprint(expected):
            transient.append(f"{url}: production content does not match {current_sha}")
            continue
        eligible.append(url)

    return VerificationResult(sorted(set(eligible)), excluded, transient)


def verify_with_retry(
    candidates: Sequence[str],
    current_sha: str,
    site_root: str,
    key: str,
    key_filename: str,
    attempts: int,
    initial_delay: float,
) -> VerificationResult:
    result = VerificationResult([], {}, ["not attempted"])
    for attempt in range(1, attempts + 1):
        print(f"[{utc_now()}] production verification attempt {attempt}/{attempts}")
        try:
            result = verify_production_once(
                candidates, current_sha, site_root, key, key_filename
            )
        except (OSError, urllib.error.URLError) as error:
            result = VerificationResult([], {}, [f"network error: {error}"])
        for url, reason in result.excluded.items():
            print(f"Excluded {url}: {reason}")
        if not result.transient:
            return result
        for reason in result.transient:
            print(f"Not current yet: {reason}")
        if attempt < attempts:
            delay = min(initial_delay * (2 ** (attempt - 1)), 40.0)
            print(f"Retrying production verification in {delay:g}s")
            time.sleep(delay)
    return result


def submit_indexnow(
    urls: Sequence[str],
    site_root: str,
    key: str,
    key_filename: str,
    endpoint: str,
    deployment_sha: str,
    attempts: int = 4,
    initial_delay: float = 2.0,
) -> int:
    site_root = normalize_site_root(site_root)
    if not urls:
        print("0 URLs submitted.")
        return 0
    if len(urls) > 10_000:
        print("IndexNow batch exceeds the 10,000 URL protocol limit.", file=sys.stderr)
        return 1
    payload = {
        "host": urllib.parse.urlsplit(site_root).netloc,
        "key": key,
        "keyLocation": f"{site_root}/{key_filename}",
        "urlList": list(urls),
    }
    encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    for attempt in range(1, attempts + 1):
        print(
            f"[{utc_now()}] IndexNow attempt={attempt} deployment_sha={deployment_sha} "
            f"url_count={len(urls)} endpoint={endpoint}"
        )
        for url in urls:
            print(f"Submitting: {url}")
        request = urllib.request.Request(
            endpoint,
            data=encoded,
            method="POST",
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": USER_AGENT,
            },
        )
        status = 0
        body = ""
        retry_after: float | None = None
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                status = response.status
                body = response.read().decode("utf-8", errors="replace").strip()
        except urllib.error.HTTPError as error:
            status = error.code
            body = error.read().decode("utf-8", errors="replace").strip()
            header = error.headers.get("Retry-After")
            if header and header.isdigit():
                retry_after = min(float(header), 60.0)
        except (OSError, urllib.error.URLError) as error:
            body = str(error)

        print(f"IndexNow HTTP status={status or 'network-error'} body={body[:500] or '<empty>'}")
        if status in ACCEPTED_STATUS:
            label = "accepted" if status == 200 else "accepted; key validation may be pending"
            print(f"IndexNow notification {label}. This does not guarantee indexing.")
            return 0
        if status and status not in TRANSIENT_STATUS:
            print("Permanent IndexNow request error; not retrying.", file=sys.stderr)
            return 1
        if attempt < attempts:
            delay = retry_after or min(initial_delay * (2 ** (attempt - 1)), 30.0)
            print(f"Transient failure; retrying in {delay:g}s")
            time.sleep(delay)
    print("IndexNow submission failed after bounded retries.", file=sys.stderr)
    return 1


def _read_key(path: Path) -> tuple[str, str]:
    key = path.read_text(encoding="utf-8").strip()
    if not KEY_PATTERN.fullmatch(key):
        raise ValueError("IndexNow key must be 8-128 ASCII letters, digits, or dashes")
    if path.name != f"{key}.txt":
        raise ValueError("The root verification filename must be <key>.txt")
    return key, path.name


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--github-event",
        choices=("deployment_status", "workflow_dispatch", "local"),
        default="local",
    )
    parser.add_argument("--mode", choices=("dry-run", "submit"), default="dry-run")
    parser.add_argument("--current-sha")
    parser.add_argument("--base-sha")
    parser.add_argument("--deployment-id", type=int)
    parser.add_argument("--site-root", default=DEFAULT_SITE_ROOT)
    parser.add_argument("--key-file", required=True)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--production-attempts", type=int, default=5)
    parser.add_argument("--production-initial-delay", type=float, default=5.0)
    parser.add_argument(
        "--baseline",
        action="store_true",
        help="Verify current production and initialize without submitting URLs.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    key, key_filename = _read_key(Path(args.key_file))

    if args.github_event in {"deployment_status", "workflow_dispatch"}:
        context = resolve_deployment_context(
            args.github_event, args.current_sha, args.deployment_id
        )
    else:
        if not args.current_sha:
            raise RuntimeError("local mode requires --current-sha")
        context = DeploymentContext(
            args.current_sha,
            args.base_sha,
            args.deployment_id,
            args.baseline or not args.base_sha,
        )

    print(
        f"Deployment SHA: {context.current_sha}\n"
        f"Previous deployment SHA: {context.previous_sha or '<none>'}\n"
        f"Deployment ID: {context.deployment_id or '<local>'}\n"
        f"Mode: {args.mode}"
    )

    if context.baseline:
        verification = verify_with_retry(
            [],
            context.current_sha,
            args.site_root,
            key,
            key_filename,
            args.production_attempts,
            args.production_initial_delay,
        )
        if verification.transient:
            print("Production deployment not yet verifiably current; IndexNow submission skipped.")
            return 0
        print("No IndexNow submission — baseline initialized.")
        return 0

    assert context.previous_sha
    current_sitemap = sitemap_at_commit(context.current_sha)
    previous_sitemap = sitemap_at_commit(context.previous_sha)
    candidates = detect_changed_urls(
        current_sitemap,
        previous_sitemap,
        lambda path: git_show(context.current_sha, path),
        lambda path: git_show(context.previous_sha or "", path),
        args.site_root,
    )
    print(f"Changed canonical candidates: {len(candidates)}")
    for url in candidates:
        print(f"Candidate: {url}")
    if not candidates:
        print("0 URLs submitted.")
        return 0

    verification = verify_with_retry(
        candidates,
        context.current_sha,
        args.site_root,
        key,
        key_filename,
        args.production_attempts,
        args.production_initial_delay,
    )
    if verification.transient:
        print("Production deployment not yet verifiably current; IndexNow submission skipped.")
        return 0
    validated = verification.eligible
    if not validated:
        print("No candidate passed all production safety checks; 0 URLs submitted.")
        return 0
    if args.mode == "dry-run":
        print(f"Dry run: {len(validated)} URL(s) would be submitted:")
        for url in validated:
            print(f"Would submit: {url}")
        print("0 URLs submitted.")
        return 0

    return submit_indexnow(
        validated,
        args.site_root,
        key,
        key_filename,
        args.endpoint,
        context.current_sha,
    )


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, ET.ParseError) as error:
        print(f"IndexNow error: {error}", file=sys.stderr)
        raise SystemExit(1)
