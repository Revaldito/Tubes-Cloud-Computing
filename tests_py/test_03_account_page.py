#!/usr/bin/env python3
"""
Test 03 — Halaman Akun & Aktivasi Membership (/account)
Jalankan mandiri: python tests_py/test_03_account_page.py
"""

from __future__ import annotations

import time
from test_helper import ADMIN_EMAIL, ADMIN_PASSWORD, BanatierTestClient, PageTestSuite


def run_suite() -> tuple[int, int]:
    suite = PageTestSuite("Halaman 03 - Profil Akun & Membership (/account)")
    client = BanatierTestClient()

    # 1. Guest tanpa login mengakses /account harus redirect ke /login
    def test_guest_redirect_to_login() -> str:
        client.clear_cookies()
        status, html, headers, _ = client.get_page("/account", follow_redirects=False)
        loc = client.detect_redirect(status, html, headers)
        assert loc is not None and "/login" in loc, (
            f"Guest membuka /account seharusnya redirect ke /login, dapat status={status}, target={loc}"
        )
        return f"Guest diarahkan ke '{loc}'"

    suite.check("Guest tanpa login yang membuka /account diarahkan ke /login", test_guest_redirect_to_login)

    # 2. Admin mengakses /account harus redirect ke /admin
    def test_admin_redirect_to_admin() -> str:
        l_status, _, _ = client.api(
            "POST",
            "/api/auth/login",
            {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert l_status == 200, "Gagal login admin"
        status, html, headers, _ = client.get_page("/account", follow_redirects=False)
        loc = client.detect_redirect(status, html, headers)
        assert loc is not None and "/admin" in loc, (
            f"Admin membuka /account seharusnya redirect ke /admin, dapat status={status}, target={loc}"
        )
        client.clear_cookies()
        return f"Admin diarahkan ke '{loc}'"

    suite.check("Admin yang membuka /account otomatis diarahkan ke /admin", test_admin_redirect_to_admin)

    # 3. Registrasi pembeli Non-Member lalu buka halaman /account (200 OK)
    non_member_email = f"nonmember.{int(time.time())}@banatier.id"

    def test_buyer_open_account() -> str:
        r_status, r_data, _ = client.api(
            "POST",
            "/api/auth/register",
            {
                "name": "Pembeli Reguler Uji",
                "email": non_member_email,
                "whatsapp": "081377778888",
                "password": "password123",
                "joinAsMember": False,
            },
        )
        assert r_status == 201, f"Gagal registrasi non-member: {r_data}"
        assert r_data["user"]["isMember"] is False, "Seharusnya awal bukan member"

        p_status, html, _, _ = client.get_page("/account", follow_redirects=False)
        assert p_status == 200, f"Pembeli login membuka /account gagal ({p_status})"
        assert "Pembeli Reguler Uji" in html, "Nama pengguna tidak tampil di halaman /account"
        return "Halaman /account tampil 200 OK beserta profil pengguna"

    suite.check("Pembeli terautentikasi berhasil membuka halaman /account (200 OK)", test_buyer_open_account)

    # 4. Aktivasi Membership melalui POST /api/auth/me
    def test_activate_membership() -> str:
        status, data, _ = client.api("POST", "/api/auth/me")
        assert status == 200, f"Aktivasi member gagal ({status}): {data}"
        user_obj = data.get("user", {})
        assert user_obj.get("isMember") is True, f"isMember belum True: {user_obj}"
        assert user_obj.get("memberTierSlug") == "member", (
            f"Tier bukan 'member': {user_obj.get('memberTierSlug')}"
        )
        client.api("POST", "/api/auth/logout")
        return f"Membership aktif (tier={user_obj.get('memberTierSlug')})"

    suite.check("Aktivasi Membership mengubah status menjadi Banatier Member", test_activate_membership)

    return suite.summary()


if __name__ == "__main__":
    _, failed_count = run_suite()
    raise SystemExit(0 if failed_count == 0 else 1)
