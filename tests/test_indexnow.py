import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import indexnow  # noqa: E402


SITE = "https://www.vch-tech.com"


def page(title: str = "Page", body: str = "Body", robots: str = "index, follow") -> str:
    slug = "/" if title == "Home" else f"/{title.lower()}.html"
    return f"""<!doctype html>
<html><head><title>{title}</title>
<meta name="description" content="Description">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{SITE}{slug}">
<script type="application/ld+json">{{"@type":"WebPage","name":"{title}"}}</script>
</head><body><main><h1>{title}</h1><p>{body}</p></main></body></html>"""


class IndexNowSelectionTests(unittest.TestCase):
    def detect(self, current, previous):
        current_files = {
            indexnow.url_to_repo_path(url): html for url, html in current.items()
        }
        previous_files = {
            indexnow.url_to_repo_path(url): html for url, html in previous.items()
        }
        return indexnow.detect_changed_urls(
            current,
            previous,
            current_files.get,
            previous_files.get,
        )

    def test_new_indexable_html_is_selected(self):
        url = f"{SITE}/new.html"
        self.assertEqual(self.detect({url: page("New")}, {}), [url])

    def test_changed_indexable_html_is_selected(self):
        url = f"{SITE}/article.html"
        self.assertEqual(
            self.detect({url: page("Article", "New text")}, {url: page("Article", "Old text")}),
            [url],
        )

    def test_unchanged_html_is_not_selected(self):
        url = f"{SITE}/article.html"
        html = page("Article")
        self.assertEqual(self.detect({url: html}, {url: html}), [])

    def test_comments_and_whitespace_are_not_meaningful(self):
        url = f"{SITE}/article.html"
        old = page("Article")
        new = old.replace("<main>", "<!-- deploy note -->\n  <main>")
        self.assertEqual(self.detect({url: new}, {url: old}), [])

    def test_shared_css_change_alone_selects_nothing(self):
        url = f"{SITE}/article.html"
        html = page("Article")
        self.assertEqual(self.detect({url: html}, {url: html}), [])

    def test_non_html_service_asset_is_rejected(self):
        self.assertFalse(indexnow.eligible_canonical_url(f"{SITE}/styles.css"))

    def test_noindex_page_is_rejected(self):
        url = f"{SITE}/hidden.html"
        reason = indexnow.html_exclusion_reason(
            url, page("Hidden", robots="noindex follow")
        )
        self.assertEqual(reason, "meta robots contains noindex")

    def test_url_absent_from_current_sitemap_is_not_selected(self):
        removed = f"{SITE}/removed.html"
        self.assertEqual(self.detect({}, {removed: page("Removed")}), [])

    def test_foreign_host_is_rejected(self):
        self.assertFalse(indexnow.eligible_canonical_url("https://example.com/page.html"))

    def test_query_and_anchor_are_rejected(self):
        self.assertFalse(indexnow.eligible_canonical_url(f"{SITE}/page.html?utm_source=test"))
        self.assertFalse(indexnow.eligible_canonical_url(f"{SITE}/page.html#part"))

    def test_duplicates_collapse_to_one_submission(self):
        url = f"{SITE}/new.html"
        selected = indexnow.detect_changed_urls(
            [url, url], [], lambda _: page("New"), lambda _: None
        )
        self.assertEqual(selected, [url])

    def test_baseline_context_has_no_previous_sha(self):
        context = indexnow.DeploymentContext("abc", None, 1, True)
        self.assertTrue(context.baseline)
        self.assertIsNone(context.previous_sha)

    def test_automatic_run_uses_previous_successful_pages_deployment(self):
        runs = [
            {
                "id": 20,
                "head_sha": "current",
                "name": indexnow.PAGES_WORKFLOW_NAME,
                "path": indexnow.PAGES_WORKFLOW_PATH,
                "head_branch": "main",
                "conclusion": "success",
            },
            {
                "id": 10,
                "head_sha": "previous",
                "name": indexnow.PAGES_WORKFLOW_NAME,
                "path": indexnow.PAGES_WORKFLOW_PATH,
                "head_branch": "main",
                "conclusion": "success",
            },
        ]
        with mock.patch.object(indexnow, "_successful_pages_runs", return_value=runs), mock.patch.object(
            indexnow, "_has_successful_automatic_indexnow_run", return_value=True
        ):
            context = indexnow.resolve_deployment_context(
                "workflow_run", "current", 20
            )
        self.assertEqual(context.previous_sha, "previous")
        self.assertFalse(context.baseline)

    def test_first_automatic_run_is_baseline(self):
        runs = [
            {
                "id": 20,
                "head_sha": "current",
                "name": indexnow.PAGES_WORKFLOW_NAME,
                "path": indexnow.PAGES_WORKFLOW_PATH,
                "head_branch": "main",
                "conclusion": "success",
            }
        ]
        with mock.patch.object(indexnow, "_successful_pages_runs", return_value=runs), mock.patch.object(
            indexnow, "_has_successful_automatic_indexnow_run", return_value=False
        ):
            context = indexnow.resolve_deployment_context(
                "workflow_run", "current", 20
            )
        self.assertTrue(context.baseline)

    def test_baseline_initializes_without_submission(self):
        key = "a" * 32
        with tempfile.TemporaryDirectory() as directory:
            key_file = Path(directory) / f"{key}.txt"
            key_file.write_text(key, encoding="utf-8")
            verified = indexnow.VerificationResult([], {}, [])
            output = StringIO()
            with mock.patch.object(indexnow, "verify_with_retry", return_value=verified), mock.patch.object(
                indexnow, "submit_indexnow"
            ) as submit, redirect_stdout(output):
                result = indexnow.main(
                    [
                        "--github-event",
                        "local",
                        "--current-sha",
                        "abc",
                        "--baseline",
                        "--mode",
                        "submit",
                        "--key-file",
                        str(key_file),
                    ]
                )
            self.assertEqual(result, 0)
            submit.assert_not_called()
            self.assertIn("baseline initialized", output.getvalue())


if __name__ == "__main__":
    unittest.main()
