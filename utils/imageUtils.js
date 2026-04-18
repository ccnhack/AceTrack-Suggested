import config from '../config';

export const getSafeAvatar = (avatar, name, background = '3B82F6') => {
  if (!avatar || avatar === 'null' || avatar === 'undefined' || avatar === '') {
    return { uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=${background}&color=ffffff` };
  }
  return { uri: config.sanitizeUrl(avatar) };
};

export const getSafePreview = (previewUrl) => {
  if (!previewUrl || previewUrl === 'null' || previewUrl === 'undefined' || previewUrl === '') {
    return { uri: 'https://ui-avatars.com/api/?name=Match&background=000000&color=ffffff' };
  }
  return { uri: config.sanitizeUrl(previewUrl) };
};
