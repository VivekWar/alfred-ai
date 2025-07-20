const axios = require('axios');
const cheerio = require('cheerio');
const validator = require('../bot/utils/validator');
const logger = require('../bot/utils/logger');
const { SCRAPING } = require('../config/constants');

class RumahKostScraper {
  async scrape() {
    try {
      logger.info('Starting Rumah Kost scraping...');
      
      const response = await axios.get('https://rumahkost.com/cari/bali', {
        headers: {
          'User-Agent': SCRAPING.USER_AGENTS[0],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id,en;q=0.9',
        },
        timeout: SCRAPING.TIMEOUT
      });

      const $ = cheerio.load(response.data);
      const listings = [];

      const selectors = [
        '.property-item',
        '.kost-item',
        '.listing-item',
        '.item-kost',
        '[data-kost-id]',
        '.box-kost'
      ];

      let foundItems = false;

      for (const selector of selectors) {
        const items = $(selector);
        
        if (items.length > 0) {
          foundItems = true;
          logger.info(`Found ${items.length} items using selector: ${selector}`);
          
          items.each((index, element) => {
            if (index >= SCRAPING.MAX_LISTINGS_PER_SOURCE) return false;
            
            try {
              const listing = this.extractListing($(element), $);
              if (listing && validator.validateListing(listing).isValid) {
                listings.push(listing);
              }
            } catch (error) {
              logger.warn(`Error parsing listing ${index}:`, error.message);
            }
          });
          
          if (listings.length > 0) break;
        }
      }

      if (!foundItems) {
        logger.info('No structured listings found, trying fallback method');
        const fallbackListings = this.fallbackScrape($);
        listings.push(...fallbackListings);
      }

      const uniqueListings = this.deduplicateListings(listings);
      logger.info(`Rumah Kost scraped ${uniqueListings.length} unique listings`);
      
      return uniqueListings;

    } catch (error) {
      logger.error('Rumah Kost scraping error:', error);
      return [];
    }
  }

  extractListing($element, $) {
    const title = this.extractText($element, [
      'h1', 'h2', 'h3', '.title', '.kost-title', '.nama-kost'
    ]);

    if (!title || title.length < 10) return null;

    const priceText = this.extractText($element, [
      '.price', '.harga', '.cost', '.monthly-price'
    ]);
    
    const price = this.parsePrice(priceText || $element.text());

    const location = this.extractText($element, [
      '.location', '.alamat', '.area', '.lokasi'
    ]) || this.extractLocationFromText($element.text());

    const description = this.extractText($element, [
      '.description', '.desc', '.detail', 'p'
    ]);

    const link = $element.find('a').first().attr('href') || 
                 $element.closest('a').attr('href');

    const images = this.extractImages($element, $);

    if (!link) return null;

    return {
      title: validator.sanitizeText(title),
      price: price,
      location: location || 'Bali',
      rooms: this.extractRooms(title + ' ' + description),
      furnished: this.extractFurnished(title + ' ' + description),
      description: validator.sanitizeText(description || title),
      image_urls: images,
      listing_url: this.normalizeUrl(link),
      source: 'Rumah Kost',
      scraped_at: new Date().toISOString()
    };
  }

  extractText($el, selectors) {
    for (const selector of selectors) {
      const text = $el.find(selector).first().text().trim();
      if (text && text.length > 2) return text;
    }
    return null;
  }

  parsePrice(text) {
    if (!text) return null;

    // IDR patterns for Indonesian sites
    const idrMatch = text.match(/(?:Rp|IDR)\s*(\d{1,3}(?:[.,]\d{3})*)/i);
    if (idrMatch) {
      const priceStr = idrMatch[1].replace(/[.,]/g, '');
      const price = parseInt(priceStr);
      if (price >= 500000 && price <= 50000000) {
        return Math.round(price / 15000); // Convert to USD
      }
    }

    // Juta patterns
    const jutaMatch = text.match(/(\d+(?:\.\d+)?)\s*jt/i);
    if (jutaMatch) {
      const amount = parseFloat(jutaMatch[1]) * 1000000;
      return Math.round(amount / 15000);
    }

    // USD patterns
    const usdMatch = text.match(/(?:\$|USD)\s*(\d{1,4})/i);
    if (usdMatch) {
      const price = parseInt(usdMatch[1]);
      if (price >= 50 && price <= 2000) return price;
    }

    return null;
  }

  extractImages($el, $) {
    const images = [];
    $el.find('img').each((i, img) => {
      if (i >= 3) return false;
      
      const $img = $(img);
      const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy');
      
      if (src && this.isValidImage(src)) {
        images.push(this.normalizeUrl(src));
      }
    });
    return images;
  }

  extractRooms(text) {
    if (!text) return 1;
    if (/studio/i.test(text)) return 0;
    
    const patterns = [
      /(\d+)\s*(?:kamar|room|bedroom|bed)/i,
      /(?:kamar|room|bedroom|bed)\s*(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const rooms = parseInt(match[1] || match[2]);
        if (rooms >= 0 && rooms <= 10) return rooms;
      }
    }
    return 1;
  }

  extractFurnished(text) {
    if (!text) return null;
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('furnished') || lowerText.includes('lengkap')) return true;
    if (lowerText.includes('unfurnished') || lowerText.includes('kosong')) return false;
    return null;
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
    return 'Bali';
  }

  normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https://rumahkost.com' + url;
    return 'https://rumahkost.com/' + url;
  }

  isValidImage(src) {
    if (!src || src.includes('data:image')) return false;
    const invalidPatterns = ['placeholder', 'loading', 'spinner', 'blank'];
    return !invalidPatterns.some(pattern => src.toLowerCase().includes(pattern));
  }

  fallbackScrape($) {
    const listings = [];
    $('a').each((i, link) => {
      if (i > 30) return false;
      
      const $link = $(link);
      const href = $link.attr('href');
      const text = $link.text().trim();
      
      if (href && text.length > 15 && /kost|room|kamar|sewa/i.test(text)) {
        listings.push({
          title: validator.sanitizeText(text.substring(0, 100)),
          price: this.parsePrice(text),
          location: this.extractLocationFromText(text),
          rooms: this.extractRooms(text),
          furnished: this.extractFurnished(text),
          description: validator.sanitizeText(text),
          image_urls: [],
          listing_url: this.normalizeUrl(href),
          source: 'Rumah Kost',
          scraped_at: new Date().toISOString()
        });
      }
    });
    return listings.slice(0, 10);
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

module.exports = new RumahKostScraper();
