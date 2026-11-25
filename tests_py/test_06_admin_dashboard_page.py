#!/usr/bin/env python3
"""
Test 06 — Halaman Dashboard Admin, CRUD Menu, Ubah Status Pesanan & Toggle Status PO (/admin)
Jalankan mandiri: python tests_py/test_06_admin_dashboard_page.py
"""

from __future__ import annotations

from test_helper import BanatierTestClient, PageTestSuite


def run_suite() -> tuple[int, int]:
    suite = PageTestSuite("Halaman 06 - Dashboard Admin, CRUD Menu, Status Order & PO (/admin)")
    guest_client = BanatierTestClient()
    admin_client = BanatierTestClient()

    # 1. Proteksi keamanan halaman /admin terhadap akses tanpa izin
    def test_admin_protection() -> str:
        guest_client.clear_cookies()
        api_code, _, _ = guest_client.api("GET", "/api/admin/overview")
        assert api_code == 403, f"Guest akses /api/admin/overview seharusnya 403, dapat {api_code}"

        page_code, page_html, headers, _ = guest_client.get_page("/admin", follow_redirects=False)
        loc = guest_client.detect_redirect(page_code, page_html, headers)
        assert loc is not None and "/login" in loc, (
            f"Guest akses /admin seharusnya di-redirect ke /login, dapat status={page_code}, target={loc}"
        )
        return f"API terkunci (403) & halaman /admin redirect ke '{loc}'"

    suite.check("Proteksi keamanan /admin menolak pengguna non-admin", test_admin_protection)

    # 2. Login Admin & buka seluruh tab halaman /admin (orders, catalog, users)
    def test_admin_tabs_render() -> str:
        l_code, _, _ = admin_client.api(
            "POST", "/api/auth/login", {"email": "admin@banatier.id", "password": "admin123"}
        )
        assert l_code == 200, "Gagal login menggunakan akun admin@banatier.id"

        for tab_query in ["/admin", "/admin?tab=catalog", "/admin?tab=users"]:
            p_code, html, _, _ = admin_client.get_page(tab_query, follow_redirects=False)
            assert p_code == 200, f"Gagal membuka {tab_query} (HTTP {p_code})"
            assert "Dashboard Admin" in html, f"Judul Dashboard Admin tidak tampil pada {tab_query}"

        # Pastikan urutan tab Kelola Menu: Aturan Thermal Bag di atas Katalog Menu Kue Pisang
        _, cat_html, _, _ = admin_client.get_page("/admin?tab=catalog", follow_redirects=False)
        pos_rules = cat_html.find("Aturan Thermal Bag")
        pos_catalog = cat_html.find("Katalog Menu Kue Pisang")
        assert pos_rules != -1 and pos_catalog != -1 and pos_rules < pos_catalog, (
            "Posisi 'Aturan Thermal Bag' belum berada di atas 'Katalog Menu Kue Pisang'"
        )
        return "Tab Pesanan Masuk, Kelola Menu (Aturan di atas Katalog) & Daftar Pengguna 200 OK"

    suite.check("Semua tab halaman /admin tampil rapi & urutan seksi sesuai", test_admin_tabs_render)

    # 3. Pengujian CRUD Menu (Tambah -> Edit -> Hapus)
    def test_admin_crud_menu() -> str:
        # CREATE
        c_code, c_data, _ = admin_client.api(
            "POST",
            "/api/admin/catalog",
            {
                "name": "Menu Uji Python Sementara",
                "shortDescription": "Menu sementara hasil pengujian otomatis Python.",
                "basePrice": 27000,
                "initialQuota": 10,
                "illustrationKey": "bolen",
                "requiresThermalBag": False,
                "variants": [{"name": "Original", "priceDelta": 0}],
                "addons": [{"name": "Keju Ekstra", "price": 3000}],
            },
        )
        assert c_code == 201, f"Tambah menu gagal ({c_code}): {c_data}"
        prod_id = c_data["productId"]

        try:
            # UPDATE
            u_code, u_data, _ = admin_client.api(
                "PATCH",
                "/api/admin/catalog",
                {
                    "kind": "product",
                    "id": prod_id,
                    "name": "Menu Uji Python Diedit",
                    "shortDescription": "Deskripsi telah diperbarui.",
                    "basePrice": 29000,
                    "isActive": True,
                    "requiresThermalBag": False,
                    "illustrationKey": "strudel",
                    "totalQuota": 12,
                    "variants": [{"name": "Original", "priceDelta": 0}],
                    "addons": [],
                },
            )
            assert u_code == 200, f"Edit menu gagal ({u_code}): {u_data}"
        finally:
            # DELETE
            d_code, d_data, _ = admin_client.api(
                "DELETE", f"/api/admin/catalog?id={prod_id}"
            )
            assert d_code == 200, f"Hapus menu gagal ({d_code}): {d_data}"

        return f"Create (id={prod_id}) -> Update -> Delete sukses bersih"

    suite.check("CRUD Menu Admin (Tambah, Ubah, Hapus) berfungsi penuh", test_admin_crud_menu)

    # 4. Pengujian Ubah Status Pesanan Masuk (PATCH /api/admin/orders/:code)
    def test_admin_change_order_status() -> str:
        _, ov, _ = admin_client.api("GET", "/api/admin/overview")
        orders = ov.get("orders", [])

        temp_created = False
        po_period = ov.get("poPeriod")
        was_open = bool(po_period.get("isOpenNow")) if po_period else True
        prod = next((p for p in ov.get("products", []) if p.get("isActive")), None)
        orig_quota = prod["totalQuota"] if prod else 20

        if not orders and po_period and prod:
            admin_client.api(
                "PATCH",
                "/api/admin/po-periods",
                {
                    "periodId": po_period["id"],
                    "isActive": True,
                    "quotas": [{"productId": prod["id"], "totalQuota": orig_quota + 1}],
                },
            )
            var_id = (
                prod["variants"][0]["id"]
                if prod.get("hasVariants") and prod.get("variants")
                else None
            )
            _, created, _ = guest_client.api(
                "POST",
                "/api/orders",
                {
                    "recipientName": "Uji Status Admin",
                    "recipientWhatsapp": "081200009999",
                    "fulfillmentMethod": "pickup",
                    "selections": [{"productId": prod["id"], "variantId": var_id, "quantity": 1}],
                },
            )
            target_code = created["order"]["orderCode"]
            original_status = "dibatalkan"
            temp_created = True
        else:
            assert len(orders) > 0, "Tidak ada pesanan maupun produk untuk menguji ubah status"
            target_code = orders[0]["orderCode"]
            original_status = orders[0]["status"]

        try:
            for st in ["diproses", "siap", "selesai"]:
                s_code, s_data, _ = admin_client.api(
                    "PATCH", f"/api/admin/orders/{target_code}", {"status": st}
                )
                assert s_code == 200, f"Gagal ubah status ke {st} ({s_code}): {s_data}"
                assert s_data["order"]["status"] == st
        finally:
            admin_client.api(
                "PATCH", f"/api/admin/orders/{target_code}", {"status": original_status}
            )
            if temp_created and po_period and prod:
                admin_client.api(
                    "PATCH",
                    "/api/admin/po-periods",
                    {
                        "periodId": po_period["id"],
                        "isActive": was_open,
                        "quotas": [{"productId": prod["id"], "totalQuota": orig_quota}],
                    },
                )

        return f"Order {target_code}: diproses -> siap -> selesai -> dikembalikan ke '{original_status}'"

    suite.check("Ubah Status Pesanan Masuk berfungsi ke semua tahap status", test_admin_change_order_status)

    # 5. Pengujian Toggle Status PO Mati / Aktif & Sinkronisasi ke Landing Page Customer
    def test_toggle_po_sync() -> str:
        _, ov, _ = admin_client.api("GET", "/api/admin/overview")
        po_period = ov.get("poPeriod")
        assert po_period is not None, "Periode PO belum ada di database"
        pid = po_period["id"]
        initial_open = bool(po_period.get("isOpenNow"))

        try:
            # Matikan PO
            off_code, off_data, _ = admin_client.api(
                "PATCH", "/api/admin/po-periods", {"periodId": pid, "isActive": False}
            )
            assert off_code == 200 and off_data["poPeriod"]["isOpenNow"] is False
            _, cat_closed, _ = guest_client.api("GET", "/api/catalog")
            assert cat_closed["poPeriod"]["isOpenNow"] is False, (
                "Katalog Customer belum ikut tertutup saat PO dimatikan"
            )

            # Nyalakan PO
            on_code, on_data, _ = admin_client.api(
                "PATCH", "/api/admin/po-periods", {"periodId": pid, "isActive": True}
            )
            assert on_code == 200 and on_data["poPeriod"]["isOpenNow"] is True
            _, cat_open, _ = guest_client.api("GET", "/api/catalog")
            assert cat_open["poPeriod"]["isOpenNow"] is True, (
                "Katalog Customer belum ikut terbuka saat PO diaktifkan"
            )
        finally:
            admin_client.api(
                "PATCH", "/api/admin/po-periods", {"periodId": pid, "isActive": initial_open}
            )

        return f"Sinkronisasi PO OFF -> ON berhasil & dikembalikan ke isActive={initial_open}"

    suite.check("Toggle Status PO Mati/Aktif langsung tersinkron ke halaman Customer", test_toggle_po_sync)

    return suite.summary()


if __name__ == "__main__":
    _, failed_count = run_suite()
    raise SystemExit(0 if failed_count == 0 else 1)
