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
      correctLevel: QRCode.CorrectLevel.Q,
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

function isiKeKanvas(kanvas, label, cfg, isiL, isiT, margin) {
  const c = kanvas.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, kanvas.width, kanvas.height);
  c.fillStyle = '#000';
  c.textBaseline = 'top';

  const adaQR = !!label.link;
  // QR dibuat sebesar mungkin tapi menyisakan ruang untuk tulisan
  const sisiQR = adaQR ? Math.min(isiT, Math.floor(isiL * (cfg.porsiQR || 0.55))) : 0;

  let x = margin;
  if (adaQR) {
    const kq = gambarQR(label.link, sisiQR);
    if (kq) {
      c.drawImage(kq, x, margin + Math.max(0, (isiT - sisiQR) / 2), sisiQR, sisiQR);
      x += sisiQR + Math.round(cfg.dpi / 25.4 * 1.2);
    }
  }

  const lebarTeks = kanvas.width - margin - x;
  if (lebarTeks < 10) return;

  const T = cfg.tpl || null;
  const scl = cfg.dpi / 96;
  const besarMerek = T ? Math.max(6, Math.round((T.fBrand || 10.5) * scl)) : 0;
  const besarKode = T ? Math.max(8, Math.round((T.fKode || 15) * scl)) : Math.max(10, Math.round(isiT * 0.30));
  const besarNama = T ? Math.max(6, Math.round((T.fNama || 11) * scl)) : Math.max(8, Math.round(isiT * 0.20));
  const tampilMerek = T && T.brandOn !== false;
  
  let y = margin + Math.max(0, (isiT - ((tampilMerek ? besarMerek + 3 : 0) + besarKode + besarNama * 2 + 6)) / 2);
  
  if (tampilMerek) {
   c.font = '700 ' + besarMerek + 'px -apple-system, system-ui, sans-serif';
   c.fillText(potong(c, T.brand || 'Upscale House', lebarTeks), x, y);
   y += besarMerek + 3;
  }
  
  c.font = '700 ' + besarKode + 'px ui-monospace, "SF Mono", Menlo, monospace';
  c.fillText(potong(c, label.kode || '', lebarTeks), x, y);
  y += besarKode + 3;
  
  c.font = '500 ' + besarNama + 'px -apple-system, system-ui, sans-serif';
  const baris = bungkus(c, label.nama || '', lebarTeks, 2);
  for (const b of baris) { c.fillText(b, x, y); y += besarNama + 2; }
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
