inmemfilecache
==============

A very simple in memory file cache for node.js. It's a drop in replacement
for `fs.readFile` and `fs.readSyncFile`

Files are cached LRU style in memory. By default inmemfilecache
monitors the folders of files in the cache. If a file changes
it's removed from the cache. This means you can use it in dev
environments and not have to disable it while your server is running.

Usage
-----

    var Cache = require('inmemfilecache');
    var cache = new Cache();

    cache.readFile('/path/to/file', callback);

API
---

*   `Cache(options)`

    options are optional

    *    `cacheSizeLimit`

         the number of bytes the cache can hold. Defaults to 64 meg.

    *    `checkForFileChanges`

         removes files from cache if the file changes. Default = true

*   `Cache.readFile`

    See [`fs.readFile`](http://nodejs.org/api/fs.html#fs_fs_readfile_filename_options_callback)

*   `Cache.readFileSync`

    See [`fs.readFileSync`](http://nodejs.org/api/fs.html#fs_fs_readfilesync_filename_options)

*   `Cache.setCacheLimit`

    Changes the cache's size limit. If it's over this limit
    things will be removed from the cache until it's under the limit.

*   `Cache.clear`

    clears the cache.

