
var peerIo = false;
var peerSocket = false;
var events = require('events');

var torrentWorker = {
	engine: false,
	_worker: require('workerjs'),
	_workerBee: false,
	_destroyedCB: false,
	_removedCB: false,
	_killCB: false,
	_closedCB: false,
	_portrange: 45032,
	_unusedPort: function(cb) {
		var selfie = this;
		var port = this._portrange;
		this._portrange += 1;
		var server = require('net').createServer();
		server.listen(port, function (err) {
			server.once('close', function () { cb(port) });
			server.close();
		})
		server.on('error', function (err) { selfie._unusedPort(cb) });
	},
	process: function(torLink, opts) {
		if (this.engine) this.engine.removeAllListeners();
		this.engine = new events.EventEmitter();
		opts.target = torLink;
		if (!this._workerBee) {
			var self = this;
			this._unusedPort(function(port) {
				peerIo = require('socket.io').listen(port);
				opts.targetPort = port;
				self._workerBee = new self._worker('../torrent-worker/worker.js', true);
	
				peerIo.on('connection', function(pSocket){
					
					peerSocket = pSocket;
					
					peerSocket.on('interested', function(data) {
						self.engine.emit('interested');
					});
	
					peerSocket.on('uninterested', function(data) {
						self.engine.emit('uninterested');
					});
	
					peerSocket.on('listening', function(data) {
						self.engine.server = data;
						self.engine.server.address = function() {
							return { port: data.port }
						};
						self.engine.server.close = function(theCB) {
							self._closedCB = theCB;
							peerSocket.emit('serverClose', { });
						};
						self.engine.emit('listening');
					});
	
					peerSocket.on('ready', function(data) {
						
						for (key in data)
							if (data.hasOwnProperty(key))
							  if (Object.prototype.toString.call(data[key]) === '[object Object]') {
								  for (key2 in data[key])
									if (data[key].hasOwnProperty(key2))
									  if (Object.prototype.toString.call(data[key][key2]) === '[object Object]') {
										  for (key3 in data[key][key2])
											if (data[key][key2].hasOwnProperty(key3))
											  if (!Object.prototype.toString.call(data[key][key2][key3]) === '[object Object]') {
												  if (!self.engine[key]) self.engine[key] = {};
												  if (!self.engine[key][key2]) self.engine[key][key2] = {};
												self.engine[key][key2][key3] = data[key][key2][key3];
											  }
									  } else {
										if (!self.engine[key]) self.engine[key] = {};
										self.engine[key][key2] = data[key][key2];
									  }
							  } else
								self.engine[key] = data[key];

						self.engine.torrent.pieces = {};
						self.engine.torrent.pieces.length = data.torrent.pieces.length;

						self.engine.selectFile = function (targetFile) {
							self.engine.files[targetFile].selected = true;
							peerSocket.emit('selectFile', targetFile);
						}
	
						self.engine.deselectFile = function (targetFile) {
							self.engine.files[targetFile].selected = false;
							peerSocket.emit('deselectFile', targetFile);
						}
	
						self.engine.flood = function() {
							peerSocket.emit('flood', {});
						};
	
						self.engine.setPulse = function(peerData) {
							peerSocket.emit('setPulse', peerData);
						};
	
						self.engine.discover = function() {
							peerSocket.emit('discover', {});
						};
	
						self.engine.kill = function(theCB) {
							self._killCB = theCB;
							peerSocket.emit('kill', {});
						};
	
						self.engine.swarmSetPaused = function() {
							peerSocket.emit('swarmSetPaused', false);
						};
	
						self.engine.destroy = function(theCB) {
							self._destroyedCB = theCB;
							peerSocket.emit('engineDestroy', {});
						};
	
						self.engine.remove = function(theCB) {
							self._removedCB = theCB;
							peerSocket.emit('engineRemove', {});
						};

						self.engine.files = data.files;
						
						self.engine.emit('ready');
					});
					
					peerSocket.on('info', function(data) {
						if (self.engine) {
							self.engine.amInterested = data.amInterested;
							self.engine.swarm = {
								wires: {
									length: data.swarm.wires.length
								},
								downloadSpeed: data.swarm.downloadSpeed,
								uploadSpeed: data.swarm.uploadSpeed,
								uploaded: data.swarm.uploaded,
								paused: data.swarm.paused
							};
							
							data.downloadPieces.forEach(function(pc) {
								self.engine.emit('download', pc);
							});
							
						}
					});
					
					peerSocket.on('killed', function() {
						if (self._killCB) {
							self._killCB();
							delete self._killCB;
						}
						self.engine.emit('killed');
					});
					
					peerSocket.on('engineDestroyed', function(data) {
						if (self._destroyedCB) {
							self._destroyedCB();
							delete self._destroyedCB;
						}
					});
					
					peerSocket.on('engineRemoved', function(data) {
						if (self._removedCB) {
							self._removedCB();
							delete self._removedCB;
						}
					});
	
				});
	
				self._workerBee.postMessage(opts);
				
			});
		} else {
			peerSocket.emit('reset', opts);
		}
		
		return this.engine;
	}
}

module.exports = torrentWorker;
