const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let browser = null;

// Browser'ı başlat
async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
    });
  }
  return browser;
}

// Ana sayfa route'u
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Scraping endpoint
app.post('/api/scrape', async (req, res) => {
  const { keywords } = req.body;
  
  if (!keywords || keywords.trim() === '') {
    return res.status(400).json({ error: 'Lütfen en az bir kelime girin!' });
  }

  try {
    console.log('Scraping başladı:', keywords);
    const b = await initBrowser();
    const page = await b.newPage();
    
    await page.goto('https://khasteknopark.com.tr/firmalar/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Tüm firma bilgilerini çek
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

    await page.close();

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

    console.log(`${eslesenFirmalar.length} firma bulundu`);
    
    res.json({
      success: true,
      toplamFirma: firmalar.length,
      eslesenFirma: eslesenFirmalar.length,
      firmalar: eslesenFirmalar
    });

  } catch (error) {
    console.error('Hata:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server çalışıyor`);
});

// Uygulama kapanırken browser'ı kapat
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit();
});

