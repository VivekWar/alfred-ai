const axios = require('axios');
const cheerio = require('cheerio');
const validator = require('../bot/utils/validator');
const logger = require('../bot/utils/logger');

class RentRoomBaliScraper {
  async scrape() {
    try {
      logger.info('Starting RentRoomBali scraping...');
      
      const response = await axios.get('https://rentroombali.com/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      const listings = [];

      // Multiple selector strategies for different site layouts
      const selectors = [
        '.property-listing',
        '.room-item',
        '.rental-item',
        '.listing-card',
        '.property-card',
        '.room-card',
        '[class*="room"]',
        '[class*="rental"]',
        '[class*="property"]',
        '.item',
        'article'
      ];

      let itemsFound = false;

      // Try each selector until we find listings
      for (const selector of selectors) {
        const items = $(selector);
        
        if (items.length > 0) {
          itemsFound = true;
          logger.info(`Found ${items.length} items using selector: ${selector}`);
          
          items.each((index, element) => {
            if (index >= 25) return false; // Limit processing
            
            try {
              const listing = this.parseListingElement($(element), $);
              if (listing && this.validateListing(listing)) {
                listings.push(listing);
              }
            } catch (error) {
              logger.warn(`Error parsing listing ${index}:`, error.message);
            }
          });
          
          if (listings.length > 0) break; // Use first working selector with results
        }
      }

      // Fallback: search for individual room/rental links
      if (!itemsFound || listings.length === 0) {
        logger.info('Using fallback scraping method');
        const fallbackListings = this.fallbackScrape($);
        listings.push(...fallbackListings);
      }

      // Deduplicate by URL
      const uniqueListings = this.deduplicateListings(listings);
      
      logger.info(`RentRoomBali scraped ${uniqueListings.length} unique listings`);
      return uniqueListings.slice(0, 20);

    } catch (error) {
      logger.error('RentRoomBali scraping error:', error.message);
      
      // Return mock data for development
      if (process.env.NODE_ENV === 'development') {
        return this.getMockListings();
      }
      
      throw error;
    }
  }

  parseListingElement($element, $) {
    // Extract title
    const title = this.extractTitle($element);
    if (!title || title.length < 5) return null;

    // Extract other fields
    const price = this.extractPrice($element);
    const location = this.extractLocation($element);
    const description = this.extractDescription($element);
    const link = this.extractLink($element);
    const images = this.extractImages($element);

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
      source: 'RentRoomBali'
    };
  }

  extractTitle($el) {
    const titleSelectors = [
      'h1', 'h2', 'h3', 'h4',
      '.title', '.name', '.heading',
      '.property-title', '.room-title', '.listing-title',
      'a[title]', '[title]'
    ];

    for (const selector of titleSelectors) {
      // Try text content first
      let title = $el.find(selector).first().text().trim();
      if (title && title.length > 5) {
        return title;
      }
      
      // Try title attribute
      title = $el.find(selector).first().attr('title');
      if (title && title.length > 5) {
        return title;
      }
    }

    // Fallback: get title from link text
    const linkText = $el.find('a').first().text().trim();
    if (linkText && linkText.length > 5) {
      return linkText;
    }

    return null;
  }

  extractPrice($el) {
    const priceSelectors = [
      '.price', '.cost', '.rent', '.fee', '.amount',
      '.monthly-price', '.rental-price',
      '[class*="price"]', '[class*="cost"]'
    ];

    // Check specific price elements
    for (const selector of priceSelectors) {
      const priceText = $el.find(selector).text().trim();
      if (priceText) {
        const price = this.parsePrice(priceText);
        if (price) return price;
      }
    }

    // Search all text content for price patterns
    const allText = $el.text();
    return this.parsePrice(allText);
  }

  extractLocation($el) {
    const locationSelectors = [
      '.location', '.area', '.district', '.region', '.address',
      '[class*="location"]', '[class*="area"]'
    ];

    for (const selector of locationSelectors) {
      const location = $el.find(selector).text().trim();
      if (location) {
        return this.normalizeLocation(location);
      }
    }

    // Search for Bali locations in all text
    const allText = $el.text().toLowerCase();
    const baliLocations = [
      'canggu', 'seminyak', 'ubud', 'sanur', 'denpasar', 
      'kuta', 'legian', 'jimbaran', 'nusa dua', 'uluwatu',
      'berawa', 'echo beach', 'batu bolong', 'pererenan'
    ];

    for (const location of baliLocations) {
      if (allText.includes(location)) {
        return location.charAt(0).toUpperCase() + location.slice(1);
      }
    }

    return 'Bali';
  }

  extractDescription($el) {
    const descSelectors = [
      '.description', '.details', '.summary', '.excerpt',
      '.content', '.info', 'p',
      '[class*="description"]', '[class*="detail"]'
    ];

    for (const selector of descSelectors) {
      const desc = $el.find(selector).text().trim();
      if (desc && desc.length > 20 && desc.length < 1000) {
        return desc;
      }
    }

    // Fallback: use all text but limit length
    const allText = $el.text().trim();
    return allText.length > 500 ? allText.substring(0, 500) + '...' : allText;
  }

