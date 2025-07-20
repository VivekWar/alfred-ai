const axios = require('axios');
const cheerio = require('cheerio');
const validator = require('../bot/utils/validator');
const logger = require('../bot/utils/logger');

class VillaHubScraper {
  async scrape() {
    try {
      logger.info('Starting VillaHub scraping...');
      
      const response = await axios.get(
        'https://www.balivillahub.com/en/category/room-for-monthly-rent',
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          timeout: 15000
        }
      );

      const $ = cheerio.load(response.data);
      const listings = [];

      // Common selectors for property listing sites
      const selectors = [
        '.property-item',
        '.listing-card',
        '.property-card',
        '.villa-item',
        '.rental-item',
        '[class*="property"]',
        '[class*="listing"]'
      ];

      let foundListings = false;

      for (const selector of selectors) {
        const items = $(selector);
        if (items.length > 0) {
          foundListings = true;
          logger.info(`Found ${items.length} items with selector: ${selector}`);

          items.each((i, element) => {
            try {
              const $el = $(element);
              
              const title = this.extractTitle($el);
              const price = this.extractPrice($el);
              const location = this.extractLocation($el);
              const link = this.extractLink($el);
              const images = this.extractImages($el);
              const description = this.extractDescription($el);

              if (title && link) {
                const listing = {
                  title: validator.sanitizeText(title),
                  price: validator.sanitizePrice(price),
                  location: location || 'Bali',
                  rooms: this.extractRooms(title + ' ' + description),
                  furnished: this.extractFurnished(title + ' ' + description),
                  description: validator.sanitizeText(description),
                  image_urls: images,
                  listing_url: this.normalizeUrl(link),
                  source: 'Bali Villa Hub'
                };

                const validation = validator.validateListingData(listing);
                if (validation.valid) {
                  listings.push(listing);
                }
              }
            } catch (error) {
              logger.warn('Error parsing villa hub listing:', error);
            }
          });
          break; // Use first working selector
        }
      }

      if (!foundListings) {
        // Fallback: try to find any links that might be property listings
        const fallbackListings = this.fallbackExtraction($);
        listings.push(...fallbackListings);
      }

      logger.info(`VillaHub scraped ${listings.length} listings`);
      return listings.slice(0, 20);

    } catch (error) {
      logger.error('VillaHub scraping error:', error);
      
      // Return mock data for development if scraping fails
      if (process.env.NODE_ENV === 'development') {
        return this.getMockData();
      }
      
      return [];
    }
  }

  extractTitle($el) {
    const titleSelectors = ['h2', 'h3', '.title', '.property-title', '.listing-title', 'a[title]'];
    
    for (const selector of titleSelectors) {
      const title = $el.find(selector).first().text().trim() || $el.find(selector).first().attr('title');
      if (title && title.length > 5) {
        return title;
      }
    }
    
    return $el.find('a').first().text().trim();
  }

  extractPrice($el) {
    const priceSelectors = ['.price', '.cost', '.rent', '.amount', '[class*="price"]'];
    
    for (const selector of priceSelectors) {
      const priceText = $el.find(selector).text().trim();
      if (priceText) {
        return this.parsePrice(priceText);
      }
    }
    
    // Search in all text for price patterns
    const allText = $el.text();
    return this.parsePrice(allText);
  }

  extractLocation($el) {
    const locationSelectors = ['.location', '.area', '.address', '[class*="location"]'];
    
    for (const selector of locationSelectors) {
      const location = $el.find(selector).text().trim();
      if (location) {
        return this.normalizeLocation(location);
      }
    }
    
    // Look for location in title or description
    const allText = $el.text().toLowerCase();
    const baliAreas = ['canggu', 'seminyak', 'ubud', 'sanur', 'denpasar', 'kuta', 'legian', 'jimbaran', 'uluwatu'];
    
    for (const area of baliAreas) {
      if (allText.includes(area)) {
        return area.charAt(0).toUpperCase() + area.slice(1);
      }
    }
    
    return 'Bali';
  }

  extractLink($el) {
    const link = $el.find('a').first().attr('href');
    return link ? this.normalizeUrl(link) : null;
  }

  extractImages($el) {
    const images = [];
    $el.find('img').each((i, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src');
      if (src && !src.includes('placeholder') && !src.includes('loading')) {
        images.push(this.normalizeUrl(src));
      }
    });
    return images.slice(0, 3);
  }

  extractDescription($el) {
    const descSelectors = ['.description', '.details', '.summary', '.excerpt'];
    
    for (const selector of descSelectors) {
      const desc = $el.find(selector).text().trim();
      if (desc && desc.length > 20) {
        return desc;
      }
    }
    
    return $el.text().trim().substring(0, 300);
  }

  parsePrice(text) {
    // Look for USD prices
    const usdMatch = text.match(/\$\s*[\d,]+/);
    if (usdMatch) {
      return parseInt(usdMatch[0].replace(/[^\d]/g, ''));
    }
    
    // Look for IDR prices and convert
    const idrMatch = text.match(/(?:rp|idr)\s*[\d.,]+(?:\s*(?:juta|jt|million))?/i);
    if (idrMatch) {
      const amount = parseInt(idrMatch[0].replace(/[^\d]/g, ''));
      const isJuta = /juta|jt|million/i.test(idrMatch[0]);
      const finalAmount = isJuta ? amount * 1000000 : amount;
      return Math.round(finalAmount / 15000); // Convert IDR to USD
    }
    
    // Generic number extraction
    const numberMatch = text.match(/[\d,]+/);
    if (numberMatch) {
      const num = parseInt(numberMatch[0].replace(/,/g, ''));
      // If number is very large, assume IDR
      if (num > 1000000) {
        return Math.round(num / 15000);
      }
      // If reasonable USD amount
      if (num > 100 && num < 10000) {
        return num;
      }
    }
    
    return null;
  }

  extractRooms(text) {
    const roomMatch = text.match(/(\d+)\s*(?:bed|bedroom|room|br|kamar)/i);
    return roomMatch ? parseInt(roomMatch[1]) : 1;
  }

  extractFurnished(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('furnished') || lowerText.includes('lengkap')) return true;
    if (lowerText.includes('unfurnished') || lowerText.includes('kosong')) return false;
    return null;
  }

  normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return 'https://www.balivillahub.com' + (url.startsWith('/') ? '' : '/') + url;
  }

  normalizeLocation(location) {
    return location.replace(/[,\-]/g, ' ').split(' ')[0];
  }

  fallbackExtraction($) {
    const listings = [];
    
    // Look for any links that might contain rental information
    $('a').each((i, link) => {
      const $link = $(link);
      const text = $link.text().toLowerCase();
      const href = $link.attr('href');
      
      if (href && (text.includes('villa') || text.includes('rent') || text.includes('room'))) {
        listings.push({
          title: validator.sanitizeText($link.text() || 'Villa Rental'),
          price: null,
          location: 'Bali',
          rooms: 1,
          furnished: null,
          description: validator.sanitizeText($link.text()),
          image_urls: [],
          listing_url: this.normalizeUrl(href),
          source: 'Bali Villa Hub'
        });
      }
    });
    
    return listings.slice(0, 5);
  }

  getMockData() {
    return [
      {
        title: 'Modern Villa in Canggu - Monthly Rental',
        price: 1200,
        location: 'Canggu',
        rooms: 2,
        furnished: true,
        description: 'Beautiful modern villa with pool and garden, perfect for monthly stays',
        image_urls: [],
        listing_url: 'https://www.balivillahub.com/sample-listing-1',
        source: 'Bali Villa Hub'
      },
      {
        title: 'Cozy Studio in Seminyak',
        price: 800,
        location: 'Seminyak',
        rooms: 1,
        furnished: true,
        description: 'Fully furnished studio apartment in central Seminyak location',
        image_urls: [],
        listing_url: 'https://www.balivillahub.com/sample-listing-2',
        source: 'Bali Villa Hub'
      }
    ];
  }
}

module.exports = new VillaHubScraper();
