# Torrent Worker
This module was created for use in [Powder Player](https://github.com/jaruba/PowderPlayer), it is a wrapper of [peerflix](https://github.com/mafintosh/peerflix).

It's purpose is to launch `peerflix` in a node.js enabled web worker, clone the important parts of it's `engine` object back in the main thread, and keep this information updated.

This is an important task as `torrent-stream` can be heavy on the main thread.

*This module does not use the latest version of peerflix, it uses a personal fork of it and other forked dependencies.*
(although it should work with the latest version too, I haven't tried)

## Install

```
npm install workerjs
npm install torrent-worker
```

Yes, add these 2 separately, even in `package.json`, it's the only way to make sure the relative path to `worker.js` will be correct.

## Usage

```
var worker = require('torrent-worker');

var engine = worker.process(torrent, options);

// do whatever you want with the engine

engine.on('listening', function() {
    console.log('the streaming link: http://localhost:' + engine.server.address().port); 
});

engine.on('download', function(piece) {
    console.log('downloaded piece: ' + piece);
});

engine.on('ready', function () {
    console.log('torrent is ready');
});

// torrent-worker can currently only support one download instance at a time
// so make sure you're killing the previous instance correctly before starting a new one

engine.kill();

engine.on('killed', function() {
   console.log('engine has been killed');
   // start a new instance
   engine = worker.process(differentTorrent, differentOptions);
   
   // ...
});
```
