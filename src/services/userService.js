import { deleteOne, findOne, getAll, updateOne } from '../factory/repo.js';
import User from '../models/User.js';
import AppError from '../utils/appError.js';
import catchAsync from '../utils/catchAsync.js';
import { v2 as cloudinary } from 'cloudinary';
import { promisify } from 'util';

export const getUserService = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const user = await findOne(User, { _id: id });

  if (!user) return next(new AppError('User with email not found', 404));

  res.status(200).json({
    status: 'success',
    message: 'User fetched successfully',
    data: {
      user,
    },
  });
});

export const getUsersService = catchAsync(async (req, res, next) => {
  const { searchTerm, ...filterParams } = req.query;

  // Define searchable fields for users
  const searchFields = ['fullName', 'email', 'phone', 'description'];

  // Configure search options
  const searchOptions = {
    searchFields,
    searchTerm: searchTerm || '',
  };

  // Get users with search functionality (pass filterParams to maintain other query filters)
  const users = await getAll(User, filterParams, searchOptions);

  res.status(200).json({
    status: 'success',
    message: 'Users fetched successfully',
    data: {
      users,
    },
  });
});

export const updateUserService = catchAsync(async (req, res, next) => {
  const { id } = req.user;

  const user = await updateOne(User, { _id: id }, req.body);

  if (!user) return next(new AppError('User not found', 404));

  res.status(200).json({
    status: 'success',
    message: 'User updated successfully',
    data: {
      user,
    },
  });
});

export const deleteUserService = catchAsync(async (req, res, next) => {
  const { id } = req.user;

  const user = await deleteOne(User, { _id: id });

  if (!user) return next(new AppError('User not found', 404));

  res.status(204).json();
});

export const uploadImageService = catchAsync(async (req, res, next) => {
  const { id } = req.user;
  if (!req.file) return next(new AppError('No image file found', 400));

  const file = await cloudinary.uploader.upload(req.file.path, {
    folder: 'padelize/users',
    tags: req.file.originalName,
  });

  const user = await updateOne(User, { _id: id }, { image: file.secure_url });

  res.status(200).json({
    status: 'success',
    message: 'Image uploaded successfully',
    data: {
      user,
    },
  });
});
