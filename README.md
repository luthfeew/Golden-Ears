# Golden Ears — Blind Audio Test

Uji kepekaan telinga Anda secara objektif dalam membedakan format audio berkualitas master murni (**Lossless FLAC/WAV 24-bit**) melawan kompresi perseptual (**MP3 320 kbps & MP3 128 kbps**) melalui 10 lagu acak.

Aplikasi ini **100% statis (client-side)** dan siap di-host langsung di **GitHub Pages** tanpa memerlukan backend atau database server.

---

## Fitur Utama

- **100% Static & Serverless**: Berjalan sepenuhnya di peramban (client-side) menggunakan file audio lokal, `songs.json`, dan fallback embedded `songs.data.js`.
- **Master 24-Bit Hi-Res Quality**: Seluruh sampel audio bersumber langsung dari master rekaman studio 24-bit asli (bukan hasil upscale).
- **Seamless Switching (Web Audio API)**: Beralih instan antara Sampel A, B, dan C pada posisi waktu pemutaran yang sama persis tanpa jeda atau klik audio (*sample-accurate playhead sync*).
- **RAM Preloading (Bebas Lag & Adil)**: Seluruh 30 berkas audio untuk 10 lagu diunduh penuh ke memori RAM sebelum pengujian dimulai, guna menghilangkan bias latensi transmisi jaringan.
- **Pilihan Format Lossless Acuan**: Mendukung format **FLAC 24-bit** (~30 MB total, hemat data) dan **WAV 24-bit** (~50 MB total, audio PCM tanpa kompresi).
- **Desain Modern & Responsif**: Dibangun dengan Tailwind CSS v3, Plus Jakarta Sans, dan Lucide Icons dengan dukungan mode Gelap (*Dark Mode*) dan Terang (*Light Mode*).
- **Laporan Skor & Ambang Dengar**: Memberikan evaluasi akurasi instan di setiap nomor dan rapor akhir klasifikasi resolusi auditori.

---

## Struktur Berkas

```
Golden Ears/
├── index.html            # Antarmuka web utama
├── style.css             # Penataan Companion CSS & typography
├── app.js                # Logika Audio Engine, state management, & interaksi
├── songs.json            # Katalog 54 lagu beserta metadata
├── songs.data.js         # Fallback data katalog untuk protokol file:///
├── .nojekyll             # Menjamin GitHub Pages memuat seluruh aset tanpa filter Jekyll
├── assets/
│   ├── placeholder.svg   # Cover placeholder fallback
│   └── vendor/           # Local vendor fallbacks (Tailwind, Lucide)
├── songs/                # Direktori berkas audio uji terstandarisasi
└── scripts/              # Utilitas otomasi katalog & normalisasi berkas
```

---

## Cara Menjalankan Secara Lokal

### Opsi 1: Menjalankan dengan Local Web Server (Direkomendasikan)
Buka terminal pada folder proyek ini dan jalankan server lokal:

```bash
# Menggunakan Python 3:
python -m http.server 8080

# Atau menggunakan Node.js:
npx serve .
```
Buka peramban dan akses: `http://localhost:8080`

### Opsi 2: Langsung Buka Berkas HTML
Anda juga dapat langsung membuka file `index.html` dengan klik ganda di peramban modern (Chrome, Edge, Firefox, Safari).

---

## Deploy ke GitHub Pages

1. Buat repository baru di GitHub (misal: `golden-ears`).
2. Hubungkan remote dan push:
   ```bash
   git remote add origin https://github.com/<username>/golden-ears.git
   git push -u origin main
   ```
3. Di repository GitHub Anda, buka tab **Settings** → **Pages**.
4. Pada bagian **Build and deployment** / **Source**, pilih **Deploy from a branch**.
5. Pilih branch `main` dan folder `/(root)`, lalu klik **Save**.
6. Situs web Anda akan aktif secara otomatis pada URL `https://<username>.github.io/golden-ears/`.

---

## Lisensi
MIT License. Dibuat untuk tujuan evaluasi pendengaran kritis dan edukasi audio digital.
