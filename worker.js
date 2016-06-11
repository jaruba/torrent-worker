var peerflix = require('peerflix');
var io = require('socket.io-client');
var fs = require('fs');

var downloadQueue = [];
var infoInterval = false;
var panicTimeout = false;
var socket = false;
var withResume = false;
var isReady = false;

function attachListeners() {

	engine.server.on('listening', function() {
		socket.emit('listening', {
			port: engine.server.address().port,
			index: {
				offset: engine.server.index.offset
			}
		});
	});

	engine.on('ready', function () {
		var newFiles = [];
		engine.files.forEach(function(el, ij) {
			newFiles.push({
				selected: el.selected,
				name: el.name,
				length: el.length,
				offset: el.offset,
				path: el.path
			});
		});
		socket.emit('ready', {
			infoHash: engine.infoHash,
			path: engine.path,
			files: newFiles,
			amInterested: engine.amInterested,
			torrent: {
				name: engine.torrent.name,
				pieceLength: engine.torrent.pieceLength,
				lastPieceLength: engine.torrent.lastPieceLength,
				pieces: {
					length: engine.torrent.pieces.length
				},
				length: engine.torrent.length
			},
			total: { length: engine.torrent.length },
			swarm: {
				wires: {
					length: engine.swarm.wires.length
				},
				downloadSpeed: engine.swarm.downloadSpeed(),
				uploadSpeed: engine.swarm.uploadSpeed(),
				uploaded: engine.swarm.uploaded,
				paused: engine.swarm.paused,
			}
		});
		isReady = true;
	});

	if (!withResume) {
		engine.on('download',function(pc) {
			downloadQueue.push(pc);
		});
	} else {
		engine.on('verify',function(pc) {
			downloadQueue.push(pc);
		});
	}
}

self.onmessage = function(msg) {

	if (!socket) {
		var objective = msg.data;
		if (objective.withResume) {
			withResume = true;
		} else {
			withResume = false;
		}
		var torLink = objective.target;
		var powPort = objective.targetPort;

		socket = io.connect('http://localhost:'+powPort, {reconnect: true});

		delete objective.target;
		delete objective.targetPort;

		if (objective.torFile) {
			var parseTorrent = require('parse-torrent');
			var torLink = parseTorrent(require('fs').readFileSync(objective.torFile));
		}

		engine = peerflix(torLink,objective);
		isReady = false;

		attachListeners(engine);

		socket.on('setProfile', function (data) {
			engine.setProfile(data);
		});

		socket.on('setPulse', function (data) {
			engine.setPulse(data);
		});

		socket.on('flood', function () {
			engine.flood();
		});

		socket.on('kill', function () {
			isReady = false;
			clearInterval(infoInterval);
			panicTimeout = setTimeout(function() {
				socket.emit('panic');
			},3000);
			var targetEngine = engine;
			targetEngine.server.close(function(dyingEngine) {
				return function() {
					dyingEngine.remove(function(deadEngine) {
						return function() {
							if (deadEngine.files[0].path.indexOf('/') > -1) {
								var pathBreak = '/';
								var folder = deadEngine.files[0].path.substr(0, deadEngine.files[0].path.indexOf('/'));
							} else if (deadEngine.files[0].path.indexOf('\\') > -1) {
								var pathBreak = '\\';
								var folder = deadEngine.files[0].path.substr(0, deadEngine.files[0].path.indexOf('\\'));
							}
							if (folder) {
								fs.lstat(deadEngine.path + pathBreak + folder, function(err, flData) {
									if (!err && flData && flData.isDirectory()) {
										fs.rmdir(deadEngine.path + pathBreak + folder, function() {
											deadEngine.destroy(function() {
												clearTimeout(panicTimeout);
												socket.emit('killed',deadEngine.infoHash);
												socket.disconnect();
											});
										});
									} else {
										deadEngine.destroy(function() {
											clearTimeout(panicTimeout);
											socket.emit('killed',deadEngine.infoHash);
											socket.disconnect();
										});
									}
								});
							} else {
								deadEngine.destroy(function() {
									clearTimeout(panicTimeout);
									socket.emit('killed',deadEngine.infoHash);
									socket.disconnect();
								});
							}
						}
					}(dyingEngine));
				}
			}(targetEngine));
		});

		socket.on('softKill', function () {
			clearInterval(infoInterval);
			panicTimeout = setTimeout(function() {
				socket.emit('panic');
			},3000);
			var targetEngine = engine;
			targetEngine.server.close(function(dyingEngine) {
				return function() {
					dyingEngine.destroy(function() {
						clearTimeout(panicTimeout);
						socket.emit('killed', dyingEngine.infoHash);
						socket.disconnect();
					});
				}
			}(targetEngine));
		});

		socket.on('engineDestroy', function () {
			isReady = false;
			engine.destroy(function() {
				socket.emit('engineDestroyed', engine.infoHash);
				socket.disconnect();
			});
		});

		socket.on('engineRemove', function () {
			engine.remove(function() {
				if (engine.files[0].path.indexOf('/') > -1) {
					var pathBreak = '/';
					var folder = engine.files[0].path.substr(0, engine.files[0].path.indexOf('/'));
				} else if (engine.files[0].path.indexOf('\\') > -1) {
					var pathBreak = '\\';
					var folder = engine.files[0].path.substr(0, engine.files[0].path.indexOf('\\'));
				}
				if (folder) {
					fs.lstat(engine.path + pathBreak + folder, function(err, flData) {
						if (!err && flData && flData.isDirectory()) {
							fs.rmdir(engine.path + pathBreak + folder, function() {
								socket.emit('engineRemoved', {});
							});
						} else {
							socket.emit('engineRemoved', {});
						}
					});
				} else {
					socket.emit('engineRemoved', {});
				}
			});
		});

		socket.on('error', function(err) {
			socket.emit('error', err);
		});

		socket.on('discover', function () {
			if (engine) {
				engine.discover();
				engine.swarm.reconnectAll();
			}
		});

		socket.on('serverClose', function () {
			engine.server.close(function() {
				socket.emit('serverClosed', {});
			});
		});

		socket.on('swarmSetPaused', function (data) {
			engine.swarm.paused = data;
		});

		socket.on('listen', function () {
			engine.listen();
		});

		socket.on('selectFile', function (data) {
			engine.files[data].select();
		});

		socket.on('deselectFile', function (data) {
			engine.files[data].deselect();
		});

		socket.on('reset', function(objective) {
			torLink = objective.target;
			delete objective.target;
			engine = peerflix(torLink,objective);

			isReady = false;

			attachListeners(engine);
		});

		infoInterval = setInterval(function() {
			if (isReady) {
				var newFiles = [];
				engine.files.forEach(function(el, ij) {
					newFiles.push({
						selected: el.selected,
						name: el.name,
						length: el.length,
						offset: el.offset,
						path: el.path
					});
				});
				socket.emit('info', {
					amInterested: engine.amInterested,
					files: newFiles,
					swarm: {
						wires: {
							length: engine.swarm.wires.length
						},
						downloadSpeed: engine.swarm.downloadSpeed(),
						uploadSpeed: engine.swarm.uploadSpeed(),
						uploaded: engine.swarm.uploaded,
						paused: engine.swarm.paused
					},
					downloadPieces: downloadQueue
				});
				downloadQueue = [];
			}
		},1000);

	}

};
