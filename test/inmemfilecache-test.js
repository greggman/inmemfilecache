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

var path = require('path');
var should = require('should');
var sinon = require('sinon');
var Cache = require('../lib/inmemfilecache');

// fs.watch(dirname, fn(event, filename)) return watcher with close fn
// fs.readFile(filename, options, fn(err, data))
// fs.readFileSync(filename, options)

describe('Cache', function() {
 it('checks the cache starts with nothing', function() {
   var cache = new Cache();
   var info = cache.getInfo();
   info.cacheSize.should.equal(0);
   info.numTrackedFolders.should.equal(0);
 });

 it('#readFileSync', function() {
   var watcher1 = { close: function() {} };
   var watcher2 = { close: function() {} };
   var fs = {
     watch: function() {},
     readFile: function() {},
     readFileSync: function() {},
   };
   var mockFS = {
     watch: sinon.stub(fs, "watch"),
     readFile: sinon.stub(fs, "readFile"),
     readFileSync: sinon.stub(fs, "readFileSync"),
   };
   var mockWatcher1 = sinon.mock(watcher1);
   var mockWatcher2 = sinon.mock(watcher2);
   var subFileName = path.join("subfolder", "test.txt");

   mockFS.readFileSync.withArgs("test.file", "utf-8").returns("abcef");
   mockFS.readFileSync.withArgs("test.file2", "utf-8").returns("xyz");
   mockFS.readFileSync.withArgs(subFileName, "utf-8").returns("ghij");
   mockFS.watch.withArgs(".").returns(watcher1);
   mockFS.watch.withArgs("subfolder").returns(watcher2);

   mockWatcher1.expects("close").twice();
   mockWatcher2.expects("close").twice();

   var cache = new Cache({fileSystem: fs});

   // Read the file once. We should see the file read and a watch setup.
   var content = cache.readFileSync("test.file", "utf-8");
   content.should.equal("abcef");

   var info = cache.getInfo();
   info.cacheSize.should.equal(5);
   info.numTrackedFolders.should.equal(1);

   // Read the file again, it should come from the cache, no new watch
   var content = cache.readFileSync("test.file", "utf-8");
   content.should.equal("abcef");

   var content = cache.readFileSync(subFileName, "utf-8");
   content.should.equal("ghij");

   var info = cache.getInfo();
   info.cacheSize.should.equal(9);
   info.numTrackedFolders.should.equal(2);

   // make it appear the folder has been updated.
   mockFS.watch.getCall(0).args[1](null, null);

   // Files in the folder should be ejected from cache
   var info = cache.getInfo();
   info.cacheSize.should.equal(4);
   info.numTrackedFolders.should.equal(1);

   // Read the file
   var content = cache.readFileSync("test.file", "utf-8");
   content.should.equal("abcef");

   // File should now be in the cache
   var info = cache.getInfo();
   info.cacheSize.should.equal(9);
   info.numTrackedFolders.should.equal(2);

   // make it appear the subfolder is been updated
   mockFS.watch.getCall(1).args[1](null, null);

   // Files in the folder should be ejected from cache
   var info = cache.getInfo();
   info.cacheSize.should.equal(5);
   info.numTrackedFolders.should.equal(1);

   // read fhe file
   var content = cache.readFileSync(subFileName, "utf-8");
   content.should.equal("ghij");

   // it should be in cache.
   var info = cache.getInfo();
   info.cacheSize.should.equal(9);
   info.numTrackedFolders.should.equal(2);

   var content = cache.readFileSync("test.file2", "utf-8");
   content.should.equal("xyz");

   var info = cache.getInfo();
   info.cacheSize.should.equal(12);
   info.numTrackedFolders.should.equal(2);

   // Make it appear just one file has been updated.
   mockFS.watch.getCall(2).args[1](null, "test.file");

   // It should be removed from cash.
   var info = cache.getInfo();
   info.cacheSize.should.equal(7);
   info.numTrackedFolders.should.equal(2);

   // The watch should be cleared.
   cache.clear();

   var info = cache.getInfo();
   info.cacheSize.should.equal(0);
   info.numTrackedFolders.should.equal(0);

   mockWatcher1.verify();
   mockWatcher2.verify();
 });

 it('#readFile', function(done) {
   var readFileStub = sinon.stub();
   readFileStub.callsArgWithAsync(2, null, "abcde");
   var watcher = { close: function() {} };
   var fs = {
     watch: function() {},
     readFile: readFileStub,
     readFileSync: function() {},
   };
   var mockFS = sinon.mock(fs);
   var mockWatcher = sinon.mock(watcher);

   mockFS.expects("watch").withArgs(".").returns(watcher);
   mockWatcher.expects("close").once();

   var cache = new Cache({fileSystem: fs});

   // Read the file once. We should see the file read and a watch setup.
   cache.readFile("test.file", "utf-8", function(err, content) {
     content.should.equal("abcde");

     readFileStub.withArgs("test.file", "utf-8");

     var info = cache.getInfo();
     info.cacheSize.should.equal(5);
     info.numTrackedFolders.should.equal(1);

     // The watch should be cleared.
     cache.clear();

     var info = cache.getInfo();
     info.cacheSize.should.equal(0);
     info.numTrackedFolders.should.equal(0);

     mockFS.verify();
     mockWatcher.verify();

     done();
   });

 });
});
