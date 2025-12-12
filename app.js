const express = require('express');
const puppeteer = require('puppeteer');
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
    
    const browser = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    await page.goto('https://khasteknopark.com.tr/firmalar/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Firma bilgilerini çek
    const firmalar = await page.evaluate(() => {
      const firmaColumns = document.querySelectorAll('.elementor-column[data-settings*="background"]');
      const results = [];

      firmaColumns.forEach(column => {
        const isimElement = column.querySelector('h6.elementor-heading-title');
        const isim = isimElement ? isimElement.textContent.trim() : '';

        const aciklamaElement = column.querySelector('.elementor-widget-text-editor p');
        const aciklama = aciklamaElement ? aciklamaElement.textContent.trim() : '';

        const linkElement = column.querySelector('.elementor-button-link');
        const detayLink = linkElement ? linkElement.href : '';

        const logoElement = column.querySelector('img');
        const logo = logoElement ? logoElement.src : '';

        if (isim) {
          results.push({
            isim,
            aciklama,
            detayLink,
            logo,
            tumMetin: `${isim} ${aciklama}`.toLowerCase()
          });
        }
      });

      return results;
    });

    await browser.close();

    // Keyword eşleştirme
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

// Local development
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
  });
}

module.exports = app;