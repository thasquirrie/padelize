import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import User from '../models/User.js';
import { findUserById } from '../factory/userRepo.js';
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

/**
 * Flexible authentication middleware that accepts EITHER:
 * 1. API Key (X-API-Key header) - for service-to-service calls
 * 2. JWT Token (Bearer token) - for frontend/user calls
 * 
 * This allows both external services and authenticated users to access the endpoint
 */
export const authenticateApiKeyOrJWT = catchAsync(async (req, res, next) => {
  // Check for API key first
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey) {
    // Validate API key
    const validApiKey = process.env.API_KEY || process.env.PADELIZE_API_KEY;
    
    if (!validApiKey) {
      return next(
        new AppError('API key validation not configured on server', 500)
      );
    }
    
    if (apiKey === validApiKey) {
      // API key is valid, proceed without user context
      return next();
    }
    
    // API key provided but invalid
    return next(new AppError('Invalid API key', 403));
  }
  
  // No API key, check for JWT token
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  if (!token) {
    return next(
      new AppError('Authentication required. Provide either X-API-Key or Bearer token', 401)
    );
  }
  
  // Verify JWT token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  
  // Check if user still exists
  const currentUser = await findUserById(User, decoded.id);
  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token does no longer exist', 401)
    );
  }
  
  // Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again', 401)
    );
  }
  
  // JWT is valid, attach user to request
  req.user = currentUser;
  next();
});
