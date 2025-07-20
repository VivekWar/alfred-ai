const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const validator = require('../bot/utils/validator');
const logger = require('../bot/utils/logger');
const { SCRAPING } = require('../config/constants');

class FacebookMarketplaceScraper {
  async scrape() {
    let browser;
    try {
      logger.info('Starting Facebook Marketplace scraping...');
      
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent(SCRAPING.USER_AGENTS[0]);
      await page.setViewport({ width: 1366, height: 768 });

      // Navigate to Facebook Marketplace Bali
      await page.goto('https://www.facebook.com/marketplace/bali/propertyrentals', {
        waitUntil: 'networkidle2',
        timeout: SCRAPING.TIMEOUT
      });

      // Wait for listings to load
      await page.waitForTimeout(5000);

      // Try multiple selectors for marketplace listings
      const selectors = [
        '[data-testid="marketplace-item"]',
        '[data-testid="marketplace-product-item"]',
        'div[role="main"] a[href*="/marketplace/item/"]',
        '.x1lliihq.x6ikm8r.x10wlt62'
      ];

      let listings = [];
      let workingSelector = null;

      for (const selector of selectors) {
        try {
          console.log(`Trying selector: ${selector}`);
          await page.waitForSelector(selector, { timeout: 10000 });
          const items = await page.$$(selector);
          
          if (items.length > 0) {
            workingSelector = selector;
            console.log(`✅ Found ${items.length} items with selector: ${selector}`);
            
            // Extract listing data
            listings = await page.evaluate((sel) => {
              const items = document.querySelectorAll(sel);
              const results = [];
              
              items.forEach((item, index) => {
                if (index >= 20) return; // Limit to 20 items
                
                try {
                  const link = item.href || item.querySelector('a')?.href;
                  const title = item.querySelector('span, div')?.textContent?.trim();
                  const priceElement = item.querySelector('[data-testid="marketplace-price"]') || 
                                     item.querySelector('span:contains("Rp")') ||
                                     item.querySelector('span:contains("$")');
                  const price = priceElement?.textContent?.trim();
                  const location = item.querySelector('[data-testid="marketplace-location"]')?.textContent?.trim();
                  const image = item.querySelector('img')?.src;
                  
                  if (link && title && title.length > 10) {
                    results.push({
                      title,
                      price,
                      location,
                      link,
                      image
                    });
                  }
                } catch (e) {
                  console.log('Error extracting item:', e);
                }
              });
              
              return results;
            }, selector);
            
            break;
          }
        } catch (error) {
          console.log(`❌ Selector ${selector} failed:`, error.message);
          continue;
        }
      }

      if (listings.length === 0) {
        logger.warn('No Facebook Marketplace listings found');
        return [];
      }

      // Process and format listings
      const formattedListings = listings.map(item => {
        const price = validator.extractPrice(item.price || '');
        
        return {
          title: validator.sanitizeText(item.title),
          price: price,
          location: this.extractLocation(item.location || item.title),
          rooms: this.extractRooms(item.title),
          furnished: this.extractFurnished(item.title),
          description: validator.sanitizeText(item.title),
          image_urls: item.image ? [item.image] : [],
          listing_url: item.link,
          source: 'Facebook Marketplace',
          scraped_at: new Date().toISOString()
        };
      }).filter(listing => validator.validateListing(listing).isValid);

      logger.info(`Facebook Marketplace scraped ${formattedListings.length} listings`);
      return formattedListings;

    } catch (error) {
      logger.error('Facebook Marketplace scraping error:', error);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  extractLocation(text) {
    if (!text) return 'Bali';
    
    const locations = [
      'canggu', 'seminyak', 'ubud', 'sanur', 'denpasar',
      'kuta', 'legian', 'jimbaran', 'nusa dua', 'uluwatu'
    ];
    
    const lowerText = text.toLowerCase();
    for (const location of locations) {
      if (lowerText.includes(location)) {
        return location.charAt(0).toUpperCase() + location.slice(1);
      }
    }
    return 'Bali';
  }

  extractRooms(text) {
    if (!text) return 1;
    if (/studio/i.test(text)) return 0;
    
    const match = text.match(/(\d+)\s*(?:bedroom|bed|room|br)/i);
    if (match) {
      const rooms = parseInt(match[1]);
      return rooms >= 0 && rooms <= 10 ? rooms : 1;
    }
    return 1;
  }

  extractFurnished(text) {
    if (!text) return null;
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('furnished')) return true;
    if (lowerText.includes('unfurnished')) return false;
    return null;
  }
}

module.exports = new FacebookMarketplaceScraper();
