const bot = require('./bot/bot');
const { runAllScrapers } = require('./scrapers');
const cron = require('node-cron');
const logger = require('./bot/utils/logger');
const dailyDigest = require('./services/dailyDigest');
require('dotenv').config();

async function startApplication() {
  try {
    logger.info('🚀 Starting Alfred.ai application...');

    // Start the Telegram bot
    if (process.env.NODE_ENV === 'production') {
      // Production: Use polling
      await bot.launch();
      logger.info('✅ Bot launched in production mode (polling)');
    } else {
      // Development: Use webhook (requires ngrok)
      const express = require('express');
      const app = express();
      const PORT = process.env.PORT || 3000;

      app.use(express.json());
      
      app.get('/', (req, res) => {
        res.json({ 
          status: 'Alfred.ai Bot Running',
          timestamp: new Date().toISOString(),
          mode: 'development'
        });
      });

      app.post('/webhook', (req, res) => {
        logger.info('📨 Webhook received', req.body);
        bot.handleUpdate(req.body);
        res.sendStatus(200);
      });

      app.listen(PORT, () => {
        logger.info(`🌐 Server running on port ${PORT} - Ready for ngrok!`);
      });
    }

    // Schedule daily scraping and digest
    if (process.env.CRON_TIME) {
      cron.schedule(process.env.CRON_TIME, async () => {
        logger.info('⏰ Starting scheduled scraping and digest...');
        try {
          await runAllScrapers();
          await dailyDigest.sendToAllUsers();
          logger.info('✅ Daily process completed successfully');
        } catch (error) {
          logger.error('❌ Daily process failed', error);
        }
      });
      
      logger.info(`📅 Daily scraping scheduled at: ${process.env.CRON_TIME}`);
    }

    // Graceful shutdown
    process.once('SIGINT', () => {
      logger.info('🛑 Received SIGINT, shutting down gracefully...');
      bot.stop('SIGINT');
      process.exit(0);
    });

    process.once('SIGTERM', () => {
      logger.info('🛑 Received SIGTERM, shutting down gracefully...');
      bot.stop('SIGTERM');
      process.exit(0);
    });

  } catch (error) {
    logger.error('💥 Failed to start application', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startApplication();
