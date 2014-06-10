/*
 * Copyright 2014, Gregg Tavares.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Gregg Tavares. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";

var debug = require('debug')('inmemfilecache');
var path = require('path');
var fs = require('fs');

/**
 * @typedef {Object} Cache~Options
 * @properties {number?} cacheSizeLimit
 */

/**
 * An in memory file cache.
 *
 * @constructor
 * @param {Cache~Options?} options number of bytes the cache can
 *        hold.
 */
var Cache = function(options) {
  options = options || {};
  var g_cacheSize = 0;
  var g_cacheSizeLimit = options.cacheSizeLimit || 64 * 1024 * 1024;
  var g_fileLRUList = [];
  var g_cachedFiles = { };
  var g_trackedFolders = { };
  var g_numTrackedFolders = 0;
  var g_checkForFileChanges = options.checkForFileChanges !== undefined ? options.checkForFileChanges : true;

  /**
   * Gets a filename from an id
   * @param {string} id
   * @returns {string} filename
   */
  var getFilenameFromId = function(id) {
    return JSON.parse(id).filename;
  };

  /**
   * Makes an id
   * @param {string} filename
   * @param {Object} options as passed to `fs.readFile` or
   *        `fs.readFileSync`.
   */
  var makeId = function(filename, options) {
    return JSON.stringify({filename:filename, options:options});
  };

  /**
   * Removes a bunch of ids from the cache.
   * @param {string[]} idsToRemove
   */
  var removeById = function(idsToRemove) {
    idsToRemove.forEach(function(id) {
      debug("uncache: " + id);
      var contents = g_cachedFiles[id];
      if (contents.length) {
        g_cacheSize -= contents.length;
      }
      delete g_cachedFiles[id];
      var index = g_fileLRUList[id];
      if (index >= 0) {
        g_fileLRUList.splice(index, 1);
      }
      var filename = getFilenameFromId(id);
      if (g_checkForFileChanges) {
        var dirname = path.dirname(filename);
        var folderInfo = g_trackedFolders[dirname];
        if (!folderInfo) {
          console.error("missing folder info for:" + id);
        } else {
          if (!folderInfo.fileIds[id]) {
            console.error("no fileIds entry for: " + id + " in: " + dirname);
          } else {
            delete folderInfo.fileIds[id];
            --folderInfo.numFiles;
            if (folderInfo.numFiles == 0) {
              folderInfo.watcher.close();
              delete g_trackedFolders[dirname];
              --g_numTrackedFolders;
              debug("removed folder tracker for: " + dirname);
              debug("num tracked folders: " + g_numTrackedFolders);
            }
          }
        }
      }
    });
    debug("g_cacheSize: " + g_cacheSize);
  };

  /**
   * Make sure there's space in the cache
   *
   * Note: passing in a number larger than the
   * cache's size limit will not increase the limit
   *
   * @param {number} number of bytes to make available.
   */
  var makeSpaceInCache = function(spaceNeeded) {
    var targetSize = Math.max(0, g_cacheSizeLimit - spaceNeeded);
    while (g_cacheSize > targetSize) {
      removeById(g_fileLRUList.splice(0, 1));
    }
  };

  /**
   * Remove a file from the cache by filename
   *
   * Note: a file can be in the cache more than once
   * if different options were used to load it. This
   * will remove all versions of the file.
   *
   * @param {string} filename
   */
  var removeByFilename = function(filename) {
    var idsToRemove = [];
    for (var id in g_cachedFiles) {
      var name = getFilenameFromId(id);
      if (name == filename) {
        idsToRemove.push(id);
      }
    }
    removeById(idsToRemove);
  };

  /**
   * Remove all files in a specific folder
   * @param {string} folder
   */
  var removeByFolder = function(folder) {
    var idsToRemove = [];
    for (var id in g_cachedFiles) {
      var name = path.dirname(id.split(g_delim)[0]);
      if (name == folder) {
        idsToRemove.push(id);
      }
    }
    removeById(idsToRemove);
  };

  /**
   * Start tracking a folder for changes
   * @param {string} id id of filename
   */
  var trackFolder = function(id) {
    if (!g_checkForFileChanges) {
      return;
    }
    var filename = getFilenameFromId(id);
    var dirname = path.dirname(filename);
    var folderInfo = g_trackedFolders[dirname];
    if (folderInfo === undefined) {
      var watcher = fs.watch(dirname, function(event, filename) {
        if (filename) {
          removeByFilename(path.join(dirname, filename));
        } else {
          removeByFolder(dirname);
        }
      });

      folderInfo = {
        watcher: watcher,
        fileIds: {},
        numFiles: 0,
      };
      g_trackedFolders[dirname] = folderInfo;
      ++g_numTrackedFolders;
      debug("added folder tracker for: " + dirname);
      debug("num tracked folders: " + g_numTrackedFolders);
    }

    if (folderInfo.fileIds[id] === undefined) {
      folderInfo.fileIds[id] = true;
      ++folderInfo.numFiles;
    }
  };



  var getContentFromCache = function(id) {
    var content = g_cachedFiles[id];
    if (content !== undefined) {
      debug("from cache: " + id);
      var index = g_fileLRUList.indexOf(id);
      if (index < 0) {
        console.error("index should not be missing");
      } else {
        g_fileLRUList.splice(index, 1);
        g_fileLRUList.push(id);
      }
    }
    return content;
  };

  var cacheContent = function(id, data) {
    if (data.length <= g_cacheSizeLimit) {
      makeSpaceInCache(data.length);
      g_cachedFiles[id] = data;
      g_cacheSize += data.length;
      g_fileLRUList.push(id);
      debug("cached: " + id);
      debug("g_cacheSize: " + g_cacheSize);
      trackFolder(id);
    } else {
      debug("file too big for cache: " + filename + ", size: " + data.length);
    }
  };

  /**
   * Read a file. If in cache get it from cache.
   * Works exactly the same as `fs.readFile`.
   */
  var readFile = function(filename, options, callback) {
    if (arguments.length == 2) {
      callback = options;
      options = undefined;
    }

    var id = makeId(filename, options);
    var content = getContentFromCache(id);
    if (content !== undefined) {
      setTimeout(function() {
        callback(null, content);
      },0);
      return;
    }

    fs.readFile(filename, options, function(err, data) {
      if (err) {
        callback(err, null);
        return;
      }
      cacheContent(id, data);
      callback(null, data);
    });
  };

  /**
   * Read a file synchronously. If in cache get it from cache
   * Works exactly the same as `fs.readFileSync`.
   */
  var readFileSync = function(filename, options) {
    var id = makeId(filename, options);
    var content = getContentFromCache(id);
    if (!content) {
      content = fs.readFileSync(filename, options);
      cacheContent(id, content);
    }
    return content;
  };

  /**
   * Clear the cache
   */
  var clear = function() {
    for (var key in g_trackedFolders) {
      var info = g_trackedFolders[key];
      info.watcher.close();
    }
    g_trackedFolders = {};
    g_numTrackedFolders = 0;
    g_cachedFiles = {};
    g_cacheSize = 0;
    g_fileLRUList = [];
    debug("cleared cache");
  };

  /**
   * Set the cache size limit
   * @param {number} numBytes number of bytes allowed in the
   *        cache.
   */
  var setCacheSizeLimit = function(numBytes) {
    g_cacheSizeLimit = Math.max(0, numBytes);
    makeSpaceInCache(0);
  };

  /**
   * Clears the cache.
   */
  this.clear = clear;

  /**
   * read a file
   *
   * This has the exact same usage as fs.readFile
   * @param {string} filePath path to file
   * @param {Object|Callback}
   * @param {Callback?}
   */
  this.readFile = readFile;

  /**
   * read a file synchronously.
   *
   * This has the exact same usage as fs.readFileSync
   * @param {string} filePath path to file
   * @param {Object}
   */
  this.readFileSync = readFileSync;

  /**
   * Lets you change the cache limit.
   * If there is more in the cache than the new limit
   * the cache will be immediately emptied until it's
   * under the new limit.
   * @param {number} numBytes the number of bytes allowed in the
   *        cache.
   */
  this.setCacheSizeLimit = setCacheSizeLimit;
};

module.exports = Cache;