  extractLink($el) {
    // Try to find the main link
    let link = $el.find('a').first().attr('href');
    
    // If element itself is a link
    if (!link && $el.is('a')) {
      link = $el.attr('href');
    }
    
    // If no direct link, look in parent
    if (!link) {
      link = $el.closest('a').attr('href');
    }

    return link;
  }

  extractImages($el) {
    const images = [];
    
    $el.find('img').each((i, img) => {
      const $img = $(img);
      const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
      
      if (src && this.isValidImageUrl(src)) {
        images.push(this.normalizeUrl(src));
      }
    });

    return images.slice(0, 3);
  }

  parsePrice(text) {
    if (!text) return null;

    // USD patterns
    const usdPatterns = [
      /\$\s*(\d{1,4}(?:,\d{3})*)/,
      /(\d+)\s*USD/i,
      /USD\s*(\d+)/i
    ];

    for (const pattern of usdPatterns) {
      const match = text.match(pattern);
      if (match) {
        const price = parseInt(match[1]?.replace(/,/g, '') || match[0].replace(/[^\d]/g, ''));
        if (price >= 100 && price <= 20000) {
          return price;
        }
      }
    }

    // IDR patterns
    const idrPatterns = [
      /(?:Rp|IDR)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{3})*)/i,
      /(\d+(?:[.,]\d{3})*)\s*(?:rupiah|idr)/i
    ];

    for (const pattern of idrPatterns) {
      const match = text.match(pattern);
      if (match) {
        const priceStr = match[1]?.replace(/[.,]/g, '') || match[0].replace(/[^\d]/g, '');
        const price = parseInt(priceStr);
        
        if (price >= 1000000 && price <= 500000000) {
          return Math.round(price / 15000); // Convert IDR to USD
        }
      }
    }

    return null;
  }

  extractRooms(text) {
    if (!text) return 1;

    // Studio patterns
    if (/studio/i.test(text)) return 0;

    // Room/bedroom patterns
    const roomPatterns = [
      /(\d+)\s*(?:bedroom|bed|room|br|kamar)/i,
      /(?:bedroom|bed|room|br|kamar)\s*(\d+)/i
    ];

    for (const pattern of roomPatterns) {
      const match = text.match(pattern);
      if (match) {
        const rooms = parseInt(match[1] || match[2]);
        if (rooms >= 0 && rooms <= 10) {
          return rooms;
        }
      }
    }

    return 1;
  }

  extractFurnished(text) {
    if (!text) return null;

    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('fully furnished') || 
        lowerText.includes('furnished') ||
        lowerText.includes('lengkap')) {
      return true;
    }
    
    if (lowerText.includes('unfurnished') || 
        lowerText.includes('not furnished') ||
        lowerText.includes('kosong')) {
      return false;
    }
    
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
    
    // Clean up and extract main location
    return location
      .replace(/[,\-\(\)]/g, ' ')
      .split(' ')
      .filter(word => word.length > 2)[0] || 'Bali';
  }

  isValidImageUrl(url) {
    if (!url) return false;
    
    const invalidPatterns = [
      'placeholder', 'loading', 'spinner', 'blank.', 
      'pixel.', '1x1.', 'data:image'
    ];
    
    return !invalidPatterns.some(pattern => url.toLowerCase().includes(pattern));
  }

  validateListing(listing) {
    return listing &&
           listing.title &&
           listing.title.length >= 10 &&
           listing.listing_url &&
           listing.listing_url.includes('http');
  }

  fallbackScrape($) {
    const listings = [];
    
    // Look for any links that might be room/rental related
    $('a').each((i, link) => {
      if (i > 50) return false; // Limit processing
      
      const $link = $(link);
      const href = $link.attr('href');
      const text = $link.text().trim();
      
      if (href && text.length > 10) {
        const isRoomRental = /room|rent|kost|villa|house|apartment/i.test(text);
        
        if (isRoomRental) {
          listings.push({
            title: validator.sanitizeText(text.substring(0, 100)),
            price: this.parsePrice(text),
            location: this.extractLocation($link.parent()) || 'Bali',
            rooms: this.extractRooms(text),
            furnished: this.extractFurnished(text),
            description: validator.sanitizeText(text),
            image_urls: [],
            listing_url: this.normalizeUrl(href),
            source: 'RentRoomBali'
          });
        }
      }
    });
    
    return listings.slice(0, 10);
  }

  deduplicateListings(listings) {
    const seen = new Set();
    return listings.filter(listing => {
      const url = listing.listing_url;
      if (seen.has(url)) {
        return false;
      }
      seen.add(url);
      return true;
    });
  }

  getMockListings() {
    return [
      {
        title: 'Cozy Room in Canggu - Monthly Rent',
        price: 450,
        location: 'Canggu',
        rooms: 1,
        furnished: true,
        description: 'Comfortable room with shared facilities in central Canggu',
        image_urls: [],
        listing_url: 'https://rentroombali.com/mock-1',
        source: 'RentRoomBali'
      },
      {
        title: 'Private Studio near Beach',
        price: 600,
        location: 'Seminyak',
        rooms: 0,
        furnished: true,
        description: 'Private studio apartment with kitchenette, 5 minutes from beach',
        image_urls: [],
        listing_url: 'https://rentroombali.com/mock-2',
        source: 'RentRoomBali'
      }
    ];
  }
}

module.exports = new RentRoomBaliScraper();
