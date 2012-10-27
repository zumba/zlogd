var net = require('net'),
  fs = require('fs'),
  winston = require('winston'),
  express = require('express'),
  io = require('socket.io');

// Config the UNIX socket file
var SOCK_FILE = '/tmp/zlog.sock';

var server = net.createServer(function(c) {
  c.on('end', function() {
    console.log('server disconnected');
  });
  c.on('data', function(data) {
    var content, params;

    try {
      content = JSON.parse(data);
    } catch (err) {
      console.log('Invalid JSON input: ' + data);
      return;
    }

    params = {
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

// Web application
var app = express(),
  webServer = require('http').createServer(app),
  io = io.listen(webServer);

app.use(express.static(__dirname + '/../public'));
//app.engine('jade', require('jade').__express);
app.set('view engine', 'jade');
app.set('views', __dirname + '/views');
app.use(express.errorHandler());

app.get('/', function(req, res) {
  res.render('index');
});
webServer.listen(10564);

// Load socket.io transport
require('./winston-socket.io').SocketIoLogger;
winston.add(winston.transports.SocketIoLogger, {io: io});
