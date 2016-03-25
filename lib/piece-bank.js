var banks = {};

module.exports = function(infoHash) {
	
	var newObj = {};
	
	newObj.create = function(engine) {
		banks[engine.infoHash] = {
			downloaded: 0,
			total: engine.torrent.pieces.length,
			pieceLength: engine.torrent.pieceLength,
			map: Array.apply(null, Array(engine.torrent.pieces.length)).map(function () { return false })
		};
	};
	
	newObj.clear = function() {
		delete banks[infoHash];
	};
	
	newObj.update = function(piece) {
		banks[infoHash].downloaded++;
		banks[infoHash].map[piece] = true;
	};
	
	newObj.filePercent = function(offset, length) {
		var distance = Math.ceil(length / banks[infoHash].pieceLength);
		offset = Math.floor(offset / banks[infoHash].pieceLength) -1;
		var downloaded = 0;
		for (var i = offset; i <= offset + distance && i < banks[infoHash].total; i++) {
			if (banks[infoHash].map[i])
				downloaded++;
		}
		return downloaded / distance;
	};
	
	newObj.get = function() {
		return banks[infoHash];
	};
	
	return newObj;
};
