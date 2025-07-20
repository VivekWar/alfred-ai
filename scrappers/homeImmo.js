const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const validator = require('../bot/utils/validator');
const logger = require('../bot/utils/logger');
const { SCRAPING } = require('../config/constants');

class HomeImmoScraper {
  async scrape() {
    let browser;
    try {
      logger.info('Starting Bali Home Immo scraping...');
      
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent(SCRAPING.USER_AGENTS[0]);
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
      });

      await page.goto('https://bali-home-immo.com/realestate-property/for-rent/villa-house/monthly', {
        waitUntil: 'networkidle2',
        timeout: SCRAPING.TIMEOUT
      });

      const content = await page.content();
      const $ = cheerio.load(content);
      const listings = [];

      const propertySelectors = [
        '.property-item',
        '.property-listing',
        '.listing-item',
        '.property-card',
        '.property',
        '[class*="property"]',
        '.item',
        '.rental-item'
      ];

      let foundItems = false;

      for (const selector of propertySelectors) {
        const items = $(selector);
        if (items.length > 0) {
          foundItems = true;
          logger.info(`Found ${items.length} properties with selector: ${selector}`);

          items.each((i, element) => {
            if (i >= SCRAPING.MAX_LISTINGS_PER_SOURCE) return false;
            
            try {
              const $el = $(element);
              const listing = this.extractListingData($el, $);
              
              if (listing && validator.validateListing(listing).isValid) {
                listings.push(listing);
              }
            } catch (error) {
              logger.warn('Error extracting listing data:', error.message);
            }
          });
          
          break;
        }
      }

      if (!foundItems || listings.length === 0) {
        logger.info('No structured listings found, trying fallback method');
        const fallbackListings = this.fallbackScraping($);
        listings.push(...fallbackListings);
      }

      const uniqueListings = this.deduplicateListings(listings);
      logger.info(`Home Immo scraped ${uniqueListings.length} listings`);
      
