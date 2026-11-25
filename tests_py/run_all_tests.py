#!/usr/bin/env python3
"""
Master Test Runner — Menjalankan Pengujian Seluruh Halaman Banatier (01 s/d 06)
dan menampilkan tabel rekapitulasi hasil PASS & FAIL per halaman.

Cara pakai:
  python tests_py/run_all_tests.py
"""

from __future__ import annotations

import sys
import time

import test_01_landing_page
import test_02_login_register_page
import test_03_account_page
import test_04_checkout_qris_invoice_page
import test_05_orders_tracking_page
import test_06_admin_dashboard_page


def main() -> int:
    suites = [
        ("01. Landing Page & Katalog (/)", test_01_landing_page.run_suite),
        ("02. Login, Register & Redirect (/login)", test_02_login_register_page.run_suite),
        ("03. Akun & Membership (/account)", test_03_account_page.run_suite),
        ("04. Checkout, QRIS 10m & Invoice (/checkout)", test_04_checkout_qris_invoice_page.run_suite),
        ("05. Cek Pesanan & Riwayat (/orders)", test_05_orders_tracking_page.run_suite),
        ("06. Dashboard Admin & CRUD (/admin)", test_06_admin_dashboard_page.run_suite),
    ]

    started = time.time()
    recap: list[tuple[str, int, int]] = []
    grand_pass = 0
    grand_fail = 0

    print("\n" + "#" * 72)
    print("   BANATIER — PENGUJIAN OTOMATIS KESELURUHAN HALAMAN (PYTHON SUITE)")
    print("#" * 72)

    for label, runner in suites:
        passed, failed = runner()
        recap.append((label, passed, failed))
        grand_pass += passed
        grand_fail += failed

    elapsed_sec = time.time() - started

    print("\n" + "#" * 72)
    print("               REKAPITULASI AKHIR SELURUH HALAMAN")
    print("#" * 72)
    print(f"{'Halaman yang Diuji':<46} | {'PASS':>5} | {'FAIL':>5} | {'Status':<8}")
    print("-" * 72)
    for label, passed, failed in recap:
        badge = "PASS" if failed == 0 and passed > 0 else "FAIL"
        print(f"{label:<46} | {passed:>5} | {failed:>5} | [{badge}]")
    print("-" * 72)
    overall = "LULUS SEMUA" if grand_fail == 0 else "ADA YANG GAGAL"
    print(
        f"TOTAL PENGUJIAN: {grand_pass + grand_fail} Skenario | "
        f"PASS: {grand_pass} | FAIL: {grand_fail} | "
        f"Waktu: {elapsed_sec:.2f}s | [{overall}]"
    )
    print("#" * 72 + "\n")

    return 0 if grand_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
