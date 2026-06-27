export const successResponse = (res, data = null, message = 'Success', statusCode = 200, metadata = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...metadata
  });
};

export const errorResponse = (res, message = 'Internal Server Error', statusCode = 500, errorDetails = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error: errorDetails
  });
};
