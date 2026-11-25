#!/usr/bin/env python3
"""
Test 04 — Halaman Checkout, QRIS 10 Menit, Simulasi Demo Nonaktif & Konfirmasi Invoice (/checkout)
Jalankan mandiri: python tests_py/test_04_checkout_qris_invoice_page.py
"""

from __future__ import annotations

from datetime import datetime
from test_helper import BanatierTestClient, PageTestSuite


def _parse_iso(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def run_suite() -> tuple[int, int]:
    suite = PageTestSuite("Halaman 04 - Checkout, QRIS 10 Menit & Halaman Invoice (/checkout)")
    client = BanatierTestClient()
    admin_client = BanatierTestClient()

    # Login admin di sesi terpisah hanya untuk menjaga PO aktif selama tes & merapikan kuota
    admin_login_code, _, _ = admin_client.api(
        "POST",
        "/api/auth/login",
        {"email": "admin@banatier.id", "password": "admin123"},
    )
    overview_code, overview, _ = admin_client.api("GET", "/api/admin/overview")
    was_po_open = True
    period_id = None
    target_product = None
    original_quota = None

    if admin_login_code == 200 and overview_code == 200:
        po_period = overview.get("poPeriod")
        if po_period:
            period_id = po_period["id"]
            was_po_open = bool(po_period.get("isOpenNow"))
            if not was_po_open:
                admin_client.api(
                    "PATCH", "/api/admin/po-periods", {"periodId": period_id, "isActive": True}
                )

        # Pilih Banana Split (wajib Thermal Bag) atau produk pertama yang aktif
        for prod in overview.get("products", []):
            if prod.get("isActive"):
                if prod.get("requiresThermalBag") or target_product is None:
                    target_product = prod
                    if prod.get("requiresThermalBag"):
                        break

        if target_product and period_id:
            original_quota = target_product["totalQuota"]
            # Tambah +1 kuota sementara supaya tes checkout tidak mengurangi jatah stok toko
            admin_client.api(
                "PATCH",
                "/api/admin/po-periods",
                {
                    "periodId": period_id,
                    "quotas": [
                        {"productId": target_product["id"], "totalQuota": original_quota + 2}
                    ],
                },
            )

    created_order_code = ""

    try:
        # 1. Halaman Step 1 Checkout (/checkout)
        def test_checkout_page_step1() -> str:
            status, html, _, _ = client.get_page("/checkout")
            assert status == 200, f"GET /checkout mengembalikan status {status}"
            assert "Data &amp; jadwal" in html or "Data & jadwal" in html, (
                "Stepper 'Data & jadwal' tidak ditemukan di /checkout"
            )
            return "Stepper 3 langkah tampil (200 OK)"

        suite.check("Halaman /checkout (Step 1) dapat dibuka normal (200 OK)", test_checkout_page_step1)

        # 2. Buat pesanan baru & cek QRIS Ayyas + batas waktu 10 menit
        def test_create_order_qris_10min() -> str:
            nonlocal created_order_code
            assert target_product is not None, "Tidak ada produk aktif untuk diuji"
            variant_id = (
                target_product["variants"][0]["id"]
                if target_product.get("hasVariants") and target_product.get("variants")
                else None
            )

            status, data, _ = client.api(
                "POST",
                "/api/orders",
                {
                    "recipientName": "Penguji Checkout Python",
                    "recipientWhatsapp": "081255556666",
                    "fulfillmentMethod": "delivery",
                    "deliveryAddress": "Jl. Uji Coba No. 10, Bandung",
                    "notes": "Pengujian otomatis Python",
                    "selections": [
                        {
                            "productId": target_product["id"],
                            "variantId": variant_id,
                            "addonIds": [],
                            "quantity": 1,
                        }
                    ],
                },
            )
            assert status == 201, f"POST /api/orders gagal ({status}): {data}"
            order = data["order"]
            created_order_code = order["orderCode"]

            assert order["status"] == "menunggu_pembayaran", (
                f"Status awal salah: {order['status']}"
            )
            assert data.get("qrisImageUrl") == "/qris-ayyas.jpg", (
                f"Gambar QRIS bukan /qris-ayyas.jpg: {data.get('qrisImageUrl')}"
            )

            diff_minutes = round(
                (_parse_iso(order["qrisExpiresAt"]) - _parse_iso(order["createdAt"])).total_seconds()
                / 60
            )
            assert diff_minutes == 10, f"Batas waktu QRIS bukan 10 menit, melainkan {diff_minutes} menit"

            if target_product.get("requiresThermalBag"):
                assert order["thermalBagCount"] >= 1, "Thermal Bag otomatis tidak terhitung"

            return f"Order {created_order_code}, QRIS=/qris-ayyas.jpg, Timeout={diff_minutes} menit"

        suite.check(
            "Buat pesanan menghasilkan QRIS Ayyas, Thermal Bag & timer tepat 10 menit",
            test_create_order_qris_10min,
        )

        # 3. Halaman Step 2 Pembayaran tidak lagi menampilkan kotak Simulasi Demo
        def test_step2_no_demo_box() -> str:
            assert created_order_code, "Order belum terbentuk"
            status, html, _, _ = client.get_page(f"/checkout?order={created_order_code}")
            assert status == 200, f"GET /checkout?order=... gagal ({status})"
            assert "Pindai Kode QRIS" in html, "Judul 'Pindai Kode QRIS' tidak tampil"
            assert "Simulasi Payment Gateway (Mode Demo)" not in html, (
                "Kotak Simulasi Demo masih muncul di halaman pembayaran!"
            )
            assert "Saya Sudah Bayar" in html, "Tombol konfirmasi 'Saya Sudah Bayar' tidak tampil"
            assert "6281219048439" in html, "Nomor WA Admin 6281219048439 tidak ditemukan"
            return "Kotak Demo nonaktif & tombol konfirmasi bayar ke WA Admin aktif"

        suite.check(
            "Halaman QRIS (Step 2) bersih tanpa Simulasi Demo & memuat WA Admin 081219048439",
            test_step2_no_demo_box,
        )

        # 4. Endpoint simulasi demo lama wajib diblokir (403)
        def test_demo_endpoint_blocked() -> str:
            assert created_order_code, "Order belum terbentuk"
            status, _, _ = client.api(
                "POST",
                f"/api/orders/{created_order_code}/simulate-payment",
                {"action": "settlement"},
            )
            assert status == 403, f"Endpoint simulate-payment seharusnya 403, dapat {status}"
            return "Diblokir dengan 403 Forbidden"

        suite.check("Endpoint /simulate-payment lama terkunci (403 Forbidden)", test_demo_endpoint_blocked)

        # 5. Konfirmasi Sudah Bayar -> Status langsung 'diproses' & Halaman Invoice (Step 3) tampil
        def test_confirm_payment_and_invoice_page() -> str:
            assert created_order_code, "Order belum terbentuk"
            c_status, c_data, _ = client.api(
                "POST", f"/api/orders/{created_order_code}/confirm-payment"
            )
            assert c_status == 200, f"Konfirmasi bayar gagal ({c_status}): {c_data}"
            assert c_data["order"]["status"] == "diproses", (
                f"Status setelah bayar bukan 'diproses': {c_data['order']['status']}"
            )
            assert c_data["order"].get("paidAt"), "Waktu lunas (paidAt) belum terisi"

            p_status, html, _, _ = client.get_page(f"/checkout?order={created_order_code}")
            assert p_status == 200, f"Gagal membuka halaman invoice ({p_status})"
            assert "Invoice" in html and "LUNAS" in html, (
                "Halaman Step 3 Invoice LUNAS belum tampil setelah konfirmasi pembayaran"
            )
            assert "Kirim Invoice ke WA Admin" in html, (
                "Tombol 'Kirim Invoice ke WA Admin' tidak ditemukan di halaman Invoice"
            )
            return f"Order {created_order_code} langsung berstatus 'diproses' & halaman Invoice LUNAS tampil"

        suite.check(
            "Konfirmasi Pembayaran langsung mengubah status ke 'diproses' & menampilkan halaman Invoice",
            test_confirm_payment_and_invoice_page,
        )

    finally:
        # Kembalikan pesanan uji ke dibatalkan & kembalikan kuota + status PO semula agar data bersih
        if created_order_code and admin_login_code == 200:
            admin_client.api(
                "PATCH",
                f"/api/admin/orders/{created_order_code}",
                {"status": "dibatalkan"},
            )
        if target_product and period_id is not None and original_quota is not None:
            admin_client.api(
                "PATCH",
                "/api/admin/po-periods",
                {
                    "periodId": period_id,
                    "isActive": was_po_open,
                    "quotas": [
                        {"productId": target_product["id"], "totalQuota": original_quota}
                    ],
                },
            )

    return suite.summary()


if __name__ == "__main__":
    _, failed_count = run_suite()
    raise SystemExit(0 if failed_count == 0 else 1)
