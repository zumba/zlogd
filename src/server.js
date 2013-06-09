#!/usr/bin/env node

var cluster = require('cluster'),
	net = require('net'),
	fs = require('fs'),
	winston = require('winston'),
	async = require('async');

// Config the UNIX socket file
var SOCK_FILE = process.env.SOCK_FILE || '/tmp/zlog.sock',
	WORKERS = process.env.WORKERS || require('os').cpus().length,
	chunkDelimiter = process.env.DELIMITER || ';;',
	worker;

// Worker API
var workerApi = {
	logChunkContent: function(chunk) {
		var params, content;
		try {
			chunk = chunk.trim();
			if (!chunk) {
				return;
			}
			content = JSON.parse(chunk);
		} catch (error) {
			console.log('Invalid chunk JSON input:', chunk);
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
	}
}

if (cluster.isMaster) {

	// Remove old socket files
	fs.unlink(SOCK_FILE, function (error) {
		if (error) {
			console.log('Error removing old sock file', error);
			return;
		}
	});

	console.log('Master process starting.');
	for (var i = WORKERS; i > 0; i--) {
		worker = cluster.fork();
		console.log('Worker[' + worker.id + '] started.');
	}

	cluster.on('disconnect', function (worker) {
		console.log('Worker disconnected!');
	});

	cluster.on('exit', function (worker, code, signal) {
		console.error('Worker ' + worker.process.pid + ' died');
		if (worker.suicide) {
			cluster.fork();
		}
	});

	// Be a good master and listen to your workers!
	Object.keys(cluster.workers).forEach(function(id) {
		cluster.workers[id].on('message', function(workerMessage) {
			// Placeholder for possible messages from this worker
		});
	});

	// Create the socket listener
	var server = net.createServer(function (socket) {
		var socketData = '', workToBeDone, split;
		socket.setEncoding('utf8');

		// Compile chunks for this request
		socket.on('data', function (data) {
			socketData += data;
		});

		// Delegate the work to the workers
		socket.on('end', function() {
			workToBeDone = socketData.split(chunkDelimiter);
			split = Math.ceil(workToBeDone.length / WORKERS);
			for (var i in cluster.workers) {
				cluster.workers[i].send({
					type: 'work',
					data: workToBeDone.slice(0, split)
				});
				workToBeDone.splice(0, split);
			}
			socketData = '';
		});
	});

	// Start the server
	server.listen(SOCK_FILE, function () {
		fs.chmod(SOCK_FILE, parseInt('777', 8), function (error) {
			if (error) {
				console.log('Socket permission failed.', error);
			}
		});
		console.log('Master listening to socketfile: ' + SOCK_FILE);
	});

} else {

	// Setup winston logging
	// @todo implement json require to get winston transports to instantiate
	winston.add(winston.transports.File, { filename: '/tmp/out.log' });
	winston.remove(winston.transports.Console);

	// Listen to messages from the master
	process.on('message', function(message) {
		// Master told me I have work to do!
		switch (message.type) {
			case 'work':
				async.each(message.data, workerApi.logChunkContent);
				break;
			default:
				console.log('Worker does not understand message.');
		}
	});

}
