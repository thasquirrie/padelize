import winston from "winston";
import fs from "fs";
import appRoot from "app-root-path";
import keys from "./key.js";

const {
  combine,
  label: winstonLabel,
  timestamp,
  colorize,
  printf,
} = winston.format;

const getLogToProcess = (fileOpt, consoleOpt) => {
  const array = [];
  array.push(
    new winston.transports.File(fileOpt),
    new winston.transports.Console(consoleOpt)
  );
  return array;
};

/**
 * Creates a new instance of the Logger.
 * @param { Object } options - contains configuration parameters.
 * @param { String } options.logDirPath - Path to the log folder,
 * the default directory is logs (optional).
 * @param { Boolean } options.debugMode - If true turns on the debugging mode, default is true.
 * @param { String } options.label - A name used to describe the context of the log generated.
 * @returns { Logger } - An instance of logger.
//  * @constructor Logger
 */
const createLogger = (options) => {
  const logDir = options.logDirPath || `${appRoot}/logs`;
  const label = options.label || "log";
  const commonOptions = {
    console: {
      level: "debug",
      handleExceptions: true,
      format: combine(
        colorize({ all: true }),
        printf(
          (msg) =>
            `[${new Date(msg.timestamp).toUTCString()}]: ${msg.label} : - ${
              msg.level
            }: ${msg.message}`
        )
      ),
    },
    file: {
      level: "debug",
      filename: `${logDir}/app.log`,
      handleExceptions: true,
      maxsize: 5242880,
      maxFiles: 2000,
      format: winston.format.json(),
    },
  };
  const debugMode = !!options.debugMode;
  const environment = keys.NODE_ENV || "development";

  const getTransports = () => {
    const { console, file } = commonOptions;
    let level = debugMode ? "debug" : "info";
    if (environment === "production" && debugMode) level = "error";
    const consoleOpt = { ...console, level };
    const fileOpt = {
      ...file,
      filename: `${logDir}/app.${environment}.log`,
    };
    return getLogToProcess(fileOpt, consoleOpt);
  };

  const init = () => {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    const logger = winston.createLogger({
      format: combine(
        timestamp(),
        winstonLabel({
          label: label,
        })
      ),
      transports: getTransports(),
      exitOnError: false,
    });
    logger.stream = {
      write(message) {
        logger.info(message);
      },
    };
    return logger;
  };

  return init();
};

// Create and export a default logger instance for app-wide use
const logger = createLogger({
  label: 'padelize-api',
  debugMode: keys.NODE_ENV !== 'production',
});

// Also export the createLogger function for custom logger instances
export { createLogger };
export default logger;
