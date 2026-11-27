#!/usr/bin/env python3
"""
Test 01 — Halaman Utama / Katalog Menu Pelanggan (GET /)
Jalankan mandiri: python tests_py/test_01_landing_page.py
"""

from __future__ import annotations

from test_helper import BanatierTestClient, PageTestSuite


def run_suite() -> tuple[int, int]:
    suite = PageTestSuite("Halaman 01 - Landing Page & Katalog Menu (/)")
    client = BanatierTestClient()

    # 1. Health Check Backend
    def test_backend_health() -> str:
        status, data, _ = client.api("GET", "/api/health", via_frontend_proxy=False)
        assert status == 200, f"Status /api/health bukan 200, melainkan {status}"
        assert data.get("status") == "healthy", f"Respons health tidak sehat: {data}"
        return f"Engine={data.get('dbEngine')}, Instance={data.get('serverInstanceId')}"

    suite.check("Endpoint /api/health Backend aktif & sehat", test_backend_health)

    # 2. Render HTML Landing Page (/)
    def test_landing_html() -> str:
        status, html, _, _ = client.get_page("/")
        assert status == 200, f"GET / mengembalikan status {status}"
        assert "Server Backend Belum Aktif" not in html, (
            "Halaman menampilkan 'Server Backend Belum Aktif'"
        )
        assert "Banatier" in html or "banatier" in html, "Nama brand Banatier tidak ditemukan"
        assert "Cara Pesan" in html, "Seksi 'Cara Pesan' tidak ditemukan di halaman utama"
        return f"HTML ter-render ({len(html)} karakter)"

    suite.check("Halaman Utama (GET /) tampil utuh dengan seksi Katalog & Cara Pesan", test_landing_html)

    # 3. API Katalog Menu & Pengaturan
    def test_catalog_api() -> str:
        status, data, _ = client.api("GET", "/api/catalog")
        assert status == 200, f"GET /api/catalog mengembalikan status {status}"
        products = data.get("products", [])
        assert len(products) >= 5, f"Jumlah produk aktif kurang dari 5 (ditemukan {len(products)})"
        settings = data.get("settings", {})
        assert settings.get("paymentTimeoutMinutes") == 10, (
            f"Timeout pembayaran seharusnya 10 menit, ditemukan {settings.get('paymentTimeoutMinutes')}"
        )
        assert settings.get("adminWhatsapp") == "081219048439", (
            f"Nomor WA Admin seharusnya 081219048439, ditemukan {settings.get('adminWhatsapp')}"
        )
        return f"{len(products)} menu aktif, WA Admin={settings.get('adminWhatsapp')}, Timeout=10m"

    suite.check("Data Katalog (/api/catalog) memuat produk, WA Admin & timeout 10 menit", test_catalog_api)

    # 4. Verifikasi Foto Asli Katalog & Gambar QRIS
    def test_static_images() -> str:
        required_assets = [
            "/hero-banatier-v2.jpg",
            "/menu/bolen.jpg",
            "/menu/banofee.jpg",
            "/menu/split.jpg",
            "/menu/bolu.jpg",
            "/menu/strudel.jpg",
            "/qris-ayyas.jpg",
        ]
        for asset in required_assets:
            code, size, ctype = client.get_asset(asset)
            assert code == 200, f"File gambar {asset} gagal dimuat (HTTP {code})"
            assert size > 5000, f"Ukuran file gambar {asset} terlalu kecil ({size} bytes)"
            assert "image/" in ctype.lower(), f"Content-Type {asset} bukan gambar ({ctype})"
        return f"{len(required_assets)} file gambar katalog & QRIS valid (200 OK)"

    suite.check("Semua foto makanan katalog & gambar QRIS Ayyas tersedia (200 OK)", test_static_images)

    # 5. Aturan Copywriting: Tidak boleh ada kata 'batch' di Landing Page
    def test_no_batch_wording() -> str:
        status, html, _, _ = client.get_page("/")
        assert status == 200, f"GET / gagal ({status})"
        # Cek teks tampak (abaikan script internal Next.js bila ada)
        visible_check = "Batch Pre-Order" not in html and "Batch PO" not in html
        assert visible_check, "Ditemukan istilah 'Batch' pada teks tampilan Landing Page"
        return "Bebas dari istilah 'Batch'"

    suite.check("Validasi teks halaman utama bebas istilah 'Batch'", test_no_batch_wording)

    return suite.summary()


if __name__ == "__main__":
    _, failed_count = run_suite()
    raise SystemExit(0 if failed_count == 0 else 1)
