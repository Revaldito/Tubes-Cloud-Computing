#!/usr/bin/env python3
"""
Test 02 — Halaman Login, Registrasi & Redirect Sesuai Role (/login)
Jalankan mandiri: python tests_py/test_02_login_register_page.py
"""

from __future__ import annotations

import time
from test_helper import BanatierTestClient, PageTestSuite


def run_suite() -> tuple[int, int]:
    suite = PageTestSuite("Halaman 02 - Login, Registrasi & Redirect Role (/login)")
    client = BanatierTestClient()

    # 1. Guest membuka halaman /login
    def test_guest_open_login() -> str:
        client.clear_cookies()
        status, html, _, _ = client.get_page("/login", follow_redirects=False)
        assert status == 200, f"Guest membuka /login seharusnya 200, dapat {status}"
        assert "Masuk" in html, "Teks form 'Masuk' tidak ditemukan di /login"
        return "Form login tampil normal (200 OK)"

    suite.check("Guest dapat membuka halaman /login (200 OK)", test_guest_open_login)

    # 2. Login dengan password salah wajib ditolak (401)
    def test_wrong_password() -> str:
        status, data, _ = client.api(
            "POST",
            "/api/auth/login",
            {"email": "admin@banatier.id", "password": "password_salah_123"},
        )
        assert status == 401, f"Login salah seharusnya 401, dapat {status}"
        assert "error" in data, "Pesan error tidak dikembalikan saat gagal login"
        return f"Ditolak aman dengan 401 ({data.get('error')})"

    suite.check("Login dengan password salah ditolak (401 Unauthorized)", test_wrong_password)

    # 3. Registrasi pengguna baru berhasil & redirect /login -> /
    unique_email = f"uji.otomatis.{int(time.time())}@banatier.id"

    def test_register_and_member_redirect() -> str:
        client.clear_cookies()
        status, data, _ = client.api(
            "POST",
            "/api/auth/register",
            {
                "name": "Penguji Otomatis Python",
                "email": unique_email,
                "whatsapp": "081299887766",
                "password": "password123",
                "joinAsMember": True,
            },
        )
        assert status == 201, f"Registrasi seharusnya 201, dapat {status}: {data}"
        assert data.get("user", {}).get("role") == "buyer", "Role akun baru bukan buyer"

        # Saat sudah login sebagai member/buyer, buka /login harus redirect ke /
        p_status, p_html, p_headers, _ = client.get_page("/login", follow_redirects=False)
        loc = client.detect_redirect(p_status, p_html, p_headers)
        assert loc is not None and (loc == "/" or loc.endswith(":3000/")), (
            f"Redirect member dari /login tidak menuju '/': status={p_status}, target={loc}"
        )
        return f"Akun {unique_email} terdaftar & /login redirect ke '{loc}'"

    suite.check(
        "Registrasi Member baru berhasil & akses /login otomatis dialihkan ke /",
        test_register_and_member_redirect,
    )

    # 4. Logout menghapus sesi pengguna
    def test_logout() -> str:
        status, _, _ = client.api("POST", "/api/auth/logout")
        assert status == 200, f"Logout gagal dengan status {status}"
        me_status, me_data, _ = client.api("GET", "/api/auth/me")
        assert me_status == 200 and me_data.get("user") is None, (
            f"Sesi belum terhapus setelah logout: {me_data}"
        )
        return "Sesi bersih (user=None)"

    suite.check("Logout membersihkan cookie sesi pengguna", test_logout)

    # 5. Login sebagai Admin & akses /login otomatis dialihkan ke /admin
    def test_admin_login_redirect() -> str:
        status, data, _ = client.api(
            "POST",
            "/api/auth/login",
            {"email": "admin@banatier.id", "password": "admin123"},
        )
        assert status == 200, f"Login Admin gagal ({status}): {data}"
        assert data.get("user", {}).get("role") == "admin", "Role bukan admin"

        p_status, p_html, p_headers, _ = client.get_page("/login", follow_redirects=False)
        loc = client.detect_redirect(p_status, p_html, p_headers)
        assert loc is not None and "/admin" in loc, (
            f"Admin membuka /login seharusnya diarahkan ke /admin, dapat status={p_status}, target={loc}"
        )
        client.api("POST", "/api/auth/logout")
        return f"Admin otomatis redirect ke '{loc}'"

    suite.check("Login Admin berhasil & akses /login otomatis dialihkan ke /admin", test_admin_login_redirect)

    return suite.summary()


if __name__ == "__main__":
    _, failed_count = run_suite()
    raise SystemExit(0 if failed_count == 0 else 1)
