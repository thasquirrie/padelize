// src/services/notificationService.js
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import AppError from '../utils/appError.js';
import webSocketService from './webSocketService.js';
import { findOne, getAll } from '../factory/repo.js';
import Follow from '../models/Follow.js';

class NotificationService {
  // Standard population configuration - centralized
  static POPULATE_CONFIG = [
    {
      path: 'sender',
      select: 'fullName image -_id', // Explicitly exclude _id if needed
    },
    {
      path: 'relatedPost',
      select: 'content attachment createdAt',
      populate: {
        path: 'user',
        select: 'fullName image -_id',
      },
    },
    {
      path: 'relatedReply',
      select: 'content createdAt',
      populate: {
        path: 'user',
        select: 'fullName image -_id',
      },
    },
  ];

  // Centralized query builder
  buildNotificationQuery(userId, filters = {}) {
    const { type, unreadOnly, includeDeleted = false } = filters;

    const query = {
      recipient: userId,
      ...(includeDeleted ? {} : { deleted: false }),
    };

    if (type) query.type = type;
    if (unreadOnly) query.read = false;

    return query;
  }

  // Centralized population method
  async populateNotifications(notifications) {
    if (Array.isArray(notifications)) {
      return await Notification.populate(
        notifications,
        NotificationService.POPULATE_CONFIG
      );
    } else {
      return await Notification.populate(
        notifications,
        NotificationService.POPULATE_CONFIG
      );
    }
  }

  // Get notifications with pagination and filters
  async getNotifications(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        unreadOnly = false,
        includeDeleted = false,
      } = options;

      // Build query using centralized method
      const query = this.buildNotificationQuery(userId, {
        type,
        unreadOnly,
        includeDeleted,
      });

      // Get notifications with direct population (this is the key fix)
      const notifications = await Notification.find(query)
        .populate({
          path: 'sender',
          select: 'fullName image', // Only these fields
        })
        .populate({
          path: 'relatedPost',
          select: 'content attachment createdAt',
          populate: {
            path: 'user',
            select: 'fullName image', // Only these fields
          },
        })
        .populate({
          path: 'relatedReply',
          select: 'content createdAt',
          populate: {
            path: 'user',
            select: 'fullName image', // Only these fields
          },
        })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('-__v'); // Remove version key from main document
      // const notifications = await getAll(Notification, query, {}, [
      //   { path: 'sender', select: 'fullName image', autoPopulate: false },
      // ]);

      // Get counts
      const total = await Notification.countDocuments(query);
      const unreadCount = await Notification.getUnreadCount(userId);

