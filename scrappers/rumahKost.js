const axios = require('axios');
const cheerio = require('cheerio');

class RumahKostScraper {
  async scrape() {
    try {
      const response = await axios.get('https://rumahkostbali.com/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const listings = [];

      // Adjust selectors based on actual website structure
      $('.property-item, .listing-item, .room-item').each((i, element) => {
        try {
          const $el = $(element);
          
          const title = $el.find('.title, h3, h2').text().trim();
          const priceText = $el.find('.price, .cost, .rent').text().trim();
          const location = $el.find('.location, .area').text().trim();
          const description = $el.find('.description, .details').text().trim();
          const link = $el.find('a').attr('href');
          const image = $el.find('img').attr('src');

          if (title && link) {
            listings.push({
              title: title,
              price: this.extractPrice(priceText),
              location: location || 'Bali',
              rooms: this.extractRooms(title + ' ' + description),
              furnished: this.extractFurnished(title + ' ' + description),
              description: description.substring(0, 500),
              image_urls: image ? [image] : [],
              listing_url: link.startsWith('http') ? link : 'https://rumahkostbali.com' + link,
              source: 'Rumah Kost Bali'
            });
          }
        } catch (error) {
          console.warn('Error parsing listing:', error);
        }
      });

      return listings.slice(0, 20);
    } catch (error) {
      console.error('Rumah Kost scraping error:', error);
      throw error;
    }
  }

  extractPrice(text) {
    const priceMatch = text.match(/[\d,]+/);
    return priceMatch ? parseInt(priceMatch[0].replace(/,/g, '')) : null;
  }

  extractRooms(text) {
    const roomMatch = text.match(/(\d+)\s*(room|bedroom|kamar)/i);
    return roomMatch ? parseInt(roomMatch[1]) : 1;
  }

  extractFurnished(text) {
    const furnished = /furnished|lengkap/i.test(text);
    const unfurnished = /unfurnished|kosong/i.test(text);
    return furnished ? true : unfurnished ? false : null;
  }
}

module.exports = new RumahKostScraper();
