/* ══════════════════════════════════════════════════════════════
   Menggambar satu label ke kanvas pada resolusi printer.
   Printer tidak punya huruf bawaan — semuanya harus jadi gambar.
   ══════════════════════════════════════════════════════════════ */

/* mm → piksel pada kerapatan tertentu (203 dpi = 8 titik/mm) */
const mmKePx = (mm, dpi) => Math.round(mm / 25.4 * dpi);

function gambarQR(teks, sisiPx) {
     const wadah = document.createElement('div');
     wadah.style.cssText = 'position:absolute;left:-99999px;top:0';
     document.body.appendChild(wadah);
     try {
            new QRCode(wadah, {
                     text: teks, width: sisiPx, height: sisiPx,
                     correctLevel: QRCode.CorrectLevel.L,
                     colorDark: '#000000', colorLight: '#ffffff'
            });
            const kanvas = wadah.querySelector('canvas');
            if (kanvas) return kanvas;
            const img = wadah.querySelector('img');
            if (img) {
                     const k = document.createElement('canvas');
                     k.width = sisiPx; k.height = sisiPx;
                     k.getContext('2d').drawImage(img, 0, 0, sisiPx, sisiPx);
                     return k;
            }
            return null;
     } finally {
            setTimeout(() => wadah.remove(), 0);
     }
}

/**
 * Menggambar label. Lebar di sini artinya sisi yang melintang di kepala
 * cetak; tinggi artinya arah kertas berjalan.
 */
function gambarLabel(label, cfg) {
     const lebarPx = mmKePx(cfg.lebarMm, cfg.dpi);
     const tinggiPx = mmKePx(cfg.tinggiMm, cfg.dpi);
     const marginPx = mmKePx(cfg.marginMm, cfg.dpi);

  const k = document.createElement('canvas');
     k.width = lebarPx; k.height = tinggiPx;
     const c = k.getContext('2d');
     c.fillStyle = '#fff'; c.fillRect(0, 0, lebarPx, tinggiPx);
     c.fillStyle = '#000';
     c.textBaseline = 'top';

  const isiL = lebarPx - marginPx * 2;
     const isiT = tinggiPx - marginPx * 2;

  if (cfg.putar) {
         // Isi digambar memanjang searah label, lalu diputar seperempat
       const bantu = document.createElement('canvas');
         bantu.width = tinggiPx; bantu.height = lebarPx;
         isiKeKanvas(bantu, label, cfg, tinggiPx - marginPx * 2, lebarPx - marginPx * 2, marginPx);
         c.save();
         c.translate(lebarPx, 0);
         c.rotate(Math.PI / 2);
         c.drawImage(bantu, 0, 0);
         c.restore();
  } else {
         isiKeKanvas(k, label, cfg, isiL, isiT, marginPx);
  }
     return k;
}

/* Nama font CSS untuk tiap pilihan di editor template (aset-uhp). Ada di
   dua tempat (di sini dan di aset-uhp/index.html) — kalau daftar pilihan
   berubah, ubah di kedua tempat. */
function fontCss(fam) {
     if (fam === 'mono') return 'ui-monospace, "SF Mono", Menlo, monospace';
     if (fam === 'serif') return 'Georgia, "Times New Roman", serif';
     return '-apple-system, system-ui, sans-serif';
}

/**
 * Menggambar isi label (QR + teks) ke satu kanvas "logis" yang belum
 * diputar — sumbu-x (u) mengikuti panjang label (isiL), sumbu-y (v)
 * mengikuti lebar/pendek label (isiT). Mendukung dua bentuk cfg.tpl:
 *  - BARU: cfg.tpl.elems.{qr,brand,kode,nama} — posisi (dxMm/dyMm),
 *    ukuran, dan font per elemen, diatur lewat editor visual di aset-uhp.
 *  - LAMA: cfg.tpl.{fBrand,fKode,fNama,brandOn} — dipakai sebagai
 *    cadangan kalau elems tidak ada (link cetak lama yang sudah beredar).
 * Di kedua kasus, kalau tinggi total teks (merek+kode+nama) melebihi
 * ruang yang tersedia (isiT), semua ukuran huruf diskalakan turun
 * sebanding — supaya baris terakhir TIDAK PERNAH terpotong di tepi
 * kanvas seperti sebelumnya.
 */
