/* ══════════════════════════════════════════════════════════════
   Sambungan BLE ke printer, lengkap dengan kendali aliran kredit.
   Printer memberi jatah kirim lewat jalur CX. Kalau kita mengirim
   melebihi jatah, penyangganya penuh dan cetakan rusak atau
   berhenti di tengah — jadi bagian ini yang paling menentukan.
   ══════════════════════════════════════════════════════════════ */

class Printer {
  constructor(catat) {
    this.catat = catat || (() => {});
    this.perangkat = null;
    this.gatt = null;
    this.tx = null;
    this.rx = null;
    this.cx = null;
    this.kredit = 0;
    this.ukuranPaket = 95;
    this.mtu = 240;
    this.balasan = [];
    this.statusTerakhir = null;
  }

  get tersambung() {
    return !!(this.gatt && this.gatt.connected);
  }

  async sambung() {
    if (!navigator.bluetooth) {
      throw new Error('Browser ini tidak punya Web Bluetooth. Pakai Chrome atau Edge di laptop.');
    }
    this.catat('Membuka pemilih perangkat…');
    this.perangkat = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'P15' }, { namePrefix: 'P12' }, { namePrefix: 'P11' },
        { namePrefix: 'P7' },  { namePrefix: 'LP15' }, { namePrefix: 'M1' }
      ],
      optionalServices: [UUID.layanan]
    });

    this.ukuranPaket = ukuranPaket(this.perangkat.name);
    this.catat('Terpilih: ' + this.perangkat.name + ' · paket ' + this.ukuranPaket + ' byte');

    this.perangkat.addEventListener('gattserverdisconnected', () => {
      this.catat('Printer terputus.');
      this.gatt = null;
    });

    this.gatt = await this.perangkat.gatt.connect();
    const layanan = await this.gatt.getPrimaryService(UUID.layanan);
    this.tx = await layanan.getCharacteristic(UUID.tx);
    this.rx = await layanan.getCharacteristic(UUID.rx);
    this.cx = await layanan.getCharacteristic(UUID.cx);

    await this.rx.startNotifications();
    this.rx.addEventListener('characteristicvaluechanged', e => this._terimaRx(e));
    await this.cx.startNotifications();
    this.cx.addEventListener('characteristicvaluechanged', e => this._terimaCx(e));

    // Printer biasanya mengirim jatah awal sendiri. Kalau tidak, kita mulai dari 1
    // supaya pengiriman tidak menggantung selamanya.
    this.kredit = 0;
    await new Promise(r => setTimeout(r, 400));
    if (this.kredit === 0) {
      this.kredit = 1;
      this.catat('Printer belum memberi jatah kirim — mulai hati-hati dari 1.');
    }
    this.catat('Tersambung.');
    return this.perangkat.name;
  }

  _terimaCx(e) {
    const d = new Uint8Array(e.target.value.buffer);
    if (d[0] === 0x01) {
      this.kredit += d[1];
      this.catat('Jatah kirim +' + d[1] + ' (jadi ' + this.kredit + ')', true);
    } else if (d[0] === 0x02) {
      this.mtu = (d[2] << 8) | d[1];
      this.catat('MTU printer: ' + this.mtu, true);
    }
  }

  _terimaRx(e) {
    const d = new Uint8Array(e.target.value.buffer);
    this.balasan.push(d);
    if (d[0] === 0xFF && ARTI_STATUS[d[1]]) {
      this.statusTerakhir = ARTI_STATUS[d[1]];
      this.catat('Printer bilang: ' + this.statusTerakhir);
    } else {
      this.catat('Balasan printer: ' + [...d].map(x => x.toString(16).padStart(2, '0')).join(' '), true);
    }
  }

  /** Menunggu jatah kirim. Kalau macet lebih dari 3 detik, paksa satu paket. */
  async _tungguKredit() {
    if (this.kredit > 0) return;
    const mulai = Date.now();
    while (this.kredit <= 0) {
      if (Date.now() - mulai > 3000) {
        this.kredit = 1;
        this.catat('Jatah kirim tidak datang selama 3 detik — dipaksa 1 (buffer printer mungkin masih penuh, cek hasil cetak).', true);
        return;
      }
      await new Promise(r => setTimeout(r, 10));
    }
  }

  async kirim(bytes, jedaMs) {
    if (!this.tersambung) throw new Error('Printer tidak tersambung.');
    const jeda = jedaMs === undefined ? 30 : jedaMs;
    for (let i = 0; i < bytes.length; i += this.ukuranPaket) {
      const potongan = bytes.slice(i, i + this.ukuranPaket);
      await this._tungguKredit();
      await this.tx.writeValueWithoutResponse(potongan);
      this.kredit--;
      if (jeda) await new Promise(r => setTimeout(r, jeda));
    }
  }

  /** Menunggu printer bilang selesai. Balasannya 0xAA, 'O', atau 'K'. */
  async tungguSelesai(batasMs) {
    const mulai = Date.now();
    while (Date.now() - mulai < (batasMs || 15000)) {
      while (this.balasan.length) {
        const d = this.balasan.shift();
        if (SUKSES.includes(d[0])) return true;
        if (d[0] === 0xFF && [1, 2, 3].includes(d[1])) {
          throw new Error(ARTI_STATUS[d[1]] + ' — cetak dihentikan.');
        }
      }
      await new Promise(r => setTimeout(r, 50));
    }
    return false;   // tanpa konfirmasi; belum tentu gagal
  }

  /** Satu label penuh, sesuai urutan L11 untuk P15. */
  async cetakRaster(raster, pilihan) {
    const p = pilihan || {};
    this.balasan.length = 0;

    if (p.kepekatan) await this.kirim(CMD.kepekatan(p.kepekatan), 30);
    await this.kirim(CMD.bangun, 30);
    await this.kirim(CMD.hidupkan, 30);

    const muatan = gabung(kepalaGambar(raster.bytePerBaris, raster.tinggi), raster.data);
    this.catat('Mengirim gambar ' + raster.lebar + '×' + raster.tinggi +
               ' piksel · ' + muatan.length + ' byte');
    await this.kirim(muatan, p.jeda === undefined ? 30 : p.jeda);

    if (p.kertas === 'celah') await this.kirim(CMD.keCelah, 30);
    else await this.kirim(CMD.majuTitik(p.majuTitik || 100), 30);

    await this.kirim(CMD.selesai, 30);
    return await this.tungguSelesai(p.batasMs);
  }

  async putus() {
    if (this.gatt && this.gatt.connected) this.gatt.disconnect();
    this.gatt = null;
  }
}
