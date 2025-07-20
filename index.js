require('dotenv').config();
const bot = require('./bot/bot');
const logger = require('./bot/utils/logger');

async function startBot() {
  try {
    logger.info('🚀 Starting Alfred AI V0...');
    
    // Launch bot
    await bot.launch();
    logger.info('✅ Alfred AI V0 is running!');
    
    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
    
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

startBot();
