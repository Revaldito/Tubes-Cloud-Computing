# Banatier — Pre-Order Kue Pisang (Frontend & Backend Terpisah)

Proyek ini sudah dipisah secara penuh menjadi **2 folder independen** agar mudah dikerjakan bersama tim maupun di-deploy ke AWS:

```text
Banatier/
├── frontend/     # Aplikasi Next.js murni untuk tampilan UI (port 3000)
├── backend/      # Server REST API Node.js + TypeScript & PostgreSQL (port 4000)
└── docs/         # Panduan deployment AWS (EC2, RDS, Load Balancer)
```

## Cara Menjalankan di Laptop

### Opsi A — Jalankan Sekaligus (1 Perintah dari Folder Utama)
```bash
npm run dev
```

### Opsi B — Jalankan Terpisah di 2 Terminal
**Terminal 1 (Backend API — port `4000`):**
```bash
cd backend
npm run dev
```

**Terminal 2 (Frontend Next.js — port `3000`):**
```bash
cd frontend
npm run dev
```

Lalu buka **http://localhost:3000** di browser.

## Akun Demo Siap Pakai
- **Member (Diskon 10%):** `member@banatier.id` / `member123`
- **Admin:** `admin@banatier.id` / `admin123`
