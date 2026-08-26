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
        return Promise.resolve(imageRef);
      }
      return getImageObjectUrl(imageRef);
    }
    if (imageRef.imageId) return getImageObjectUrl(imageRef.imageId);
    if (imageRef.image) return resolveImageSrc(imageRef.image);
    return Promise.resolve('');
  }

  function copyImage(imageId) {
    if (!imageId) return Promise.resolve('');
    return getImage(imageId).then(function (blob) {
      if (!blob) return '';
      return putImage(blob);
    });
  }

  window.MyFitImages = {
    makeImageId: makeImageId,
    putImage: putImage,
    getImage: getImage,
    getImageObjectUrl: getImageObjectUrl,
    resolveImageSrc: resolveImageSrc,
    copyImage: copyImage,
    revokeObjectUrl: revokeObjectUrl,
    _memoryStore: memoryStore
  };
})();
