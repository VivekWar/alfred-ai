const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(data && { data })
    };

    // Console output with colors
    const colors = {
      ERROR: '\x1b[31m',   // Red
      WARN: '\x1b[33m',    // Yellow
      INFO: '\x1b[36m',    // Cyan
      DEBUG: '\x1b[90m',   // Gray
      RESET: '\x1b[0m'     // Reset
    };

    const color = colors[level.toUpperCase()] || colors.INFO;
    console.log(
      `${color}[${timestamp}] ${level.toUpperCase()}: ${message}${colors.RESET}`,
      data ? JSON.stringify(data, null, 2) : ''
    );

    // File output
    try {
      const logFile = path.join(this.logDir, `${level.toLowerCase()}.log`);
      const allLogFile = path.join(this.logDir, 'all.log');
      
      const logLine = JSON.stringify(logEntry) + '\n';
      
      // Write to specific level file
      fs.appendFileSync(logFile, logLine);
      
      // Write to all.log
      fs.appendFileSync(allLogFile, logLine);
      
      // Rotate logs if they get too large (> 10MB)
      this.rotateLogs(logFile);
      
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  rotateLogs(logFile) {
    try {
      const stats = fs.statSync(logFile);
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (stats.size > maxSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = `${logFile}.${timestamp}`;
        
        fs.renameSync(logFile, rotatedFile);
        
        // Keep only last 5 rotated files
        this.cleanupOldLogs(path.dirname(logFile), path.basename(logFile));
      }
    } catch (error) {
      // Ignore rotation errors
    }
  }

  cleanupOldLogs(logDir, baseFileName) {
    try {
      const files = fs.readdirSync(logDir)
        .filter(file => file.startsWith(baseFileName + '.'))
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
          mtime: fs.statSync(path.join(logDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);
      
      // Keep only 5 most recent
      if (files.length > 5) {
        files.slice(5).forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  error(message, data = null) { 
    this.log('error', message, data); 
  }
  
  warn(message, data = null) { 
    this.log('warn', message, data); 
  }
  
  info(message, data = null) { 
    this.log('info', message, data); 
  }
  
  debug(message, data = null) { 
    this.log('debug', message, data); 
  }

  // Specific logging methods for the bot
  botMessage(telegramId, message) {
    this.info(`Bot message sent to ${telegramId}`, { message: message.substring(0, 100) });
  }

  scrapingResult(source, count) {
    this.info(`Scraping completed: ${source}`, { listings_count: count });
  }

  userAction(telegramId, action, details = null) {
    this.info(`User action: ${action}`, { telegram_id: telegramId, details });
  }

  databaseOperation(operation, table, details = null) {
    this.debug(`Database operation: ${operation} on ${table}`, details);
  }
}

module.exports = new Logger();
