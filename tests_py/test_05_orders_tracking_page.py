#!/usr/bin/env python3
"""
Test 05 — Halaman Cek Pesanan Guest & Riwayat Pesanan Member (/orders)
Jalankan mandiri: python tests_py/test_05_orders_tracking_page.py
"""

from __future__ import annotations

import time
from test_helper import ADMIN_EMAIL, ADMIN_PASSWORD, BanatierTestClient, PageTestSuite


def run_suite() -> tuple[int, int]:
    suite = PageTestSuite("Halaman 05 - Cek Pesanan Guest & Riwayat Member (/orders)")
    guest_client = BanatierTestClient()
    member_client = BanatierTestClient()
    admin_client = BanatierTestClient()

    # Siapkan sesi Admin
    admin_client.api(
        "POST", "/api/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    _, ov, _ = admin_client.api("GET", "/api/admin/overview")
    po_period = ov.get("poPeriod")
    was_open = bool(po_period.get("isOpenNow")) if po_period else True
    target_prod = next((p for p in ov.get("products", []) if p.get("isActive")), None)
    orig_quota = target_prod["totalQuota"] if target_prod else 20

    if po_period and target_prod:
        admin_client.api(
            "PATCH",
            "/api/admin/po-periods",
            {
                "periodId": po_period["id"],
                "isActive": True,
                "quotas": [{"productId": target_prod["id"], "totalQuota": orig_quota + 1}],
            },
        )

    sample_order_code = ""

    try:
        # 1. Guest membuka halaman /orders -> Form Cek Pesanan tampil
        def test_guest_orders_page() -> str:
            guest_client.clear_cookies()
            status, html, _, _ = guest_client.get_page("/orders")
            assert status == 200, f"GET /orders mengembalikan {status}"
            assert "Cek Pesanan" in html, "Judul 'Cek Pesanan' tidak ditemukan untuk Guest"
            assert "Kode pesanan" in html and "Nomor WhatsApp" in html, (
                "Input Kode pesanan / Nomor WhatsApp tidak tampil untuk Guest"
            )
            return "Form lacak pesanan Guest tampil lengkap (200 OK)"

        suite.check("Guest dapat membuka halaman /orders berisi form Kode + Nomor WA", test_guest_orders_page)

        # Buat 1 pesanan atas nama Member baru untuk diuji pelacakan Guest & riwayat Member
        def test_member_create_and_history() -> str:
            nonlocal sample_order_code
            test_email = f"riwayat.member.{int(time.time())}@banatier.id"
            r_status, _, _ = member_client.api(
                "POST",
                "/api/auth/register",
                {
                    "name": "Pelanggan Member Uji",
                    "email": test_email,
                    "whatsapp": "081298765432",
                    "password": "password123",
                    "joinAsMember": True,
                },
            )
            assert r_status == 201, f"Gagal registrasi akun uji {test_email}"
            assert target_prod is not None, "Produk uji tidak tersedia"

            var_id = (
                target_prod["variants"][0]["id"]
                if target_prod.get("hasVariants") and target_prod.get("variants")
                else None
            )
            o_status, o_data, _ = member_client.api(
                "POST",
                "/api/orders",
                {
                    "recipientName": "Nadia Putri",
                    "recipientWhatsapp": "081298765432",
                    "fulfillmentMethod": "pickup",
                    "selections": [
                        {"productId": target_prod["id"], "variantId": var_id, "quantity": 1}
                    ],
                },
            )
            assert o_status == 201, f"Gagal membuat pesanan uji: {o_data}"
            sample_order_code = o_data["order"]["orderCode"]

            # Buka /orders sebagai Member -> harus tampil 'Pesanan Saya' beserta kode pesanan tadi
            p_status, html, _, _ = member_client.get_page("/orders")
            assert p_status == 200, f"GET /orders Member gagal ({p_status})"
            assert "Pesanan Saya" in html, "Judul 'Pesanan Saya' tidak muncul untuk Member"
            assert sample_order_code in html, (
                f"Kode pesanan baru {sample_order_code} belum muncul di riwayat /orders Member"
            )
            return f"Pesanan {sample_order_code} otomatis muncul di riwayat Member"

        suite.check(
            "Member login melihat daftar 'Pesanan Saya' otomatis di halaman /orders",
            test_member_create_and_history,
        )

        # 3. Guest melacak dengan nomor WA yang salah wajib ditolak (404)
        def test_track_wrong_wa_rejected() -> str:
            assert sample_order_code, "Belum ada kode pesanan uji"
            status, _, _ = guest_client.api(
                "GET",
                f"/api/orders/track?code={sample_order_code}&whatsapp=089900001111",
            )
            assert status == 404, f"Nomor WA salah seharusnya ditolak 404, dapat {status}"
            return "Nomor WA tidak cocok ditolak aman (404)"

        suite.check("Pelacakan pesanan dengan nomor WhatsApp salah ditolak (404)", test_track_wrong_wa_rejected)

        # 4. Guest melacak dengan Kode + Nomor WA benar (termasuk format +62) berhasil (200)
        def test_track_valid_wa() -> str:
            assert sample_order_code, "Belum ada kode pesanan uji"
            status, data, _ = guest_client.api(
                "GET",
                f"/api/orders/track?code={sample_order_code}&whatsapp=%2B6281298765432",
            )
            assert status == 200, f"Lacak pesanan valid gagal ({status}): {data}"
            assert data["order"]["orderCode"] == sample_order_code
            return f"Pesanan {sample_order_code} berhasil dilacak dengan normalisasi +62"

        suite.check(
            "Guest berhasil melacak pesanan dengan Kode + Nomor WA yang cocok (200 OK)",
            test_track_valid_wa,
        )

    finally:
        if sample_order_code:
            admin_client.api(
                "PATCH",
                f"/api/admin/orders/{sample_order_code}",
                {"status": "dibatalkan"},
            )
        if po_period and target_prod:
            admin_client.api(
                "PATCH",
                "/api/admin/po-periods",
                {
                    "periodId": po_period["id"],
                    "isActive": was_open,
                    "quotas": [{"productId": target_prod["id"], "totalQuota": orig_quota}],
                },
            )

    return suite.summary()


if __name__ == "__main__":
    _, failed_count = run_suite()
    raise SystemExit(0 if failed_count == 0 else 1)
