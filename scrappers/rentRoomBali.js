const axios = require('axios');
const cheerio = require('cheerio');
const validator = require('../bot/utils/validator');
const logger = require('../bot/utils/logger');
const { SCRAPING } = require('../config/constants');

class RentRoomBaliScraper {
  async scrape() {
    try {
      logger.info('Starting Rent Room Bali scraping...');
      
      const response = await axios.get('https://rentroombali.com/', {
        headers: {
          'User-Agent': SCRAPING.USER_AGENTS[0],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: SCRAPING.TIMEOUT
      });

      const $ = cheerio.load(response.data);
      const listings = [];

      const selectors = [
        '.property-listing',
        '.room-item', 
        '.rental-item',
        '.listing-card',
        '[class*="room"]',
        '[class*="property"]'
      ];

      let itemsFound = false;

      for (const selector of selectors) {
        const items = $(selector);
        
        if (items.length > 0) {
          itemsFound = true;
          logger.info(`Found ${items.length} items using selector: ${selector}`);
          
          items.each((index, element) => {
            if (index >= SCRAPING.MAX_LISTINGS_PER_SOURCE) return false;
            
            try {
              const listing = this.parseListingElement($(element), $);
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

      if (!itemsFound || listings.length === 0) {
        logger.info('Using fallback scraping method');
        const fallbackListings = this.fallbackScrape($);
        listings.push(...fallbackListings);
      }

      const uniqueListings = this.deduplicateListings(listings);
      logger.info(`Rent Room Bali scraped ${uniqueListings.length} unique listings`);
      
      return uniqueListings;

    } catch (error) {
      logger.error('Rent Room Bali scraping error:', error);
      return [];
    }
  }

  parseListingElement($element, $) {
    const title = this.extractTitle($element, $);
    if (!title || title.length < 5) return null;

    const price = this.extractPrice($element, $);
    const location = this.extractLocation($element, $);
    const description = this.extractDescription($element, $);
    const link = this.extractLink($element, $);
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
      source: 'Rent Room Bali',
      scraped_at: new Date().toISOString()
    };
  }

  extractTitle($el, $) {
    const selectors = [
      'h1', 'h2', 'h3', 'h4', '.title', '.name', '.heading',
      '.property-title', '.room-title', 'a[title]'
    ];

    for (const selector of selectors) {
      let title = $el.find(selector).first().text().trim();
      if (title && title.length > 5) return title;
      
      // Try title attribute
      title = $el.find(selector).first().attr('title');
      if (title && title.length > 5) return title;
    }

    // Fallback to link text
    const linkText = $el.find('a').first().text().trim();
    return linkText && linkText.length > 5 ? linkText : null;
  }

  extractPrice($el, $) {
    const selectors = [
      '.price', '.cost', '.rent', '.fee', '.amount',
      '.monthly-price', '[class*="price"]'
    ];

    // Try specific selectors first
    for (const selector of selectors) {
      const priceText = $el.find(selector).text().trim();
      if (priceText) {
        const price = this.parsePrice(priceText);
        if (price) return price;
      }
    }

    // Fallback to all element text
    return this.parsePrice($el.text());
  }

  parsePrice(text) {
    if (!text) return null;

    // Clean text
    text = text.replace(/\u00a0/g, ' ').trim();
    
    // USD patterns
    let match = text.match(/(?:\$|USD)\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/i);
    if (match) {
      const price = parseInt(match[1].replace(/[,\.]/g, ''));
      if (price >= 50 && price <= 10000) return price;
    }

    // IDR patterns  
    match = text.match(/(?:Rp|IDR)\s*(\d{1,3}(?:[.,]\d{3})*)/i);
    if (match) {
      const priceStr = match[1].replace(/[.,]/g, '');
      const price = parseInt(priceStr);
      if (price >= 500000 && price <= 500000000) {
        return Math.round(price / 15000); // Convert to USD
      }
    }

    // Juta patterns
    match = text.match(/(\d+(?:\.\d+)?)\s*(?:juta|jt)/i);
    if (match) {
      const amount = parseFloat(match[1]) * 1000000;
      return Math.round(amount / 15000);
    }

    // Large number fallback
    match = text.match(/(\d{4,9})/);
    if (match) {
      const num = parseInt(match[1]);
      if (num > 1000000) return Math.round(num / 15000);
      if (num >= 100 && num <= 5000) return num;
    }

    return null;
  }

  extractLocation($el, $) {
    const selectors = [
      '.location', '.area', '.district', '.address',
      '[class*="location"]', '[class*="area"]'
    ];

    for (const selector of selectors) {
      const location = $el.find(selector).text().trim();
      if (location) return this.normalizeLocation(location);
    }

    // Extract from title if it contains Jimbaran, Canggu, etc.
    const titleText = $el.find('h1, h2, h3, .title').text();
    const locationFromTitle = this.extractLocationFromText(titleText);
    if (locationFromTitle !== 'Bali') return locationFromTitle;

    // Search in all text
    return this.extractLocationFromText($el.text());
  }

  extractLocationFromText(text) {
    const locations = [
      'canggu', 'seminyak', 'ubud', 'sanur', 'denpasar', 
      'kuta', 'legian', 'jimbaran', 'nusa dua', 'uluwatu',
      'berawa', 'echo beach', 'batu bolong', 'pererenan'
    ];

    const lowerText = text.toLowerCase();
    for (const location of locations) {
      if (lowerText.includes(location)) {
        return location.charAt(0).toUpperCase() + location.slice(1);
      }
    }
    return 'Bali';
  }

  extractDescription($el, $) {
    const selectors = [
      '.description', '.details', '.summary', '.excerpt',
      '.content', '.info', 'p'
    ];

    for (const selector of selectors) {
      const desc = $el.find(selector).text().trim();
      if (desc && desc.length > 20 && desc.length < 1000) return desc;
    }

    const allText = $el.text().trim();
    return allText.length > 500 ? allText.substring(0, 500) + '...' : allText;
  }

  extractLink($el, $) {
    let link = $el.find('a').first().attr('href');
    if (!link && $el.is('a')) link = $el.attr('href');
    if (!link) link = $el.closest('a').attr('href');
    return link;
  }

  extractImages($el, $) {
    const images = [];
    $el.find('img').each((i, img) => {
      if (i >= 3) return false;
      
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

    const patterns = [
      /(\d+)\s*(?:bedroom|bed|room|br|kamar)/i,
      /(?:bedroom|bed|room|br|kamar)\s*(\d+)/i
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
    
    if (lowerText.includes('fully furnished') || 
        lowerText.includes('furnished') ||
        lowerText.includes('lengkap')) return true;
    
    if (lowerText.includes('unfurnished') || 
        lowerText.includes('not furnished') ||
        lowerText.includes('kosong')) return false;
    
    return null;
  }

  normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https://rentroombali.com' + url;
    return 'https://rentroombali.com/' + url;
  }

  normalizeLocation(location) {
    if (!location) return 'Bali';
    return location
      .replace(/[,\-\(\)]/g, ' ')
      .split(' ')
      .filter(word => word.length > 2)[0] || 'Bali';
  }

  isValidImage(url) {
    if (!url) return false;
    const invalidPatterns = ['placeholder', 'loading', 'spinner', 'blank', 'data:image'];
    return !invalidPatterns.some(pattern => url.toLowerCase().includes(pattern));
  }

  fallbackScrape($) {
    const listings = [];
    $('a').each((i, link) => {
      if (i > 50) return false;
      
      const $link = $(link);
      const href = $link.attr('href');
      const text = $link.text().trim();
      
      if (href && text.length > 10 && /room|rent|kost|villa|house|apartment/i.test(text)) {
        listings.push({
          title: validator.sanitizeText(text.substring(0, 100)),
          price: this.parsePrice(text),
          location: this.extractLocationFromText(text),
          rooms: this.extractRooms(text),
          furnished: this.extractFurnished(text),
          description: validator.sanitizeText(text),
          image_urls: [],
          listing_url: this.normalizeUrl(href),
          source: 'Rent Room Bali',
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

module.exports = new RentRoomBaliScraper();
