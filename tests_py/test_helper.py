#!/usr/bin/env python3
"""
Helper pengujian HTTP & HTML untuk seluruh halaman aplikasi Banatier.
Menggunakan 100% Python Standard Library (tanpa perlu pip install tambahan).
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Tuple

# Pastikan terminal Windows dapat mencetak karakter UTF-8 dengan aman
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

FRONTEND_URL = os.environ.get("BANATIER_FRONTEND_URL", "http://localhost:3000").rstrip("/")
BACKEND_URL = os.environ.get("BANATIER_BACKEND_URL", "http://127.0.0.1:4000").rstrip("/")


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Mencegah urllib mengikuti redirect otomatis saat kita ingin mengecek kode 302/307."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class BanatierTestClient:
    """HTTP Client ringan dengan dukungan Cookie Session otomatis (banatier_session)."""

    def __init__(self, frontend_url: str = FRONTEND_URL, backend_url: str = BACKEND_URL) -> None:
        self.frontend_url = frontend_url
        self.backend_url = backend_url
        self.cookies = http.cookiejar.CookieJar()
        self._opener_follow = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookies)
        )
        self._opener_no_redirect = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookies),
            NoRedirectHandler(),
        )

    def clear_cookies(self) -> None:
        self.cookies.clear()

    @staticmethod
    def detect_redirect(status: int, html: str, headers: Dict[str, str]) -> Optional[str]:
        """Mendeteksi target redirect baik dari HTTP 3xx maupun Next.js App Router Suspense stream."""
        if status in (301, 302, 303, 307, 308):
            return headers.get("location", "")
        match = re.search(r"NEXT_REDIRECT;(?:replace|push);([^;\"\\]+)", html)
        if match:
            return match.group(1)
        match_meta = re.search(r'url=([^"\'>\s]+)', html)
        if "http-equiv=\"refresh\"" in html and match_meta:
            return match_meta.group(1)
        return None

    def get_page(
        self, path: str, follow_redirects: bool = True, timeout: float = 12.0
    ) -> Tuple[int, str, Dict[str, str], str]:
        """Mengambil halaman dari Next.js Frontend (port 3000)."""
        url = f"{self.frontend_url}{path}" if path.startswith("/") else path
        req = urllib.request.Request(
            url,
            method="GET",
            headers={"Accept": "text/html,application/xhtml+xml,*/*"},
        )
        opener = self._opener_follow if follow_redirects else self._opener_no_redirect
        try:
            with opener.open(req, timeout=timeout) as resp:
                raw = resp.read()
                text = raw.decode("utf-8", errors="replace")
                headers = {k.lower(): v for k, v in resp.headers.items()}
                return resp.status, text, headers, resp.geturl()
        except urllib.error.HTTPError as err:
            raw = err.read() if err.fp else b""
            text = raw.decode("utf-8", errors="replace")
            headers = {k.lower(): v for k, v in err.headers.items()} if err.headers else {}
            return err.code, text, headers, err.geturl() or url

    def get_asset(self, path: str, timeout: float = 10.0) -> Tuple[int, int, str]:
        """Mengecek file statis seperti gambar menu atau QRIS di Frontend."""
        url = f"{self.frontend_url}{path}" if path.startswith("/") else path
        req = urllib.request.Request(url, method="GET")
        try:
            with self._opener_follow.open(req, timeout=timeout) as resp:
                data = resp.read()
                ctype = resp.headers.get("Content-Type", "")
                return resp.status, len(data), ctype
        except urllib.error.HTTPError as err:
            return err.code, 0, ""

    def api(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        via_frontend_proxy: bool = True,
        timeout: float = 12.0,
    ) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
        """Memanggil REST API (default lewat proxy Next.js /api/* agar cookie domain sama)."""
        base = self.frontend_url if via_frontend_proxy else self.backend_url
        url = f"{base}{path}" if path.startswith("/") else path
        body_bytes = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            body_bytes = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(
            url, data=body_bytes, method=method.upper(), headers=headers
        )
        try:
            with self._opener_follow.open(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace").strip()
                parsed = json.loads(raw) if raw else {}
                resp_headers = {k.lower(): v for k, v in resp.headers.items()}
                return resp.status, parsed, resp_headers
        except urllib.error.HTTPError as err:
            raw = err.read().decode("utf-8", errors="replace").strip() if err.fp else ""
            try:
                parsed = json.loads(raw) if raw else {}
            except Exception:
                parsed = {"raw": raw}
            resp_headers = {k.lower(): v for k, v in err.headers.items()} if err.headers else {}
            return err.code, parsed, resp_headers


class PageTestSuite:
    """Pencatat dan penampil hasil pengujian [PASS] & [FAIL] untuk satu halaman."""

    def __init__(self, page_title: str) -> None:
        self.page_title = page_title
        self.results: List[Dict[str, Any]] = []
        self.started_at = time.time()
        print("\n" + "=" * 72)
        print(f"PENGUJIAN: {self.page_title}")
        print(f"Target Frontend: {FRONTEND_URL} | Backend: {BACKEND_URL}")
        print("=" * 72)

    def check(self, name: str, fn: Callable[[], Optional[str]]) -> bool:
        """Menjalankan 1 skenario uji dan mencetak [PASS] atau [FAIL]."""
        t0 = time.time()
        try:
            detail = fn()
            elapsed_ms = int((time.time() - t0) * 1000)
            suffix = f" -> {detail}" if detail else ""
            print(f"  [PASS] {name} ({elapsed_ms} ms){suffix}")
            self.results.append(
                {"name": name, "passed": True, "detail": detail or "", "ms": elapsed_ms}
            )
            return True
        except urllib.error.URLError as exc:
            elapsed_ms = int((time.time() - t0) * 1000)
            reason = (
                f"Server belum berjalan / tidak dapat dihubungi ({exc.reason}). "
                f"Pastikan 'npm run dev' sedang aktif."
            )
            print(f"  [FAIL] {name} ({elapsed_ms} ms)")
            print(f"         Alasan: {reason}")
            self.results.append(
                {"name": name, "passed": False, "detail": reason, "ms": elapsed_ms}
            )
            return False
        except Exception as exc:
            elapsed_ms = int((time.time() - t0) * 1000)
            reason = str(exc) or exc.__class__.__name__
            print(f"  [FAIL] {name} ({elapsed_ms} ms)")
            print(f"         Alasan: {reason}")
            self.results.append(
                {"name": name, "passed": False, "detail": reason, "ms": elapsed_ms}
            )
            return False

    def summary(self) -> Tuple[int, int]:
        """Mencetak ringkasan jumlah PASS dan FAIL lalu mengembalikan (passed, failed)."""
        total = len(self.results)
        passed = sum(1 for r in self.results if r["passed"])
        failed = total - passed
        total_ms = int((time.time() - self.started_at) * 1000)

        print("-" * 72)
        status_label = "LULUS SEMUA (PASS)" if failed == 0 and total > 0 else "ADA YANG GAGAL (FAIL)"
        print(
            f"RINGKASAN [{self.page_title}]: "
            f"Total={total} | PASS={passed} | FAIL={failed} | Durasi={total_ms} ms | {status_label}"
        )
        print("=" * 72)
        return passed, failed

    def exit_with_code(self) -> None:
        _, failed = self.summary()
        sys.exit(0 if failed == 0 else 1)
