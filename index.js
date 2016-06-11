var bank = require('./lib/piece-bank');
var events = require('events');

function convertToMagnet(torLink) {
	var newMagnet = {};

	if (torLink && torLink.pieces) {

		if (torLink.name) {
			newMagnet.dn = torLink.name;
			newMagnet.name = torLink.name;
		}

		if (torLink.infoHash) {
			newMagnet.infoHash = torLink.infoHash;
			newMagnet.xt = 'urn:btih' + torLink.infoHash.toUpperCase();
		}

		if (torLink.announce) {
			newMagnet.announce = torLink.announce;
			newMagnet.tr = torLink.announce;
		}

	} else {

		newMagnet = torLink;

	}

	return newMagnet;
}

var torrentWorker = function() {
	return {
		peerIo: false,
		peerSocket: false,
		waitForIt: true,

		engine: false,
		_worker: require('workerjs'),
		_workerBee: false,
		_destroyedCB: false,
		_removedCB: false,
		_killCB: false,
		_closedCB: false,
		_portrange: 45032,
		_queuedPieces: [],
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
			torLink = convertToMagnet(torLink);
			this._queuedPieces = [];
			this.waitForIt = true;
			if (this.engine) this.engine.removeAllListeners();
			this.engine = new events.EventEmitter();
			opts.target = torLink;
			if (!this._workerBee) {
				var self = this;
				this._unusedPort(function(port) {
					self.peerIo = require('socket.io').listen(port);
					opts.targetPort = port;
					self.keepPort = port;

					self._workerBee = new self._worker('../torrent-worker/worker.js', true);

					self.peerIo.on('error', function(err){
						console.log(err);
					});

					self.peerIo.on('connection', function(pSocket){

						self.peerSocket = pSocket;

						self.peerSocket.on('cry', function(err) {
							console.log(err);
						});

						self.peerSocket.on('error', function(err) {
							console.log(err);
						});

						self.peerSocket.on('interested', function(data) {
							self.engine.emit('interested');
						});

						self.peerSocket.on('uninterested', function(data) {
							self.engine.emit('uninterested');
						});

						self.peerSocket.on('listening', function(data) {
							self.engine.server = data;
							self.engine.server.address = function() {
								return { port: data.port }
							};
							self.engine.server.close = function(theCB) {
								self._closedCB = theCB;
								self.peerSocket.emit('serverClose', { });
							};
							self.engine.emit('listening');
						});

						self.peerSocket.on('ready', function(data) {

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

							bank(self.engine.infoHash).create(data);

							self.engine.torrent.pieces = {};
							self.engine.torrent.pieces.length = data.torrent.pieces.length;
							self.engine.torrent.pieces.bank = bank(self.engine.infoHash);

							self.engine.setProfile = function(profileData) {
								self.peerSocket.emit('setProfile', profileData);
							};

							self.engine.selectFile = function (targetFile) {
								self.engine.files[targetFile].selected = true;
								self.peerSocket.emit('selectFile', targetFile);
							}

							self.engine.deselectFile = function (targetFile) {
								self.engine.files[targetFile].selected = false;
								self.peerSocket.emit('deselectFile', targetFile);
							}

							self.engine.flood = function() {
								self.peerSocket.emit('flood', {});
							};

							self.engine.setPulse = function(peerData) {
								self.peerSocket.emit('setPulse', peerData);
							};

							self.engine.discover = function() {
								self.peerSocket.emit('discover', {});
							};

							self.engine.kill = function(theCB) {
								self._killCB = theCB;
								self.peerSocket.emit('kill', {});
							};

							self.engine.softKill = function(theCB) {
								self._killCB = theCB;
								self.peerSocket.emit('softKill', {});
							};

							self.engine.swarmSetPaused = function() {
								self.peerSocket.emit('swarmSetPaused', false);
							};

							self.engine.destroy = function(theCB) {
								self._destroyedCB = theCB;
								self.peerSocket.emit('engineDestroy', {});
							};

							self.engine.remove = function(theCB) {
								self._removedCB = theCB;
								self.peerSocket.emit('engineRemove', {});
							};

							self.engine.files = data.files;

							self.engine.emit('ready');

							self.waitForIt = false;
							if (self._queuedPieces.length) {
								var holdQueued = self._queuedPieces;
								self._queuedPieces = [];
								setTimeout(function() {
									holdQueued.forEach(function(pc) {
										self.engine.emit('download', pc);
									});
								},1000);
							}
						});

						self.peerSocket.on('info', function(data) {
							if (self.engine) {
								self.engine.amInterested = data.amInterested;
								self.engine.swarm = {
									wires: {
										length: data.swarm.wires.length
									},
									downloadSpeed: data.swarm.downloadSpeed,
									uploadSpeed: data.swarm.uploadSpeed,
									downloaded: bank(self.engine.infoHash).get().downloaded * self.engine.torrent.pieceLength,
									uploaded: data.swarm.uploaded,
									paused: data.swarm.paused
								};

								self.engine.torrent.pieces.downloaded = bank(self.engine.infoHash).get().downloaded;

								if (!self.waitForIt) {
									data.downloadPieces.forEach(function(pc) {
										bank(self.engine.infoHash).update(pc);
										self.engine.emit('download', pc);
									});
								} else {
									self._queuedPieces = self._queuedPieces.concat(data.downloadPieces);
								}

							}
						});

						self.peerSocket.on('killed', function(iHash) {
							if (self._killCB) {
								self._killCB();
								delete self._killCB;
							}
							if (self.engine.infoHash == iHash) self.waitForIt = true;

							self.engine.emit('killed');

							// destroy this instance
							self._workerBee.terminate();
							if (self.peerIo.server) self.peerIo.server.close();
//							self.peerSocket.removeAllListeners();
//							self.peerSocket.on('error', function(err) {
//								console.log(err);
//							});
//							self.peerIo.removeAllListeners();
							torrentWorker = null;

						});
						
						self.peerSocket.on('panic', function(iHash) {
							if (self.engine.infoHash == iHash) self.waitForIt = true;

							self.engine.emit('killed');

							// destroy this instance
							self._workerBee.terminate();
							if (self.peerIo.server) self.peerIo.server.close();
//							self.peerSocket.removeAllListeners();
//							self.peerSocket.on('error', function(err) {
//								console.log(err);
//							});
//							self.peerIo.removeAllListeners();
							torrentWorker = null;

						});

						self.peerSocket.on('engineDestroyed', function(iHash) {
							if (self._destroyedCB) {
								self._destroyedCB();
								delete self._destroyedCB;
							}
							if (self.engine.infoHash == iHash) self.waitForIt = true;

							// destroy this instance
							self._workerBee.terminate();
							if (self.peerIo.server) self.peerIo.server.close();
//							self.peerSocket.removeAllListeners();
//							self.peerSocket.on('error', function(err) {
//								console.log(err);
//							});
//							self.peerIo.removeAllListeners();
							torrentWorker = null;
						});

						self.peerSocket.on('engineRemoved', function(data) {
							if (self._removedCB) {
								self._removedCB();
								delete self._removedCB;
							}
						});

						self.peerSocket.on('serverClosed', function(data) {
							if (self._closedCB) {
								self._closedCB();
								delete self._closedCB;
							}
						});

					});

					self._workerBee.postMessage(opts);

				});
			} else {
				this.peerSocket.emit('reset', opts);
			}

			return this.engine;
		}
	}
}

module.exports = torrentWorker;