      return {
        notifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalNotifications: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
        unreadCount,
      };
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw new AppError('Failed to fetch notifications', 500);
    }
  }

  // Create a new notification
  async createNotification(data) {
    try {
      const {
        recipient,
        sender,
        type,
        relatedPost = null,
        relatedReply = null,
        relatedMatch = null,
        customTitle = null,
        customMessage = null,
        priority = 'medium',
      } = data;

      // Don't send notification to self (except for match-related and post-related system notifications)
      // Match-related notifications include: matchCreated, analysisStarted, player_detection_complete, etc.
      const isMatchRelatedNotification = 
        type.includes('match') || 
        type.includes('analysis') || 
        type.includes('player_detection') ||
        type.includes('video') ||
        type.includes('upload');
      
      if (
        recipient.toString() === sender.toString() &&
        !isMatchRelatedNotification &&
        !type.includes('post')
      ) {
        return null;
      }

      // Generate title and message based on type
      // For custom notifications (match notifications), we don't need to fetch sender
      let title, message;
      if (customTitle && customMessage) {
        title = customTitle;
        message = customMessage;
      } else {
        const senderUser = await findOne(User, { _id: sender });
        if (!senderUser) {
          throw new AppError('Sender user not found', 404);
        }
        const content = await this.generateNotificationContent(
          type,
          senderUser,
          { relatedPost, relatedReply, relatedMatch, customTitle, customMessage }
        );
        title = content.title;
        message = content.message;
      }

      // Create or update grouped notification
      const notification = await Notification.createOrUpdateGrouped({
        recipient,
        sender,
        type,
        title,
        message,
        relatedPost,
        relatedReply,
        relatedMatch,
        priority,
      });

      // Populate and send real-time notification
      const populatedNotification = await Notification.findById(
        notification._id
      )
        .populate({
          path: 'sender',
          select: 'fullName image',
        })
        .populate({
          path: 'relatedPost',
          select: 'content attachment createdAt',
          populate: {
            path: 'user',
            select: 'fullName image',
          },
        })
        .populate({
          path: 'relatedReply',
          select: 'content createdAt',
          populate: {
            path: 'user',
            select: 'fullName image',
          },
        })
        .select('-__v');

      webSocketService.sendNotificationToUser(
        recipient.toString(),
        populatedNotification
      );

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw new AppError('Failed to create notification', 500);
    }
  }

  // Generate notification content based on type
  async generateNotificationContent(type, sender, options = {}) {
    const { relatedPost, relatedReply, customTitle, customMessage } = options;

    if (customTitle && customMessage) {
      return { title: customTitle, message: customMessage };
    }

    const contentMap = {
      like: {
        title: 'Post Liked',
        message: `${sender.fullName} liked your post`,
      },
      reply: {
        title: 'New Reply',
        message: `${sender.fullName} replied to your post`,
      },
      replyLike: {
        title: 'Reply Liked',
        message: `${sender.fullName} liked your reply`,
      },
      follow: {
        title: 'New Follower',
        message: `${sender.fullName} started following you`,
      },
      mention: {
        title: 'You were mentioned',
        message: `${sender.fullName} mentioned you in a post`,
      },
    };

    return (
      contentMap[type] || {
        title: 'New Notification',
        message: `${sender.fullName} interacted with your content`,
      }
    );
  }

  async handleNewPostNotification(post, author) {
    // const postOwner = await findOne(User, { _id: post.user });
    // if (!postOwner) {
    //   throw new AppError('Post owner not found', 404);
    // }

    const notification = await this.createNotification({
      recipient: author._id,
      sender: author._id,
      type: 'postCreated',
      relatedPost: post._id,
      customTitle: 'New Post Created',
      customMessage: `Your post has been created`,
    });

    // Notify followers of the post owner
    const followers = await Follow.find({ following: post.user });
    console.log('Length: ', followers.length);
    for (const follower of followers) {
      const notification = await this.createNotification({
        recipient: follower._id,
        sender: post.user || author,
        type: 'postCreated',
        relatedPost: post._id,
        customTitle: 'New Post Created',
        customMessage: `${postOwner.fullName} created a new post`,
      });
    }
  }

  // Notification type handlers - these remain the same
  async handleLikeNotification(postId, likedBy, postOwner) {
    return await this.createNotification({
      recipient: postOwner._id,
      sender: likedBy._id,
      type: 'like',
      relatedPost: postId,
    });
  }

  async handleReplyNotification(postId, replyBy, postOwner, reply) {
    return await this.createNotification({
      recipient: postOwner._id,
      sender: replyBy._id,
      type: 'reply',
      relatedPost: postId,
      relatedReply: reply._id,
    });
  }

  async handleReplyLikeNotification(postId, replyId, likedBy, replyOwner) {
    return await this.createNotification({
      recipient: replyOwner._id,
      sender: likedBy._id,
      type: 'replyLike',
      relatedPost: postId,
      relatedReply: replyId,
    });
  }

  async handleFollowNotification(followedUser, follower) {
    return await this.createNotification({
      recipient: followedUser._id,
      sender: follower._id,
      type: 'follow',
    });
  }

  // Bulk operations
  async markAllAsRead(userId) {
    return await Notification.updateMany(
      { recipient: userId, read: false },
      { read: true, readAt: new Date() }
    );
  }

  async deleteOldNotifications(userId, days = 30) {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await Notification.deleteMany({
      recipient: userId,
      createdAt: { $lt: cutoffDate },
    });
  }

  async cleanupNotifications() {
    return await Notification.cleanupOldNotifications();
  }
}

export default new NotificationService();

// // src/services/notificationService.js
// import Notification from '../models/Notification.js';
// import User from '../models/User.js';
// import Post from '../models/Post.js';
// import Reply from '../models/Reply.js';
// import AppError from '../utils/appError.js';
// import catchAsync from '../utils/catchAsync.js';
// import webSocketService from './webSocketService.js';
// import { createOne, findOne, updateOne, deleteOne } from '../factory/repo.js';

// class NotificationService {
//   // Create a new notification
//   async createNotification(data) {
//     try {
//       const {
//         recipient,
//         sender,
//         type,
//         relatedPost = null,
//         relatedReply = null,
//         customTitle = null,
//         customMessage = null,
//         priority = 'medium',
//       } = data;

