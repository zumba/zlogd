var net = require('net'),
  fs = require('fs'),
  winston = require('winston');

var SOCK_FILE = '/tmp/zlog.sock';

var server = net.createServer(function(c) {
  c.on('end', function() {
    console.log('server disconnected');
  });
  c.on('data', function(data) {
    var content = JSON.parse(data);

    if (!content) {
      return;
    }
    var params = {
      grouper: content.grouper || 'default',
      category: content.category || 'default',
      meta: content.meta || {},
      timestamp: content.timestamp || new Date().getTime(),
    };

    winston.log(
      content.level || 'debug',
      content.message || '',
      params
    );
  });
});

// Remove the socket file before start
fs.unlink(SOCK_FILE);
// Start the server
server.listen(SOCK_FILE, function() {
  fs.chmod(SOCK_FILE, parseInt('777', 8));
  console.log('server bound');
});
