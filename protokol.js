/* ══════════════════════════════════════════════════════════════
   Protokol L11 — Marklife P15 / P12 / P11 / P7
   Disusun dari catatan pembongkaran aplikasi MARKLIFE (thermoprint, MIT).
   Semua angka di sini datang dari spesifikasi itu, bukan tebakan.
   ══════════════════════════════════════════════════════════════ */

const UUID = {
  layanan: '0000ff00-0000-1000-8000-00805f9b34fb',
  rx:      '0000ff01-0000-1000-8000-00805f9b34fb',  // printer → kita
  tx:      '0000ff02-0000-1000-8000-00805f9b34fb',  // kita → printer
  cx:      '0000ff03-0000-1000-8000-00805f9b34fb'   // kendali: MTU dan kredit
};

/* Perintah L11 */
const CMD = {
  bangun:    new Uint8Array(15),                        // 15 byte nol
  hidupkan:  Uint8Array.from([0x10, 0xFF, 0xF1, 0x02]),
  selesai:   Uint8Array.from([0x10, 0xFF, 0xF1, 0x45]),
  keCelah:   Uint8Array.from([0x1D, 0x0C]),             // maju ke celah label
  status:    Uint8Array.from([0x10, 0xFF, 0x40]),
  baterai:   Uint8Array.from([0x10, 0xFF, 0x50, 0xF1]),
  kepekatan: d => Uint8Array.from([0x1F, 0x70, 0x02, d]),
  majuTitik: n => Uint8Array.from([0x1B, 0x4A, n & 0xFF])
};

/* Arti kode status dari printer: [0xFF, kode] */
const ARTI_STATUS = {
  1: 'Kertas habis',
  2: 'Penutup terbuka',
  3: 'Printer terlalu panas',
  4: 'Baterai lemah',
  5: 'Penutup tertutup'
};

/* Byte pertama yang menandakan cetak berhasil */
const SUKSES = [0xAA, 0x4F, 0x4B];   // 0xAA, 'O', 'K'

/* Ukuran paket per model. Nama perangkat P15 masuk kelompok 95 byte. */
function ukuranPaket(nama) {
  const n = String(nama || '').toUpperCase();
  if (/^(P12|LP90|P11)/.test(n)) return 90;
  if (/^(P15|P50|P1S|LP15|S2|EWTTO ET-|OUT_LPC|LUCKP_D1)/.test(n)) return 95;
  return 237;
}

/* ── Kanvas → raster 1 bit ────────────────────────────────────
   Abu-abu berbobot seperti di aplikasi aslinya, lalu ambang 128.
   1 = hitam (bertinta). Bit paling kiri adalah bit tertinggi. */
function keRaster(imageData, ambang, pakaiDither) {
  const { width: w, height: h, data } = imageData;
  const abu = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const a = data[i + 3] / 255;
    // piksel tembus pandang dianggap putih
    const r = data[i] * a + 255 * (1 - a);
    const g = data[i + 1] * a + 255 * (1 - a);
    const b = data[i + 2] * a + 255 * (1 - a);
    abu[p] = r * 0.299 + g * 0.587 + b * 0.114;
  }

  if (pakaiDither) {
    // Floyd–Steinberg berkelok: baris genap kiri→kanan, ganjil kanan→kiri
    for (let y = 0; y < h; y++) {
      const kiriKeKanan = (y % 2 === 0);
      for (let k = 0; k < w; k++) {
        const x = kiriKeKanan ? k : (w - 1 - k);
        const i = y * w + x;
        const lama = abu[i];
        const baru = lama >= ambang ? 255 : 0;
        const galat = lama - baru;
        abu[i] = baru;
        const maju = kiriKeKanan ? 1 : -1;
        const taruh = (xx, yy, bagian) => {
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) return;
          const j = yy * w + xx;
          abu[j] = Math.max(0, Math.min(255, abu[j] + galat * bagian));
        };
        taruh(x + maju, y,     7 / 16);
        taruh(x - maju, y + 1, 3 / 16);
        taruh(x,        y + 1, 5 / 16);
        taruh(x + maju, y + 1, 1 / 16);
      }
    }
  }

  const bytePerBaris = Math.ceil(w / 8);
  const keluar = new Uint8Array(bytePerBaris * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (abu[y * w + x] < ambang) {
        keluar[y * bytePerBaris + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
  }
  return { data: keluar, bytePerBaris, tinggi: h, lebar: w };
}

/* Kepala perintah gambar: 1D 76 30 00 <lebar byte> <tinggi> */
function kepalaGambar(bytePerBaris, tinggi) {
  return Uint8Array.from([
    0x1D, 0x76, 0x30, 0x00,
    bytePerBaris & 0xFF, (bytePerBaris >> 8) & 0xFF,
    tinggi & 0xFF, (tinggi >> 8) & 0xFF
  ]);
}

function gabung(...bagian) {
  let n = 0;
  for (const b of bagian) n += b.length;
  const keluar = new Uint8Array(n);
  let o = 0;
  for (const b of bagian) { keluar.set(b, o); o += b.length; }
  return keluar;
}
