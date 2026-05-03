module.exports = function(api) {
  api.cache(true);
  const plugins = [];

  // 🏗️ Phase A-1: Strip all console.log/warn/error calls in production builds.
  // This prevents 164 files worth of console statements from being serialized
  // across the JS-to-Native bridge in production, freeing ~10-15% JS thread capacity.
  if (process.env.NODE_ENV === 'production') {
    plugins.push('transform-remove-console');
  }

  return {
    presets: ['babel-preset-expo'],
    plugins
  };
};
