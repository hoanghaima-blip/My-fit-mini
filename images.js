(function () {
  'use strict';

  var DB_NAME = 'my-fit-mini-images';
  var DB_VERSION = 1;
  var STORE = 'images';
  var memoryStore = (typeof window !== 'undefined' && window.__MYFIT_SHARED_IMAGES__)
    ? window.__MYFIT_SHARED_IMAGES__
    : ((typeof globalThis !== 'undefined' && globalThis.__MYFIT_SHARED_IMAGES__)
      ? globalThis.__MYFIT_SHARED_IMAGES__
      : {});
  var dbPromise = null;
  var objectUrls = {};

  function openDb() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB === 'undefined') {
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }
    dbPromise = new Promise(function (resolve) {
      try {
        var request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'id' });
          }
        };
        request.onsuccess = function () {
          resolve(request.result);
        };
        request.onerror = function () {
          console.warn('IndexedDB unavailable, using memory image store');
          resolve(null);
        };
      } catch (err) {
        console.warn('IndexedDB open failed', err);
        resolve(null);
      }
    });
    return dbPromise;
  }

  function makeImageId() {
    return 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function putImage(blob, preferredId) {
    var id = preferredId || makeImageId();
    return openDb().then(function (db) {
      memoryStore[id] = blob;
      if (!db) return id;
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ id: id, blob: blob, createdAt: Date.now() });
        tx.oncomplete = function () { resolve(id); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getImage(id) {
    if (!id) return Promise.resolve(null);
    if (memoryStore[id]) return Promise.resolve(memoryStore[id]);
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readonly');
        var request = tx.objectStore(STORE).get(id);
        request.onsuccess = function () {
          var row = request.result;
          if (row && row.blob) {
            memoryStore[id] = row.blob;
            resolve(row.blob);
          } else {
            resolve(null);
          }
        };
        request.onerror = function () { resolve(null); };
      });
    });
  }

  function revokeObjectUrl(id) {
    if (objectUrls[id]) {
      URL.revokeObjectURL(objectUrls[id]);
      delete objectUrls[id];
    }
  }

  function getImageObjectUrl(id) {
    if (!id) return Promise.resolve('');
    if (objectUrls[id]) return Promise.resolve(objectUrls[id]);
    return getImage(id).then(function (blob) {
      if (!blob) return '';
      var url = URL.createObjectURL(blob);
      objectUrls[id] = url;
      return url;
    });
  }

  function getAppBasePath() {
    if (typeof window === 'undefined' || !window.location) return './';
    var path = window.location.pathname || '/';
    if (path.endsWith('/')) return path;
    if (/\.html?$/i.test(path)) return path.replace(/[^/]+$/, '');
    // "/My-fit-mini" (no trailing slash) must resolve assets under "/My-fit-mini/"
    return path + '/';
  }

  function toPublicUrl(src) {
    var value = String(src || '');
    if (!value) return '';
    if (
      value.indexOf('http') === 0 ||
      value.indexOf('data:') === 0 ||
      value.indexOf('blob:') === 0
    ) {
      return value;
    }
    if (value.indexOf('./') === 0) value = value.slice(2);
    if (value.charAt(0) === '/') return value;
    try {
      if (typeof window !== 'undefined' && window.location && window.location.origin) {
        return new URL(value, window.location.origin + getAppBasePath()).href;
      }
    } catch (err) {}
    return value;
  }

  function isStableImagePath(src) {
    var value = String(src || '');
    return (
      value.indexOf('http') === 0 ||
      value.indexOf('assets/') === 0 ||
      value.indexOf('./assets/') === 0 ||
      value.indexOf('./') === 0 ||
      value.indexOf('/') === 0
    );
  }

  function resolveImageSrc(imageRef) {
    if (!imageRef) return Promise.resolve('');
    if (typeof imageRef === 'string') {
      if (
        imageRef.indexOf('http') === 0 ||
        imageRef.indexOf('data:') === 0 ||
        imageRef.indexOf('blob:') === 0 ||
        imageRef.indexOf('assets/') === 0 ||
        imageRef.indexOf('./') === 0 ||
        imageRef.indexOf('/') === 0
      ) {
        return Promise.resolve(toPublicUrl(imageRef));
      }
      return getImageObjectUrl(imageRef);
    }

    var path = imageRef.image || '';
    var imageId = imageRef.imageId || '';
    var catalog = '';
    if (typeof window !== 'undefined' && window.MyFitData && typeof window.MyFitData.catalogImageForExercise === 'function') {
      catalog = window.MyFitData.catalogImageForExercise(imageRef) || '';
    }

    // 1. User-uploaded image (IndexedDB) — never override with catalog asset.
    if (imageId) {
      return getImageObjectUrl(imageId).then(function (url) {
        if (url) return url;
        // Blob missing on this device: fall back to saved path (incl. data URL), then catalog.
        if (path && path.indexOf('blob:') !== 0) {
          if (path.indexOf('data:') === 0 || path.indexOf('http') === 0 || isStableImagePath(path)) {
            return Promise.resolve(toPublicUrl(path));
          }
        }
        if (catalog) return Promise.resolve(toPublicUrl(catalog));
        return '';
      });
    }

    // 2. Saved image path, data URL, or URL stored on the exercise.
    if (path && path.indexOf('blob:') !== 0) {
      if (
        path.indexOf('data:') === 0 ||
        isStableImagePath(path) ||
        path.indexOf('http') === 0
      ) {
        return Promise.resolve(toPublicUrl(path));
      }
    }

    // 3. Default catalog asset only when exercise has no custom image.
    if (catalog) return Promise.resolve(toPublicUrl(catalog));

    if (path) return resolveImageSrc(path);
    return Promise.resolve('');
  }

  function resolveInstructionImageEntry(entry) {
    if (!entry || typeof entry !== 'object') return Promise.resolve('');
    return resolveImageSrc({ imageId: entry.imageId || '', image: entry.image || '' });
  }

  function copyImage(imageId) {
    if (!imageId) return Promise.resolve('');
    return getImage(imageId).then(function (blob) {
      if (!blob) return '';
      return putImage(blob);
    });
  }

  function compressImageFile(file, options) {
    options = options || {};
    var maxWidth = options.maxWidth || 1200;
    var maxHeight = options.maxHeight || 1200;
    var quality = options.quality || 0.82;
    var maxBytes = options.maxBytes || 350000;

    if (!file) return Promise.reject(new Error('no file'));
    if (typeof document === 'undefined' || !document.createElement) {
      return Promise.resolve(file);
    }

    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      var url = URL.createObjectURL(file);
      var timer = setTimeout(function () {
        URL.revokeObjectURL(url);
        finish(file);
      }, 400);
      var img = new Image();
      img.onload = function () {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        var w = img.naturalWidth || img.width || 1;
        var h = img.naturalHeight || img.height || 1;
        var scale = Math.min(1, maxWidth / w, maxHeight / h);
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(file);
          return;
        }
        ctx.drawImage(img, 0, 0, cw, ch);

        function tryQuality(q) {
          if (canvas.toBlob) {
            canvas.toBlob(function (blob) {
              if (!blob) {
                finish(file);
                return;
              }
              if (blob.size <= maxBytes || q <= 0.45) {
                finish(blob);
              } else {
                tryQuality(Math.max(0.45, q - 0.08));
              }
            }, 'image/jpeg', q);
            return;
          }
          finish(file);
        }
        tryQuality(quality);
      };
      img.onerror = function () {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        finish(file);
      };
      img.src = url;
    });
  }

  window.MyFitImages = {
    makeImageId: makeImageId,
    putImage: putImage,
    getImage: getImage,
    getImageObjectUrl: getImageObjectUrl,
    resolveImageSrc: resolveImageSrc,
    resolveInstructionImageEntry: resolveInstructionImageEntry,
    toPublicUrl: toPublicUrl,
    getAppBasePath: getAppBasePath,
    copyImage: copyImage,
    compressImageFile: compressImageFile,
    revokeObjectUrl: revokeObjectUrl,
    _memoryStore: memoryStore
  };
})();