//       // Don't send notification to self
//       if (recipient.toString() === sender.toString()) {
//         return null;
//       }

//       // Generate title and message based on type
//       const senderUser = await findOne(User, { _id: sender });
//       const { title, message } = await this.generateNotificationContent(
//         type,
//         senderUser,
//         { relatedPost, relatedReply, customTitle, customMessage }
//       );

//       // Create or update grouped notification
//       const notification = await Notification.createOrUpdateGrouped({
//         recipient,
//         sender,
//         type,
//         title,
//         message,
//         relatedPost,
//         relatedReply,
//         priority,
//       });

//       // Send real-time notification via WebSocket
//       const populatedNotification = await this.populateNotification(
//         notification
//       );
//       webSocketService.sendNotificationToUser(
//         recipient.toString(),
//         populatedNotification
//       );

//       return notification;
//     } catch (error) {
//       console.error('Error creating notification:', error);
//       throw new AppError('Failed to create notification', 500);
//     }
//   }

//   // Generate notification content based on type
//   async generateNotificationContent(type, sender, options = {}) {
//     const { relatedPost, relatedReply, customTitle, customMessage } = options;

//     if (customTitle && customMessage) {
//       return { title: customTitle, message: customMessage };
//     }

//     switch (type) {
//       case 'like':
//         return {
//           title: 'Post Liked',
//           message: `${sender.fullName} liked your post`,
//         };

//       case 'reply':
//         return {
//           title: 'New Reply',
//           message: `${sender.fullName} replied to your post`,
//         };

//       case 'replyLike':
//         return {
//           title: 'Reply Liked',
//           message: `${sender.fullName} liked your reply`,
//         };

//       case 'follow':
//         return {
//           title: 'New Follower',
//           message: `${sender.fullName} started following you`,
//         };

//       case 'mention':
//         return {
//           title: 'You were mentioned',
//           message: `${sender.fullName} mentioned you in a post`,
//         };

//       default:
//         return {
//           title: 'New Notification',
//           message: `${sender.fullName} interacted with your content`,
//         };
//     }
//   }

//   // Populate notification with related data
//   async populateNotification(notification) {
//     return await Notification.findById(notification._id)
//       .populate({
//         path: 'sender',
//         select: 'fullName image',
//       })
//       .populate({
//         path: 'relatedPost',
//         select: 'content attachment createdAt',
//         populate: {
//           path: 'user',
//           select: 'fullName image',
//         },
//       })
//       .populate({
//         path: 'relatedReply',
//         select: 'content createdAt',
//         populate: {
//           path: 'user',
//           select: 'fullName image',
//         },
//       });
//   }

//   // Notification type handlers
//   async handleLikeNotification(postId, likedBy, postOwner) {
//     return await this.createNotification({
//       recipient: postOwner._id,
//       sender: likedBy._id,
//       type: 'like',
//       relatedPost: postId,
//     });
//   }

//   async handleReplyNotification(postId, replyBy, postOwner, reply) {
//     return await this.createNotification({
//       recipient: postOwner._id,
//       sender: replyBy._id,
//       type: 'reply',
//       relatedPost: postId,
//       relatedReply: reply._id,
//     });
//   }

//   async handleReplyLikeNotification(postId, replyId, likedBy, replyOwner) {
//     return await this.createNotification({
//       recipient: replyOwner._id,
//       sender: likedBy._id,
//       type: 'replyLike',
//       relatedPost: postId,
//       relatedReply: replyId,
//     });
//   }

//   async handleFollowNotification(followedUser, follower) {
//     return await this.createNotification({
//       recipient: followedUser._id,
//       sender: follower._id,
//       type: 'follow',
//     });
//   }

//   // Bulk operations
//   async markAllAsRead(userId) {
//     return await Notification.updateMany(
//       { recipient: userId, read: false },
//       { read: true, readAt: new Date() }
//     );
//   }

//   async deleteOldNotifications(userId, days = 30) {
//     const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
//     return await Notification.deleteMany({
//       recipient: userId,
//       createdAt: { $lt: cutoffDate },
//     });
//   }

//   // Cleanup job (run periodically)
//   async cleanupNotifications() {
//     return await Notification.cleanupOldNotifications();
//   }
// }

// export default new NotificationService();
