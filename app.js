import express, { json, urlencoded } from 'express';
import cors from 'cors';
import createLogger from './src/config/logger.js';
import morgan from 'morgan';
import helmet from 'helmet';
import errorHandler from './src/controllers/errorController.js';
import AppError from './src/utils/appError.js';
import passport from 'passport';
import session from 'express-session';

const corsOptions = {
  origin: '*',
  methods: 'GET, HEAD, PUT, PATCH, POST, DELETE',
  optionsSuccessfulStatus: 204,
};

const app = express();

global.createLogger = createLogger({ label: 'Padelize' });

app.use(helmet());
app.use(cors(corsOptions));
// app.use(json());

app.post(
  '/api/v1/stripe_webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);
app.use(json());

app.use(urlencoded({ extended: true }));
app.use(morgan('combined', { stream: createLogger.stream }));

app.use((req, res, next) => {
  console.log('Body:', req.body);
  next();
});

import { stripeWebhook } from './src/services/subscriptionService.js';
import authRouter from './src/routes/authRoutes.js';
import userRouter from './src/routes/userRoutes.js';
import subscriptionRouter from './src/routes/subscriptionRoutes.js';
import matchRouter from './src/routes/matchRoutes.js';
import followRouter from './src/routes/followRoutes.js';
import postRouter from './src/routes/postRoutes.js';
import replyRouter from './src/routes/replyRoutes.js';
import analysisRouter from './src/routes/analysisRoutes.js';
import firebaseRouter from './src/routes/firebaseRoutes.js';
import notificationRouter from './src/routes/notificationRoutes.js';
import leaderboardRouter from './src/routes/leaderboardRoutes.js';
import webhookLogRouter from './src/routes/webhookLogRoutes.js';
import coachingAnalysisRouter from './src/routes/coachingAnalysisRoutes.js';
import multipartUploadRouter from './src/routes/multipartUploadRoutes.js';

app.use(
  session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use('/upload', (req, res, next) => {
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  next();
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);
app.use('/api/v1/matches', matchRouter);
app.use('/api/v1/follow', followRouter);
app.use('/api/v1/posts', postRouter);
app.use('/api/v1/replies', replyRouter);
app.use('/api/v1/analysis', analysisRouter);
app.use('/api/v1/token', firebaseRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/leaderboard', leaderboardRouter);
app.use('/api/v1/webhook-logs', webhookLogRouter);
app.use('/api/v1/coaching-analysis', coachingAnalysisRouter);
app.use('/api/v1/multipart-upload', multipartUploadRouter);

app.get('/', (req, res, next) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to Padelize API',
  });
});

app.all('*', (req, res, next) => {
  next(
    new AppError(
      `The requested page: ${req.originalUrl} using the method: ${req.method} not found on this server`,
      404
    )
  );
});

app.use(errorHandler);

export default app;
