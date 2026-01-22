import fetch from 'node-fetch';

const STREAMING_API_BASE_URL =
  process.env.STREAMING_API_BASE_URL || 'https://streaming.padelize.ai';
const STREAMING_API_KEY = process.env.STREAMING_API_KEY;
const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL || 'https://api.padelize.ai';

/**
 * Service for interacting with streaming.padelize.ai API
 * Handles video download jobs from external links (iCloud, Google Photos, etc.)
 */
class StreamingService {
  /**
   * Create a new download job
   * @param {string} videoLink - The external video link (iCloud, Google Photos, etc.)
   * @param {string} matchId - The match ID (for logging only)
   * @returns {Promise<{jobId: string, status: string}>}
   */
  static async createDownloadJob(videoLink, matchId) {
    try {
      if (!STREAMING_API_KEY) {
        throw new Error('STREAMING_API_KEY is not configured');
      }

      // Construct webhook URL (no matchId - streaming service will send jobId only)
      const webhookUrl = `${BACKEND_BASE_URL}/api/v1/webhooks/streaming`;

      const requestBody = {
        link: videoLink,
        webhookUrl: webhookUrl,
      };

      global.createLogger.info('Creating streaming download job', {
        matchId,
        videoLink: videoLink.substring(0, 50) + '...',
        webhookUrl,
      });

      const response = await fetch(`${STREAMING_API_BASE_URL}/api/v1/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': STREAMING_API_KEY,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        global.createLogger.error('Streaming API error', {
          status: response.status,
          error: errorText,
        });
        throw new Error(
          `Streaming API error: ${response.status} - ${errorText}`
        );
      }

      const result = await response.json();

      global.createLogger.info('Streaming download job created', {
        matchId,
        jobId: result.jobId,
        status: result.status,
      });

      return result;
    } catch (error) {
      global.createLogger.error('Error creating streaming download job', {
        matchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get the status of a download job
   * @param {string} jobId - The job ID
   * @returns {Promise<Object>}
   */
  static async getJobStatus(jobId) {
    try {
      if (!STREAMING_API_KEY) {
        throw new Error('STREAMING_API_KEY is not configured');
      }

      const response = await fetch(
        `${STREAMING_API_BASE_URL}/api/v1/jobs/${jobId}`,
        {
          method: 'GET',
          headers: {
            'X-API-Key': STREAMING_API_KEY,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Streaming API error: ${response.status} - ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      global.createLogger.error('Error getting streaming job status', {
        jobId,
        error: error.message,
      });
      throw error;
    }
  }
}

export default StreamingService;
