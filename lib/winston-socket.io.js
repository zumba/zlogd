var util = require('util'),
  winston = require('winston');

var SocketIoLogger = winston.transports.SocketIoLogger = function (options) {
  this.name = 'socketIoLogger';
  this.level = options.level || 'info';
  this.io = options.io;
};

util.inherits(SocketIoLogger, winston.Transport);

SocketIoLogger.prototype.log = function (level, msg, meta, callback) {
  this.io.sockets.emit('log', {
	level: level,
	msg: msg,
	meta: meta
  });

  callback(null, true);
};
