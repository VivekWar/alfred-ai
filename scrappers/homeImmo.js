const axios = require('axios');
const cheerio = require('cheerio');
const validator = require('../bot/utils/validator');
const logger = require('../bot/utils/logger');

class HomeImmoScraper {
  async scrape() {
    try {
      logger.info('Starting Bali Home Immo scraping...');
      
      const response = await axios.get(
        'https://bali-home-immo.com/realestate-property/for-rent/villa-house/monthly',
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
          },
          timeout: 15000
        }
      );

      const $ = cheerio.load(response.data);
      const listings = [];

      // Try multiple selectors for property listings
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
            try {
              const $el = $(element);
              const listing = this.extractListingData($el, $);
              
              if (listing && this.isValidListing(listing)) {
                listings.push(listing);
              }
            } catch (error) {
              logger.warn('Error extracting listing data:', error);
            }
          });
          
          break; // Use first working selector
        }
      }

      // Fallback scraping if no structured listings found
      if (!foundItems || listings.length === 0) {
        logger.info('No structured listings found, trying fallback method');
        const fallbackListings = this.fallbackScraping($);
        listings.push(...fallbackListings);
      }

      logger.info(`Home Immo scraped ${listings.length} listings`);
      return listings.slice(0, 15);

    } catch (error) {
      logger.error('Home Immo scraping error:', error);
      
      // Return sample data in development
      if (process.env.NODE_ENV === 'development') {
        return this.getSampleData();
      }
      
      return [];
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

    const images = [];
    $el.find('img').each((i, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy');
      if (src && this.isValidImage(src)) {
        images.push(this.normalizeUrl(src));
      }
    });

    if (!title || !link) {
      return null;
    }

    return {
      title: validator.sanitizeText(title),
      price: this.extractPrice(priceText || title + ' ' + description),
      location: this.normalizeLocation(location) || 'Bali',
      rooms: this.extractRooms(title + ' ' + description),
      furnished: this.extractFurnished(title + ' ' + description),
      description: validator.sanitizeText(description || title),
      image_urls: images.slice(0, 3),
      listing_url: this.normalizeUrl(link),
      source: 'Bali Home Immo'
    };
  }

  findText($el, selectors) {
    for (const selector of selectors) {
      const text = $el.find(selector).first().text().trim();
      if (text && text.length > 2) {
        return text;
      }
      
      // Check for title attribute
      const title = $el.find(selector).first().attr('title');
      if (title && title.length > 2) {
        return title;
      }
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
        if (price > 50 && price < 20000) {
          return price;
        }
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
        
        if (price > 1000000) { // Reasonable IDR amount
          return Math.round(price / 15000); // Convert to USD
        }
      }
    }

    // Generic number extraction as fallback
    const numberMatch = text.match(/(\d{3,7})/);
    if (numberMatch) {
      const num = parseInt(numberMatch[1]);
      
      // If it looks like IDR (large number)
      if (num > 500000) {
        return Math.round(num / 15000);
      }
      
      // If it looks like USD
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
        if (rooms >= 0 && rooms <= 10) {
          return rooms;
        }
      }
    }

    // Check for studio
    if (/studio/gi.test(text)) {
      return 0;
    }

    return 1; // Default
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
    
    // Clean up location string
    location = location.replace(/[,\-\(\)]/g, ' ').trim();
    
    // Extract first meaningful location word
    const words = location.split(' ').filter(word => word.length > 2);
    return words[0] || 'Bali';
  }

  normalizeUrl(url) {
    if (!url) return null;
    
    if (url.startsWith('http')) {
      return url;
    }
    
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    
    if (url.startsWith('/')) {
      return 'https://bali-home-immo.com' + url;
    }
    
    return 'https://bali-home-immo.com/' + url;
  }

  isValidImage(src) {
    if (!src) return false;
    
    const invalidPatterns = [
      'placeholder', 'loading', 'spinner', 'blank',
      'data:image', 'base64', '1x1', 'pixel'
    ];
    
    const lowerSrc = src.toLowerCase();
    return !invalidPatterns.some(pattern => lowerSrc.includes(pattern));
  }

  isValidListing(listing) {
    return listing &&
           listing.title &&
           listing.title.length >= 10 &&
           listing.listing_url &&
           validator.isValidUrl(listing.listing_url);
  }

  fallbackScraping($) {
    const listings = [];
    
    // Look for any links that might contain property information
    $('a').each((i, link) => {
      if (i > 50) return false; // Limit processing
      
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
            source: 'Bali Home Immo'
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

  getSampleData() {
    return [
      {
        title: 'Luxury Villa with Pool - Monthly Rental Available',
        price: 1500,
        location: 'Seminyak',
        rooms: 3,
        furnished: true,
        description: 'Beautiful luxury villa with private pool in prime Seminyak location',
        image_urls: [],
        listing_url: 'https://bali-home-immo.com/sample-1',
        source: 'Bali Home Immo'
      },
      {
        title: 'Charming House in Ubud Center',
        price: 900,
        location: 'Ubud',
        rooms: 2,
        furnished: true,
        description: 'Traditional Balinese house in the heart of Ubud with garden views',
        image_urls: [],
        listing_url: 'https://bali-home-immo.com/sample-2',
        source: 'Bali Home Immo'
      }
    ];
  }
}

module.exports = new HomeImmoScraper();