      return uniqueListings;

    } catch (error) {
      logger.error('Home Immo scraping error:', error);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  extractListingData($el, $) {
    const title = this.findText($el, [
      'h1', 'h2', 'h3', '.title', '.property-title', '.listing-title',
      '.name', '.property-name', 'a[title]'
    ]);

    const priceText = this.findText($el, [
      '.price', '.cost', '.rent', '.amount', '.monthly-price',
      '[class*="price"]', '[class*="cost"]'
    ]);

    const description = this.findText($el, [
      '.description', '.summary', '.details', '.excerpt',
      '.property-description', 'p'
    ]);

    const location = this.findText($el, [
      '.location', '.area', '.address', '.region',
      '[class*="location"]', '[class*="area"]'
    ]);

    const link = $el.find('a').first().attr('href') ||
                 $el.closest('a').attr('href');

    const images = this.extractImages($el, $);

    if (!title || !link) return null;

    return {
      title: validator.sanitizeText(title),
      price: this.extractPrice(priceText || title + ' ' + description),
      location: this.normalizeLocation(location) || 'Bali',
      rooms: this.extractRooms(title + ' ' + description),
      furnished: this.extractFurnished(title + ' ' + description),
      description: validator.sanitizeText(description || title),
      image_urls: images.slice(0, 3),
      listing_url: this.normalizeUrl(link),
      source: 'Bali Home Immo',
      scraped_at: new Date().toISOString()
    };
  }

  findText($el, selectors) {
    for (const selector of selectors) {
      const text = $el.find(selector).first().text().trim();
      if (text && text.length > 2) return text;
      
      const title = $el.find(selector).first().attr('title');
      if (title && title.length > 2) return title;
    }
    return '';
  }

  extractPrice(text) {
    if (!text) return null;

    // USD price patterns
    const usdMatches = [
      /\$\s*(\d{1,3}(?:,\d{3})*)/g,
      /(\d+)\s*USD/gi,
      /USD\s*(\d+)/gi
    ];

    for (const pattern of usdMatches) {
      const match = text.match(pattern);
      if (match) {
        const price = parseInt(match[0].replace(/[^\d]/g, ''));
        if (price > 50 && price < 20000) return price;
      }
    }

    // IDR price patterns
    const idrMatches = [
      /(?:Rp|IDR)\s*(\d{1,3}(?:[.,]\d{3})*)/gi,
      /(\d+(?:[.,]\d{3})*)\s*(?:rupiah|idr)/gi
    ];

    for (const pattern of idrMatches) {
      const match = text.match(pattern);
      if (match) {
        const priceStr = match[0].replace(/[^\d]/g, '');
        const price = parseInt(priceStr);
        
        if (price > 1000000) {
          return Math.round(price / 15000);
        }
      }
    }

    // Generic number extraction
    const numberMatch = text.match(/(\d{3,7})/);
    if (numberMatch) {
      const num = parseInt(numberMatch[1]);
      
      if (num > 500000) {
        return Math.round(num / 15000);
      }
      
      if (num >= 100 && num <= 10000) {
        return num;
      }
    }

    return null;
  }

  extractRooms(text) {
    if (!text) return 1;
    
    const patterns = [
      /(\d+)\s*(?:bedroom|bed|room|br|kamar)/gi,
      /(?:bedroom|bed|room|br|kamar)\s*(\d+)/gi
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const rooms = parseInt(match[0].replace(/\D/g, ''));
        if (rooms >= 0 && rooms <= 10) return rooms;
      }
    }

    if (/studio/gi.test(text)) return 0;
    return 1;
  }

  extractFurnished(text) {
    if (!text) return null;
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('fully furnished') || lowerText.includes('furnished')) {
      return true;
    }
    
    if (lowerText.includes('unfurnished') || lowerText.includes('not furnished')) {
      return false;
    }
    
    return null;
  }

  normalizeLocation(location) {
    if (!location) return 'Bali';
    
    location = location.replace(/[,\-\(\)]/g, ' ').trim();
    const words = location.split(' ').filter(word => word.length > 2);
    return words[0] || 'Bali';
  }

  normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https://bali-home-immo.com' + url;
    return 'https://bali-home-immo.com/' + url;
  }

  extractImages($el, $) {
    const images = [];
    $el.find('img').each((i, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy');
      if (src && this.isValidImage(src)) {
        images.push(this.normalizeUrl(src));
      }
    });
    return images;
  }

  isValidImage(src) {
    if (!src) return false;
    const invalidPatterns = ['placeholder', 'loading', 'spinner', 'blank', 'data:image', 'base64'];
    const lowerSrc = src.toLowerCase();
    return !invalidPatterns.some(pattern => lowerSrc.includes(pattern));
  }

  fallbackScraping($) {
    const listings = [];
    $('a').each((i, link) => {
      if (i > 50) return false;
      
      const $link = $(link);
      const href = $link.attr('href');
      const text = $link.text().trim();
      
      if (href && text.length > 10) {
        const isProperty = /villa|house|apartment|room|rent|property/gi.test(text);
        
        if (isProperty) {
          listings.push({
            title: validator.sanitizeText(text.substring(0, 100)),
            price: this.extractPrice(text),
            location: this.extractLocationFromText(text) || 'Bali',
            rooms: this.extractRooms(text),
            furnished: this.extractFurnished(text),
            description: validator.sanitizeText(text),
            image_urls: [],
            listing_url: this.normalizeUrl(href),
            source: 'Bali Home Immo',
            scraped_at: new Date().toISOString()
          });
        }
      }
    });
    
    return listings.slice(0, 10);
  }

  extractLocationFromText(text) {
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
    return null;
  }

  deduplicateListings(listings) {
    const seen = new Set();
    return listings.filter(listing => {
      if (seen.has(listing.listing_url)) return false;
      seen.add(listing.listing_url);
      return true;
    });
  }
}

module.exports = new HomeImmoScraper();
