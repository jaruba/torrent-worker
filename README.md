# Torrent Worker
This module was created for use in [**Powder Player**](https://github.com/jaruba/PowderPlayer), it is a wrapper of [peerflix](https://github.com/mafintosh/peerflix).

It's purpose is to launch `peerflix` in a node.js enabled web worker, clone the important parts of it's `engine` object back in the main thread, and keep this information updated.

This is an important task as `torrent-stream` can be heavy on the main thread.

**This module does not use the latest version of peerflix, it uses a personal fork of it and other forked dependencies.**

(although it should work with the latest version too, I haven't tried)

## Install

```
npm install workerjs
npm install torrent-worker
```

Yes, add these 2 separately, even in `package.json`, it's the only way to make sure the relative path to `worker.js` will be correct.

## Options

```
{
                          // All the torrent-stream options:
    connections: 100,     // Max amount of peers to be connected to.
    uploads: 10,          // Number of upload slots.
    tmp: '/tmp',          // Root folder for the files storage.
                          // Defaults to '/tmp' or temp folder specific to your OS.
                          // Each torrent will be placed into a separate folder under /tmp/torrent-stream/{infoHash}
    path: '/tmp/my-file', // Where to save the files. Overrides `tmp`.
    verify: true,         // Verify previously stored data before starting
                          // Defaults to true
    dht: true,            // Whether or not to use DHT to initialize the swarm.
                          // Defaults to true
    tracker: true,        // Whether or not to use trackers from torrent file or magnet link
                          // Defaults to true
    trackers: [
        'udp://tracker.openbittorrent.com:80',
        'udp://tracker.ccc.de:80'
    ],
                          // Allows to declare additional custom trackers to use
                          // Defaults to empty
    storage: myStorage(), // Use a custom storage backend rather than the default disk-backed one
    port: 4593,           // Default peer port
    
                          // Torrent Worker specific options:
    noSeeding: '1',       // defaults to null (always seed), '1' means stop seeding when download has completed
    withResume: true      // defaults to false, if set to true it will also the download event for verified pieces too
}
```

## Usage

```
var torrentWorker = require('torrent-worker');

// every time you use 'new torrentWorker' it will start a new web worker
// try to always kill unneeded workers and keep a low number
// of simultaneous workers at a time
var worker = new torrentWorker();

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
    console.log('infoHash: ' + engine.infoHash);
    console.log('download path: ' + engine.path);
    console.log('torrent name: ' + engine.torrent.name);
    console.log('total length: ' + engine.torrent.length);
    console.log('files: ' + engine.files);
    console.log('nr of pieces: ' + engine.torrent.pieces.length);
    
    // select file with index 1 to be downloaded:
    // engine.selectFile(1);
    
    // don't download file at index 0:
    // engine.deselectFile(0);
});

var printInfo = setInterval(function() {
    console.log('connected to ' + engine.swarm.wires.length + ' peers');
    console.log('uploaded ' + engine.swarm.uploaded + ' bytes');
    console.log('upload speed is ' + engine.swarm.uploadSpeed + ' bytes/second');
    console.log('download speed is ' + engine.swarm.downloadSpeed + ' bytes/second');
}, 1000);
```

## Stopping Workers
At the end of a kill action the worker will be automatically terminated as well.

As simultaneous workers can be used, you do not need to wait for a worker to be killed in order to start a new one.

```
// terminates a worker and removes all downloaded files

engine.kill(function() {
   console.log('engine has been killed');
});

// terminates a worker and does not removes the downloaded files

engine.softKill(function() {
   console.log('engine has been killed');
});
```

