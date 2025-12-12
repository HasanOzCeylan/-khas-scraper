const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Cache için
let cachedData = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 dakika

// Axios instance (daha hızlı bağlantı için)
const axiosInstance = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
  },
  maxRedirects: 5,
  decompress: true
});

// Retry mekanizması
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axiosInstance.get(url);
      return response.data;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`Deneme ${i + 1} başarısız, tekrar deneniyor...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Firma verilerini çek ve önbelleğe al
async function getFirmalar() {
  const now = Date.now();
  
  // Cache geçerliyse kullan
  if (cachedData && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    console.log('✓ Cache kullanılıyor');
    return cachedData;
  }

  console.log('→ Yeni veri çekiliyor...');
  
  const html = await fetchWithRetry('https://khasteknopark.com.tr/firmalar/');
  const $ = cheerio.load(html);
  const firmalar = [];

  // Tüm firmaları topla
  $('.elementor-column[data-settings*="background"]').each((index, element) => {
    const $column = $(element);
    
    const isim = $column.find('h6.elementor-heading-title').text().trim();
    if (!isim) return; // Boş isimleri atla
    
    const aciklama = $column.find('.elementor-widget-text-editor p').text().trim();
    const detayLink = $column.find('.elementor-button-link').attr('href') || '';
    const logo = $column.find('img').attr('src') || '';
    
    firmalar.push({
      isim,
      aciklama,
      detayLink,
      logo,
      searchText: `${isim} ${aciklama}`.toLowerCase()
    });
  });

  // Cache'e kaydet
  cachedData = firmalar;
  cacheTime = now;
  
  console.log(`✓ ${firmalar.length} firma önbelleğe alındı`);
  return firmalar;
}

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    cached: !!cachedData,
    cacheAge: cacheTime ? Math.floor((Date.now() - cacheTime) / 1000) : null
  });
});

// Scraping API endpoint
app.post('/api/scrape', async (req, res) => {
  const { keywords } = req.body;
  
  if (!keywords || !keywords.trim()) {
    return res.status(400).json({ 
      success: false, 
      error: 'Anahtar kelime gerekli!' 
    });
  }

  try {
    const startTime = Date.now();
    console.log('→ Arama yapılıyor:', keywords);
    
    // Firmaları al (cache veya yeni çekme)
    const firmalar = await getFirmalar();
    
    // Keyword'leri hazırla
    const keywordList = keywords.toLowerCase()
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    // Eşleşenleri bul (optimize edilmiş)
    const eslesenFirmalar = [];
    
    for (const firma of firmalar) {
      const eslesenKelimeler = keywordList.filter(keyword => 
        firma.searchText.includes(keyword)
      );
      
      if (eslesenKelimeler.length > 0) {
        eslesenFirmalar.push({
          isim: firma.isim,
          aciklama: firma.aciklama,
          detayLink: firma.detayLink,
          logo: firma.logo,
          eslesenKelimeler,
          eslesmeSkoru: eslesenKelimeler.length
        });
      }
    }
    
    // Skora göre sırala
    eslesenFirmalar.sort((a, b) => b.eslesmeSkoru - a.eslesmeSkoru);
    
    const duration = Date.now() - startTime;
    console.log(`✓ ${eslesenFirmalar.length}/${firmalar.length} firma bulundu (${duration}ms)`);
    
    res.json({
      success: true,
      toplamFirma: firmalar.length,
      eslesenFirma: eslesenFirmalar.length,
      firmalar: eslesenFirmalar,
      sure: `${duration}ms`,
      cached: cacheTime && (Date.now() - cacheTime) < CACHE_DURATION
    });

  } catch (error) {
    console.error('❌ Hata:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      tip: error.code === 'ECONNABORTED' 
        ? 'Site yavaş yanıt veriyor, tekrar deneyin' 
        : 'Bağlantı hatası oluştu'
    });
  }
});

// Cache temizleme endpoint (opsiyonel)
app.post('/api/clear-cache', (req, res) => {
  cachedData = null;
  cacheTime = null;
  res.json({ success: true, message: 'Cache temizlendi' });
});

// Server başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server başlatıldı: http://localhost:${PORT}`);
  console.log(`📦 Cache süresi: ${CACHE_DURATION / 1000} saniye`);
});

module.exports = app;
