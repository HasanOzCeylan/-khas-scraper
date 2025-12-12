// ============================================
// YENİ server.js (Cheerio ile)
// ============================================

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

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    console.log('Scraping başlatılıyor:', keywords);
    
    // Axios ile HTML'i çek
    const { data } = await axios.get('https://khasteknopark.com.tr/firmalar/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });

    // Cheerio ile parse et
    const $ = cheerio.load(data);
    const firmalar = [];

    // Firma bilgilerini çek (aynı selector'lar)
    $('.elementor-column[data-settings*="background"]').each((index, element) => {
      const $column = $(element);
      
      const isimElement = $column.find('h6.elementor-heading-title');
      const isim = isimElement.text().trim();

      const aciklamaElement = $column.find('.elementor-widget-text-editor p');
      const aciklama = aciklamaElement.text().trim();

      const linkElement = $column.find('.elementor-button-link');
      const detayLink = linkElement.attr('href') || '';

      const logoElement = $column.find('img');
      const logo = logoElement.attr('src') || '';

      if (isim) {
        firmalar.push({
          isim,
          aciklama,
          detayLink,
          logo,
          tumMetin: `${isim} ${aciklama}`.toLowerCase()
        });
      }
    });

    // Keyword eşleştirme (tamamen aynı)
    const keywordList = keywords.toLowerCase().split(',').map(k => k.trim()).filter(k => k);
    const eslesenFirmalar = [];

    firmalar.forEach(firma => {
      const eslesenKelimeler = [];
      
      keywordList.forEach(keyword => {
        if (firma.tumMetin.includes(keyword)) {
          eslesenKelimeler.push(keyword);
        }
      });

      if (eslesenKelimeler.length > 0) {
        eslesenFirmalar.push({
          isim: firma.isim,
          aciklama: firma.aciklama,
          detayLink: firma.detayLink,
          logo: firma.logo,
          eslesenKelimeler
        });
      }
    });

    console.log(`✓ ${eslesenFirmalar.length}/${firmalar.length} firma eşleşti`);

    res.json({
      success: true,
      toplamFirma: firmalar.length,
      eslesenFirma: eslesenFirmalar.length,
      firmalar: eslesenFirmalar
    });

  } catch (error) {
    console.error('Scraping hatası:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Production ve development için
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
});

module.exports = app;
