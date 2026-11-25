# Panduan Deployment AWS — Banatier (Frontend & Backend Terpisah)

Dokumen ini merangkum konfigurasi arsitektur AWS untuk memenuhi **INF-001 s.d. INF-007** serta **NFR-001 s.d. NFR-006** pada PRD dengan struktur folder `frontend/` dan `backend/` yang terpisah.

## 1. Arsitektur Komponen AWS

1. **Application Load Balancer (ALB)** — Menerima trafik publik HTTP/HTTPS, membagi beban ke minimal 2 instance EC2 Web Server, serta menjalankan *Health Check* ke endpoint `GET /api/health`.
2. **2× Amazon EC2 (`t3.small` Ubuntu 24.04 LTS)** — Pada masing-masing EC2 berjalan:
   - **Nginx Reverse Proxy** di port `80`: meneruskan `/api/*` ke `backend` (`127.0.0.1:4000`) dan `/*` ke `frontend` (`127.0.0.1:3000`). *(Atau dapat dipisah ke EC2 Frontend dan EC2 Backend tersendiri).*
   - **Backend (`backend/`)** di port `4000`: REST API stateless, JWT auth, kalkulasi kuota/harga, dan webhook QRIS.
   - **Frontend (`frontend/`)** di port `3000`: Antarmuka web Next.js.
3. **1× Amazon RDS for PostgreSQL (`db.t4g.micro` / `db.t3.micro`)** — Database terpusat di Security Group terpisah yang hanya mengizinkan koneksi port `5432` dari EC2 (`NFR-004`).

## 2. Konfigurasi `.env` di AWS EC2

### `backend/.env`
Pastikan `JWT_SECRET`, `DATABASE_URL`, dan `WEBHOOK_SECRET` **sama persis** di seluruh server, sedangkan `SERVER_INSTANCE_ID` dibedakan (`aws-web-01` vs `aws-web-02`) untuk demo pembagian trafik Load Balancer (`INF-003`):

```env
PORT=4000
FRONTEND_ORIGIN="http://DNS_LOAD_BALANCER_ANDA"
SERVER_INSTANCE_ID="aws-web-01"
USE_HTTPS="false"

DATABASE_URL="postgresql://postgres:PASSWORD_ANDA@ENDPOINT_RDS.ap-southeast-1.rds.amazonaws.com:5432/banatier"
DATABASE_SSL="true"

JWT_SECRET="ganti-dengan-random-32-karakter-sama-di-semua-ec2"
WEBHOOK_SECRET="ganti-dengan-secret-webhook-sama-di-semua-ec2"
ADMIN_INITIAL_PASSWORD="ganti-password-admin-kuat"
PAYMENT_MODE="demo"
```

> **Catatan `USE_HTTPS`:** Biarkan `USE_HTTPS="false"` selama mengakses ALB menggunakan `http://...elb.amazonaws.com`. Ubah menjadi `USE_HTTPS="true"` hanya jika ALB sudah dipasangi sertifikat SSL/HTTPS (AWS ACM), agar cookie sesi login tetap tersimpan di browser.

### `frontend/.env`
```env
BACKEND_URL="http://127.0.0.1:4000"
```

## 3. Contoh Konfigurasi Nginx di Tiap EC2 (`/etc/nginx/sites-available/default`)

```nginx
server {
    listen 80;
    server_name _;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 4. Perintah Build & Menjalankan di EC2

```bash
# Inisialisasi tabel & seed di AWS RDS (cukup sekali dari salah satu server)
cd backend && npm run db:init

# Build Frontend Next.js
cd ../frontend && npm run build

# Jalankan Backend (:4000) & Frontend (:3000) menggunakan pm2 atau systemd
pm2 start "npm --prefix backend run start" --name banatier-backend
pm2 start "npm --prefix frontend run start" --name banatier-frontend
```
