const axios = require('axios');
const cheerio = require('cheerio');
const validator = require('../bot/utils/validator');
const logger = require('../bot/utils/logger');
const { SCRAPING } = require('../config/constants');

class VillaHubScraper {
  async scrape() {
    try {
      logger.info('Starting Villa Hub scraping...');
      
      const response = await axios.get('https://www.villahubbali.com/monthly-rentals', {
        headers: {
          'User-Agent': SCRAPING.USER_AGENTS[0],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        timeout: SCRAPING.TIMEOUT
      });

      const $ = cheerio.load(response.data);
      const listings = [];

      const propertySelectors = [
        '.property-item',
        '.villa-card',
        '.listing-item',
        '.property-card',
        '[data-property-id]'
      ];

      let foundItems = false;

      for (const selector of propertySelectors) {
        const items = $(selector);
        if (items.length > 0) {
          foundItems = true;
          logger.info(`Found ${items.length} items with selector: ${selector}`);

          items.each((i, element) => {
            if (i >= SCRAPING.MAX_LISTINGS_PER_SOURCE) return false;
            
            try {
              const $el = $(element);
              const listing = this.extractListingData($el, $);
              
              if (listing && validator.validateListing(listing).isValid) {
                listings.push(listing);
              }
            } catch (error) {
              logger.warn(`Error extracting listing ${i}:`, error.message);
            }
          });
          
          break;
        }
      }

      if (!foundItems) {
        logger.warn('No structured listings found, trying fallback method');
        const fallbackListings = this.fallbackScraping($);
        listings.push(...fallbackListings);
      }

      const uniqueListings = this.deduplicateListings(listings);
      logger.info(`Villa Hub scraped ${uniqueListings.length} unique listings`);
      
      return uniqueListings;

    } catch (error) {
      logger.error('Villa Hub scraping error:', error);
      return [];
    }
  }

  extractListingData($el, $) {
    const title = this.extractText($el, [
      'h1', 'h2', 'h3', '.title', '.property-title', '.villa-title'
    ]);

    const priceText = this.extractText($el, [
      '.price', '.cost', '.rent', '.monthly-price', '[class*="price"]'
    ]);
    
    const price = validator.extractPrice(priceText || $el.text());

    const location = this.extractText($el, [
      '.location', '.area', '.address', '[class*="location"]'
    ]) || this.extractLocationFromText($el.text());

    const description = this.extractText($el, [
      '.description', '.details', '.summary', 'p'
    ]);

    const link = $el.find('a').first().attr('href') || 
                 $el.closest('a').attr('href');

    const images = this.extractImages($el, $);

    if (!title || !link) return null;

    return {
      title: validator.sanitizeText(title),
      price: price,
      location: location || 'Bali',
      rooms: this.extractRooms(title + ' ' + description),
      furnished: this.extractFurnished(title + ' ' + description),
      description: validator.sanitizeText(description || title),
      image_urls: images,
      listing_url: this.normalizeUrl(link),
      source: 'Villa Hub Bali',
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

  extractImages($el, $) {
    const images = [];
    $el.find('img').each((i, img) => {
      if (i >= 3) return false; // Max 3 images
      
      const $img = $(img);
      const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
      
      if (src && this.isValidImage(src)) {
        images.push(this.normalizeUrl(src));
      }
    });
    return images;
  }

  extractRooms(text) {
    if (!text) return 1;
    
    if (/studio/i.test(text)) return 0;
    
    const roomPatterns = [
      /(\d+)\s*(?:bedroom|bed|room|br)/i,
      /(?:bedroom|bed|room|br)\s*(\d+)/i
    ];

    for (const pattern of roomPatterns) {
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
    
    if (lowerText.includes('fully furnished') || lowerText.includes('furnished')) {
      return true;
    }
    if (lowerText.includes('unfurnished')) {
      return false;
    }
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
    if (url.startsWith('/')) return 'https://www.villahubbali.com' + url;
    return 'https://www.villahubbali.com/' + url;
  }

  isValidImage(src) {
    if (!src || src.includes('data:image')) return false;
    const invalidPatterns = ['placeholder', 'loading', 'spinner', 'blank'];
    return !invalidPatterns.some(pattern => src.toLowerCase().includes(pattern));
  }

  fallbackScraping($) {
    const listings = [];
    $('a').each((i, link) => {
      if (i > 20) return false;
      
      const $link = $(link);
      const href = $link.attr('href');
      const text = $link.text().trim();
      
      if (href && text.length > 10 && /villa|house|rental/i.test(text)) {
        listings.push({
          title: validator.sanitizeText(text.substring(0, 100)),
          price: validator.extractPrice(text),
          location: this.extractLocationFromText(text),
          rooms: this.extractRooms(text),
          furnished: this.extractFurnished(text),
          description: validator.sanitizeText(text),
          image_urls: [],
          listing_url: this.normalizeUrl(href),
          source: 'Villa Hub Bali',
          scraped_at: new Date().toISOString()
        });
      }
    });
    return listings.slice(0, 10);
  }

  deduplicateListings(listings) {
    const seen = new Set();
    return listings.filter(listing => {
      const url = listing.listing_url;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }
}

module.exports = new VillaHubScraper();