function isiKeKanvas(kanvas, label, cfg, isiL, isiT, margin) {
     const c = kanvas.getContext('2d');
     c.fillStyle = '#fff'; c.fillRect(0, 0, kanvas.width, kanvas.height);
     c.fillStyle = '#000';
     c.textBaseline = 'top';

  const T = cfg.tpl || null;
     const E = (T && T.elems) || null;
     const scl = cfg.dpi / 96;
     const mmPx = mm => mmKePx(mm || 0, cfg.dpi);

  const adaQR = !!label.link;
     const qrCfg = (E && E.qr) || {};
     // Jarak minimum dari tepi supaya QR tidak mepet — sebelumnya QR selalu
  // dibuat sebesar mungkin (nyaris = isiT) dan cuma bergantung pada
  // marginMm global, jadi kelihatan menempel di tepi label.
  const qrPad = adaQR ? Math.max(0, Math.round(cfg.dpi / 25.4 * 0.5)) : 0;

  let sisiQR = 0, qrX = margin, qrY = margin;
     if (adaQR) {
            const autoSisi = Math.max(1, Math.min(isiT - qrPad * 2, Math.floor(isiL * (cfg.porsiQR || 0.55))));
            sisiQR = (qrCfg.sizeMm != null && qrCfg.sizeMm > 0) ? Math.min(isiT, mmPx(qrCfg.sizeMm)) : autoSisi;
            sisiQR = Math.max(1, sisiQR);
            qrX = margin + qrPad + mmPx(qrCfg.dxMm);
            qrY = margin + Math.max(0, (isiT - sisiQR) / 2) + mmPx(qrCfg.dyMm);
     }

  let x = margin;
     if (adaQR) {
            const kq = gambarQR(label.link, sisiQR);
            if (kq) {
                     c.drawImage(kq, qrX, qrY, sisiQR, sisiQR);
                     x = margin + qrPad + sisiQR + qrPad + Math.round(cfg.dpi / 25.4 * 1.2);
            }
     }

  const lebarTeks = kanvas.width - margin - x;
     if (lebarTeks < 10) return;

  const brandCfg = (E && E.brand) || {};
     const kodeCfg = (E && E.kode) || {};
     const namaCfg = (E && E.nama) || {};
     const tampilMerek = T && T.brandOn !== false;

  let besarMerek = T ? Math.max(6, Math.round(((brandCfg.size != null ? brandCfg.size : T.fBrand) || 10.5) * scl)) : 0;
     let besarKode = T ? Math.max(8, Math.round(((kodeCfg.size != null ? kodeCfg.size : T.fKode) || 15) * scl)) : Math.max(10, Math.round(isiT * 0.30));
     let besarNama = T ? Math.max(6, Math.round(((namaCfg.size != null ? namaCfg.size : T.fNama) || 11) * scl)) : Math.max(8, Math.round(isiT * 0.20));

  const famBrand = fontCss(brandCfg.font);
     const famKode = fontCss(kodeCfg.font || 'mono');
     const famNama = fontCss(namaCfg.font);

  // ── Jaring pengaman anti-terpotong ──────────────────────────────
  c.font = '500 ' + besarNama + 'px ' + famNama;
     let barisNama = bungkus(c, label.nama || '', lebarTeks, 2);
     let tinggiTotal = (tampilMerek ? besarMerek + 3 : 0) + besarKode + 3 + Math.max(1, barisNama.length) * (besarNama + 2);

  // Jarak antar-baris (+3/+2 px) itu tetap (bukan bagian dari ukuran
  // huruf), jadi satu kali skala saja kadang belum cukup untuk pas di
  // isiT. Ulangi beberapa kali sampai muat atau sampai mentok batas
  // bawah keterbacaan (5-6px) — sehingga baris terakhir TIDAK PERNAH
  // dibiarkan terpotong di tepi kanvas seperti pada versi sebelumnya.
  for (let ulang = 0; ulang < 6 && tinggiTotal > isiT && isiT > 0; ulang++) {
         const skala = Math.max(0.85, Math.min(0.98, (isiT / tinggiTotal) * 0.97));
         const merekBaru = Math.floor(besarMerek * skala);
         const kodeBaru = Math.floor(besarKode * skala);
         const namaBaru = Math.floor(besarNama * skala);
         if (merekBaru < 5 && kodeBaru < 6 && namaBaru < 5) break; // sudah mentok, jangan makin mengecil
       besarMerek = Math.max(5, merekBaru);
         besarKode = Math.max(6, kodeBaru);
         besarNama = Math.max(5, namaBaru);
         c.font = '500 ' + besarNama + 'px ' + famNama;
         barisNama = bungkus(c, label.nama || '', lebarTeks, 2);
         tinggiTotal = (tampilMerek ? besarMerek + 3 : 0) + besarKode + 3 + Math.max(1, barisNama.length) * (besarNama + 2);
  }

  let y = margin + Math.max(0, (isiT - tinggiTotal) / 2);

  if (tampilMerek) {
         c.font = '700 ' + besarMerek + 'px ' + famBrand;
         c.fillText(potong(c, T.brand || 'Upscale House', lebarTeks), x + mmPx(brandCfg.dxMm), y + mmPx(brandCfg.dyMm));
         y += besarMerek + 3;
  }

  c.font = '700 ' + besarKode + 'px ' + famKode;
     c.fillText(potong(c, label.kode || '', lebarTeks), x + mmPx(kodeCfg.dxMm), y + mmPx(kodeCfg.dyMm));
     y += besarKode + 3;

  c.font = '500 ' + besarNama + 'px ' + famNama;
     for (const b of barisNama) {
            c.fillText(b, x + mmPx(namaCfg.dxMm), y + mmPx(namaCfg.dyMm));
            y += besarNama + 2;
     }
}

function potong(c, teks, lebarMaks) {
     if (c.measureText(teks).width <= lebarMaks) return teks;
     let t = teks;
     while (t.length > 1 && c.measureText(t + '…').width > lebarMaks) t = t.slice(0, -1);
     return t + '…';
}

function bungkus(c, teks, lebarMaks, maksBaris) {
     const kata = String(teks).split(/\s+/).filter(Boolean);
     const baris = [];
     let kini = '';
     for (const w of kata) {
            const coba = kini ? kini + ' ' + w : w;
            if (c.measureText(coba).width <= lebarMaks) { kini = coba; continue; }
            if (kini) baris.push(kini);
            kini = w;
            if (baris.length === maksBaris) break;
     }
     if (kini && baris.length < maksBaris) baris.push(kini);
     if (baris.length === maksBaris) baris[maksBaris - 1] = potong(c, baris[maksBaris - 1], lebarMaks);
     return baris;
}
