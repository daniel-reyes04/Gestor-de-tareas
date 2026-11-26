module.exports = {
  globDirectory: '.',
  globPatterns: [
    'index.html',
    'manifest.json',
    'css/*.css',
    '*.js',
    'icons/*.png',
  ],
  // globIgnores evita que el SW se precachee a sí mismo y excluye carpetas del servidor
  globIgnores: ['node_modules/**/*', 'servidor/**/*', 'lib/**/*', 'workbox-config.js', 'sw.js', 'sw-propio.js', 'package*.json'],
  swSrc: 'sw-propio.js',
  swDest: 'sw.js',
};