import AppError from '../utils/appError.js';
import catchAsync from '../utils/catchAsync.js';

/**
 * Middleware to authenticate API key from X-API-Key header
 * Used for service-to-service authentication
 */
export const authenticateApiKey = catchAsync(async (req, res, next) => {
  // Get API key from header
  const apiKey = req.headers['x-api-key'];

  // Check if API key exists
  if (!apiKey) {
    return next(new AppError('API key missing', 401));
  }

  // Validate API key against environment variable
  const validApiKey = process.env.API_KEY || process.env.PADELIZE_API_KEY;

  if (!validApiKey) {
    return next(
      new AppError('API key validation not configured on server', 500)
    );
  }

  if (apiKey !== validApiKey) {
    return next(new AppError('Invalid API key', 403));
  }

  // API key is valid, proceed
  next();
});
